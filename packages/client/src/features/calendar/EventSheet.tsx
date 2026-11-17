import { findSirenAction } from "@hall/api-contract";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { Field } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { LoadingIndicator } from "../../components/ui/loading-indicator";
import { Sheet } from "../../components/ui/sheet";
import { useI18n } from "../../i18n/I18nProvider";
import { useSessionControls } from "../../pages/workspace/useSessionControls";
import { SaveFact } from "../../pages/workspace/WorkspaceWorkbenchHeader";
import { useResourceSession } from "../resources/useResourceSession";
import { EventResourceEditor } from "./EventResourceEditor";

// @implements-requirement HALL-FR-CAL-060
// @implements-requirement HALL-FR-CAL-100
/**
 * An appointment opened from the calendar on a phone: the sheet from the bottom with the form of its creation, its
 * subject first, saved as it is written; the calendar stays behind it.
 */
export function EventSheet({
  resourceId,
  onClose,
  onDelete,
}: {
  resourceId: string;
  onClose(): void;
  onDelete(resourceId: string): void;
}) {
  const { t } = useI18n();
  const session = useResourceSession({ resourceId });
  const controls = useSessionControls(session);
  const resource = session.resource?.kind === "event" ? session.resource : null;
  const [name, setName] = useState("");
  const [closing, setClosing] = useState(false);
  const savedName = resource?.name ?? "";
  useEffect(() => {
    setName(savedName);
  }, [savedName]);
  const saveName = async () => {
    const next = name.trim();
    if (!next || next === savedName || !session.capabilities.updateMetadata) return true;
    return session.save(next);
  };
  const close = async () => {
    if (closing) return;
    setClosing(true);
    const saved = (await saveName()) && (await session.flush());
    setClosing(false);
    if (saved) onClose();
  };
  const canDelete = Boolean(
    resource &&
      session.representation &&
      findSirenAction(session.representation, "resource.delete") &&
      Date.parse(resource.document.schedule.end) > Date.now(),
  );
  return (
    <Sheet
      open
      side="bottom"
      onOpenChange={(open) => {
        if (!open) void close();
      }}
      title={savedName || t("workspace.type.event")}
      titleHidden
      testId="calendar-event-sheet"
      closeTestId="calendar-event-sheet-close"
      commands={controls.visible}
      footer={
        canDelete ? (
          <Button
            variant="plain"
            className="hall-sheet-foot-start event-sheet-delete"
            data-testid="calendar-event-sheet-delete"
            onClick={() => onDelete(resourceId)}
          >
            {t("common.delete")}
          </Button>
        ) : undefined
      }
    >
      {controls.save ? (
        <div className="event-sheet-facts">
          <SaveFact save={controls.save} />
        </div>
      ) : null}
      {!resource && !session.detailsFailed ? <LoadingIndicator size="zone" label={t("common.loading")} /> : null}
      {session.detailsFailed ? <p role="alert">{t("common.requestFailed")}</p> : null}
      {session.actionError ? <p role="alert">{t("common.requestFailed")}</p> : null}
      {resource ? (
        <>
          <Field label={t("calendar.title")}>
            <Input
              data-testid="calendar-name"
              required
              readOnly={!session.capabilities.updateMetadata}
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => void saveName()}
            />
          </Field>
          <EventResourceEditor
            key={resource.id}
            resource={resource}
            representation={session.representation}
            canUpdate={session.mode === "edit" && session.capabilities.updateContent}
            autosaveEnabled={session.autosaveEnabled}
            onError={session.setActionError}
            onRegisterFlush={session.registerBodyFlush}
          />
        </>
      ) : null}
    </Sheet>
  );
}
