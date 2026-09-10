import type { CouncilMember } from "@hall/domain";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, PageHeader, RequestErrorBanner } from "../components/Ui";
import { formatPhoneNumber, phoneHref } from "../features/council-members/phonePresentation";
import { StatusBadge } from "../features/status/DomainStatusBadge";
import { useI18n } from "../i18n/I18nProvider";
import { useCouncilCommitteesStore } from "../stores/councilCommitteesStore";
import { useCouncilMembersStore } from "../stores/councilMembersStore";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export function CouncilMemberPage() {
  const { memberId = "" } = useParams();
  const { t, formatDate } = useI18n();
  const { members, error: memberError, canUpdate, clearError, loadDetail, update } = useCouncilMembersStore();
  const { committees, details, error, load, loadAllDetails } = useCouncilCommitteesStore();
  const member = members.find((candidate) => candidate.id === memberId);
  const [role, setRole] = useState<CouncilMember["role"]>("councillor");
  const [rank, setRank] = useState("");
  const [termStartedOn, setTermStartedOn] = useState("");
  const [termEndedOn, setTermEndedOn] = useState("");
  const [draftMemberId, setDraftMemberId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const fieldId = useId();
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (memberId) void loadDetail(memberId);
  }, [loadDetail, memberId]);

  useEffect(() => {
    if (committees.length === 0) void load(true);
    else void loadAllDetails();
  }, [committees.length, load, loadAllDetails]);

  useEffect(() => {
    if (!member || (draftMemberId === member.id && dirtyRef.current)) return;
    setRole(member.role);
    setRank(member.rank == null ? "" : String(member.rank));
    setTermStartedOn(member.termStartedOn);
    setTermEndedOn(member.termEndedOn ?? "");
    setDraftMemberId(member.id);
    setSaveState("idle");
  }, [draftMemberId, member]);

  const dirty = Boolean(
    member &&
      draftMemberId === member.id &&
      (rank !== (member.rank == null ? "" : String(member.rank)) ||
        role !== member.role ||
        termStartedOn !== member.termStartedOn ||
        termEndedOn !== (member.termEndedOn ?? "")),
  );
  dirtyRef.current = dirty;
  const save = useCallback(async () => {
    if (!member || !canUpdate[member.id] || !dirty || !termStartedOn) return true;
    setSaveState("saving");
    const saved = await update(member.id, {
      role,
      rank: rank === "" ? null : Number(rank),
      termStartedOn,
      termEndedOn: termEndedOn || null,
    });
    setSaveState(saved ? "saved" : "error");
    return saved;
  }, [canUpdate, dirty, member, rank, role, termEndedOn, termStartedOn, update]);
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
    dirtyRef.current = dirty;
  }, [dirty, save]);

  useEffect(() => {
    if (!dirty || !member || !canUpdate[member.id]) return;
    setSaveState("dirty");
    const timer = window.setTimeout(() => void save(), 1000);
    return () => window.clearTimeout(timer);
  }, [canUpdate, dirty, member, save]);

  useEffect(() => {
    if (!dirty && saveState === "error") {
      setSaveState("idle");
      clearError();
    }
  }, [clearError, dirty, saveState]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      if (dirtyRef.current) void saveRef.current();
    };
  }, []);

  if (!member) {
    return (
      <div className="page">
        <PageHeader title={t("members.title")} description={t("members.description")} />
        <div className="page-content">
          <EmptyState>{t("members.notFound")}</EmptyState>
        </div>
      </div>
    );
  }

  const memberships = Object.values(details)
    .flatMap((detail) =>
      detail.memberships
        .filter((membership) => membership.contactId === member.contact.id)
        .map((membership) => ({ committee: detail.committee, membership })),
    )
    .sort((left, right) => right.membership.startedOn.localeCompare(left.membership.startedOn));
  const saveLabels: Record<SaveState, string> = {
    idle: "",
    dirty: t("workspace.saveDirty"),
    saving: t("common.saving"),
    saved: t("workspace.saved"),
    error: t("common.saveFailed"),
  };

  return (
    <div className="page">
      <PageHeader
        title={`${member.contact.firstName} ${member.contact.lastName}`}
        description={t("members.detailDescription")}
      />
      <div className="page-content admin-detail-page">
        <RequestErrorBanner error={memberError ?? error} />
        <div className="admin-detail-surface">
          <section className="admin-record" aria-labelledby="member-identity-title">
            <div className="admin-record-heading">
              <div className="member-identity">
                <span className="member-avatar member-avatar-large" aria-hidden="true">
                  {member.contact.firstName.slice(0, 1)}
                  {member.contact.lastName.slice(0, 1)}
                </span>
                <div>
                  <h2 id="member-identity-title">
                    {member.contact.firstName} {member.contact.lastName}
                  </h2>
                  <span>{t("members.identityDescription")}</span>
                </div>
              </div>
              <div className="admin-heading-status">
                {saveState !== "idle" ? (
                  <span className={`admin-save-state admin-save-${saveState}`} role="status">
                    <span aria-hidden="true" />
                    {saveLabels[saveState]}
                  </span>
                ) : null}
                <span className="council-member-mandate">
                  {t("members.term")}
                  <StatusBadge value={member.active ? "active" : "inactive"} />
                </span>
              </div>
            </div>
            <div className="admin-edit-grid admin-member-edit-grid">
              <div className="grid gap-1.5 admin-edit-wide">
                <Label>{t("members.contact")}</Label>
                <Link
                  className="data-row linked"
                  to={`/contacts/${member.contact.id}`}
                  data-testid="member-contact-link"
                >
                  <span>
                    <strong>
                      {member.contact.firstName} {member.contact.lastName}
                    </strong>
                    <span>{member.contact.email ?? t("members.noEmail")}</span>
                  </span>
                </Link>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-role`}>{t("members.role")}</Label>
                <Select
                  value={role}
                  disabled={!canUpdate[member.id]}
                  onValueChange={(value) => setRole(value as CouncilMember["role"])}
                >
                  <SelectTrigger id={`${fieldId}-role`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="councillor">{t("role.councillor")}</SelectItem>
                    <SelectItem value="deputyMayor">{t("role.deputyMayor")}</SelectItem>
                    <SelectItem value="mayor">{t("role.mayor")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-rank`}>{t("members.rank")}</Label>
                <Input
                  id={`${fieldId}-rank`}
                  type="number"
                  min={0}
                  step={1}
                  value={rank}
                  readOnly={!canUpdate[member.id]}
                  onChange={(event) => setRank(event.currentTarget.value)}
                  data-testid="member-rank"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>{t("members.phone")}</Label>
                {member.contact.phone ? (
                  <a className="admin-phone-link" href={phoneHref(member.contact.phone)}>
                    {formatPhoneNumber(member.contact.phone)}
                  </a>
                ) : (
                  <span>{t("members.noPhone")}</span>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-term-start`}>{t("members.termStart")}</Label>
                <Input
                  id={`${fieldId}-term-start`}
                  type="date"
                  value={termStartedOn}
                  readOnly={!canUpdate[member.id]}
                  onChange={(event) => setTermStartedOn(event.currentTarget.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-term-end`}>{t("members.termEnd")}</Label>
                <Input
                  id={`${fieldId}-term-end`}
                  type="date"
                  value={termEndedOn}
                  readOnly={!canUpdate[member.id]}
                  onChange={(event) => setTermEndedOn(event.currentTarget.value)}
                  data-testid="member-term-end"
                />
              </div>
            </div>
            {saveState === "error" ? (
              <Button variant="outline" onClick={() => void save()}>
                {t("common.retry")}
              </Button>
            ) : null}
          </section>

          <section id="committees" className="admin-related" aria-labelledby="member-committees-title">
            <div className="admin-section-heading">
              <div>
                <h2 id="member-committees-title">{t("members.committees")}</h2>
                <p>{t("members.committeesDescription")}</p>
              </div>
              <Badge variant="secondary">{memberships.length}</Badge>
            </div>
            {memberships.length === 0 ? (
              <div className="admin-inline-empty">{t("members.noCommittees")}</div>
            ) : (
              <div className="admin-related-list">
                {memberships.map(({ committee, membership }) => (
                  <Link className="data-row linked" key={membership.id} to={`/council-committees/${committee.id}`}>
                    <div>
                      <strong>{committee.name}</strong>
                      <span>
                        {t(`committeeRole.${membership.role}`)} · {formatDate(membership.startedOn)}
                        {membership.endedOn ? ` - ${formatDate(membership.endedOn)}` : ""}
                      </span>
                    </div>
                    <Badge variant={membership.endedOn ? "outline" : "success"}>
                      {t(membership.endedOn ? "committees.membershipEnded" : "committees.membershipActive")}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
