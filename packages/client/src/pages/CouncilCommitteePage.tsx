import type { Contact } from "@hall/api-contract";
import { type CommitteeMembership, type CommitteeRole, committeeRoles, findSirenAction } from "@hall/api-contract";
import { type DragEvent, type FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AddIcon, DeleteIcon } from "../components/icons";
import { ResourceSearch } from "../components/search/ResourceSearch";
import { EmptyState, Modal, PageHeader, RequestErrorBanner } from "../components/Ui";
import { localDate } from "../features/calendar/eventDates";
import { CouncilCommitteeBusinesses } from "../features/council-business/CouncilCommitteeBusinesses";
import { useSubmitting } from "../hooks/useSubmitting";
import { useI18n } from "../i18n/I18nProvider";
import { useContactsStore } from "../stores/contactsStore";
import { useCouncilCommitteesStore } from "../stores/councilCommitteesStore";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const today = () => localDate(new Date());
const memberName = (member: Contact | undefined, fallback: string) =>
  member ? `${member.firstName} ${member.lastName}` : fallback;
const memberInitials = (member: Contact | undefined) =>
  member ? `${member.firstName.slice(0, 1)}${member.lastName.slice(0, 1)}` : "?";

export function CouncilCommitteePage() {
  const { committeeId = "" } = useParams();
  const navigate = useNavigate();
  const { t, formatDate } = useI18n();
  const { submitting, run } = useSubmitting();
  const { contacts: members, load: loadContacts, error: contactsError } = useContactsStore();
  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);
  const {
    committees,
    details,
    capabilities,
    membershipRepresentations,
    error,
    clearError,
    load,
    loadDetail,
    update,
    archive,
    addMembership,
    updateMembership,
    endMembership,
  } = useCouncilCommitteesStore();
  const listedCommittee = committees.find((candidate) => candidate.id === committeeId);
  const detail = listedCommittee ? details[listedCommittee.id] : undefined;
  const committee = detail?.committee ?? listedCommittee;
  const committeeReference = committee?.id;
  const detailCommittee = detail?.committee;
  const capability = committee ? capabilities[committee.id] : undefined;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [draftCommitteeId, setDraftCommitteeId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [membershipStartedOn, setMembershipStartedOn] = useState(today);
  const [availableSelection, setAvailableSelection] = useState<ReadonlySet<string>>(new Set());
  const [selectedMembershipId, setSelectedMembershipId] = useState<string | null>(null);
  const [draggedMembershipId, setDraggedMembershipId] = useState<string | null>(null);
  const [dropRole, setDropRole] = useState<CommitteeRole | null>(null);
  const [editedMembership, setEditedMembership] = useState<CommitteeMembership | null>(null);
  const [editedStartedOn, setEditedStartedOn] = useState("");
  const [editedEndedOn, setEditedEndedOn] = useState("");
  const [endingMembership, setEndingMembership] = useState<CommitteeMembership | null>(null);
  const [membershipEndDate, setMembershipEndDate] = useState("");
  const fieldId = useId();

  useEffect(() => {
    if (committees.length === 0) void load(true);
  }, [committees.length, load]);

  useEffect(() => {
    if (committeeReference) void loadDetail(committeeReference);
  }, [committeeReference, loadDetail]);

  useEffect(() => {
    if (!detailCommittee) return;
    setName(detailCommittee.name);
    setDescription(detailCommittee.description);
    setDraftCommitteeId(detailCommittee.id);
    setSaveState("idle");
  }, [detailCommittee]);

  const dirty = Boolean(
    committee &&
      draftCommitteeId === committee.id &&
      (name !== committee.name || description !== committee.description),
  );
  const save = useCallback(async () => {
    if (!committee || !capability?.canUpdate || !dirty) return true;
    setSaveState("saving");
    const saved = await update(committee.id, { name, description });
    setSaveState(saved ? "saved" : "error");
    return saved;
  }, [capability?.canUpdate, committee, description, dirty, name, update]);
  const saveRef = useRef(save);
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    saveRef.current = save;
    dirtyRef.current = dirty;
  }, [dirty, save]);

  useEffect(() => {
    if (!dirty || !capability?.canUpdate) return;
    setSaveState("dirty");
    const timer = window.setTimeout(() => void save(), 1000);
    return () => window.clearTimeout(timer);
  }, [capability?.canUpdate, dirty, save]);

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

  if (!committee) {
    return (
      <div className="page">
        <PageHeader title={t("committees.title")} description={t("committees.description")} />
        <div className="page-content">
          <EmptyState>{t("committees.notFound")}</EmptyState>
        </div>
      </div>
    );
  }

  const memberships = detail?.memberships ?? [];
  const activeMemberships = memberships.filter((membership) => !membership.endedOn);
  const endedMemberships = memberships.filter((membership) => membership.endedOn);
  const activeMemberIds = new Set(activeMemberships.map((membership) => membership.contactId));
  const availableMembers = members.filter((member) => !activeMemberIds.has(member.id));
  const memberById = new Map(members.map((member) => [member.id, member]));
  const selectedMembership = activeMemberships.find((membership) => membership.id === selectedMembershipId);
  const saveLabels: Record<SaveState, string> = {
    idle: "",
    dirty: t("workspace.saveDirty"),
    saving: t("common.saving"),
    saved: t("workspace.saved"),
    error: t("common.saveFailed"),
  };

  const canUpdateMembership = (membership: CommitteeMembership) => {
    const representation = membershipRepresentations[membership.id];
    return Boolean(representation && findSirenAction(representation, "committee.update-membership"));
  };
  const canEndMembership = (membership: CommitteeMembership) => {
    const representation = membershipRepresentations[membership.id];
    return Boolean(representation && findSirenAction(representation, "committee.end-membership"));
  };

  const toggleAvailableMember = (memberId: string) => {
    setAvailableSelection((current) => {
      const next = new Set(current);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const addSelectedMembers = (role: CommitteeRole) =>
    run(async () => {
      if (!membershipStartedOn || availableSelection.size === 0) return false;
      for (const contactId of availableSelection) {
        const added = await addMembership(committee.id, { contactId, role, startedOn: membershipStartedOn });
        if (!added) return false;
        setAvailableSelection((current) => {
          const remaining = new Set(current);
          remaining.delete(contactId);
          return remaining;
        });
      }
      setAvailableSelection(new Set());
      setPaletteOpen(false);
      return true;
    });

  const moveMembership = (membership: CommitteeMembership, role: CommitteeRole) =>
    run(async () => {
      if (membership.role === role || !canUpdateMembership(membership)) return true;
      const moved = await updateMembership(committee.id, membership.id, {
        role,
        startedOn: membership.startedOn,
        endedOn: membership.endedOn,
      });
      if (moved) setSelectedMembershipId(null);
      return moved;
    });

  const roleDropHandlers = (role: CommitteeRole) => ({
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!draggedMembershipId) return;
      event.preventDefault();
      setDropRole(role);
    },
    onDragLeave: () => setDropRole((current) => (current === role ? null : current)),
    onDrop: (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      const membership = activeMemberships.find((candidate) => candidate.id === draggedMembershipId);
      setDraggedMembershipId(null);
      setDropRole(null);
      if (membership) void moveMembership(membership, role);
    },
  });

  const openMembershipEditor = (membership: CommitteeMembership) => {
    setEditedMembership(membership);
    setEditedStartedOn(membership.startedOn);
    setEditedEndedOn(membership.endedOn ?? "");
  };

  const submitMembershipUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editedMembership) return;
    await run(async () => {
      const saved = await updateMembership(committee.id, editedMembership.id, {
        role: editedMembership.role,
        startedOn: editedStartedOn,
        endedOn: editedMembership.endedOn ? editedEndedOn || null : null,
      });
      if (saved) setEditedMembership(null);
      return saved;
    });
  };

  const openMembershipEnd = (membership: CommitteeMembership) => {
    setEditedMembership(null);
    setEndingMembership(membership);
    setMembershipEndDate(today());
  };

  const submitMembershipEnd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!endingMembership) return;
    await run(async () => {
      const ended = await endMembership(committee.id, endingMembership.id, membershipEndDate);
      if (ended) {
        setEndingMembership(null);
        setSelectedMembershipId(null);
      }
      return ended;
    });
  };

  const archiveCommittee = () =>
    run(async () => {
      const archived = await archive(committee.id);
      if (archived) navigate("/council-committees");
      return archived;
    });

  return (
    <div className="page">
      <PageHeader title={committee.name} description={t("committees.detailDescription")} />
      <div className="page-content admin-detail-page">
        <RequestErrorBanner error={error ?? contactsError} />
        <div className="admin-detail-surface">
          <section className="admin-record" aria-labelledby="committee-record-title">
            <div className="admin-section-heading">
              <div>
                <h2 id="committee-record-title">{t("committees.identity")}</h2>
                <p>{t("committees.identityDescription")}</p>
              </div>
              <div className="admin-heading-status">
                {saveState !== "idle" ? (
                  <span className={`admin-save-state admin-save-${saveState}`} role="status">
                    <span aria-hidden="true" />
                    {saveLabels[saveState]}
                  </span>
                ) : null}
                <Badge variant={committee.archivedAt ? "secondary" : "success"}>
                  {t(committee.archivedAt ? "committees.archived" : "committees.active")}
                </Badge>
              </div>
            </div>
            <div className="admin-edit-grid">
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-name`}>{t("committees.name")}</Label>
                <Input
                  id={`${fieldId}-name`}
                  value={name}
                  readOnly={!capability?.canUpdate}
                  onChange={(event) => setName(event.currentTarget.value)}
                />
              </div>
              <div className="grid gap-1.5 admin-edit-wide">
                <Label htmlFor={`${fieldId}-description`}>{t("committees.purpose")}</Label>
                <Textarea
                  id={`${fieldId}-description`}
                  value={description}
                  readOnly={!capability?.canUpdate}
                  onChange={(event) => setDescription(event.currentTarget.value)}
                />
              </div>
            </div>
            {saveState === "error" ? (
              <Button variant="outline" onClick={() => void save()}>
                {t("common.retry")}
              </Button>
            ) : null}
          </section>

          <CouncilCommitteeBusinesses committeeId={committee.id} />

          <section className="admin-related" aria-labelledby="committee-members-title">
            <div className="admin-section-heading">
              <div>
                <h2 id="committee-members-title">{t("committees.members")}</h2>
                <p>{t("committees.membersDescription")}</p>
              </div>
              <div className="admin-heading-status">
                <Badge variant="secondary">{activeMemberships.length}</Badge>
                {capability?.canAddMembership ? (
                  <Button
                    variant={paletteOpen ? "secondary" : "outline"}
                    data-testid="committee-add-members"
                    aria-expanded={paletteOpen}
                    onClick={() => setPaletteOpen((open) => !open)}
                  >
                    <AddIcon />
                    {t("committees.addMembers")}
                  </Button>
                ) : null}
              </div>
            </div>

            {paletteOpen ? (
              <section
                data-testid="committee-member-palette"
                className="admin-member-palette"
                aria-label={t("committees.availableMembers")}
              >
                <div className="admin-palette-heading">
                  <div>
                    <h3>{t("committees.availableMembers")}</h3>
                    <p>{t("committees.paletteDescription")}</p>
                  </div>
                  <div className="admin-compact-date">
                    <Label htmlFor={`${fieldId}-startedOn`}>{t("committees.startedOn")}</Label>
                    <Input
                      data-testid="committee-membership-start"
                      id={`${fieldId}-startedOn`}
                      type="date"
                      required
                      value={membershipStartedOn}
                      onChange={(event) => setMembershipStartedOn(event.currentTarget.value)}
                    />
                  </div>
                </div>
                {availableMembers.length === 0 ? (
                  <div className="admin-inline-empty">{t("committees.noAvailableMembers")}</div>
                ) : (
                  <>
                    <ResourceSearch
                      testId="committee-contact-search"
                      scope={{ types: ["contact"], includedIds: availableMembers.map((member) => member.id) }}
                      selectedIds={[...availableSelection]}
                      onPick={(item) => toggleAvailableMember(item.id)}
                    />
                    <div className="admin-palette-actions">
                      <span>{t("committees.selectionCount", { count: String(availableSelection.size) })}</span>
                      {committeeRoles.map((role) => (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={submitting || availableSelection.size === 0 || !membershipStartedOn}
                          data-testid={`committee-add-role-${role}`}
                          onClick={() => void addSelectedMembers(role)}
                          key={role}
                        >
                          {t("committees.addToRole", { role: t(`committeeRole.${role}`) })}
                        </Button>
                      ))}
                    </div>
                  </>
                )}
              </section>
            ) : null}

            {activeMemberships.length === 0 ? (
              <div className="admin-inline-empty">{t("committees.noMembers")}</div>
            ) : (
              <div className="admin-role-board" data-testid="committee-role-board">
                {committeeRoles.map((role) => {
                  const roleMemberships = activeMemberships.filter((membership) => membership.role === role);
                  const canReceiveSelection = Boolean(
                    selectedMembership && selectedMembership.role !== role && canUpdateMembership(selectedMembership),
                  );
                  return (
                    <section
                      data-testid={`committee-role-zone-${role}`}
                      className={`admin-role-zone${dropRole === role ? " admin-role-zone-over" : ""}`}
                      aria-label={t(`committeeRole.${role}`)}
                      {...roleDropHandlers(role)}
                      key={role}
                    >
                      <header className="admin-role-header">
                        <span>{t(`committeeRole.${role}`)}</span>
                        <span className="admin-role-tools">
                          {canReceiveSelection ? (
                            <button
                              type="button"
                              data-testid={`committee-move-role-${role}`}
                              onClick={() => {
                                if (selectedMembership) void moveMembership(selectedMembership, role);
                              }}
                            >
                              {t("committees.moveHere")}
                            </button>
                          ) : null}
                          <strong>{roleMemberships.length}</strong>
                        </span>
                      </header>
                      <div className="admin-role-chips">
                        {roleMemberships.length === 0 ? (
                          <p>{t("committees.noMemberInRole")}</p>
                        ) : (
                          roleMemberships.map((membership) => {
                            const member = memberById.get(membership.contactId);
                            const selected = selectedMembershipId === membership.id;
                            const movable = canUpdateMembership(membership);
                            return (
                              <button
                                className={`vote-card admin-member-chip${selected ? " vote-card-selected" : ""}`}
                                type="button"
                                aria-pressed={selected}
                                draggable={movable}
                                onDragStart={(event) => {
                                  event.dataTransfer.effectAllowed = "move";
                                  setDraggedMembershipId(membership.id);
                                }}
                                onDragEnd={() => {
                                  setDraggedMembershipId(null);
                                  setDropRole(null);
                                }}
                                data-testid={`committee-membership-${membership.contactId}`}
                                onClick={() => setSelectedMembershipId(selected ? null : membership.id)}
                                key={membership.id}
                              >
                                <span className="vote-card-avatar" aria-hidden="true">
                                  {memberInitials(member)}
                                </span>
                                <span className="vote-card-copy">
                                  <strong>{memberName(member, t("contacts.notFound"))}</strong>
                                  <span>{t("committees.sinceDate", { date: formatDate(membership.startedOn) })}</span>
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}

            {selectedMembership ? (
              <div className="admin-membership-toolbar" role="status">
                <span>
                  <strong>{memberName(memberById.get(selectedMembership.contactId), t("contacts.notFound"))}</strong>
                  {t(`committeeRole.${selectedMembership.role}`)}
                </span>
                <div>
                  <Link data-testid="committee-contact-link" to={`/contacts/${selectedMembership.contactId}`}>
                    {t("committees.openMember")}
                  </Link>
                  <Button variant="ghost" size="sm" onClick={() => openMembershipEditor(selectedMembership)}>
                    {t("committees.editDates")}
                  </Button>
                  {canEndMembership(selectedMembership) ? (
                    <Button variant="outline" size="sm" onClick={() => openMembershipEnd(selectedMembership)}>
                      {t("committees.endMembership")}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {endedMemberships.length > 0 ? (
              <details className="admin-membership-history">
                <summary>{t("committees.membershipHistory", { count: String(endedMemberships.length) })}</summary>
                <div className="admin-related-list">
                  {endedMemberships.map((membership) => {
                    const member = memberById.get(membership.contactId);
                    return (
                      <div className="data-row admin-membership-row" key={membership.id}>
                        <Link className="admin-membership-link" to={`/contacts/${membership.contactId}`}>
                          <strong>{memberName(member, t("contacts.notFound"))}</strong>
                          <span>
                            {t(`committeeRole.${membership.role}`)} · {formatDate(membership.startedOn)} -{" "}
                            {membership.endedOn ? formatDate(membership.endedOn) : ""}
                          </span>
                        </Link>
                        {canUpdateMembership(membership) ? (
                          <Button variant="ghost" size="sm" onClick={() => openMembershipEditor(membership)}>
                            {t("common.edit")}
                          </Button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </details>
            ) : null}
          </section>

          {capability?.canArchive ? (
            <div className="admin-danger-zone">
              <div>
                <strong>{t("committees.archive")}</strong>
                <p>{t("committees.archiveDescription")}</p>
              </div>
              <Button variant="destructive" disabled={submitting} onClick={() => void archiveCommittee()}>
                <DeleteIcon />
                {t(submitting ? "common.saving" : "committees.archiveAction")}
              </Button>
            </div>
          ) : null}
        </div>

        <Modal
          open={Boolean(editedMembership)}
          title={t("committees.editDates")}
          onClose={() => setEditedMembership(null)}
        >
          <form className="modal-form" onSubmit={submitMembershipUpdate}>
            <div className="grid gap-1.5">
              <Label htmlFor={`${fieldId}-edit-startedOn`}>{t("committees.startedOn")}</Label>
              <Input
                id={`${fieldId}-edit-startedOn`}
                type="date"
                required
                value={editedStartedOn}
                onChange={(event) => setEditedStartedOn(event.currentTarget.value)}
              />
            </div>
            {editedMembership?.endedOn ? (
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-edit-endedOn`}>{t("committees.endedOn")}</Label>
                <Input
                  id={`${fieldId}-edit-endedOn`}
                  type="date"
                  required
                  value={editedEndedOn}
                  onChange={(event) => setEditedEndedOn(event.currentTarget.value)}
                />
              </div>
            ) : null}
            <Button type="submit" disabled={submitting}>
              {t(submitting ? "common.saving" : "common.save")}
            </Button>
          </form>
        </Modal>

        <Modal
          open={Boolean(endingMembership)}
          title={t("committees.endMembership")}
          onClose={() => setEndingMembership(null)}
        >
          <form className="modal-form" onSubmit={submitMembershipEnd}>
            <p className="admin-dialog-description">{t("committees.endMembershipDescription")}</p>
            <div className="grid gap-1.5">
              <Label htmlFor={`${fieldId}-end-date`}>{t("committees.endedOn")}</Label>
              <Input
                id={`${fieldId}-end-date`}
                type="date"
                required
                min={endingMembership?.startedOn}
                value={membershipEndDate}
                onChange={(event) => setMembershipEndDate(event.currentTarget.value)}
              />
            </div>
            <Button type="submit" variant="destructive" disabled={submitting}>
              {t(submitting ? "common.saving" : "committees.confirmEndMembership")}
            </Button>
          </form>
        </Modal>
      </div>
    </div>
  );
}
