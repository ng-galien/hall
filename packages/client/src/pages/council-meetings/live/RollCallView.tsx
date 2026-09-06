import type { DocumentResource } from "@hall/domain";
import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CheckCircleIcon,
  FileIcon,
  GavelIcon,
  MoreIcon,
  SignIcon,
  UploadIcon,
  WarningIcon,
} from "../../../components/icons";
import { Modal } from "../../../components/Ui";
import type { useCouncilMeeting } from "../../../hooks/useCouncilMeeting";
import { useSubmitting } from "../../../hooks/useSubmitting";
import { useI18n } from "../../../i18n/I18nProvider";
import { useResourcesStore } from "../../../stores/resourcesStore";
import type { LiveMeetingMemberAttendance as Attendance, LiveMeetingPresentation } from "../../../models/liveMeeting";
import type { CouncilMemberView } from "../../../models/directory";
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
  const navigate = useNavigate();
  const { resources, upload, load: reloadResources } = useResourcesStore();
  const [proxyMemberId, setProxyMemberId] = useState<string | null>(null);
  const reconveneStartsAtId = useId();
  const reconveneNoticeId = useId();
  const reconveneLocationId = useId();
  const [draftOfficers, setDraftOfficers] = useState({
    chairMemberId: aggregate.meeting.chairMemberId,
    secretaryMemberId: aggregate.meeting.secretaryMemberId,
  });
  const meeting = { ...aggregate.meeting, ...draftOfficers };
  const [draftAttendance, setDraftAttendance] = useState<Attendance[]>(aggregate.attendance);
  useEffect(() => setDraftAttendance(aggregate.attendance), [aggregate.attendance]);
  const attendanceByMember = useMemo(
    () => new Map(draftAttendance.map((attendance) => [attendance.memberId, attendance])),
    [draftAttendance],
  );
  const proxyDocuments = resources.filter(
    (resource): resource is DocumentResource =>
      resource.kind === "document" && resource.meetingId === meeting.id && resource.category === "proxy",
  );
  const draftPresent = draftAttendance.filter((entry) => entry.status === "present").length;
  const openingBlock = meetingOpeningBlock({
    ...aggregate,
    meeting,
    attendance: draftAttendance,
    quorum: {
      ...aggregate.quorum,
      physicallyPresent: draftPresent,
      reached: draftPresent >= aggregate.quorum.required,
    },
  });

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

  const submitProxy = (memberId: string, proxyHolderMemberId: string, proxyDocumentId: string) => {
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
    form.set("meetingId", meeting.id);
    form.set("category", "proxy");
    form.set("file", file);
    void run(async () => {
      const uploaded = await upload(form);
      if (uploaded) await reloadResources();
      return uploaded;
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
      if (draftAttendance.length > 0) {
        const recorded = await meetingActions.recordAttendance({
          attendance: draftAttendance.map((entry) =>
            entry.status === "represented"
              ? {
                  councilMemberId: entry.memberId,
                  status: entry.status,
                  proxyHolderCouncilMemberId: entry.proxyHolderMemberId!,
                  proxyDocumentId: entry.proxyDocumentId!,
                }
              : { councilMemberId: entry.memberId, status: entry.status },
          ),
        });
        if (!recorded) return false;
      }
      if (!meeting.chairMemberId || !meeting.secretaryMemberId) return false;
      const officersSaved = await meetingActions.setOfficers({
        chairMemberId: meeting.chairMemberId,
        secretaryMemberId: meeting.secretaryMemberId,
      });
      if (!officersSaved) return false;
      const opened = await meetingActions.changeStatus("inProgress");
      if (opened) onDone();
      return opened;
    });

  const reconvene = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const reconvenedMeeting = await meetingActions.reconvene({
        startsAt: new Date(String(form.get("startsAt"))).toISOString(),
        meetingNoticeSentAt: new Date(String(form.get("meetingNoticeSentAt"))).toISOString(),
        location: form.get("location"),
        chairMemberId: meeting.chairMemberId,
        secretaryMemberId: meeting.secretaryMemberId,
      });
      if (reconvenedMeeting) await navigate(`/meetings/${reconvenedMeeting.slug}`);
      return Boolean(reconvenedMeeting);
    });
  };

  return (
    <section className="rollcall" aria-labelledby="rollcall-heading">
      <header className="rollcall-header">
        <div>
          <h1 id="rollcall-heading">{t(mode === "opening" ? "live.rollCallTitle" : "live.rollCallAdjustTitle")}</h1>
          <p>
            {t("meeting.attendanceProgress")
              .replace("{recorded}", formatNumber(draftAttendance.length))
              .replace("{total}", formatNumber(members.length))}
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
            <Button variant="default" onClick={onDone}>
              {t("live.backToConduct")}
            </Button>
          ) : null}
        </div>
      </header>

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
                  {t("ballot.representedBy").replace(
                    "{holder}",
                    (() => {
                      const holder = members.find((candidate) => candidate.id === current.proxyHolderMemberId);
                      return holder ? `${holder.contact.firstName} ${holder.contact.lastName}` : "";
                    })(),
                  )}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {mode === "opening" ? (
        <footer className="rollcall-footer">
          {meetingActions.can("meeting.reconvene") ? (
            <form className="rollcall-reconvene" onSubmit={reconvene}>
              <div className="rollcall-reconvene-copy">
                <WarningIcon aria-hidden="true" />
                <div>
                  <strong>{t("meeting.quorumFailureRecorded")}</strong>
                  <p>{t("meeting.reconveneDescription")}</p>
                </div>
              </div>
              <div className="rollcall-reconvene-fields">
                <div className="grid gap-1.5">
                  <Label htmlFor={reconveneStartsAtId}>{t("meetings.dateTime")}</Label>
                  <Input id={reconveneStartsAtId} name="startsAt" type="datetime-local" required />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={reconveneNoticeId}>{t("meeting.noticeSentAt")}</Label>
                  <Input id={reconveneNoticeId} name="meetingNoticeSentAt" type="datetime-local" required />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={reconveneLocationId}>{t("meetings.location")}</Label>
                  <Input id={reconveneLocationId} name="location" defaultValue={meeting.location ?? ""} required />
                </div>
              </div>
              <Button variant="default" type="submit" disabled={submitting}>
                {t(submitting ? "common.saving" : "meeting.reconveneAction")}
              </Button>
            </form>
          ) : (
            <>
              <div role="status">
                {openingBlock ? (
                  <span className="rollcall-check rollcall-check-pending">
                    <WarningIcon aria-hidden="true" />
                    {t(`meeting.opening.${openingBlock}`)}
                  </span>
                ) : (
                  <span className="rollcall-check rollcall-check-ready">
                    <CheckCircleIcon aria-hidden="true" />
                    {t("live.readyToOpen")}
                  </span>
                )}
              </div>
              <div className="rollcall-footer-actions">
                {meetingActions.can("meeting.record-quorum-failure") ? (
                  <Button
                    variant="outline"
                    disabled={submitting}
                    onClick={() => void run(meetingActions.recordQuorumFailure)}
                  >
                    {t(submitting ? "common.saving" : "meeting.recordQuorumFailure")}
                  </Button>
                ) : null}
                <button
                  className="live-primary-action"
                  type="button"
                  disabled={submitting || Boolean(openingBlock) || !meetingActions.can("meeting.open")}
                  onClick={() => void openMeeting()}
                  data-testid="live-meeting-start"
                >
                  {t(submitting ? "common.saving" : "meeting.action.open")}
                </button>
              </div>
            </>
          )}
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
            holderCandidates={holderCandidates}
            proxyDocuments={proxyDocuments}
            submitting={submitting}
            onUploadFile={uploadProxyDocument}
            onSubmit={(holderId, documentId) => submitProxy(proxyMember.id, holderId, documentId)}
            onClose={() => setProxyMemberId(null)}
          />
        );
      })()}
    </section>
  );
}

