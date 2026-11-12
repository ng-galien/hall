import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { DocsIcon, FolderIcon, SettingsIcon, SidebarCollapseIcon, SidebarExpandIcon } from "../components/icons";
import { Button } from "../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";
import { useMailCountsStore } from "../features/mail/mailCounts";
import { useI18n } from "../i18n/I18nProvider";
import { isCurrentEntry, isUnder, type NavigationItem, navigationBlocks } from "./navigation";
import { useApiRoot } from "./usePhoneLayout";
import { useFolderTree, WorkspaceTree } from "./WorkspaceTree";

type Availability = (relation?: string) => boolean;

/** Time left to the pointer to go from a folded icon into its panel, or back. */
const railPanelLeaveDelay = 200;
/** Time the pointer rests on a folded icon before its panel opens. */
const railPanelHoverDelay = 120;

/** The entry as the person may see it: its permitted sub-resources, or nothing when none is permitted. */
export function permittedEntry(item: NavigationItem, available: Availability): NavigationItem | null {
  if (!available(item.requiredRelation)) return null;
  if (!item.children) return item;
  const children = item.children.filter((child) => available(child.requiredRelation));
  if (children.length === 0) return null;
  return { ...item, to: item.to ?? children[0].to, children };
}

/** The number written at the end of a sub-resource, such as the drafts of Courriels. */
function useEntryCount(item: NavigationItem): number | null {
  const counts = useMailCountsStore();
  if (item.id === "mail-drafts") return counts.drafts;
  if (item.id === "mail-sent") return counts.sent;
  return null;
}

/** One line of the menu: outline icon and label; the current one in blue and bold with a thicker stroke. */
export function EntryRow({
  item,
  current,
  open = false,
  sub = false,
  testId,
  onNavigate,
}: {
  item: NavigationItem;
  current: boolean;
  /** One of its sub-resources is the current screen. */
  open?: boolean;
  sub?: boolean;
  testId?: string;
  onNavigate?: () => void;
}) {
  const { t } = useI18n();
  const count = useEntryCount(item);
  return (
    <Link
      to={item.to ?? "/"}
      className={sub ? "nav-row nav-sub" : "nav-row"}
      data-testid={testId ?? item.testId ?? `navigation-${item.id}`}
      data-open={open ? "true" : undefined}
      aria-current={current ? "page" : undefined}
      onClick={onNavigate}
    >
      <span className="nav-icon">
        <item.Icon weight={current || open ? "bold" : "regular"} />
      </span>
      <span className="nav-label">{t(item.labelKey)}</span>
      {count !== null ? <span className="nav-count">{count}</span> : null}
    </Link>
  );
}

/** A place listed in the panel of a folded entry: icon, label and, for a folder of Courriels, its number. */
function RailPlace({ item, pathname }: { item: NavigationItem; pathname: string }) {
  const { t } = useI18n();
  const count = useEntryCount(item);
  const current = item.to !== undefined && isUnder(pathname, item.to);
  return (
    <DropdownMenuItem asChild>
      <Link
        to={item.to ?? "/"}
        className="nav-rail-place"
        data-testid={item.testId ?? `navigation-${item.id}`}
        aria-current={current ? "page" : undefined}
      >
        <item.Icon weight={current ? "bold" : "regular"} />
        <span className="nav-label">{t(item.labelKey)}</span>
        {count !== null ? <span className="nav-count">{count}</span> : null}
      </Link>
    </DropdownMenuItem>
  );
}

/** The folders at the top of Documents, in the panel of the folded menu. */
function RailFolders() {
  const folders = useFolderTree().filter((node) => !node.business);
  return (
    <>
      {folders.map((folder) => (
        <DropdownMenuItem key={folder.path} asChild>
          <Link
            className="nav-rail-place"
            data-testid="navigation-rail-folder"
            to={`/workspace?${new URLSearchParams({ path: folder.path })}`}
          >
            <FolderIcon />
            <span className="nav-label">{folder.name}</span>
          </Link>
        </DropdownMenuItem>
      ))}
    </>
  );
}

/**
 * One icon of the folded menu. An entry without sub-resource shows its label at once beside it and a click goes to its
 * screen. An entry with sub-resources shows the panel that lists them as soon as the pointer or the focus reaches it;
 * the pointer may go from the icon into the panel. A click keeps the panel open until a place is chosen, a click lands
 * elsewhere or Échap is pressed.
 */
