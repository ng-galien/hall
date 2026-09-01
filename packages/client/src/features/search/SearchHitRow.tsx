import { matchDiscriminated } from "@hall/domain";
import { KindGlyph } from "../../components/search/kindPresentation";
import { useI18n } from "../../i18n/I18nProvider";
import { CouncilBusinessGlyph } from "../council-business/CouncilBusinessGlyph";
import { councilBusinessKindKeys } from "../council-business/presentation";
import { formatMeetingLabel } from "../council-meetings/meetingPresentation";
import { ResourceGlyph, useResourceTypeLabel } from "../documents/ResourceGlyph";
import { MeetingStatusBadge, StatusBadge } from "../status/DomainStatusBadge";
import type { SearchHit } from "./searchCorpus";

/* The one way a search hit renders, whatever the surface. The default row borrows the
   workspace explorer classes so both stay visually identical; `card` keeps the grid card. */

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
  const typeLabel = useResourceTypeLabel();

  const entity = hit.entity;
  const { glyph, title, meta, badge } = matchDiscriminated(entity, "entityKind", {
    councilBusiness: (entry) => ({
      glyph: <CouncilBusinessGlyph business={entry.business} />,
      title: entry.business.title,
      meta: t(councilBusinessKindKeys[entry.business.kind]),
      badge: null,
    }),
    resource: (entry) => ({
      glyph: <ResourceGlyph resource={entry.resource} />,
      title: entry.resource.title,
      meta:
        entry.resource.kind === "document"
          ? `${typeLabel(entry.resource)} · ${formatFileSize(entry.resource.byteSize)}`
          : typeLabel(entry.resource),
      badge: null,
    }),
    member: (entry) => ({
      glyph: <KindGlyph kind="member" />,
      title: `${entry.member.firstName} ${entry.member.lastName}`,
      meta: t(`role.${entry.member.role}` as Parameters<typeof t>[0]),
      badge: null,
    }),
    meeting: (entry) => ({
      glyph: <KindGlyph kind="meeting" />,
      title: formatMeetingLabel(entry.meeting, t("meetings.occurrenceLabel"), formatDate),
      meta: `${formatDate(entry.meeting.startsAt)} · ${entry.meeting.location}`,
      badge: <MeetingStatusBadge status={entry.meeting.status} />,
    }),
    decision: (entry) => ({
      glyph: <KindGlyph kind="decision" />,
      title: entry.decision.title,
      meta: entry.decision.number ?? t("navigation.decisions"),
      badge: <StatusBadge value={entry.decision.status} />,
    }),
  });

  if (card) {
    return (
      <button className="wsearch-hit" type="button" data-testid="search-hit" onClick={() => onPick(hit)}>
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
      onClick={() => onPick(hit)}
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
