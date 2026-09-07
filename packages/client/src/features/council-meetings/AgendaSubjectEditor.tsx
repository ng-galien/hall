import { findSirenAction, type ResourceDetail } from "@hall/api-contract";
import { useEffect, useId, useState } from "react";
import { MarkdownEditor } from "../../components/editor/MarkdownEditor";
import { MarkdownView } from "../../components/MarkdownView";
import { RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { useReferenceMentionables } from "../../hooks/useReferenceMentionables";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode } from "../../services/apiClient";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import { useWorkspaceResourceImageUpload } from "../documents/useWorkspaceResourceImageUpload";

/** Edit only the subject's text resource; the owning business and its report are never renamed here. */
export function AgendaSubjectEditor({ resourceId, onSaved, onCancel }: {
  resourceId: string; onSaved(): Promise<void>; onCancel(): void;
}) {
  const { t } = useI18n();
  const fieldId = useId();
  const [resource, setResource] = useState<Extract<ResourceDetail, { kind: "text" }> | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const { submitting, run } = useSubmitting();
  const mentionables = useReferenceMentionables();
  const { canUpload, uploadImage } = useWorkspaceResourceImageUpload();
  useEffect(() => {
    let active = true;
    const store = useWorkspaceResourcesStore.getState();
    void store.open(resourceId).then((result) => {
      if (!active) return;
      if (!result || result.data.kind !== "text") { setError(useWorkspaceResourcesStore.getState().error ?? "request_failed"); return; }
      setResource(result.data);
      setName(result.data.name);
      setContent(result.data.content);
      setCanEdit(Boolean(result.representation && findSirenAction(result.representation, "resource.update-content")));
    });
    return () => { active = false; };
  }, [resourceId]);

  if (error && !resource) return <RequestErrorBanner error={error} />;
  if (!resource) return <p role="status">{t("common.loading")}</p>;
  if (!canEdit) return <div className="composer-item-editor"><MarkdownView markdown={resource.content} /></div>;
  return <form className="composer-item-editor" onSubmit={(event) => {
    event.preventDefault();
    void run(async () => {
      setError(null);
      const saved = await useWorkspaceResourcesStore.getState().updateContent(resourceId, {
        kind: "text", expectedVersion: resource.version, name, content,
      });
      if (!saved || saved.kind !== "text") { setError(useWorkspaceResourcesStore.getState().error ?? "request_failed"); return; }
      setResource(saved);
      await onSaved();
    });
  }}>
    <RequestErrorBanner error={error} />
    <div className="grid gap-1.5">
      <Label htmlFor={fieldId}>{t("meeting.subject")}</Label>
      <Input id={fieldId} data-testid="agenda-subject-title" value={name} onChange={(event) => setName(event.target.value)} disabled={submitting} required />
    </div>
    <MarkdownEditor testId="agenda-subject-editor" markdown={resource.content} onChange={setContent} mentionables={mentionables} searchContext={resource.path} onUploadImage={canUpload ? (file) => uploadImage(file, { kind: "textResourceContent", id: resourceId }) : undefined} />
    <div className="composer-editor-actions">
      <span className="composer-editor-spacer" />
      <Button variant="outline" type="button" data-testid="agenda-subject-cancel" disabled={submitting} onClick={onCancel}>{t("common.cancel")}</Button>
      <Button type="submit" data-testid="agenda-item-save" disabled={submitting}>{t(submitting ? "common.saving" : "common.save")}</Button>
    </div>
  </form>;
}
