import { matchDiscriminated, type Resource, type ResourceDetails } from "@hall/domain";
import { lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MarkdownEditor } from "../../components/editor/MarkdownEditor";
import type { Mentionable } from "../../components/editor/references";
import { OpenIcon } from "../../components/icons";
import { MarkdownView } from "../../components/MarkdownView";
import { useI18n } from "../../i18n/I18nProvider";
import type { ApiErrorCode } from "../../services/apiClient";
import { DocumentEmbed } from "../documents/DocumentEmbed";
import type { UploadedResourceImage } from "../documents/useResourceImageUpload";
import { GeographicResourceMap } from "../geographic/GeographicResourceMap";
import { LegalReferenceResolver } from "../legal/LegalReferenceResolver";
import { LegalReferenceResourceView } from "../legal/LegalReferenceResourceView";

const SpreadsheetResourceEditor = lazy(() =>
  import("../spreadsheet/SpreadsheetResourceEditor").then((module) => ({
    default: module.SpreadsheetResourceEditor,
  })),
);

export type ResourcePresentationMode = "read" | "edit";

export interface ResourcePresentationCapabilities {
  updateResource: boolean;
  updateGeography: boolean;
  updateSpreadsheet: boolean;
  refreshLegalReference: boolean;
}

/** The single type-specific resource body shared by the Workspace and the resource modal. */
export function ResourcePresentationBody({
  resource,
  details,
  mode,
  layout,
  capabilities,
  content,
  remoteUrl,
  mentionables,
  canUploadImage,
  submitting,
  refreshConflict,
  onContentChange,
  onRemoteUrlChange,
  onRemoteSubmit,
  onUploadImage,
  onResolvedLegalReference,
  onRefreshLegalReference,
  onError,
  onRegisterFlush,
  autosaveEnabled,
}: {
  resource: Resource;
  details: ResourceDetails | null;
  mode: ResourcePresentationMode;
  layout: "workbench" | "extended";
  capabilities: ResourcePresentationCapabilities;
  content: string;
  remoteUrl: string;
  mentionables: Mentionable[];
  canUploadImage: boolean;
  submitting: boolean;
  refreshConflict: boolean;
  onContentChange(content: string): void;
  onRemoteUrlChange(url: string): void;
  onRemoteSubmit(): void;
  onUploadImage?(file: File): Promise<UploadedResourceImage>;
  onResolvedLegalReference(resource: Resource): void;
  onRefreshLegalReference(): void;
  onError(error: ApiErrorCode | null): void;
  onRegisterFlush?(flush: (() => Promise<boolean>) | null): void;
  autosaveEnabled: boolean;
}) {
  const { t } = useI18n();
  const editing = mode === "edit";
  const editingResource = editing && capabilities.updateResource;

  return matchDiscriminated(resource, "kind", {
    text: (entry) =>
      editingResource ? (
        <div className="grid gap-1.5" data-testid="resource-presentation-text-edit">
          <Label>{t("resources.textContent")}</Label>
          <MarkdownEditor
            title={entry.title}
            markdown={content}
            onChange={onContentChange}
            mentionables={mentionables}
            searchContext={entry.folderPath}
            onUploadImage={canUploadImage && capabilities.updateResource ? onUploadImage : undefined}
            readOnly={Boolean(details?.snapshotted) || !capabilities.updateResource}
            variant={layout === "extended" ? "enriched" : "compact"}
          />
        </div>
      ) : (
        <div className="resource-preview-text" data-testid="resource-presentation-text-read">
          <MarkdownView markdown={entry.content} />
        </div>
      ),
    remote: (entry) => {
      if (!editingResource && entry.url)
        return (
          <div className="remote-resource-embed" data-testid="resource-presentation-remote-read">
            <div className="remote-resource-toolbar">
              <span className="remote-resource-url" title={entry.url}>
                {entry.url}
              </span>
              <a href={entry.url} target="_blank" rel="noreferrer" className="remote-resource-open">
                <OpenIcon aria-hidden="true" />
                {t("workspace.openRemoteResource")}
              </a>
            </div>
          </div>
        );
      if (!editingResource) return <p>{t("workspace.remoteSetupDescription")}</p>;
      return (
        <form
          className="remote-resource-setup"
          data-testid="resource-presentation-remote-edit"
          onSubmit={(event) => {
            event.preventDefault();
            if (remoteUrl.trim()) onRemoteSubmit();
          }}
        >
          <div>
            <h2>{t("workspace.remoteSetupTitle")}</h2>
            <p>{t("workspace.remoteSetupDescription")}</p>
          </div>
          <Label htmlFor={`remote-resource-url-${entry.id}`}>{t("workspace.remoteUrl")}</Label>
          <div className="remote-resource-setup-field">
            <Input
              id={`remote-resource-url-${entry.id}`}
              data-testid="remote-resource-url-input"
              type="url"
              value={remoteUrl}
              placeholder={t("workspace.remoteUrlPlaceholder")}
              onChange={(event) => onRemoteUrlChange(event.currentTarget.value)}
              required
            />
            <Button type="submit" disabled={submitting || !remoteUrl.trim()}>
              {t(submitting ? "common.saving" : "common.save")}
            </Button>
          </div>
        </form>
      );
    },
    document: (entry) => (
      <DocumentEmbed resource={entry} objectTestId={layout === "extended" ? "resource-preview-object" : undefined} />
    ),
    geographic: (entry) =>
      details?.geography ? (
        <GeographicResourceMap
          resource={entry}
          data={details.geography}
          canUpdate={editing && capabilities.updateGeography}
          autosaveEnabled={autosaveEnabled}
          onError={onError}
          onRegisterFlush={onRegisterFlush}
        />
      ) : (
        <p>{t("geographic.loading")}</p>
      ),
    spreadsheet: (entry) =>
      details?.spreadsheet ? (
        <Suspense fallback={<p>{t("spreadsheet.loading")}</p>}>
          <SpreadsheetResourceEditor
            resource={entry}
            document={details.spreadsheet}
            mode={mode}
            canUpdate={capabilities.updateSpreadsheet}
            snapshotted={details.snapshotted}
            autosaveEnabled={autosaveEnabled}
            onError={onError}
            onRegisterFlush={onRegisterFlush}
          />
        </Suspense>
      ) : (
        <p>{t("spreadsheet.loading")}</p>
      ),
    legalReference: (entry) => {
      if (entry.resolutionStatus === "draft") {
        return editing ? (
          <LegalReferenceResolver resource={entry} onResolved={onResolvedLegalReference} />
        ) : (
          <p>{t("legalReference.loading")}</p>
        );
      }
      return details?.legalSnapshots ? (
        <LegalReferenceResourceView
          resource={entry}
          snapshots={details.legalSnapshots}
          canRefresh={capabilities.refreshLegalReference}
          refreshing={submitting}
          refreshConflict={refreshConflict}
          onRefresh={onRefreshLegalReference}
        />
      ) : (
        <p>{t("legalReference.loading")}</p>
      );
    },
  });
}
