import { findSirenLink } from "@hall/api-contract";
import { matchLiteral } from "@hall/domain";
import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { copyObjectReference } from "../../components/CopyReferenceButton";
import type { Mentionable } from "../../components/editor/references";
import { ArrowDownIcon, EditIcon, InfoIcon, MapIcon, ShareIcon } from "../../components/icons";
import { TagInput } from "../../components/TagInput";
import { Modal, RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { CollapsibleSection } from "../../components/ui/collapsible-section";
import { CouncilBusinessGlyph } from "../../features/council-business/CouncilBusinessGlyph";
import { documentaryResourceDate } from "../../features/documents/DocumentaryResourceGlyph";
import { usePdfPreview } from "../../features/documents/PdfPreviewButton";
import type { UploadedResourceImage } from "../../features/documents/useResourceImageUpload";
import { ResourceChangesControl } from "../../features/resources/ResourceChangesControl";
import { ResourceDeleteDialog } from "../../features/resources/ResourceDeleteDialog";
import { ResourcePresentationBody } from "../../features/resources/ResourcePresentationBody";
import type { ResourceSession } from "../../features/resources/useResourceSession";
import { useTextWriting } from "../../features/resources/useTextWriting";
import { useI18n } from "../../i18n/I18nProvider";
import type { CouncilBusinessView } from "../../models/councilBusiness";
import { shareOrDownload } from "../../services/fileSharing";
import { documentaryResourceFile, downloadDocumentaryResource } from "../../services/resourcesApi";
import { usePreparedSubjectPhoneActions } from "./CouncilBusinessSubjects";
import {
  type PhoneDocumentAction,
  PhoneDocumentActions,
  PhoneRenameDialog,
  phoneActionIcons,
  pinIcon,
} from "./PhoneDocumentActions";
import type { WorkspaceSelection } from "./workspaceItemReference";
import { useWorkspacePrefsStore } from "./workspacePrefs";

// @implements-requirement HALL-FR-LAY-010
// @implements-requirement HALL-FR-LAY-130
/** Phone reading view of a resource: the content first, the actions in the header menu, the details below. */
export function ResourcePhoneView({
  session,
  relatedBusinesses,
  mentionables,
  canUploadImage,
  uploadImage,
  onSelect,
}: {
  session: ResourceSession;
  relatedBusinesses: CouncilBusinessView[];
  mentionables: Mentionable[];
  canUploadImage: boolean;
  uploadImage(file: File): Promise<UploadedResourceImage>;
  onSelect(selection: WorkspaceSelection, path?: string): void;
}) {
  const { t, formatDate } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isPinned, togglePin } = useWorkspacePrefsStore();
  const [informationOpen, setInformationOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const openChanges = useRef<(() => void) | null>(null);
  const resource = session.resource;
  const subjectActions = usePreparedSubjectPhoneActions(
    resource?.id ?? null,
    searchParams.get("fromBusiness"),
    session.setActionError,
  );
  const pdf = usePdfPreview({
    markdown: resource?.kind === "text" ? session.content : "",
    title: resource?.name ?? "",
    testId: "resource-pdf-preview",
  });
  const writing = useTextWriting({
    id: resource?.kind === "text" ? resource.id : null,
    editable: resource?.kind === "text" && session.editable,
    content: session.content,
    dirty: session.dirty,
    flush: session.flush,
    save: () => session.save(),
    reload: session.reload,
  });
  const editing = writing.editing;
  if (!resource) return <RequestErrorBanner error={session.actionError} />;

  const representation = session.representation;
  const pinned = isPinned({ kind: "resource", id: resource.id });
  const reference = {
    name: resource.name,
    path: resource.path || undefined,
    page: `/app/workspace?${new URLSearchParams({ path: resource.path, resource: resource.id })}`,
    href: `/api/resources/${resource.slug}`,
  };
  const date = documentaryResourceDate(resource);
  const fillsScreen = matchLiteral(resource.kind, {
    folder: () => false,
    text: () => false,
    remote: () => false,
    event: () => false,
    legalReference: () => false,
    document: () => true,
    spreadsheet: () => true,
    geographic: () => true,
    geographicLayer: () => true,
  });
  const actions: PhoneDocumentAction[] = [
    ...subjectActions,
    ...(resource.kind === "document" && representation
      ? [
          {
            id: "share",
            label: t("common.share"),
            icon: <ShareIcon />,
            onSelect: () => void documentaryResourceFile(resource, representation).then(shareOrDownload),
          },
          {
            id: "download",
            label: t("common.download"),
            icon: <ArrowDownIcon />,
            onSelect: () => void downloadDocumentaryResource(resource, representation),
          },
        ]
      : []),
    ...(resource.kind === "text"
      ? pdf.referencesDocuments
        ? [
            {
              id: "pdf-without-documents",
              label: `${t("editor.pdfPreview")} · ${t("editor.pdfWithoutDocuments")}`,
              icon: <phoneActionIcons.pdf />,
              onSelect: () => void pdf.openPreview(false),
            },
            {
              id: "pdf-with-documents",
              label: `${t("editor.pdfPreview")} · ${t("editor.pdfWithDocuments")}`,
              icon: <phoneActionIcons.pdf />,
              onSelect: () => void pdf.openPreview(true),
            },
          ]
        : [
            {
              id: "pdf",
              label: t("editor.pdfPreview"),
              icon: <phoneActionIcons.pdf />,
              onSelect: () => void pdf.openPreview(false),
            },
          ]
      : []),
    ...(resource.kind === "geographic"
      ? [
          {
            id: "open-in-maps",
            label: t("maps.openInMaps"),
            icon: <MapIcon />,
            onSelect: () => navigate(`/maps/${encodeURIComponent(resource.id)}`),
          },
        ]
      : []),
    {
      id: "pin",
      label: t(pinned ? "workspace.unpinShort" : "workspace.pin"),
      icon: pinIcon(pinned),
      onSelect: () => togglePin({ kind: "resource", id: resource.id }),
    },
    {
      id: "copy-reference",
      label: t("reference.copy"),
      icon: <phoneActionIcons.copy />,
      onSelect: () => void copyObjectReference(reference).catch(() => undefined),
    },
    ...(representation && findSirenLink(representation, "changes")
      ? [
          {
            id: "changes",
            label: t("resourceChanges.open"),
            icon: <phoneActionIcons.changes />,
            onSelect: () => openChanges.current?.(),
          },
        ]
      : []),
    ...(fillsScreen
      ? [
          {
            id: "information",
            label: t("workspace.information"),
            icon: <InfoIcon />,
            onSelect: () => setInformationOpen(true),
          },
        ]
      : []),
    ...(session.capabilities.updateMetadata
      ? [{ id: "rename", label: t("common.rename"), icon: <EditIcon />, onSelect: () => setRenaming(true) }]
      : []),
    ...(session.capabilities.deleteResource
      ? [
          {
            id: "delete",
            label: t("workspace.deleteResource"),
            icon: <phoneActionIcons.delete />,
            destructive: true,
            onSelect: () => setConfirmingDelete(true),
          },
        ]
      : []),
  ];

  const information = (
    <div className="phone-document-information-body">
      <p>
        {t(date.kind === "created" ? "workspace.createdOn" : "workspace.updatedOn", {
          date: formatDate(date.value),
        })}
      </p>
      {session.tags.length > 0 || session.capabilities.updateMetadata ? (
        <TagInput
          value={session.tags}
          onChange={session.setTags}
          readOnly={!session.capabilities.updateMetadata}
          label={t("workspace.tags")}
        />
      ) : null}
      {relatedBusinesses.map((business) => (
        <Button
          key={business.id}
          variant="secondary"
          data-testid={`resource-related-business-${business.id}`}
          onClick={() => onSelect({ kind: "councilBusiness", id: business.id }, business.folderPath)}
        >
          <CouncilBusinessGlyph business={business} />
          {business.title}
        </Button>
      ))}
    </div>
  );

  return (
    <div
      className={`phone-document phone-document-${resource.kind}`}
      data-fills-screen={fillsScreen ? "true" : undefined}
      data-testid="resource-phone-view"
      data-editing={editing ? "true" : undefined}
    >
      {writing.control}
      <PhoneDocumentActions actions={actions} />
      <RequestErrorBanner error={session.actionError} onDismiss={() => session.setActionError(null)} />
      <div className="phone-document-content">
        <ResourcePresentationBody
          resource={resource}
          representation={representation}
          mode={resource.kind === "text" && !editing ? "read" : session.mode}
          layout="workbench"
          capabilities={session.capabilities}
          content={session.content}
          remoteUrl={session.remoteUrl}
          mentionables={mentionables}
          canUploadImage={canUploadImage}
          submitting={session.submitting}
          refreshConflict={session.refreshConflict}
          onContentChange={session.setContent}
          onRemoteUrlChange={session.setRemoteUrl}
          onRemoteSubmit={() => session.save()}
          onUploadImage={uploadImage}
          onResolvedLegalReference={(resolved) => {
            session.adoptResolvedResource(resolved);
            onSelect({ kind: "resource", id: resolved.id }, resolved.path);
          }}
          onRefreshLegalReference={session.refreshLegalReference}
          onError={session.setActionError}
          onRegisterFlush={session.registerBodyFlush}
          autosaveEnabled={session.autosaveEnabled}
        />
      </div>
      {fillsScreen ? (
        <Modal
          open={informationOpen}
          title={t("workspace.information")}
          testId="phone-document-information-dialog"
          onClose={() => setInformationOpen(false)}
        >
          {information}
        </Modal>
      ) : (
        <CollapsibleSection
          className="phone-document-information"
          testId="phone-document-information"
          title={t("workspace.information")}
          open={informationOpen}
          onOpenChange={setInformationOpen}
        >
          {informationOpen ? information : null}
        </CollapsibleSection>
      )}
      <ResourceChangesControl
        openRef={openChanges}
        resourceId={resource.id}
        representation={representation}
        onInvalidated={() => {
          if (!session.dirty && !session.submitting) void session.reload();
        }}
      />
      {pdf.view}
      <PhoneRenameDialog
        open={renaming}
        name={resource.name}
        onClose={() => setRenaming(false)}
        onRename={async (name) => {
          session.setTitle(name);
          return session.save(name);
        }}
      />
      {confirmingDelete ? (
        <ResourceDeleteDialog
          name={resource.name}
          onConfirm={async () => {
            if (await session.remove()) onSelect(null);
          }}
          onClose={() => setConfirmingDelete(false)}
        />
      ) : null}
    </div>
  );
}
