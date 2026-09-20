// biome-ignore-all lint/correctness/useExhaustiveDependencies: Meeting, subject and revision tokens intentionally reload capabilities.
import { findSirenAction } from "@hall/api-contract";
import { useCallback, useEffect, useState } from "react";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { listPreparedCouncilSubjects } from "../../services/councilBusinessApi";
import { openCouncilMeeting } from "../../services/councilMeetingsApi";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useCouncilMeetingsStore } from "../../stores/councilMeetingsStore";

/** Reads candidates and permitted actions once per planning meeting, shared by all subjects in the business. */
export function useBusinessScheduling(businessId: string, revision: number) {
  const meetings = useCouncilMeetingsStore((state) => state.meetings);
  const subjects = useCouncilBusinessStore((state) => state.preparedSubjects);
  const subjectIds = subjects
    .filter((subject) => subject.councilBusinessId === businessId)
    .map((subject) => `${subject.kind}:${subject.id}`)
    .sort()
    .join(",");
  const meetingState = meetings
    .map((meeting) => `${meeting.id}:${meeting.agendaFrozenAt}:${meeting.startedAt}:${meeting.closedAt}`)
    .join(",");
  const meetingIds = meetings
    .filter((meeting) => meeting.phase === "draft" || meeting.phase === "scheduled")
    .map((meeting) => meeting.id)
    .join(",");
  const [available, setAvailable] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiErrorCode | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void Promise.all(
      meetingIds
        .split(",")
        .filter(Boolean)
        .map(async (meetingId) => {
          const meeting = await openCouncilMeeting(meetingId);
          if (!meeting.representation || !findSirenAction(meeting.representation, "agenda-item.schedule-prepared"))
            return [];
          const candidates = (await listPreparedCouncilSubjects(meetingId)).data;
          return candidates
            .filter((subject) => subject.councilBusinessId === businessId)
            .map((subject) => ({ key: `${subject.kind}:${subject.id}`, meetingId }));
        }),
    )
      .then((groups) => {
        if (!active) return;
        const next: Record<string, string[]> = {};
        for (const candidate of groups.flat()) {
          const meetingsForCandidate = next[candidate.key] ?? [];
          meetingsForCandidate.push(candidate.meetingId);
          next[candidate.key] = meetingsForCandidate;
        }
        setAvailable(next);
      })
      .catch((failure) => {
        if (active) setError(apiErrorCode(failure));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [businessId, meetingIds, meetingState, subjectIds, revision]);
  const refreshSubject = useCallback(
    async (subjectKey: string) => {
      setError(null);
      try {
        const candidates = await Promise.all(
          meetingIds
            .split(",")
            .filter(Boolean)
            .map(async (meetingId) => {
              const meeting = await openCouncilMeeting(meetingId);
              if (!meeting.representation || !findSirenAction(meeting.representation, "agenda-item.schedule-prepared"))
                return [];
              return (await listPreparedCouncilSubjects(meetingId)).data
                .filter(
                  (subject) =>
                    subject.councilBusinessId === businessId && `${subject.kind}:${subject.id}` === subjectKey,
                )
                .map(() => meetingId);
            }),
        );
        setAvailable((current) => ({ ...current, [subjectKey]: candidates.flat() }));
      } catch (failure) {
        setError(apiErrorCode(failure));
      }
    },
    [businessId, meetingIds],
  );
  return { available, loading, error, refreshSubject };
}
