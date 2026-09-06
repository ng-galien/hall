import type { WorkspaceBusinessOccurrence } from "../../stores/workspaceCouncilActivityStore";

export function workspaceCurrentOccurrence(
  occurrences: readonly WorkspaceBusinessOccurrence[],
): WorkspaceBusinessOccurrence | null {
  const latest = occurrences.at(-1);
  if (latest && latest.agendaItem.position < 0 && !latest.agendaItem.adjournedAt) return null;
  return latest && (latest.meeting.phase !== "closed" || latest.agendaItem.position < 0) ? latest : null;
}
