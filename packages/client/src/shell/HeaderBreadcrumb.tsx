import { useLocation } from "react-router-dom";
import { Breadcrumb, type BreadcrumbItem } from "../components/Breadcrumb";
import { useI18n } from "../i18n/I18nProvider";
import { useCouncilMeetingsStore } from "../stores/councilMeetingsStore";
import { useResourcesStore } from "../stores/resourcesStore";
import { useTopicsStore } from "../stores/topicsStore";

/** Fil d'Ariane global de la barre d'en-tête, dérivé de la route courante. */
export function HeaderBreadcrumb() {
  const { t } = useI18n();
  const location = useLocation();
  const { meetings } = useCouncilMeetingsStore();
  const { topics } = useTopicsStore();
  const { resources } = useResourcesStore();

  const items: BreadcrumbItem[] = [{ label: t("app.name"), to: "/" }];
  const segments = location.pathname.split("/").filter(Boolean);
  const search = new URLSearchParams(location.search);

  if (segments.length === 0) {
    items.push({ label: t("navigation.overview") });
  } else if (segments[0] === "meetings") {
    items.push({ label: t("navigation.meetings"), to: "/meetings" });
    if (segments[1]) {
      const meeting = meetings.find((candidate) => candidate.id === segments[1]);
      if (meeting) items.push({ label: meeting.title, to: `/meetings/${meeting.id}` });
    }
  } else if (segments[0] === "council-decisions") {
    items.push({ label: t("navigation.decisions") });
  } else if (segments[0] === "council-members") {
    items.push({ label: t("navigation.members") });
  } else if (segments[0] === "settings") {
    items.push({ label: t("common.settings") });
  } else if (segments[0] === "workspace") {
    items.push({ label: t("navigation.workspace"), to: "/workspace" });
    const path = search.get("path") ?? "";
    const pathSegments = path.split("/").filter(Boolean);
    pathSegments.forEach((segment, index) => {
      const target = pathSegments.slice(0, index + 1).join("/");
      items.push({ label: segment, to: `/workspace?path=${encodeURIComponent(target)}` });
    });
    const topicId = search.get("topic");
    const resourceId = search.get("resource");
    if (topicId) {
      const topic = topics.find((candidate) => candidate.id === topicId);
      if (topic) items.push({ label: topic.title });
    } else if (resourceId) {
      const resource = resources.find((candidate) => candidate.id === resourceId);
      if (resource) items.push({ label: resource.title });
    }
  }

  return <Breadcrumb items={items} />;
}
