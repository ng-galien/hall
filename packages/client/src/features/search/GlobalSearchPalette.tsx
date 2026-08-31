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
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { ResourcePreview } from "../documents/ResourcePreview";
import { SearchHitRow } from "./SearchHitRow";
import {
  type SearchEntityType,
  type SearchHit,
  searchTypeLabelKeys,
  useSearchCorpus,
  useSearchFolderOptions,
  useSearchTagOptions,
  useSearchTypeOptions,
} from "./searchCorpus";

/* The global palette (Ctrl+K or Cmd+K): search from anywhere just to go and look at something.
   Picking a resource opens its full preview in place; other entities navigate to their screen. */

export function GlobalSearchPalette() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<SearchBoxState>(emptySearchBoxState);
  const [preview, setPreview] = useState<SearchBoxState | null>(null);
  const [previewedResource, setPreviewedResource] = useState<string | null>(null);
  const [rawActive, setActive] = useState(0);
  const { businesses } = useCouncilBusinessStore();

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
  const typeOptions = useSearchTypeOptions(corpus);
  const folderOptions = useSearchFolderOptions(corpus);
  const tagOptions = useSearchTagOptions(corpus);

  const effective = preview ?? state;
  const active = isSearchBoxActive(effective);
  const hits = useMemo(
    () =>
      active
        ? searchEntities(corpus, effective.query, {
            kinds: effective.types,
            folders: effective.folders,
            tags: effective.tags,
            limit: 30,
          }).results
        : [],
    [corpus, effective, active],
  );
  const sections = useMemo(
    () => folderSections(hits, (kind) => t(searchTypeLabelKeys[kind as SearchEntityType])),
    [hits, t],
  );
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
    return matchDiscriminated(entity, "entityKind", {
      resource: (entry) => {
        setPreviewedResource(entry.resource.id);
        setOpen(false);
      },
      councilBusiness: (entry) => {
        close();
        const params = new URLSearchParams();
        if (entry.business.folderPath) params.set("path", entry.business.folderPath);
        params.set("councilBusiness", entry.business.id);
        navigate(`/workspace?${params}`);
      },
      meeting: (entry) => {
        close();
        navigate(`/meetings/${entry.meeting.slug}`);
      },
      member: (entry) => {
        close();
        navigate(`/council-members/${entry.member.id}`);
      },
      decision: (entry) => {
        close();
        const carrier = businesses.find(
          (candidate) => candidate.kind === "matter" && candidate.councilDecisionId === entry.decision.id,
        );
        if (carrier) {
          const params = new URLSearchParams();
          if (carrier.folderPath) params.set("path", carrier.folderPath);
          params.set("councilBusiness", carrier.id);
          navigate(`/workspace?${params}`);
        }
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

  const onPreview = useCallback((next: SearchBoxState | null) => setPreview(next), []);

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
              typeOptions={typeOptions}
              folderOptions={folderOptions}
              tagOptions={tagOptions}
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
