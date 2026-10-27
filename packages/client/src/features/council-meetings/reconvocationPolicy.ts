import type { MeetingConductState, MeetingQuorumObservation } from "@hall/api-contract";

/** The latest quorum failure of the meeting whose second convocation is not recorded yet. */
export function quorumFailureAwaitingReconvocation(
  conduct: Pick<MeetingConductState, "quorumObservations" | "reconvocations"> | null | undefined,
): MeetingQuorumObservation | undefined {
  return conduct?.quorumObservations
    .filter(
      (observation) =>
        observation.facts.verdict === "notMet" &&
        !conduct.reconvocations.some((entry) => entry.failedObservationId === observation.id),
    )
    .at(-1);
}
