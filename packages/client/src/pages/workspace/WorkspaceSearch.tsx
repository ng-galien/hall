import { useEffect, useRef, useState } from "react";
import { SearchIcon } from "../../components/icons";
import { ResourceSearch } from "../../components/search/ResourceSearch";
import { emptySearchBoxState, isSearchBoxActive, type SearchBoxState } from "../../components/search/SearchBox";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "../../components/ui/dialog";
import { useI18n } from "../../i18n/I18nProvider";
import type { SearchType } from "../../lib/search";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import type { WorkspaceSelection } from "./workspaceItemReference";

export type WorkspaceSearchState = SearchBoxState<SearchType>;
export const emptySearch: WorkspaceSearchState = emptySearchBoxState;
export const isSearchActive = isSearchBoxActive;
// @implements-requirement HALL-FR-SRC-030
export function WorkspaceSearch({
  search,
  onSearch,
  onSelect,
  context,
  resultsTarget,
  autoFocus = false,
}: {
  search: WorkspaceSearchState;
  onSearch(next: WorkspaceSearchState): void;
  onSelect(selection: WorkspaceSelection, path?: string): void;
  context?: string;
  resultsTarget: HTMLElement | null;
  autoFocus?: boolean;
}) {
  const wasActive = useRef(false);
  useEffect(() => {
    const active = isSearchActive(search);
    if (active && !wasActive.current) void useCouncilBusinessStore.getState().load();
    wasActive.current = active;
  }, [search]);
  return (
    <div className="wsearch">
      <ResourceSearch
        state={search}
        onState={onSearch}
        scope={{ types: ["resource", "councilBusiness"], context }}
        testId="workspace-search"
        autoFocus={autoFocus}
        hideResultsWhenEmpty
        resultsTarget={resultsTarget}
        onPick={(item) => {
          if (item.kind !== "resource" && item.kind !== "councilBusiness") return;
          onSearch(emptySearch);
          onSelect({ kind: item.kind, id: item.id }, item.folderPath);
        }}
      />
    </div>
  );
}

/** On a phone the workspace search opens from an icon of the header, over the whole screen, with its field active. */
export function PhoneWorkspaceSearch({
  onSelect,
  context,
}: {
  onSelect(selection: WorkspaceSelection, path?: string): void;
  context?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState<WorkspaceSearchState>(emptySearch);
  const [resultsTarget, setResultsTarget] = useState<HTMLElement | null>(null);
  const close = () => {
    setOpen(false);
    setSearch(emptySearch);
  };
  return (
    <>
      <Button
        className="app-phone-header-more"
        variant="ghost"
        size="icon"
        data-testid="workspace-search-open"
        aria-label={t("common.search")}
        onClick={() => setOpen(true)}
      >
        <SearchIcon />
      </Button>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent
          className="workspace-phone-search"
          placement="bottom"
          closeLabel={t("common.close")}
          aria-describedby={undefined}
          data-testid="workspace-phone-search"
        >
          <DialogTitle>{t("common.search")}</DialogTitle>
          <WorkspaceSearch
            search={search}
            onSearch={setSearch}
            onSelect={(selection, path) => {
              close();
              onSelect(selection, path);
            }}
            context={context}
            resultsTarget={resultsTarget}
            autoFocus
          />
          <div ref={setResultsTarget} className="workspace-phone-search-results" />
        </DialogContent>
      </Dialog>
    </>
  );
}
