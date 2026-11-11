import type { Icon } from "@phosphor-icons/react";
import {
  CalendarIcon,
  CommitteeIcon,
  ContactIcon,
  DecisionsIcon,
  DelegationIcon,
  FolderIcon,
  GavelIcon,
  HomeIcon,
  MailIcon,
  MapIcon,
  MembersIcon,
  MinutesIcon,
  TemplateIcon,
} from "../components/icons";
import type { TranslationKey } from "../i18n/en";

export interface NavigationItem {
  to: string;
  labelKey: TranslationKey;
  /** Outline icon; the active destination draws it with a thicker stroke. */
  Icon: Icon;
  /** Renders the filing path tree under this entry. */
  workspaceTree?: boolean;
  requiredRelation?: string;
}

export interface NavigationSection {
  labelKey?: TranslationKey;
  items: NavigationItem[];
}

/** Destinations of the phone « Plus » panel: every menu entry outside the bottom bar, under the same rights. */
export const phoneMoreDestinations = [
  "/mail",
  "/council-decisions",
  "/minutes",
  "/maps",
  "/users",
  "/contacts",
  "/council-members",
  "/council-committees",
  "/council-delegations",
  "/templates",
];

export function navigationItem(to: string): NavigationItem {
  const item = navigationSections.flatMap((section) => section.items).find((candidate) => candidate.to === to);
  if (!item) throw new Error(`Unknown navigation destination: ${to}`);
  return item;
}

export const navigationSections: NavigationSection[] = [
  {
    items: [{ to: "/", labelKey: "navigation.home", Icon: HomeIcon }],
  },
  {
    labelKey: "navigation.council",
    items: [
      { to: "/meetings", requiredRelation: "council-meetings", labelKey: "navigation.meetings", Icon: GavelIcon },
      { to: "/minutes", requiredRelation: "minutes", labelKey: "navigation.minutes", Icon: MinutesIcon },
      {
        to: "/council-decisions",
        requiredRelation: "council-decisions",
        labelKey: "navigation.decisions",
        Icon: DecisionsIcon,
      },
    ],
  },
  {
    items: [
      {
        to: "/workspace",
        requiredRelation: "resources",
        labelKey: "navigation.documents",
        Icon: FolderIcon,
        workspaceTree: true,
      },
      // @implements-requirement HALL-FR-WSP-310
      { to: "/maps", requiredRelation: "resources", labelKey: "navigation.maps", Icon: MapIcon },
      { to: "/mail", requiredRelation: "mail", labelKey: "navigation.mail", Icon: MailIcon },
      { to: "/calendar", requiredRelation: "resources", labelKey: "navigation.calendar", Icon: CalendarIcon },
    ],
  },
  {
    labelKey: "navigation.administration",
    items: [
      { to: "/users", labelKey: "users.title", Icon: MembersIcon, requiredRelation: "users" },
      { to: "/contacts", requiredRelation: "contacts", labelKey: "navigation.contacts", Icon: ContactIcon },
      {
        to: "/council-members",
        requiredRelation: "council-members",
        labelKey: "navigation.members",
        Icon: MembersIcon,
      },
      {
        to: "/council-committees",
        requiredRelation: "council-committees",
        labelKey: "navigation.committees",
        Icon: CommitteeIcon,
      },
      {
        to: "/council-delegations",
        requiredRelation: "council-delegations",
        labelKey: "navigation.delegations",
        Icon: DelegationIcon,
      },
      { to: "/templates", requiredRelation: "templates", labelKey: "navigation.templates", Icon: TemplateIcon },
    ],
  },
];
