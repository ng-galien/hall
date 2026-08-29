import type { CouncilDecisionListEntry, CouncilMeeting, Resource, Topic } from "@hall/domain";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  CardViewIcon,
  CheckIcon,
  ChevronDownIcon,
  CloseIcon,
  FilterIcon,
  FolderIcon,
  GavelIcon,
  ListViewIcon,
  SearchIcon,
} from "../../components/icons";
import { ResourceGlyph, TopicGlyph, useResourceTypeLabel } from "../../components/ResourceGlyph";
import { MeetingStatusBadge, StatusBadge } from "../../components/Ui";
import type { TranslationKey } from "../../i18n/en";
import { useI18n } from "../../i18n/I18nProvider";
import { type Searchable, searchEntities } from "../../lib/search";
import { useCouncilDecisionsStore } from "../../stores/councilDecisionsStore";
import { useCouncilMeetingsStore } from "../../stores/councilMeetingsStore";
import { useResourcesStore } from "../../stores/resourcesStore";
import { useTopicsStore } from "../../stores/topicsStore";
import { topicKindKeys } from "../council-meetings/AgendaComposer";
import type { WorkspaceSelection } from "./WorkspacePage";

/* Un seul champ qui mêle texte libre et facettes (inspiré du FilterBox de Trust) :
   les facettes actives sont des puces dans le champ, un panneau liste les groupes avec compteurs,
   le texte tapé atteint aussi les facettes. */

type FacetKind = "type" | "folder" | "state";
type ResultType = "topic" | "resource" | "meeting" | "decision";

const typeOptions: { value: ResultType; labelKey: TranslationKey }[] = [
  { value: "topic", labelKey: "workspace.topicsHeading" },
  { value: "resource", labelKey: "workspace.resourcesHeading" },
  { value: "meeting", labelKey: "navigation.meetings" },
  { value: "decision", labelKey: "navigation.decisions" },
];

const stateOptions: { value: Topic["state"]; labelKey: TranslationKey }[] = [
  { value: "toSchedule", labelKey: "status.toSchedule" },
  { value: "scheduled", labelKey: "status.scheduled" },
  { value: "examined", labelKey: "status.examined" },
];

const facetTokenByType: Record<ResultType, string> = {
  topic: "sujet",
  resource: "doc",
  meeting: "seance",
  decision: "delib",
};

/** Une entrée du corpus : l'entité d'origine voyage avec ses champs cherchables. */
interface WorkspaceHit extends Searchable {
  entity:
    | { entityKind: "topic"; topic: Topic }
    | { entityKind: "resource"; resource: Resource }
    | { entityKind: "meeting"; meeting: CouncilMeeting }
    | { entityKind: "decision"; decision: CouncilDecisionListEntry };
}

export interface WorkspaceSearchState {
  query: string;
  types: ResultType[];
  folders: string[];
  states: Topic["state"][];
}

export const emptySearch: WorkspaceSearchState = { query: "", types: [], folders: [], states: [] };

export function isSearchActive(search: WorkspaceSearchState): boolean {
  return (
    search.query.trim().length > 0 || search.types.length > 0 || search.folders.length > 0 || search.states.length > 0
  );
}

function toggleValue<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((candidate) => candidate !== value) : [...values, value];
}

