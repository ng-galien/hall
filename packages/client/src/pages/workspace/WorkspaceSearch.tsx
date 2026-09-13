import { ResourceSearch } from "../../components/search/ResourceSearch";
import { emptySearchBoxState, isSearchBoxActive, type SearchBoxState } from "../../components/search/SearchBox";
import type { SearchType } from "../../lib/search";
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
}: {
  search: WorkspaceSearchState;
  onSearch(next: WorkspaceSearchState): void;
  onSelect(selection: WorkspaceSelection, path?: string): void;
  context?: string;
}) {
  return (
    <div className="wsearch">
      <ResourceSearch
        state={search}
        onState={onSearch}
        scope={{ types: ["resource", "councilBusiness"], context }}
        testId="workspace-search"
        autoFocus={false}
        allowLayout
        hideResultsWhenEmpty
        onPick={(item) => {
          if (item.kind !== "resource" && item.kind !== "councilBusiness") return;
          onSearch(emptySearch);
          onSelect({ kind: item.kind, id: item.id }, item.folderPath);
        }}
      />
    </div>
  );
}
