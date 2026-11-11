import { InfoIcon } from "./icons";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

/** An information icon that shows an explanation on hover or focus, instead of a sentence on the screen. */
export function HelpHint({ text, testId }: { text: string; testId?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="plain" size="icon" aria-label={text} data-testid={testId}>
          <InfoIcon aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="help-hint-content">{text}</TooltipContent>
    </Tooltip>
  );
}
