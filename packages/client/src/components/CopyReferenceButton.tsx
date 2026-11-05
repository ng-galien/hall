import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { CheckIcon, CopyIcon } from "./icons";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export interface ObjectReference {
  name: string;
  /** Folder path of a document or affair, shown after the name. */
  path?: string;
  /** Address of the page in Hall, relative to the origin. */
  page: string;
  /** API representation of the object. */
  href: string;
}

/** Plain text that names an object for someone else: name and folder, page address, API link. */
export function objectReferenceText(reference: ObjectReference, origin: string): string {
  return [
    reference.path ? `${reference.name} · ${reference.path}` : reference.name,
    new URL(reference.page, origin).href,
    reference.href,
  ].join("\n");
}

const copiedFeedbackMs = 1600;

/** Copies the reference of the object open on the page in one gesture. */
export function CopyReferenceButton({
  reference,
  size = "icon",
}: {
  reference: ObjectReference;
  size?: "icon" | "icon-sm";
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const label = t(copied ? "reference.copied" : "reference.copy");
  return (
    <Tooltip open={copied ? true : undefined}>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={size}
          data-testid="copy-object-reference"
          data-copied={copied ? "true" : undefined}
          aria-label={label}
          onClick={() => {
            void navigator.clipboard?.writeText(objectReferenceText(reference, window.location.origin)).then(() => {
              window.clearTimeout(timer.current);
              setCopied(true);
              timer.current = window.setTimeout(() => setCopied(false), copiedFeedbackMs);
            });
          }}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
