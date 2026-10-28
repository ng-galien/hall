export const workspaceCreateKinds = [
  "councilMatter",
  "text",
  "spreadsheet",
  "remote",
  "geographic",
  "event",
  "legalReference",
  "file",
  "takePhoto",
  "choosePhoto",
] as const;

/** Kinds that open a file picker instead of asking for a name. */
export const workspacePickedKinds: readonly WorkspaceCreateKind[] = ["file", "takePhoto", "choosePhoto"];

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
  takePhoto: CameraIcon,
  choosePhoto: ImageIcon,
};

import {
  CalendarIcon,
  CameraIcon,
  FileIcon,
  ImageIcon,
  LegalReferenceIcon,
  MapIcon,
  TableIcon,
  TextDocumentIcon,
  WebIcon,
  WorkspaceIcon,
} from "../../components/icons";
