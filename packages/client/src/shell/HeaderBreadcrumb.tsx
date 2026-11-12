import { useLocation } from "react-router-dom";
import { Breadcrumb, type BreadcrumbItem } from "../components/Breadcrumb";
import { formatMeetingLabel } from "../features/council-meetings/meetingPresentation";
import { useI18n } from "../i18n/I18nProvider";
import { useContactsStore } from "../stores/contactsStore";
import { useCouncilCommitteesStore } from "../stores/councilCommitteesStore";
import { useCouncilDelegationsStore } from "../stores/councilDelegationsStore";
import { useCouncilMeetingsStore } from "../stores/councilMeetingsStore";
import { useCouncilMembersStore } from "../stores/councilMembersStore";
import { useUsersStore } from "../stores/usersStore";
import { useWorkspaceResourcesStore } from "../stores/workspaceResourcesStore";

/** Trail of the current route; the workspace builds its own from the opened folder. A record whose page names itself in the screen title ends the trail with an unnamed item, so that its list is the screen above it. */
export function useRouteTrail(): BreadcrumbItem[] {
  const { t, formatDate } = useI18n();
  const location = useLocation();
  const { meetings } = useCouncilMeetingsStore();
  const members = useCouncilMembersStore((state) => state.members);
  const contacts = useContactsStore((state) => state.contacts);
  const users = useUsersStore((state) => state.users);
  const committees = useCouncilCommitteesStore((state) => state.bodies);
  const delegations = useCouncilDelegationsStore((state) => state.bodies);
  const resourceSummaries = useWorkspaceResourcesStore((state) => state.summaries);

  const items: BreadcrumbItem[] = [];
  const segments = location.pathname.split("/").filter(Boolean);
  if (segments[0] === "workspace") return items;

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
    items.push({ label: t("navigation.decisions"), to: "/council-decisions" });
    if (segments[1]) items.push({ label: "" });
  } else if (segments[0] === "maps") {
    items.push({ label: t("navigation.maps"), to: "/maps" });
    const map = segments[1] ? resourceSummaries[segments[1]] : undefined;
    if (map) items.push({ label: map.name });
  } else if (segments[0] === "minutes") {
    items.push({ label: t("navigation.minutes"), to: "/minutes" });
    if (segments[1]) items.push({ label: "" });
  } else if (segments[0] === "council-members") {
    items.push({ label: t("navigation.members"), to: "/council-members" });
    if (segments[1]) {
      const member = members.find((candidate) => candidate.id === segments[1]);
      if (member) items.push({ label: `${member.contact.firstName} ${member.contact.lastName}` });
    }
  } else if (segments[0] === "users") {
    items.push({ label: t("users.title"), to: "/users" });
    const user = users.find((candidate) => candidate.id === segments[1]);
    if (user) items.push({ label: user.displayName });
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
  } else if (segments[0] === "council-delegations") {
    items.push({ label: t("navigation.delegations"), to: "/council-delegations" });
    if (segments[1]) {
      const delegation = delegations.find((candidate) => candidate.id === segments[1]);
      if (delegation) items.push({ label: delegation.name });
    }
  } else if (segments[0] === "mail") {
    items.push({ label: t("mail.title"), to: "/mail" });
    if (segments[1] === "drafts" || segments[1] === "sent")
      items.push({ label: t(`mail.${segments[1]}`), to: `/mail/${segments[1]}` });
  } else if (segments[0] === "templates") {
    items.push({ label: t("navigation.templates"), to: "/templates" });
  } else if (segments[0] === "settings") {
    items.push({ label: t("common.settings") });
  } else if (segments[0] === "docs") {
    items.push({ label: t("navigation.documentation") });
  } else if (segments[0] === "calendar") {
    items.push({ label: t("navigation.calendar") });
  }

  return items;
}

/** Screens above the current route; the current screen is the large title of the header. */
export function HeaderBreadcrumb({ fallback }: { fallback: string }) {
  const parents = useRouteTrail().slice(0, -1);
  return parents.length > 0 ? (
    <Breadcrumb items={parents} />
  ) : (
    <span className="screen-header-commune">{fallback}</span>
  );
}
