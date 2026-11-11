import type { ReactNode } from "react";
import {
  CalendarIcon,
  CommitteeIcon,
  ContactIcon,
  CouncilBusinessIcon,
  DecisionsIcon,
  DelegationIcon,
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
  icon: ReactNode;
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
    items: [{ to: "/", labelKey: "navigation.overview", icon: <HomeIcon /> }],
  },
  {
    labelKey: "navigation.council",
    items: [
      { to: "/meetings", requiredRelation: "council-meetings", labelKey: "navigation.meetings", icon: <GavelIcon /> },
      { to: "/minutes", requiredRelation: "minutes", labelKey: "navigation.minutes", icon: <MinutesIcon /> },
      {
        to: "/council-decisions",
        requiredRelation: "council-decisions",
        labelKey: "navigation.decisions",
        icon: <DecisionsIcon />,
      },
    ],
  },
  {
    items: [
      {
        to: "/workspace",
        requiredRelation: "resources",
        labelKey: "navigation.workspace",
        icon: <CouncilBusinessIcon data-testid="workspace-navigation-business-icon" />,
        workspaceTree: true,
      },
      // @implements-requirement HALL-FR-WSP-310
      { to: "/maps", requiredRelation: "resources", labelKey: "navigation.maps", icon: <MapIcon /> },
      { to: "/mail", requiredRelation: "mail", labelKey: "navigation.mail", icon: <MailIcon /> },
      { to: "/calendar", requiredRelation: "resources", labelKey: "navigation.calendar", icon: <CalendarIcon /> },
    ],
  },
  {
    labelKey: "navigation.administration",
    items: [
      { to: "/users", labelKey: "users.title", icon: <MembersIcon />, requiredRelation: "users" },
      { to: "/contacts", requiredRelation: "contacts", labelKey: "navigation.contacts", icon: <ContactIcon /> },
      {
        to: "/council-members",
        requiredRelation: "council-members",
        labelKey: "navigation.members",
        icon: <MembersIcon />,
      },
      {
        to: "/council-committees",
        requiredRelation: "council-committees",
        labelKey: "navigation.committees",
        icon: <CommitteeIcon />,
      },
      {
        to: "/council-delegations",
        requiredRelation: "council-delegations",
        labelKey: "navigation.delegations",
        icon: <DelegationIcon />,
      },
      { to: "/templates", requiredRelation: "templates", labelKey: "navigation.templates", icon: <TemplateIcon /> },
    ],
  },
];
