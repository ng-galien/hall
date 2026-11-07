-- Data reconciliation for HALL-FR-NOT-140 and HALL-FR-NOT-100: every recorded
-- agenda freeze is an established revision of the agenda and carries the date
-- and location issued with its notice; every notice references its revision.
-- A row already reconciled is left unchanged.

-- A notice belongs to the revision active when it was generated.
UPDATE hall.meeting_notice notice
SET agenda_freeze = (
  SELECT revision.id FROM hall.council_agenda_freeze revision
  LEFT JOIN hall.council_agenda_reopening reopening ON reopening.agenda_freeze = revision.id
  WHERE revision.council_meeting = notice.council_meeting
    AND revision.frozen_at <= notice.generated_at
    AND (reopening.reopened_at IS NULL OR notice.generated_at < reopening.reopened_at)
  ORDER BY revision.frozen_at DESC, revision.id DESC LIMIT 1)
WHERE notice.agenda_freeze IS NULL;

-- The date and location of a revision are those of its last notice, or those
-- of the meeting when the revision has no notice.
UPDATE hall.council_agenda_freeze revision
SET scheduled_at = coalesce((
      SELECT (notice.facts#>>'{meeting,scheduledAt}')::TIMESTAMPTZ FROM hall.meeting_notice notice
      WHERE notice.agenda_freeze = revision.id ORDER BY notice.version DESC LIMIT 1), meeting.scheduled_at),
    location = coalesce((
      SELECT notice.facts#>>'{meeting,location}' FROM hall.meeting_notice notice
      WHERE notice.agenda_freeze = revision.id ORDER BY notice.version DESC LIMIT 1), meeting.location)
FROM hall.council_meetings meeting
WHERE meeting.id = revision.council_meeting
  AND (revision.scheduled_at IS NULL OR revision.location IS NULL);

-- A meeting in preparation whose date or location changed after the notice of
-- its active revision is on the next, open revision: its notice no longer
-- matched the meeting and a new one is required, as before.
INSERT INTO hall.council_agenda_reopening(agenda_freeze)
SELECT revision.id FROM hall.active_council_agenda_freeze revision
JOIN hall.council_meetings meeting ON meeting.id = revision.council_meeting
WHERE meeting.started_at IS NULL AND meeting.closed_at IS NULL
  AND (revision.scheduled_at IS DISTINCT FROM meeting.scheduled_at OR revision.location IS DISTINCT FROM meeting.location);
