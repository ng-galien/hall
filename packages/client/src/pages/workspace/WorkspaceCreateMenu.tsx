import type { ReactNode } from "react";
import { ContextMenuItem } from "../../components/ui/context-menu";
import { useId, useRef, useState } from "react";
import { AddIcon } from "../../components/icons";
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
import type { TranslationKey } from "../../i18n/en";
import { type WorkspaceCreateKind, workspaceCreateKinds, workspaceCreateKindIcons } from "./workspaceCreateKind";

export interface WorkspaceCreationOption {
  id: string;
  label: string;
  icon: typeof AddIcon;
  create(name: string): Promise<boolean>;
}

const labels = {
  councilMatter: "workspace.createCouncilMatter",
  text: "workspace.createText",
  spreadsheet: "workspace.createSpreadsheet",
  remote: "workspace.createRemote",
  geographic: "workspace.createGeographic",
  legalReference: "workspace.createLegalReference",
  file: "workspace.importFile",
} satisfies Record<WorkspaceCreateKind, TranslationKey>;

export function WorkspaceCreateMenu({
  canCreate,
  onCreate,
  extraOptions = [],
  compact = false,
  testId = "workspace-create-menu",
  render,
}: {
  canCreate(kind: WorkspaceCreateKind): boolean;
  onCreate(kind: WorkspaceCreateKind, title?: string): Promise<boolean>;
  extraOptions?: WorkspaceCreationOption[];
  compact?: boolean;
  testId?: string;
  render?(trigger: ReactNode, contextItems: ReactNode): ReactNode;
}) {
  const { t } = useI18n();
  const [kind, setKind] = useState<WorkspaceCreateKind | null>(null);
  const [extraOption, setExtraOption] = useState<WorkspaceCreationOption | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const nameId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const available = workspaceCreateKinds.filter(canCreate);
  const hasOptions = available.length > 0 || extraOptions.length > 0;
  const dialogTitle = extraOption?.label ?? (kind ? t(labels[kind]) : "");
  const trigger = hasOptions ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={compact ? "ghost" : "outline"}
          size={compact ? "icon-xs" : "default"}
          aria-label={
            extraOptions.length === 1 ? `${t("workspace.new")} · ${extraOptions[0]!.label}` : t("workspace.new")
          }
          title={extraOptions.length === 1 ? `${t("workspace.new")} · ${extraOptions[0]!.label}` : t("workspace.new")}
          data-testid={testId}
        >
          <AddIcon />
          {compact ? null : t("workspace.new")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-max max-w-(--radix-dropdown-menu-content-available-width)"
        data-testid="workspace-create-options"
      >
        {extraOptions.map((option) => (
          <DropdownMenuItem
            key={option.id}
            data-testid={`workspace-create-${option.id}`}
            onSelect={() => {
              setFailed(false);
              setKind(null);
              setTitle("");
              setExtraOption(option);
            }}
          >
            <option.icon className="size-4 shrink-0" />
            <span>{option.label}</span>
          </DropdownMenuItem>
        ))}
        {available.map((entry) => {
          const Icon = workspaceCreateKindIcons[entry];
          return (
            <DropdownMenuItem
              key={entry}
              data-testid={`workspace-create-${entry}`}
              onSelect={() => {
                if (entry === "file") {
                  void onCreate(entry);
                  return;
                }
                setFailed(false);
                setExtraOption(null);
                setTitle("");
                setKind(entry);
              }}
            >
              <Icon className="size-4 shrink-0" />
              <span className="min-w-0 break-words">{t(labels[entry])}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;
  const contextItems = hasOptions ? (
    <>
      {extraOptions.map((option) => (
        <ContextMenuItem
          key={option.id}
          data-testid={`workspace-context-create-${option.id}`}
          onSelect={() => {
            setFailed(false);
            setKind(null);
            setTitle("");
            setExtraOption(option);
          }}
        >
          <option.icon />
          {option.label}
        </ContextMenuItem>
      ))}
      {available.map((entry) => {
        const Icon = workspaceCreateKindIcons[entry];
        return (
          <ContextMenuItem
            key={entry}
            data-testid={`workspace-context-create-${entry}`}
            onSelect={() => {
              if (entry === "file") {
                void onCreate(entry);
                return;
              }
              setFailed(false);
              setExtraOption(null);
              setTitle("");
              setKind(entry);
            }}
          >
            <Icon />
            {t(labels[entry])}
          </ContextMenuItem>
        );
      })}
    </>
  ) : null;
  return (
    <>
      {render ? render(trigger, contextItems) : trigger}
      <Modal
        initialFocusRef={nameRef}
        open={kind !== null || extraOption !== null}
        title={dialogTitle}
        testId="workspace-create-dialog"
        onClose={() => {
          if (!busy) {
            setKind(null);
            setExtraOption(null);
          }
        }}
      >
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if ((!kind && !extraOption) || busy || !title.trim()) return;
            setBusy(true);
            setFailed(false);
            const creation = extraOption ? extraOption.create(title.trim()) : onCreate(kind!, title.trim());
            void creation
              .then((created) => {
                if (created) {
                  setKind(null);
                  setExtraOption(null);
                } else setFailed(true);
              })
              .catch(() => setFailed(true))
              .finally(() => setBusy(false));
          }}
        >
          {failed ? (
            <p role="alert" className="text-destructive" data-testid="workspace-create-error">
              {t("common.requestFailed")}
            </p>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor={nameId}>{t("workspace.creationName")}</Label>
            <Input
              ref={nameRef}
              id={nameId}
              name="name"
              autoFocus
              data-testid="workspace-create-name"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              disabled={busy}
            />
          </div>
          <Button
            className="justify-self-end"
            type="submit"
            data-testid="workspace-create-submit"
            disabled={busy || !title.trim()}
          >
            {t(busy ? "common.saving" : "common.create")}
          </Button>
        </form>
      </Modal>
    </>
  );
}
