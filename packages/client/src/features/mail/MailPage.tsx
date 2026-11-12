import type { MailMessage, MailRecipientGroup } from "@hall/api-contract";
import { findSirenAction } from "@hall/api-contract";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { DraftIcon, MailIcon, MoreIcon, SentIcon, SidebarCollapseIcon } from "../../components/icons";
import { EmptyState, RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { CreateButton } from "../../components/ui/create-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { ListRow, ListRowIcon, ListRows } from "../../components/ui/list-row";
import { PaneReopenButton, useRememberedFold } from "../../components/ui/remembered-fold";
import { SearchInput } from "../../components/ui/search-input";
import { useI18n } from "../../i18n/I18nProvider";
import { apiErrorCode, type SirenApiResult, submitSirenAction } from "../../services/apiClient";
import {
  listMail,
  listMailGroups,
  listMailRecipients,
  type MailRecipientSelections,
  openMail,
} from "../../services/mailApi";
import { ScreenTitle } from "../../shell/headerTrail";
import { usePhoneLayout } from "../../shell/usePhoneLayout";
import { MailEditor } from "./MailEditor";
import { MailGroups } from "./MailGroups";
import { MailReader } from "./MailReader";
import { MessageCommands } from "./MessageCommands";
import { useMailCountsStore } from "./mailCounts";
import {
  displayRecipients,
  folderMessages,
  isMailFolder,
  type MailFolder,
  mailFolderOf,
  mailFolders,
  needsAttention,
  recipientGroups,
} from "./mailFolders";
import { mailStatus } from "./mailStatus";

const emptySelections: MailRecipientSelections = { contacts: [], councilContactIds: [], committees: [] };
const folderIcons = { drafts: DraftIcon, sent: SentIcon };

/**
 * The shared mailbox of the commune: the menu holds « Brouillons » and « Envoyés » under its Courriels entry, the
 * « … » menu of the screen « Gérer les groupes… »; the list of the folder, which folds and searches, sits beside the
 * opened message. On a phone, two tabs head the list and a message opens over the whole screen.
 * @implements-requirement HALL-FR-EML-010
 * @implements-requirement HALL-FR-EML-100
 */
export function MailPage() {
  const { t, formatDate } = useI18n();
  const params = useParams();
  const navigate = useNavigate();
  const phone = usePhoneLayout();
  const routeFolder = isMailFolder(params.folder) ? params.folder : undefined;
  const mailId = routeFolder ? params.mailId : params.folder;
  const [collection, setCollection] = useState<SirenApiResult<MailMessage[]> | null>(null);
  const [savedGroups, setSavedGroups] = useState<MailRecipientGroup[]>([]);
  const [selections, setSelections] = useState(emptySelections);
  const [opened, setOpened] = useState<SirenApiResult<MailMessage> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [query, setQuery] = useState("");
  const [groupsDialog, setGroupsDialog] = useState<{ groupId?: string } | null>(null);
  const [listFolded, setListFolded] = useRememberedFold("mail.list");

  const refresh = useCallback(async () => {
    const mail = await listMail();
    setCollection(mail);
    useMailCountsStore.getState().set({
      drafts: mail.data.filter((message) => mailFolderOf(message) === "drafts").length,
      sent: mail.data.filter((message) => mailFolderOf(message) === "sent").length,
    });
    setSavedGroups((await listMailGroups()).data);
  }, []);
  useEffect(() => {
    void refresh().catch(setError);
    void listMailRecipients()
      .then((result) => setSelections(result.data))
      .catch(setError);
  }, [refresh]);
  useEffect(() => {
    let active = true;
    setOpened(null);
    if (mailId)
      void openMail(mailId)
        .then((result) => {
          if (active) setOpened(result);
        })
        .catch((cause) => {
          if (active) setError(cause);
        });
    return () => {
      active = false;
    };
  }, [mailId]);
  useEffect(() => {
    if (!params.folder) navigate("/mail/drafts", { replace: true });
    else if (!routeFolder && opened)
      navigate(`/mail/${mailFolderOf(opened.data)}/${opened.data.id}`, { replace: true });
  }, [navigate, opened, params.folder, routeFolder]);

  const folder: MailFolder = routeFolder ?? (opened ? mailFolderOf(opened.data) : "drafts");
  const messages = collection?.data ?? [];
  const groups = useMemo(
    () => recipientGroups(selections, savedGroups, t("mail.council")),
    [selections, savedGroups, t],
  );
  const shown = folderMessages(messages, folder).filter((message) => {
    const text = `${message.subject} ${message.recipients.map((entry) => `${entry.name} ${entry.address}`).join(" ")}`;
    return text.toLocaleLowerCase("fr").includes(query.trim().toLocaleLowerCase("fr"));
  });
  const recipientsSummary = (message: MailMessage) => {
    const names = (["to", "cc", "bcc"] as const).flatMap((kind) => {
      const display = displayRecipients(message.recipients, kind, groups);
      return [
        ...display.groups.map(({ group }) => group.name),
        ...display.singles.map((index) => message.recipients[index].name || message.recipients[index].address),
      ];
    });
    return names.join(", ") || t("mail.noRecipients");
  };
  const canCreate = Boolean(collection?.representation && findSirenAction(collection.representation, "mail.create"));
  const create = () =>
    void (async () => {
      if (!collection?.representation) return;
      try {
        const result = await submitSirenAction<MailMessage>(collection.representation, "mail.create", {});
        await refresh();
        navigate(`/mail/drafts/${result.data.id}`);
      } catch (cause) {
        setError(cause);
      }
    })();
  const editable = Boolean(opened?.representation && findSirenAction(opened.representation, "mail.update"));
  const folderLink = (entry: MailFolder) => `/mail/${entry}`;
  const count = (entry: MailFolder) => messages.filter((message) => mailFolderOf(message) === entry).length;

  const list = (
    <div className="mail-list" data-testid="mail-list">
      {phone ? (
        <div className="mail-tabs" role="tablist">
          {mailFolders.map((entry) => (
            <Link
              key={entry}
              role="tab"
              aria-selected={entry === folder}
              className="mail-tab"
              data-testid={`mail-tab-${entry}`}
              to={folderLink(entry)}
            >
              {t(`mail.${entry}`)} <span className="mail-count">{count(entry)}</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mail-list-head">
          <Button
            variant="plain"
            size="icon"
            data-testid="mail-list-toggle"
            aria-label={t("mail.collapseList")}
            aria-expanded
            onClick={() => setListFolded(true)}
          >
            <SidebarCollapseIcon />
          </Button>
          <span className="mail-list-count">{t(`mail.count.${folder}`, { count: shown.length })}</span>
        </div>
      )}
      <SearchInput
        className="mail-search"
        data-testid="mail-search"
        aria-label={t("mail.search")}
        placeholder={t("mail.search")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {shown.length === 0 ? (
        <EmptyState>{t(query.trim() ? "mail.noMatch" : `mail.empty.${folder}`)}</EmptyState>
      ) : (
        <ListRows>
          {shown.map((message) => {
            const Glyph = folderIcons[mailFolderOf(message)];
            return (
              <ListRow
                key={message.id}
                to={`/mail/${mailFolderOf(message)}/${message.id}`}
                openTestId={`mail-open-${message.id}`}
                data-attention={needsAttention(message) ? "true" : undefined}
                selected={message.id === mailId}
                head={
                  <ListRowIcon nature="writing">
                    <Glyph />
                  </ListRowIcon>
                }
                title={message.subject || t("mail.noSubject")}
                detail={recipientsSummary(message)}
                wide={formatDate(message.submissions[0]?.startedAt ?? message.updatedAt)}
                status={mailStatus(t, message)}
              />
            );
          })}
        </ListRows>
      )}
    </div>
  );

  const view =
    opened && opened.data.id === mailId ? (
      editable ? (
        <MailEditor
          key={opened.data.id}
          initial={opened}
          groups={groups}
          contacts={selections.contacts}
          onChanged={() => void refresh().catch(setError)}
          onDeleted={() => {
            setOpened(null);
            void refresh().catch(setError);
            navigate("/mail/drafts");
          }}
          onSent={(result) => {
            void refresh().catch(setError);
            setOpened(result);
            navigate(`/mail/sent/${result.data.id}`);
          }}
          onManageGroups={() => setGroupsDialog({})}
          onCreate={canCreate ? create : undefined}
        />
      ) : (
        <MailReader
          key={opened.data.id}
          opened={opened}
          groups={groups}
          contacts={selections.contacts}
          onAdopt={(result) => {
            setOpened(result);
            void refresh().catch(setError);
          }}
          onCopied={(result) => {
            void refresh().catch(setError);
            navigate(`/mail/drafts/${result.data.id}`);
          }}
        />
      )
    ) : mailId ? null : (
      <div className="mail-view-empty">
        <MailIcon aria-hidden="true" />
        {t("mail.selectMessage")}
      </div>
    );

  return (
    <div className="page mail-page">
      <ScreenTitle>{t(`mail.${folder}`)}</ScreenTitle>
      {editable && opened?.data.id === mailId ? null : (
        <MessageCommands>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="plain" size="icon" data-testid="mail-more" aria-label={t("mail.more")}>
                <MoreIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem data-testid="mail-manage-groups" onSelect={() => setGroupsDialog({})}>
                {t("mail.manageGroups")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </MessageCommands>
      )}
      <RequestErrorBanner error={error ? apiErrorCode(error) : null} onDismiss={() => setError(null)} />
      {canCreate && !mailId ? (
        <CreateButton
          testId="mail-new"
          options={[{ id: "mail", label: t("mail.new"), Icon: MailIcon, nature: "writing", onSelect: create }]}
        />
      ) : null}
      {phone ? (
        mailId ? (
          view
        ) : (
          list
        )
      ) : (
        <div className="mail-screen" data-list-folded={listFolded ? "true" : undefined}>
          {listFolded ? (
            <PaneReopenButton
              label={t("mail.expandList")}
              testId="mail-list-toggle"
              onOpen={() => setListFolded(false)}
            />
          ) : (
            list
          )}
          <div className="mail-view">{view}</div>
        </div>
      )}
      {groupsDialog ? (
        <MailGroups
          contacts={selections.contacts}
          initialGroupId={groupsDialog.groupId}
          onClose={() => setGroupsDialog(null)}
          onChanged={() => void refresh().catch(setError)}
        />
      ) : null}
    </div>
  );
}
