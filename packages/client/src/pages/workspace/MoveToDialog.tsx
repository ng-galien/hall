import type { CouncilBusinessNavigationIndex } from "@hall/api-contract";
import { type ReactNode, useState } from "react";
import { CouncilBusinessIcon, FolderIcon, MoveIcon } from "../../components/icons";
import { Modal, RequestErrorBanner } from "../../components/Ui";
import type { ItemCommand } from "../../components/ui/item-commands";
import { ListRow, ListRowIcon, ListRows } from "../../components/ui/list-row";
import { FolderGlyph, useIsPersonalFolder } from "../../features/documents/FolderGlyph";
import { resourceCapabilities } from "../../features/resources/resourceCapabilities";
import { useI18n } from "../../i18n/I18nProvider";
import type { ApiErrorCode } from "../../services/apiClient";
import { useFolderTree } from "../../shell/WorkspaceTree";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import { folderColorIconProps } from "./folderColor";
import { businessFolderPath, type PathNode } from "./paths";
import { type DragPayload, moveIntoBusiness, moveToPath } from "./workspaceOrg";

type TreeBusiness = CouncilBusinessNavigationIndex["businesses"][number];
type Destination = PathNode<TreeBusiness>;

/** One destination of the tree, its sub-folders and affaires under it. */
function DestinationRow({
  node,
  excluded,
  onChoose,
}: {
  node: Destination;
  excluded(path: string): boolean;
  onChoose(node: Destination): void;
}) {
  const { t } = useI18n();
  const personal = useIsPersonalFolder(node.business ? undefined : node.path);
  const children = node.children.filter((child) => !excluded(child.path));
  return (
    <ListRow
      head={
        node.business ? (
          <ListRowIcon nature="council">
            <CouncilBusinessIcon {...folderColorIconProps(node.color)} />
          </ListRowIcon>
        ) : (
          <FolderGlyph color={node.color} path={node.path} />
        )
      }
      title={personal ? t("workspace.personalWorkspace") : node.name}
      onOpen={() => onChoose(node)}
      openTestId={node.business ? `move-to-business-${node.business.id}` : `move-to-folder-${node.path}`}
    >
      {children.length ? (
        <ListRows>
          {children.map((child) => (
            <DestinationRow key={child.path} node={child} excluded={excluded} onChoose={onChoose} />
          ))}
        </ListRows>
      ) : undefined}
    </ListRow>
  );
}

/** True when the documents screen offers to move this document or folder. */
export function useMovable(id: string): boolean {
  const representation = useWorkspaceResourcesStore((state) => state.representations[id]);
  return resourceCapabilities(representation ?? null).relocate;
}

/**
 * « Déplacer vers… » of a document or a folder, open while `item` is set: the folders and affaires of the commune; a
 * document moved to an affaire goes into its folder and is attached to it.
 * @implements-requirement HALL-FR-WSP-090
 */
export function MoveToDialog({
  item,
  onClose,
  onMoved,
}: {
  item: (DragPayload & { kind: "resource" }) | null;
  onClose(): void;
  onMoved?(path: string): void;
}) {
  return item ? <OpenMoveToDialog item={item} onClose={onClose} onMoved={onMoved} /> : null;
}

/** The open dialog; the tree of destinations is read only while it is open. */
function OpenMoveToDialog({
  item,
  onClose,
  onMoved,
}: {
  item: DragPayload & { kind: "resource" };
  onClose(): void;
  onMoved?(path: string): void;
}) {
  const { t } = useI18n();
  const entry = useWorkspaceResourcesStore((state) => state.catalog.find((candidate) => candidate.id === item.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const tree = useFolderTree();
  const ownPath = entry?.kind === "folder" ? entry.fullPath : null;
  const excluded = (path: string) => ownPath !== null && (path === ownPath || path.startsWith(`${ownPath}/`));
  const close = () => {
    setError(null);
    onClose();
  };
  const choose = async (node: Destination | null) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const business = node?.business ?? null;
    const target = business ? businessFolderPath(business) : (node?.path ?? "");
    const failure = business ? await moveIntoBusiness(item, business) : await moveToPath(item, target);
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    close();
    onMoved?.(target);
  };
  return (
    <Modal
      open
      title={t("workspace.moveTo")}
      testId="move-to-dialog"
      onClose={close}
      footer={
        error ? (
          <div className="w-full" data-testid="move-to-error">
            <RequestErrorBanner error={error} />
          </div>
        ) : undefined
      }
    >
      <ListRows aria-busy={busy || undefined}>
        <ListRow
          head={
            <ListRowIcon nature="folder">
              <FolderIcon />
            </ListRowIcon>
          }
          title={t("navigation.documents")}
          onOpen={() => void choose(null)}
          openTestId="move-to-root"
        >
          <ListRows>
            {tree
              .filter((node) => !excluded(node.path))
              .map((node) => (
                <DestinationRow
                  key={node.path}
                  node={node}
                  excluded={excluded}
                  onChoose={(chosen) => void choose(chosen)}
                />
              ))}
          </ListRows>
        </ListRow>
      </ListRows>
    </Modal>
  );
}

/** The « Déplacer vers… » command of one document and its dialog; no command for whoever may not move it. */
export function useMoveTo({ id, onMoved }: { id: string; onMoved?(path: string): void }): {
  command: ItemCommand | null;
  dialog: ReactNode;
} {
  const { t } = useI18n();
  const movable = useMovable(id);
  const [opened, setOpened] = useState(false);
  return {
    command: movable
      ? {
          id: "move",
          label: t("workspace.moveTo"),
          icon: <MoveIcon />,
          testId: "resource-move-to",
          onSelect: () => setOpened(true),
        }
      : null,
    dialog: movable ? (
      <MoveToDialog
        item={opened ? { kind: "resource", id } : null}
        onClose={() => setOpened(false)}
        onMoved={onMoved}
      />
    ) : null,
  };
}
