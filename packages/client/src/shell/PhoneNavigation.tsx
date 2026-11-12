import type { Icon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CalendarIcon, DocsIcon, MemberIcon, MoreIcon, SettingsIcon } from "../components/icons";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";
import { useI18n } from "../i18n/I18nProvider";
import { isUnderPath } from "../pages/workspace/paths";
import { useWorkspaceResourcesStore } from "../stores/workspaceResourcesStore";
import { EntryRow, permittedEntry } from "./AppSidebar";
import {
  isCurrentEntry,
  isUnder,
  type NavigationItem,
  navigationBlocks,
  navigationItem,
  phoneBarDestinations,
} from "./navigation";
import { useApiRoot } from "./usePhoneLayout";

export function personalWorkspaceHref(path: string) {
  return `/workspace?${new URLSearchParams({ path }).toString()}`;
}

type BarDestination = { id: string; to: string; label: string; Icon: Icon; active: boolean };

/** One entry of the bottom bar: outline icon and permanent label; the active one in blue, bold, thicker stroke. */
function BarEntry({ id, label, Icon, active }: Pick<BarDestination, "id" | "label" | "Icon" | "active">) {
  return (
    <>
      <span className="app-phone-bar-icon" aria-hidden="true">
        <Icon weight={active ? "bold" : "regular"} />
      </span>
      <span className="app-phone-bar-label" data-destination-label={id}>
        {label}
      </span>
    </>
  );
}

// @implements-requirement HALL-FR-LAY-010
// @implements-requirement HALL-FR-LAY-110
/** Bottom bar of the phone (choice 1A): five destinations with icon and label; « Plus » lists the menu with the same
 * entries and sub-resources. */
// biome-ignore-start lint/correctness/useExhaustiveDependencies: the sheet closes whenever the route changes.
export function PhoneNavigation() {
  const { t } = useI18n();
  const location = useLocation();
  const { available } = useApiRoot();
  const personalPath = useWorkspaceResourcesStore((state) => state.personalWorkspacePath);
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => setMoreOpen(false), [location.pathname, location.search]);

  const workspacePath = new URLSearchParams(location.search).get("path") ?? "";
  const inWorkspace = location.pathname === "/workspace";
  const inPersonal = inWorkspace && personalPath !== null && isUnderPath(workspacePath, personalPath);
  const meetings = navigationItem("/meetings");
  const calendar = { ...navigationItem("/calendar"), Icon: CalendarIcon };
  const documents = navigationItem("/workspace");
  const destinations: BarDestination[] = [
    {
      id: "home",
      to: "/",
      label: t("navigation.home"),
      Icon: navigationItem("/").Icon,
      active: location.pathname === "/",
    },
    available(documents.requiredRelation)
      ? {
          id: "documents",
          to: "/workspace",
          label: t("navigation.documents"),
          Icon: documents.Icon,
          active: inWorkspace && !inPersonal,
        }
      : null,
    available(calendar.requiredRelation)
      ? {
          id: "calendar",
          to: "/calendar",
          label: t(calendar.labelKey),
          Icon: calendar.Icon,
          active: location.pathname.startsWith("/calendar"),
        }
      : null,
    available(meetings.requiredRelation)
      ? {
          id: "meetings",
          to: "/meetings",
          label: t("navigation.meetings"),
          Icon: meetings.Icon,
          active: location.pathname.startsWith("/meetings"),
        }
      : null,
  ].flatMap((destination) => (destination ? [destination] : []));
  const moreActive = moreOpen || !destinations.some((destination) => destination.active);

  const close = () => setMoreOpen(false);
  const pathname = location.pathname;
  const sheetEntries = navigationBlocks
    .flat()
    .flatMap((item) => permittedEntry(item, available) ?? [])
    .filter((item) => item.children || !phoneBarDestinations.has(item.to ?? ""));
  const accountRows: NavigationItem[] = [
    ...(personalPath
      ? [
          {
            id: "personal",
            to: personalWorkspaceHref(personalPath),
            labelKey: "workspace.personalWorkspace" as const,
            Icon: MemberIcon,
          },
        ]
      : []),
    { id: "help", to: "/docs", labelKey: "navigation.help", Icon: DocsIcon },
    { id: "account", to: "/settings", labelKey: "navigation.settings", Icon: SettingsIcon },
  ];

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
            <BarEntry {...destination} />
          </Link>
        ))}
        <button
          type="button"
          className="app-phone-bar-item"
          data-active={moreActive}
          data-testid="phone-navigation-more"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen(true)}
        >
          <BarEntry id="more" label={t("navigation.more")} Icon={MoreIcon} active={moreActive} />
        </button>
      </nav>
      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent
          className="app-sheet"
          placement="bottom"
          closeLabel={t("common.close")}
          aria-describedby={undefined}
          data-testid="phone-more"
        >
          <DialogTitle>{t("navigation.more")}</DialogTitle>
          <nav className="app-sheet-nav" aria-label={t("common.primaryNavigation")}>
            {sheetEntries.map((item) => (
              <div className="app-sidebar-item" key={item.id}>
                <EntryRow
                  item={item}
                  current={!item.children && isCurrentEntry(pathname, item)}
                  open={Boolean(item.children)}
                  testId={`phone-more-${item.id}`}
                  onNavigate={close}
                />
                {item.children ? (
                  <div className="nav-sub-entries">
                    {item.children.map((child) => (
                      <EntryRow
                        key={child.id}
                        item={child}
                        current={child.to !== undefined && isUnder(pathname, child.to)}
                        sub
                        testId={`phone-more-${child.id}`}
                        onNavigate={close}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            <div className="app-sheet-footer">
              {accountRows.map((item) => (
                <EntryRow
                  key={item.id}
                  item={item}
                  current={false}
                  testId={`phone-more-${item.id}`}
                  onNavigate={close}
                />
              ))}
            </div>
          </nav>
        </DialogContent>
      </Dialog>
    </>
  );
}
// biome-ignore-end lint/correctness/useExhaustiveDependencies: the sheet closes whenever the route changes.
