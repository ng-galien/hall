import { useEffect, useId, useRef, useState } from "react";
import { Modal, RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { ContextMenuItem } from "../../components/ui/context-menu";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { useI18n } from "../../i18n/I18nProvider";
import { apiErrorCode, type ApiErrorCode } from "../../services/apiClient";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import { resourceCapabilities } from "./resourceCapabilities";

/** Rename only the resource name, preserving its location and editing preferences. */
export function useResourceRename({
  resourceId,
  testId,
  onRenamed,
}: {
  resourceId: string;
  testId: string;
  onRenamed?(): void | Promise<void>;
}) {
  const { t } = useI18n();
  const representation = useWorkspaceResourcesStore((state) => state.representations[resourceId]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!representation) void useWorkspaceResourcesStore.getState().open(resourceId);
  }, [resourceId, representation]);
  const canRename = resourceCapabilities(representation ?? null).updateMetadata;
  return {
    menuItem: canRename ? (
      <ContextMenuItem
        data-testid={testId}
        onSelect={() => {
          setName(useWorkspaceResourcesStore.getState().details[resourceId]?.name ?? "");
          setError(null);
          setOpen(true);
        }}
      >
        {t("common.rename")}
      </ContextMenuItem>
    ) : null,
    dialog: (
      <Modal
        open={open}
        title={t("common.rename")}
        testId={`${testId}-dialog`}
        initialFocusRef={inputRef}
        onClose={() => {
          if (!active.current) setOpen(false);
        }}
      >
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (active.current || !name.trim()) return;
            active.current = true;
            setBusy(true);
            setError(null);
            void (async () => {
              try {
                const store = useWorkspaceResourcesStore.getState();
                const current = store.details[resourceId];
                if (!current) {
                  setError("request_failed");
                  return;
                }
                const updated = await store.updateMetadata(resourceId, {
                  name: name.trim(),
                  path: current.path,
                  tags: current.tags,
                  editing:
                    "autosaveEnabled" in current
                      ? { kind: "autosave", enabled: current.autosaveEnabled }
                      : { kind: "fixed" },
                });
                if (!updated) {
                  setError(useWorkspaceResourcesStore.getState().error ?? "request_failed");
                  return;
                }
                await onRenamed?.();
                setOpen(false);
              } catch (failure) {
                setError(apiErrorCode(failure));
              } finally {
                active.current = false;
                setBusy(false);
              }
            })();
          }}
        >
          <RequestErrorBanner error={error} />
          <div className="grid gap-1.5">
            <Label htmlFor={inputId}>{t("workspace.creationName")}</Label>
            <Input
              id={inputId}
              ref={inputRef}
              data-testid={`${testId}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={busy}
              required
              autoFocus
            />
          </div>
          <Button
            type="submit"
            className="justify-self-end"
            data-testid={`${testId}-submit`}
            disabled={busy || !name.trim()}
          >
            {t(busy ? "common.saving" : "common.rename")}
          </Button>
        </form>
      </Modal>
    ),
  };
}