export function WorkspaceSearch({
  search,
  onSearch,
  onSelect,
  context,
}: {
  search: WorkspaceSearchState;
  onSearch(next: WorkspaceSearchState): void;
  onSelect(selection: WorkspaceSelection, path?: string): void;
  /** Le dossier ouvert : ce qui en est proche remonte en premier. */
  context?: string;
}) {
  const { t, formatNumber, formatDate, formatFileSize } = useI18n();
  const navigate = useNavigate();
  const typeLabel = useResourceTypeLabel();
  const { topics } = useTopicsStore();
  const { resources } = useResourcesStore();
  const { meetings } = useCouncilMeetingsStore();
  const { councilDecisions } = useCouncilDecisionsStore();
  const [panelOpen, setPanelOpen] = useState(false);
  const [layout, setLayout] = useState<"list" | "cards">("list");
  const input = useRef<HTMLInputElement | null>(null);
  const active = isSearchActive(search);
  const query = search.query.trim();

  const topFolders = useMemo(() => {
    const counts = new Map<string, number>();
    for (const folderPath of [
      ...topics.map((topic) => topic.folderPath),
      ...resources.map((resource) => resource.folderPath),
    ]) {
      const top = folderPath.split("/").filter(Boolean)[0];
      if (top) counts.set(top, (counts.get(top) ?? 0) + 1);
    }
    return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "fr-FR"));
  }, [topics, resources]);

  const chips: { kind: FacetKind; value: string; label: string }[] = [
    ...search.types.map((value) => ({
      kind: "type" as const,
      value,
      label: t(typeOptions.find((option) => option.value === value)?.labelKey ?? "workspace.topicsHeading"),
    })),
    ...search.folders.map((value) => ({ kind: "folder" as const, value, label: value })),
    ...search.states.map((value) => ({
      kind: "state" as const,
      value,
      label: t(stateOptions.find((option) => option.value === value)?.labelKey ?? "status.toSchedule"),
    })),
  ];

  const removeChip = (chip: { kind: FacetKind; value: string }) => {
    if (chip.kind === "type") onSearch({ ...search, types: toggleValue(search.types, chip.value as ResultType) });
    else if (chip.kind === "folder") onSearch({ ...search, folders: toggleValue(search.folders, chip.value) });
    else onSearch({ ...search, states: toggleValue(search.states, chip.value as Topic["state"]) });
  };

  const toggleFacet = (chip: { kind: FacetKind; value: string }, reachedByTyping: boolean) => {
    const next =
      chip.kind === "type"
        ? { ...search, types: toggleValue(search.types, chip.value as ResultType) }
        : chip.kind === "folder"
          ? { ...search, folders: toggleValue(search.folders, chip.value) }
          : { ...search, states: toggleValue(search.states, chip.value as Topic["state"]) };
    onSearch(reachedByTyping ? { ...next, query: "" } : next);
    input.current?.focus();
  };

  /* Le corpus du moteur commun : chaque entité devient cherchable avec ses champs
     secondaires ; les facettes de l'interface se traduisent en jetons du même DSL que
     celui qu'on peut taper au clavier (`doc:budget dossier:travaux état:planifié`). */
  const corpus = useMemo<WorkspaceHit[]>(
    () => [
      ...topics.map((topic) => ({
        kind: "topic" as const,
        id: topic.slug,
        label: topic.title,
        extra: [topic.report],
        folderPath: topic.folderPath,
        state: topic.state,
        entity: { entityKind: "topic" as const, topic },
      })),
      ...resources.map((resource) => ({
        kind: "resource" as const,
        id: resource.slug,
        label: resource.title,
        extra: [...resource.tags, resource.kind === "document" ? resource.fileName : null],
        folderPath: resource.folderPath,
        entity: { entityKind: "resource" as const, resource },
      })),
      ...meetings.map((meeting) => ({
        kind: "meeting" as const,
        id: meeting.slug,
        label: meeting.title,
        extra: [meeting.location, meeting.number],
        entity: { entityKind: "meeting" as const, meeting },
      })),
      ...councilDecisions.map((decision) => ({
        kind: "decision" as const,
        id: decision.slug,
        label: decision.title,
        extra: [decision.number, decision.draftText],
        entity: { entityKind: "decision" as const, decision },
      })),
    ],
    [topics, resources, meetings, councilDecisions],
  );

  const facetTokens = [
    ...search.types.map((type) => `${facetTokenByType[type]}:`),
    ...search.folders.map((folder) => `dossier:${folder}`),
    ...search.states.map((state) => `etat:${state}`),
  ];
  const effectiveQuery = [...facetTokens, query].join(" ").trim();
  const hits = useMemo(
    () => searchEntities(corpus, effectiveQuery, { context }).results,
    [corpus, effectiveQuery, context],
  );
  const total = hits.length;

  const pickTopic = (topic: Topic) => {
    onSearch(emptySearch);
    onSelect({ kind: "topic", id: topic.id }, topic.folderPath);
  };
  const pickResource = (resource: Resource) => {
    onSearch(emptySearch);
    onSelect({ kind: "resource", id: resource.id }, resource.folderPath);
  };
  const pickDecision = (decisionId: string) => {
    const topic = topics.find(
      (candidate) => candidate.kind === "subject" && candidate.councilDecisionId === decisionId,
    );
    if (topic) pickTopic(topic);
  };

  /* En liste, la même organisation que la recherche de l'éditeur : des sections par
     dossier d'abord, puis les espèces sans dossier. Les cartes restent à plat. */
  const sections = useMemo(() => {
    const kindHeadings: Record<string, TranslationKey> = {
      topic: "workspace.topicsHeading",
      resource: "workspace.resourcesHeading",
      meeting: "navigation.meetings",
      decision: "navigation.decisions",
    };
    /* Les sections suivent l'ordre du classement (première apparition) : la proximité
       du dossier courant garde le dessus, l'alphabet ne reprend pas la main. */
    const ordered = new Map<string, { key: string; title: string; folder: boolean; items: WorkspaceHit[] }>();
    for (const hit of hits) {
      const key = hit.folderPath ? `folder:${hit.folderPath}` : `kind:${hit.kind}`;
      let section = ordered.get(key);
      if (!section) {
        section = {
          key,
          title: hit.folderPath || t(kindHeadings[hit.kind]),
          folder: Boolean(hit.folderPath),
          items: [],
        };
        ordered.set(key, section);
      }
      section.items.push(hit);
    }
    return [...ordered.values()];
  }, [hits, t]);

  const renderHit = (hit: WorkspaceHit) => {
    if (hit.entity.entityKind === "topic") {
      const topic = hit.entity.topic;
      return (
        <button className="wsearch-hit" type="button" key={`t-${topic.id}`} onClick={() => pickTopic(topic)}>
          <TopicGlyph topic={topic} />
          <span className="workspace-row-copy">
            <strong>{topic.title}</strong>
            <span>
              {t(topicKindKeys[topic.kind])}
              {topic.folderPath ? ` · ${topic.folderPath}` : ""}
            </span>
          </span>
          <StatusBadge value={topic.state} />
        </button>
      );
    }
    if (hit.entity.entityKind === "resource") {
      const resource = hit.entity.resource;
      return (
        <button className="wsearch-hit" type="button" key={`r-${resource.id}`} onClick={() => pickResource(resource)}>
          <ResourceGlyph resource={resource} />
          <span className="workspace-row-copy">
            <strong>{resource.title}</strong>
            <span>
              {typeLabel(resource)}
              {resource.kind === "document" ? ` · ${formatFileSize(resource.byteSize)}` : ""}
              {resource.folderPath ? ` · ${resource.folderPath}` : ""}
            </span>
          </span>
        </button>
      );
    }
    if (hit.entity.entityKind === "meeting") {
      const meeting = hit.entity.meeting;
      return (
        <button
          className="wsearch-hit"
          type="button"
          key={`m-${meeting.id}`}
          onClick={() => navigate(`/meetings/${meeting.slug}`)}
        >
          <span className="workspace-glyph workspace-glyph-decision" aria-hidden="true">
            <GavelIcon />
          </span>
          <span className="workspace-row-copy">
            <strong>{meeting.title}</strong>
            <span>
              {formatDate(meeting.startsAt)} · {meeting.location}
            </span>
          </span>
          <MeetingStatusBadge status={meeting.status} />
        </button>
      );
    }
    const decision = hit.entity.decision;
    const decisionMeeting = meetings.find((meeting) => meeting.id === decision.meetingId);
    return (
      <button
        className="wsearch-hit"
        type="button"
        key={`d-${decision.id}`}
        onClick={() => (decisionMeeting ? navigate(`/meetings/${decisionMeeting.slug}`) : pickDecision(decision.id))}
      >
        <span className="workspace-glyph workspace-glyph-decision" aria-hidden="true">
          <GavelIcon />
        </span>
        <span className="workspace-row-copy">
          <strong>{decision.title}</strong>
          <span>
            {t("navigation.decisions")}
            {decision.number ? ` · ${decision.number}` : ""}
          </span>
        </span>
        <StatusBadge value={decision.status} />
      </button>
    );
  };

  const needle = query.toLocaleLowerCase("fr-FR");
  const facetMatches = (label: string) => needle === "" || label.toLocaleLowerCase("fr-FR").includes(needle);
  const visibleTypeOptions = typeOptions.filter((option) => facetMatches(t(option.labelKey)));
  const visibleFolderOptions = topFolders.filter(([folder]) => facetMatches(folder));
  const visibleStateOptions = stateOptions.filter((option) => facetMatches(t(option.labelKey)));
  const noFacetMatch =
    visibleTypeOptions.length === 0 && visibleFolderOptions.length === 0 && visibleStateOptions.length === 0;

  return (
    <div className="wsearch">
      <div className="wsearch-field">
        <SearchIcon aria-hidden="true" className="app-icon wsearch-icon" />
        {chips.map((chip) => (
          <span className="wsearch-chip" key={`${chip.kind}:${chip.value}`}>
            {chip.label}
            <button type="button" aria-label={`${t("common.cancel")} ${chip.label}`} onClick={() => removeChip(chip)}>
              <CloseIcon />
            </button>
          </span>
        ))}
        <input
          ref={input}
          type="search"
          value={search.query}
          placeholder={chips.length > 0 ? "" : t("workspace.searchEverywhere")}
          aria-label={t("workspace.searchEverywhere")}
          onChange={(event) => onSearch({ ...search, query: event.target.value })}
          onFocus={() => setPanelOpen(false)}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && search.query === "" && chips.length > 0) {
              removeChip(chips[chips.length - 1]);
            }
            if (event.key === "Escape") onSearch(emptySearch);
          }}
        />
        {active ? (
          <button
            className="wsearch-clear"
            type="button"
            aria-label={t("workspace.clearSearch")}
            onClick={() => onSearch(emptySearch)}
          >
            <CloseIcon />
          </button>
        ) : null}
        <button
          className={`wsearch-filters${panelOpen ? " wsearch-filters-open" : ""}`}
          type="button"
          aria-expanded={panelOpen}
          onClick={() => setPanelOpen((open) => !open)}
        >
          <FilterIcon aria-hidden="true" />
          {t("workspace.filters")}
          <ChevronDownIcon aria-hidden="true" />
        </button>
      </div>

      {panelOpen ? (
        <div className="wsearch-panel" role="dialog" aria-label={t("workspace.filters")}>
          {noFacetMatch ? <p className="workspace-list-empty">{t("workspace.noResults")}</p> : null}
          {visibleTypeOptions.length > 0 ? (
            <div className="wsearch-panel-group">
              <span className="workspace-list-heading">{t("workspace.facetType")}</span>
              <div className="wsearch-options">
                {visibleTypeOptions.map((option) => {
                  const isActive = search.types.includes(option.value);
                  return (
                    <button
                      className={`wsearch-option${isActive ? " wsearch-option-active" : ""}`}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={isActive}
                      key={option.value}
                      onClick={() => toggleFacet({ kind: "type", value: option.value }, query !== "")}
                    >
                      {isActive ? <CheckIcon aria-hidden="true" /> : null}
                      {t(option.labelKey)}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          {visibleFolderOptions.length > 0 ? (
            <div className="wsearch-panel-group">
              <span className="workspace-list-heading">{t("workspace.facetFolder")}</span>
              <div className="wsearch-options">
                {visibleFolderOptions.map(([folder, count]) => {
                  const isActive = search.folders.includes(folder);
                  return (
                    <button
                      className={`wsearch-option${isActive ? " wsearch-option-active" : ""}`}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={isActive}
                      key={folder}
                      onClick={() => toggleFacet({ kind: "folder", value: folder }, query !== "")}
                    >
                      {isActive ? <CheckIcon aria-hidden="true" /> : null}
                      {folder}
                      <small>{formatNumber(count)}</small>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          {visibleStateOptions.length > 0 ? (
            <div className="wsearch-panel-group">
              <span className="workspace-list-heading">{t("workspace.facetState")}</span>
              <div className="wsearch-options">
                {visibleStateOptions.map((option) => {
                  const isActive = search.states.includes(option.value);
                  return (
                    <button
                      className={`wsearch-option${isActive ? " wsearch-option-active" : ""}`}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={isActive}
                      key={option.value}
                      onClick={() => toggleFacet({ kind: "state", value: option.value }, query !== "")}
                    >
                      {isActive ? <CheckIcon aria-hidden="true" /> : null}
                      {t(option.labelKey)}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {active ? (
        <div className="wsearch-results">
          <div className="wsearch-results-bar">
            <span className="workspace-list-heading">
              {t("workspace.resultsCount").replace("{count}", formatNumber(total))}
            </span>
            <span className="wsearch-layout">
              <Button
                variant={layout === "list" ? "default" : "ghost"}
                size="icon-sm"
                aria-label={t("common.layoutList")}
                aria-pressed={layout === "list"}
                onClick={() => setLayout("list")}
              >
                <ListViewIcon />
              </Button>
              <Button
                variant={layout === "cards" ? "default" : "ghost"}
                size="icon-sm"
                aria-label={t("common.layoutCards")}
                aria-pressed={layout === "cards"}
                onClick={() => setLayout("cards")}
              >
                <CardViewIcon />
              </Button>
            </span>
          </div>
          {total === 0 ? (
            <p className="workspace-list-empty">{t("workspace.noResults")}</p>
          ) : layout === "cards" ? (
            <div className="wsearch-grid">{hits.map(renderHit)}</div>
          ) : (
            <div className="wsearch-list">
              {sections.map((section) => (
                <div className="wsearch-section" key={section.key}>
                  <div className={`workspace-list-heading${section.folder ? " wsearch-section-folder" : ""}`}>
                    {section.folder ? <FolderIcon aria-hidden="true" /> : null}
                    {section.title}
                  </div>
                  {section.items.map(renderHit)}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
