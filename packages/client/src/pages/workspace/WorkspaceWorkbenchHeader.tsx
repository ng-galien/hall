import { type ReactNode, useState } from "react";
import { InlineRenameField } from "@/components/ui/inline-rename-field";
import { EditIcon } from "../../components/icons";
import { RequestErrorBanner } from "../../components/Ui";
import { useI18n } from "../../i18n/I18nProvider";
import type { ApiErrorCode } from "../../services/apiClient";

export function WorkspaceWorkbenchHeader({
  icon,
  title,
  titleLabel,
  date,
  onTitleChange,
  hint,
  actions,
  actionError,
  metadata,
}: {
  icon?: ReactNode;
  title: string;
  titleLabel: string;
  date: { kind: "created" | "updated"; value: string };
  onTitleChange?(value: string): Promise<boolean>;
  hint?: ReactNode;
  actions?: ReactNode;
  actionError: ApiErrorCode | null;
  metadata?: ReactNode;
}) {
  const { t, formatDate } = useI18n();
  const [editingTitle, setEditingTitle] = useState(false);

  return (
    <div className="workspace-workbench-header" data-testid="resource-workbench-header">
      <header className="workbench-header">
        <div className="workbench-header-identity">
          {icon}
          <div className="workbench-header-copy">
            <div className="workbench-title-row">
              {onTitleChange ? (
                <InlineRenameField
                  value={title}
                  editing={editingTitle}
                  onEditingChange={setEditingTitle}
                  onCommit={onTitleChange}
                  label={titleLabel}
                  className="workbench-title-inline-input"
                  testId="workspace-workbench-title-input"
                >
                  <h1>{title}</h1>
                </InlineRenameField>
              ) : (
                <h1>{title}</h1>
              )}
              {onTitleChange && !editingTitle ? (
                <button
                  className="workbench-title-edit"
                  data-testid="workspace-workbench-rename"
                  type="button"
                  aria-label={`${t("common.edit")} · ${titleLabel}`}
                  onClick={() => setEditingTitle(true)}
                >
                  <EditIcon aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <span className="workbench-eyebrow">
              {t(date.kind === "created" ? "workspace.createdOn" : "workspace.updatedOn").replace(
                "{date}",
                formatDate(date.value),
              )}
            </span>
            {hint}
          </div>
        </div>
        {actions ? <div className="workbench-header-side">{actions}</div> : null}
      </header>

      <RequestErrorBanner error={actionError} />
      {metadata}
    </div>
  );
}
