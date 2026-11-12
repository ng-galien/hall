import { useState } from "react";
import { InfoIcon } from "./icons";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

/**
 * An information icon that shows an explanation instead of a sentence on the screen: on hover or focus with a
 * mouse, on a tap under a finger.
 */
export function HelpHint({ text, testId }: { text: string; testId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <Button
          variant="plain"
          size="icon"
          aria-label={text}
          data-testid={testId}
          onPointerLeave={(event) => {
            /* A finger leaving the screen after a tap keeps the explanation open. */
            if (event.pointerType === "touch") event.preventDefault();
          }}
          onClick={(event) => {
            /* A tap or a click opens the explanation (the trigger would close it); a tap elsewhere closes it. */
            event.preventDefault();
            setOpen(true);
          }}
        >
          <InfoIcon aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" className="help-hint-content">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
