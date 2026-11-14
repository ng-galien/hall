import { useEffect, useState } from "react";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { useI18n } from "../../i18n/I18nProvider";
import { documentaryBinaryReferenceContentHref } from "../../services/resourcesApi";
import { DocumentViewerDialog } from "./DocumentViewerDialog";

// @implements-requirement HALL-FR-DOC-480
/**
 * The image of a text, opened from its name: the image itself in the document viewer, whether the text cites an image
 * of the editor or an imported file; closing it returns to the text as it was.
 */
export function EditorImageViewer({ id, label, onClose }: { id: string; label: string; onClose(): void }) {
  const { t } = useI18n();
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void documentaryBinaryReferenceContentHref(id).then((resolved) => active && setHref(resolved));
    return () => {
      active = false;
    };
  }, [id]);
  return (
    <DocumentViewerDialog
      testId="editor-image-viewer"
      titleId="editor-image-viewer-title"
      title={label}
      closeTestId="editor-image-viewer-close"
      onClose={onClose}
    >
      {href ? (
        <img className="editor-image-viewer-image" data-testid="editor-image-viewer-image" src={href} alt={label} />
      ) : (
        <LoadingIndicator aria-label={t("common.loading")} />
      )}
    </DocumentViewerDialog>
  );
}
