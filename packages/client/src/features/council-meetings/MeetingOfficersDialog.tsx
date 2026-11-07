import type { MeetingConductState, MeetingOffice } from "@hall/api-contract";
import { type FormEvent, useId, useState } from "react";
import { EntitySelect } from "../../components/search/EntitySelect";
import { Modal, RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { useI18n } from "../../i18n/I18nProvider";
import type { CouncilMemberView } from "../../models/directory";
import type { ApiErrorCode } from "../../services/apiClient";
import { ConductActionBlockers } from "./ConductActionBlockers";
import { officeLabel, officerBasisLabel } from "./meetingOfficerPresentation";

const memberName = (members: readonly CouncilMemberView[], id: string | null) => {
  const member = members.find((candidate) => candidate.id === id);
  return member ? `${member.contact.firstName} ${member.contact.lastName}` : "";
};

// @implements-requirement HALL-FR-MTG-330
// @implements-requirement HALL-FR-MTG-340
/** Handover form of the chair and the secretary; the server supplies every admissible choice. */
export function MeetingOfficersDialog({
  conduct,
  members,
  canRecordOfficerChange,
  error,
  onRecordOfficerChange,
  onClose,
}: {
  conduct: MeetingConductState;
  members: CouncilMemberView[];
  canRecordOfficerChange: boolean;
  error: ApiErrorCode | null;
  onRecordOfficerChange(input: { office: MeetingOffice; councilMemberId: string }): Promise<boolean>;
  onClose(): void;
}) {
  const { t, formatTime } = useI18n();
  const id = useId();
  const [office, setOffice] = useState<MeetingOffice>("chair");
  const [successor, setSuccessor] = useState(conduct.officerHandoverOptions.proposedChairMemberId ?? "");
  const [submitting, setSubmitting] = useState(false);
  const options = conduct.officerHandoverOptions[office];
  const meetingWideChanges = conduct.officerChanges;
  const proposedChair = conduct.officerHandoverOptions.proposedChairMemberId;

  const handover = async (event: FormEvent) => {
    event.preventDefault();
    if (!successor || submitting) return;
    setSubmitting(true);
    try {
      if (await onRecordOfficerChange({ office, councilMemberId: successor })) setSuccessor("");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Modal open title={t("officers.title")} onClose={() => !submitting && onClose()} testId="live-officers-dialog">
      <div className="modal-form" data-testid="live-officers">
        <RequestErrorBanner error={error} />
        <dl className="report-roll-call" data-testid="live-officers-current">
          <div>
            <dt>{t("officers.currentChair")}</dt>
            <dd data-testid="live-officers-current-chair">
              {memberName(members, conduct.currentOfficers.chairMemberId)}
            </dd>
          </div>
          <div>
            <dt>{t("officers.currentSecretary")}</dt>
            <dd data-testid="live-officers-current-secretary">
              {memberName(members, conduct.currentOfficers.secretaryMemberId)}
            </dd>
          </div>
        </dl>
        {meetingWideChanges.length > 0 ? (
          <ul className="grid gap-1" data-testid="live-officers-history">
            {meetingWideChanges.map((change) => (
              <li key={change.id} data-testid={`live-officers-change-${change.id}`}>
                {formatTime(change.observedAt)} · {t(officeLabel(change.office))} · <strong>{change.memberName}</strong>{" "}
                · {t(officerBasisLabel(change.basis))}
              </li>
            ))}
          </ul>
        ) : null}
        <form className="grid gap-3" data-testid="live-officers-handover" onSubmit={handover}>
          <strong>{t("officers.handoverTitle")}</strong>
          <fieldset className="flex gap-4" disabled={submitting || !canRecordOfficerChange}>
            {(["chair", "secretary"] as const).map((value) => (
              <label className="flex items-center gap-2" key={value}>
                <input
                  type="radio"
                  name="office"
                  data-testid={`live-officers-office-${value}`}
                  checked={office === value}
                  onChange={() => {
                    setOffice(value);
                    setSuccessor(value === "chair" ? (proposedChair ?? "") : "");
                  }}
                />
                {t(officeLabel(value))}
              </label>
            ))}
          </fieldset>
          <p className="text-sm text-muted-foreground">
            {t(office === "chair" ? "officers.chairRule" : "officers.secretaryRule")}
          </p>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-successor`}>{t("officers.successor")}</Label>
            <EntitySelect
              type="member"
              testId="live-officers-successor"
              value={successor}
              onValueChange={setSuccessor}
              disabled={submitting || !canRecordOfficerChange || options.length === 0}
              placeholder={t(options.length === 0 ? "officers.noCandidate" : "officers.chooseSuccessor")}
              options={options.map((option) => ({
                value: option.councilMemberId,
                label:
                  option.basis === "mayor"
                    ? `${memberName(members, option.councilMemberId)} · ${t(officerBasisLabel(option.basis))}`
                    : office === "chair" && option.councilMemberId === proposedChair
                      ? `${memberName(members, option.councilMemberId)} · ${t("officers.proposed")}`
                      : memberName(members, option.councilMemberId),
              }))}
            />
          </div>
          <ConductActionBlockers
            action="officer-change"
            label="officers.handoverTitle"
            blockers={conduct.meetingActionBlockers.recordOfficerChange}
          />
          <Button
            type="submit"
            data-testid="live-officers-handover-submit"
            disabled={!successor || submitting || !canRecordOfficerChange}
          >
            {t(submitting ? "common.saving" : "officers.handoverAction")}
          </Button>
        </form>
      </div>
    </Modal>
  );
}
