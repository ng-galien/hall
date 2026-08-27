import { Suspense, useState } from "react";
import { Outlet } from "react-router-dom";
import { useI18n } from "../i18n/I18nProvider";
import { AppHeader } from "../shell/AppHeader";
import { AppSidebar } from "../shell/AppSidebar";

export function Layout() {
  const [compact, setCompact] = useState(false);
  const { t } = useI18n();
  return (
    <div className="flex h-svh flex-col overflow-hidden bg-bg text-text">
      <AppHeader compact={compact} onToggleSidebar={() => setCompact((value) => !value)} />
      <div className="flex min-h-0 flex-1">
        <AppSidebar compact={compact} />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <Suspense fallback={<div className="page-content">{t("common.loading")}</div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
