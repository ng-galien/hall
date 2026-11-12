import { useState } from "react";
import { PdfIcon } from "../components/icons";
import { Button } from "../components/ui/button";
import { useI18n } from "../i18n/I18nProvider";
import { apiResponse } from "../services/apiClient";

/* The whole French documentation as one PDF, printed by the server at the moment of the request
   (`GET /api/documentation/pdf`) from the print view the application serves at /app/docs-print. */
// @implements-requirement HALL-FR-DOC-560
export const DOCS_PDF_FILE = "documentation-hall.pdf";

async function downloadDocumentationPdf() {
  const response = await apiResponse("/documentation/pdf", { headers: { Accept: "application/pdf" } });
  const url = URL.createObjectURL(await response.blob());
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = DOCS_PDF_FILE;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function DocsPdfExport({ className }: { className: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<"idle" | "pending" | "failed">("idle");
  const label = state === "pending" ? t("docs.download.pdfPending") : t("docs.download.pdf");

  async function exportPdf() {
    setState("pending");
    try {
      await downloadDocumentationPdf();
      setState("idle");
    } catch {
      setState("failed");
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        type="button"
        className={className}
        aria-label={label}
        title={label}
        aria-busy={state === "pending" || undefined}
        disabled={state === "pending"}
        onClick={() => void exportPdf()}
        data-testid="docs-export-pdf"
      >
        <PdfIcon aria-hidden="true" />
        <span>{t("docs.download.pdfShort")}</span>
      </Button>
      {state === "failed" ? (
        <span role="alert" data-testid="docs-export-pdf-error">
          {t("docs.download.pdfFailed")}
        </span>
      ) : null}
    </>
  );
}
