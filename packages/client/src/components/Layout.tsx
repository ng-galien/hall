import { Suspense, useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { GlobalSearchPalette } from "../features/search/GlobalSearchPalette";
import { useI18n } from "../i18n/I18nProvider";
import { AppHeader } from "../shell/AppHeader";
import { AppSidebar } from "../shell/AppSidebar";
import { HeaderTrailSlotContext } from "../shell/headerTrail";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";

// @implements-requirement HALL-FR-LAY-010
export function Layout() {
  const [compact, setCompact] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 1000px)").matches);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const location = useLocation();
  const previousLocation = useRef(location.pathname);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1000px)");
    const update = () => {
      setMobile(query.matches);
      setNavigationOpen(false);
    };
    query.addEventListener("change", update);
    update();
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (previousLocation.current !== location.pathname) {
      setNavigationOpen(false);
      previousLocation.current = location.pathname;
    }
  }, [location.pathname]);
  const { t } = useI18n();
  const [trailSlot, setTrailSlot] = useState<HTMLDivElement | null>(null);
  return (
    <HeaderTrailSlotContext.Provider value={trailSlot}>
      <div className="flex h-svh flex-col overflow-hidden bg-bg text-text">
        <AppHeader
          compact={mobile ? !navigationOpen : compact}
          onToggleSidebar={() => (mobile ? setNavigationOpen((value) => !value) : setCompact((value) => !value))}
          trailSlot={setTrailSlot}
        />
        <div className="flex min-h-0 flex-1">
          {mobile ? (
            <Dialog open={navigationOpen} onOpenChange={setNavigationOpen}>
              <DialogContent
                className="app-mobile-navigation"
                placement="left"
                closeLabel={t("common.close")}
                aria-describedby={undefined}
                data-testid="mobile-navigation"
                onClick={(event) => {
                  if (event.target instanceof Element && event.target.closest("a[href]")) setNavigationOpen(false);
                }}
              >
                <DialogTitle>{t("common.primaryNavigation")}</DialogTitle>
                <AppSidebar compact={false} />
              </DialogContent>
            </Dialog>
          ) : (
            <AppSidebar compact={compact} />
          )}
          <main
            className="app-main min-w-0 flex-1 overflow-y-auto"
            data-testid="application-main"
            data-route={location.pathname}
          >
            <Suspense fallback={<div className="page-content">{t("common.loading")}</div>}>
              <Outlet />
            </Suspense>
          </main>
        </div>
        <GlobalSearchPalette />
      </div>
    </HeaderTrailSlotContext.Provider>
  );
}
