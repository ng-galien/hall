import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { getShortestPaths } from "xstate/graph";
import {
  type AgendaItemStatus,
  agendaItemStatuses,
  type CouncilDecisionStatus,
  councilDecisionStatuses,
  type MeetingStatus,
  meetingStatuses,
} from "../model.js";
import {
  type AgendaItemEvent,
  agendaItemEventTypes,
  agendaItemMachine,
  type CouncilDecisionEvent,
  councilDecisionEventTypes,
  councilDecisionMachine,
  type MeetingEvent,
  meetingEventTypes,
  meetingMachine,
  transitionAgendaItem,
  transitionCouncilDecision,
  transitionMeeting,
} from "./index.js";

type TransitionMatrix<State extends PropertyKey, EventType extends PropertyKey> = Record<
  State,
  Record<EventType, State | null>
>;

const meetingTransitions = {
  draft: {
    SCHEDULE: "scheduled",
    OPEN: null,
    CLOSE: null,
    CLOSE_AFTER_QUORUM_FAILURE: null,
    CANCEL: "cancelled",
  },
  scheduled: {
    SCHEDULE: null,
    OPEN: "inProgress",
    CLOSE: null,
    CLOSE_AFTER_QUORUM_FAILURE: "closed",
    CANCEL: "cancelled",
  },
  inProgress: {
    SCHEDULE: null,
    OPEN: null,
    CLOSE: "closed",
    CLOSE_AFTER_QUORUM_FAILURE: null,
    CANCEL: null,
  },
  closed: {
    SCHEDULE: null,
    OPEN: null,
    CLOSE: null,
    CLOSE_AFTER_QUORUM_FAILURE: null,
    CANCEL: null,
  },
  cancelled: {
    SCHEDULE: null,
    OPEN: null,
    CLOSE: null,
    CLOSE_AFTER_QUORUM_FAILURE: null,
    CANCEL: null,
  },
} as const satisfies TransitionMatrix<MeetingStatus, MeetingEvent["type"]>;

const agendaItemTransitions = {
  scheduled: { START: "inProgress", COMPLETE: null, POSTPONE: "postponed", WITHDRAW: "withdrawn" },
  inProgress: { START: null, COMPLETE: "examined", POSTPONE: "postponed", WITHDRAW: "withdrawn" },
  examined: { START: null, COMPLETE: null, POSTPONE: null, WITHDRAW: null },
  postponed: { START: null, COMPLETE: null, POSTPONE: null, WITHDRAW: null },
  withdrawn: { START: null, COMPLETE: null, POSTPONE: null, WITHDRAW: null },
} as const satisfies TransitionMatrix<AgendaItemStatus, AgendaItemEvent["type"]>;

const councilDecisionTransitions = {
  draft: {
    MARK_READY: "ready",
    SCHEDULE: "scheduled",
    RETURN_TO_PREPARATION: null,
    RECORD_ADOPTION: null,
    RECORD_REJECTION: null,
    REOPEN_BALLOT: null,
    MAKE_ENFORCEABLE: null,
  },
  ready: {
    MARK_READY: null,
    SCHEDULE: "scheduled",
    RETURN_TO_PREPARATION: null,
    RECORD_ADOPTION: null,
    RECORD_REJECTION: null,
    REOPEN_BALLOT: null,
    MAKE_ENFORCEABLE: null,
  },
  scheduled: {
    MARK_READY: null,
    SCHEDULE: null,
    RETURN_TO_PREPARATION: "ready",
    RECORD_ADOPTION: "adopted",
    RECORD_REJECTION: "rejected",
    REOPEN_BALLOT: null,
    MAKE_ENFORCEABLE: null,
  },
  adopted: {
    MARK_READY: null,
    SCHEDULE: null,
    RETURN_TO_PREPARATION: null,
    RECORD_ADOPTION: null,
    RECORD_REJECTION: null,
    REOPEN_BALLOT: "scheduled",
    MAKE_ENFORCEABLE: "enforceable",
  },
  rejected: {
    MARK_READY: null,
    SCHEDULE: null,
    RETURN_TO_PREPARATION: null,
    RECORD_ADOPTION: null,
    RECORD_REJECTION: null,
    REOPEN_BALLOT: "scheduled",
    MAKE_ENFORCEABLE: null,
  },
  enforceable: {
    MARK_READY: null,
    SCHEDULE: null,
    RETURN_TO_PREPARATION: null,
    RECORD_ADOPTION: null,
    RECORD_REJECTION: null,
    REOPEN_BALLOT: null,
    MAKE_ENFORCEABLE: null,
  },
} as const satisfies TransitionMatrix<CouncilDecisionStatus, CouncilDecisionEvent["type"]>;

