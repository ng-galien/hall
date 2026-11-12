import { type ReactNode, useEffect, useRef, useState } from "react";
import { usePhoneEditorCommands } from "../../components/editor/phoneEditorCommands";
import {
  CopyIcon,
  DeleteIcon,
  EditIcon,
  MoreIcon,
  PdfIcon,
  PinIcon,
  PinnedIcon,
  RedoIcon,
} from "../../components/icons";
import { Modal } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Field } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { useI18n } from "../../i18n/I18nProvider";
import { ScreenActions } from "../../shell/headerTrail";

export interface PhoneDocumentAction {
  id: string;
  label: string;
  icon: ReactNode;
  destructive?: boolean;
  onSelect(): void;
}

export const phoneActionIcons = { edit: EditIcon, pdf: PdfIcon, copy: CopyIcon, changes: RedoIcon, delete: DeleteIcon };

export function pinIcon(pinned: boolean) {
  return pinned ? <PinnedIcon /> : <PinIcon />;
}

/** The single entry point of the actions of an opened item on a phone; while a text is written, its writing commands come first. */
export function PhoneDocumentActions({ actions: itemActions }: { actions: PhoneDocumentAction[] }) {
  const { t } = useI18n();
  const writing = usePhoneEditorCommands((store) => store.commands);
  const actions: PhoneDocumentAction[] = [...writing, ...itemActions];
  if (actions.length === 0) return null;
  return (
    <ScreenActions>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="plain"
            size="icon"
            data-testid="phone-document-actions"
            aria-label={t("workspace.documentActions")}
          >
            <MoreIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" collisionPadding={16} className="w-max max-w-[calc(100vw-2rem)]">
          {actions.map((action) => (
            <DropdownMenuItem
              key={action.id}
              data-testid={`phone-document-action-${action.id}`}
              variant={action.destructive ? "destructive" : "default"}
              onSelect={action.onSelect}
            >
              {action.icon}
              <span className="phone-document-action-label">{action.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </ScreenActions>
  );
}

/** Name of the opened item, renamed from the actions menu. */
export function PhoneRenameDialog({
  open,
  name,
  onClose,
  onRename,
}: {
  open: boolean;
  name: string;
  onClose(): void;
  onRename(name: string): Promise<boolean>;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(name);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setDraft(name);
  }, [name, open]);
  return (
    <Modal
      open={open}
      title={t("common.rename")}
      testId="phone-rename-dialog"
      initialFocusRef={inputRef}
      onClose={onClose}
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy || !draft.trim()) return;
          setBusy(true);
          void onRename(draft.trim())
            .then((renamed) => {
              if (renamed) onClose();
            })
            .finally(() => setBusy(false));
        }}
      >
        <Field label={t("workspace.creationName")}>
          <Input
            ref={inputRef}
            data-testid="phone-rename-name"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={busy}
            required
          />
        </Field>
        <Button
          className="justify-self-end"
          type="submit"
          data-testid="phone-rename-submit"
          disabled={busy || !draft.trim()}
        >
          {t(busy ? "common.saving" : "common.rename")}
        </Button>
      </form>
    </Modal>
  );
}
