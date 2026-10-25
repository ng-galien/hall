import { useState } from "react";
import { Modal, RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode, submitSirenActionAt } from "../../services/apiClient";

export function BusinessDeleteDialog({
  businessId,
  name,
  onClose,
  onDeleted,
}: {
  businessId: string;
  name: string;
  onClose(): void;
  onDeleted(): Promise<void>;
}) {
  const { t } = useI18n();
  const { submitting, run } = useSubmitting();
  const [error, setError] = useState<ApiErrorCode | null>(null);
  return (
    <Modal
      open
      title={t("business.delete")}
      testId="business-delete-dialog"
      onClose={() => {
        if (!submitting) onClose();
      }}
    >
      <div className="modal-form">
        <RequestErrorBanner error={error} />
        <p>{t("business.deleteConfirm", { name: name })}</p>
        <Button
          variant="destructive"
          disabled={submitting}
          data-testid="business-delete-confirm"
          onClick={() =>
            void run(async () => {
              setError(null);
              try {
                await submitSirenActionAt(
                  `/council-business/${encodeURIComponent(businessId)}`,
                  "council-business.delete",
                );
                await onDeleted();
                onClose();
              } catch (failure) {
                setError(apiErrorCode(failure));
              }
            })
          }
        >
          {t(submitting ? "common.saving" : "business.delete")}
        </Button>
      </div>
    </Modal>
  );
}
