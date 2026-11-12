import type { ApiPrincipal } from "@hall/api-contract";
import type { HallSettings } from "@hall/domain";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronLeftIcon, SidebarCollapseIcon, SidebarExpandIcon } from "../components/icons";
import { Button } from "../components/ui/button";
import { useApplicationStatus } from "../hooks/useApplicationData";
import { useI18n } from "../i18n/I18nProvider";
import { isUnderPath } from "../pages/workspace/paths";
import { apiSirenRequest } from "../services/apiClient";
import { useCouncilBusinessStore } from "../stores/councilBusinessStore";
import { useWorkspaceResourcesStore } from "../stores/workspaceResourcesStore";
import { HeaderBreadcrumb, useRouteTrail } from "./HeaderBreadcrumb";
import { navigationSections } from "./navigation";
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
  if (segments.length <= 1) {
    return { title, back: topLevelRoutes.has(segments[0] ?? "") ? null : { to: "/", label: t("navigation.home") } };
  }
  const to = segments.length > 2 ? `/${segments[0]}/${segments[1]}` : `/${segments[0]}`;
  const item = navigationSections.flatMap((section) => section.items).find((candidate) => candidate.to === to);
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

/** Connection state of the application with the server, as a coloured dot. */
export function ApplicationConnectionStatus() {
  const { phase, error } = useApplicationStatus();
  const { t } = useI18n();
  const connectionLabel = error
    ? error === "authentication_required"
      ? t("common.authenticationRequired")
      : t("common.serverUnavailable")
    : phase === "initializing"
      ? t("common.initializing")
      : phase === "synchronizing"
        ? t("common.syncing")
        : t("common.serverConnected");
  const tone = error ? "danger" : phase === "initializing" || phase === "synchronizing" ? "pending" : "success";
  return (
    <span
      className="screen-header-status"
      role="status"
      aria-live="polite"
      title={connectionLabel}
      data-tone={tone}
      data-sync-state={phase}
      data-testid="application-sync-status"
    >
      <span className="sr-only">{connectionLabel}</span>
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
  navigation,
  actionsSlot,
  trailSlot,
}: {
  phone: boolean;
  title: string;
  back: Back | null;
  collapsed: boolean;
  /** A document read on a phone has no large title: its name is the heading of this line. */
  reading: boolean;
  /** On tablet and computer: the control that opens or folds the navigation panel. */
  navigation?: { expanded: boolean; toggle(): void };
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
        {navigation ? (
          <Button
            variant="plain"
            size="icon"
            data-testid="navigation-toggle"
            aria-label={navigation.expanded ? t("common.collapseNavigation") : t("common.expandNavigation")}
            aria-expanded={navigation.expanded}
            onClick={navigation.toggle}
          >
            {navigation.expanded ? <SidebarCollapseIcon /> : <SidebarExpandIcon />}
          </Button>
        ) : null}
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
            to="/settings?category=preferences"
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

/** The large title of the screen, first line of its content. */
export function ScreenLargeTitle({
  phone,
  title,
  titleRef,
}: {
  phone: boolean;
  title: string;
  titleRef(element: HTMLHeadingElement | null): void;
}) {
  return (
    <h1
      ref={titleRef}
      className="screen-header-title"
      data-testid={phone ? "phone-header-title" : "screen-header-title"}
    >
      {title}
    </h1>
  );
}
