import { type EventDocument, eventDocumentSchema } from "@hall/api-contract";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Field } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { Sheet } from "../../components/ui/sheet";
import { useI18n } from "../../i18n/I18nProvider";
import { usePhoneLayout } from "../../shell/usePhoneLayout";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import { EventFields } from "./EventFields";
import { eventDocumentUsesQuarterHours } from "./eventDates";

// @implements-requirement HALL-FR-CAL-050
// @implements-requirement HALL-FR-CAL-070
// @implements-requirement HALL-FR-CAL-100
/**
 * The creation of an appointment: a sheet from the bottom on a phone, a panel at the right edge on a large screen,
 * the calendar visible behind it. Closing it, by its button, by pulling it down or by Escape, creates nothing.
 */
export function EventCreateSheet({
  initial,
  onClose,
  onFailed,
}: {
  initial: EventDocument | null;
  onClose(): void;
  onFailed(): void;
}) {
  const { t } = useI18n();
  const phone = usePhoneLayout();
  const resources = useWorkspaceResourcesStore();
  const businesses = useCouncilBusinessStore((state) => state.businesses);
  const [draft, setDraft] = useState<EventDocument | null>(initial);
  const [opened, setOpened] = useState(initial);
  const [name, setName] = useState("");
  const [councilBusinessId, setCouncilBusinessId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (initial !== opened) {
    setOpened(initial);
    setDraft(initial);
    setName("");
    setCouncilBusinessId(null);
  }
  const submit = async () => {
    if (saving || !draft) return;
    setSaving(true);
    const business = businesses.find((entry) => entry.id === councilBusinessId);
    const created = await resources.create({
      kind: "event",
      path: business?.folderPath ?? "",
      name,
      document: draft,
      ...(councilBusinessId ? { councilBusinessId } : {}),
    });
    setSaving(false);
    if (created) {
      if (councilBusinessId) await useCouncilBusinessStore.getState().loadResources(councilBusinessId);
      onClose();
    } else onFailed();
  };
  const formId = "calendar-create-form";
  return (
    <Sheet
      open={draft !== null}
      side={phone ? "bottom" : "right"}
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
      title={t("workspace.createEvent")}
      testId="calendar-create-sheet"
      footer={
        <>
          <Button variant="secondary" data-testid="calendar-cancel" disabled={saving} onClick={onClose}>
            {t("calendar.cancel")}
          </Button>
          <Button
            type="submit"
            form={formId}
            data-testid="calendar-create"
            disabled={
              saving ||
              !draft ||
              !name.trim() ||
              !eventDocumentSchema.safeParse(draft).success ||
              !eventDocumentUsesQuarterHours(draft)
            }
          >
            {t("calendar.create")}
          </Button>
        </>
      }
    >
      {draft ? (
        <form
          id={formId}
          className="modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Field label={t("calendar.title")}>
            <Input
              data-testid="calendar-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <EventFields
            value={draft}
            onChange={setDraft}
            councilBusinessId={councilBusinessId}
            onCouncilBusinessChange={setCouncilBusinessId}
            readOnly={saving}
          />
        </form>
      ) : null}
    </Sheet>
  );
}