function assertCompleteMatrix<State extends PropertyKey, EventType extends PropertyKey>(
  states: readonly State[],
  eventTypes: readonly EventType[],
  expected: TransitionMatrix<State, EventType>,
  transition: (state: State, eventType: EventType) => State | null,
) {
  for (const state of states) {
    for (const eventType of eventTypes) {
      expect(transition(state, eventType), `${String(state)} + ${String(eventType)}`).toBe(expected[state][eventType]);
    }
  }
}

function assertGeneratedSequences<State extends PropertyKey, EventType extends PropertyKey>(
  states: readonly State[],
  eventTypes: readonly EventType[],
  expected: TransitionMatrix<State, EventType>,
  transition: (state: State, eventType: EventType) => State | null,
) {
  fc.assert(
    fc.property(
      fc.constantFrom(...states),
      fc.array(fc.constantFrom(...eventTypes), { minLength: 0, maxLength: 40 }),
      (initialState, sequence) => {
        let oracleState = initialState;
        let actualState = initialState;
        for (const eventType of sequence) {
          const oracleNext = expected[oracleState][eventType];
          const actualNext = transition(actualState, eventType);
          expect(actualNext).toBe(oracleNext);
          if (oracleNext !== null) {
            if (actualNext === null) throw new Error("Transition diverged from the lifecycle oracle");
            oracleState = oracleNext;
            actualState = actualNext;
          }
        }
        expect(actualState).toBe(oracleState);
      },
    ),
    { numRuns: 2_000 },
  );
}

describe("lifecycle state-machine safety", () => {
  it("matches the complete meeting state-event matrix", () => {
    assertCompleteMatrix(meetingStatuses, meetingEventTypes, meetingTransitions, (state, type) =>
      transitionMeeting(state, { type }),
    );
  });

  it("matches the complete agenda-item state-event matrix", () => {
    assertCompleteMatrix(agendaItemStatuses, agendaItemEventTypes, agendaItemTransitions, (state, type) =>
      transitionAgendaItem(state, { type }),
    );
  });

  it("matches the complete council-decision state-event matrix", () => {
    assertCompleteMatrix(
      councilDecisionStatuses,
      councilDecisionEventTypes,
      councilDecisionTransitions,
      (state, type) => transitionCouncilDecision(state, { type }),
    );
  });

  it("keeps arbitrary meeting event sequences aligned with the independent matrix", () => {
    assertGeneratedSequences(meetingStatuses, meetingEventTypes, meetingTransitions, (state, type) =>
      transitionMeeting(state, { type }),
    );
  });

  it("keeps arbitrary agenda-item event sequences aligned with the independent matrix", () => {
    assertGeneratedSequences(agendaItemStatuses, agendaItemEventTypes, agendaItemTransitions, (state, type) =>
      transitionAgendaItem(state, { type }),
    );
  });

  it("keeps arbitrary council-decision event sequences aligned with the independent matrix", () => {
    assertGeneratedSequences(
      councilDecisionStatuses,
      councilDecisionEventTypes,
      councilDecisionTransitions,
      (state, type) => transitionCouncilDecision(state, { type }),
    );
  });

  it("reaches every declared state through XState-generated shortest paths", () => {
    expect(new Set(getShortestPaths(meetingMachine).map((path) => String(path.state.value)))).toEqual(
      new Set(meetingStatuses),
    );
    expect(new Set(getShortestPaths(agendaItemMachine).map((path) => String(path.state.value)))).toEqual(
      new Set(agendaItemStatuses),
    );
    expect(new Set(getShortestPaths(councilDecisionMachine).map((path) => String(path.state.value)))).toEqual(
      new Set(councilDecisionStatuses),
    );
  });
});
