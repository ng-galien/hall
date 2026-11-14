import type { MeetingProxyRegistration } from "@hall/api-contract";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { CreateButton } from "@/components/ui/create-button";
import { Field, FieldRow } from "@/components/ui/field";
import { PrintIcon, ProxyIcon, UploadIcon } from "../../components/icons";
import { EntitySelect } from "../../components/search/EntitySelect";
import { ResourceSearchField } from "../../components/search/ResourceSearchField";
import { Modal, RequestErrorBanner } from "../../components/Ui";
import { ListRow, ListRowIcon, ListRows } from "../../components/ui/list-row";
import type { useCouncilMeeting } from "../../hooks/useCouncilMeeting";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import type { LiveMeetingPresentation } from "../../models/liveMeeting";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { openDocumentaryResource } from "../../services/resourcesApi";
import { useCouncilMembersStore } from "../../stores/councilMembersStore";
import { DocumentObjectViewer } from "../documents/DocumentObjectViewer";
import { ResourcePreview } from "../documents/ResourcePreview";
import { MeetingProxyFormDialog } from "./MeetingProxyFormDialog";
import { formatMeetingLabel } from "./meetingPresentation";
import { type ProxyDocument, uploadProxyDocument } from "./proxyDocumentUpload";

type ProxyEditing = { kind: "registration" } | { kind: "change"; registration: MeetingProxyRegistration };

// @implements-requirement HALL-FR-ATT-180 (« Générer un pouvoir » belongs to the proxies section)
// @implements-requirement HALL-FR-ATT-190
/**
 * The written proxies of a meeting in preparation or in progress: « Générer un pouvoir » and the proxies registered
 * before the opening, each with the member who gives it, the member who receives it and its signed document.
 */
