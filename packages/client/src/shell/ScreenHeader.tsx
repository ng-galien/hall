import type { ApiPrincipal } from "@hall/api-contract";
import type { HallSettings } from "@hall/domain";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronLeftIcon } from "../components/icons";
import { useApplicationStatus } from "../hooks/useApplicationData";
import { useI18n } from "../i18n/I18nProvider";
import { isUnderPath } from "../pages/workspace/paths";
import { apiSirenRequest } from "../services/apiClient";
import { useCouncilBusinessStore } from "../stores/councilBusinessStore";
import { useWorkspaceResourcesStore } from "../stores/workspaceResourcesStore";
import { HeaderBreadcrumb, useRouteTrail } from "./HeaderBreadcrumb";
import { navigationLeaves } from "./navigation";
import { hasPreviousApplicationScreen } from "./phoneHistory";

export type Back = { to: string; label: string };

function workspaceHref(path: string) {
  return path ? `/workspace?${new URLSearchParams({ path }).toString()}` : "/workspace";
}

/** Title of the workspace screen and the screen it comes from. */
function useWorkspaceHeading(): { title: string; back: Back | null } {
  const { t } = useI18n();
  const location = useLocation();
  const personalPath = useWorkspaceResourcesStore((state) => state.personalWorkspacePath);
  const summaries = useWorkspaceResourcesStore((state) => state.summaries);
  const details = useWorkspaceResourcesStore((state) => state.details);
  const catalog = useWorkspaceResourcesStore((state) => state.catalog);
  const businesses = useCouncilBusinessStore((state) => state.businesses);
  const params = new URLSearchParams(location.search);
  const path = params.get("path") ?? "";
  const resourceId = params.get("resource");
  const businessId = params.get("councilBusiness");
  const originBusiness = businesses.find((business) => business.id === params.get("fromBusiness"));
  const folder = (folderPath: string): Back => {
    if (!folderPath) return { to: "/workspace", label: t("navigation.documents") };
    if (personalPath && folderPath === personalPath) {
      return { to: workspaceHref(folderPath), label: t("workspace.personalWorkspace") };
    }
    return { to: workspaceHref(folderPath), label: folderPath.split("/").at(-1) ?? "" };
  };
  if (resourceId) {
    const summary = summaries[resourceId];
    const name =
      summary?.name ?? details[resourceId]?.name ?? catalog.find((entry) => entry.id === resourceId)?.name ?? "";
    return {
      title: name,
      back: originBusiness
        ? {
            to: `/workspace?${new URLSearchParams({ path: originBusiness.folderPath, councilBusiness: originBusiness.id }).toString()}`,
            label: originBusiness.title,
          }
        : folder(path || details[resourceId]?.path || ""),
    };
  }
  if (businessId) {
    return { title: businesses.find((business) => business.id === businessId)?.title ?? "", back: folder(path) };
  }
  if (personalPath && path === personalPath) return { title: t("workspace.personalWorkspace"), back: null };
  if (!path) return { title: t("navigation.documents"), back: null };
  const parent = path.split("/").slice(0, -1).join("/");
  const leavesPersonal = personalPath !== null && isUnderPath(path, personalPath) && !isUnderPath(parent, personalPath);
  return { title: path.split("/").at(-1) ?? "", back: folder(leavesPersonal ? personalPath : parent) };
}

/** The kind of the resource opened on the workspace screen, when one is open and known. */
export function useOpenedResourceKind(): string | null {
  const location = useLocation();
  const summaries = useWorkspaceResourcesStore((state) => state.summaries);
  const details = useWorkspaceResourcesStore((state) => state.details);
  const catalog = useWorkspaceResourcesStore((state) => state.catalog);
  const id = location.pathname === "/workspace" ? new URLSearchParams(location.search).get("resource") : null;
  if (!id) return null;
  return details[id]?.kind ?? summaries[id]?.kind ?? catalog.find((entry) => entry.id === id)?.kind ?? null;
}

