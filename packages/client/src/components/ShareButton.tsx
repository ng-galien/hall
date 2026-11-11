import { useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { type SharedFile, shareOrDownload } from "../services/fileSharing";
import { ShareIcon } from "./icons";
import { Button } from "./ui/button";

/** Partager: the device's share sheet with the file, or its download when the browser cannot share files. */
// @implements-requirement HALL-FR-DOC-570
export function ShareButton({
  file,
  testId,
  size,
  onError,
}: {
  file(): Promise<SharedFile>;
  testId: string;
  size?: "default";
  onError?(error: unknown): void;
}) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size={size}
      data-testid={testId}
      disabled={pending}
      onClick={() => {
        setPending(true);
        void file()
          .then(shareOrDownload)
          .catch((error: unknown) => onError?.(error))
          .finally(() => setPending(false));
      }}
    >
      <ShareIcon aria-hidden="true" />
      {t("common.share")}
    </Button>
  );
}
