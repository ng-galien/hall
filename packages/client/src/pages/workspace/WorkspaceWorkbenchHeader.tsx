import { createContext, type ReactNode, useContext, useState } from "react";
import { createPortal } from "react-dom";
import { InlineRenameField } from "@/components/ui/inline-rename-field";
import { CopyReferenceButton, type ObjectReference } from "../../components/CopyReferenceButton";
import { EditIcon } from "../../components/icons";
import { RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/I18nProvider";
import type { ApiErrorCode } from "../../services/apiClient";
import { ScreenActions, ScreenTitle } from "../../shell/headerTrail";

/** Controls of the item opened on the workspace screen (save state, changes, close); a dialog has its own. */
export const WorkbenchControlsContext = createContext<ReactNode>(null);

/**
 * Commands and details of an opened item. On a screen, its name is the large title of the screen header; in a dialog,
 * which has no screen header, the name is the dialog title identified by `titleId`.
 */
export function WorkspaceWorkbenchHeader({
  icon,
  title,
  titleLabel,
  date,
  onTitleChange,
  hint,
  actions,
  actionError,
  onDismissError,
  metadata,
  titleId,
  commandsTarget,
  reference,
}: {
  icon?: ReactNode;
  title: string;
  titleLabel: string;
  date: { kind: "created" | "updated"; value: string };
  onTitleChange?(value: string): Promise<boolean>;
  hint?: ReactNode;
  actions?: ReactNode;
  actionError: ApiErrorCode | null;
  onDismissError?(): void;
  metadata?: ReactNode;
  /** Identifier of the dialog title; set only when the header is shown in a dialog. */
  titleId?: string;
  /** In a dialog: the place of its first line where the commands of the item are written, before the close button. */
  commandsTarget?: HTMLElement | null;
  reference?: ObjectReference;
}) {
  const { t, formatDate } = useI18n();
  const screenControls = useContext(WorkbenchControlsContext);
  const controls = titleId ? null : screenControls;
  const [editingTitle, setEditingTitle] = useState(false);
  const heading = titleId ? (
    <h2 id={titleId} className="workbench-dialog-title" data-testid="workspace-workbench-title">
      {icon}
      <span>{title}</span>
    </h2>
  ) : (
    <ScreenTitle>{title}</ScreenTitle>
  );

  const commands = (
    <>
      {onTitleChange && !editingTitle ? (
        <Button
          variant="plain"
          size="icon"
          data-testid="workspace-workbench-rename"
          aria-label={`${t("common.edit")} · ${titleLabel}`}
          onClick={() => setEditingTitle(true)}
        >
          <EditIcon aria-hidden="true" />
        </Button>
      ) : null}
      {actions}
      {reference ? <CopyReferenceButton reference={reference} /> : null}
      {controls ? <span className="workbench-header-controls">{controls}</span> : null}
    </>
  );

  return (
    <div className="workspace-workbench-header" data-testid="resource-workbench-header">
      <header className="workbench-header">
        <div className="workbench-header-copy">
          {onTitleChange ? (
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
          )}
          <span className="workbench-eyebrow">
            {t(date.kind === "created" ? "workspace.createdOn" : "workspace.updatedOn", {
              date: formatDate(date.value),
            })}
          </span>
          {hint}
        </div>
        {titleId ? (
          commandsTarget ? (
            createPortal(commands, commandsTarget)
          ) : null
        ) : (
          <ScreenActions>{commands}</ScreenActions>
        )}
      </header>

      <RequestErrorBanner error={actionError} onDismiss={onDismissError} />
      {metadata}
    </div>
  );
}
