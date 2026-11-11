import { Suspense, useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { GlobalSearchPalette } from "../features/search/GlobalSearchPalette";
import { useI18n } from "../i18n/I18nProvider";
import { AppSidebar } from "../shell/AppSidebar";
import {
  HeaderTrailSlotContext,
  ScreenActionsSlotContext,
  ScreenScrolledContext,
  ScreenTitleContext,
} from "../shell/headerTrail";
import { PhoneNavigation } from "../shell/PhoneNavigation";
import { isPhoneReadingLocation, usePhoneScrollMemory } from "../shell/phoneHistory";
import { ScreenHeader } from "../shell/ScreenHeader";
import { usePhoneLayout } from "../shell/usePhoneLayout";
import { useWorkspaceResourcesStore } from "../stores/workspaceResourcesStore";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";

/** The content has scrolled past this distance: the large title rises into the first line of the header. */
const collapseDistance = 8;

// @implements-requirement HALL-FR-LAY-010
// @implements-requirement HALL-FR-LAY-100
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
  const [actionsSlot, setActionsSlot] = useState<HTMLDivElement | null>(null);
  const [pageTitle, setPageTitle] = useState<string | null>(null);
  const [mainElement, setMainElement] = useState<HTMLElement | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const phone = usePhoneLayout();
  usePhoneScrollMemory(phone, mainElement);
  useEffect(() => {
    if (!mainElement) return;
    const update = () => setScrolled(mainElement.scrollTop > collapseDistance);
    update();
    mainElement.addEventListener("scroll", update, { passive: true });
    return () => mainElement.removeEventListener("scroll", update);
  }, [mainElement]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new screen starts with its large title.
  useEffect(() => setScrolled((mainElement?.scrollTop ?? 0) > collapseDistance), [location.pathname, location.search]);
  const loadPersonalWorkspace = useWorkspaceResourcesStore((state) => state.loadPersonalWorkspace);
  useEffect(() => {
    void loadPersonalWorkspace();
  }, [loadPersonalWorkspace]);
  const reading = phone && isPhoneReadingLocation(location);
  return (
    <HeaderTrailSlotContext.Provider value={trailSlot}>
      <ScreenActionsSlotContext.Provider value={actionsSlot}>
        <ScreenTitleContext.Provider value={setPageTitle}>
          <ScreenScrolledContext.Provider value={scrolled}>
            <div className="app-shell">
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
                    <DialogTitle className="sr-only">{t("common.primaryNavigation")}</DialogTitle>
                    <AppSidebar compact={false} />
                  </DialogContent>
                </Dialog>
              ) : (
                <AppSidebar compact={compact} />
              )}
              <div className="app-column">
                <ScreenHeader
                  phone={phone}
                  pageTitle={pageTitle}
                  collapsed={scrolled || reading}
                  navigation={
                    phone
                      ? undefined
                      : mobile
                        ? { expanded: navigationOpen, toggle: () => setNavigationOpen((value) => !value) }
                        : { expanded: !compact, toggle: () => setCompact((value) => !value) }
                  }
                  actionsSlot={setActionsSlot}
                  trailSlot={setTrailSlot}
                />
                <main
                  ref={setMainElement}
                  className="app-main"
                  data-testid="application-main"
                  data-route={location.pathname}
                >
                  <Suspense fallback={<div className="page-content">{t("common.loading")}</div>}>
                    <Outlet />
                  </Suspense>
                </main>
                {phone && !isPhoneReadingLocation(location) ? <PhoneNavigation /> : null}
              </div>
            </div>
            <GlobalSearchPalette />
          </ScreenScrolledContext.Provider>
        </ScreenTitleContext.Provider>
      </ScreenActionsSlotContext.Provider>
    </HeaderTrailSlotContext.Provider>
  );
}
