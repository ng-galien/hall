import { createContext, type ReactNode, useContext, useState } from "react";
import { InlineRenameField } from "@/components/ui/inline-rename-field";
import { copyObjectReference, type ObjectReference } from "../../components/CopyReferenceButton";
import { CopyIcon, EditIcon } from "../../components/icons";
import { RequestErrorBanner } from "../../components/Ui";
import { type ItemCommand, ItemCommands } from "../../components/ui/item-commands";
import { useI18n } from "../../i18n/I18nProvider";
import type { ApiErrorCode } from "../../services/apiClient";
import { ScreenTitle, ScreenTitleCommands, ScreenTitleFacts, ScreenTitleIcon } from "../../shell/headerTrail";
import type { SaveStatus } from "./saveStatusStore";

/** The controls of an opened item that belong to its session: changes, automatic saving, closing. */
export interface WorkbenchControls {
  /** Commands listed last in the « … » menu, such as « Voir les modifications ». */
  menu: ItemCommand[];
  /** The cross that closes the item, written after the menu. */
  close?: ReactNode;
  /** The automatic saving of the item, written after a dot under the title. */
  save?: { status: SaveStatus; enabled: boolean };
  /** Dialogs opened by these controls. */
  dialogs?: ReactNode;
  /** Controls always shown on the line of the title, before the « … » menu: the automatic saving and the changes. */
  visible?: ReactNode;
}

/** Controls of the item opened on the workspace screen; a dialog passes its own. */
export const WorkbenchControlsContext = createContext<WorkbenchControls | null>(null);

/** The save state of an opened item, written after a dot. */
function SaveFact({ save }: { save: NonNullable<WorkbenchControls["save"]> }) {
  const { t } = useI18n();
  const status = !save.enabled && save.status === "idle" ? "off" : save.status;
  if (status === "idle") return null;
  const label =
    status === "off"
      ? t("workspace.autosaveOff")
      : status === "saving"
        ? t("common.saving")
        : status === "dirty"
          ? t("workspace.saveDirty")
          : status === "error"
            ? t("common.requestFailed")
            : t("workspace.saved");
  return (
    <span className="record-state" data-save={status === "off" ? "dirty" : status} data-testid="item-save-state">
      {label}
    </span>
  );
}

/**
 * Title line of an opened item, on a screen and in a document dialog alike: the type icon and the title at its left,
 * the commands of the item at its right, then a line of facts with the date and the save state. On a screen, the title
 * is the large title of the screen and the first line of the header keeps only the place.
 * @implements-requirement HALL-FR-LAY-100
 */
export function WorkspaceWorkbenchHeader({
  icon,
  title,
  titleLabel,
  date,
  onTitleChange,
  hint,
  primary,
  frequent = [],
  menu = [],
  dialogs,
  actionError,
  onDismissError,
  metadata,
  titleId,
  controls: ownControls,
  reference,
}: {
  icon?: ReactNode;
  title: string;
  titleLabel: string;
  date: { kind: "created" | "updated"; value: string };
  onTitleChange?(value: string): Promise<boolean>;
  hint?: ReactNode;
  /** The main command, a button with its label, such as « Modifier » or « Ouvrir dans Cartes ». */
  primary?: ReactNode;
  /** At most two frequent commands shown as icons, such as « Épingler » and « Plein écran ». */
  frequent?: ItemCommand[];
  /** The other commands of the item, listed in the « … » menu after « Renommer » and « Copier la référence ». */
  menu?: ItemCommand[];
  /** Dialogs opened by the commands of the item. */
  dialogs?: ReactNode;
  actionError: ApiErrorCode | null;
  onDismissError?(): void;
  metadata?: ReactNode;
  /** Identifier of the dialog title; set only when the header is shown in a dialog. */
  titleId?: string;
  /** In a dialog: the controls of its session; on a screen they come from the workspace. */
  controls?: WorkbenchControls;
  reference?: ObjectReference;
}) {
  const { t, formatDate } = useI18n();
  const screenControls = useContext(WorkbenchControlsContext);
  const controls = titleId ? ownControls : (ownControls ?? screenControls);
  const [editingTitle, setEditingTitle] = useState(false);
  const commands: ItemCommand[] = [
    ...(onTitleChange
      ? [
          {
            id: "rename",
            label: t("common.rename"),
            icon: <EditIcon />,
            testId: "workspace-workbench-rename",
            onSelect: () => setEditingTitle(true),
          },
        ]
      : []),
    ...(reference
      ? [
          {
            id: "copy-reference",
            label: t("reference.copy"),
            icon: <CopyIcon />,
            testId: "copy-object-reference",
            onSelect: () => void copyObjectReference(reference).catch(() => undefined),
          },
        ]
      : []),
    ...menu,
    ...(controls?.menu ?? []),
  ];
  const itemCommands = (
    <ItemCommands
      primary={primary}
      frequent={frequent}
      visible={controls?.visible}
      menu={commands}
      close={titleId ? undefined : controls?.close}
    />
  );
  const facts = (
    <>
      <span className="workbench-eyebrow">
        {t(date.kind === "created" ? "workspace.createdOn" : "workspace.updatedOn", { date: formatDate(date.value) })}
      </span>
      {controls?.save ? <SaveFact save={controls.save} /> : null}
      {hint}
    </>
  );
  const rename = (heading: ReactNode) =>
    onTitleChange ? (
      <InlineRenameField
        value={title}
        editing={editingTitle}
        onEditingChange={setEditingTitle}
        onCommit={onTitleChange}
        label={titleLabel}
        className="hall-input workbench-title-inline-input"
        testId="workspace-workbench-title-input"
      >
        {heading}
      </InlineRenameField>
    ) : (
      heading
    );

  return (
    <div className="workspace-workbench-header" data-testid="resource-workbench-header">
      {titleId ? (
        <div className="screen-title-block workbench-dialog-title-block">
          <div className="screen-title-row">
            {icon ? <span className="screen-title-icon">{icon}</span> : null}
            {rename(
              <h2 id={titleId} className="workbench-dialog-title" data-testid="workspace-workbench-title">
                {title}
              </h2>,
            )}
            <div className="screen-title-commands">{itemCommands}</div>
          </div>
          <div className="screen-title-facts">{facts}</div>
        </div>
      ) : (
        <>
          <ScreenTitle>{title}</ScreenTitle>
          {icon ? <ScreenTitleIcon>{icon}</ScreenTitleIcon> : null}
          <ScreenTitleCommands>{itemCommands}</ScreenTitleCommands>
          <ScreenTitleFacts>{facts}</ScreenTitleFacts>
          {editingTitle ? rename(null) : null}
        </>
      )}
      <RequestErrorBanner error={actionError} onDismiss={onDismissError} />
      {metadata}
      {dialogs}
      {controls?.dialogs}
    </div>
  );
}
