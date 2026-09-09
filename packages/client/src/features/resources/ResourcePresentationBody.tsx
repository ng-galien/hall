import type { ResourceDetail, SirenEntity } from "@hall/api-contract";
import { matchDiscriminated } from "@hall/domain";
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
import type { ResourceCapabilities } from "./resourceCapabilities";

const SpreadsheetResourceEditor = lazy(() =>
  import("../spreadsheet/SpreadsheetResourceEditor").then((module) => ({
    default: module.SpreadsheetResourceEditor,
  })),
);

export type ResourcePresentationMode = "read" | "edit";

export type ResourcePresentationCapabilities = ResourceCapabilities;

/** The single type-specific resource body shared by the Workspace and the resource modal. */
export function ResourcePresentationBody({
  resource,
  representation,
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
  showContentLabel = true,
}: {
  resource: ResourceDetail;
  representation: SirenEntity | null;
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
  onResolvedLegalReference(resource: Extract<ResourceDetail, { kind: "legalReference" }>): void;
  onRefreshLegalReference(): void;
  onError(error: ApiErrorCode | null): void;
  onRegisterFlush?(flush: (() => Promise<boolean>) | null): void;
  autosaveEnabled: boolean;
  showContentLabel?: boolean;
}) {
  const { t } = useI18n();
  const editing = mode === "edit";
  const editingResource = editing && capabilities.updateContent;

  return matchDiscriminated(resource, "kind", {
    folder: () => null,
    text: (entry) =>
      editingResource ? (
        <div className="grid gap-1.5" data-testid="resource-presentation-text-edit">
          {showContentLabel ? <Label>{t("resources.textContent")}</Label> : null}
          <MarkdownEditor
            title={entry.name}
            markdown={content}
            onChange={onContentChange}
            mentionables={mentionables}
            searchContext={entry.path}
            onUploadImage={canUploadImage && capabilities.updateContent ? onUploadImage : undefined}
            readOnly={!capabilities.updateContent}
            variant={layout === "extended" ? "enriched" : "compact"}
          />
        </div>
      ) : (
        <div className="resource-preview-text" data-testid="resource-presentation-text-read">
          <MarkdownView markdown={entry.content} />
        </div>
      ),
    remote: (entry) => {
      const targetUrl = entry.target.kind === "url" ? entry.target.url : null;
      if (!editingResource && targetUrl)
        return (
          <div className="remote-resource-embed" data-testid="resource-presentation-remote-read">
            <div className="remote-resource-toolbar">
              <span className="remote-resource-url" title={targetUrl}>
                {targetUrl}
              </span>
              <a href={targetUrl} target="_blank" rel="noreferrer" className="remote-resource-open">
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
      <DocumentEmbed
        resource={entry}
        representation={representation}
        objectTestId={layout === "extended" ? "resource-preview-object" : "resource-workbench-object"}
      />
    ),
    geographic: (entry) => (
      <GeographicResourceMap
        resource={entry}
        data={entry.document}
        canUpdate={editing && capabilities.updateContent}
        autosaveEnabled={autosaveEnabled}
        onError={onError}
        onRegisterFlush={onRegisterFlush}
      />
    ),
    spreadsheet: (entry) => (
      <Suspense fallback={<p>{t("spreadsheet.loading")}</p>}>
        <SpreadsheetResourceEditor
          resource={entry}
          document={entry.document}
          mode={mode}
          canUpdate={capabilities.updateContent}
          autosaveEnabled={autosaveEnabled}
          onError={onError}
          onRegisterFlush={onRegisterFlush}
        />
      </Suspense>
    ),
    legalReference: (entry) => {
      if (entry.document.resolutionStatus === "draft") {
        return capabilities.resolveLegalReference ? (
          <LegalReferenceResolver resource={entry} onResolved={onResolvedLegalReference} />
        ) : (
          <p>{t("legalReference.loading")}</p>
        );
      }
      return (
        <LegalReferenceResourceView
          resource={entry}
          canRefresh={capabilities.refreshLegalReference}
          refreshing={submitting}
          refreshConflict={refreshConflict}
          onRefresh={onRefreshLegalReference}
        />
      );
    },
  });
}
