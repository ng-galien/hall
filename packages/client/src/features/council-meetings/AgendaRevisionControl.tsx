import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CheckIcon, CloseIcon, EditIcon } from "../../components/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import { useI18n } from "../../i18n/I18nProvider";

function Explained({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom" className="revision-hint">
        <strong>{title}</strong>
        <span>{text}</span>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The agenda revision as one control beside the meeting title: established, it offers to revise;
 * open, it names the revision and offers to establish it or return to the previous established revision.
 */
export function AgendaRevisionControl({
  number,
  establishedAt,
  noticeNumber,
  busy,
  onRevise,
  onConfirm,
  onCancel,
}: {
  number: number;
  establishedAt: string | null;
  noticeNumber: number | null;
  busy: boolean;
  onRevise?: () => void;
  onConfirm?: () => void;
  onCancel?: () => void;
}) {
  const { t, formatNumber, formatDateTime } = useI18n();
  const established = establishedAt !== null;
  const state = established
    ? `${t("meeting.revision.established", { number: formatNumber(number), date: formatDateTime(establishedAt) })}${
        noticeNumber !== null ? ` · ${t("meeting.revision.notice", { number: formatNumber(noticeNumber) })}` : ""
      }`
    : t("meeting.revision.open", { number: formatNumber(number) });
  return (
    <span
      className="revision-control"
      data-state={established ? "established" : "open"}
      data-number={number}
      data-testid="meeting-agenda-revision"
    >
      {established ? (
        onRevise ? (
          <Explained title={state} text={t("meeting.revision.reviseHint")}>
            <Button
              variant="plain"
              className="revision-control-revise"
              data-testid="meeting-revise-agenda"
              disabled={busy}
              onClick={onRevise}
            >
              <EditIcon aria-hidden="true" />
              {t("meeting.revision.revise")}
            </Button>
          </Explained>
        ) : null
      ) : (
        <>
          <span className="revision-control-label" data-testid="meeting-agenda-revision-state" data-state="open">
            {state}
          </span>
          {onConfirm ? (
            <Explained
              title={t("meeting.revision.generateNotice")}
              text={t("meeting.revision.generateNoticeHint", { number: formatNumber(number) })}
            >
              <Button
                variant="primary"
                className="revision-control-confirm"
                data-testid="meeting-generate-notice"
                disabled={busy}
                onClick={onConfirm}
              >
                <CheckIcon aria-hidden="true" />
                {t("meeting.revision.generateNotice")}
              </Button>
            </Explained>
          ) : null}
          {onCancel ? (
            <Explained
              title={t("meeting.revision.reset")}
              text={t("meeting.revision.resetHint", { number: formatNumber(Math.max(number - 1, 1)) })}
            >
              <Button
                variant="danger"
                size="icon"
                className="revision-control-cancel"
                data-testid="meeting-reset-agenda-revision"
                aria-label={t("meeting.revision.reset")}
                disabled={busy}
                onClick={onCancel}
              >
                <CloseIcon aria-hidden="true" />
              </Button>
            </Explained>
          ) : null}
        </>
      )}
    </span>
  );
}
