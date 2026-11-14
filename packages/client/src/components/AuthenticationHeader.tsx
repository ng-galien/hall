import { useI18n } from "../i18n/I18nProvider";
import { HallLogo } from "./ui/hall-logo";

// @implements-requirement HALL-FR-USR-080
/**
 * The head of an access screen: the logo of Hall, then the name of the commune of the installation as the title of the
 * screen with Hall under it; without a commune name, Hall is the title.
 */
export function AuthenticationHeader({ communeName }: { communeName: string }) {
  const { t } = useI18n();
  const commune = communeName.trim();
  return (
    <header className="authentication-header" data-testid="authentication-header">
      <HallLogo />
      {commune ? (
        <>
          <h1 data-testid="authentication-commune" title={commune}>
            {commune}
          </h1>
          <p className="authentication-product">{t("app.name")}</p>
        </>
      ) : (
        <h1>{t("app.name")}</h1>
      )}
    </header>
  );
}
