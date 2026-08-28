import { Button, Field, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger } from "@fluentui/react-components";
import {
  ArrowUploadRegular,
  CheckmarkCircleRegular,
  DocumentRegular,
  GavelRegular,
  MoreHorizontalRegular,
  PenRegular,
  WarningRegular,
} from "@fluentui/react-icons";
import type { Attendance, AttendanceStatus, CouncilMember, DocumentResource, MeetingAggregate } from "@hall/domain";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input, Modal } from "../../../components/Ui";
import type { useCouncilMeeting } from "../../../hooks/useCouncilMeeting";
import { useSubmitting } from "../../../hooks/useSubmitting";
import { useI18n } from "../../../i18n/I18nProvider";
import { useResourcesStore } from "../../../stores/resourcesStore";
import { meetingOpeningBlock } from "../meetingOpeningPolicy";

const directStatuses: AttendanceStatus[] = ["present", "excused", "absent"];

export function memberInitials(member: CouncilMember): string {
  return `${member.firstName.slice(0, 1)}${member.lastName.slice(0, 1)}`;
}

export function RollCallView({
  aggregate,
  members,
  mode,
  meetingActions,
  onDone,
}: {
  aggregate: MeetingAggregate;
  members: CouncilMember[];
  mode: "opening" | "adjust";
  meetingActions: ReturnType<typeof useCouncilMeeting>;
  onDone(): void;
}) {
  const { t, formatNumber } = useI18n();
  const { submitting, run } = useSubmitting();
  const navigate = useNavigate();
  const { resources, upload, load: reloadResources } = useResourcesStore();
  const [proxyMemberId, setProxyMemberId] = useState<string | null>(null);
  const { meeting } = aggregate;
  const attendanceByMember = useMemo(
    () => new Map(aggregate.attendance.map((attendance) => [attendance.memberId, attendance])),
    [aggregate.attendance],
  );
  const proxyDocuments = resources.filter(
    (resource): resource is DocumentResource =>
      resource.kind === "document" && resource.meetingId === meeting.id && resource.category === "proxy",
  );
  const openingBlock = meetingOpeningBlock(aggregate);

  const record = (memberId: string, status: AttendanceStatus) =>
    run(() =>
      meetingActions.recordAttendance({
        memberId,
        status,
        proxyHolderMemberId: null,
        proxyDocumentId: null,
        expectedVersion: attendanceByMember.get(memberId)?.version ?? null,
      }),
    );

  const markAllPresent = () =>
    run(async () => {
      for (const member of members) {
        const current = attendanceByMember.get(member.id);
        if (current?.status === "present") continue;
        const recorded = await meetingActions.recordAttendance({
          memberId: member.id,
          status: "present",
          proxyHolderMemberId: null,
          proxyDocumentId: null,
          expectedVersion: current?.version ?? null,
        });
        if (!recorded) return false;
      }
      return true;
    });

  const submitProxy = (memberId: string, proxyHolderMemberId: string, proxyDocumentId: string) => {
    void run(async () => {
      const recorded = await meetingActions.recordAttendance({
        memberId,
        status: "represented",
        proxyHolderMemberId,
        proxyDocumentId,
        expectedVersion: attendanceByMember.get(memberId)?.version ?? null,
      });
      if (recorded) setProxyMemberId(null);
      return recorded;
    });
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
    if (!chairMemberId || !secretaryMemberId) return;
    void run(() => meetingActions.setOfficers({ chairMemberId, secretaryMemberId }));
  };

  const openMeeting = () =>
    run(async () => {
      const opened = await meetingActions.changeStatus("inProgress");
      if (opened) onDone();
      return opened;
    });

  const reconvene = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const reconvenedMeeting = await meetingActions.reconvene({
        title: form.get("title"),
        startsAt: new Date(String(form.get("startsAt"))).toISOString(),
        meetingNoticeSentAt: new Date(String(form.get("meetingNoticeSentAt"))).toISOString(),
        location: form.get("location"),
        chairMemberId: meeting.chairMemberId,
        secretaryMemberId: meeting.secretaryMemberId,
      });
      if (reconvenedMeeting) await navigate(`/meetings/${reconvenedMeeting.id}`);
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
              .replace("{recorded}", formatNumber(aggregate.attendance.length))
              .replace("{total}", formatNumber(members.length))}
          </p>
        </div>
        <div className="rollcall-header-actions">
          {meetingActions.can("meeting.record-attendance") ? (
            <Button appearance="secondary" disabled={submitting} onClick={() => void markAllPresent()}>
              {t(submitting ? "common.saving" : "meeting.markAllPresent")}
            </Button>
          ) : null}
          {mode === "adjust" ? (
            <Button appearance="primary" onClick={onDone}>
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
                    {member.firstName} {member.lastName}
                  </strong>
                  <span className="rollcall-tile-subline">
                    {t(`role.${member.role}`)}
                    {isChair ? (
                      <span
                        className={`rollcall-officer-chip${officerAbsent ? " rollcall-officer-chip-warning" : ""}`}
                        title={officerAbsent ? t("live.officerMustBePresent") : undefined}
                      >
                        {officerAbsent ? <WarningRegular aria-hidden="true" /> : <GavelRegular aria-hidden="true" />}
                        {t("live.chairChip")}
                      </span>
                    ) : null}
                    {isSecretary ? (
                      <span
                        className={`rollcall-officer-chip${officerAbsent ? " rollcall-officer-chip-warning" : ""}`}
                        title={officerAbsent ? t("live.officerMustBePresent") : undefined}
                      >
                        {officerAbsent ? <WarningRegular aria-hidden="true" /> : <PenRegular aria-hidden="true" />}
                        {t("live.secretaryChip")}
                      </span>
                    ) : null}
                  </span>
                </div>
                {officersEditable ? (
                  <Menu>
                    <MenuTrigger disableButtonEnhancement>
                      <Button
                        className="rollcall-tile-menu"
                        appearance="subtle"
                        size="small"
                        icon={<MoreHorizontalRegular />}
                        aria-label={t("live.tileMenu")}
                      />
                    </MenuTrigger>
                    <MenuPopover>
                      <MenuList>
                        <MenuItem
                          icon={<GavelRegular />}
                          disabled={isChair || !meeting.secretaryMemberId}
                          onClick={() => designateOfficer(member.id, "chair")}
                        >
                          {t("live.makeChair")}
                        </MenuItem>
                        <MenuItem
                          icon={<PenRegular />}
                          disabled={isSecretary || !meeting.chairMemberId}
                          onClick={() => designateOfficer(member.id, "secretary")}
                        >
                          {t("live.makeSecretary")}
                        </MenuItem>
                      </MenuList>
                    </MenuPopover>
                  </Menu>
                ) : null}
              </div>

              <div className="rollcall-tile-choices">
                {directStatuses.map((status) => (
                  <button
                    className={`rollcall-choice rollcall-choice-${status}${current?.status === status ? " rollcall-choice-active" : ""}`}
                    type="button"
                    aria-pressed={current?.status === status}
                    disabled={submitting}
                    onClick={() => void record(member.id, status)}
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
                      return holder ? `${holder.firstName} ${holder.lastName}` : "";
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
                <WarningRegular aria-hidden="true" />
                <div>
                  <strong>{t("meeting.quorumFailureRecorded")}</strong>
                  <p>{t("meeting.reconveneDescription")}</p>
                </div>
              </div>
              <div className="rollcall-reconvene-fields">
                <Field label={t("meetings.name")} required>
                  <Input
                    name="title"
                    defaultValue={t("meeting.reconvenedName").replace("{title}", meeting.title)}
                    required
                  />
                </Field>
                <Field label={t("meetings.dateTime")} required>
                  <Input name="startsAt" type="datetime-local" required />
                </Field>
                <Field label={t("meeting.noticeSentAt")} required>
                  <Input name="meetingNoticeSentAt" type="datetime-local" required />
                </Field>
                <Field label={t("meetings.location")} required>
                  <Input name="location" defaultValue={meeting.location} required />
                </Field>
              </div>
              <Button appearance="primary" type="submit" disabled={submitting}>
                {t(submitting ? "common.saving" : "meeting.reconveneAction")}
              </Button>
            </form>
          ) : (
            <>
              <div className="rollcall-checklist" role="status">
                {openingBlock ? (
                  <span className="rollcall-check rollcall-check-pending">
                    <WarningRegular aria-hidden="true" />
                    {t(`meeting.opening.${openingBlock}`)}
                  </span>
                ) : (
                  <span className="rollcall-check rollcall-check-ready">
                    <CheckmarkCircleRegular aria-hidden="true" />
                    {t("live.readyToOpen")}
                  </span>
                )}
              </div>
              <div className="rollcall-footer-actions">
                {meetingActions.can("meeting.record-quorum-failure") ? (
                  <Button
                    appearance="secondary"
                    disabled={submitting}
                    onClick={() => void run(meetingActions.recordQuorumFailure)}
                  >
                    {t(submitting ? "common.saving" : "meeting.recordQuorumFailure")}
                  </Button>
                ) : null}
                <button
                  className="live-primary-action"
                  type="button"
                  disabled={submitting || !meetingActions.can("meeting.open")}
                  onClick={() => void openMeeting()}
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
  member: CouncilMember;
  current: Attendance | undefined;
  holderCandidates: { member: CouncilMember; alreadyHolding: boolean }[];
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
      title={t("live.proxyModalTitle").replace("{member}", `${member.firstName} ${member.lastName}`)}
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
                      {candidate.firstName} {candidate.lastName}
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
                <DocumentRegular aria-hidden="true" />
                <span className="picker-card-copy">
                  <strong>{document.fileName}</strong>
                  <span>{formatFileSize(document.byteSize)}</span>
                </span>
              </button>
            ))}
            <button className="picker-card picker-card-upload" type="button" onClick={() => fileInput.current?.click()}>
              <ArrowUploadRegular aria-hidden="true" />
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
          <Button appearance="secondary" type="button" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            appearance="primary"
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