function ProxyModal({
  member,
  current,
  holderCandidates,
  proxyDocuments,
  submitting,
  onUploadFile,
  onSubmit,
  onClose,
}: {
  member: CouncilMemberView;
  current: Attendance | undefined;
  holderCandidates: { member: CouncilMemberView; alreadyHolding: boolean }[];
  proxyDocuments: DocumentResource[];
  submitting: boolean;
  onUploadFile(file: File): void;
  onSubmit(holderId: string, documentId: string): void;
  onClose(): void;
}) {
  const { t, formatFileSize } = useI18n();
  const [holderId, setHolderId] = useState<string | null>(current?.proxyHolderMemberId ?? null);
  const [documentId, setDocumentId] = useState<string | null>(current?.proxyDocumentId ?? null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const previousDocumentCount = useRef(proxyDocuments.length);

  useEffect(() => {
    if (proxyDocuments.length > previousDocumentCount.current) {
      const newest = [...proxyDocuments].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
      if (newest) setDocumentId(newest.id);
    }
    previousDocumentCount.current = proxyDocuments.length;
  }, [proxyDocuments]);

  return (
    <Modal
      open
      title={t("live.proxyModalTitle").replace("{member}", `${member.contact.firstName} ${member.contact.lastName}`)}
      onClose={onClose}
    >
      <div className="modal-form">
        <p className="text-sm text-muted">{t("live.proxyModalDescription")}</p>

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
                onClick={() => setDocumentId(document.id)}
                key={document.id}
              >
                <FileIcon aria-hidden="true" />
                <span className="picker-card-copy">
                  <strong>{document.fileName}</strong>
                  <span>{formatFileSize(document.byteSize)}</span>
                </span>
              </button>
            ))}
            <button className="picker-card picker-card-upload" type="button" onClick={() => fileInput.current?.click()}>
              <UploadIcon aria-hidden="true" />
              <span className="picker-card-copy">
                <strong>{t("live.uploadProxy")}</strong>
                <span>{t("live.uploadProxyHint")}</span>
              </span>
            </button>
            <input
              ref={fileInput}
              type="file"
              aria-label={t("documents.file")}
              className="visually-hidden-input"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) onUploadFile(file);
                event.currentTarget.value = "";
              }}
            />
          </div>
        </section>

        <div className="rollcall-proxy-actions">
          <Button variant="outline" type="button" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="default"
            disabled={submitting || !holderId || !documentId}
            onClick={() => holderId && documentId && onSubmit(holderId, documentId)}
          >
            {t(submitting ? "common.saving" : "meeting.confirmProxy")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
