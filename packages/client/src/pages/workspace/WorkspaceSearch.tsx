import { Button } from "@fluentui/react-components";
import {
  AppsListRegular,
  CheckmarkRegular,
  ChevronDownRegular,
  DismissRegular,
  FilterRegular,
  GavelRegular,
  GridRegular,
  SearchRegular,
} from "@fluentui/react-icons";
import type { Resource, Topic } from "@mairie/domain";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MeetingStatusBadge, matchesQuery, StatusBadge } from "../../components/Ui";
import type { TranslationKey } from "../../i18n/en";
import { useI18n } from "../../i18n/I18nProvider";
import { useCouncilDecisionsStore } from "../../stores/councilDecisionsStore";
import { useCouncilMeetingsStore } from "../../stores/councilMeetingsStore";
import { useResourcesStore } from "../../stores/resourcesStore";
import { useTopicsStore } from "../../stores/topicsStore";
import { topicKindKeys } from "../council-meetings/AgendaComposer";
import { ResourceGlyph, TopicGlyph, useResourceTypeLabel } from "./ResourceGlyph";
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
}: {
  search: WorkspaceSearchState;
  onSearch(next: WorkspaceSearchState): void;
  onSelect(selection: WorkspaceSelection, path?: string): void;
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

  const typeShown = (type: ResultType) => search.types.length === 0 || search.types.includes(type);
  const underFolders = (folderPath: string) => {
    if (search.folders.length === 0) return true;
    const top = folderPath.split("/").filter(Boolean)[0] ?? "";
    return search.folders.includes(top);
  };

  const foundTopics = topics.filter(
    (topic) =>
      typeShown("topic") &&
      underFolders(topic.folderPath) &&
      (search.states.length === 0 || search.states.includes(topic.state)) &&
      matchesQuery(query, topic.title, topic.report, topic.folderPath),
  );
  const foundResources = resources.filter(
    (resource) =>
      typeShown("resource") &&
      underFolders(resource.folderPath) &&
      search.states.length === 0 &&
      matchesQuery(query, resource.title, resource.folderPath, resource.tags.join(" ")),
  );
  const foundMeetings = meetings.filter(
    (meeting) =>
      typeShown("meeting") &&
      search.folders.length === 0 &&
      search.states.length === 0 &&
      matchesQuery(query, meeting.title, meeting.location),
  );
  const foundDecisions = councilDecisions.filter(
    (decision) =>
      typeShown("decision") &&
      search.folders.length === 0 &&
      search.states.length === 0 &&
      matchesQuery(query, decision.number ?? "", decision.title, decision.draftText),
  );
  const total = foundTopics.length + foundResources.length + foundMeetings.length + foundDecisions.length;

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
        <SearchRegular aria-hidden="true" className="wsearch-icon" />
        {chips.map((chip) => (
          <span className="wsearch-chip" key={`${chip.kind}:${chip.value}`}>
            {chip.label}
            <button type="button" aria-label={`${t("common.cancel")} ${chip.label}`} onClick={() => removeChip(chip)}>
              <DismissRegular />
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
            <DismissRegular />
          </button>
        ) : null}
        <button
          className={`wsearch-filters${panelOpen ? " wsearch-filters-open" : ""}`}
          type="button"
          aria-expanded={panelOpen}
          onClick={() => setPanelOpen((open) => !open)}
        >
          <FilterRegular aria-hidden="true" />
          {t("workspace.filters")}
          <ChevronDownRegular aria-hidden="true" />
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
                      {isActive ? <CheckmarkRegular aria-hidden="true" /> : null}
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
                      {isActive ? <CheckmarkRegular aria-hidden="true" /> : null}
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
                      {isActive ? <CheckmarkRegular aria-hidden="true" /> : null}
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
                appearance={layout === "list" ? "primary" : "subtle"}
                size="small"
                icon={<AppsListRegular />}
                aria-label={t("common.layoutList")}
                aria-pressed={layout === "list"}
                onClick={() => setLayout("list")}
              />
              <Button
                appearance={layout === "cards" ? "primary" : "subtle"}
                size="small"
                icon={<GridRegular />}
                aria-label={t("common.layoutCards")}
                aria-pressed={layout === "cards"}
                onClick={() => setLayout("cards")}
              />
            </span>
          </div>
          {total === 0 ? (
            <p className="workspace-list-empty">{t("workspace.noResults")}</p>
          ) : (
            <div className={layout === "cards" ? "wsearch-grid" : "wsearch-list"}>
              {foundTopics.map((topic) => (
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
              ))}
              {foundResources.map((resource) => (
                <button
                  className="wsearch-hit"
                  type="button"
                  key={`r-${resource.id}`}
                  onClick={() => pickResource(resource)}
                >
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
              ))}
              {foundMeetings.map((meeting) => (
                <button
                  className="wsearch-hit"
                  type="button"
                  key={`m-${meeting.id}`}
                  onClick={() => navigate(`/meetings/${meeting.id}`)}
                >
                  <span className="workspace-glyph workspace-glyph-decision" aria-hidden="true">
                    <GavelRegular />
                  </span>
                  <span className="workspace-row-copy">
                    <strong>{meeting.title}</strong>
                    <span>
                      {formatDate(meeting.startsAt)} · {meeting.location}
                    </span>
                  </span>
                  <MeetingStatusBadge status={meeting.status} />
                </button>
              ))}
              {foundDecisions.map((decision) => (
                <button
                  className="wsearch-hit"
                  type="button"
                  key={`d-${decision.id}`}
                  onClick={() =>
                    decision.meetingId ? navigate(`/meetings/${decision.meetingId}`) : pickDecision(decision.id)
                  }
                >
                  <span className="workspace-glyph workspace-glyph-decision" aria-hidden="true">
                    <GavelRegular />
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
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
