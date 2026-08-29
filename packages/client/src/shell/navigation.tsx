import type { ReactNode } from "react";
import { DecisionsIcon, GavelIcon, HomeIcon, MembersIcon, WorkspaceIcon } from "../components/icons";
import type { TranslationKey } from "../i18n/en";

export interface NavigationItem {
  to: string;
  labelKey: TranslationKey;
  icon: ReactNode;
  countKey?: "meetings" | "topics" | "councilDecisions" | "resources" | "members";
  /** Affiche l'arborescence des chemins de classement sous l'entrée. */
  workspaceTree?: boolean;
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
      { to: "/meetings", labelKey: "navigation.meetings", icon: <GavelIcon />, countKey: "meetings" },
      {
        to: "/council-decisions",
        labelKey: "navigation.decisions",
        icon: <DecisionsIcon />,
        countKey: "councilDecisions",
      },
    ],
  },
  {
    // L'espace de travail se suffit : pas d'intitulé de section pour une entrée seule.
    items: [{ to: "/workspace", labelKey: "navigation.workspace", icon: <WorkspaceIcon />, workspaceTree: true }],
  },
  {
    labelKey: "navigation.administration",
    items: [{ to: "/council-members", labelKey: "navigation.members", icon: <MembersIcon />, countKey: "members" }],
  },
];
