export const workspaceCreateKinds = [
  "councilMatter",
  "text",
  "spreadsheet",
  "remote",
  "geographic",
  "event",
  "legalReference",
  "file",
] as const;

export type WorkspaceCreateKind = (typeof workspaceCreateKinds)[number];

/** Icons describe creation commands, independently from persisted resource appearance. */
export const workspaceCreateKindIcons: Record<WorkspaceCreateKind, typeof FileIcon> = {
  councilMatter: WorkspaceIcon,
  text: TextDocumentIcon,
  spreadsheet: TableIcon,
  remote: WebIcon,
  geographic: MapIcon,
  event: CalendarIcon,
  legalReference: LegalReferenceIcon,
  file: FileIcon,
};

import {
  CalendarIcon,
  FileIcon,
  LegalReferenceIcon,
  MapIcon,
  TableIcon,
  TextDocumentIcon,
  WebIcon,
  WorkspaceIcon,
} from "../../components/icons";
