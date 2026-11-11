import { useEffect, useRef, useState } from "react";
import { Modal, RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { ContextMenuItem } from "../../components/ui/context-menu";
import { DropdownMenuItem } from "../../components/ui/dropdown-menu";
import { Field } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
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
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!representation) void useWorkspaceResourcesStore.getState().open(resourceId);
  }, [resourceId, representation]);
  const canRename = resourceCapabilities(representation ?? null).updateMetadata;
  const openRename = () => {
    setName(useWorkspaceResourcesStore.getState().details[resourceId]?.name ?? "");
    setError(null);
    setOpen(true);
  };
  const commit = async (nextName: string): Promise<boolean> => {
    if (active.current || !nextName.trim()) return false;
    active.current = true;
    setBusy(true);
    setError(null);
    try {
      const store = useWorkspaceResourcesStore.getState();
      const current = store.details[resourceId];
      if (!current) {
        setError("request_failed");
        return false;
      }
      const updated = await store.updateMetadata(resourceId, {
        name: nextName.trim(),
        path: current.path,
        tags: current.tags,
        editing:
          "autosaveEnabled" in current ? { kind: "autosave", enabled: current.autosaveEnabled } : { kind: "fixed" },
      });
      if (!updated) {
        setError(useWorkspaceResourcesStore.getState().error ?? "request_failed");
        useWorkspaceResourcesStore.setState({ error: null });
        return false;
      }
      await onRenamed?.();
      return true;
    } catch (failure) {
      setError(apiErrorCode(failure));
      return false;
    } finally {
      active.current = false;
      setBusy(false);
    }
  };
  return {
    canRename,
    commit,
    error,
    dismissError: () => setError(null),
    menuItem: canRename ? (
      <ContextMenuItem data-testid={testId} onSelect={openRename}>
        {t("common.rename")}
      </ContextMenuItem>
    ) : null,
    dropdownMenuItem: canRename ? (
      <DropdownMenuItem data-testid={testId} onSelect={openRename}>
        {t("common.rename")}
      </DropdownMenuItem>
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
            void (async () => {
              if (await commit(name)) setOpen(false);
            })();
          }}
        >
          <RequestErrorBanner error={error} />
          <Field label={t("workspace.creationName")}>
            <Input
              ref={inputRef}
              data-testid={`${testId}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={busy}
              required
              autoFocus
            />
          </Field>
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
