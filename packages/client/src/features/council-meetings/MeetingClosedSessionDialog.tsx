import type { RecordMeetingClosedSession } from "@hall/api-contract";
import { type FormEvent, useId, useState } from "react";
import { Modal, RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { useI18n } from "../../i18n/I18nProvider";
import type { CouncilMemberView } from "../../models/directory";
import type { ApiErrorCode } from "../../services/apiClient";

// @implements-requirement HALL-FR-MTG-350
/** Records a closed session: who requested it, the vote without debate and the items concerned. */
export function MeetingClosedSessionDialog({
  presentMembers,
  presentOrRepresentedCount,
  openItems,
  error,
  onRecord,
  onClose,
}: {
  presentMembers: readonly CouncilMemberView[];
  presentOrRepresentedCount: number;
  openItems: readonly { id: string; label: string }[];
  error: ApiErrorCode | null;
  onRecord(input: RecordMeetingClosedSession): Promise<boolean>;
  onClose(): void;
}) {
  const { t, formatNumber } = useI18n();
  const id = useId();
  const mayor = presentMembers.find((member) => member.role === "mayor") ?? null;
  const [requestedBy, setRequestedBy] = useState<"mayor" | "members">(mayor ? "mayor" : "members");
  const [requesters, setRequesters] = useState<string[]>([]);
  const [approvals, setApprovals] = useState("");
  const [wholeMeeting, setWholeMeeting] = useState(true);
  const [itemIds, setItemIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const approvalCount = Number.parseInt(approvals, 10);
  const requesterIds = requestedBy === "mayor" ? (mayor ? [mayor.id] : []) : requesters;
  const ready =
    (requestedBy === "mayor" ? Boolean(mayor) : requesters.length === 3) &&
    Number.isInteger(approvalCount) &&
    approvalCount >= 0 &&
    (wholeMeeting || itemIds.length > 0);
  const toggle = (values: string[], value: string) =>
    values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || submitting) return;
    setSubmitting(true);
    try {
      const saved = await onRecord({
        requesterMemberIds: requesterIds,
        approvals: approvalCount,
        scope: wholeMeeting ? { kind: "wholeMeeting" } : { kind: "agendaItems", agendaItemIds: itemIds },
      });
      if (saved) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      title={t("closedSession.title")}
      onClose={() => !submitting && onClose()}
      testId="live-closed-session-dialog"
    >
      <form className="modal-form" data-testid="live-closed-session-form" onSubmit={submit}>
        <RequestErrorBanner error={error} />
        <p className="text-sm text-muted-foreground">{t("closedSession.description")}</p>
        <fieldset className="grid gap-2" disabled={submitting}>
          <legend>{t("closedSession.requestedBy")}</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="closedSessionRequest"
              data-testid="live-closed-session-request-mayor"
              disabled={!mayor}
              checked={requestedBy === "mayor"}
              onChange={() => setRequestedBy("mayor")}
            />
            {mayor
              ? t("closedSession.mayor", { name: `${mayor.contact.firstName} ${mayor.contact.lastName}` })
              : t("closedSession.mayorAbsent")}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="closedSessionRequest"
              data-testid="live-closed-session-request-members"
              checked={requestedBy === "members"}
              onChange={() => setRequestedBy("members")}
            />
            {t("closedSession.threeMembers")}
          </label>
          {requestedBy === "members" ? (
            <div className="grid gap-1 pl-6">
              {presentMembers.map((member) => (
                <label className="flex items-center gap-2" key={member.id}>
                  <input
                    type="checkbox"
                    data-testid={`live-closed-session-requester-${member.id}`}
                    checked={requesters.includes(member.id)}
                    disabled={!requesters.includes(member.id) && requesters.length >= 3}
                    onChange={() => setRequesters((current) => toggle(current, member.id))}
                  />
                  {member.contact.firstName} {member.contact.lastName}
                </label>
              ))}
            </div>
          ) : null}
        </fieldset>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-approvals`}>{t("closedSession.approvals")}</Label>
          <Input
            id={`${id}-approvals`}
            data-testid="live-closed-session-approvals"
            type="number"
            min={0}
            max={presentOrRepresentedCount}
            value={approvals}
            disabled={submitting}
            onChange={(event) => setApprovals(event.currentTarget.value)}
          />
          <p className="text-sm text-muted-foreground">
            {t("closedSession.majorityHint", {
              count: formatNumber(presentOrRepresentedCount),
              required: formatNumber(Math.floor(presentOrRepresentedCount / 2) + 1),
            })}
          </p>
        </div>
        <fieldset className="grid gap-2" disabled={submitting}>
          <legend>{t("closedSession.scope")}</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="closedSessionScope"
              data-testid="live-closed-session-scope-whole"
              checked={wholeMeeting}
              onChange={() => setWholeMeeting(true)}
            />
            {t("closedSession.wholeMeeting")}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="closedSessionScope"
              data-testid="live-closed-session-scope-items"
              checked={!wholeMeeting}
              onChange={() => setWholeMeeting(false)}
            />
            {t("closedSession.someItems")}
          </label>
          {!wholeMeeting ? (
            <div className="grid gap-1 pl-6">
              {openItems.map((item) => (
                <label className="flex items-center gap-2" key={item.id}>
                  <input
                    type="checkbox"
                    data-testid={`live-closed-session-item-${item.id}`}
                    checked={itemIds.includes(item.id)}
                    onChange={() => setItemIds((current) => toggle(current, item.id))}
                  />
                  {item.label}
                </label>
              ))}
            </div>
          ) : null}
        </fieldset>
        <Button type="submit" data-testid="live-closed-session-submit" disabled={!ready || submitting}>
          {t(submitting ? "common.saving" : "closedSession.record")}
        </Button>
      </form>
    </Modal>
  );
}
