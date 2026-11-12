import type { MailRecipient } from "@hall/api-contract";
import { type KeyboardEvent, type ReactNode, useId, useState } from "react";
import { CloseIcon, MemberIcon, MembersIcon, SettingsIcon } from "../../components/icons";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/I18nProvider";
import type { MailRecipientSelections } from "../../services/mailApi";
import { addRecipients, displayRecipients, type RecipientGroup } from "./mailFolders";

type Suggestion =
  | { kind: "group"; key: string; group: RecipientGroup }
  | { kind: "contact"; key: string; contact: MailRecipientSelections["contacts"][number] }
  | { kind: "address"; key: string; address: string }
  | { kind: "manage"; key: string };

const contactLimit = 8;

function matches(text: string, query: string) {
  return text.toLocaleLowerCase("fr").includes(query.toLocaleLowerCase("fr"));
}

/** One recipient written as a rectangular label, with the control that removes it. */
function RecipientLabel({
  icon,
  children,
  removeLabel,
  testId,
  missing,
  onRemove,
}: {
  icon: ReactNode;
  children: ReactNode;
  removeLabel: string;
  testId: string;
  missing?: boolean;
  onRemove?: () => void;
}) {
  return (
    <span className="mail-recipient" data-testid={testId} data-missing={missing ? "true" : undefined}>
      <span className="mail-recipient-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="mail-recipient-name">{children}</span>
      {onRemove ? (
        <Button
          variant="plain"
          size="icon"
          className="mail-recipient-remove"
          aria-label={removeLabel}
          data-testid={`${testId}-remove`}
          onClick={onRemove}
        >
          <CloseIcon aria-hidden="true" />
        </Button>
      ) : null}
    </span>
  );
}

/**
 * A line of recipients (« À », « Cc » or « Cci ») where one types a name: suggestions offer the groups, then the
 * contacts, then the address as typed, then « Gérer les groupes… ». A contact without address is shown and cannot be
 * chosen. The members of a group show as one label with their number.
 * @implements-requirement HALL-FR-EML-030
 */
