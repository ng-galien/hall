import { findSirenLink, type ResourceChange, type SirenEntity } from "@hall/api-contract";
import { matchLiteral } from "@hall/domain";
import { useCallback, useEffect, useRef, useState } from "react";
import { RedoIcon } from "../../components/icons";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import { useI18n } from "../../i18n/I18nProvider";
import { subscribeLiveUpdates } from "../../services/liveUpdates";
import { openResourceChanges } from "../../services/resourceChangesApi";
import "./ResourceChangesControl.css";

// @implements-requirement HALL-FR-DOC-280
export function ResourceChangesControl({
  resourceId,
  representation,
  onInvalidated,
}: {
  resourceId: string;
  representation: SirenEntity | null;
  onInvalidated(): void;
}) {
  const { t, formatDateTime } = useI18n();
  const [changes, setChanges] = useState<ResourceChange[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [changeVersion, setChangeVersion] = useState(0);
  const [unseen, setUnseen] = useState(false);
  const currentResource = useRef(resourceId);
  const eventVersion = useRef(0);
  const stale = useRef(true);
  const inFlight = useRef<Promise<void> | null>(null);
  const onInvalidatedRef = useRef(onInvalidated);
  onInvalidatedRef.current = onInvalidated;
  const available = Boolean(representation && findSirenLink(representation, "changes"));

  useEffect(() => {
    currentResource.current = resourceId;
    eventVersion.current = 0;
    stale.current = true;
    inFlight.current = null;
    setChanges(null);
    setFailed(false);
    setOpen(false);
    setUnseen(false);
  }, [resourceId]);

  const loadChanges = useCallback(() => {
    if (!representation || !available || (!stale.current && changes !== null)) return Promise.resolve();
    if (inFlight.current) return inFlight.current;
    const requestedResource = resourceId;
    const requestedVersion = eventVersion.current;
    const request = (async () => {
      setLoading(true);
      setFailed(false);
      try {
        const result = await openResourceChanges(representation);
        if (
          currentResource.current !== requestedResource ||
          result.resourceId !== requestedResource ||
          requestedVersion !== eventVersion.current
        )
          return;
        setChanges(result.changes);
        stale.current = false;
        setUnseen(false);
      } catch {
        if (currentResource.current === requestedResource) setFailed(true);
      } finally {
        if (currentResource.current === requestedResource) setLoading(false);
      }
    })().finally(() => {
      if (inFlight.current === request) inFlight.current = null;
      if (currentResource.current === requestedResource && requestedVersion !== eventVersion.current)
        setChangeVersion((version) => version + 1);
    });
    inFlight.current = request;
    return request;
  }, [available, changes, representation, resourceId]);

  useEffect(() => {
    if (!available) return;
    return subscribeLiveUpdates(
      { kind: "resource", id: resourceId },
      () => {
        eventVersion.current += 1;
        stale.current = true;
        setUnseen(true);
        setChangeVersion((version) => version + 1);
        onInvalidatedRef.current();
      },
      () => {
        eventVersion.current += 1;
        stale.current = true;
        setChangeVersion((version) => version + 1);
        onInvalidatedRef.current();
      },
    );
  }, [available, resourceId]);

  useEffect(() => {
    if (changeVersion >= 0 && open && stale.current) void loadChanges();
  }, [changeVersion, loadChanges, open]);

  if (!available) return null;

  const fieldLabel = (field: ResourceChange["fields"][number]) =>
    t(
      matchLiteral(field, {
        content: () => "resourceChanges.field.content" as const,
        name: () => "resourceChanges.field.name" as const,
        path: () => "resourceChanges.field.path" as const,
        tags: () => "resourceChanges.field.tags" as const,
        autosave: () => "resourceChanges.field.autosave" as const,
      }),
    );
  const kindLabel = (kind: ResourceChange["kind"]) =>
    t(
      matchLiteral(kind, {
        content: () => "resourceChanges.kind.content" as const,
        metadata: () => "resourceChanges.kind.metadata" as const,
        location: () => "resourceChanges.kind.location" as const,
      }),
    );
  const detail = (change: ResourceChange) =>
    change.fields.length ? change.fields.map(fieldLabel).join(", ") : kindLabel(change.kind);
  const latest = changes?.[0];

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="resource-changes-trigger"
            data-testid="resource-changes-trigger"
            data-unseen={unseen}
            type="button"
            aria-label={t("resourceChanges.open")}
            onPointerEnter={() => void loadChanges()}
            onFocus={() => void loadChanges()}
            onClick={() => {
              setOpen(true);
              void loadChanges();
            }}
          >
            <RedoIcon aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent data-testid="resource-changes-preview" side="bottom" className="resource-changes-preview">
          {loading && !latest
            ? t("resourceChanges.loading")
            : failed
              ? t("resourceChanges.error")
              : latest
                ? `${latest.actor.displayName} · ${detail(latest)} · ${formatDateTime(latest.occurredAt)}`
                : t("resourceChanges.empty")}
        </TooltipContent>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          placement="right"
          className="resource-changes-panel"
          data-testid="resource-changes-panel"
          closeLabel={t("common.close")}
        >
          <header className="resource-changes-panel-heading">
            <DialogTitle>{t("resourceChanges.title")}</DialogTitle>
            <DialogDescription>{t("resourceChanges.description")}</DialogDescription>
          </header>
          {loading && !changes ? <p role="status">{t("resourceChanges.loading")}</p> : null}
          {failed ? <p role="alert">{t("resourceChanges.error")}</p> : null}
          {!loading && !failed && changes?.length === 0 ? <p>{t("resourceChanges.empty")}</p> : null}
          {changes && changes.length > 0 ? (
            <ol className="resource-changes-list" data-testid="resource-changes-list">
              {changes.map((change) => (
                <li key={change.actor.id} data-testid="resource-changes-item">
                  <strong>{change.actor.displayName}</strong>
                  <span>{detail(change)}</span>
                  <time dateTime={change.occurredAt}>{formatDateTime(change.occurredAt)}</time>
                </li>
              ))}
            </ol>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
