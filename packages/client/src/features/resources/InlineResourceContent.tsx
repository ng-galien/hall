import { useEffect } from "react";
import { createPortal } from "react-dom";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import type { EditorImageUpload } from "../../components/editor/imageTransfer";
import { RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { ExplorerTreeContent } from "../../components/ui/explorer-tree";
import { useReferenceMentionables } from "../../hooks/useReferenceMentionables";
import { useI18n } from "../../i18n/I18nProvider";
import type { ApiErrorCode } from "../../services/apiClient";
import { imageUploadTitle, type UploadedResourceImage } from "../documents/useResourceImageUpload";
import { useWorkspaceResourceImageUpload } from "../documents/useWorkspaceResourceImageUpload";
import { ResourceAutosaveToggle } from "./ResourceAutosaveToggle";
import { ResourceChangesControl } from "./ResourceChangesControl";
import { ResourcePresentationBody, ResourceTextEditor } from "./ResourcePresentationBody";
import { useResourceSession } from "./useResourceSession";

export interface InlineTextDraft {
  content: string;
  error: ApiErrorCode | null;
  retry?: () => void;
  noteId: string | null;
  readyVersion: number | null;
  uploadImage(
    file: File,
    title: string,
    uploadExisting: (noteId: string) => Promise<UploadedResourceImage>,
  ): Promise<UploadedResourceImage>;
  change(content: string): void;
  release(): void;
}

export function InlineResourceContent({
  resourceId,
  heading,
  compact = false,
  readOnly = false,
  actionsHost,
  uploadPhoto,
  noteEditor,
}: {
  /** Imports the photos of the editor's photo buttons as files that the note shows; dropped and pasted images stay images of the text. */
  uploadPhoto?: EditorImageUpload;
  resourceId: string | null;
  noteEditor?: { title: string; path: string; draft?: InlineTextDraft };
  heading?: string;
  compact?: boolean;
  readOnly?: boolean;
  actionsHost?: HTMLElement | null;
}) {
  const draft = noteEditor?.draft;
  const noteId = draft?.noteId ?? resourceId;
  const session = useResourceSession({ resourceId: !draft || draft.readyVersion !== null ? noteId : null });
  const loadedText = session.resource?.kind === "text" ? session.resource : null;
  const draftActive =
    draft && !(draft.readyVersion !== null && loadedText?.id === noteId && loadedText.version >= draft.readyVersion);
  useEffect(() => {
    if (draft && !draftActive) draft.release();
  }, [draft, draftActive]);
  const mentionables = useReferenceMentionables();
  const { t } = useI18n();
  const { canUpload, uploadImage } = useWorkspaceResourceImageUpload();
  const uploadTextImage: EditorImageUpload | undefined = !canUpload
    ? undefined
    : draftActive
      ? (file) =>
          draft.uploadImage(file, imageUploadTitle(file.name, t("editor.imageImported")), (id) =>
            uploadImage(file, { kind: "textResourceContent", id }),
          )
      : noteId && session.capabilities.updateContent
        ? (file) => uploadImage(file, { kind: "textResourceContent", id: noteId })
        : undefined;
  const body = (
    <>
      <RequestErrorBanner error={draft?.error ?? session.actionError} />
      {noteEditor && !readOnly && (draftActive || (loadedText && session.mode === "edit")) ? (
        <ResourceTextEditor
          title={loadedText?.name ?? noteEditor.title}
          searchContext={loadedText?.path ?? noteEditor.path}
          markdown={draftActive ? draft.content : session.content}
          onChange={draftActive ? draft.change : session.setContent}
          mentionables={mentionables}
          onUploadImage={uploadTextImage}
          onUploadPhoto={uploadPhoto}
          canUploadDocument
        />
      ) : session.detailsFailed ? (
        <p role="alert">{t("common.requestFailed")}</p>
      ) : !session.resource ? (
        <LoadingIndicator size="zone" label={t("common.loading")} />
      ) : (
        <ResourcePresentationBody
          resource={session.resource}
          representation={session.representation}
          mode={readOnly ? "read" : session.mode}
          layout="workbench"
          readOnlyTextEditor={compact && !readOnly}
          capabilities={session.capabilities}
          content={session.content}
          remoteUrl={session.remoteUrl}
          mentionables={mentionables}
          canUploadImage={canUpload}
          submitting={session.submitting}
          refreshConflict={session.refreshConflict}
          onContentChange={session.setContent}
          onRemoteUrlChange={session.setRemoteUrl}
          onRemoteSubmit={() => session.save()}
          onUploadImage={uploadTextImage}
          onUploadPhoto={uploadPhoto}
          onResolvedLegalReference={session.adoptResolvedResource}
          onRefreshLegalReference={session.refreshLegalReference}
          onError={session.setActionError}
          onRegisterFlush={session.registerBodyFlush}
          autosaveEnabled={session.autosaveEnabled}
        />
      )}
    </>
  );
  const actions = (
    <>
      {draft?.retry ? (
        <Button variant="secondary" data-testid="geographic-note-retry" onClick={draft.retry}>
          {t("common.retry")}
        </Button>
      ) : null}
      {draft?.error === "conflict" && noteId ? (
        <Button variant="secondary" data-testid="geographic-note-discard-draft" onClick={draft.release}>
          {t("common.cancel")}
        </Button>
      ) : null}
      {draft && draft.readyVersion !== null && session.detailsFailed ? (
        <Button variant="secondary" data-testid="geographic-note-reload" onClick={() => void session.reload()}>
          {t("common.retry")}
        </Button>
      ) : null}
      {session.canConfigureAutosave ? (
        <ResourceAutosaveToggle
          enabled={session.autosaveEnabled}
          status={session.saveStatus}
          onChange={session.updateAutosave}
        />
      ) : null}
      {session.resource ? (
        <ResourceChangesControl
          resourceId={session.resource.id}
          representation={session.representation}
          onInvalidated={() => {
            if (!session.dirty && !session.submitting) void session.reload();
          }}
        />
      ) : null}
      {session.editable && (!session.autosaveEnabled || session.actionError) ? (
        <Button
          variant="secondary"
          data-testid={`business-inline-save-${resourceId}`}
          disabled={session.submitting || !session.dirty}
          onClick={() => void session.save()}
        >
          {t("common.save")}
        </Button>
      ) : null}
    </>
  );
  if (compact) {
    return (
      <div className="business-inline-resource" data-testid={`business-inline-resource-${resourceId ?? "draft"}`}>
        {actionsHost && !readOnly ? createPortal(actions, actionsHost) : null}
        {body}
      </div>
    );
  }
  return (
    <ExplorerTreeContent
      testId={`business-inline-resource-${resourceId ?? "draft"}`}
      heading={heading ?? t("resources.textContent")}
      actions={readOnly ? null : actions}
    >
      {body}
    </ExplorerTreeContent>
  );
}
