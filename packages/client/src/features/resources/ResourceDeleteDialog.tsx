import { Modal } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";

/** Confirmation before a resource is deleted, naming it, with Cancel and Delete. */
export function ResourceDeleteDialog({
  name,
  onConfirm,
  onClose,
}: {
  name: string;
  onConfirm(): Promise<void>;
  onClose(): void;
}) {
  const { t } = useI18n();
  const { submitting, run } = useSubmitting();
  return (
    <Modal
      open
      title={t("workspace.deleteResource")}
      testId="resource-delete-dialog"
      onClose={() => {
        if (!submitting) onClose();
      }}
    >
      <div className="modal-form">
        <p>{t("workspace.deleteResourceConfirm", { name })}</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={submitting} data-testid="resource-delete-cancel" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="danger"
            disabled={submitting}
            data-testid="resource-delete-confirm"
            onClick={() =>
              void run(async () => {
                await onConfirm();
                onClose();
              })
            }
          >
            {t(submitting ? "common.saving" : "workspace.deleteResource")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
