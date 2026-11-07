import { type RecusalLegalBasis, recusalLegalBases } from "@hall/api-contract";
import { type FormEvent, useId, useState } from "react";
import { EntitySelect } from "../../components/search/EntitySelect";
import { Modal, RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
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
  const id = useId();
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
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-member`}>{t("recusal.member")}</Label>
          <EntitySelect
            type="member"
            testId="recusal-member"
            value={memberId}
            onValueChange={setMemberId}
            disabled={controller.submitting}
            placeholder={t("recusal.chooseMember")}
            options={availableMembers.map((member) => ({
              value: member.id,
              label: `${member.contact.firstName} ${member.contact.lastName}`,
            }))}
          />
        </div>
        <fieldset className="grid gap-3" disabled={controller.submitting}>
          <legend>{t("recusal.basis")}</legend>
          {recusalLegalBases.map((value) => (
            <label className="flex items-start gap-2" key={value}>
              <input
                type="radio"
                name="legalBasis"
                data-testid={`recusal-basis-${value}`}
                value={value}
                checked={basis === value}
                onChange={() => setBasis(value)}
                required
              />
              <span>
                <strong>{t(recusalBasisLabel(value))}</strong>
                <span className="block text-sm text-muted-foreground">{t(recusalBasisHint(value))}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <p className="text-sm text-muted-foreground">{t("recusal.immutableHint")}</p>
        <Button
          type="submit"
          data-testid="recusal-submit"
          disabled={!memberId || !basis || !controller.canRecord || controller.submitting}
        >
          {t(controller.submitting ? "common.saving" : "recusal.record")}
        </Button>
      </form>
    </Modal>
  );
}
