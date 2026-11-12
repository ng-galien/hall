import { findSirenAction, type MailMessage, type SirenEntity } from "@hall/api-contract";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MailIcon } from "../../components/icons";
import { RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/I18nProvider";
import { apiErrorCode, sirenRepresentation, submitSirenAction } from "../../services/apiClient";

type ContactAddress = { contactId: string; name: string; email: string; testId: string };

/** Creates a message of the shared mailbox addressed to the contact and opens it, when the mailbox offers it. */
function useContactMessage({ contactId, name, email }: ContactAddress) {
  const navigate = useNavigate();
  const [mailbox, setMailbox] = useState<SirenEntity | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let active = true;
    void sirenRepresentation("/mail")
      .then((entity) => {
        if (active) setMailbox(entity);
      })
      .catch(() => {
        if (active) setMailbox(null);
      });
    return () => {
      active = false;
    };
  }, []);
  const available = Boolean(mailbox && findSirenAction(mailbox, "mail.create"));
  const write = () => {
    if (!mailbox) return;
    setBusy(true);
    setError(null);
    void submitSirenAction<MailMessage>(mailbox, "mail.create", {
      recipients: [{ kind: "to", name, address: email, contactId }],
    })
      .then((result) => navigate(`/mail/${result.data.id}`))
      .catch(setError)
      .finally(() => setBusy(false));
  };
  const errorBanner = <RequestErrorBanner error={error ? apiErrorCode(error) : null} />;
  return { available, busy, write, errorBanner };
}

/**
 * The address of a contact as read on its sheet: it opens a new message in Hall to this contact when the shared
 * mailbox offers the creation of a message, and stays text otherwise.
 * @implements-requirement HALL-FR-DIR-180
 */
export function ContactEmailLink(props: ContactAddress) {
  const message = useContactMessage(props);
  if (!message.available) return <span>{props.email}</span>;
  return (
    <>
      <Button
        variant="plain"
        className="hall-link"
        data-testid={props.testId}
        disabled={message.busy}
        onClick={message.write}
      >
        {props.email}
      </Button>
      {message.errorBanner}
    </>
  );
}

/** The same new message, from the end of the address field of a person who edits the contact. */
export function ContactEmailAction(props: ContactAddress) {
  const { t } = useI18n();
  const message = useContactMessage(props);
  if (!message.available) return null;
  return (
    <>
      <Button
        variant="plain"
        size="icon"
        aria-label={t("contacts.writeEmail")}
        title={t("contacts.writeEmail")}
        data-testid={props.testId}
        disabled={message.busy}
        onClick={message.write}
      >
        <MailIcon />
      </Button>
      {message.errorBanner}
    </>
  );
}
