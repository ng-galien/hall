import { Children, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { MailIcon, PhoneIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "../../i18n/I18nProvider";
import { phoneHref } from "./contactPhones";

/** The `mailto:` address of an email address. */
export function mailHref(address: string): string {
  return `mailto:${address}`;
}

/**
 * A telephone number that opens the call, or an email address that opens the mail application.
 * @implements-requirement HALL-FR-DIR-180
 */
export function CoordinateLink({
  href,
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<"a"> & { href: string }) {
  return (
    <a {...props} href={href} className={cn("hall-link", className)}>
      {children}
    </a>
  );
}

/**
 * The call and the mail application of a person, as two icons at the end of a list row of a narrow list, each one
 * present when the person has the coordinate.
 * @implements-requirement HALL-FR-DIR-180
 */
export function CoordinateIcons({
  email,
  phone,
  testId,
}: {
  email: string | null;
  phone: string | null;
  testId: string;
}) {
  const { t } = useI18n();
  if (!email && !phone) return null;
  return (
    <span className="coordinate-icons">
      {phone ? (
        <Button asChild variant="plain" size="icon">
          <a href={phoneHref(phone)} aria-label={t("contacts.call")} data-testid={`${testId}-call-icon`}>
            <PhoneIcon />
          </a>
        </Button>
      ) : null}
      {email ? (
        <Button asChild variant="plain" size="icon">
          <a href={mailHref(email)} aria-label={t("contacts.writeEmail")} data-testid={`${testId}-email-icon`}>
            <MailIcon />
          </a>
        </Button>
      ) : null}
    </span>
  );
}

/** Facts of a line separated by « · ». */
export function separatedFacts(facts: ReactNode[]): ReactNode {
  return Children.toArray(
    facts
      .filter((fact) => fact !== null && fact !== undefined && fact !== false && fact !== "")
      .flatMap((fact, index) => (index > 0 ? [" · ", fact] : [fact])),
  );
}
