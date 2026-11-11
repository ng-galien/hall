import type { ReactNode } from "react";
import { ContactIcon } from "../../components/icons";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { useI18n } from "../../i18n/I18nProvider";

/** Shared read-only person frame used by native contact and council-member references. */
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
  const { t } = useI18n();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="max-h-[85vh] gap-0 overflow-y-auto p-0 sm:max-w-xl"
        closeLabel={t("common.close")}
        data-testid={testId}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className="border-b px-6 py-5 pr-12">
          <div className="flex min-w-0 items-center gap-4">
            <span className="member-avatar member-avatar-large" aria-hidden="true">
              {initials ?? <ContactIcon />}
            </span>
            <div className="min-w-0">
              <DialogTitle className="break-words text-lg leading-snug font-semibold">{name}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
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
