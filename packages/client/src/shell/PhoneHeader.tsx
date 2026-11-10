import { Link, useLocation, useNavigate } from "react-router-dom";
import { BackIcon } from "../components/icons";
import { useI18n } from "../i18n/I18nProvider";
import { isUnderPath } from "../pages/workspace/paths";
import { useCouncilBusinessStore } from "../stores/councilBusinessStore";
import { useWorkspaceResourcesStore } from "../stores/workspaceResourcesStore";
import { ApplicationConnectionStatus } from "./AppHeader";
import { useRouteTrail } from "./HeaderBreadcrumb";
import { hasPreviousApplicationScreen } from "./phoneHistory";

function workspaceHref(path: string) {
  return path ? `/workspace?${new URLSearchParams({ path }).toString()}` : "/workspace";
}

function useWorkspaceHeader(): { title: string; back: string | null } {
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
  if (resourceId) {
    const summary = summaries[resourceId];
    const name =
      summary?.name ?? details[resourceId]?.name ?? catalog.find((entry) => entry.id === resourceId)?.name ?? "";
    return {
      title: name,
      back: originBusiness
        ? `/workspace?${new URLSearchParams({ path: originBusiness.folderPath, councilBusiness: originBusiness.id }).toString()}`
        : workspaceHref(path || details[resourceId]?.path || ""),
    };
  }
  if (businessId) {
    return {
      title: businesses.find((business) => business.id === businessId)?.title ?? "",
      back: workspaceHref(path),
    };
  }
  if (personalPath && path === personalPath) return { title: t("workspace.personalWorkspace"), back: null };
  if (!path) return { title: t("navigation.documents"), back: null };
  const segments = path.split("/");
  const parent = segments.slice(0, -1).join("/");
  const leavesPersonal = personalPath !== null && isUnderPath(path, personalPath) && !isUnderPath(parent, personalPath);
  return { title: segments.at(-1) ?? "", back: leavesPersonal ? workspaceHref(personalPath) : workspaceHref(parent) };
}

const barDestinations = new Set(["", "meetings", "calendar"]);

function parentOfRoute(segments: string[]): string | null {
  if (segments.length > 2) return `/${segments[0]}/${segments[1]}`;
  if (segments.length === 2) return `/${segments[0]}`;
  return barDestinations.has(segments[0] ?? "") ? null : "/";
}

// @implements-requirement HALL-FR-LAY-010
/** Top of every phone page: where to go back, and one short title. */
export function PhoneHeader({
  trailSlot,
  actionsSlot,
  titleSlot,
}: {
  trailSlot(element: HTMLDivElement | null): void;
  actionsSlot(element: HTMLDivElement | null): void;
  titleSlot(element: HTMLSpanElement | null): void;
}) {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const trail = useRouteTrail();
  const workspaceHeader = useWorkspaceHeader();
  const segments = location.pathname.split("/").filter(Boolean);
  const header =
    segments[0] === "workspace"
      ? workspaceHeader
      : {
          title: segments.length === 0 ? t("navigation.home") : (trail.at(-1)?.label ?? ""),
          back: parentOfRoute(segments),
        };
  return (
    <header className="app-header app-phone-header" data-testid="phone-header">
      {header.back ? (
        <Link
          className="app-phone-header-back"
          data-testid="phone-header-back"
          to={header.back}
          aria-label={t("common.back")}
          onClick={(event) => {
            if (!hasPreviousApplicationScreen()) return;
            event.preventDefault();
            navigate(-1);
          }}
        >
          <BackIcon aria-hidden="true" />
        </Link>
      ) : (
        <span
          className="mx-1.5 grid h-7 w-7 shrink-0 place-items-center rounded-(--radius-small) bg-brand text-xs font-bold text-on-brand"
          aria-hidden="true"
        >
          H
        </span>
      )}
      <h1 className="app-phone-header-title" data-testid="phone-header-title">
        <span className="app-phone-header-route-title">{header.title}</span>
        <span className="app-phone-header-page-title" ref={titleSlot} />
      </h1>
      <ApplicationConnectionStatus />
      <div ref={actionsSlot} className="app-phone-header-actions" />
      <div ref={trailSlot} hidden />
    </header>
  );
}
