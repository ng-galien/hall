import { Suspense, useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { GlobalSearchPalette } from "../features/search/GlobalSearchPalette";
import { useI18n } from "../i18n/I18nProvider";
import { AppHeader } from "../shell/AppHeader";
import { AppSidebar } from "../shell/AppSidebar";
import {
  HeaderTrailSlotContext,
  PhoneHeaderActionsSlotContext,
  PhoneHeaderTitleSlotContext,
} from "../shell/headerTrail";
import { PhoneHeader } from "../shell/PhoneHeader";
import { PhoneNavigation } from "../shell/PhoneNavigation";
import { isPhoneReadingLocation, usePhoneScrollMemory } from "../shell/phoneHistory";
import { usePhoneLayout } from "../shell/usePhoneLayout";
import { useWorkspaceResourcesStore } from "../stores/workspaceResourcesStore";
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
  const [phoneActionsSlot, setPhoneActionsSlot] = useState<HTMLDivElement | null>(null);
  const [phoneTitleSlot, setPhoneTitleSlot] = useState<HTMLSpanElement | null>(null);
  const [mainElement, setMainElement] = useState<HTMLElement | null>(null);
  const phone = usePhoneLayout();
  usePhoneScrollMemory(phone, mainElement);
  const loadPersonalWorkspace = useWorkspaceResourcesStore((state) => state.loadPersonalWorkspace);
  useEffect(() => {
    void loadPersonalWorkspace();
  }, [loadPersonalWorkspace]);
  return (
    <HeaderTrailSlotContext.Provider value={trailSlot}>
      <PhoneHeaderActionsSlotContext.Provider value={phoneActionsSlot}>
        <PhoneHeaderTitleSlotContext.Provider value={phoneTitleSlot}>
          <div className="flex h-svh flex-col overflow-hidden bg-bg text-text">
            {phone ? (
              <PhoneHeader trailSlot={setTrailSlot} actionsSlot={setPhoneActionsSlot} titleSlot={setPhoneTitleSlot} />
            ) : (
              <AppHeader
                compact={mobile ? !navigationOpen : compact}
                onToggleSidebar={() => (mobile ? setNavigationOpen((value) => !value) : setCompact((value) => !value))}
                trailSlot={setTrailSlot}
              />
            )}
            <div className="flex min-h-0 flex-1">
              {phone ? null : mobile ? (
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
                ref={setMainElement}
                className="app-main min-w-0 flex-1 overflow-y-auto"
                data-testid="application-main"
                data-route={location.pathname}
              >
                <Suspense fallback={<div className="page-content">{t("common.loading")}</div>}>
                  <Outlet />
                </Suspense>
              </main>
            </div>
            {phone && !isPhoneReadingLocation(location) ? <PhoneNavigation /> : null}
            <GlobalSearchPalette />
          </div>
        </PhoneHeaderTitleSlotContext.Provider>
      </PhoneHeaderActionsSlotContext.Provider>
    </HeaderTrailSlotContext.Provider>
  );
}
