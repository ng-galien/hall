import { useLocation } from "react-router-dom";
import { Breadcrumb, type BreadcrumbItem } from "../components/Breadcrumb";
import { useI18n } from "../i18n/I18nProvider";
import { useCouncilMeetingsStore } from "../stores/councilMeetingsStore";

/** Fil d'Ariane global de la barre d'en-tête, dérivé de la route courante. */
export function HeaderBreadcrumb() {
  const { t } = useI18n();
  const location = useLocation();
  const { meetings } = useCouncilMeetingsStore();

  const items: BreadcrumbItem[] = [{ label: t("app.name"), to: "/" }];
  const segments = location.pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    items.push({ label: t("navigation.overview") });
  } else if (segments[0] === "meetings") {
    items.push({ label: t("navigation.meetings"), to: "/meetings" });
    if (segments[1]) {
      const meeting = meetings.find((candidate) => candidate.id === segments[1] || candidate.slug === segments[1]);
      if (meeting) items.push({ label: meeting.title, to: `/meetings/${meeting.slug}` });
    }
  } else if (segments[0] === "council-decisions") {
    items.push({ label: t("navigation.decisions") });
  } else if (segments[0] === "council-members") {
    items.push({ label: t("navigation.members") });
  } else if (segments[0] === "settings") {
    items.push({ label: t("common.settings") });
  } else if (segments[0] === "workspace") {
    /* La barre d'en-tête s'arrête à l'espace de travail : la navigation fine — chemins de
       dossiers, document ouvert — appartient à l'écran lui-même et à son propre fil d'Ariane.
       Deux systèmes qui racontent le même chemin, c'est un de trop. */
    items.push({ label: t("navigation.workspace") });
  }

  return <Breadcrumb items={items} />;
}
