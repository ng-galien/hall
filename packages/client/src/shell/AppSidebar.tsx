import { NavLink } from "react-router-dom";
import { ChevronDownIcon, ChevronRightIcon, DebugIcon, DocsIcon, SettingsIcon } from "../components/icons";
import { useI18n } from "../i18n/I18nProvider";
import { useWorkspacePrefsStore } from "../pages/workspace/workspacePrefs";
import { navigationSections } from "./navigation";
import { useApiRoot } from "./usePhoneLayout";
import { WorkspaceTree } from "./WorkspaceTree";

export function AppSidebar({ compact }: { compact: boolean }) {
  const { t } = useI18n();
  const { available } = useApiRoot();
  const { treeCollapsed, toggleTree } = useWorkspacePrefsStore();

  return (
    <aside
      aria-label={t("common.primaryNavigation")}
      className={`flex h-full shrink-0 flex-col overflow-hidden border-r border-border bg-surface transition-[width] duration-(--hall-motion-fast) ease-(--hall-motion-curve-standard) ${compact ? "w-(--hall-size-sidebar-compact)" : "w-(--hall-size-sidebar)"}`}
    >
      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3">
        {navigationSections.map((section, sectionIndex) => (
          <div className="flex flex-col gap-0.5" key={section.labelKey ?? section.items[0].to}>
            {section.labelKey && !compact ? <span className="nav-section-label">{t(section.labelKey)}</span> : null}
            {section.labelKey && compact && sectionIndex > 0 ? (
              <span className="mx-auto my-2 h-px w-5 bg-border" />
            ) : null}
            {section.items
              .filter((item) => available(item.requiredRelation))
              .map((item) => (
                <div className="flex flex-col" key={item.to}>
                  <div className="flex items-center gap-0.5">
                    <NavLink
                      to={item.to}
                      data-testid={`navigation-${item.to === "/" ? "overview" : item.to.slice(1)}`}
                      end={item.to === "/"}
                      title={compact ? t(item.labelKey) : undefined}
                      aria-label={compact ? t(item.labelKey) : undefined}
                      className={({ isActive }) =>
                        `nav-row min-w-0 flex-1 ${isActive ? "nav-row-active" : ""} ${compact ? "justify-center px-0" : ""}`
                      }
                    >
                      <span className="nav-icon">{item.icon}</span>
                      {!compact ? <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span> : null}
                    </NavLink>
                    {!compact && item.workspaceTree ? (
                      <button
                        className="workspace-tree-fold"
                        type="button"
                        aria-expanded={!treeCollapsed}
                        aria-label={t(treeCollapsed ? "workspace.expandTree" : "workspace.collapseTree")}
                        onClick={toggleTree}
                      >
                        {treeCollapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
                      </button>
                    ) : null}
                  </div>
                  {item.workspaceTree && !compact && !treeCollapsed ? <WorkspaceTree /> : null}
                </div>
              ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-2">
        {import.meta.env.DEV ? (
          <NavLink
            to="/editor-lab"
            data-testid="navigation-editor-lab"
            className={({ isActive }) =>
              `nav-row w-full ${isActive ? "nav-row-active" : ""} ${compact ? "justify-center px-0" : ""}`
            }
            title={compact ? t("navigation.lab") : undefined}
            aria-label={compact ? t("navigation.lab") : undefined}
          >
            <span className="nav-icon">
              <DebugIcon />
            </span>
            {!compact ? <span>{t("navigation.lab")}</span> : null}
          </NavLink>
        ) : null}
        <NavLink
          to="/docs"
          className={`nav-row w-full ${compact ? "justify-center px-0" : ""}`}
          title={compact ? t("navigation.documentation") : undefined}
          aria-label={compact ? t("navigation.documentation") : undefined}
        >
          <span className="nav-icon">
            <DocsIcon />
          </span>
          {!compact ? <span>{t("navigation.documentation")}</span> : null}
        </NavLink>
        <NavLink
          to="/settings"
          data-testid="navigation-settings"
          className={`nav-row w-full ${compact ? "justify-center px-0" : ""}`}
          title={compact ? t("common.settings") : undefined}
          aria-label={compact ? t("common.settings") : undefined}
        >
          <span className="nav-icon">
            <SettingsIcon />
          </span>
          {!compact ? <span>{t("common.settings")}</span> : null}
        </NavLink>
      </div>
    </aside>
  );
}
