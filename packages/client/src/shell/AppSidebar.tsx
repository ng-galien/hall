import { SettingsRegular } from "@fluentui/react-icons";
import { NavLink } from "react-router-dom";
import { useI18n } from "../i18n/I18nProvider";
import { useCaseFilesStore } from "../stores/caseFilesStore";
import { useCouncilDecisionsStore } from "../stores/councilDecisionsStore";
import { useCouncilMeetingsStore } from "../stores/councilMeetingsStore";
import { useCouncilMembersStore } from "../stores/councilMembersStore";
import { useDocumentsStore } from "../stores/documentsStore";
import { navigationSections } from "./navigation";

export function AppSidebar({ compact }: { compact: boolean }) {
  const { t, formatNumber } = useI18n();
  const counts = {
    meetings: useCouncilMeetingsStore((state) => state.meetings.length),
    caseFiles: useCaseFilesStore((state) => state.caseFiles.length),
    councilDecisions: useCouncilDecisionsStore((state) => state.councilDecisions.length),
    documents: useDocumentsStore((state) => state.documents.length),
    members: useCouncilMembersStore((state) => state.members.length),
  };

  return (
    <aside
      aria-label={t("common.primaryNavigation")}
      className={`flex h-full shrink-0 flex-col overflow-hidden border-r border-border bg-surface transition-[width] duration-(--mairie-motion-fast) ease-(--mairie-motion-curve-standard) ${compact ? "w-(--mairie-size-sidebar-compact)" : "w-(--mairie-size-sidebar)"}`}
    >
      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3">
        {navigationSections.map((section, sectionIndex) => (
          <div className="flex flex-col gap-0.5" key={section.labelKey ?? "overview"}>
            {section.labelKey && !compact ? <span className="nav-section-label">{t(section.labelKey)}</span> : null}
            {section.labelKey && compact && sectionIndex > 0 ? (
              <span className="mx-auto my-2 h-px w-5 bg-border" />
            ) : null}
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                title={compact ? t(item.labelKey) : undefined}
                aria-label={compact ? t(item.labelKey) : undefined}
                className={({ isActive }) =>
                  `nav-row ${isActive ? "nav-row-active" : ""} ${compact ? "justify-center px-0" : ""}`
                }
              >
                <span className="nav-icon">{item.icon}</span>
                {!compact ? <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span> : null}
                {!compact && item.countKey ? (
                  <span className="nav-count">{formatNumber(counts[item.countKey])}</span>
                ) : null}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-2">
        <NavLink
          to="/settings"
          className={`nav-row w-full ${compact ? "justify-center px-0" : ""}`}
          title={compact ? t("common.settings") : undefined}
          aria-label={compact ? t("common.settings") : undefined}
        >
          <span className="nav-icon">
            <SettingsRegular />
          </span>
          {!compact ? <span>{t("common.settings")}</span> : null}
        </NavLink>
      </div>
    </aside>
  );
}
