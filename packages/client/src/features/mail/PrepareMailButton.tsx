// @implements-requirement HALL-FR-EML-090
import { findSirenAction, type MailMessage, type prepareMailSchema, type SirenEntity } from "@hall/api-contract";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { z } from "zod";
import { MailIcon } from "../../components/icons";
import { RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/I18nProvider";
import { apiErrorCode, sirenRepresentation, submitSirenAction } from "../../services/apiClient";

/** Uses the shared mailbox capability and opens the resulting draft; never sends. */
export function PrepareMailButton({ input, testId }: { input: z.infer<typeof prepareMailSchema>; testId: string }) {
  const { t } = useI18n();
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
      .catch((cause) => {
        if (active) setError(cause);
      });
    return () => {
      active = false;
    };
  }, []);
  if (!mailbox || !findSirenAction(mailbox, "mail.prepare")) return null;
  return (
    <>
      <Button
        variant="secondary"
        data-testid={testId}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          void submitSirenAction<MailMessage>(mailbox, "mail.prepare", input)
            .then((result) => navigate(`/mail/drafts/${result.data.id}`))
            .catch(setError)
            .finally(() => setBusy(false));
        }}
      >
        <MailIcon />
        {t("mail.prepare")}
      </Button>
      <RequestErrorBanner error={error ? apiErrorCode(error) : null} />
    </>
  );
}