export function RecipientLine({
  kind,
  recipients,
  groups,
  contacts,
  disabled,
  testId,
  onChange,
  onManageGroups,
  trailing,
}: {
  kind: MailRecipient["kind"];
  recipients: MailRecipient[];
  groups: RecipientGroup[];
  contacts: MailRecipientSelections["contacts"];
  disabled: boolean;
  testId: string;
  onChange(recipients: MailRecipient[]): void;
  onManageGroups?: () => void;
  /** Controls written at the end of the line, such as the « Cc » and « Cci » links. */
  trailing?: ReactNode;
}) {
  const { t } = useI18n();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const display = displayRecipients(recipients, kind, groups);
  const typed = query.trim();
  const suggestions: Suggestion[] = typed
    ? [
        ...groups
          .filter((group) => matches(group.name, typed))
          .map((group) => ({ kind: "group" as const, key: `group-${group.key}`, group })),
        ...contacts
          .filter((contact) => matches(`${contact.name} ${contact.address}`, typed))
          .slice(0, contactLimit)
          .map((contact) => ({
            kind: "contact" as const,
            key: `contact-${contact.contactId ?? contact.address}`,
            contact,
          })),
        { kind: "address" as const, key: "address", address: typed },
        ...(onManageGroups ? [{ kind: "manage" as const, key: "manage" }] : []),
      ]
    : [];
  const selectable = (suggestion: Suggestion) =>
    suggestion.kind === "contact"
      ? Boolean(suggestion.contact.address)
      : suggestion.kind === "address"
        ? typed.includes("@")
        : true;
  const close = () => {
    setQuery("");
    setOpen(false);
    setActive(0);
  };
  const choose = (suggestion: Suggestion) => {
    if (!selectable(suggestion)) return;
    if (suggestion.kind === "manage") {
      close();
      onManageGroups?.();
      return;
    }
    const members =
      suggestion.kind === "group"
        ? suggestion.group.members
        : suggestion.kind === "contact"
          ? [suggestion.contact]
          : [{ name: "", address: suggestion.address, contactId: null }];
    onChange(addRecipients(recipients, kind, members));
    close();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (suggestions.length === 0) return;
      setOpen(true);
      setActive((index) => (index + (event.key === "ArrowDown" ? 1 : suggestions.length - 1)) % suggestions.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const highlighted = open ? suggestions[active] : undefined;
      if (highlighted && selectable(highlighted)) choose(highlighted);
      else if (typed.includes("@")) choose({ kind: "address", key: "address", address: typed });
    } else if (event.key === "Escape") {
      setOpen(false);
    } else if (event.key === "Backspace" && query === "") {
      const last = recipients.findLastIndex((recipient) => recipient.kind === kind);
      if (last >= 0) onChange(recipients.filter((_, index) => index !== last));
    }
  };
  const remove = (indexes: number[]) => onChange(recipients.filter((_, index) => !indexes.includes(index)));
  const section = (label: string, kinds: Suggestion["kind"][]) => {
    const entries = suggestions.flatMap((suggestion, index) =>
      kinds.includes(suggestion.kind) ? [{ suggestion, index }] : [],
    );
    if (entries.length === 0) return null;
    return (
      <div className="mail-suggestion-section">
        {label ? <span className="mail-suggestion-heading">{label}</span> : null}
        {entries.map(({ suggestion, index }) => {
          const enabled = selectable(suggestion);
          return (
            <div
              key={suggestion.key}
              role="option"
              tabIndex={-1}
              aria-selected={index === active}
              aria-disabled={!enabled}
              className="mail-suggestion"
              data-testid={`${testId}-suggest-${suggestion.key}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(suggestion)}
              onKeyDown={(event) => {
                if (event.key === "Enter") choose(suggestion);
              }}
            >
              {suggestion.kind === "group" ? (
                <>
                  <MembersIcon aria-hidden="true" />
                  <span className="mail-suggestion-name">{suggestion.group.name}</span>
                  <span className="mail-suggestion-detail">
                    {t("mail.groupSize", { count: suggestion.group.members.length })}
                  </span>
                </>
              ) : suggestion.kind === "contact" ? (
                <>
                  <MemberIcon aria-hidden="true" />
                  <span className="mail-suggestion-name">{suggestion.contact.name || suggestion.contact.address}</span>
                  <span className="mail-suggestion-detail">{suggestion.contact.address || t("mail.noAddress")}</span>
                </>
              ) : suggestion.kind === "address" ? (
                <span className="mail-suggestion-name">
                  {enabled ? t("mail.useAddress", { address: typed }) : t("mail.otherAddress")}
                </span>
              ) : (
                <>
                  <SettingsIcon aria-hidden="true" />
                  <span className="mail-suggestion-name mail-suggestion-link">{t("mail.manageGroups")}</span>
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  };
  return (
    <div className="mail-recipient-line" data-testid={testId}>
      <span className="mail-recipient-kind">{t(`mail.${kind}`)}</span>
      <div className="mail-recipient-values">
        {display.groups.map(({ group, indexes }) => (
          <RecipientLabel
            key={group.key}
            icon={<MembersIcon />}
            testId={`${testId}-group-${group.key}`}
            removeLabel={t("mail.removeRecipient", { name: group.name })}
            onRemove={disabled ? undefined : () => remove(indexes)}
          >
            {group.name} · {indexes.length}
          </RecipientLabel>
        ))}
        {display.singles.map((index) => {
          const recipient = recipients[index];
          const name = recipient.name || recipient.address;
          return (
            <RecipientLabel
              key={`${recipient.contactId ?? ""}-${recipient.address}-${index}`}
              icon={<MemberIcon />}
              testId={`${testId}-recipient-${index}`}
              missing={!recipient.address}
              removeLabel={t("mail.removeRecipient", { name })}
              onRemove={disabled ? undefined : () => remove([index])}
            >
              {recipient.name ? (
                <span title={recipient.address || t("mail.noAddress")}>
                  {recipient.name}
                  {recipient.address ? null : ` · ${t("mail.noAddress")}`}
                </span>
              ) : (
                recipient.address
              )}
            </RecipientLabel>
          );
        })}
        {disabled ? null : (
          <div className="mail-recipient-entry">
            <input
              className="mail-recipient-input"
              type="text"
              role="combobox"
              aria-expanded={open && suggestions.length > 0}
              aria-controls={listId}
              aria-label={t("mail.addRecipient", { kind: t(`mail.${kind}`) })}
              autoComplete="off"
              value={query}
              data-testid={`${testId}-input`}
              onChange={(event) => {
                setQuery(event.target.value);
                setOpen(true);
                setActive(0);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => {
                if (typed.includes("@")) choose({ kind: "address", key: "address", address: typed });
                else setOpen(false);
              }}
              onKeyDown={onKeyDown}
            />
            {open && suggestions.length > 0 ? (
              <div className="mail-suggestions" id={listId} role="listbox" data-testid={`${testId}-suggestions`}>
                {section(t("mail.suggestionGroups"), ["group"])}
                {section(t("mail.suggestionContacts"), ["contact"])}
                {section(t("mail.suggestionAddress"), ["address"])}
                {section("", ["manage"])}
              </div>
            ) : null}
          </div>
        )}
      </div>
      {trailing ? <span className="mail-recipient-trailing">{trailing}</span> : null}
    </div>
  );
}
