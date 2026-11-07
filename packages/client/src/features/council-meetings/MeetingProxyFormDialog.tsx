import { type FormEvent, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EntitySelect } from "../../components/search/EntitySelect";
import { Modal } from "../../components/Ui";
import { useI18n } from "../../i18n/I18nProvider";
import { useCouncilMembersStore } from "../../stores/councilMembersStore";

// @implements-requirement HALL-FR-ATT-180
/** Proxy form choice: the grantor is required, the holder optional; the result is a PDF address, nothing is recorded. */
export function MeetingProxyFormDialog({
  open,
  proxyFormHref,
  onClose,
  onGenerate,
}: {
  open: boolean;
  proxyFormHref: string;
  onClose(): void;
  onGenerate(href: string): void;
}) {
  const { t } = useI18n();
  const { members } = useCouncilMembersStore();
  const fieldId = useId();
  const [grantor, setGrantor] = useState("");
  const [holder, setHolder] = useState("");
  const options = members
    .filter((member) => member.active)
    .map((member) => ({ value: member.id, label: `${member.contact.firstName} ${member.contact.lastName}` }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!grantor || grantor === holder) return;
    const query = new URLSearchParams({ grantorMemberId: grantor, ...(holder ? { holderMemberId: holder } : {}) });
    onGenerate(`${proxyFormHref}?${query}`);
  };

  return (
    <Modal open={open} title={t("meeting.proxyForm")} onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <div className="form-grid">
          <div className="grid gap-1.5">
            <Label htmlFor={`${fieldId}-grantor`}>{t("meeting.proxyFormGrantor")}</Label>
            <EntitySelect
              type="member"
              value={grantor}
              onValueChange={(value) => {
                setGrantor(value);
                if (value === holder) setHolder("");
              }}
              testId="meeting-proxy-grantor"
              placeholder={t("meeting.proxyFormGrantorPlaceholder")}
              options={options}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${fieldId}-holder`}>{t("meeting.proxyFormHolder")}</Label>
            <EntitySelect
              type="member"
              value={holder}
              onValueChange={setHolder}
              testId="meeting-proxy-holder"
              placeholder={t("meeting.proxyFormHolderPlaceholder")}
              options={options.filter((option) => option.value !== grantor)}
              clearLabel={t("meeting.proxyFormHolderClear")}
            />
          </div>
        </div>
        <Button
          className="justify-self-end"
          data-testid="meeting-proxy-form-submit"
          type="submit"
          disabled={!grantor || grantor === holder}
        >
          {t("meeting.proxyFormGenerate")}
        </Button>
      </form>
    </Modal>
  );
}
