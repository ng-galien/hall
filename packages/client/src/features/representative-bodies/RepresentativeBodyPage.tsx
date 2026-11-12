import type { Contact } from "@hall/api-contract";
import { findSirenAction } from "@hall/api-contract";
import { type DragEvent, type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Field, FieldRow } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AddIcon, DeleteIcon } from "../../components/icons";
import { ResourceSearch } from "../../components/search/ResourceSearch";
import { EmptyState, Modal, PageHeader, RequestErrorBanner } from "../../components/Ui";
import { Disclosure } from "../../components/ui/disclosure";
import { ListRow, ListRowAvatar, ListRows } from "../../components/ui/list-row";
import { SectionHeader } from "../../components/ui/section-header";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import type { BodyMembership } from "../../services/representativeBodiesApi";
import { useContactsStore } from "../../stores/contactsStore";
import type { RepresentativeBodiesState } from "../../stores/representativeBodiesStore";
import { localDate } from "../calendar/eventDates";
import type { RepresentativeBodyKind } from "./representativeBodyKinds";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const today = () => localDate(new Date());
const memberName = (member: Contact | undefined, fallback: string) =>
  member ? `${member.firstName} ${member.lastName}` : fallback;
const memberInitials = (member: Contact | undefined) =>
  member ? `${member.firstName.slice(0, 1)}${member.lastName.slice(0, 1)}` : "?";

/**
 * One body: its name and purpose saved as typed, its contacts placed under the body's roles with dated designations,
 * their history and the archive action. Every change appears only when Siren offers the matching action.
 */
