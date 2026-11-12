import type { ReactNode } from "react";
import { ScreenActions, ScreenTitleCommands, ScreenTitleFacts } from "../../shell/headerTrail";
import { usePhoneLayout } from "../../shell/usePhoneLayout";

/**
 * The commands of an opened message: on tablet and computer on the line of the title, with its save state under the
 * title, as for a document; on a phone in the screen header.
 * @implements-requirement HALL-FR-LAY-100
 */
export function MessageCommands({ facts, children }: { facts?: ReactNode; children: ReactNode }) {
  const phone = usePhoneLayout();
  if (phone)
    return (
      <ScreenActions>
        {facts}
        {children}
      </ScreenActions>
    );
  return (
    <>
      <ScreenTitleCommands>
        <div className="item-commands">{children}</div>
      </ScreenTitleCommands>
      {facts ? <ScreenTitleFacts>{facts}</ScreenTitleFacts> : null}
    </>
  );
}