export function MeetingProxiesSection({
  meetingActions,
  aggregate,
}: {
  meetingActions: ReturnType<typeof useCouncilMeeting>;
  aggregate: LiveMeetingPresentation;
}) {
  const { t, formatDate } = useI18n();
  const { members } = useCouncilMembersStore();
  const meeting = meetingActions.workspace!.meeting;
  const registrations = meetingActions.workspace?.conduct?.proxyRegistrations ?? [];
  const canRegister = meetingActions.can("meeting.register-proxy");
  const canCorrect = meetingActions.can("meeting.correct-proxy-registration");
  const canUploadDocument = meetingActions.can("meeting.upload-proxy-document");
  const proxyFormHref = meetingActions.link("proxy-form");
  const meetingLabel = formatMeetingLabel(meeting, t("meetings.occurrenceLabel"), formatDate);
  const [open, setOpen] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [viewer, setViewer] = useState<{ title: string; href: string } | null>(null);
  const [editing, setEditing] = useState<ProxyEditing | null>(null);
  const [withdrawing, setWithdrawing] = useState<MeetingProxyRegistration | null>(null);
  const [previewedDocumentId, setPreviewedDocumentId] = useState<string | null>(null);
  const [documentNames, setDocumentNames] = useState<ReadonlyMap<string, string>>(new Map());
  const { submitting, run } = useSubmitting();
  const memberName = (memberId: string) => {
    const member = members.find((candidate) => candidate.id === memberId);
    return member ? `${member.contact.firstName} ${member.contact.lastName}` : "";
  };
  const documentIds = registrations.map((registration) => registration.proxyDocumentId).join(",");
  useEffect(() => {
    let active = true;
    const ids = documentIds ? documentIds.split(",") : [];
    void Promise.all(ids.map((id) => openDocumentaryResource(id).then(({ data }) => [id, data.name] as const))).then(
      (names) => {
        if (active) setDocumentNames(new Map(names));
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [documentIds]);

  if (aggregate.meeting.status === "closed") return null;
  const rowLabels = (registration: MeetingProxyRegistration) => ({
    grantor: memberName(registration.grantorCouncilMemberId),
    holder: memberName(registration.holderCouncilMemberId),
  });

  return (
    <>
      <CollapsibleSection
        title={t("proxies.title")}
        count={registrations.length}
        open={open}
        onOpenChange={setOpen}
        testId="meeting-proxies"
        className="meeting-documents"
        actions={
          canRegister ? (
            <CreateButton
              placement="inline"
              label={t("proxies.register")}
              testId="meeting-proxy-register"
              options={[
                {
                  id: "proxy",
                  label: t("proxies.register"),
                  Icon: ProxyIcon,
                  nature: "council",
                  onSelect: () => setEditing({ kind: "registration" }),
                },
              ]}
            />
          ) : undefined
        }
      >
        <ListRows>
          {proxyFormHref ? (
            <ListRow
              data-testid="meeting-document-proxy-form"
              head={
                <ListRowIcon nature="council">
                  <ProxyIcon />
                </ListRowIcon>
              }
              title={t("meeting.proxyForm")}
              detail={
                <span data-testid="meeting-document-proxy-form-state">{t("meeting.documents.proxyFormState")}</span>
              }
              action={
                <Button variant="secondary" data-testid="meeting-proxy-form-open" onClick={() => setFormOpen(true)}>
                  <PrintIcon aria-hidden="true" />
                  {t("meeting.proxyFormOpen")}
                </Button>
              }
            />
          ) : null}
          {registrations.map((registration) => (
            <ListRow
              key={registration.id}
              data-testid={`meeting-proxy-${registration.grantorCouncilMemberId}`}
              head={
                <ListRowIcon nature="council">
                  <ProxyIcon />
                </ListRowIcon>
              }
              title={t("proxies.row", rowLabels(registration))}
              detail={documentNames.get(registration.proxyDocumentId) ?? t("common.loading")}
              onOpen={() => setPreviewedDocumentId(registration.proxyDocumentId)}
              openTestId={`meeting-proxy-document-${registration.grantorCouncilMemberId}`}
              action={
                canCorrect ? (
                  <>
                    <Button
                      variant="secondary"
                      data-testid={`meeting-proxy-change-${registration.grantorCouncilMemberId}`}
                      onClick={() => setEditing({ kind: "change", registration })}
                    >
                      {t("common.edit")}
                    </Button>
                    <Button
                      variant="secondary"
                      data-testid={`meeting-proxy-withdraw-${registration.grantorCouncilMemberId}`}
                      onClick={() => setWithdrawing(registration)}
                    >
                      {t("proxies.withdraw")}
                    </Button>
                  </>
                ) : undefined
              }
            />
          ))}
        </ListRows>
      </CollapsibleSection>
      {proxyFormHref ? (
        <MeetingProxyFormDialog
          open={formOpen}
          proxyFormHref={proxyFormHref}
          onClose={() => setFormOpen(false)}
          onGenerate={(href) => {
            setFormOpen(false);
            setViewer({ title: `${t("meeting.proxyForm")} · ${meetingLabel}`, href });
          }}
        />
      ) : null}
      {viewer ? (
        <DocumentObjectViewer
          title={viewer.title}
          objectUrl={viewer.href}
          mediaType="application/pdf"
          onClose={() => setViewer(null)}
        />
      ) : null}
      {previewedDocumentId ? (
        <ResourcePreview resourceId={previewedDocumentId} onClose={() => setPreviewedDocumentId(null)} />
      ) : null}
      {editing ? (
        <ProxyRegistrationDialog
          editing={editing}
          documentName={(id) => documentNames.get(id) ?? ""}
          onUploadFile={canUploadDocument ? (file) => uploadProxyDocument(meeting.id, file) : undefined}
          error={meetingActions.actionError}
          onClose={() => {
            meetingActions.clearActionError();
            setEditing(null);
          }}
          onSubmit={(parties) =>
            editing.kind === "registration"
              ? meetingActions.registerProxy(parties)
              : meetingActions.correctProxyRegistration({
                  kind: "change",
                  registrationId: editing.registration.id,
                  ...parties,
                })
          }
        />
      ) : null}
      {withdrawing ? (
        <Modal
          open
          title={t("proxies.withdrawTitle")}
          testId="meeting-proxy-withdraw-dialog"
          onClose={() => {
            if (submitting) return;
            meetingActions.clearActionError();
            setWithdrawing(null);
          }}
        >
          <div className="modal-form">
            <RequestErrorBanner error={meetingActions.actionError} />
            <p>{t("proxies.withdrawConfirmation", rowLabels(withdrawing))}</p>
            <div className="dialog-actions">
              <Button
                variant="secondary"
                disabled={submitting}
                data-testid="meeting-proxy-withdraw-cancel"
                onClick={() => {
                  meetingActions.clearActionError();
                  setWithdrawing(null);
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="danger"
                disabled={submitting}
                data-testid="meeting-proxy-withdraw-confirm"
                onClick={() =>
                  void run(async () => {
                    const withdrawn = await meetingActions.correctProxyRegistration({
                      kind: "withdrawal",
                      registrationId: withdrawing.id,
                    });
                    if (withdrawn) setWithdrawing(null);
                  })
                }
              >
                {t(submitting ? "common.saving" : "proxies.withdraw")}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

/** Registers or changes a proxy: the member who gives it, the member who receives it and the signed document. */
function ProxyRegistrationDialog({
  editing,
  documentName,
  onUploadFile,
  error,
  onClose,
  onSubmit,
}: {
  editing: ProxyEditing;
  documentName(id: string): string;
  onUploadFile?: (file: File) => Promise<ProxyDocument | null>;
  error: ApiErrorCode | null;
  onClose(): void;
  onSubmit(parties: {
    grantorCouncilMemberId: string;
    holderCouncilMemberId: string;
    proxyDocumentId: string;
  }): Promise<boolean>;
}) {
  const { t } = useI18n();
  const { members } = useCouncilMembersStore();
  const current = editing.kind === "change" ? editing.registration : null;
  const [grantor, setGrantor] = useState(current?.grantorCouncilMemberId ?? "");
  const [holder, setHolder] = useState(current?.holderCouncilMemberId ?? "");
  const [document, setDocument] = useState<{ id: string; label: string } | null>(
    current ? { id: current.proxyDocumentId, label: documentName(current.proxyDocumentId) } : null,
  );
  const [uploadError, setUploadError] = useState<ApiErrorCode | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const { submitting, run } = useSubmitting();
  const options = members
    .filter((member) => member.active)
    .map((member) => ({ value: member.id, label: `${member.contact.firstName} ${member.contact.lastName}` }));
  const complete = Boolean(grantor && holder && grantor !== holder && document);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!complete || !document) return;
    void run(async () => {
      if (
        await onSubmit({ grantorCouncilMemberId: grantor, holderCouncilMemberId: holder, proxyDocumentId: document.id })
      )
        onClose();
    });
  };
  return (
    <Modal
      open
      title={t(editing.kind === "registration" ? "proxies.register" : "proxies.change")}
      testId="meeting-proxy-dialog"
      onClose={() => {
        if (!submitting) onClose();
      }}
    >
      <form className="modal-form" onSubmit={submit}>
        <RequestErrorBanner error={uploadError ?? error} />
        <FieldRow>
          <Field label={t("meeting.proxyFormGrantor")}>
            <EntitySelect
              type="member"
              value={grantor}
              onValueChange={(value) => {
                setGrantor(value);
                if (value === holder) setHolder("");
              }}
              testId="meeting-proxy-registration-grantor"
              options={options}
            />
          </Field>
          <Field label={t("meeting.proxyFormHolder")}>
            <EntitySelect
              type="member"
              value={holder}
              onValueChange={setHolder}
              testId="meeting-proxy-registration-holder"
              options={options.filter((option) => option.value !== grantor)}
            />
          </Field>
        </FieldRow>
        <Field label={t("proxies.document")}>
          <ResourceSearchField
            testId="meeting-proxy-registration-document"
            label={document?.label || t("proxies.chooseDocument")}
            scope={{ types: ["document"] }}
            disabled={submitting}
            onPick={({ id, label }) => setDocument({ id, label })}
          />
        </Field>
        {onUploadFile ? (
          <>
            <Button
              type="button"
              variant="secondary"
              className="justify-self-start"
              data-testid="meeting-proxy-registration-upload"
              disabled={submitting}
              onClick={() => fileInput.current?.click()}
            >
              <UploadIcon aria-hidden="true" />
              {t("live.uploadProxy")}
            </Button>
            <input
              data-testid="meeting-proxy-registration-file"
              ref={fileInput}
              type="file"
              aria-label={t("documents.file")}
              className="visually-hidden-input"
              disabled={submitting}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (!file) return;
                void run(async () => {
                  setUploadError(null);
                  try {
                    const uploaded = await onUploadFile(file);
                    if (uploaded) setDocument({ id: uploaded.id, label: uploaded.name });
                  } catch (failure) {
                    setUploadError(apiErrorCode(failure));
                  }
                });
              }}
            />
          </>
        ) : null}
        <div className="dialog-actions">
          <Button
            type="button"
            variant="secondary"
            data-testid="meeting-proxy-registration-cancel"
            disabled={submitting}
            onClick={onClose}
          >
            {t("common.cancel")}
          </Button>
          <Button type="submit" data-testid="meeting-proxy-registration-submit" disabled={submitting || !complete}>
            {t(submitting ? "common.saving" : "common.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
