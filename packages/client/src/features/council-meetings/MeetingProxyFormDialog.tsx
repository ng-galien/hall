import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldRow } from "@/components/ui/field";
import { EntitySelect } from "../../components/search/EntitySelect";
import { Modal } from "../../components/Ui";
import { useI18n } from "../../i18n/I18nProvider";
import { useCouncilMembersStore } from "../../stores/councilMembersStore";

// @implements-requirement HALL-FR-ATT-180
/** Proxy form choice: grantor and holder are both required; the result is a PDF address, nothing is recorded. */
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
  const [grantor, setGrantor] = useState("");
  const [holder, setHolder] = useState("");
  const options = members
    .filter((member) => member.active)
    .map((member) => ({ value: member.id, label: `${member.contact.firstName} ${member.contact.lastName}` }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!grantor || !holder || grantor === holder) return;
    const query = new URLSearchParams({ grantorMemberId: grantor, holderMemberId: holder });
    onGenerate(`${proxyFormHref}?${query}`);
  };

  return (
    <Modal open={open} title={t("meeting.proxyForm")} onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <FieldRow>
          <Field label={t("meeting.proxyFormGrantor")}>
            <EntitySelect
              type="member"
              value={grantor}
              onValueChange={(value) => {
                setGrantor(value);
                if (value === holder) setHolder("");
              }}
              testId="meeting-proxy-grantor"
              options={options}
            />
          </Field>
          <Field label={t("meeting.proxyFormHolder")}>
            <EntitySelect
              type="member"
              value={holder}
              onValueChange={setHolder}
              testId="meeting-proxy-holder"
              options={options.filter((option) => option.value !== grantor)}
            />
          </Field>
        </FieldRow>
        <Button
          className="justify-self-end"
          data-testid="meeting-proxy-form-submit"
          type="submit"
          disabled={!grantor || !holder || grantor === holder}
        >
          {t("meeting.proxyFormGenerate")}
        </Button>
      </form>
    </Modal>
  );
}
