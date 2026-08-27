import {
  BoardRegular,
  DocumentRegular,
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
  countKey?: "meetings" | "caseFiles" | "councilDecisions" | "documents" | "members";
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
    items: [
      { to: "/case-files", labelKey: "navigation.caseFiles", icon: <BoardRegular />, countKey: "caseFiles" },
      { to: "/documents", labelKey: "navigation.documents", icon: <DocumentRegular />, countKey: "documents" },
    ],
  },
  {
    labelKey: "navigation.administration",
    items: [{ to: "/council-members", labelKey: "navigation.members", icon: <PeopleRegular />, countKey: "members" }],
  },
];