export function RepresentativeBodyPage({
  bodyKind,
  useStore,
  bodyId,
  related,
}: {
  bodyKind: RepresentativeBodyKind;
  useStore: () => RepresentativeBodiesState;
  bodyId: string;
  /** A section of the body's own, placed between its identity and its members. */
  related?(bodyId: string): ReactNode;
}) {
  const text = bodyKind.text;
  const testId = (suffix: string) => `${bodyKind.kind}-${suffix}`;
  const navigate = useNavigate();
  const { t, formatDate } = useI18n();
  const { submitting, run } = useSubmitting();
  const { contacts: members, load: loadContacts, error: contactsError } = useContactsStore();
  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);
  const {
    bodies,
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
  } = useStore();
  const listedBody = bodies.find((candidate) => candidate.id === bodyId);
  const detail = listedBody ? details[listedBody.id] : undefined;
  const body = detail?.body ?? listedBody;
  const bodyReference = body?.id;
  const detailBody = detail?.body;
  const capability = body ? capabilities[body.id] : undefined;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [draftBodyId, setDraftBodyId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [membershipStartedOn, setMembershipStartedOn] = useState(today);
  const [availableSelection, setAvailableSelection] = useState<ReadonlySet<string>>(new Set());
  const [selectedMembershipId, setSelectedMembershipId] = useState<string | null>(null);
  const [draggedMembershipId, setDraggedMembershipId] = useState<string | null>(null);
  const [dropRole, setDropRole] = useState<string | null>(null);
  const [editedMembership, setEditedMembership] = useState<BodyMembership | null>(null);
  const [editedStartedOn, setEditedStartedOn] = useState("");
  const [editedEndedOn, setEditedEndedOn] = useState("");
  const [endingMembership, setEndingMembership] = useState<BodyMembership | null>(null);
  const [membershipEndDate, setMembershipEndDate] = useState("");

  useEffect(() => {
    if (bodies.length === 0) void load(true);
  }, [bodies.length, load]);

  useEffect(() => {
    if (bodyReference) void loadDetail(bodyReference);
  }, [bodyReference, loadDetail]);

  useEffect(() => {
    if (!detailBody) return;
    setName(detailBody.name);
    setDescription(detailBody.description);
    setDraftBodyId(detailBody.id);
    setSaveState("idle");
  }, [detailBody]);

  const dirty = Boolean(body && draftBodyId === body.id && (name !== body.name || description !== body.description));
  const save = useCallback(async () => {
    if (!body || !capability?.canUpdate || !dirty) return true;
    setSaveState("saving");
    const saved = await update(body.id, { name, description });
    setSaveState(saved ? "saved" : "error");
    return saved;
  }, [capability?.canUpdate, body, description, dirty, name, update]);
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

  if (!body) {
    return (
      <div className="page">
        <PageHeader title={t(text.title)} description={t(text.description)} />
        <div className="page-content">
          <EmptyState>{t(text.notFound)}</EmptyState>
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

  const canUpdateMembership = (membership: BodyMembership) => {
    const representation = membershipRepresentations[membership.id];
    return Boolean(representation && findSirenAction(representation, bodyKind.actions.updateMembership));
  };
  const canEndMembership = (membership: BodyMembership) => {
    const representation = membershipRepresentations[membership.id];
    return Boolean(representation && findSirenAction(representation, bodyKind.actions.endMembership));
  };

  const toggleAvailableMember = (memberId: string) => {
    setAvailableSelection((current) => {
      const next = new Set(current);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const addSelectedMembers = (role: string) =>
    run(async () => {
      if (!membershipStartedOn || availableSelection.size === 0) return false;
      for (const contactId of availableSelection) {
        const added = await addMembership(body.id, { contactId, role, startedOn: membershipStartedOn });
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

  const moveMembership = (membership: BodyMembership, role: string) =>
    run(async () => {
      if (membership.role === role || !canUpdateMembership(membership)) return true;
      const moved = await updateMembership(body.id, membership.id, {
        role,
        startedOn: membership.startedOn,
        endedOn: membership.endedOn,
      });
      if (moved) setSelectedMembershipId(null);
      return moved;
    });

  const roleDropHandlers = (role: string) => ({
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

  const openMembershipEditor = (membership: BodyMembership) => {
    setEditedMembership(membership);
    setEditedStartedOn(membership.startedOn);
    setEditedEndedOn(membership.endedOn ?? "");
  };

  const submitMembershipUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editedMembership) return;
    await run(async () => {
      const saved = await updateMembership(body.id, editedMembership.id, {
        role: editedMembership.role,
        startedOn: editedStartedOn,
        endedOn: editedMembership.endedOn ? editedEndedOn || null : null,
      });
      if (saved) setEditedMembership(null);
      return saved;
    });
  };

  const openMembershipEnd = (membership: BodyMembership) => {
    setEditedMembership(null);
    setEndingMembership(membership);
    setMembershipEndDate(today());
  };

  const submitMembershipEnd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!endingMembership) return;
    await run(async () => {
      const ended = await endMembership(body.id, endingMembership.id, membershipEndDate);
      if (ended) {
        setEndingMembership(null);
        setSelectedMembershipId(null);
      }
      return ended;
    });
  };

  const archiveBody = () =>
    run(async () => {
      const archived = await archive(body.id);
      if (archived) navigate(bodyKind.path);
      return archived;
    });

  return (
    <div className="page">
      <PageHeader title={body.name} description={t(text.detailDescription)} describesItem />
      <div className="page-content admin-detail-page">
        <RequestErrorBanner error={error ?? contactsError} />
        <div className="admin-detail-surface">
          <section className="admin-record" aria-labelledby={testId("record-title")}>
            <SectionHeader
              titleId={testId("record-title")}
              title={t(text.identity)}
              description={t(text.identityDescription)}
              commands={
                <>
                  {saveState !== "idle" ? (
                    <span className="record-state" data-save={saveState} role="status">
                      {saveLabels[saveState]}
                    </span>
                  ) : null}
                  <span className="record-state" data-tone={body.archivedAt ? "neutral" : "success"}>
                    {t(body.archivedAt ? text.archived : text.active)}
                  </span>
                </>
              }
            />
            <div className="admin-fields">
              <Field label={t(text.name)}>
                <Input
                  data-testid={testId("name")}
                  value={name}
                  readOnly={!capability?.canUpdate}
                  onChange={(event) => setName(event.currentTarget.value)}
                />
              </Field>
              <Field label={t(text.purpose)}>
                <Textarea
                  value={description}
                  readOnly={!capability?.canUpdate}
                  onChange={(event) => setDescription(event.currentTarget.value)}
                />
              </Field>
            </div>
            {saveState === "error" ? (
              <Button variant="secondary" onClick={() => void save()}>
                {t("common.retry")}
              </Button>
            ) : null}
          </section>

          {related?.(body.id)}

          <section className="admin-related" aria-labelledby={testId("members-title")}>
            <SectionHeader
              titleId={testId("members-title")}
              title={t(text.members)}
              description={t(text.membersDescription)}
              commands={
                <>
                  {capability?.canAddMembership ? (
                    <Button
                      variant="secondary"
                      data-testid={testId("add-members")}
                      aria-expanded={paletteOpen}
                      onClick={() => setPaletteOpen((open) => !open)}
                    >
                      <AddIcon />
                      {t(text.addMembers)}
                    </Button>
                  ) : null}
                </>
              }
            />

            {paletteOpen ? (
              <section
                data-testid={testId("member-palette")}
                className="admin-member-palette"
                aria-labelledby={testId("palette-title")}
              >
                <SectionHeader
                  titleId={testId("palette-title")}
                  level={3}
                  title={t(text.availableMembers)}
                  description={t(text.paletteDescription)}
                />
                <Field label={t(text.startedOn)} className="admin-compact-date">
                  <Input
                    data-testid={testId("membership-start")}
                    type="date"
                    required
                    value={membershipStartedOn}
                    onChange={(event) => setMembershipStartedOn(event.currentTarget.value)}
                  />
                </Field>
                {availableMembers.length === 0 ? (
                  <p className="admin-inline-empty">{t(text.noAvailableMembers)}</p>
                ) : (
                  <>
                    <ResourceSearch
                      testId={testId("contact-search")}
                      scope={{ types: ["contact"], includedIds: availableMembers.map((member) => member.id) }}
                      selectedIds={[...availableSelection]}
                      onPick={(item) => toggleAvailableMember(item.id)}
                    />
                    <div className="admin-palette-actions">
                      <span>{t(text.selectionCount, { count: String(availableSelection.size) })}</span>
                      {bodyKind.roles.map((role) => (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={submitting || availableSelection.size === 0 || !membershipStartedOn}
                          data-testid={testId(`add-role-${role}`)}
                          onClick={() => void addSelectedMembers(role)}
                          key={role}
                        >
                          {t(text.addToRole, { role: t(bodyKind.roleLabel(role)) })}
                        </Button>
                      ))}
                    </div>
                  </>
                )}
              </section>
            ) : null}

            {activeMemberships.length === 0 ? (
              <p className="admin-inline-empty">{t(text.noMembers)}</p>
            ) : (
              <div className="admin-role-board" data-testid={testId("role-board")}>
                {bodyKind.roles.map((role) => {
                  const roleMemberships = activeMemberships.filter((membership) => membership.role === role);
                  const canReceiveSelection = Boolean(
                    selectedMembership && selectedMembership.role !== role && canUpdateMembership(selectedMembership),
                  );
                  return (
                    <section
                      data-testid={testId(`role-zone-${role}`)}
                      className="admin-role-zone"
                      data-over={dropRole === role ? "true" : undefined}
                      aria-label={t(bodyKind.roleLabel(role))}
                      {...roleDropHandlers(role)}
                      key={role}
                    >
                      <header className="admin-role-header">
                        <h3>
                          {t(bodyKind.roleLabel(role))}
                          <span>{roleMemberships.length}</span>
                        </h3>
                        {canReceiveSelection ? (
                          <Button
                            variant="secondary"
                            data-testid={testId(`move-role-${role}`)}
                            onClick={() => {
                              if (selectedMembership) void moveMembership(selectedMembership, role);
                            }}
                          >
                            {t(text.moveHere)}
                          </Button>
                        ) : null}
                      </header>
                      {roleMemberships.length === 0 ? (
                        <p className="admin-inline-empty">{t(text.noMemberInRole)}</p>
                      ) : (
                        <ListRows>
                          {roleMemberships.map((membership) => {
                            const member = memberById.get(membership.contactId);
                            const selected = selectedMembershipId === membership.id;
                            const movable = canUpdateMembership(membership);
                            return (
                              <ListRow
                                key={membership.id}
                                selected={selected}
                                onOpen={() => setSelectedMembershipId(selected ? null : membership.id)}
                                openTestId={testId(`membership-${membership.contactId}`)}
                                openProps={{ "aria-pressed": selected }}
                                lineProps={{
                                  draggable: movable,
                                  onDragStart: (event) => {
                                    event.dataTransfer.effectAllowed = "move";
                                    setDraggedMembershipId(membership.id);
                                  },
                                  onDragEnd: () => {
                                    setDraggedMembershipId(null);
                                    setDropRole(null);
                                  },
                                }}
                                head={<ListRowAvatar initials={memberInitials(member)} />}
                                title={memberName(member, t("contacts.notFound"))}
                                detail={t(text.sinceDate, { date: formatDate(membership.startedOn) })}
                              >
                                {selected ? (
                                  <div className="admin-membership-actions">
                                    <Button asChild variant="secondary">
                                      <Link
                                        data-testid={testId("contact-link")}
                                        to={`/contacts/${membership.contactId}`}
                                      >
                                        {t(text.openMember)}
                                      </Link>
                                    </Button>
                                    {movable ? (
                                      <Button variant="secondary" onClick={() => openMembershipEditor(membership)}>
                                        {t(text.editDates)}
                                      </Button>
                                    ) : null}
                                    {canEndMembership(membership) ? (
                                      <Button
                                        variant="secondary"
                                        data-testid={testId("end-membership")}
                                        onClick={() => openMembershipEnd(membership)}
                                      >
                                        {t(text.endMembership)}
                                      </Button>
                                    ) : null}
                                  </div>
                                ) : null}
                              </ListRow>
                            );
                          })}
                        </ListRows>
                      )}
                    </section>
                  );
                })}
              </div>
            )}

            {endedMemberships.length > 0 ? (
              <div className="admin-membership-history">
                <Disclosure
                  title={t(text.membershipHistory, { count: String(endedMemberships.length) })}
                  testId="membership-history"
                  toggleTestId="membership-history-toggle"
                  contentTestId="membership-history-content"
                >
                  <ListRows>
                    {endedMemberships.map((membership) => {
                      const member = memberById.get(membership.contactId);
                      return (
                        <ListRow
                          key={membership.id}
                          to={`/contacts/${membership.contactId}`}
                          head={<ListRowAvatar initials={memberInitials(member)} />}
                          title={memberName(member, t("contacts.notFound"))}
                          detail={`${t(bodyKind.roleLabel(membership.role))} · ${formatDate(membership.startedOn)} - ${
                            membership.endedOn ? formatDate(membership.endedOn) : ""
                          }`}
                          action={
                            canUpdateMembership(membership) ? (
                              <Button variant="secondary" onClick={() => openMembershipEditor(membership)}>
                                {t("common.edit")}
                              </Button>
                            ) : undefined
                          }
                        />
                      );
                    })}
                  </ListRows>
                </Disclosure>
              </div>
            ) : null}
          </section>

          {capability?.canArchive ? (
            <section className="admin-danger-zone">
              <SectionHeader
                title={t(text.archive)}
                description={t(text.archiveDescription)}
                commands={
                  <>
                    <Button
                      variant="danger"
                      disabled={submitting}
                      data-testid={testId("archive")}
                      onClick={() => void archiveBody()}
                    >
                      <DeleteIcon />
                      {t(submitting ? "common.saving" : text.archiveAction)}
                    </Button>
                  </>
                }
              />
            </section>
          ) : null}
        </div>

        <Modal open={Boolean(editedMembership)} title={t(text.editDates)} onClose={() => setEditedMembership(null)}>
          <form className="modal-form" onSubmit={submitMembershipUpdate}>
            <FieldRow>
              <Field label={t(text.startedOn)}>
                <Input
                  type="date"
                  required
                  value={editedStartedOn}
                  onChange={(event) => setEditedStartedOn(event.currentTarget.value)}
                />
              </Field>
              {editedMembership?.endedOn ? (
                <Field label={t(text.endedOn)}>
                  <Input
                    type="date"
                    required
                    value={editedEndedOn}
                    onChange={(event) => setEditedEndedOn(event.currentTarget.value)}
                  />
                </Field>
              ) : null}
            </FieldRow>
            <div className="dialog-actions">
              <Button variant="secondary" type="button" onClick={() => setEditedMembership(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={submitting}>
                {t(submitting ? "common.saving" : "common.save")}
              </Button>
            </div>
          </form>
        </Modal>

        <Modal
          open={Boolean(endingMembership)}
          title={t(text.endMembership)}
          hint={t(text.endMembershipDescription)}
          onClose={() => setEndingMembership(null)}
        >
          <form className="modal-form" onSubmit={submitMembershipEnd}>
            <Field label={t(text.endedOn)}>
              <Input
                data-testid={testId("end-membership-date")}
                type="date"
                required
                min={endingMembership?.startedOn}
                value={membershipEndDate}
                onChange={(event) => setMembershipEndDate(event.currentTarget.value)}
              />
            </Field>
            <div className="dialog-actions">
              <Button variant="secondary" type="button" onClick={() => setEndingMembership(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                variant="danger"
                disabled={submitting}
                data-testid={testId("end-membership-confirm")}
              >
                {t(submitting ? "common.saving" : text.confirmEndMembership)}
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </div>
  );
}
