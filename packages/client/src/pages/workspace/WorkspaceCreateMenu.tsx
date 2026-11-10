import type { ReactNode } from "react";
import { useId, useRef, useState } from "react";
import { AddIcon } from "../../components/icons";
import { Modal, RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { ContextMenuItem } from "../../components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import type { TranslationKey } from "../../i18n/en";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import {
  type WorkspaceCreateKind,
  workspaceCreateKindIcons,
  workspaceCreateKinds,
  workspacePickedKinds,
} from "./workspaceCreateKind";

export interface WorkspaceCreationOption {
  id: string;
  label: string;
  icon: typeof AddIcon;
  create(name: string): Promise<boolean>;
}

export const workspaceCreateLabels = {
  councilMatter: "workspace.createCouncilMatter",
  text: "workspace.createText",
  spreadsheet: "workspace.createSpreadsheet",
  remote: "workspace.createRemote",
  geographic: "workspace.createGeographic",
  event: "workspace.createEvent",
  legalReference: "workspace.createLegalReference",
  file: "workspace.importFile",
  takePhoto: "workspace.takePhoto",
  choosePhoto: "workspace.choosePhoto",
} satisfies Record<WorkspaceCreateKind, TranslationKey>;

/** Creation state shared by the create menu and the attachment picker: the chosen kind and its name dialog. */
export function useWorkspaceCreation({
  onCreate,
  getError,
  clearError,
}: {
  onCreate(kind: WorkspaceCreateKind, title?: string): Promise<boolean>;
  getError?(): ApiErrorCode | null;
  clearError?(): void;
}) {
  const { t } = useI18n();
  const [kind, setKind] = useState<WorkspaceCreateKind | null>(null);
  const [extraOption, setExtraOption] = useState<WorkspaceCreationOption | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<ApiErrorCode | null>(null);
  const nameId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const dialogTitle = extraOption?.label ?? (kind ? t(workspaceCreateLabels[kind]) : "");
  const start = (entry: WorkspaceCreateKind) => {
    if (workspacePickedKinds.includes(entry)) {
      void onCreate(entry);
      return;
    }
    setFailed(null);
    setExtraOption(null);
    setTitle("");
    setKind(entry);
  };
  const startOption = (option: WorkspaceCreationOption) => {
    setFailed(null);
    setKind(null);
    setTitle("");
    setExtraOption(option);
  };
  const dialog = (
    <Modal
      initialFocusRef={nameRef}
      open={kind !== null || extraOption !== null}
      title={dialogTitle}
      testId="workspace-create-dialog"
      onClose={() => {
        if (!busy) {
          setFailed(null);
          clearError?.();
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
          setFailed(null);
          clearError?.();
          const creation = extraOption ? extraOption.create(title.trim()) : onCreate(kind!, title.trim());
          void creation
            .then((created) => {
              if (created) {
                setKind(null);
                setExtraOption(null);
              } else {
                const error = getError?.() ?? "request_failed";
                clearError?.();
                setFailed(error);
              }
            })
            .catch((error) => setFailed(apiErrorCode(error)))
            .finally(() => setBusy(false));
        }}
      >
        {failed ? (
          <div data-testid="workspace-create-error">
            <RequestErrorBanner error={failed} onDismiss={() => setFailed(null)} />
          </div>
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
  );
  return { start, startOption, dialog };
}

export function WorkspaceCreateMenu({
  canCreate,
  onCreate,
  extraOptions = [],
  compact = false,
  testId = "workspace-create-menu",
  label,
  optionLabels,
  getError,
  clearError,
  render,
}: {
  label?: string;
  optionLabels?: Partial<Record<WorkspaceCreateKind, TranslationKey>>;
  canCreate(kind: WorkspaceCreateKind): boolean;
  onCreate(kind: WorkspaceCreateKind, title?: string): Promise<boolean>;
  extraOptions?: WorkspaceCreationOption[];
  compact?: boolean;
  testId?: string;
  getError?(): ApiErrorCode | null;
  clearError?(): void;
  render?(trigger: ReactNode, contextItems: ReactNode): ReactNode;
}) {
  const { t } = useI18n();
  const creation = useWorkspaceCreation({ onCreate, getError, clearError });
  const available = workspaceCreateKinds.filter(canCreate);
  const hasOptions = available.length > 0 || extraOptions.length > 0;
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
          {compact ? null : (label ?? t("workspace.new"))}
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
            onSelect={() => creation.startOption(option)}
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
              onSelect={() => creation.start(entry)}
            >
              <Icon className="size-4 shrink-0" />
              <span className="min-w-0 break-words">{t(optionLabels?.[entry] ?? workspaceCreateLabels[entry])}</span>
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
          onSelect={() => creation.startOption(option)}
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
            onSelect={() => creation.start(entry)}
          >
            <Icon />
            {t(workspaceCreateLabels[entry])}
          </ContextMenuItem>
        );
      })}
    </>
  ) : null;
  return (
    <>
      {render ? render(trigger, contextItems) : trigger}
      {creation.dialog}
    </>
  );
}
