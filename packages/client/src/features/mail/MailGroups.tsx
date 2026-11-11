import { findSirenAction, type MailRecipient, type MailRecipientGroup, type SirenEntity } from "@hall/api-contract";
import { useEffect, useState } from "react";
import { MembersIcon } from "../../components/icons";
import { Modal, RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { ListRow, ListRowIcon, ListRows } from "../../components/ui/list-row";
import { useI18n } from "../../i18n/I18nProvider";
import { apiErrorCode, apiSirenRequest, type SirenApiResult, submitSirenAction } from "../../services/apiClient";
import { listMailGroups, type MailRecipientSelections } from "../../services/mailApi";
import { MailRecipients } from "./MailRecipients";

export function MailGroups({
  contacts,
  onClose,
  onChanged,
}: {
  contacts: MailRecipientSelections["contacts"];
  onClose(): void;
  onChanged(): void;
}) {
  const { t } = useI18n();
  const [groups, setGroups] = useState<SirenApiResult<MailRecipientGroup[]> | null>(null);
  const [current, setCurrent] = useState<SirenEntity | null>(null);
  const [id, setId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [name, setName] = useState("");
  const [recipients, setRecipients] = useState<MailRecipient[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void listMailGroups().then(setGroups).catch(setError);
  }, []);
  const canSave = current && findSirenAction(current, id ? "mail-group.update" : "mail-group.create");
  const edit = async (group?: MailRecipientGroup) => {
    try {
      const entity = group ? await apiSirenRequest<MailRecipientGroup>(`/mail-recipient-groups/${group.id}`) : groups;
      setDeleteOpen(false);
      setCurrent(entity?.representation ?? null);
      setId(group?.id ?? null);
      setRevision(group?.revision ?? 0);
      setName(group?.name ?? "");
      setRecipients(group?.members.map((member) => ({ ...member, kind: "to" })) ?? []);
    } catch (cause) {
      setError(cause);
    }
  };
  const save = async () => {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      await submitSirenAction(current, id ? "mail-group.update" : "mail-group.create", {
        name,
        members: recipients.map(({ kind: _kind, ...member }) => member),
        ...(id ? { expectedRevision: revision } : {}),
      });
      setGroups(await listMailGroups());
      setCurrent(null);
      onChanged();
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open testId="mail-groups-dialog" title={t("mail.groups")} onClose={onClose}>
      <RequestErrorBanner error={error ? apiErrorCode(error) : null} />
      <div className="grid gap-3">
        {groups?.data.length ? (
          <ListRows>
            {groups.data.map((group) => (
              <ListRow
                key={group.id}
                onOpen={() => void edit(group)}
                openTestId={`mail-group-open-${group.id}`}
                selected={current !== null && id === group.id}
                head={
                  <ListRowIcon nature="council">
                    <MembersIcon />
                  </ListRowIcon>
                }
                title={group.name}
                detail={group.members.length}
              />
            ))}
          </ListRows>
        ) : null}
        {groups?.representation && findSirenAction(groups.representation, "mail-group.create") ? (
          <Button variant="outline" data-testid="mail-group-new" onClick={() => void edit()}>
            {t("mail.newGroup")}
          </Button>
        ) : null}
        {current ? (
          <div className="grid gap-3 border-t pt-3">
            <Label htmlFor="mail-group-name">{t("mail.groupName")}</Label>
            <Input
              id="mail-group-name"
              data-testid="mail-group-name"
              value={name}
              disabled={!canSave || busy}
              onChange={(event) => setName(event.target.value)}
            />
            <MailRecipients
              kind="to"
              recipients={recipients}
              contacts={contacts}
              onChange={setRecipients}
              disabled={!canSave || busy}
              testId="mail-group-members"
            />
            {id && findSirenAction(current, "mail-group.delete") ? (
              <Button
                variant="ghost"
                data-testid="mail-group-delete"
                disabled={busy}
                onClick={() => setDeleteOpen(true)}
              >
                {t("common.delete")}
              </Button>
            ) : null}
            {deleteOpen ? (
              <div>
                <p>{t("mail.deleteGroupHelp")}</p>
                <Button
                  variant="destructive"
                  data-testid="mail-group-delete-confirm"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void submitSirenAction(current, "mail-group.delete", { expectedRevision: revision })
                      .then(async () => {
                        setGroups(await listMailGroups());
                        setCurrent(null);
                        setDeleteOpen(false);
                        onChanged();
                      })
                      .catch(setError)
                      .finally(() => setBusy(false));
                  }}
                >
                  {t("common.delete")}
                </Button>
              </div>
            ) : null}
            {canSave ? (
              <Button disabled={busy || !name.trim()} data-testid="mail-group-save" onClick={() => void save()}>
                {t("common.save")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
