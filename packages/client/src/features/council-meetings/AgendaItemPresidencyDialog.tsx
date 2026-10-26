import type { AgendaItemPresidencyBasis } from "@hall/api-contract";
import { type FormEvent, useId, useState } from "react";
import { EntitySelect } from "../../components/search/EntitySelect";
import { Modal, RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import type { useAgendaItemRecusals } from "../../hooks/useAgendaItemRecusals";
import { useI18n } from "../../i18n/I18nProvider";
import type { CouncilMemberView } from "../../models/directory";
import { presidencyBasisLabel } from "./meetingOfficerPresentation";

// @implements-requirement HALL-FR-BAL-330
/** Records the presidency of one item among the bases and members the server admits. */
export function AgendaItemPresidencyDialog({
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
  const options = controller.state?.presidencyOptions ?? { financialStatementElection: [], councilDesignation: [] };
  const bases = (["financialStatementElection", "councilDesignation"] as const).filter(
    (basis) => options[basis].length > 0,
  );
  const [basis, setBasis] = useState<AgendaItemPresidencyBasis | undefined>(bases.length === 1 ? bases[0] : undefined);
  const [memberId, setMemberId] = useState("");
  const candidates = basis ? options[basis] : [];
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!basis || !memberId) return;
    if (await controller.recordPresidency({ councilMemberId: memberId, basis, observedAt: new Date().toISOString() }))
      onClose();
  };
  return (
    <Modal open title={t("presidency.title")} onClose={() => !controller.submitting && onClose()}>
      <form className="modal-form" data-testid="presidency-form" onSubmit={submit}>
        <RequestErrorBanner error={controller.error} />
        <fieldset className="grid gap-3" disabled={controller.submitting}>
          <legend>{t("presidency.basis")}</legend>
          {bases.map((value) => (
            <label className="flex items-start gap-2" key={value}>
              <input
                type="radio"
                name="presidencyBasis"
                data-testid={`presidency-basis-${value}`}
                checked={basis === value}
                onChange={() => {
                  setBasis(value);
                  setMemberId("");
                }}
              />
              <span>
                <strong>{t(presidencyBasisLabel(value))}</strong>
                <span className="block text-sm text-muted-foreground">
                  {t(value === "financialStatementElection" ? "presidency.electionHint" : "presidency.designationHint")}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-member`}>{t("presidency.member")}</Label>
          <EntitySelect
            type="member"
            testId="presidency-member"
            value={memberId}
            onValueChange={setMemberId}
            disabled={controller.submitting || !basis}
            placeholder={t("presidency.chooseMember")}
            options={candidates.map((candidate) => {
              const member = members.find((entry) => entry.id === candidate);
              return {
                value: candidate,
                label: member ? `${member.contact.firstName} ${member.contact.lastName}` : candidate,
              };
            })}
          />
        </div>
        <p className="text-sm text-muted-foreground">{t("presidency.immutableHint")}</p>
        <Button
          type="submit"
          data-testid="presidency-submit"
          disabled={!basis || !memberId || !controller.canRecordPresidency || controller.submitting}
        >
          {t(controller.submitting ? "common.saving" : "presidency.record")}
        </Button>
      </form>
    </Modal>
  );
}
