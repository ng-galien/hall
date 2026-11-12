import type { Icon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { DocsIcon, SettingsIcon, SidebarCollapseIcon, SidebarExpandIcon } from "../components/icons";
import { Button } from "../components/ui/button";
import type { TranslationKey } from "../i18n/en";
import { useI18n } from "../i18n/I18nProvider";
import { type NavigationItem, type NavigationSection, navigationSections } from "./navigation";
import { useApiRoot } from "./usePhoneLayout";

/** One destination of the navigation panel: outline icon and label, the active one in blue with a thicker stroke. */
function NavigationRow({
  to,
  labelKey,
  Icon,
  compact,
  testId,
}: {
  to: string;
  labelKey: TranslationKey;
  Icon: Icon;
  compact: boolean;
  testId?: string;
}) {
  const { t } = useI18n();
  return (
    <NavLink
      to={to}
      end={to === "/"}
      data-testid={testId}
      title={compact ? t(labelKey) : undefined}
      aria-label={compact ? t(labelKey) : undefined}
      className="nav-row"
      data-compact={compact ? "true" : undefined}
    >
      {({ isActive }) => (
        <>
          <span className="nav-icon">
            <Icon weight={isActive ? "bold" : "regular"} />
          </span>
          {!compact ? <span className="nav-label">{t(labelKey)}</span> : null}
        </>
      )}
    </NavLink>
  );
}

/** True when the current screen is one of the destinations of a folded root. */
function inFoldedRoot(pathname: string, items: NavigationItem[]) {
  return items.some((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));
}

/** A root that folds its entries under one line: its icon and label, and its entries under it once unfolded. */
function FoldedRoot({ section, compact }: { section: NavigationSection; compact: boolean }) {
  const { t } = useI18n();
  const location = useLocation();
  const own = inFoldedRoot(location.pathname, section.items);
  const [open, setOpen] = useState(own);
  useEffect(() => {
    if (own) setOpen(true);
  }, [own]);
  if (!section.folded || !section.labelKey || section.items.length === 0) return null;
  const label = t(section.labelKey);
  const { Icon } = section.folded;
  return (
    <div className="app-sidebar-section" data-folded={open ? "false" : "true"}>
      <Button
        variant="plain"
        className="nav-row nav-root"
        data-compact={compact ? "true" : undefined}
        data-testid={`navigation-${section.folded.id}`}
        aria-expanded={open}
        title={compact ? label : undefined}
        aria-label={compact ? label : undefined}
        onClick={() => setOpen(!open)}
      >
        <span className="nav-icon">
          <Icon weight={open ? "bold" : "regular"} />
        </span>
        {!compact ? <span className="nav-label">{label}</span> : null}
      </Button>
      {open ? (
        <div className="nav-root-entries">
          {section.items.map((item) => (
            <NavigationRow
              key={item.to}
              to={item.to}
              labelKey={item.labelKey}
              Icon={item.Icon}
              compact={compact}
              testId={`navigation-${item.to.slice(1)}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

// @implements-requirement HALL-FR-LAY-110
/**
 * Navigation panel of the tablet and the computer: the roots grouped by subject, with labels when unfolded or as a
 * rail of icons when folded. Its own fold control is on the line of the brand, and under the « H » of the rail.
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
        {navigationSections.map((section) => {
          const items = section.items.filter((item) => available(item.requiredRelation));
          if (section.folded) {
            return <FoldedRoot key={section.folded.id} section={{ ...section, items }} compact={compact} />;
          }
          return (
            <div className="app-sidebar-section" key={section.labelKey ?? section.items[0].to}>
              {section.labelKey && !compact ? <span className="nav-section-label">{t(section.labelKey)}</span> : null}
              {items.map((item) => (
                <NavigationRow
                  key={item.to}
                  to={item.to}
                  labelKey={item.labelKey}
                  Icon={item.Icon}
                  compact={compact}
                  testId={`navigation-${item.to === "/" ? "overview" : item.to.slice(1)}`}
                />
              ))}
            </div>
          );
        })}
      </nav>
      <div className="app-sidebar-footer">
        <NavigationRow to="/docs" labelKey="navigation.documentation" Icon={DocsIcon} compact={compact} />
        <NavigationRow
          to="/settings"
          labelKey="common.settings"
          Icon={SettingsIcon}
          compact={compact}
          testId="navigation-settings"
        />
      </div>
    </aside>
  );
}
