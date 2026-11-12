import { formatPhoneNumber } from "@hall/api-contract";
import type { CouncilMember } from "@hall/domain";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Field, FieldRow } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CommitteeIcon } from "../components/icons";
import { EmptyState, PageHeader, RequestErrorBanner } from "../components/Ui";
import { ListRow, ListRowAvatar, ListRowIcon, ListRows } from "../components/ui/list-row";
import { SectionHeader } from "../components/ui/section-header";
import { phoneHref, preferredPhone } from "../features/contacts/contactPhones";
import { MemberDelegations } from "../features/representative-bodies/MemberDelegations";
import { committeeKind } from "../features/representative-bodies/representativeBodyKinds";
import { useI18n } from "../i18n/I18nProvider";
import { useCouncilCommitteesStore } from "../stores/councilCommitteesStore";
import { useCouncilMembersStore } from "../stores/councilMembersStore";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export function CouncilMemberPage() {
  const { memberId = "" } = useParams();
  const { t, formatDate } = useI18n();
  const { members, error: memberError, canUpdate, clearError, loadDetail, update } = useCouncilMembersStore();
  const { bodies: committees, details, error, load, loadAllDetails } = useCouncilCommitteesStore();
  const member = members.find((candidate) => candidate.id === memberId);
  const [role, setRole] = useState<CouncilMember["role"]>("councillor");
  const [rank, setRank] = useState("");
  const [termStartedOn, setTermStartedOn] = useState("");
  const [termEndedOn, setTermEndedOn] = useState("");
  const [draftMemberId, setDraftMemberId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
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
        .map((membership) => ({ committee: detail.body, membership })),
    )
    .sort((left, right) => right.membership.startedOn.localeCompare(left.membership.startedOn));
  const phone = preferredPhone(member.contact);
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
        describesItem
      />
      <div className="page-content admin-detail-page">
        <RequestErrorBanner error={memberError ?? error} />
        <div className="admin-detail-surface">
          <section className="admin-record" aria-labelledby="member-identity-title">
            <SectionHeader
              titleId="member-identity-title"
              title={t("members.term")}
              description={t("members.identityDescription")}
              commands={
                <>
                  {saveState !== "idle" ? (
                    <span className="record-state" data-save={saveState} role="status">
                      {saveLabels[saveState]}
                    </span>
                  ) : null}
                  <span className="record-state" data-tone={member.active ? "success" : "neutral"}>
                    {t(member.active ? "status.active" : "status.inactive")}
                  </span>
                </>
              }
            />
            <ListRows>
              <ListRow
                className="member-contact-row"
                to={`/contacts/${member.contact.id}`}
                openTestId="member-contact-link"
                head={
                  <ListRowAvatar
                    initials={`${member.contact.firstName.slice(0, 1)}${member.contact.lastName.slice(0, 1)}`}
                  />
                }
                title={`${member.contact.firstName} ${member.contact.lastName}`}
                detail={[
                  t("members.contact"),
                  member.contact.email,
                  phone ? formatPhoneNumber(phone) : t("members.noPhone"),
                ]
                  .filter(Boolean)
                  .join(" · ")}
                action={
                  phone ? (
                    <Button asChild variant="secondary">
                      <a href={phoneHref(phone)} data-testid="member-call">
                        {t("members.call")}
                      </a>
                    </Button>
                  ) : undefined
                }
              />
            </ListRows>
            <div className="admin-fields">
              <FieldRow>
                <Field label={t("members.role")}>
                  <Select
                    value={role}
                    disabled={!canUpdate[member.id]}
                    onValueChange={(value) => setRole(value as CouncilMember["role"])}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="councillor">{t("role.councillor")}</SelectItem>
                      <SelectItem value="deputyMayor">{t("role.deputyMayor")}</SelectItem>
                      <SelectItem value="mayor">{t("role.mayor")}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t("members.rank")}>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={rank}
                    readOnly={!canUpdate[member.id]}
                    onChange={(event) => setRank(event.currentTarget.value)}
                    data-testid="member-rank"
                  />
                </Field>
              </FieldRow>
              <FieldRow>
                <Field label={t("members.termStart")}>
                  <Input
                    type="date"
                    value={termStartedOn}
                    readOnly={!canUpdate[member.id]}
                    onChange={(event) => setTermStartedOn(event.currentTarget.value)}
                  />
                </Field>
                <Field label={t("members.termEnd")}>
                  <Input
                    type="date"
                    value={termEndedOn}
                    readOnly={!canUpdate[member.id]}
                    onChange={(event) => setTermEndedOn(event.currentTarget.value)}
                    data-testid="member-term-end"
                  />
                </Field>
              </FieldRow>
            </div>
            {saveState === "error" ? (
              <Button variant="secondary" onClick={() => void save()}>
                {t("common.retry")}
              </Button>
            ) : null}
          </section>

          <section id="committees" className="admin-related" aria-labelledby="member-committees-title">
            <SectionHeader
              titleId="member-committees-title"
              title={t("members.committees")}
              description={t("members.committeesDescription")}
            />
            {memberships.length === 0 ? (
              <p className="admin-inline-empty">{t("members.noCommittees")}</p>
            ) : (
              <ListRows>
                {memberships.map(({ committee, membership }) => (
                  <ListRow
                    key={membership.id}
                    to={`/council-committees/${committee.id}`}
                    head={
                      <ListRowIcon nature="council">
                        <CommitteeIcon />
                      </ListRowIcon>
                    }
                    title={committee.name}
                    detail={`${t(committeeKind.roleLabel(membership.role))} · ${formatDate(membership.startedOn)}${
                      membership.endedOn ? ` - ${formatDate(membership.endedOn)}` : ""
                    }`}
                    status={{
                      tone: membership.endedOn ? "neutral" : "success",
                      label: t(membership.endedOn ? "committees.membershipEnded" : "committees.membershipActive"),
                    }}
                  />
                ))}
              </ListRows>
            )}
          </section>

          <MemberDelegations contactId={member.contact.id} />
        </div>
      </div>
    </div>
  );
}
