import { useLocation } from "react-router-dom";
import { Breadcrumb, type BreadcrumbItem } from "../components/Breadcrumb";
import { formatMeetingLabel } from "../features/council-meetings/meetingPresentation";
import { useI18n } from "../i18n/I18nProvider";
import { useContactsStore } from "../stores/contactsStore";
import { useCouncilCommitteesStore } from "../stores/councilCommitteesStore";
import { useCouncilMeetingsStore } from "../stores/councilMeetingsStore";
import { useCouncilMembersStore } from "../stores/councilMembersStore";

/** Global header breadcrumb derived from the current route. */
export function HeaderBreadcrumb() {
  const { t, formatDate } = useI18n();
  const location = useLocation();
  const { meetings } = useCouncilMeetingsStore();
  const members = useCouncilMembersStore((state) => state.members);
  const contacts = useContactsStore((state) => state.contacts);
  const committees = useCouncilCommitteesStore((state) => state.committees);

  const items: BreadcrumbItem[] = [{ label: t("app.name"), to: "/" }];
  const segments = location.pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    items.push({ label: t("navigation.overview") });
  } else if (segments[0] === "meetings") {
    items.push({ label: t("navigation.meetings"), to: "/meetings" });
    if (segments[1]) {
      const meeting = meetings.find((candidate) => candidate.id === segments[1] || candidate.reference === segments[1]);
      if (meeting) {
        items.push({
          label: formatMeetingLabel(meeting, t("meetings.occurrenceLabel"), formatDate),
          to: `/meetings/${meeting.reference}`,
        });
      }
    }
  } else if (segments[0] === "council-decisions") {
    items.push({ label: t("navigation.decisions") });
  } else if (segments[0] === "minutes") {
    items.push({ label: t("navigation.minutes"), to: "/minutes" });
  } else if (segments[0] === "council-members") {
    items.push({ label: t("navigation.members"), to: "/council-members" });
    if (segments[1]) {
      const member = members.find((candidate) => candidate.id === segments[1]);
      if (member) items.push({ label: `${member.contact.firstName} ${member.contact.lastName}` });
    }
  } else if (segments[0] === "contacts") {
    items.push({ label: t("navigation.contacts"), to: "/contacts" });
    if (segments[1]) {
      const contact = contacts.find((candidate) => candidate.id === segments[1]);
      if (contact) items.push({ label: `${contact.firstName} ${contact.lastName}` });
    }
  } else if (segments[0] === "council-committees") {
    items.push({ label: t("navigation.committees"), to: "/council-committees" });
    if (segments[1]) {
      const committee = committees.find((candidate) => candidate.id === segments[1]);
      if (committee) items.push({ label: committee.name });
    }
  } else if (segments[0] === "settings") {
    items.push({ label: t("common.settings") });
  } else if (segments[0] === "docs") {
    items.push({ label: t("navigation.documentation") });
  } else if (segments[0] === "workspace") {
    items.push({ label: t("navigation.workspace") });
  }

  return <Breadcrumb items={items} />;
}
