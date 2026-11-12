import { type RecusalLegalBasis, recusalLegalBases } from "@hall/api-contract";
import { type FormEvent, useState } from "react";
import { EntitySelect } from "../../components/search/EntitySelect";
import { Modal, RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { Field } from "../../components/ui/field";
import type { useAgendaItemRecusals } from "../../hooks/useAgendaItemRecusals";
import { useI18n } from "../../i18n/I18nProvider";
import type { CouncilMemberView } from "../../models/directory";
import { recusalBasisHint, recusalBasisLabel } from "./recusalPresentation";

export function AgendaItemRecusalDialog({
  controller,
  members,
  onClose,
}: {
  controller: ReturnType<typeof useAgendaItemRecusals>;
  members: CouncilMemberView[];
  onClose(): void;
}) {
  const { t } = useI18n();
  const [memberId, setMemberId] = useState("");
  const [basis, setBasis] = useState<RecusalLegalBasis>();
  const availableMembers = members.filter(
    (member) => !controller.state?.recusals.some((entry) => entry.councilMemberId === member.id),
  );
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!memberId || !basis) return;
    if (await controller.record({ councilMemberId: memberId, legalBasis: basis })) onClose();
  };
  return (
    <Modal
      open
      title={t("recusal.title")}
      onClose={() => {
        if (!controller.submitting) onClose();
      }}
    >
      <form className="modal-form" data-testid="recusal-form" onSubmit={submit}>
        <p>{t("recusal.description")}</p>
        <RequestErrorBanner error={controller.error} />
        <Field label={t("recusal.member")}>
          <EntitySelect
            type="member"
            testId="recusal-member"
            value={memberId}
            onValueChange={setMemberId}
            disabled={controller.submitting}
            options={availableMembers.map((member) => ({
              value: member.id,
              label: `${member.contact.firstName} ${member.contact.lastName}`,
            }))}
          />
        </Field>
        <fieldset className="choice-group" disabled={controller.submitting}>
          <legend className="choice-group-label">{t("recusal.basis")}</legend>
          {recusalLegalBases.map((value) => (
            <label className="choice-option" key={value}>
              <input
                type="radio"
                name="legalBasis"
                data-testid={`recusal-basis-${value}`}
                value={value}
                checked={basis === value}
                onChange={() => setBasis(value)}
                required
              />
              <span className="choice-option-text">
                <strong>{t(recusalBasisLabel(value))}</strong>
                <span className="choice-option-hint">{t(recusalBasisHint(value))}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <p className="modal-form-note">{t("recusal.immutableHint")}</p>
        <div className="dialog-actions">
          <Button
            type="submit"
            data-testid="recusal-submit"
            disabled={!memberId || !basis || !controller.canRecord || controller.submitting}
          >
            {t(controller.submitting ? "common.saving" : "recusal.record")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
