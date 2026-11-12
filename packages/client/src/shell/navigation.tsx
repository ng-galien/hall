import type { Icon } from "@phosphor-icons/react";
import {
  AdministrationIcon,
  CalendarIcon,
  CommitteeIcon,
  ContactIcon,
  DebugIcon,
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
  requiredRelation?: string;
}

export interface NavigationSection {
  labelKey?: TranslationKey;
  /** A root that folds its entries under one line, folded by default and unfolded on one of its own screens. */
  folded?: { id: string; Icon: Icon };
  items: NavigationItem[];
}

export function navigationItem(to: string): NavigationItem {
  const item = navigationSections.flatMap((section) => section.items).find((candidate) => candidate.to === to);
  if (!item) throw new Error(`Unknown navigation destination: ${to}`);
  return item;
}

/**
 * Roots of the navigation, in the order of the menu: home, the council, the working tools, then the administration
 * folded under one root. The phone « Plus » sheet lists the same groups, without the destinations of the bottom bar.
 * @implements-requirement HALL-FR-LAY-110
 */
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
    labelKey: "navigation.tools",
    items: [
      {
        to: "/workspace",
        requiredRelation: "resources",
        labelKey: "navigation.documents",
        Icon: FolderIcon,
      },
      { to: "/mail", requiredRelation: "mail", labelKey: "navigation.mail", Icon: MailIcon },
      { to: "/calendar", requiredRelation: "resources", labelKey: "navigation.calendar", Icon: CalendarIcon },
      { to: "/contacts", requiredRelation: "contacts", labelKey: "navigation.contacts", Icon: ContactIcon },
      // @implements-requirement HALL-FR-WSP-310
      { to: "/maps", requiredRelation: "resources", labelKey: "navigation.maps", Icon: MapIcon },
    ],
  },
  {
    labelKey: "navigation.administration",
    folded: { id: "administration", Icon: AdministrationIcon },
    items: [
      { to: "/users", labelKey: "users.title", Icon: MembersIcon, requiredRelation: "users" },
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
      ...(import.meta.env.DEV ? [{ to: "/editor-lab", labelKey: "navigation.lab" as const, Icon: DebugIcon }] : []),
    ],
  },
];

/** Destinations of the bottom bar of the phone; the « Plus » sheet lists the other ones. */
export const phoneBarDestinations = new Set(["/", "/workspace", "/calendar", "/meetings"]);
