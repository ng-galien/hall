import type { Icon } from "@phosphor-icons/react";
import {
  AdministrationIcon,
  AgendaIcon,
  CommissionsIcon,
  CommitteeIcon,
  CommuneIcon,
  ContactIcon,
  CouncilIcon,
  DecisionsIcon,
  DelegationIcon,
  DraftIcon,
  FolderIcon,
  GavelIcon,
  HomeIcon,
  MailIcon,
  MapIcon,
  MeetingPlacesIcon,
  MemberIcon,
  MinutesIcon,
  ReferenceIcon,
  RightsIcon,
  SentIcon,
  TemplateIcon,
  TextDocumentIcon,
} from "../components/icons";
import type { TranslationKey } from "../i18n/en";

/** One place of the menu: a screen, or an entry whose sub-resources are screens. */
export interface NavigationItem {
  /** Test identifier suffix, `navigation-<id>`. */
  id: string;
  /** Test identifier of the row when it differs from `navigation-<id>`. */
  testId?: string;
  /** Address of the screen; an entry with sub-resources goes to its first permitted one. */
  to?: string;
  labelKey: TranslationKey;
  /** Outline icon; the current destination draws it with a thicker stroke. */
  Icon: Icon;
  requiredRelation?: string;
  /** The places under this entry, shown indented while one is current. */
  children?: NavigationItem[];
  /** The tree of the folders and affaires shows under this entry while its screen is open. */
  folderTree?: boolean;
  /** Brouillons and Envoyés show under this entry while its screen is open. */
  mailFolders?: boolean;
}

const leaf = (
  id: string,
  to: string,
  labelKey: TranslationKey,
  Icon: Icon,
  requiredRelation?: string,
): NavigationItem => ({ id, to, labelKey, Icon, requiredRelation });

/**
 * The menu of Hall, in three blocks separated by a rule. Under an entry the menu shows its sub-resources, the places
 * where one goes, never their content; every entry has its own icon.
 * @implements-requirement HALL-FR-LAY-110
 */
export const navigationBlocks: NavigationItem[][] = [
  [leaf("overview", "/", "navigation.home", HomeIcon)],
  [
    {
      id: "council",
      labelKey: "navigation.council",
      Icon: CouncilIcon,
      children: [
        leaf("meetings", "/meetings", "navigation.meetings", GavelIcon, "council-meetings"),
        leaf("minutes", "/minutes", "navigation.minutes", MinutesIcon, "minutes"),
        leaf("council-decisions", "/council-decisions", "navigation.decisions", DecisionsIcon, "council-decisions"),
        leaf("council-members", "/council-members", "navigation.members", CommitteeIcon, "council-members"),
        leaf(
          "council-committees",
          "/council-committees",
          "navigation.committees",
          CommissionsIcon,
          "council-committees",
        ),
        leaf(
          "council-delegations",
          "/council-delegations",
          "navigation.delegations",
          DelegationIcon,
          "council-delegations",
        ),
      ],
    },
    { ...leaf("workspace", "/workspace", "navigation.documents", FolderIcon, "resources"), folderTree: true },
    {
      ...leaf("mail", "/mail", "navigation.mail", MailIcon, "mail"),
      mailFolders: true,
      children: [
        { ...leaf("mail-drafts", "/mail/drafts", "mail.drafts", DraftIcon, "mail"), testId: "mail-folder-drafts" },
        { ...leaf("mail-sent", "/mail/sent", "mail.sent", SentIcon, "mail"), testId: "mail-folder-sent" },
      ],
    },
    leaf("calendar", "/calendar", "navigation.calendar", AgendaIcon, "resources"),
  ],
  [
    leaf("contacts", "/contacts", "navigation.contacts", ContactIcon, "contacts"),
    // @implements-requirement HALL-FR-WSP-310
    leaf("maps", "/maps", "navigation.maps", MapIcon, "resources"),
    {
      id: "administration",
      labelKey: "navigation.administration",
      Icon: AdministrationIcon,
      children: [
        leaf("administration-commune", "/administration/commune", "navigation.commune", CommuneIcon),
        leaf("administration-council", "/administration/council", "navigation.councilSettings", MeetingPlacesIcon),
        leaf("users", "/users", "users.title", MemberIcon, "users"),
        leaf("administration-rights", "/administration/rights", "navigation.rights", RightsIcon, "roles"),
        leaf("templates", "/templates", "navigation.templates", TemplateIcon, "templates"),
        leaf("administration-documents", "/administration/documents", "navigation.documentSettings", TextDocumentIcon),
        leaf("administration-mail", "/administration/mail", "navigation.mailSettings", ReferenceIcon),
      ],
    },
  ],
];

/** Every screen of the menu, sub-resources included. */
export function navigationLeaves(): NavigationItem[] {
  return navigationBlocks.flat().flatMap((item) => (item.children && !item.mailFolders ? item.children : [item]));
}

export function navigationItem(to: string): NavigationItem {
  const item = navigationBlocks
    .flat()
    .flatMap((entry) => [entry, ...(entry.children ?? [])])
    .find((candidate) => candidate.to === to);
  if (!item) throw new Error(`Unknown navigation destination: ${to}`);
  return item;
}

/** True when `pathname` is the screen `to` or one of its inner screens. */
export function isUnder(pathname: string, to: string) {
  return to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
}

/** True when the current screen belongs to this entry: itself or one of its sub-resources. */
export function isCurrentEntry(pathname: string, item: NavigationItem) {
  return (
    (item.to !== undefined && isUnder(pathname, item.to)) ||
    (item.children ?? []).some((child) => child.to !== undefined && isUnder(pathname, child.to))
  );
}

/** Destinations of the bottom bar of the phone; the « Plus » sheet lists the other ones. */
export const phoneBarDestinations = new Set(["/", "/workspace", "/calendar"]);
