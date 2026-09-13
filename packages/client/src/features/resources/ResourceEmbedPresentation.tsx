import type { ResourceDetail, ResourceJsonObject, ResourceJsonValue } from "@hall/api-contract";
import { matchLiteral } from "@hall/domain";
import { type CSSProperties, createContext, useContext, useEffect, useMemo, useState } from "react";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { ResourceImageFigure } from "../../components/editor/images";
import {
  isValidResourceEmbedTableRange,
  type ResourceEmbedAttributes,
  type ResourceEmbedTableSheet,
} from "../../components/editor/resourceEmbeds";
import { MarkdownView } from "../../components/MarkdownView";
import { useI18n } from "../../i18n/I18nProvider";
import { openDocumentaryResource } from "../../services/resourcesApi";
import { EventFields } from "../calendar/EventFields";
import {
  type DocumentaryLeafDetail,
  DocumentaryResourceGlyph,
  documentaryResourceTone,
  useDocumentaryResourceTypeLabel,
} from "../documents/DocumentaryResourceGlyph";
import { GeographicResourceMap } from "../geographic/GeographicResourceMap";
import { legalStatusLabel } from "../legal/legalReferencePresentation";
import "./ResourceEmbedPresentation.css";

type SpreadsheetDocument = Extract<ResourceDetail, { kind: "spreadsheet" }>["document"];

