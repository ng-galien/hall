-- Data reconciliation for HALL-FR-WSP-280 MEETING_CONDUCT_LOCKS_AGENDA_SUBJECT_TEXTS.
-- Reconcile durable locks for agenda items that started before the lock trigger
-- was installed. The earliest start owns the lock if a resource appears again.
WITH started_subjects AS (
  SELECT
    CASE item.subject_kind
      WHEN 'councilDecisionProposal' THEN proposal.text_resource
      WHEN 'openQuestion' THEN question.text_resource
    END AS resource,
    item.council_meeting,
    item.started_at
  FROM hall.council_agenda_item AS item
  LEFT JOIN hall.council_decision_proposal_workspace AS proposal
    ON proposal.council_decision_proposal = item.council_decision_proposal
  LEFT JOIN hall.open_question_workspace AS question
    ON question.open_question = item.open_question
  WHERE item.started_at IS NOT NULL
), first_start AS (
  SELECT DISTINCT ON (resource)
    resource,
    council_meeting,
    started_at
  FROM started_subjects
  WHERE resource IS NOT NULL
  ORDER BY resource, started_at, council_meeting
)
INSERT INTO hall.agenda_subject_text_lock (resource, council_meeting, locked_at)
SELECT resource, council_meeting, started_at
FROM first_start
ON CONFLICT (resource) DO NOTHING;
