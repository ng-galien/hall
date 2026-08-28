import {
  BoardRegular,
  GavelRegular,
  HomeRegular,
  PeopleRegular,
  TextBulletListSquareRegular,
} from "@fluentui/react-icons";
import type { ReactNode } from "react";
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
    items: [{ to: "/", labelKey: "navigation.overview", icon: <HomeRegular /> }],
  },
  {
    labelKey: "navigation.council",
    items: [
      { to: "/meetings", labelKey: "navigation.meetings", icon: <GavelRegular />, countKey: "meetings" },
      {
        to: "/council-decisions",
        labelKey: "navigation.decisions",
        icon: <TextBulletListSquareRegular />,
        countKey: "councilDecisions",
      },
    ],
  },
  {
    labelKey: "navigation.preparation",
    items: [{ to: "/workspace", labelKey: "navigation.workspace", icon: <BoardRegular />, workspaceTree: true }],
  },
  {
    labelKey: "navigation.administration",
    items: [{ to: "/council-members", labelKey: "navigation.members", icon: <PeopleRegular />, countKey: "members" }],
  },
];
