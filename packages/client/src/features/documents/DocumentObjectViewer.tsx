import { useI18n } from "../../i18n/I18nProvider";
import { DocumentViewerDialog } from "./DocumentViewerDialog";
import { NativeDocumentFrame } from "./NativeDocumentFrame";

/** Shared viewer for an already loaded document representation, such as a generated notice or minutes. */
export function DocumentObjectViewer({
  title,
  objectUrl,
  mediaType,
  onClose,
}: {
  title: string;
  objectUrl: string;
  mediaType: string;
  onClose(): void;
}) {
  const { t } = useI18n();
  return (
    <DocumentViewerDialog
      testId="document-object-viewer"
      titleId="document-object-viewer-title"
      title={title}
      caption={t("meeting.documentViewer")}
      closeTestId="document-object-viewer-close"
      onClose={onClose}
    >
      <NativeDocumentFrame url={objectUrl} mediaType={mediaType} title={title} testId="document-object-frame" />
    </DocumentViewerDialog>
  );
}
