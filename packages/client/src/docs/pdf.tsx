import { PdfIcon } from "../components/icons";
import { useI18n } from "../i18n/I18nProvider";
import { standalone } from "./standalone";

/* The whole French documentation as one PDF, built by `npm run build:docs:pdf`: served by Hall from the client's
   static files, and placed next to index.html in the standalone site. */
export const DOCS_PDF_FILE = "documentation-hall.pdf";

const docsPdfHref = standalone ? DOCS_PDF_FILE : `${import.meta.env.BASE_URL}documentation/${DOCS_PDF_FILE}`;

export function DocsPdfLink({ className }: { className: string }) {
  const { t } = useI18n();
  return (
    <a
      href={docsPdfHref}
      target="_blank"
      rel="noreferrer"
      className={className}
      aria-label={t("docs.download.pdf")}
      title={t("docs.download.pdf")}
      data-testid="docs-download-pdf"
    >
      <PdfIcon aria-hidden="true" />
      <span>{t("docs.download.pdf")}</span>
    </a>
  );
}
