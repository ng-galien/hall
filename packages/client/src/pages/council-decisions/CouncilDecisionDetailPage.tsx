import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CopyReferenceButton, copyObjectReference } from "../../components/CopyReferenceButton";
import { MarkdownEditor } from "../../components/editor/MarkdownEditor";
import { ArrowDownIcon, CalendarIcon, PdfIcon, ShareIcon } from "../../components/icons";
import { MarkdownView } from "../../components/MarkdownView";
import { ShareButton } from "../../components/ShareButton";
import { PageHeader, RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../components/ui/dialog";
import { DisclosureBadge } from "../../components/ui/disclosure-badge";
import { DocumentViewerDialog } from "../../features/documents/DocumentViewerDialog";
import { NativeDocumentFrame } from "../../features/documents/NativeDocumentFrame";
import { useI18n } from "../../i18n/I18nProvider";
import { apiFile, downloadFile, shareOrDownload } from "../../services/fileSharing";
import { ScreenTitle } from "../../shell/headerTrail";
import { usePhoneLayout } from "../../shell/usePhoneLayout";
import { type PhoneDocumentAction, PhoneDocumentActions, phoneActionIcons } from "../workspace/PhoneDocumentActions";
import { useCouncilDecisionDraft } from "./useCouncilDecisionDraft";
import "../../features/documents/DocumentViewer.css";

export function CouncilDecisionDetailPage() {
  const { decisionId = "" } = useParams();
  return <CouncilDecisionDetail key={decisionId} id={decisionId} />;
}

function CouncilDecisionDetail({ id }: { id: string }) {
  const { t, formatDateTime } = useI18n();
  const draft = useCouncilDecisionDraft(id);
  const [confirming, setConfirming] = useState(false);
  const { decision } = draft;
  const phone = usePhoneLayout();
  const navigate = useNavigate();
  const reference = {
    name: [decision?.number, decision?.title].filter(Boolean).join(" · "),
    page: `/app/council-decisions/${id}`,
    href: `/api/council-decisions/${id}`,
  };
  const decisionFile = () => apiFile(draft.downloadHref!, `${decision?.title}.pdf`);
  const phoneActions: PhoneDocumentAction[] = decision
    ? [
        ...(draft.canView
          ? [
              {
                id: "decision-view",
                label: t(decision.state === "frozen" ? "decisionDocument.view" : "minutes.preview"),
                icon: <PdfIcon />,
                onSelect: () => void draft.view(),
              },
            ]
          : []),
        ...(draft.downloadHref
          ? [
              {
                id: "decision-share",
                label: t("common.share"),
                icon: <ShareIcon />,
                onSelect: () => void decisionFile().then(shareOrDownload),
              },
              {
                id: "decision-download",
                label: t("common.download"),
                icon: <ArrowDownIcon />,
                onSelect: () => void decisionFile().then(downloadFile),
              },
            ]
          : []),
        {
          id: "decision-source-meeting",
          label: formatDateTime(decision.facts.meeting.startedAt),
          icon: <CalendarIcon />,
          onSelect: () => navigate(`/meetings/${decision.councilMeetingId}`),
        },
        {
          id: "copy-reference",
          label: t("reference.copy"),
          icon: <phoneActionIcons.copy />,
          onSelect: () => void copyObjectReference(reference).catch(() => undefined),
        },
      ]
    : [];
  return (
    <div className="page" data-testid="decision-detail">
      {phone && decision ? (
        <>
          <ScreenTitle>{decision.number || decision.title}</ScreenTitle>
          <PhoneDocumentActions actions={phoneActions} />
        </>
      ) : null}
      <PageHeader
        title={decision?.title ?? t("decisions.title")}
        description={phone ? "" : (decision?.number ?? "")}
        titleAction={decision && !phone ? <CopyReferenceButton reference={reference} /> : null}
      />
      <div className="page-content admin-detail-page">
        <RequestErrorBanner error={draft.error} />
        {draft.loading ? (
          <p>{t("common.loading")}</p>
        ) : !decision ? (
          <Button data-testid="decision-load-retry" variant="secondary" onClick={() => void draft.load()}>
            {t("common.retry")}
          </Button>
        ) : null}
        {decision ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              {phone ? null : (
                <Button asChild variant="secondary">
                  <Link to={`/meetings/${decision.councilMeetingId}`} data-testid="decision-source-meeting">
                    <CalendarIcon />
                    {formatDateTime(decision.facts.meeting.startedAt)}
                  </Link>
                </Button>
              )}
              <p className="meeting-state">
                <span
                  className="list-row-status"
                  data-tone={decision.facts.ballot.result === "approve" ? "success" : "danger"}
                >
                  {t(decision.facts.ballot.result === "approve" ? "status.adopted" : "status.rejected")}
                </span>
                <span className="list-row-status" data-tone="neutral" data-testid="decision-document-state">
                  {t(decision.state === "draft" ? "decisionDocument.draft" : "decisionDocument.frozen")}
                </span>
              </p>
            </div>
            <details className="conduct-block" data-testid="decision-submitted-text">
              <summary data-testid="decision-submitted-toggle">
                <DisclosureBadge />
                <span>{t("decisionDocument.submitted")}</span>
              </summary>
              <MarkdownView markdown={decision.facts.proposal.submittedText} />
            </details>
            <section className="admin-detail-surface admin-record" aria-labelledby="decision-writing-title">
              <div className="admin-section-heading" hidden={phone && !draft.canEdit}>
                <div>
                  <h2 id="decision-writing-title">{t("decisionDocument.writing")}</h2>
                  <p>{t("decisionDocument.fidelity")}</p>
                </div>
                <span role="status" data-testid="decision-save-status">
                  {draft.saving ? t("common.saving") : draft.dirty ? t("workspace.saveDirty") : t("workspace.saved")}
                </span>
              </div>
              {draft.canEdit ? (
                <MarkdownEditor
                  testId="decision-writing"
                  markdown={draft.content}
                  onChange={draft.edit}
                  onBlur={() => void draft.flush()}
                  readOnly={draft.freezing}
                />
              ) : (
                <MarkdownView markdown={draft.content} />
              )}
              {draft.error && draft.dirty ? (
                <Button variant="secondary" data-testid="decision-save-retry" onClick={() => void draft.flush()}>
                  {t("common.retry")}
                </Button>
              ) : null}
            </section>
            <div className="flex flex-wrap items-center gap-3">
              {draft.canView && !phone ? (
                <Button
                  variant="secondary"
                  data-testid="decision-view"
                  disabled={draft.freezing}
                  onClick={() => void draft.view()}
                >
                  <PdfIcon />
                  {t(decision.state === "frozen" ? "decisionDocument.view" : "minutes.preview")}
                </Button>
              ) : null}
              {draft.downloadHref && !phone ? (
                <ShareButton
                  testId="decision-share"
                  file={() => apiFile(draft.downloadHref!, `${decision.title}.pdf`)}
                />
              ) : null}
              {draft.downloadHref && !phone ? (
                <Button asChild variant="secondary">
                  <a href={draft.downloadHref} download data-testid="decision-download">
                    <ArrowDownIcon />
                    {t("common.download")}
                  </a>
                </Button>
              ) : null}
              {draft.canFreeze ? (
                <Button
                  data-testid="decision-freeze"
                  disabled={draft.freezing || draft.saving}
                  onClick={() => setConfirming(true)}
                >
                  {t("decisionDocument.freeze")}
                </Button>
              ) : null}
              {decision.frozenAt ? <span>{formatDateTime(decision.frozenAt)}</span> : null}
            </div>
            <p className="text-sm text-muted">{t("decisionDocument.formalities")}</p>
            <Dialog
              open={confirming}
              onOpenChange={(open) => {
                if (!draft.freezing) setConfirming(open);
              }}
            >
              <DialogContent data-testid="decision-freeze-dialog">
                <DialogTitle>{t("decisionDocument.freeze")}</DialogTitle>
                <DialogDescription>{t("decisionDocument.freezeConfirmation")}</DialogDescription>
                <Button
                  data-testid="decision-freeze-confirm"
                  disabled={draft.freezing}
                  onClick={() =>
                    void draft.freeze().then((ok) => {
                      if (ok) setConfirming(false);
                    })
                  }
                >
                  {t("decisionDocument.freeze")}
                </Button>
              </DialogContent>
            </Dialog>
            {draft.documentUrl ? (
              <DocumentViewerDialog
                testId="decision-document-dialog"
                titleId="decision-document-dialog-title"
                title={[decision.number, decision.title].filter(Boolean).join(" · ")}
                description={t(decision.state === "frozen" ? "decisionDocument.frozen" : "decisionDocument.draft")}
                closeTestId="decision-document-close"
                onClose={draft.closeDocument}
              >
                <NativeDocumentFrame
                  url={draft.documentUrl}
                  mediaType="application/pdf"
                  title={[decision.number, decision.title].filter(Boolean).join(" · ")}
                  testId="decision-document-frame"
                />
              </DocumentViewerDialog>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
