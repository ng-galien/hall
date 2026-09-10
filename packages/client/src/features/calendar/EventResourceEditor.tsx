import { eventDocumentSchema, type ResourceDetail } from "@hall/api-contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/I18nProvider";
import { useResourceSaveStatus } from "../../pages/workspace/saveStatusStore";
import type { ApiErrorCode } from "../../services/apiClient";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import { EventFields } from "./EventFields";

type EventResource = Extract<ResourceDetail, { kind: "event" }>;
export function EventResourceEditor({
  resource,
  canUpdate,
  autosaveEnabled,
  onError,
  onRegisterFlush,
}: {
  resource: EventResource;
  canUpdate: boolean;
  autosaveEnabled: boolean;
  onError(error: ApiErrorCode | null): void;
  onRegisterFlush?(flush: (() => Promise<boolean>) | null): void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(resource.document);
  const latest = useRef(draft);
  const saved = useRef(JSON.stringify(resource.document));
  const version = useRef(resource.version);
  const pending = useRef<Promise<boolean> | null>(null);
  const { status, setStatus } = useResourceSaveStatus(resource.id);
  const valid = eventDocumentSchema.safeParse(draft).success;
  const save = useCallback((): Promise<boolean> => {
    if (pending.current) return pending.current;
    const run = async () => {
      while (JSON.stringify(latest.current) !== saved.current) {
        if (!canUpdate || !eventDocumentSchema.safeParse(latest.current).success) return false;
        const document = latest.current;
        setStatus("saving");
        const updated = await useWorkspaceResourcesStore
          .getState()
          .updateContent(resource.id, { kind: "event", expectedVersion: version.current, document });
        if (updated?.kind !== "event") {
          onError(useWorkspaceResourcesStore.getState().error);
          setStatus("error");
          return false;
        }
        version.current = updated.version;
        saved.current = JSON.stringify(document);
      }
      setStatus("saved");
      onError(null);
      return true;
    };
    pending.current = run().finally(() => {
      pending.current = null;
    });
    return pending.current;
  }, [canUpdate, onError, resource.id, setStatus]);
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    onRegisterFlush?.(() => saveRef.current());
    return () => {
      onRegisterFlush?.(null);
      if (autosaveEnabled) void saveRef.current();
    };
  }, [onRegisterFlush, autosaveEnabled]);
  useEffect(() => {
    if (JSON.stringify(draft) === saved.current) return;
    setStatus("dirty");
    if (!autosaveEnabled || !valid) return;
    const timer = setTimeout(() => void saveRef.current(), 1000);
    return () => clearTimeout(timer);
  }, [draft, autosaveEnabled, valid, setStatus]);
  return (
    <div className="event-resource-editor" data-testid="event-resource-editor">
      <EventFields
        value={draft}
        readOnly={!canUpdate}
        onChange={(next) => {
          latest.current = next;
          setDraft(next);
        }}
      />
      {!valid && <p role="alert">{t("calendar.invalidDates")}</p>}
      {(status === "error" || !autosaveEnabled) && canUpdate && (
        <Button data-testid="event-retry-save" disabled={!valid || status === "saving"} onClick={() => void save()}>
          {t("common.save")}
        </Button>
      )}
    </div>
  );
}
