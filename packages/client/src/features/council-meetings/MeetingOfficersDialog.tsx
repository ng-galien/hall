import {
  type AuxiliaryAttendanceQuality,
  auxiliaryAttendanceQualities,
  type MeetingConductState,
  type MeetingOffice,
} from "@hall/api-contract";
import { type FormEvent, useEffect, useId, useState } from "react";
import { EntitySelect } from "../../components/search/EntitySelect";
import { Modal, RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { useI18n } from "../../i18n/I18nProvider";
import type { CouncilMemberView } from "../../models/directory";
import type { ApiErrorCode } from "../../services/apiClient";
import { useContactsStore } from "../../stores/contactsStore";
import { ConductActionBlockers } from "./ConductActionBlockers";
import { auxiliaryQualityLabel, officeLabel, officerBasisLabel } from "./meetingOfficerPresentation";

const memberName = (members: readonly CouncilMemberView[], id: string | null) => {
  const member = members.find((candidate) => candidate.id === id);
  return member ? `${member.contact.firstName} ${member.contact.lastName}` : "";
};

// @implements-requirement HALL-FR-MTG-330
// @implements-requirement HALL-FR-MTG-340
// @implements-requirement HALL-FR-ATT-140
/** Officer handover and attending persons; the server supplies every admissible choice. */
export function MeetingOfficersDialog({
  conduct,
  members,
  canRecordOfficerChange,
  canDeclareAuxiliaryAttendance,
  error,
  onRecordOfficerChange,
  onDeclareAuxiliaryAttendance,
  onClose,
}: {
  conduct: MeetingConductState;
  members: CouncilMemberView[];
  canRecordOfficerChange: boolean;
  canDeclareAuxiliaryAttendance: boolean;
  error: ApiErrorCode | null;
  onRecordOfficerChange(input: {
    office: MeetingOffice;
    councilMemberId: string;
    observedAt: string;
  }): Promise<boolean>;
  onDeclareAuxiliaryAttendance(input: {
    contactId: string;
    quality: AuxiliaryAttendanceQuality;
    declaredAt: string;
  }): Promise<boolean>;
  onClose(): void;
}) {
  const { t, formatTime } = useI18n();
  const id = useId();
  const [office, setOffice] = useState<MeetingOffice>("chair");
  const [successor, setSuccessor] = useState("");
  const [contactId, setContactId] = useState("");
  const [quality, setQuality] = useState<AuxiliaryAttendanceQuality>();
  const [submitting, setSubmitting] = useState(false);
  const contacts = useContactsStore((state) => state.contacts);
  useEffect(() => {
    if (canDeclareAuxiliaryAttendance) void useContactsStore.getState().load();
  }, [canDeclareAuxiliaryAttendance]);
  const options = conduct.officerHandoverOptions[office];
  const memberContactIds = new Set(members.map((member) => member.contact.id));
  const declaredContactIds = new Set(conduct.auxiliaryAttendances.map((entry) => entry.contactId));
  const attendingCandidates = contacts.filter(
    (contact) => !contact.archivedAt && !memberContactIds.has(contact.id) && !declaredContactIds.has(contact.id),
  );
  const meetingWideChanges = conduct.officerChanges.filter((change) => change.agendaItemId === null);

  const handover = async (event: FormEvent) => {
    event.preventDefault();
    if (!successor || submitting) return;
    setSubmitting(true);
    try {
      if (await onRecordOfficerChange({ office, councilMemberId: successor, observedAt: new Date().toISOString() }))
        setSuccessor("");
    } finally {
      setSubmitting(false);
    }
  };
  const declare = async (event: FormEvent) => {
    event.preventDefault();
    if (!contactId || !quality || submitting) return;
    setSubmitting(true);
    try {
      if (await onDeclareAuxiliaryAttendance({ contactId, quality, declaredAt: new Date().toISOString() })) {
        setContactId("");
        setQuality(undefined);
      }
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
                    setSuccessor("");
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
                label: `${memberName(members, option.councilMemberId)} · ${t(officerBasisLabel(option.basis))}`,
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
        <section className="grid gap-3" data-testid="live-auxiliaries">
          <strong>{t("auxiliary.title")}</strong>
          <p className="text-sm text-muted-foreground">{t("auxiliary.description")}</p>
          {conduct.auxiliaryAttendances.length > 0 ? (
            <ul className="grid gap-1" data-testid="live-auxiliaries-list">
              {conduct.auxiliaryAttendances.map((entry) => (
                <li key={entry.id} data-testid={`live-auxiliary-${entry.contactId}`}>
                  <strong>{entry.name}</strong> · {t(auxiliaryQualityLabel(entry.quality))}
                </li>
              ))}
            </ul>
          ) : (
            <p data-testid="live-auxiliaries-empty">{t("auxiliary.empty")}</p>
          )}
          <form className="grid gap-3" data-testid="live-auxiliaries-form" onSubmit={declare}>
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-contact`}>{t("auxiliary.contact")}</Label>
              <EntitySelect
                type="contact"
                testId="live-auxiliaries-contact"
                value={contactId}
                onValueChange={setContactId}
                disabled={submitting || !canDeclareAuxiliaryAttendance}
                placeholder={t("auxiliary.chooseContact")}
                options={attendingCandidates.map((contact) => ({
                  value: contact.id,
                  label: `${contact.firstName} ${contact.lastName}`,
                }))}
              />
            </div>
            <fieldset className="grid gap-2" disabled={submitting || !canDeclareAuxiliaryAttendance}>
              <legend>{t("auxiliary.quality")}</legend>
              {auxiliaryAttendanceQualities.map((value) => (
                <label className="flex items-center gap-2" key={value}>
                  <input
                    type="radio"
                    name="quality"
                    data-testid={`live-auxiliaries-quality-${value}`}
                    checked={quality === value}
                    onChange={() => setQuality(value)}
                  />
                  {t(auxiliaryQualityLabel(value))}
                </label>
              ))}
            </fieldset>
            <ConductActionBlockers
              action="auxiliary-attendance"
              label="auxiliary.declare"
              blockers={conduct.meetingActionBlockers.declareAuxiliaryAttendance}
            />
            <p className="text-sm text-muted-foreground">{t("auxiliary.immutableHint")}</p>
            <Button
              type="submit"
              data-testid="live-auxiliaries-submit"
              disabled={!contactId || !quality || submitting || !canDeclareAuxiliaryAttendance}
            >
              {t(submitting ? "common.saving" : "auxiliary.declare")}
            </Button>
          </form>
        </section>
      </div>
    </Modal>
  );
}
