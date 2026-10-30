import { createPortal } from "react-dom";
import type { EditorImageUpload } from "../../components/editor/imageTransfer";
import { RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { ExplorerTreeContent } from "../../components/ui/explorer-tree";
import { useReferenceMentionables } from "../../hooks/useReferenceMentionables";
import { useI18n } from "../../i18n/I18nProvider";
import { useWorkspaceResourceImageUpload } from "../documents/useWorkspaceResourceImageUpload";
import { ResourceAutosaveToggle } from "./ResourceAutosaveToggle";
import { ResourceChangesControl } from "./ResourceChangesControl";
import { ResourcePresentationBody } from "./ResourcePresentationBody";
import { useResourceSession } from "./useResourceSession";

export function InlineResourceContent({
  resourceId,
  heading,
  compact = false,
  readOnly = false,
  actionsHost,
  uploadPhoto,
}: {
  /** Imports the photos of the editor's photo buttons as files that the note shows; dropped and pasted images stay images of the text. */
  uploadPhoto?: EditorImageUpload;
  resourceId: string;
  heading?: string;
  compact?: boolean;
  readOnly?: boolean;
  actionsHost?: HTMLElement | null;
}) {
  const session = useResourceSession({ resourceId });
  const mentionables = useReferenceMentionables();
  const { t } = useI18n();
  const { canUpload, uploadImage } = useWorkspaceResourceImageUpload();
  const body = (
    <>
      <RequestErrorBanner error={session.actionError} />
      {session.detailsFailed ? (
        <p role="alert">{t("common.requestFailed")}</p>
      ) : !session.resource ? (
        <p role="status">{t("common.loading")}</p>
      ) : (
        <ResourcePresentationBody
          resource={session.resource}
          representation={session.representation}
          mode={readOnly ? "read" : session.mode}
          layout="workbench"
          showContentLabel={false}
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
          onUploadImage={(file) => uploadImage(file, { kind: "textResourceContent", id: resourceId })}
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
      {session.canConfigureAutosave ? (
        <ResourceAutosaveToggle
          enabled={session.autosaveEnabled}
          status={session.saveStatus}
          disabled={session.submitting}
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
          size="sm"
          variant="outline"
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
      <div className="business-inline-resource" data-testid={`business-inline-resource-${resourceId}`}>
        {actionsHost && !readOnly ? createPortal(actions, actionsHost) : null}
        {body}
      </div>
    );
  }
  return (
    <ExplorerTreeContent
      testId={`business-inline-resource-${resourceId}`}
      heading={heading ?? t("resources.textContent")}
      actions={readOnly ? null : actions}
    >
      {body}
    </ExplorerTreeContent>
  );
}