const topLevelRoutes = new Set(["", "meetings", "calendar"]);

/** Title of the current screen and, inside an area, the screen above it. */
export function useScreenHeading(): { title: string; back: Back | null } {
  const { t } = useI18n();
  const location = useLocation();
  const trail = useRouteTrail();
  const workspace = useWorkspaceHeading();
  const segments = location.pathname.split("/").filter(Boolean);
  if (segments[0] === "workspace") return workspace;
  const title = segments.length === 0 ? t("navigation.home") : (trail.at(-1)?.label ?? "");
  if (segments.length <= 1 || ((segments[0] === "mail" || segments[0] === "administration") && segments.length === 2)) {
    return { title, back: topLevelRoutes.has(segments[0] ?? "") ? null : { to: "/", label: t("navigation.home") } };
  }
  const to = segments.length > 2 ? `/${segments[0]}/${segments[1]}` : `/${segments[0]}`;
  const item = navigationLeaves().find((candidate) => candidate.to === to);
  const label = trail.find((entry) => entry.to === to)?.label ?? (item ? t(item.labelKey) : "");
  return { title, back: { to, label } };
}

/** Name of the commune and initials of the signed-in user, shown in every screen header. */
function useScreenIdentity() {
  const [identity, setIdentity] = useState<{ commune: string; initials: string }>({ commune: "", initials: "" });
  useEffect(() => {
    let active = true;
    void Promise.all([
      apiSirenRequest<HallSettings>("/settings").then(
        (result) => result.data.name,
        () => "",
      ),
      apiSirenRequest<ApiPrincipal>("/auth/session").then(
        (result) => result.data.displayName,
        () => "",
      ),
    ]).then(([commune, displayName]) => {
      const initials = displayName
        .split(/[\s-]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word[0]?.toLocaleUpperCase("fr"))
        .join("");
      if (active) setIdentity({ commune, initials });
    });
    return () => {
      active = false;
    };
  }, []);
  return identity;
}

// @implements-requirement HALL-FR-LAY-100
/**
 * A lost connection, written after a red dot beside the initials. While the server answers, the live region stays
 * empty and takes no room; its synchronisation phase remains readable in `data-sync-state`.
 */
export function ApplicationConnectionStatus() {
  const { phase, error } = useApplicationStatus();
  const { t } = useI18n();
  return (
    <span
      className="screen-header-connection"
      role="status"
      aria-live="polite"
      data-sync-state={phase}
      data-testid="application-sync-status"
    >
      {error ? (
        <span className="record-state" data-tone="danger">
          {error === "authentication_required" ? t("common.authenticationRequired") : t("common.serverUnavailable")}
        </span>
      ) : null}
    </span>
  );
}

// @implements-requirement HALL-FR-LAY-100
/**
 * The first line of every screen of Hall (choice 2B), on phone, tablet and computer: where one is, with the action of
 * the screen and the user's initials at its right. The large title is the first line of the content, so it scrolls
 * away without moving the content; once it is gone, the title is written in this line.
 */
