import type { ReactNode } from "react";
import {
  CalendarIcon,
  CommitteeIcon,
  ContactIcon,
  CouncilBusinessIcon,
  DecisionsIcon,
  GavelIcon,
  HomeIcon,
  MembersIcon,
  MinutesIcon,
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

export const navigationSections: NavigationSection[] = [
  {
    items: [{ to: "/", labelKey: "navigation.overview", icon: <HomeIcon /> }],
  },
  {
    labelKey: "navigation.council",
    items: [
      { to: "/meetings", labelKey: "navigation.meetings", icon: <GavelIcon /> },
      { to: "/minutes", labelKey: "navigation.minutes", icon: <MinutesIcon /> },
      {
        to: "/council-decisions",
        labelKey: "navigation.decisions",
        icon: <DecisionsIcon />,
      },
    ],
  },
  {
    items: [
      {
        to: "/workspace",
        labelKey: "navigation.workspace",
        icon: <CouncilBusinessIcon data-testid="workspace-navigation-business-icon" />,
        workspaceTree: true,
      },
      { to: "/calendar", labelKey: "navigation.calendar", icon: <CalendarIcon /> },
    ],
  },
  {
    labelKey: "navigation.administration",
    items: [
      { to: "/users", labelKey: "users.title", icon: <MembersIcon />, requiredRelation: "users" },
      { to: "/contacts", labelKey: "navigation.contacts", icon: <ContactIcon /> },
      { to: "/council-members", labelKey: "navigation.members", icon: <MembersIcon /> },
      {
        to: "/council-committees",
        labelKey: "navigation.committees",
        icon: <CommitteeIcon />,
      },
    ],
  },
];
