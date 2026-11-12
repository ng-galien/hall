import type { MailMessage } from "@hall/api-contract";
import { matchLiteral } from "@hall/domain";
import type { ListRowStatus } from "../../components/ui/list-row";
import type { I18nContextValue } from "../../i18n/i18nContext";

/** State of a message from its last sending: draft, sending, sent, failed or to verify, and a recorded verification. */
export function mailStatus(t: I18nContextValue["t"], message: MailMessage): ListRowStatus {
  const latest = message.submissions[0];
  if (!latest) return { tone: "neutral", label: t("mail.draft") };
  if (latest.verification?.outcome === "sent") return { tone: "success", label: t("mail.accepted") };
  if (latest.verification?.outcome === "not-sent") return { tone: "neutral", label: t("mail.verifiedNotSent") };
  return {
    tone: matchLiteral(latest.status, {
      submitting: () => "action" as const,
      accepted: () => "success" as const,
      failed: () => "danger" as const,
      unknown: () => "danger" as const,
    }),
    label: t(`mail.${latest.status}`),
  };
}
