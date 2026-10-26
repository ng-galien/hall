// biome-ignore-all lint/a11y/noNoninteractiveTabindex: The scrollable roll-call region must be focusable for keyboard scrolling.
import type { ProxyLimitException, ResourceDetail } from "@hall/api-contract";

type ProxyDocument = Extract<ResourceDetail, { kind: "document" }>;

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CheckCircleIcon,
  FileIcon,
  GavelIcon,
  MoreIcon,
  SignIcon,
  UploadIcon,
  WarningIcon,
} from "../../../components/icons";
import { Modal, RequestErrorBanner } from "../../../components/Ui";
import { MeetingAttendingPersons } from "../../../features/council-meetings/MeetingAttendingPersons";
import { MeetingEntryBlockers } from "../../../features/council-meetings/MeetingEntryBlockers";
import { MeetingReconvocationForm } from "../../../features/council-meetings/MeetingReconvocationForm";
import type { useCouncilMeeting } from "../../../hooks/useCouncilMeeting";
import { useSubmitting } from "../../../hooks/useSubmitting";
import { useI18n } from "../../../i18n/I18nProvider";
import type { CouncilMemberView } from "../../../models/directory";
import type { LiveMeetingMemberAttendance as Attendance, LiveMeetingPresentation } from "../../../models/liveMeeting";
import { type ApiErrorCode, apiErrorCode, sirenRepresentation } from "../../../services/apiClient";
import {
  listDocumentaryResourceFolder,
  openDocumentaryResource,
  uploadDocumentaryResource,
} from "../../../services/resourcesApi";
import { meetingOpeningBlock } from "../meetingOpeningPolicy";

const directStatuses = ["present", "excused", "absent"] as const;

export function memberInitials(member: CouncilMemberView): string {
  return `${member.contact.firstName.slice(0, 1)}${member.contact.lastName.slice(0, 1)}`;
}

