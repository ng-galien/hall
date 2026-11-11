import type { AgendaSubject } from "@hall/api-contract";
import { matchDiscriminated, matchLiteral, type ReferenceEntityKind, type Resource } from "@hall/domain";
import {
  CalendarIcon,
  CsvIcon,
  ImageIcon,
  LayersIcon,
  LegalReferenceIcon,
  MapIcon,
  PdfIcon,
  PresentationDocumentIcon,
  SpreadsheetDocumentIcon,
  TableIcon,
  TextDocumentIcon,
  WebIcon,
  WordDocumentIcon,
} from "../../components/icons";
import { ListRowIcon, type ResourceNature } from "../../components/ui/list-row";
import type { TranslationKey } from "../../i18n/en";
import { useI18n } from "../../i18n/I18nProvider";

export type ResourceTone =
  | "event"
  | "text"
  | "remote"
  | "geographic"
  | "geographicLayer"
  | "legalReference"
  | "pdf"
  | "image"
  | "document"
  | "spreadsheet"
  | "spreadsheetFile"
  | "presentation"
  | "csv";

export function resourceTone(resource: Resource): ResourceTone {
  return matchDiscriminated(resource, "kind", {
    text: () => "text" as const,
    spreadsheet: () => "spreadsheet" as const,
    remote: () => "remote" as const,
    geographic: () => "geographic" as const,
    geographicLayer: () => "geographicLayer" as const,
    legalReference: () => "legalReference" as const,
    document: (entry) =>
      matchLiteral(entry.format, {
        pdf: () => "pdf" as const,
        jpeg: () => "image" as const,
        png: () => "image" as const,
        docx: () => "document" as const,
        odt: () => "document" as const,
        xlsx: () => "spreadsheetFile" as const,
        pptx: () => "presentation" as const,
        csv: () => "csv" as const,
        txt: () => "text" as const,
      }),
  });
}

export const toneLabelKeys: Record<ResourceTone, TranslationKey> = {
  text: "workspace.type.text",
  remote: "workspace.type.remote",
  geographic: "workspace.type.geographic",
  geographicLayer: "workspace.type.geographicLayer",
  event: "workspace.type.event",
  legalReference: "workspace.type.legalReference",
  pdf: "workspace.type.pdf",
  image: "workspace.type.image",
  document: "workspace.type.file",
  spreadsheet: "workspace.type.spreadsheet",
  spreadsheetFile: "workspace.type.file",
  presentation: "workspace.type.file",
  csv: "workspace.type.file",
};

/**
 * Nature of each type: writings in blue, data in azure, visuals in violet, council objects in dark slate.
 * @implements-requirement HALL-FR-LAY-070
 */
export const toneNatures: Record<ResourceTone, ResourceNature> = {
  text: "writing",
  remote: "writing",
  pdf: "writing",
  document: "writing",
  presentation: "writing",
  spreadsheet: "data",
  spreadsheetFile: "data",
  csv: "data",
  image: "visual",
  geographic: "visual",
  geographicLayer: "visual",
  legalReference: "council",
  event: "council",
};

/** Nature of a referenced entity; a resource takes the nature of its tone when it is known. */
export const referenceKindNatures: Record<ReferenceEntityKind, ResourceNature> = {
  member: "council",
  contact: "council",
  resource: "writing",
  councilBusiness: "council",
  decision: "council",
  meeting: "council",
};

/** Nature of each agenda subject. */
export const agendaSubjectNatures: Record<AgendaSubject["kind"], ResourceNature> = {
  minutesApproval: "council",
  councilDecisionProposal: "council",
  openQuestion: "council",
};

export const toneIcons = {
  text: TextDocumentIcon,
  remote: WebIcon,
  geographic: MapIcon,
  geographicLayer: LayersIcon,
  event: CalendarIcon,
  legalReference: LegalReferenceIcon,
  pdf: PdfIcon,
  image: ImageIcon,
  document: WordDocumentIcon,
  spreadsheet: TableIcon,
  spreadsheetFile: SpreadsheetDocumentIcon,
  presentation: PresentationDocumentIcon,
  csv: CsvIcon,
} as const;

export function resourceDate(resource: Resource): { kind: "updated" | "created"; value: string } {
  return matchDiscriminated(resource, "kind", {
    text: (entry) => ({ kind: "updated" as const, value: entry.updatedAt }),
    geographic: (entry) => ({ kind: "updated" as const, value: entry.updatedAt }),
    document: (entry) => ({ kind: "created" as const, value: entry.createdAt }),
    remote: (entry) => ({ kind: "created" as const, value: entry.createdAt }),
    spreadsheet: (entry) => ({ kind: "created" as const, value: entry.createdAt }),
    legalReference: (entry) => ({ kind: "created" as const, value: entry.createdAt }),
    geographicLayer: (entry) => ({ kind: "created" as const, value: entry.createdAt }),
  });
}

export function useResourceTypeLabel(): (resource: Resource) => string {
  const { t } = useI18n();
  return (resource) =>
    matchDiscriminated(resource, "kind", {
      document: (entry) => entry.format.toUpperCase(),
      remote: () => t("workspace.type.remote"),
      spreadsheet: () => t("workspace.type.spreadsheet"),
      geographic: () => t("workspace.type.geographic"),
      legalReference: () => t("workspace.type.legalReference"),
      geographicLayer: () => t("workspace.type.geographicLayer"),
      text: () => t("workspace.type.text"),
    });
}

/** Type icon of a resource: text, PDF, image or generic file. */
export function ResourceGlyph({ resource, large }: { resource: Resource; large?: boolean }) {
  return <ToneGlyph tone={resourceTone(resource)} large={large} />;
}

/** Type icon of a resource tone, the single glyph shape and colour of each resource type. */
export function ToneGlyph({ tone, large }: { tone: ResourceTone; large?: boolean }) {
  const Icon = toneIcons[tone];
  return (
    <ListRowIcon nature={toneNatures[tone]} large={large}>
      <Icon />
    </ListRowIcon>
  );
}
