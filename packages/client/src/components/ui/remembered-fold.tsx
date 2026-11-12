import { useState } from "react";
import { SidebarExpandIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ScreenLeading } from "../../shell/headerTrail";

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
 * @implements-requirement HALL-FR-LAY-160
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
