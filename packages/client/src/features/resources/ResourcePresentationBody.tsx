import type { ResourceDetail, SirenEntity } from "@hall/api-contract";
import { matchDiscriminated } from "@hall/domain";
import { lazy, Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MarkdownEditor } from "../../components/editor/MarkdownEditor";
import type { Mentionable } from "../../components/editor/references";
import { MarkdownView } from "../../components/MarkdownView";
import { useI18n } from "../../i18n/I18nProvider";
import type { ApiErrorCode } from "../../services/apiClient";
import { EventResourceEditor } from "../calendar/EventResourceEditor";
import { DocumentEmbed } from "../documents/DocumentEmbed";
import { RemoteResourceEmbed } from "../documents/RemoteResourceEmbed";
import { useEditorDocumentUpload } from "../documents/useEditorDocumentUpload";
import type { UploadedResourceImage } from "../documents/useResourceImageUpload";
import { GeographicLayerResourceView } from "../geographic/GeographicLayerResourceView";
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

/** The single type-specific resource body shared by the Workspace and the resource modal.
 * @implements-requirement HALL-FR-SRC-030
 */
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
  onUploadPhoto,
  onResolvedLegalReference,
  onRefreshLegalReference,
  onError,
  onRegisterFlush,
  autosaveEnabled,
  readOnlyTextEditor = false,
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
  onRemoteSubmit(): Promise<boolean>;
  onUploadImage?(file: File): Promise<UploadedResourceImage>;
  /** Imports the photos of the editor's photo buttons as files; dropped and pasted images use onUploadImage. */
  onUploadPhoto?(file: File): Promise<UploadedResourceImage>;
  onResolvedLegalReference(resource: Extract<ResourceDetail, { kind: "legalReference" }>): void;
  onRefreshLegalReference(): void;
  onError(error: ApiErrorCode | null): void;
  onRegisterFlush?(flush: (() => Promise<boolean>) | null): void;
  autosaveEnabled: boolean;
  readOnlyTextEditor?: boolean;
}) {
  const { t } = useI18n();
  const uploadDocument = useEditorDocumentUpload(resource.path);
  const [editingRemoteId, setEditingRemoteId] = useState<string | null>(null);
  const editing = mode === "edit";
  const editingResource = editing && capabilities.updateContent;

  return matchDiscriminated(resource, "kind", {
    folder: () => null,
    text: (entry) =>
      editingResource || readOnlyTextEditor ? (
        <div className="grid gap-1.5" data-testid="resource-presentation-text-edit">
          <MarkdownEditor
            title={entry.name}
            markdown={content}
            onChange={onContentChange}
            mentionables={mentionables}
            searchContext={entry.path}
            onUploadImage={canUploadImage && capabilities.updateContent ? onUploadImage : undefined}
            onUploadPhoto={capabilities.updateContent ? onUploadPhoto : undefined}
            onUploadDocument={capabilities.updateContent ? uploadDocument : undefined}
            readOnly={!editingResource}
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
      if (targetUrl && (!editingResource || editingRemoteId !== entry.id))
        return (
          <RemoteResourceEmbed
            resource={entry}
            onEdit={editingResource ? () => setEditingRemoteId(entry.id) : undefined}
          />
        );
      if (!editingResource) return <p>{t("workspace.remoteSetupDescription")}</p>;
      return (
        <form
          className="remote-resource-setup"
          data-testid="resource-presentation-remote-edit"
          onSubmit={(event) => {
            event.preventDefault();
            if (remoteUrl.trim())
              void onRemoteSubmit().then((saved) => {
                if (saved) setEditingRemoteId(null);
              });
          }}
        >
          <div>
            <h2>{t(targetUrl ? "workspace.editRemoteUrl" : "workspace.remoteSetupTitle")}</h2>
            {!targetUrl ? <p>{t("workspace.remoteSetupDescription")}</p> : null}
          </div>
          <div className="remote-resource-setup-field">
            <Field label={t("workspace.remoteUrl")}>
              <Input
                data-testid="remote-resource-url-input"
                type="url"
                value={remoteUrl}
                placeholder={t("workspace.remoteUrlPlaceholder")}
                onChange={(event) => {
                  setEditingRemoteId(entry.id);
                  onRemoteUrlChange(event.currentTarget.value);
                }}
                required
              />
            </Field>
            <Button data-testid="remote-resource-save" type="submit" disabled={submitting || !remoteUrl.trim()}>
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
    event: (entry) => (
      <EventResourceEditor
        key={entry.id}
        resource={entry}
        representation={representation}
        canUpdate={editingResource}
        autosaveEnabled={autosaveEnabled}
        onError={onError}
        onRegisterFlush={onRegisterFlush}
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
    geographicLayer: (entry) => <GeographicLayerResourceView resource={entry} />,
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
