import type { ReactNode } from "react";
import { HelpHint } from "../../components/HelpHint";
import { ContactIcon } from "../../components/icons";
import { Sheet } from "../../components/ui/sheet";
import { usePhoneLayout } from "../../shell/usePhoneLayout";

/** Shared read-only person card of the contact and council-member references: from the bottom of a phone, in the middle
 * of a large screen. */
export function PersonReferenceDialog({
  name,
  description,
  initials,
  testId,
  onClose,
  children,
}: {
  name: string;
  description: string;
  initials: string | null;
  testId: string;
  onClose(): void;
  children: ReactNode;
}) {
  const phone = usePhoneLayout();
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      side={phone ? "bottom" : "center"}
      title={
        <span className="inline-flex min-w-0 max-w-full items-center gap-3 align-middle">
          <span className="member-avatar member-avatar-large" aria-hidden="true">
            {initials ?? <ContactIcon />}
          </span>
          <span className="min-w-0 truncate">{name}</span>
        </span>
      }
      titleAddon={<HelpHint text={description} />}
      testId={testId}
      onCloseAutoFocus={(event) => event.preventDefault()}
    >
      {children}
    </Sheet>
  );
}

export function PersonDetailField({
  label,
  value,
  testId,
  href,
}: {
  label: string;
  value: string;
  testId: string;
  href?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm" data-testid={testId}>
        {href ? (
          <a className="text-primary underline-offset-4 hover:underline" href={href}>
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
