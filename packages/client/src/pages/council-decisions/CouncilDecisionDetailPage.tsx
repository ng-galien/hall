import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MarkdownEditor } from "../../components/editor/MarkdownEditor";
import { ArrowDownIcon, CalendarIcon, CloseIcon, PdfIcon } from "../../components/icons";
import { MarkdownView } from "../../components/MarkdownView";
import { PageHeader, RequestErrorBanner } from "../../components/Ui";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../../components/ui/dialog";
import { DisclosureBadge } from "../../components/ui/disclosure-badge";
import { NativeDocumentFrame } from "../../features/documents/NativeDocumentFrame";
import { useI18n } from "../../i18n/I18nProvider";
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
  return (
    <div className="page" data-testid="decision-detail">
      <PageHeader
        title={decision?.title ?? t("decisions.title")}
        description={decision?.publicationNumber ?? ""}
      />
      <div className="page-content admin-detail-page">
        <RequestErrorBanner error={draft.error} />
        {draft.loading ? (
          <p>{t("common.loading")}</p>
        ) : !decision ? (
          <Button data-testid="decision-load-retry" variant="outline" onClick={() => void draft.load()}>
            {t("common.retry")}
          </Button>
        ) : null}
        {decision ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild variant="outline" size="sm">
                <Link to={`/meetings/${decision.councilMeetingId}`} data-testid="decision-source-meeting">
                  <CalendarIcon />
                  {formatDateTime(decision.facts.meeting.startedAt)}
                </Link>
              </Button>
              <Badge variant={decision.facts.ballot.result === "approve" ? "success" : "destructive"}>
                {t(decision.facts.ballot.result === "approve" ? "status.adopted" : "status.rejected")}
              </Badge>
              <Badge variant="secondary" data-testid="decision-document-state">
                {t(decision.state === "draft" ? "decisionDocument.draft" : "decisionDocument.frozen")}
              </Badge>
            </div>
            <details className="conduct-block" data-testid="decision-submitted-text">
              <summary data-testid="decision-submitted-toggle">
                <DisclosureBadge />
                <span>{t("decisionDocument.submitted")}</span>
              </summary>
              <MarkdownView markdown={decision.facts.proposal.submittedText} />
            </details>
            <section className="admin-detail-surface admin-record" aria-labelledby="decision-writing-title">
              <div className="admin-section-heading">
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
                <Button variant="outline" data-testid="decision-save-retry" onClick={() => void draft.flush()}>
                  {t("common.retry")}
                </Button>
              ) : null}
            </section>
            <div className="flex flex-wrap items-center gap-3">
              {draft.canView ? (
                <Button
                  variant="outline"
                  data-testid="decision-view"
                  disabled={draft.freezing}
                  onClick={() => void draft.view()}
                >
                  <PdfIcon />
                  {t(decision.state === "frozen" ? "decisionDocument.view" : "minutes.preview")}
                </Button>
              ) : null}
              {draft.downloadHref ? (
                <Button asChild variant="outline">
                  <a href={draft.downloadHref} download data-testid="decision-download"><ArrowDownIcon />{t("common.download")}</a>
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
            <Dialog
              open={Boolean(draft.documentUrl)}
              onOpenChange={(open) => {
                if (!open) draft.closeDocument();
              }}
            >
              <DialogContent
                className="document-viewer gap-0 p-0 sm:max-w-[var(--hall-size-viewer-width)]"
                data-testid="decision-document-dialog"
                showCloseButton={false}
              >
                <header>
                  <div>
                    <DialogTitle>{decision.title}</DialogTitle>
                    <DialogDescription>
                      {t(decision.state === "frozen" ? "decisionDocument.frozen" : "decisionDocument.draft")}
                    </DialogDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("common.close")}
                    data-testid="decision-document-close"
                    onClick={draft.closeDocument}
                  >
                    <CloseIcon />
                  </Button>
                </header>
                <div className="document-viewer-content">
                  {draft.documentUrl ? (
                    <NativeDocumentFrame
                      url={draft.documentUrl}
                      mediaType="application/pdf"
                      title={decision.title}
                      testId="decision-document-frame"
                    />
                  ) : null}
                </div>
              </DialogContent>
            </Dialog>
          </>
        ) : null}
      </div>
    </div>
  );
}
