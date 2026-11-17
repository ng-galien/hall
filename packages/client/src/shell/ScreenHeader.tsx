import type { ResourceKind } from "@hall/api-contract";
import type { HallSettings } from "@hall/domain";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronLeftIcon } from "../components/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";
import { useSignedInAccount } from "../features/users/useSignedInAccount";
import { useApplicationStatus } from "../hooks/useApplicationData";
import { useI18n } from "../i18n/I18nProvider";
import { folderTrail } from "../pages/workspace/paths";
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

/**
 * Title of the workspace screen and the screen it comes from: the folder above in the trail, up to « Mon espace » in
 * the personal folder of the person, then Documents.
 * @implements-requirement HALL-FR-WSP-380
 */
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
  const steps = folderTrail(path, personalPath);
  const current = steps.at(-1);
  if (!current) return { title: t("navigation.documents"), back: null };
  return {
    title: current.personal ? t("workspace.personalWorkspace") : current.name,
    back: folder(steps.at(-2)?.path ?? ""),
  };
}

/** The kind of the resource opened on the workspace screen, when one is open and known. */
export function useOpenedResourceKind(): ResourceKind | null {
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
  if (
    segments.length <= 1 ||
    segments[0] === "maps" ||
    ((segments[0] === "mail" || segments[0] === "administration") && segments.length === 2)
  ) {
    return { title, back: topLevelRoutes.has(segments[0] ?? "") ? null : { to: "/", label: t("navigation.home") } };
  }
  const to = segments.length > 2 ? `/${segments[0]}/${segments[1]}` : `/${segments[0]}`;
  const item = navigationLeaves().find((candidate) => candidate.to === to);
  const label = trail.find((entry) => entry.to === to)?.label ?? (item ? t(item.labelKey) : "");
  return { title, back: { to, label } };
}

/** Name of the commune, shown in every screen header. */
function useCommuneName() {
  const [commune, setCommune] = useState("");
  useEffect(() => {
    let active = true;
    void apiSirenRequest<HallSettings>("/settings").then(
      (result) => {
        if (active) setCommune(result.data.name);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, []);
  return commune;
}

/** The first letters of the first two words of a name. */
function initialsOf(displayName: string): string {
  return displayName
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toLocaleUpperCase("fr"))
    .join("");
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
 * away without moving the content; once it is gone, the title is written in this line. An opened item whose content
 * fills the screen has no large title: on tablet and computer this line, already reduced, also holds its type icon,
 * its title, its facts and its commands, after the place.
 */
export function ScreenHeader({
  phone,
  title,
  back,
  onBack,
  collapsed,
  reading,
  leadingSlot,
  actionsSlot,
  trailSlot,
  itemSlots,
}: {
  phone: boolean;
  title: string;
  back: Back | null;
  /** Set by the page while one of its states takes the back arrow: the arrow runs it and stays on the screen. */
  onBack?: (() => void) | null;
  collapsed: boolean;
  /** A document read on a phone has no large title: its name is the heading of this line. */
  reading: boolean;
  /** On tablet and computer: the place of the control that reopens a folded panel of the screen. */
  leadingSlot(element: HTMLDivElement | null): void;
  actionsSlot(element: HTMLDivElement | null): void;
  trailSlot(element: HTMLDivElement | null): void;
  /** Places of the type icon, the commands, the facts and the information icon of an opened item in this line. */
  itemSlots?: {
    icon(element: HTMLSpanElement | null): void;
    commands(element: HTMLDivElement | null): void;
    facts(element: HTMLDivElement | null): void;
    hint(element: HTMLSpanElement | null): void;
  };
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const commune = useCommuneName();
  const account = useSignedInAccount();
  return (
    <header
      className="screen-header"
      data-collapsed={collapsed ? "true" : undefined}
      data-item-line={itemSlots ? "true" : undefined}
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
                if (onBack) {
                  event.preventDefault();
                  onBack();
                  return;
                }
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
          {itemSlots ? (
            <span className="screen-header-item-title">
              <span ref={itemSlots.icon} className="screen-title-icon" />
              <h1 className="screen-header-inline-title" data-testid="screen-header-title">
                {title}
                <span ref={itemSlots.hint} className="screen-title-hint" />
              </h1>
            </span>
          ) : reading ? (
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
          {itemSlots ? <div ref={itemSlots.facts} className="screen-title-facts" /> : null}
        </div>
        <div className="screen-header-tools">
          {itemSlots ? (
            <div ref={itemSlots.commands} className="screen-title-commands" data-testid="screen-title-commands" />
          ) : null}
          <div ref={actionsSlot} className="screen-header-actions" />
          <ApplicationConnectionStatus />
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                className="screen-header-initials"
                to="/settings"
                data-testid="screen-header-account"
                aria-label={
                  account ? t("navigation.accountOf", { name: account.displayName }) : t("navigation.account")
                }
              >
                {account ? initialsOf(account.displayName) : null}
              </Link>
            </TooltipTrigger>
            {account ? (
              <TooltipContent side="bottom" align="end" tone="light" className="flex-col items-start gap-0.5">
                <span data-testid="screen-header-account-name">{account.displayName}</span>
                {account.email ? <span data-testid="screen-header-account-email">{account.email}</span> : null}
              </TooltipContent>
            ) : null}
          </Tooltip>
        </div>
      </div>
      {phone ? <div ref={trailSlot} hidden /> : null}
    </header>
  );
}

/** Width of the title written on one line in the font of its heading, measured without any element on the page. */
function titleWidth(heading: HTMLElement, title: string): number {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return 0;
  const style = getComputedStyle(heading);
  context.font = style.font;
  const spacing = Number.parseFloat(style.letterSpacing) || 0;
  return context.measureText(title).width + spacing * title.length;
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
      const heading = row.querySelector<HTMLElement>(".screen-header-title");
      const icon = row.querySelector<HTMLElement>(".screen-title-icon");
      const commands = row.querySelector<HTMLElement>(".screen-title-commands");
      if (!heading || !commands || commands.childElementCount === 0) return setLong(false);
      const block = row.parentElement;
      if (!block) return setLong(false);
      const style = getComputedStyle(block);
      const width = block.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
      const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
      const hint = row.querySelector<HTMLElement>(".screen-title-hint");
      const room =
        width -
        (icon?.offsetWidth ? icon.offsetWidth + gap : 0) -
        commands.offsetWidth -
        gap -
        (hint?.offsetWidth ?? 0);
      setLong(titleWidth(heading, title) > room);
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

/**
 * The large title of the screen, first line of its content. The information icon is written with the last letter of
 * the title, so that it never stands alone on a line while the title still wraps between its words.
 */
export function ScreenLargeTitle({
  phone,
  title,
  titleRef,
  slots,
}: {
  phone: boolean;
  title: string;
  titleRef(element: HTMLHeadingElement | null): void;
  /** Places of the type icon, the commands, the facts and the information icon around the title. */
  slots: {
    icon(element: HTMLSpanElement | null): void;
    commands(element: HTMLDivElement | null): void;
    facts(element: HTMLDivElement | null): void;
    hint(element: HTMLSpanElement | null): void;
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
          aria-label={title || undefined}
          data-testid={phone ? "phone-header-title" : "screen-header-title"}
        >
          {title.slice(0, -1)}
          {title ? (
            <span className="title-tail">
              {title.slice(-1)}
              <span ref={slots.hint} className="screen-title-hint" />
            </span>
          ) : null}
        </h1>
        <div ref={slots.commands} className="screen-title-commands" data-testid="screen-title-commands" />
      </div>
      <div ref={slots.facts} className="screen-title-facts" />
    </div>
  );
}
