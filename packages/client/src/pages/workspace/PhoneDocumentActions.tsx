import { type ReactNode, useEffect, useId, useRef, useState } from "react";
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
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { useI18n } from "../../i18n/I18nProvider";
import { PhoneHeaderActions } from "../../shell/headerTrail";

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

/** The single entry point of the actions of an opened item on a phone. */
export function PhoneDocumentActions({ actions }: { actions: PhoneDocumentAction[] }) {
  const { t } = useI18n();
  if (actions.length === 0) return null;
  return (
    <PhoneHeaderActions>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className="app-phone-header-more"
            variant="ghost"
            size="icon"
            data-testid="phone-document-actions"
            aria-label={t("workspace.documentActions")}
          >
            <MoreIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-max max-w-[calc(100vw-2rem)]">
          {actions.map((action) => (
            <DropdownMenuItem
              key={action.id}
              className="app-phone-action"
              data-testid={`phone-document-action-${action.id}`}
              variant={action.destructive ? "destructive" : "default"}
              onSelect={action.onSelect}
            >
              {action.icon}
              <span>{action.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </PhoneHeaderActions>
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
  const inputId = useId();
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
        <div className="grid gap-1.5">
          <Label htmlFor={inputId}>{t("workspace.creationName")}</Label>
          <Input
            id={inputId}
            ref={inputRef}
            data-testid="phone-rename-name"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={busy}
            required
          />
        </div>
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
