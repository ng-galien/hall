import type { Icon } from "@phosphor-icons/react";
import { Fragment, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CalendarIcon, DocsIcon, MemberIcon, MoreIcon, SettingsIcon } from "../components/icons";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";
import type { TranslationKey } from "../i18n/en";
import { useI18n } from "../i18n/I18nProvider";
import { isUnderPath } from "../pages/workspace/paths";
import { useWorkspaceResourcesStore } from "../stores/workspaceResourcesStore";
import { isUnder, type NavigationItem, navigationBlocks, navigationItem, phoneBarDestinations } from "./navigation";

/** The short names written under the icons of the « Plus » grid; the screen and the screen reader keep the full one. */
const gridLabels: Record<string, TranslationKey> = {
  "council-delegations": "navigation.gridDelegations",
  templates: "navigation.gridTemplates",
  "administration-documents": "navigation.gridDocumentSettings",
  "administration-mail": "navigation.gridMailSettings",
};

import { useApiRoot } from "./usePhoneLayout";

export function personalWorkspaceHref(path: string) {
  return `/workspace?${new URLSearchParams({ path }).toString()}`;
}

type MoreRow = { to: string; testId: string; label: string; short: string; Icon: Icon };

type BarDestination = { id: string; to: string; label: string; Icon: Icon; active: boolean };

/** The words of a short label with their position in it. */
function labelWords(label: string) {
  let offset = 0;
  return label.split(" ").map((word) => {
    const entry = { word, offset };
    offset += word.length + 1;
    return entry;
  });
}

/** One entry of the bottom bar: outline icon and permanent label; the active one in blue. */
function BarEntry({ id, label, Icon }: Pick<BarDestination, "id" | "label" | "Icon">) {
  return (
    <>
      <span className="app-phone-bar-icon" aria-hidden="true">
        <Icon weight="regular" />
      </span>
      <span className="app-phone-bar-label" data-destination-label={id}>
        {label}
      </span>
    </>
  );
}

// @implements-requirement HALL-FR-LAY-010
// @implements-requirement HALL-FR-LAY-110
/** Bottom bar of the phone (choice 1A): five destinations with icon and label; « Plus » opens a sheet with the other
 * ones as a grid of icons in the same form, by categories under a small grey title. */
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
  const row = (item: NavigationItem): MoreRow => ({
    to: item.to ?? "/",
    testId: item.id,
    label: t(item.labelKey),
    short: t(gridLabels[item.id] ?? item.labelKey),
    Icon: item.Icon,
  });
  const entry = (id: string) => navigationBlocks.flat().find((item) => item.id === id);
  const children = (id: string) =>
    (entry(id)?.children ?? []).filter(
      (child) =>
        available(child.requiredRelation) && !phoneBarDestinations.has(child.to ?? "") && child.id !== "meetings",
    );
  const tools = ["mail", "contacts", "maps"]
    .flatMap((id) => entry(id) ?? [])
    .filter((item) => available(item.requiredRelation));
  const personal: MoreRow[] = personalPath
    ? [
        {
          to: personalWorkspaceHref(personalPath),
          testId: "personal",
          label: t("workspace.personalWorkspace"),
          short: t("workspace.personalWorkspace"),
          Icon: MemberIcon,
        },
      ]
    : [];
  const moreGroups: Array<{ key: string; label: string; rows: MoreRow[] }> = [
    { key: "council", label: t("navigation.council"), rows: children("council").map(row) },
    { key: "tools", label: t("navigation.workTools"), rows: [...tools.map(row), ...personal] },
    {
      key: "administration",
      label: t("navigation.administration"),
      rows: [
        ...children("administration").map(row),
        {
          to: "/settings",
          testId: "settings",
          label: t("navigation.settings"),
          short: t("navigation.settings"),
          Icon: SettingsIcon,
        },
        {
          to: "/docs",
          testId: "help",
          label: t("navigation.documentation"),
          short: t("navigation.documentation"),
          Icon: DocsIcon,
        },
      ],
    },
  ].filter((group) => group.rows.length > 0);

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
          <BarEntry id="more" label={t("navigation.more")} Icon={MoreIcon} />
        </button>
      </nav>
      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent
          className="app-sheet px-0"
          placement="bottom"
          closeLabel={t("common.close")}
          aria-describedby={undefined}
          data-testid="phone-more"
        >
          <DialogTitle className="sr-only">{t("navigation.more")}</DialogTitle>
          <nav className="app-sheet-grid" aria-label={t("common.primaryNavigation")}>
            {moreGroups.map((group) => (
              <section className="app-sheet-group" key={group.key} data-testid={`phone-more-group-${group.key}`}>
                <h3 className="app-sheet-group-title">{group.label}</h3>
                <div className="app-sheet-cells">
                  {group.rows.map((item) => {
                    const [path, query] = item.to.split("?");
                    const current =
                      (path === "/workspace"
                        ? `${location.pathname}${location.search}` === item.to
                        : isUnder(location.pathname, path)) && !query;
                    return (
                      <Link
                        key={item.testId}
                        to={item.to}
                        className="app-sheet-cell"
                        data-testid={`phone-more-${item.testId}`}
                        data-active={current ? "true" : undefined}
                        aria-current={current ? "page" : undefined}
                        aria-label={item.label}
                        onClick={close}
                      >
                        <span className="app-sheet-cell-icon" aria-hidden="true">
                          <item.Icon weight="regular" />
                        </span>
                        <span className="app-sheet-cell-label" aria-hidden="true">
                          {labelWords(item.short).map(({ word, offset }) => (
                            <Fragment key={offset}>
                              {offset > 0 ? " " : null}
                              <span className="app-sheet-cell-word">{word}</span>
                            </Fragment>
                          ))}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </nav>
        </DialogContent>
      </Dialog>
    </>
  );
}
// biome-ignore-end lint/correctness/useExhaustiveDependencies: the sheet closes whenever the route changes.
