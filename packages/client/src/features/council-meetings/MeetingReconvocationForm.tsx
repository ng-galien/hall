import type { AgendaItem, MeetingQuorumObservation, RecordMeetingReconvocation } from "@hall/api-contract";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal, RequestErrorBanner } from "../../components/Ui";
import type { ApiErrorCode } from "../../services/apiClient";
import { useI18n } from "../../i18n/I18nProvider";
import { useSubmitting } from "../../hooks/useSubmitting";

export function MeetingReconvocationForm({
  observation,
  agendaItems,
  onSubmit,
  error,
}: {
  observation: MeetingQuorumObservation;
  agendaItems: AgendaItem[];
  onSubmit(input: RecordMeetingReconvocation): Promise<boolean>;
  error: ApiErrorCode | null;
}) {
  const { t, formatDateTime } = useI18n();
  const [open, setOpen] = useState(false);
  const { submitting, run } = useSubmitting();
  const prefix = useId();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const remainingItems = agendaItems.filter((item) => item.completedAt === null && observation.facts.remainingAgendaItemIds.includes(item.id));
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
      <Button variant="outline" data-testid="live-reconvocation-open" disabled={remainingItems.length === 0} onClick={() => setOpen(true)}>
        {t("meeting.reconveneAction")}
      </Button>
      <Modal
        open={open}
        title={t("meeting.reconveneAction")}
        onClose={() => {
          if (!submitting) setOpen(false);
        }}
      >
        <form className="grid gap-4" data-testid="live-reconvocation-form" onSubmit={submit}>
          <p>{t("meeting.reconveneDescription")}</p>
          <ul className="text-sm text-muted" data-testid="live-reconvocation-agenda">{remainingItems.map((item) => <li key={item.id}>{item.title}</li>)}</ul>
          <p className="text-sm text-muted">
            {t("meeting.quorumFailureRecordedAt").replace("{date}", formatDateTime(observation.observedAt))}
          </p>
          <RequestErrorBanner error={error} />
          <p className="text-sm text-muted">{t("meeting.reconvocationLocalTime").replace("{zone}", timeZone)}</p>
          <div className="grid gap-1.5">
            <Label htmlFor={`${prefix}-sent`}>{t("meeting.noticeSentAt")}</Label>
            <Input
              id={`${prefix}-sent`}
              name="sentAt"
              type="datetime-local"
              required
              disabled={submitting}
              data-testid="live-reconvocation-sent-at"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${prefix}-scheduled`}>{t("meetings.dateTime")}</Label>
            <Input
              id={`${prefix}-scheduled`}
              name="scheduledAt"
              type="datetime-local"
              required
              disabled={submitting}
              data-testid="live-reconvocation-scheduled-at"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${prefix}-first`}>{t("meeting.firstNoticeEvidence")}</Label>
            <Input
              id={`${prefix}-first`}
              name="firstNoticeEvidence"
              required
              disabled={submitting}
              data-testid="live-reconvocation-first-evidence"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${prefix}-renewed`}>{t("meeting.renewedNoticeEvidence")}</Label>
            <Input
              id={`${prefix}-renewed`}
              name="renewedNoticeEvidence"
              required
              disabled={submitting}
              data-testid="live-reconvocation-renewed-evidence"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
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