function objectValue(value: ResourceJsonValue | undefined): ResourceJsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function stringValue(value: ResourceJsonValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function numberValue(value: ResourceJsonValue | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function columnLabel(index: number): string {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

function columnIndex(label: string): number {
  let value = 0;
  for (const character of label.toUpperCase()) value = value * 26 + character.charCodeAt(0) - 64;
  return value - 1;
}

function sheetRecords(document: SpreadsheetDocument): Array<{ id: string; sheet: ResourceJsonObject }> {
  const order = document.workbook.sheetOrder;
  const sheets = objectValue(document.workbook.sheets);
  if (!Array.isArray(order) || !sheets) return [];
  return order.flatMap((value) => {
    if (typeof value !== "string") return [];
    const sheet = objectValue(sheets[value]);
    return sheet ? [{ id: value, sheet }] : [];
  });
}

function defaultRange(sheet: ResourceJsonObject): string {
  const cellData = objectValue(sheet.cellData);
  let maxRow = 0;
  let maxColumn = 0;
  for (const [rowKey, rawRow] of Object.entries(cellData ?? {})) {
    const row = objectValue(rawRow);
    if (!row) continue;
    const rowIndex = Number(rowKey);
    if (Number.isInteger(rowIndex) && rowIndex >= 0) maxRow = Math.max(maxRow, rowIndex);
    for (const columnKey of Object.keys(row)) {
      const column = Number(columnKey);
      if (Number.isInteger(column) && column >= 0) maxColumn = Math.max(maxColumn, column);
    }
  }
  const boundedColumn = Math.min(maxColumn, 25, 499);
  const columnCount = boundedColumn + 1;
  const boundedRow = Math.min(maxRow, 99, Math.floor(500 / columnCount) - 1);
  return `A1:${columnLabel(boundedColumn)}${boundedRow + 1}`;
}

/** Loads the spreadsheet choices without exposing ResourceDetails to the technical editor. */
export async function loadResourceEmbedTableOptions(resourceId: string): Promise<ResourceEmbedTableSheet[]> {
  const details = await openDocumentaryResource(resourceId);
  if (details.data.kind !== "spreadsheet") return [];
  return sheetRecords(details.data.document).map(({ id, sheet }) => ({
    id,
    name: stringValue(sheet.name) ?? id,
    rowCount: numberValue(sheet.rowCount) ?? 1,
    columnCount: numberValue(sheet.columnCount) ?? 1,
    defaultRange: defaultRange(sheet),
  }));
}

function ignorePresentationError() {
  return undefined;
}

function decimalPlaces(pattern: string): number {
  return /\.(0+)/.exec(pattern)?.[1].length ?? 0;
}

function cellText(cell: ResourceJsonObject | null, locale: "fr" | "en"): string {
  if (!cell) return "";
  const value = cell.v;
  if (typeof value === "string") return value;
  if (typeof value === "boolean")
    return value ? (locale === "fr" ? "VRAI" : "TRUE") : locale === "fr" ? "FAUX" : "FALSE";
  if (typeof value === "number") {
    const pattern = stringValue(objectValue(objectValue(cell.s)?.n)?.pattern) ?? "";
    const digits = decimalPlaces(pattern);
    const language = locale === "fr" ? "fr-FR" : "en-US";
    if (pattern.includes("%")) {
      return new Intl.NumberFormat(language, {
        style: "percent",
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(value);
    }
    if (pattern.includes("€")) {
      return new Intl.NumberFormat(language, {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(value);
    }
    if (/[dmy]/i.test(pattern)) {
      const date = new Date((value - 25_569) * 86_400_000);
      if (Number.isFinite(date.getTime())) return new Intl.DateTimeFormat(language).format(date);
    }
    return new Intl.NumberFormat(language, { maximumFractionDigits: 20 }).format(value);
  }
  return typeof cell.f === "string" ? "…" : "";
}

function cellStyle(cell: ResourceJsonObject | null): CSSProperties | undefined {
  const style = objectValue(cell?.s);
  if (!style) return undefined;
  const foreground = stringValue(objectValue(style.cl)?.rgb);
  const background = stringValue(objectValue(style.bg)?.rgb);
  return {
    ...(style.bl === 1 ? { fontWeight: "bold" } : {}),
    ...(style.it === 1 ? { fontStyle: "italic" } : {}),
    ...(foreground && /^#[0-9a-f]{6}$/i.test(foreground) ? { color: foreground } : {}),
    ...(background && /^#[0-9a-f]{6}$/i.test(background) ? { backgroundColor: background } : {}),
    ...(style.ht === 2 ? { textAlign: "center" } : style.ht === 3 ? { textAlign: "right" } : {}),
  };
}

function SpreadsheetRangeTable({
  document,
  sheetId,
  range,
}: {
  document: SpreadsheetDocument;
  sheetId: string;
  range: string;
}) {
  const { locale, t } = useI18n();
  const record = sheetRecords(document).find((candidate) => candidate.id === sheetId);
  const match = /^\$?([A-Z]{1,3})\$?([1-9]\d*):\$?([A-Z]{1,3})\$?([1-9]\d*)$/i.exec(range);
  if (!record || !match) return <p className="editor-resource-embed-unavailable">{t("editor.embedUnavailable")}</p>;
  const rowCount = numberValue(record.sheet.rowCount) ?? 0;
  const columnCount = numberValue(record.sheet.columnCount) ?? 0;
  if (
    !isValidResourceEmbedTableRange(range, {
      id: sheetId,
      name: stringValue(record.sheet.name) ?? sheetId,
      rowCount,
      columnCount,
      defaultRange: "A1:A1",
    })
  ) {
    return <p className="editor-resource-embed-unavailable">{t("editor.embedUnavailable")}</p>;
  }
  const startColumn = columnIndex(match[1]);
  const startRow = Number(match[2]) - 1;
  const endColumn = columnIndex(match[3]);
  const endRow = Number(match[4]) - 1;
  const cellData = objectValue(record.sheet.cellData);
  const rows = [];
  for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
    const row = objectValue(cellData?.[String(rowIndex)]);
    const cells = [];
    for (let column = startColumn; column <= endColumn; column += 1) {
      const Cell = rowIndex === startRow ? "th" : "td";
      const cell = objectValue(row?.[String(column)]);
      cells.push(
        <Cell key={column} style={cellStyle(cell)}>
          {cellText(cell, locale)}
        </Cell>,
      );
    }
    rows.push(<tr key={rowIndex}>{cells}</tr>);
  }
  return (
    <div className="resource-embed-table" data-testid="resource-embed-presentation-table">
      <div className="resource-embed-table-scroll">
        <table>
          <thead>{rows[0]}</thead>
          <tbody>{rows.slice(1)}</tbody>
        </table>
      </div>
    </div>
  );
}

function ResourceEmbedBody({
  resource,
  attributes,
}: {
  resource: DocumentaryLeafDetail;
  attributes: ResourceEmbedAttributes;
}) {
  const { t, formatDate } = useI18n();
  const unavailable = <p className="editor-resource-embed-unavailable">{t("editor.embedUnavailable")}</p>;
  const presentation = attributes.presentation;
  return matchLiteral(presentation, {
    text: () =>
      resource.kind === "text" ? (
        <div data-testid="resource-embed-presentation-text">
          <MarkdownView markdown={resource.content} />
        </div>
      ) : (
        unavailable
      ),
    event: () =>
      resource.kind === "event" ? (
        <div data-testid="resource-embed-presentation-event">
          <EventFields value={resource.document} onChange={ignorePresentationError} readOnly />
        </div>
      ) : (
        unavailable
      ),
    image: () =>
      resource.kind === "document" && documentaryResourceTone(resource) === "image" ? (
        <ResourceImageFigure
          id={resource.id}
          alt={attributes.label || resource.name}
          align={attributes.align ?? "left"}
          width={attributes.width ?? 100}
          className="resource-embed-image"
        />
      ) : (
        unavailable
      ),
    document: () =>
      resource.kind === "document" ? (
        <span className="resource-embed-document" data-testid="resource-embed-presentation-document">
          <DocumentaryResourceGlyph resource={resource} />
          <span>{resource.name}</span>
        </span>
      ) : (
        unavailable
      ),
    link: () =>
      resource.kind === "remote" && resource.target.kind === "url" ? (
        <a href={resource.target.url} target="_blank" rel="noreferrer" data-testid="resource-embed-presentation-link">
          {resource.name}
        </a>
      ) : (
        unavailable
      ),
    "legal-citation": () => {
      if (resource.kind !== "legalReference" || resource.document.resolutionStatus !== "resolved") return unavailable;
      const legal = resource.document;
      const snapshot = legal.snapshots.find((candidate) => candidate.snapshotHash === legal.snapshotHash) ?? null;
      const validity = snapshot?.validFrom
        ? t("legalReference.validFrom").replace("{date}", formatDate(snapshot.validFrom))
        : legal.effectiveAt
          ? `${t("legalReference.effectiveVersion")} : ${formatDate(legal.effectiveAt)}`
          : null;
      return (
        <blockquote className="resource-embed-legal" data-testid="resource-embed-presentation-legal">
          <strong>{legal.citationLabel}</strong>
          <p>{snapshot?.normalizedContent ?? t("editor.embedUnavailable")}</p>
          <footer>
            {legalStatusLabel(legal.legalStatus, t)}
            {validity ? ` · ${validity}` : null}
          </footer>
        </blockquote>
      );
    },
    map: () =>
      resource.kind === "geographic" ? (
        <div className="resource-embed-map" data-testid="resource-embed-presentation-map">
          <GeographicResourceMap
            resource={resource}
            data={resource.document}
            canUpdate={false}
            onError={ignorePresentationError}
            embedded
          />
        </div>
      ) : (
        unavailable
      ),
    table: () =>
      resource.kind === "spreadsheet" && attributes.sheet && attributes.range ? (
        <SpreadsheetRangeTable document={resource.document} sheetId={attributes.sheet} range={attributes.range} />
      ) : (
        unavailable
      ),
  });
}

/** Current, type-aware resource presentation used by editor nodes and read-only Markdown. */
const EmbeddedResourceAncestors = createContext<readonly string[]>([]);

export function ResourceEmbedPresentation({ attributes }: { attributes: ResourceEmbedAttributes }) {
  const { t } = useI18n();
  const resourceTypeLabel = useDocumentaryResourceTypeLabel();
  const ancestors = useContext(EmbeddedResourceAncestors);
  const recursive = ancestors.includes(attributes.id);
  const [details, setDetails] = useState<DocumentaryLeafDetail | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setDetails(null);
    setFailed(false);
    void openDocumentaryResource(attributes.id).then(
      (result) => {
        if (active && result.data.kind !== "folder") setDetails(result.data);
      },
      () => active && setFailed(true),
    );
    return () => {
      active = false;
    };
  }, [attributes.id]);

  const overlay = useMemo(() => {
    if (!details) return null;
    if (attributes.presentation !== "image") return null;
    return {
      title: details.name,
      type: resourceTypeLabel(details),
    };
  }, [attributes.presentation, details, resourceTypeLabel]);

  if (recursive) return <p className="editor-resource-embed-unavailable">{t("editor.embedUnavailable")}</p>;
  return (
    <EmbeddedResourceAncestors.Provider value={[...ancestors, attributes.id]}>
      <article
        className={`editor-resource-embed editor-resource-embed-${attributes.presentation}`}
        data-testid="resource-embed-presentation"
      >
        <div className="editor-resource-embed-body">
          {!details && !failed ? <LoadingIndicator>{t("common.loading")}</LoadingIndicator> : null}
          {failed ? <p className="editor-resource-embed-unavailable">{t("editor.embedUnavailable")}</p> : null}
          {details ? <ResourceEmbedBody resource={details} attributes={attributes} /> : null}
        </div>
        {overlay && details ? (
          <div className="editor-resource-embed-overlay">
            <DocumentaryResourceGlyph resource={details} />
            <div>
              <strong>{overlay.title}</strong>
              <span>{overlay.type}</span>
            </div>
          </div>
        ) : null}
      </article>
    </EmbeddedResourceAncestors.Provider>
  );
}
