import { Suspense, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { GlobalSearchPalette } from "../features/search/GlobalSearchPalette";
import { useI18n } from "../i18n/I18nProvider";
import { AppSidebar } from "../shell/AppSidebar";
import {
  HeaderTrailSlotContext,
  ScreenActionsSlotContext,
  ScreenLeadingSlotContext,
  ScreenScrolledContext,
  ScreenTitleContext,
  ScreenTitleSlotsContext,
} from "../shell/headerTrail";
import { PhoneNavigation } from "../shell/PhoneNavigation";
import { isPhoneReadingLocation, usePhoneScrollMemory } from "../shell/phoneHistory";
import { ScreenHeader, ScreenLargeTitle, useOpenedResourceKind, useScreenHeading } from "../shell/ScreenHeader";
import { usePhoneLayout } from "../shell/usePhoneLayout";
import { useWorkspaceResourcesStore } from "../stores/workspaceResourcesStore";
import { useRememberedFold } from "./ui/remembered-fold";

/** The large title counts as gone once less than this height of it remains on screen. */
const collapseDistance = 8;
/** Below this width the menu starts folded in its rail until the person chooses. */
const narrowQuery = "(max-width: 1000px)";
/** A text read on a phone has the large title of every screen; other opened documents name themselves in the header. */
// @implements-requirement HALL-FR-LAY-010
// @implements-requirement HALL-FR-LAY-100
export function Layout() {
  const [narrow, setNarrow] = useState(() => window.matchMedia(narrowQuery).matches);
  const [compact, setCompact] = useRememberedFold("navigation", narrow);
  const location = useLocation();
  useEffect(() => {
    const query = window.matchMedia(narrowQuery);
    const update = () => setNarrow(query.matches);
    query.addEventListener("change", update);
    update();
    return () => query.removeEventListener("change", update);
  }, []);
  const { t } = useI18n();
  const [trailSlot, setTrailSlot] = useState<HTMLDivElement | null>(null);
  const [actionsSlot, setActionsSlot] = useState<HTMLDivElement | null>(null);
  const [leadingSlot, setLeadingSlot] = useState<HTMLDivElement | null>(null);
  const [titleIconSlot, setTitleIconSlot] = useState<HTMLSpanElement | null>(null);
  const [titleCommandsSlot, setTitleCommandsSlot] = useState<HTMLDivElement | null>(null);
  const [titleFactsSlot, setTitleFactsSlot] = useState<HTMLDivElement | null>(null);
  const [titleHintSlot, setTitleHintSlot] = useState<HTMLSpanElement | null>(null);
  const titleSlots = useMemo(
    () => ({ icon: titleIconSlot, commands: titleCommandsSlot, facts: titleFactsSlot, hint: titleHintSlot }),
    [titleIconSlot, titleCommandsSlot, titleFactsSlot, titleHintSlot],
  );
  const [pageTitle, setPageTitle] = useState<string | null>(null);
  const [mainElement, setMainElement] = useState<HTMLElement | null>(null);
  const [titleElement, setTitleElement] = useState<HTMLHeadingElement | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const phone = usePhoneLayout();
  const heading = useScreenHeading();
  const title = pageTitle ?? heading.title;
  usePhoneScrollMemory(phone, mainElement);
  useEffect(() => {
    if (!mainElement) return;
    const update = () =>
      setScrolled(
        mainElement.scrollTop > Math.max(collapseDistance, (titleElement?.offsetHeight ?? 0) - collapseDistance),
      );
    update();
    mainElement.addEventListener("scroll", update, { passive: true });
    return () => mainElement.removeEventListener("scroll", update);
  }, [mainElement, titleElement]);
  const loadPersonalWorkspace = useWorkspaceResourcesStore((state) => state.loadPersonalWorkspace);
  useEffect(() => {
    void loadPersonalWorkspace();
  }, [loadPersonalWorkspace]);
  const openedKind = useOpenedResourceKind();
  const reading = phone && isPhoneReadingLocation(location) && openedKind !== "text";
  return (
    <HeaderTrailSlotContext.Provider value={trailSlot}>
      <ScreenLeadingSlotContext.Provider value={leadingSlot}>
        <ScreenTitleSlotsContext.Provider value={titleSlots}>
          <ScreenActionsSlotContext.Provider value={actionsSlot}>
            <ScreenTitleContext.Provider value={setPageTitle}>
              <ScreenScrolledContext.Provider value={scrolled}>
                <div className="app-shell">
                  {phone ? null : (
                    <AppSidebar
                      compact={compact}
                      navigation={{ expanded: !compact, toggle: () => setCompact(!compact) }}
                    />
                  )}
                  <div className="app-column">
                    <ScreenHeader
                      phone={phone}
                      title={title}
                      back={heading.back}
                      reading={reading}
                      collapsed={scrolled || reading}
                      leadingSlot={setLeadingSlot}
                      actionsSlot={setActionsSlot}
                      trailSlot={setTrailSlot}
                    />
                    <main
                      ref={setMainElement}
                      className="app-main"
                      data-testid="application-main"
                      data-route={location.pathname}
                    >
                      {reading ? null : (
                        <ScreenLargeTitle
                          phone={phone}
                          title={title}
                          titleRef={setTitleElement}
                          slots={{
                            icon: setTitleIconSlot,
                            commands: setTitleCommandsSlot,
                            facts: setTitleFactsSlot,
                            hint: setTitleHintSlot,
                          }}
                        />
                      )}
                      <div className="app-content">
                        <Suspense fallback={<div className="page-content">{t("common.loading")}</div>}>
                          <Outlet />
                        </Suspense>
                      </div>
                    </main>
                    {phone && !isPhoneReadingLocation(location) ? <PhoneNavigation /> : null}
                  </div>
                </div>
                <GlobalSearchPalette />
              </ScreenScrolledContext.Provider>
            </ScreenTitleContext.Provider>
          </ScreenActionsSlotContext.Provider>
        </ScreenTitleSlotsContext.Provider>
      </ScreenLeadingSlotContext.Provider>
    </HeaderTrailSlotContext.Provider>
  );
}
