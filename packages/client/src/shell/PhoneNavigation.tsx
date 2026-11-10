import { type ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { DocsIcon, FolderIcon, MemberIcon, MoreIcon, SettingsIcon } from "../components/icons";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";
import { useI18n } from "../i18n/I18nProvider";
import { isUnderPath } from "../pages/workspace/paths";
import { useWorkspaceResourcesStore } from "../stores/workspaceResourcesStore";
import { navigationItem, phoneMoreDestinations } from "./navigation";
import { useApiRoot } from "./usePhoneLayout";

export function personalWorkspaceHref(path: string) {
  return `/workspace?${new URLSearchParams({ path }).toString()}`;
}

// @implements-requirement HALL-FR-LAY-010
/** Bottom bar of the phone: the councillor's destinations, the rest under Plus. */
export function PhoneNavigation() {
  const { t } = useI18n();
  const location = useLocation();
  const { available } = useApiRoot();
  const personalPath = useWorkspaceResourcesStore((state) => state.personalWorkspacePath);
  const [moreOpen, setMoreOpen] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the sheet closes whenever the route changes.
  useEffect(() => setMoreOpen(false), [location.pathname, location.search]);

  const workspacePath = new URLSearchParams(location.search).get("path") ?? "";
  const inWorkspace = location.pathname === "/workspace";
  const inPersonal = inWorkspace && personalPath !== null && isUnderPath(workspacePath, personalPath);
  const meetings = navigationItem("/meetings");
  const calendar = navigationItem("/calendar");
  const documents = navigationItem("/workspace");
  const destinations = [
    {
      id: "home",
      to: "/",
      label: t("navigation.home"),
      icon: navigationItem("/").icon,
      active: location.pathname === "/",
    },
    available(meetings.requiredRelation)
      ? {
          id: "meetings",
          to: "/meetings",
          label: t("navigation.meetings"),
          icon: meetings.icon,
          active: location.pathname.startsWith("/meetings"),
        }
      : null,
    available(calendar.requiredRelation)
      ? {
          id: "calendar",
          to: "/calendar",
          label: t(calendar.labelKey),
          icon: calendar.icon,
          active: location.pathname.startsWith("/calendar"),
        }
      : null,
    available(documents.requiredRelation)
      ? {
          id: "documents",
          to: "/workspace",
          label: t("navigation.documents"),
          icon: <FolderIcon />,
          active: inWorkspace && !inPersonal,
        }
      : null,
    personalPath
      ? {
          id: "personal",
          to: personalWorkspaceHref(personalPath),
          label: t("workspace.personalWorkspace"),
          icon: <MemberIcon />,
          active: inPersonal,
        }
      : null,
  ].flatMap((destination) => (destination ? [destination] : []));
  const barActive = destinations.some((destination) => destination.active);

  const moreRows = phoneMoreDestinations
    .map(navigationItem)
    .filter((item) => available(item.requiredRelation))
    .map((item) => ({
      to: item.to,
      testId: item.to.slice(1),
      label: t(item.labelKey),
      icon: item.icon,
    }));

  const moreRow = (row: { to: string; testId: string; label: string; icon: ReactNode }) => (
    <Link
      className="nav-row"
      data-testid={`phone-more-${row.testId}`}
      key={row.to}
      to={row.to}
      onClick={() => setMoreOpen(false)}
    >
      <span className="nav-icon">{row.icon}</span>
      <span className="min-w-0 max-w-full">{row.label}</span>
    </Link>
  );

  return (
    <>
      <nav className="app-phone-bar" aria-label={t("common.primaryNavigation")} data-testid="phone-navigation">
        {destinations.map((destination) => (
          <Link
            className="app-phone-bar-item"
            data-active={destination.active}
            data-destination={destination.id}
            data-testid={`phone-navigation-${destination.id}`}
            aria-current={destination.active ? "page" : undefined}
            key={destination.id}
            to={destination.to}
          >
            <span aria-hidden="true">{destination.icon}</span>
            <span className="sr-only">{destination.label}</span>
          </Link>
        ))}
        <button
          type="button"
          className="app-phone-bar-item"
          data-active={moreOpen || !barActive}
          data-testid="phone-navigation-more"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen(true)}
        >
          <span aria-hidden="true">
            <MoreIcon weight="bold" />
          </span>
          <span className="sr-only">{t("navigation.more")}</span>
        </button>
      </nav>
      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent
          className="app-phone-more"
          placement="bottom"
          closeLabel={t("common.close")}
          aria-describedby={undefined}
          data-testid="phone-more"
        >
          <DialogTitle>{t("navigation.more")}</DialogTitle>
          <div className="app-phone-more-list">
            {moreRows.map(moreRow)}
            {moreRow({ to: "/docs", testId: "help", label: t("navigation.help"), icon: <DocsIcon /> })}
            {moreRow({ to: "/settings", testId: "account", label: t("navigation.account"), icon: <SettingsIcon /> })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
