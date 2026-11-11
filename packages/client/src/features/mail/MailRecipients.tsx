import type { MailRecipient } from "@hall/api-contract";
import { useState } from "react";
import { ResourceSearchField } from "../../components/search/ResourceSearchField";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useI18n } from "../../i18n/I18nProvider";
import type { MailRecipientSelections } from "../../services/mailApi";

export function MailRecipients({
  kind,
  recipients,
  contacts,
  disabled,
  onChange,
  testId,
}: {
  kind: MailRecipient["kind"];
  recipients: MailRecipient[];
  contacts: MailRecipientSelections["contacts"];
  disabled: boolean;
  onChange(recipients: MailRecipient[]): void;
  testId: string;
}) {
  const { t } = useI18n();
  const [address, setAddress] = useState("");
  const add = (recipient: MailRecipient) => {
    if (
      recipients.some(
        (entry) =>
          entry.kind === kind && entry.address && entry.address.toLowerCase() === recipient.address.toLowerCase(),
      )
    )
      return;
    onChange([...recipients, recipient]);
    setAddress("");
  };
  return (
    <div className="flex flex-wrap items-center gap-2 py-2" data-testid={testId}>
      <span className="w-9 shrink-0 text-sm text-muted-foreground">{t(`mail.${kind}`)}</span>
      {recipients.map((recipient, index) =>
        recipient.kind === kind ? (
          <span
            key={`${recipient.kind}-${recipient.contactId ?? recipient.address}`}
            className="inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-sm"
          >
            <span className="truncate">
              {recipient.name ? `${recipient.name} <${recipient.address || t("mail.noAddress")}>` : recipient.address}
            </span>
            {!disabled ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                data-testid={`${testId}-remove-${index}`}
                aria-label={t("mail.remove")}
                onClick={() => onChange(recipients.filter((_, position) => position !== index))}
              >
                ×
              </Button>
            ) : null}
          </span>
        ) : null,
      )}
      {!disabled ? (
        <>
          <Input
            className="min-w-36 flex-1"
            type="email"
            aria-label={t("mail.address")}
            value={address}
            data-testid={`${testId}-address`}
            placeholder={t("mail.address")}
            onChange={(event) => setAddress(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && address.trim()) {
                event.preventDefault();
                add({ kind, name: "", address: address.trim(), contactId: null });
              }
            }}
            onBlur={() => {
              if (address.trim()) add({ kind, name: "", address: address.trim(), contactId: null });
            }}
          />
          <ResourceSearchField
            testId={`${testId}-contact`}
            label={t("mail.contact")}
            scope={{ types: ["contact"] }}
            onPick={(item) => {
              const contact = contacts.find((candidate) => candidate.contactId === item.id);
              if (contact) add({ ...contact, kind });
            }}
          />
        </>
      ) : null}
    </div>
  );
}
