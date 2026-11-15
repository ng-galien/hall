import { ListRow, ListRows } from "../../components/ui/list-row";
import { FolderGlyph } from "../../features/documents/FolderGlyph";
import { useI18n } from "../../i18n/I18nProvider";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import { isUnderPath } from "./paths";
import type { WorkspaceSelection } from "./workspaceItemReference";

/**
 * Entry of the personal folder of the connected person, set apart above the contents of Documents; it shows outside
 * that folder only, and nothing shows for a person without a personal folder.
 * @implements-requirement HALL-FR-WSP-380
 */
export function PersonalFolderEntry({
  path,
  onSelect,
}: {
  path: string;
  onSelect(selection: WorkspaceSelection, path?: string): void;
}) {
  const { t } = useI18n();
  const personalPath = useWorkspaceResourcesStore((state) => state.personalWorkspacePath);
  if (!personalPath || isUnderPath(path, personalPath)) return null;
  return (
    <ListRows className="workspace-personal" aria-label={t("workspace.personalWorkspace")}>
      <ListRow
        data-testid="workspace-personal-entry"
        head={<FolderGlyph path={personalPath} />}
        title={t("workspace.personalWorkspace")}
        onOpen={() => onSelect(null, personalPath)}
        openTestId="workspace-personal-open"
      />
    </ListRows>
  );
}
