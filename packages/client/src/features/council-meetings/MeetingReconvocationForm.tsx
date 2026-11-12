import type { AgendaItem, MeetingQuorumObservation, RecordMeetingReconvocation } from "@hall/api-contract";
import { type FormEvent, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldRow } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal, RequestErrorBanner } from "../../components/Ui";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import type { ApiErrorCode } from "../../services/apiClient";

export function MeetingReconvocationForm({
  observation,
  agendaItems,
  onSubmit,
  error,
  trigger,
}: {
  observation: MeetingQuorumObservation;
  agendaItems: AgendaItem[];
  onSubmit(input: RecordMeetingReconvocation): Promise<boolean>;
  error: ApiErrorCode | null;
  /** Renders the control that opens the form; the roll call uses the default secondary button. */
  trigger?(control: { open(): void; disabled: boolean; label: string }): ReactNode;
}) {
  const { t, formatDateTime } = useI18n();
  const [open, setOpen] = useState(false);
  const { submitting, run } = useSubmitting();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const remainingItems = agendaItems.filter(
    (item) => item.completedAt === null && observation.facts.remainingAgendaItemIds.includes(item.id),
  );
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      const saved = await onSubmit({
        failedObservationId: observation.id,
        sentAt: new Date(String(form.get("sentAt"))).toISOString(),
        scheduledAt: new Date(String(form.get("scheduledAt"))).toISOString(),
        timeZone,
        firstNoticeEvidence: String(form.get("firstNoticeEvidence")),
        renewedNoticeEvidence: String(form.get("renewedNoticeEvidence")),
        agendaItemIds: remainingItems.map((item) => item.id),
      });
      if (saved) setOpen(false);
    });
  };
  return (
    <>
      {trigger ? (
        trigger({
          open: () => setOpen(true),
          disabled: remainingItems.length === 0,
          label: t("meeting.reconveneAction"),
        })
      ) : (
        <Button
          variant="secondary"
          data-testid="live-reconvocation-open"
          disabled={remainingItems.length === 0}
          onClick={() => setOpen(true)}
        >
          {t("meeting.reconveneAction")}
        </Button>
      )}
      <Modal
        open={open}
        title={t("meeting.reconveneAction")}
        hint={t("meeting.reconveneDescription")}
        onClose={() => {
          if (!submitting) setOpen(false);
        }}
      >
        <form className="grid gap-4" data-testid="live-reconvocation-form" onSubmit={submit}>
          <ul className="text-sm text-muted" data-testid="live-reconvocation-agenda">
            {remainingItems.map((item) => (
              <li key={item.id}>{item.title}</li>
            ))}
          </ul>
          <p className="text-sm text-muted">
            {t("meeting.quorumFailureRecordedAt", { date: formatDateTime(observation.observedAt) })}
          </p>
          <RequestErrorBanner error={error} />
          <p className="text-sm text-muted">{t("meeting.reconvocationLocalTime", { zone: timeZone })}</p>
          <FieldRow>
            <Field label={t("meeting.noticeSentAt")}>
              <Input
                name="sentAt"
                type="datetime-local"
                required
                disabled={submitting}
                data-testid="live-reconvocation-sent-at"
              />
            </Field>
            <Field label={t("meetings.dateTime")}>
              <Input
                name="scheduledAt"
                type="datetime-local"
                required
                disabled={submitting}
                data-testid="live-reconvocation-scheduled-at"
              />
            </Field>
          </FieldRow>
          <Field label={t("meeting.firstNoticeEvidence")}>
            <Input
              name="firstNoticeEvidence"
              required
              disabled={submitting}
              data-testid="live-reconvocation-first-evidence"
            />
          </Field>
          <Field label={t("meeting.renewedNoticeEvidence")}>
            <Input
              name="renewedNoticeEvidence"
              required
              disabled={submitting}
              data-testid="live-reconvocation-renewed-evidence"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={submitting}
              data-testid="live-reconvocation-cancel"
              onClick={() => setOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={submitting} data-testid="live-reconvocation-submit">
              {t(submitting ? "common.saving" : "common.save")}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
