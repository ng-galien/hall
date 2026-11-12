import { type ReactNode, useContext, useState } from "react";
import { createPortal } from "react-dom";
import { SidebarCollapseIcon, SidebarExpandIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useI18n } from "../../i18n/I18nProvider";
import { ModulePaneSlotContext, ScreenLeading } from "../../shell/headerTrail";

/** Keeps a fold for the next visits; without storage, it lasts for this visit only. */
function storeFold(storageKey: string, folded: boolean) {
  try {
    localStorage.setItem(storageKey, String(folded));
    return true;
  } catch {
    return false;
  }
}

/** The unfolded or folded state of a panel, chosen by this person in this browser. */
export function useRememberedFold(key: string): [boolean, (folded: boolean) => void] {
  const storageKey = `mairie.fold.${key}`;
  const [folded, setFolded] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === "true";
    } catch {
      return false;
    }
  });
  const change = (next: boolean) => {
    setFolded(next);
    storeFold(storageKey, next);
  };
  return [folded, change];
}

/**
 * The control that reopens a folded panel, at the start of the screen header: the panel has no header left to carry
 * it.
 */
export function PaneReopenButton({ label, testId, onOpen }: { label: string; testId: string; onOpen(): void }) {
  return (
    <ScreenLeading>
      <Button
        variant="plain"
        size="icon"
        data-testid={testId}
        aria-label={label}
        aria-expanded={false}
        onClick={onOpen}
      >
        <SidebarExpandIcon />
      </Button>
    </ScreenLeading>
  );
}

/**
 * The single module pane of Hall, on tablet and computer: between the menu and the content, over the whole height,
 * with its title and its own fold control in its header; its content scrolls on its own and its state is remembered.
 * Folded, the content takes the whole width and the control that reopens it starts the screen header. A screen
 * without a pane gives the whole width to its content; on a phone, the screen shows its own navigation instead.
 * @implements-requirement HALL-FR-LAY-160
 */
export function ModulePane({
  id,
  title,
  testId,
  children,
}: {
  /** Name under which the fold of this pane is remembered. */
  id: string;
  title: string;
  testId: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const slot = useContext(ModulePaneSlotContext);
  const [folded, setFolded] = useRememberedFold(`pane.${id}`);
  if (!slot) return null;
  if (folded) {
    return (
      <PaneReopenButton
        label={t("common.expandPane", { title })}
        testId={`${testId}-toggle`}
        onOpen={() => setFolded(false)}
      />
    );
  }
  return createPortal(
    <aside className="module-pane" aria-label={title} data-testid={testId}>
      <div className="module-pane-head">
        <h2 className="module-pane-title">{title}</h2>
        <Button
          variant="plain"
          size="icon"
          data-testid={`${testId}-toggle`}
          aria-label={t("common.collapsePane", { title })}
          aria-expanded
          onClick={() => setFolded(true)}
        >
          <SidebarCollapseIcon />
        </Button>
      </div>
      <div className="module-pane-body">{children}</div>
    </aside>,
    slot,
  );
}
