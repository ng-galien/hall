import { matchDiscriminated } from "@hall/domain";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FolderSectionsList } from "../../components/search/FolderSectionsList";
import { folderSections, sectionItems } from "../../components/search/folderSections";
import {
  emptySearchBoxState,
  isSearchBoxActive,
  SearchBox,
  type SearchBoxState,
} from "../../components/search/SearchBox";
import { useI18n } from "../../i18n/I18nProvider";
import { searchEntities } from "../../lib/search";
import { useContactsStore } from "../../stores/contactsStore";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useCouncilDecisionsStore } from "../../stores/councilDecisionsStore";
import { useCouncilMeetingsStore } from "../../stores/councilMeetingsStore";
import { useCouncilMembersStore } from "../../stores/councilMembersStore";
import { useResourcesStore } from "../../stores/resourcesStore";
import { ResourcePreview } from "../documents/ResourcePreview";
import { referenceOpenTarget } from "../references/referenceNavigation";
import { SearchHitRow } from "./SearchHitRow";
import {
  type SearchEntityType,
  type SearchHit,
  searchTypeLabelKeys,
  useSearchCorpus,
  useSearchFacetOptions,
} from "./searchCorpus";

/* The global palette (Ctrl+K or Cmd+K): search from anywhere just to go and look at something.
   Picking a resource opens its full preview in place; other entities navigate to their screen. */

export function GlobalSearchPalette() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<SearchBoxState<SearchEntityType>>(emptySearchBoxState);
  const [preview, setPreview] = useState<SearchBoxState<SearchEntityType> | null>(null);
  const [previewedResource, setPreviewedResource] = useState<string | null>(null);
  const [rawActive, setActive] = useState(0);
  const { businesses } = useCouncilBusinessStore();
  const resources = useResourcesStore((store) => store.resources);
  const decisions = useCouncilDecisionsStore((store) => store.councilDecisions);
  const meetings = useCouncilMeetingsStore((store) => store.meetings);
  const members = useCouncilMembersStore((store) => store.members);
  const contacts = useContactsStore((store) => store.contacts);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
        setState(emptySearchBoxState);
        setActive(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const corpus = useSearchCorpus("global");
  const facetOptions = useSearchFacetOptions(corpus);

  const effective = preview ?? state;
  const active = isSearchBoxActive(effective);
  const hits = useMemo(
    () =>
      active
        ? searchEntities(corpus, effective.query, {
            kinds: effective.types,
            folders: effective.folders,
            tags: effective.tags,
            states: effective.states,
            media: effective.media,
            limit: 30,
          }).results
        : [],
    [corpus, effective, active],
  );
  const sections = useMemo(() => folderSections(hits, (kind) => t(searchTypeLabelKeys[kind])), [hits, t]);
  const shown = useMemo(() => sectionItems(sections), [sections]);
  const activeRow = Math.min(rawActive, Math.max(shown.length - 1, 0));

  const close = () => {
    setOpen(false);
    setState(emptySearchBoxState);
    setPreview(null);
    setActive(0);
  };

  const pick = (hit: SearchHit) => {
    const entity = hit.entity;
    const reference = matchDiscriminated(entity, "entityKind", {
      resource: (entry) => ({ kind: "resource" as const, id: entry.resource.id }),
      councilBusiness: (entry) => ({ kind: "councilBusiness" as const, id: entry.business.id }),
      meeting: (entry) => ({ kind: "meeting" as const, id: entry.meeting.id }),
      member: (entry) => ({ kind: "member" as const, id: entry.member.id }),
      contact: (entry) => ({ kind: "contact" as const, id: entry.contact.id }),
      decision: (entry) => ({ kind: "decision" as const, id: entry.decision.id }),
    });
    const target = referenceOpenTarget(reference.kind, reference.id, {
      resources,
      businesses,
      decisions,
      meetings,
      members,
      contacts,
    });
    if (!target) return;
    matchDiscriminated(target, "kind", {
      resourcePreview: (entry) => {
        setPreviewedResource(entry.resourceId);
        setOpen(false);
      },
      route: (entry) => {
        close();
        navigate(entry.href);
      },
    });
  };

  const onResultsKey = (event: KeyboardEvent) => {
    if (shown.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((activeRow + 1) % shown.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((activeRow - 1 + shown.length) % shown.length);
    } else if (event.key === "Enter" && shown[activeRow]) {
      event.preventDefault();
      pick(shown[activeRow]);
    }
  };

  const onPreview = useCallback((next: SearchBoxState<SearchEntityType> | null) => setPreview(next), []);

  return (
    <>
      {open ? (
        <Dialog open onOpenChange={(value) => !value && close()}>
          <DialogContent className="search-palette" closeLabel={t("common.close")} data-testid="search-palette">
            <DialogHeader>
              <DialogTitle>{t("search.palette.title")}</DialogTitle>
            </DialogHeader>
            <SearchBox
              state={state}
              onState={(next) => {
                setState(next);
                setActive(0);
              }}
              typeOptions={facetOptions.types}
              folderOptions={facetOptions.folders}
              tagOptions={facetOptions.tags}
              stateOptions={facetOptions.states}
              mediaOptions={facetOptions.media}
              placeholder={t("search.globalPlaceholder")}
              onPreview={onPreview}
              onResultsKey={onResultsKey}
              autoFocus
              testId="palette-search"
            />
            <div className="search-palette-results">
              {active && hits.length === 0 ? <p className="workspace-list-empty">{t("workspace.noResults")}</p> : null}
              {active ? (
                <FolderSectionsList
                  sections={sections}
                  itemKey={(hit) => `${hit.kind}:${hit.id}`}
                  renderItem={(hit, index) => <SearchHitRow hit={hit} active={index === activeRow} onPick={pick} />}
                />
              ) : (
                <p className="search-palette-hint">{t("search.palette.hint")}</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
      {previewedResource ? (
        <ResourcePreview resourceId={previewedResource} onClose={() => setPreviewedResource(null)} />
      ) : null}
    </>
  );
}
