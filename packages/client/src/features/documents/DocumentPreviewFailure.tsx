import { Button } from "@/components/ui/button";
import { useI18n } from "../../i18n/I18nProvider";

export function DocumentPreviewFailure({ onRetry }: { onRetry(): void }) {
  const { t } = useI18n();
  return (
    <div className="document-preview-failure">
      <p role="alert">{t("resources.previewFailed")}</p>
      <Button variant="outline" onClick={onRetry}>
        {t("common.retry")}
      </Button>
    </div>
  );
}

/** Shown in place of a file the browser cannot display; the viewer keeps its download action. */
export function DocumentPreviewUnavailable({ testId }: { testId?: string }) {
  const { t } = useI18n();
  return (
    <div className="document-preview-failure" data-testid={testId}>
      <p role="status">{t("resources.previewUnavailable")}</p>
    </div>
  );
}
