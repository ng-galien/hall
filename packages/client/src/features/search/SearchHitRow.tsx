import { matchDiscriminated } from "@hall/domain";
import type { ReactNode } from "react";
import { KindGlyph } from "../../components/search/kindPresentation";
import { useI18n } from "../../i18n/I18nProvider";
import { CouncilBusinessGlyph } from "../council-business/CouncilBusinessGlyph";
import { formatMeetingLabel } from "../council-meetings/meetingPresentation";
import { DocumentaryResourceGlyph, useDocumentaryResourceTypeLabel } from "../documents/DocumentaryResourceGlyph";
import { MeetingStatusBadge, StatusBadge } from "../status/DomainStatusBadge";
import type { SearchHit } from "./searchCorpus";

/* The one way a search hit renders, whatever the surface. The default row borrows the
   workspace explorer classes so both stay visually identical; `card` keeps the grid card. */

export function SearchResultRow({
  glyph,
  title,
  meta,
  badge,
  active = false,
  card = false,
  onPick,
}: {
  glyph: ReactNode;
  title: string;
  meta: string;
  badge?: ReactNode;
  active?: boolean;
  card?: boolean;
  onPick(): void;
}) {
  if (card) {
    return (
      <button className="wsearch-hit" type="button" data-testid="search-hit" onClick={onPick}>
        {glyph}
        <span className="workspace-row-copy">
          <strong>{title}</strong>
          <span>{meta}</span>
        </span>
        {badge}
      </button>
    );
  }
  return (
    <button
      className="workspace-explorer-row"
      type="button"
      data-testid="search-hit"
      data-active={active || undefined}
      onClick={onPick}
    >
      {glyph}
      <span className="workspace-explorer-copy">
        <strong>{title}</strong>
        <span>{meta}</span>
      </span>
      {badge}
    </button>
  );
}

export function SearchHitRow<THit extends SearchHit>({
  hit,
  active = false,
  card = false,
  onPick,
}: {
  hit: THit;
  active?: boolean;
  card?: boolean;
  onPick(hit: THit): void;
}) {
  const { t, formatDate, formatFileSize } = useI18n();
  const typeLabel = useDocumentaryResourceTypeLabel();

  const entity = hit.entity;
  const { glyph, title, meta, badge } = matchDiscriminated(entity, "entityKind", {
    councilBusiness: (entry) => ({
      glyph: <CouncilBusinessGlyph business={entry.business} />,
      title: entry.business.title,
      meta: entry.business.folderPath || t("workspace.businessLeaf"),
      badge: null,
    }),
    resource: (entry) => ({
      glyph: <DocumentaryResourceGlyph resource={entry.resource} />,
      title: entry.resource.name,
      meta:
        entry.resource.kind === "document"
          ? `${typeLabel(entry.resource)} · ${formatFileSize(entry.resource.binary.byteSize)}`
          : typeLabel(entry.resource),
      badge: null,
    }),
    member: (entry) => ({
      glyph: <KindGlyph kind="member" />,
      title: `${entry.member.contact.firstName} ${entry.member.contact.lastName}`,
      meta: t(`role.${entry.member.role}` as Parameters<typeof t>[0]),
      badge: null,
    }),
    contact: (entry) => ({
      glyph: <KindGlyph kind="contact" />,
      title: `${entry.contact.firstName} ${entry.contact.lastName}`,
      meta: entry.contact.organizationName ?? entry.contact.jobTitle ?? t("contacts.contact"),
      badge: null,
    }),
    meeting: (entry) => ({
      glyph: <KindGlyph kind="meeting" />,
      title: formatMeetingLabel(entry.meeting, t("meetings.occurrenceLabel"), formatDate),
      meta: entry.meeting.scheduledAt
        ? `${formatDate(entry.meeting.scheduledAt)} · ${entry.meeting.location ?? ""}`
        : t("dashboard.toSchedule"),
      badge: <MeetingStatusBadge status={entry.meeting.phase} />,
    }),
    decision: (entry) => ({
      glyph: <KindGlyph kind="decision" />,
      title: entry.decision.title,
      meta: entry.decision.publicationNumber ?? t("navigation.decisions"),
      badge: <StatusBadge value={entry.decision.state} />,
    }),
  });

  return (
    <SearchResultRow
      glyph={glyph}
      title={title}
      meta={meta}
      badge={badge}
      active={active}
      card={card}
      onPick={() => onPick(hit)}
    />
  );
}