export function ScreenHeader({
  phone,
  title,
  back,
  collapsed,
  reading,
  leadingSlot,
  actionsSlot,
  trailSlot,
}: {
  phone: boolean;
  title: string;
  back: Back | null;
  collapsed: boolean;
  /** A document read on a phone has no large title: its name is the heading of this line. */
  reading: boolean;
  /** On tablet and computer: the place of the control that reopens a folded panel of the screen. */
  leadingSlot(element: HTMLDivElement | null): void;
  actionsSlot(element: HTMLDivElement | null): void;
  trailSlot(element: HTMLDivElement | null): void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { commune, initials } = useScreenIdentity();
  return (
    <header
      className="screen-header"
      data-collapsed={collapsed ? "true" : undefined}
      data-format={phone ? "phone" : "wide"}
      data-testid={phone ? "phone-header" : "screen-header"}
    >
      <div className="screen-header-line">
        {phone ? null : <div ref={leadingSlot} className="screen-header-leading" />}
        <div className="screen-header-place">
          {phone && back ? (
            <Link
              className="screen-header-back"
              data-testid="phone-header-back"
              to={back.to}
              aria-label={t("common.back")}
              onClick={(event) => {
                if (!hasPreviousApplicationScreen()) return;
                event.preventDefault();
                navigate(-1);
              }}
            >
              <ChevronLeftIcon aria-hidden="true" />
              <span className="screen-header-parent">{back.label}</span>
            </Link>
          ) : null}
          {!phone ? (
            <div className="screen-header-trail">
              <HeaderBreadcrumb fallback={commune} />
              <div ref={trailSlot} className="screen-header-trail-slot" />
            </div>
          ) : null}
          {phone && !back ? <span className="screen-header-commune">{commune}</span> : null}
          {reading ? (
            <h1
              className="screen-header-inline-title"
              data-testid={phone ? "phone-header-title" : "screen-header-title"}
            >
              {title}
            </h1>
          ) : (
            <span className="screen-header-inline-title" aria-hidden="true">
              {title}
            </span>
          )}
        </div>
        <div className="screen-header-tools">
          <div ref={actionsSlot} className="screen-header-actions" />
          <ApplicationConnectionStatus />
          <Link
            className="screen-header-initials"
            to="/settings"
            data-testid="screen-header-account"
            aria-label={t("navigation.account")}
          >
            {initials}
          </Link>
        </div>
      </div>
      {phone ? <div ref={trailSlot} hidden /> : null}
    </header>
  );
}

/**
 * True when the title, written on one line, needs more than the room its icon and commands leave it: it then takes
 * the whole line and the commands pass under it.
 */
function useTitleTooLong(row: HTMLDivElement | null, title: string): boolean {
  const [long, setLong] = useState(false);
  useEffect(() => {
    if (!row) return;
    const measure = () => {
      const text = row.querySelector<HTMLElement>(".screen-title-measure");
      const icon = row.querySelector<HTMLElement>(".screen-title-icon");
      const commands = row.querySelector<HTMLElement>(".screen-title-commands");
      if (!text || !commands || commands.childElementCount === 0) return setLong(false);
      const block = row.parentElement;
      if (!block) return setLong(false);
      const style = getComputedStyle(block);
      const width = block.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
      const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
      const room = width - (icon?.offsetWidth ? icon.offsetWidth + gap : 0) - commands.offsetWidth - gap;
      setLong(text.offsetWidth > room);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    const commands = row.querySelector(".screen-title-commands");
    if (commands) observer.observe(commands);
    const mutations = new MutationObserver(measure);
    if (commands) mutations.observe(commands, { childList: true, subtree: true });
    measure();
    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, [row, title]);
  return long;
}

/** The large title of the screen, first line of its content. */
export function ScreenLargeTitle({
  phone,
  title,
  titleRef,
  slots,
}: {
  phone: boolean;
  title: string;
  titleRef(element: HTMLHeadingElement | null): void;
  /** Places of the type icon, the commands and the facts of an opened item around the title. */
  slots: {
    icon(element: HTMLSpanElement | null): void;
    commands(element: HTMLDivElement | null): void;
    facts(element: HTMLDivElement | null): void;
  };
}) {
  const [row, setRow] = useState<HTMLDivElement | null>(null);
  const long = useTitleTooLong(row, title);
  return (
    <div className="screen-title-block">
      <div ref={setRow} className="screen-title-row" data-long={long ? "true" : undefined}>
        <span ref={slots.icon} className="screen-title-icon" />
        <h1
          ref={titleRef}
          className="screen-header-title"
          data-testid={phone ? "phone-header-title" : "screen-header-title"}
        >
          {title}
        </h1>
        <span className="screen-header-title screen-title-measure" aria-hidden="true">
          {title}
        </span>
        <div ref={slots.commands} className="screen-title-commands" data-testid="screen-title-commands" />
      </div>
      <div ref={slots.facts} className="screen-title-facts" />
    </div>
  );
}