function RailEntry({ item, pathname, label }: { item: NavigationItem; pathname: string; label: string }) {
  const current = isCurrentEntry(pathname, item);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const closing = useRef<number | null>(null);
  const opening = useRef<number | null>(null);
  const keep = () => {
    if (closing.current !== null) window.clearTimeout(closing.current);
    if (opening.current !== null) window.clearTimeout(opening.current);
    closing.current = null;
    opening.current = null;
  };
  const show = () => {
    keep();
    setOpen(true);
  };
  /** The pointer that only crosses an icon on its way to an open panel does not open its own. */
  const hover = () => {
    keep();
    opening.current = window.setTimeout(() => {
      opening.current = null;
      setOpen(true);
    }, railPanelHoverDelay);
  };
  const leave = () => {
    keep();
    if (pinned) return;
    closing.current = window.setTimeout(() => {
      closing.current = null;
      setOpen(false);
    }, railPanelLeaveDelay);
  };
  useEffect(() => keep, []);
  const icon = (
    <span className="nav-icon">
      <item.Icon weight={current ? "bold" : "regular"} />
    </span>
  );
  if (item.children || item.folderTree)
    return (
      <DropdownMenu
        modal={false}
        open={open}
        onOpenChange={(next) => {
          keep();
          setOpen(next);
          if (!next) setPinned(false);
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button
            variant="plain"
            className="nav-row nav-rail-entry"
            data-compact="true"
            data-current={current ? "true" : undefined}
            data-testid={item.testId ?? `navigation-${item.id}`}
            aria-label={label}
            onPointerEnter={hover}
            onPointerLeave={leave}
            onFocus={show}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              keep();
              setPinned(true);
              setOpen(true);
            }}
          >
            {icon}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="right"
          align="start"
          className="nav-rail-menu w-max min-w-(--hall-size-sidebar)"
          data-testid="navigation-rail-panel"
          data-pinned={pinned ? "true" : undefined}
          onPointerEnter={keep}
          onPointerLeave={leave}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          {item.folderTree ? (
            <RailFolders />
          ) : (
            item.children?.map((child) => <RailPlace key={child.id} item={child} pathname={pathname} />)
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <Link
          to={item.to ?? "/"}
          className="nav-row"
          data-compact="true"
          data-testid={item.testId ?? `navigation-${item.id}`}
          aria-current={current ? "page" : undefined}
          aria-label={label}
        >
          {icon}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" tone="light" className="nav-rail-label">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/** An entry of the unfolded menu, with its sub-resources indented under it while one of them is current. */
function MenuEntry({ item, pathname }: { item: NavigationItem; pathname: string }) {
  const entered = isCurrentEntry(pathname, item);
  let under: ReactNode = null;
  if (entered && item.folderTree) under = <WorkspaceTree />;
  else if (entered && item.children)
    under = (
      <div className="nav-sub-entries">
        {item.children.map((child) => (
          <EntryRow key={child.id} item={child} current={child.to !== undefined && isUnder(pathname, child.to)} sub />
        ))}
      </div>
    );
  return (
    <div className="app-sidebar-item">
      <EntryRow item={item} current={entered && !item.children} open={entered && Boolean(item.children)} />
      {under}
    </div>
  );
}

// @implements-requirement HALL-FR-LAY-110
/**
 * Navigation panel of the tablet and the computer: one form of entry, icon and label, in three blocks separated by a
 * rule. The entry where one is shows its sub-resources indented under it, the other ones stay on their line. Folded,
 * the menu is a rail of icons whose label, or panel of sub-resources, shows at once beside it. Its own fold control is
 * on the line of the brand, and under the « H » of the rail.
 */
export function AppSidebar({
  compact,
  navigation,
}: {
  compact: boolean;
  /** The control that unfolds or folds this panel. */
  navigation: { expanded: boolean; toggle(): void };
}) {
  const { t } = useI18n();
  const { available } = useApiRoot();
  const { pathname } = useLocation();
  const blocks = navigationBlocks
    .map((block) => block.flatMap((item) => permittedEntry(item, available) ?? []))
    .filter((block) => block.length > 0);
  const footer: NavigationItem[] = [
    { id: "documentation", to: "/docs", labelKey: "navigation.documentation", Icon: DocsIcon },
    { id: "settings", to: "/settings", labelKey: "navigation.settings", Icon: SettingsIcon },
  ];

  return (
    <aside
      aria-label={t("common.primaryNavigation")}
      className="app-sidebar"
      data-compact={compact ? "true" : undefined}
    >
      <div className="app-sidebar-head">
        <a href="/app/" className="app-brand" aria-label={t("app.home")}>
          <span className="app-brand-mark">H</span>
          {!compact ? <span className="app-brand-name">{t("app.name")}</span> : null}
        </a>
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
      </div>
      <nav className="app-sidebar-sections">
        {blocks.map((block) => (
          <div className="app-sidebar-block" key={block[0].id}>
            {block.map((item) =>
              compact ? (
                <RailEntry key={item.id} item={item} pathname={pathname} label={t(item.labelKey)} />
              ) : (
                <MenuEntry key={item.id} item={item} pathname={pathname} />
              ),
            )}
          </div>
        ))}
      </nav>
      <div className="app-sidebar-footer">
        {footer.map((item) =>
          compact ? (
            <RailEntry key={item.id} item={item} pathname={pathname} label={t(item.labelKey)} />
          ) : (
            <EntryRow key={item.id} item={item} current={item.to !== undefined && isUnder(pathname, item.to)} />
          ),
        )}
      </div>
    </aside>
  );
}
