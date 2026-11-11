import type { Icon } from "@phosphor-icons/react";
import { NavLink } from "react-router-dom";
import { ChevronDownIcon, ChevronRightIcon, DebugIcon, DocsIcon, SettingsIcon } from "../components/icons";
import { Button } from "../components/ui/button";
import type { TranslationKey } from "../i18n/en";
import { useI18n } from "../i18n/I18nProvider";
import { useWorkspacePrefsStore } from "../pages/workspace/workspacePrefs";
import { navigationSections } from "./navigation";
import { useApiRoot } from "./usePhoneLayout";
import { WorkspaceTree } from "./WorkspaceTree";

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

// @implements-requirement HALL-FR-LAY-110
/** Navigation panel of the tablet and the computer: the same destinations and active state as the phone bar. */
export function AppSidebar({ compact }: { compact: boolean }) {
  const { t } = useI18n();
  const { available } = useApiRoot();
  const { treeCollapsed, toggleTree } = useWorkspacePrefsStore();

  return (
    <aside
      aria-label={t("common.primaryNavigation")}
      className="app-sidebar"
      data-compact={compact ? "true" : undefined}
    >
      <a href="/app/" className="app-brand" aria-label={t("app.home")}>
        <span className="app-brand-mark">H</span>
        {!compact ? <span className="app-brand-name">{t("app.name")}</span> : null}
      </a>
      <nav className="app-sidebar-sections">
        {navigationSections.map((section) => (
          <div className="app-sidebar-section" key={section.labelKey ?? section.items[0].to}>
            {section.labelKey && !compact ? <span className="nav-section-label">{t(section.labelKey)}</span> : null}
            {section.items
              .filter((item) => available(item.requiredRelation))
              .map((item) => (
                <div className="app-sidebar-item" key={item.to}>
                  <div className="app-sidebar-item-line">
                    <NavigationRow
                      to={item.to}
                      labelKey={item.labelKey}
                      Icon={item.Icon}
                      compact={compact}
                      testId={`navigation-${item.to === "/" ? "overview" : item.to.slice(1)}`}
                    />
                    {!compact && item.workspaceTree ? (
                      <Button
                        variant="plain"
                        size="icon"
                        className="workspace-tree-fold"
                        aria-expanded={!treeCollapsed}
                        aria-label={t(treeCollapsed ? "workspace.expandTree" : "workspace.collapseTree")}
                        onClick={toggleTree}
                      >
                        {treeCollapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
                      </Button>
                    ) : null}
                  </div>
                  {item.workspaceTree && !compact && !treeCollapsed ? <WorkspaceTree /> : null}
                </div>
              ))}
          </div>
        ))}
      </nav>
      <div className="app-sidebar-footer">
        {import.meta.env.DEV ? (
          <NavigationRow
            to="/editor-lab"
            labelKey="navigation.lab"
            Icon={DebugIcon}
            compact={compact}
            testId="navigation-editor-lab"
          />
        ) : null}
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
