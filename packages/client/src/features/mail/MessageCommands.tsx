import type { ReactNode } from "react";
import { ScreenActions, ScreenTitleCommands, ScreenTitleFacts } from "../../shell/headerTrail";
import { usePhoneLayout } from "../../shell/usePhoneLayout";

/**
 * The commands of an opened message: on tablet and computer on the line of the title, its save state before them, so
 * that the header of Courriels keeps one height with or without an opened message; on a phone in the screen header,
 * its save state under the title.
 * @implements-requirement HALL-FR-LAY-100
 */
export function MessageCommands({ facts, children }: { facts?: ReactNode; children: ReactNode }) {
  const phone = usePhoneLayout();
  if (phone)
    return (
      <>
        <ScreenActions>{children}</ScreenActions>
        {facts ? <ScreenTitleFacts>{facts}</ScreenTitleFacts> : null}
      </>
    );
  return (
    <ScreenTitleCommands>
      <div className="item-commands">
        {facts}
        {children}
      </div>
    </ScreenTitleCommands>
  );
}