export function RollCallView({
  aggregate,
  members,
  mode,
  meetingActions,
  onDone,
}: {
  aggregate: LiveMeetingPresentation;
  members: CouncilMemberView[];
  mode: "opening" | "adjust";
  meetingActions: ReturnType<typeof useCouncilMeeting>;
  onDone(): void;
}) {
  const { t, formatNumber } = useI18n();
  const { submitting, run } = useSubmitting();
  const [proxyDocuments, setProxyDocuments] = useState<ProxyDocument[]>([]);
  const [uploadError, setUploadError] = useState<ApiErrorCode | null>(null);
  const [proxyMemberId, setProxyMemberId] = useState<string | null>(null);
  const conduct = meetingActions.workspace?.conduct;
  // @implements-requirement HALL-FR-ATT-160
  const [proxyExceptions, setProxyExceptions] = useState<ReadonlyMap<string, ProxyLimitException>>(
    () => new Map((conduct?.proxyExceptions ?? []).map((entry) => [entry.proxyDocumentId, entry.basis])),
  );
  const persistedExceptions = JSON.stringify(conduct?.proxyExceptions ?? []);
  useEffect(() => {
    const entries: { proxyDocumentId: string; basis: ProxyLimitException }[] = JSON.parse(persistedExceptions);
    setProxyExceptions(new Map(entries.map((entry) => [entry.proxyDocumentId, entry.basis])));
  }, [persistedExceptions]);
  const proxyException = (documentId: string | null) => (documentId ? (proxyExceptions.get(documentId) ?? null) : null);
  const openingObservation = conduct?.quorumObservations
    .filter((observation) => observation.agendaItemId === null)
    .at(-1);
  const failedObservation = conduct?.quorumObservations
    .filter(
      (observation) =>
        observation.facts.verdict === "notMet" &&
        !conduct.reconvocations.some((entry) => entry.failedObservationId === observation.id),
    )
    .at(-1);
  const [draftOfficers, setDraftOfficers] = useState({
    chairMemberId: aggregate.meeting.chairMemberId,
    secretaryMemberId: aggregate.meeting.secretaryMemberId,
  });
  const meeting = { ...aggregate.meeting, ...draftOfficers };
  const [draftAttendance, setDraftAttendance] = useState<Attendance[]>(aggregate.attendance);
  const persistedAttendance = useRef(JSON.stringify(aggregate.attendance));
  useEffect(() => {
    const snapshot = JSON.stringify(aggregate.attendance);
    if (snapshot !== persistedAttendance.current) {
      persistedAttendance.current = snapshot;
      setDraftAttendance(aggregate.attendance);
    }
  }, [aggregate.attendance]);
  const attendanceByMember = useMemo(
    () => new Map(draftAttendance.map((attendance) => [attendance.memberId, attendance])),
    [draftAttendance],
  );
  useEffect(() => {
    let cancelled = false;
    const ids = [
      ...new Set(aggregate.attendance.flatMap((entry) => (entry.proxyDocumentId ? [entry.proxyDocumentId] : []))),
    ];
    void Promise.all(ids.map(openDocumentaryResource))
      .then((results) => {
        if (cancelled) return;
        setProxyDocuments((current) => [
          ...current,
          ...results.flatMap(({ data }) =>
            data.kind === "document" && !current.some((document) => document.id === data.id) ? [data] : [],
          ),
        ]);
      })
      .catch((error) => {
        if (!cancelled) setUploadError(apiErrorCode(error));
      });
    return () => {
      cancelled = true;
    };
  }, [aggregate.attendance]);
  const openingBlock = meetingOpeningBlock({
    ...aggregate,
    meeting,
    attendance: draftAttendance,
  });
  const openingBlockers = meetingActions.workspace!.meeting.openingBlockers;

  const record = (memberId: string, status: (typeof directStatuses)[number]) => {
    setDraftAttendance((current) => [
      ...current.filter((entry) => entry.memberId !== memberId),
      {
        id: attendanceByMember.get(memberId)?.id ?? `draft-${memberId}`,
        meetingId: meeting.id,
        memberId,
        status,
        proxyHolderMemberId: null,
        proxyDocumentId: null,
        version: 1,
      },
    ]);
  };

  const markAllPresent = () => {
    setDraftAttendance(
      members.map((member) => ({
        id: attendanceByMember.get(member.id)?.id ?? `draft-${member.id}`,
        meetingId: meeting.id,
        memberId: member.id,
        status: "present",
        proxyHolderMemberId: null,
        proxyDocumentId: null,
        version: 1,
      })),
    );
  };

  const submitProxy = (
    memberId: string,
    proxyHolderMemberId: string,
    proxyDocumentId: string,
    exception: ProxyLimitException | null,
  ) => {
    setProxyExceptions((current) => {
      const next = new Map(current);
      if (exception) next.set(proxyDocumentId, exception);
      else next.delete(proxyDocumentId);
      return next;
    });
    setDraftAttendance((current) => [
      ...current.filter((entry) => entry.memberId !== memberId),
      {
        id: attendanceByMember.get(memberId)?.id ?? `draft-${memberId}`,
        meetingId: meeting.id,
        memberId,
        status: "represented",
        proxyHolderMemberId,
        proxyDocumentId,
        version: 1,
      },
    ]);
    setProxyMemberId(null);
  };

  const uploadProxyDocument = (file: File) => {
    const form = new FormData();
    form.set("file", file);
    return run(async () => {
      setUploadError(null);
      try {
        const { data: documents } = await listDocumentaryResourceFolder("");
        const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
        const existing = documents.find(
          (document) =>
            document.kind === "document" && document.name === file.name && document.binary.contentSha256 === hash,
        );
        if (existing?.kind === "document") {
          setProxyDocuments((current) => [...current.filter((document) => document.id !== existing.id), existing]);
          return existing;
        }
        const representation = await sirenRepresentation("/resources");
        const { data } = await uploadDocumentaryResource(representation, form);
        if (data.kind === "document") {
          setProxyDocuments((current) => [...current, data]);
          return data;
        }
        return null;
      } catch (error) {
        setUploadError(apiErrorCode(error));
        return null;
      }
    });
  };

  const officersEditable = meetingActions.can("meeting.set-officers");
  const designateOfficer = (memberId: string, seat: "chair" | "secretary") => {
    const chairMemberId = seat === "chair" ? memberId : meeting.chairMemberId;
    const secretaryMemberId = seat === "secretary" ? memberId : meeting.secretaryMemberId;
    setDraftOfficers({ chairMemberId, secretaryMemberId });
  };

  const openMeeting = () =>
    run(async () => {
      if (!meeting.chairMemberId || !meeting.secretaryMemberId) return false;
      const result = await meetingActions.recordOpening({
        observedAt: new Date().toISOString(),
        chairMemberId: meeting.chairMemberId,
        secretaryMemberId: meeting.secretaryMemberId,
        attendance: draftAttendance.map((entry) =>
          entry.status === "represented"
            ? {
                councilMemberId: entry.memberId,
                status: entry.status,
                proxyHolderCouncilMemberId: entry.proxyHolderMemberId!,
                proxyDocumentId: entry.proxyDocumentId!,
                proxyException: proxyException(entry.proxyDocumentId),
              }
            : { councilMemberId: entry.memberId, status: entry.status },
        ),
      });
      if (result?.meeting.startedAt) onDone();
      return result !== null;
    });

  return (
    <section className="rollcall" aria-labelledby="rollcall-heading">
      <header className="rollcall-header">
        <div>
          <h1 id="rollcall-heading" data-testid="live-rollcall-heading">
            {t(mode === "opening" ? "live.rollCallTitle" : "live.rollCallAdjustTitle")}
          </h1>
          <p>
            {t("meeting.attendanceProgress", {
              recorded: formatNumber(draftAttendance.length),
              total: formatNumber(members.length),
            })}
          </p>
        </div>
        <div className="rollcall-header-actions">
          {meetingActions.can("meeting.record-attendance") ? (
            <Button
              variant="outline"
              disabled={submitting}
              onClick={markAllPresent}
              data-testid="live-attendance-all-present"
            >
              {t(submitting ? "common.saving" : "meeting.markAllPresent")}
            </Button>
          ) : null}
          {mode === "adjust" ? (
            <Button
              variant="default"
              data-testid="live-attendance-save"
              disabled={submitting || !meetingActions.can("meeting.record-attendance-events")}
              onClick={() =>
                void run(async () => {
                  const saved = await meetingActions.recordAttendanceEvents({
                    observedAt: new Date().toISOString(),
                    changes: draftAttendance.map((entry) => ({
                      councilMemberId: entry.memberId,
                      status: entry.status,
                      proxyHolderCouncilMemberId: entry.proxyHolderMemberId,
                      proxyDocumentId: entry.proxyDocumentId,
                      proxyException: entry.status === "represented" ? proxyException(entry.proxyDocumentId) : null,
                    })),
                  });
                  if (saved) onDone();
                })
              }
            >
              {t("live.backToConduct")}
            </Button>
          ) : null}
        </div>
      </header>

      <section
        className="rollcall-content"
        data-testid="live-rollcall-content"
        tabIndex={0}
        aria-labelledby="rollcall-heading"
      >
        <ul className="rollcall-grid">
          {members.map((member) => {
            const current = attendanceByMember.get(member.id);
            const editingProxy = proxyMemberId === member.id;
            const isChair = meeting.chairMemberId === member.id;
            const isSecretary = meeting.secretaryMemberId === member.id;
            const officerAbsent = (isChair || isSecretary) && Boolean(current) && current?.status !== "present";
            return (
              <li
                className={`rollcall-tile rollcall-tile-${current?.status ?? "unrecorded"}${isChair || isSecretary ? " rollcall-tile-officer" : ""}`}
                key={member.id}
              >
                <div className="rollcall-tile-identity">
                  <span className="rollcall-avatar" aria-hidden="true">
                    {memberInitials(member)}
                  </span>
                  <div>
                    <strong>
                      {member.contact.firstName} {member.contact.lastName}
                    </strong>
                    <span className="rollcall-tile-subline">
                      {t(`role.${member.role}`)}
                      {isChair ? (
                        <span
                          className={`rollcall-officer-chip${officerAbsent ? " rollcall-officer-chip-warning" : ""}`}
                          title={officerAbsent ? t("live.officerMustBePresent") : undefined}
                        >
                          {officerAbsent ? <WarningIcon aria-hidden="true" /> : <GavelIcon aria-hidden="true" />}
                          {t("live.chairChip")}
                        </span>
                      ) : null}
                      {isSecretary ? (
                        <span
                          className={`rollcall-officer-chip${officerAbsent ? " rollcall-officer-chip-warning" : ""}`}
                          title={officerAbsent ? t("live.officerMustBePresent") : undefined}
                        >
                          {officerAbsent ? <WarningIcon aria-hidden="true" /> : <SignIcon aria-hidden="true" />}
                          {t("live.secretaryChip")}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  {officersEditable ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          className="rollcall-tile-menu"
                          data-testid={`live-member-actions-${member.id}`}
                          variant="ghost"
                          size="icon"
                          aria-label={t("live.tileMenu")}
                        >
                          <MoreIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem
                          disabled={isChair || submitting}
                          data-testid={`live-designate-chair-${member.id}`}
                          onSelect={() => designateOfficer(member.id, "chair")}
                        >
                          <GavelIcon />
                          {t("live.makeChair")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={isSecretary || submitting}
                          data-testid={`live-designate-secretary-${member.id}`}
                          onSelect={() => designateOfficer(member.id, "secretary")}
                        >
                          <SignIcon />
                          {t("live.makeSecretary")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>

                <div className="rollcall-tile-choices">
                  {directStatuses.map((status) => (
                    <button
                      className={`rollcall-choice rollcall-choice-${status}${current?.status === status ? " rollcall-choice-active" : ""}`}
                      type="button"
                      aria-pressed={current?.status === status}
                      disabled={submitting}
                      data-testid={`live-attendance-${member.id}-${status}`}
                      onClick={() => record(member.id, status)}
                      key={status}
                    >
                      {t(`attendance.${status}`)}
                    </button>
                  ))}
                  <button
                    className={`rollcall-choice rollcall-choice-represented${current?.status === "represented" ? " rollcall-choice-active" : ""}`}
                    type="button"
                    aria-pressed={current?.status === "represented"}
                    aria-expanded={editingProxy}
                    disabled={submitting}
                    onClick={() => setProxyMemberId(editingProxy ? null : member.id)}
                    data-testid={`live-attendance-${member.id}-represented`}
                  >
                    {t("live.proxyChoice")}
                  </button>
                </div>
                {current?.status === "represented" && current.proxyHolderMemberId ? (
                  <p className="rollcall-proxy-summary">
                    {t("ballot.representedBy", {
                      holder: (() => {
                        const holder = members.find((candidate) => candidate.id === current.proxyHolderMemberId);
                        return holder ? `${holder.contact.firstName} ${holder.contact.lastName}` : "";
                      })(),
                    })}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
        {conduct ? (
          <div className="rollcall-attending">
            <MeetingAttendingPersons
              entries={conduct.auxiliaryAttendances}
              members={members}
              canDeclare={meetingActions.can("meeting.declare-auxiliary-attendance")}
              canCorrect={meetingActions.can("meeting.correct-auxiliary-attendance")}
              onDeclare={meetingActions.declareAuxiliaryAttendance}
              onCorrect={meetingActions.correctAuxiliaryAttendance}
            />
          </div>
        ) : null}
      </section>
      {mode === "opening" ? (
        <footer className="rollcall-footer">
          <div role="status">
            <MeetingEntryBlockers blockers={openingBlockers} />
            {openingObservation?.facts.verdict === "notMet" ? (
              <span className="rollcall-check rollcall-check-pending" data-testid="live-opening-quorum-not-met">
                <WarningIcon aria-hidden="true" />
                {t("meeting.openingRecordedWithoutQuorum", {
                  present: formatNumber(openingObservation.facts.presentCount),
                  required: formatNumber(openingObservation.facts.requiredPresent),
                })}
              </span>
            ) : openingBlock ? (
              <span className="rollcall-check rollcall-check-pending">
                <WarningIcon aria-hidden="true" />
                {t(`meeting.opening.${openingBlock}`)}
              </span>
            ) : openingBlockers.length ? null : (
              <span className="rollcall-check rollcall-check-prepared" data-testid="live-rollcall-prepared">
                <CheckCircleIcon aria-hidden="true" />
                {t(
                  meetingActions.can("meeting.record-opening")
                    ? "live.rollCallPrepared"
                    : "live.rollCallOpeningUnavailable",
                )}
              </span>
            )}
          </div>
          <div className="rollcall-footer-actions">
            {failedObservation && meetingActions.can("meeting.record-reconvocation") ? (
              <MeetingReconvocationForm
                observation={failedObservation}
                agendaItems={meetingActions.workspace?.agendaItems ?? []}
                onSubmit={meetingActions.recordReconvocation}
                error={meetingActions.actionError}
              />
            ) : null}
            <button
              className="live-primary-action"
              type="button"
              disabled={
                submitting ||
                Boolean(openingBlock) ||
                openingBlockers.length > 0 ||
                !meetingActions.can("meeting.record-opening")
              }
              onClick={() => void openMeeting()}
              data-testid="live-meeting-start"
            >
              {t(submitting ? "common.saving" : "meeting.action.open")}
            </button>
          </div>
        </footer>
      ) : null}

      {(() => {
        const proxyMember = members.find((member) => member.id === proxyMemberId) ?? null;
        if (!proxyMember) return null;
        const holderCandidates = members
          .filter(
            (candidate) =>
              candidate.id !== proxyMember.id && attendanceByMember.get(candidate.id)?.status === "present",
          )
          .map((candidate) => ({
            member: candidate,
            alreadyHolding: [...attendanceByMember.values()].some(
              (attendance) => attendance.proxyHolderMemberId === candidate.id && attendance.memberId !== proxyMember.id,
            ),
          }));
        return (
          <ProxyModal
            member={proxyMember}
            current={attendanceByMember.get(proxyMember.id)}
            currentException={proxyException(attendanceByMember.get(proxyMember.id)?.proxyDocumentId ?? null)}
            holderCandidates={holderCandidates}
            proxyDocuments={proxyDocuments}
            submitting={submitting}
            uploadError={uploadError}
            onDismissError={() => setUploadError(null)}
            onUploadFile={uploadProxyDocument}
            onSubmit={(holderId, documentId, exception) => submitProxy(proxyMember.id, holderId, documentId, exception)}
            onClose={() => setProxyMemberId(null)}
          />
        );
      })()}
    </section>
  );
}

const proxyExceptionChoices = ["none", "illness", "maternityLeave"] as const;

function ProxyModal({
  member,
  current,
  currentException,
  holderCandidates,
  proxyDocuments,
  submitting,
  onUploadFile,
  uploadError,
  onDismissError,
  onSubmit,
  onClose,
}: {
  member: CouncilMemberView;
  current: Attendance | undefined;
  currentException: ProxyLimitException | null;
  holderCandidates: { member: CouncilMemberView; alreadyHolding: boolean }[];
  proxyDocuments: ProxyDocument[];
  uploadError: ApiErrorCode | null;
  onDismissError(): void;
  submitting: boolean;
  onUploadFile(file: File): Promise<ProxyDocument | null | undefined>;
  onSubmit(holderId: string, documentId: string, exception: ProxyLimitException | null): void;
  onClose(): void;
}) {
  const { t, formatFileSize } = useI18n();
  const [holderId, setHolderId] = useState<string | null>(current?.proxyHolderMemberId ?? null);
  const [documentId, setDocumentId] = useState<string | null>(current?.proxyDocumentId ?? null);
  const [exception, setException] = useState<ProxyLimitException | null>(currentException);
  const fileInput = useRef<HTMLInputElement | null>(null);

  return (
    <Modal
      open
      testId="live-proxy-dialog"
      title={t("live.proxyModalTitle", { member: `${member.contact.firstName} ${member.contact.lastName}` })}
      onClose={onClose}
    >
      <div className="modal-form">
        <p className="text-sm text-muted">{t("live.proxyModalDescription")}</p>
        <RequestErrorBanner error={uploadError} onDismiss={onDismissError} />

        <section aria-labelledby="proxy-holder-heading">
          <h3 className="picker-heading" id="proxy-holder-heading">
            {t("meeting.proxyHolder")}
          </h3>
          {holderCandidates.length === 0 ? (
            <p className="picker-empty">{t("live.noHolderCandidates")}</p>
          ) : (
            <div className="picker-grid">
              {holderCandidates.map(({ member: candidate, alreadyHolding }) => (
                <button
                  className={`picker-card${holderId === candidate.id ? " picker-card-active" : ""}`}
                  type="button"
                  aria-pressed={holderId === candidate.id}
                  disabled={alreadyHolding}
                  data-testid={`live-proxy-holder-${candidate.id}`}
                  onClick={() => setHolderId(candidate.id)}
                  key={candidate.id}
                >
                  <span className="rollcall-avatar" aria-hidden="true">
                    {memberInitials(candidate)}
                  </span>
                  <span className="picker-card-copy">
                    <strong>
                      {candidate.contact.firstName} {candidate.contact.lastName}
                    </strong>
                    <span>{alreadyHolding ? t("live.alreadyHoldsProxy") : t(`role.${candidate.role}`)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="proxy-document-heading">
          <h3 className="picker-heading" id="proxy-document-heading">
            {t("meeting.proxyDocument")}
          </h3>
          <div className="picker-grid">
            {proxyDocuments.map((document) => (
              <button
                className={`picker-card${documentId === document.id ? " picker-card-active" : ""}`}
                type="button"
                aria-pressed={documentId === document.id}
                data-testid={`live-proxy-document-${document.id}`}
                onClick={() => setDocumentId(document.id)}
                key={document.id}
              >
                <FileIcon aria-hidden="true" />
                <span className="picker-card-copy">
                  <strong>{document.name}</strong>
                  <span>{formatFileSize(document.binary.byteSize)}</span>
                </span>
              </button>
            ))}
            <button
              data-testid="live-proxy-upload"
              disabled={submitting}
              className="picker-card picker-card-upload"
              type="button"
              onClick={() => fileInput.current?.click()}
            >
              <UploadIcon aria-hidden="true" />
              <span className="picker-card-copy">
                <strong>{t("live.uploadProxy")}</strong>
                <span>{t("live.uploadProxyHint")}</span>
              </span>
            </button>
            <input
              data-testid="live-proxy-file"
              disabled={submitting}
              ref={fileInput}
              type="file"
              aria-label={t("documents.file")}
              className="visually-hidden-input"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file)
                  void onUploadFile(file).then((document) => {
                    if (document) setDocumentId(document.id);
                  });
                event.currentTarget.value = "";
              }}
            />
          </div>
        </section>

        <fieldset className="grid gap-2" data-testid="live-proxy-exception">
          <legend className="picker-heading">{t("live.proxyException")}</legend>
          <p className="text-sm text-muted">{t("live.proxyExceptionHint")}</p>
          {proxyExceptionChoices.map((choice) => (
            <label className="flex items-center gap-2" key={choice}>
              <input
                type="radio"
                name="proxyException"
                data-testid={`live-proxy-exception-${choice}`}
                checked={(exception ?? "none") === choice}
                onChange={() => setException(choice === "none" ? null : choice)}
              />
              {t(`live.proxyException.${choice}`)}
            </label>
          ))}
        </fieldset>

        <div className="rollcall-proxy-actions">
          <Button data-testid="live-proxy-cancel" variant="outline" type="button" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="default"
            data-testid="live-proxy-confirm"
            disabled={submitting || !holderId || !documentId}
            onClick={() => holderId && documentId && onSubmit(holderId, documentId, exception)}
          >
            {t(submitting ? "common.saving" : "meeting.confirmProxy")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
