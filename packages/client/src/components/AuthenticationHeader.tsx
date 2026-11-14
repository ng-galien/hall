import type { ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { HallLogo } from "./ui/hall-logo";

// @implements-requirement HALL-FR-USR-080
/**
 * The head of a sign-in or link screen: the logo and the name of Hall, the name of the commune of the installation
 * when it is set, then the title of the screen.
 */
export function AuthenticationHeader({ communeName, children }: { communeName: string; children: ReactNode }) {
  const { t } = useI18n();
  const commune = communeName.trim();
  return (
    <header className="authentication-header" data-testid="authentication-header">
      <span className="authentication-brand">
        <HallLogo />
        <span className="authentication-brand-name">{t("app.name")}</span>
      </span>
      {commune ? (
        <p className="authentication-commune" data-testid="authentication-commune">
          {commune}
        </p>
      ) : null}
      {children}
    </header>
  );
}
