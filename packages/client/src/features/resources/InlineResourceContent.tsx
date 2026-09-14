import { ExplorerTreeContent } from "../../components/ui/explorer-tree";
import { createPortal } from "react-dom";
import { RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { useReferenceMentionables } from "../../hooks/useReferenceMentionables";
import { useI18n } from "../../i18n/I18nProvider";
import { useWorkspaceResourceImageUpload } from "../documents/useWorkspaceResourceImageUpload";
import { ResourcePresentationBody } from "./ResourcePresentationBody";
import { ResourceAutosaveToggle } from "./ResourceAutosaveToggle";
import { useResourceSession } from "./useResourceSession";

export function InlineResourceContent({
  resourceId,
  heading,
  compact = false,
  actionsHost,
}: {
  resourceId: string;
  heading?: string;
  compact?: boolean;
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
          mode={session.mode}
          layout="workbench"
          showContentLabel={false}
          readOnlyTextEditor={compact}
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
          showLabel={!compact}
          enabled={session.autosaveEnabled}
          status={session.saveStatus}
          disabled={session.submitting}
          onChange={session.updateAutosave}
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
        {actionsHost ? createPortal(actions, actionsHost) : null}
        {body}
      </div>
    );
  }
  return (
    <ExplorerTreeContent
      testId={`business-inline-resource-${resourceId}`}
      heading={heading ?? t("resources.textContent")}
      actions={
        actions
      }
    >
      {body}
    </ExplorerTreeContent>
  );
}
