import { HallPostgresError, type PostgresCouncil } from "@hall/postgres";
import { expect, it } from "vitest";
import { createPostgresCouncilClient } from "../infrastructure/postgres/councilClient.js";
import { RequestContextStore } from "../security/requestContext.js";

it.each([
  ["HV114", "conflict", "close"],
  ["HV223", "meeting_conduct_closed", "notes"],
] as const)("translates a rejected %s request into a business conflict", async (sqlState, code, operation) => {
  const fail = async () => {
    throw new HallPostgresError(
      "The meeting is closed",
      {
        sqlState,
        constraint: null,
        table: null,
        column: null,
        detail: null,
        schema: null,
      },
      null,
    );
  };
  // Only the two storage calls involved in a late submission are exercised here.
  const postgresCouncil = { close: fail, updateAgendaItemNotes: fail } as unknown as PostgresCouncil;
  const requestContext = new RequestContextStore();
  const client = createPostgresCouncilClient({ postgresCouncil, requestContext });
  await requestContext.run(
    {
      requestId: "closed-meeting-test",
      principal: {
        id: "administrator",
        displayName: "Administrator",
        roles: ["administrator"],
        contactId: null,
      },
    },
    async () => {
      const result =
        operation === "close"
          ? client.closeMeeting("meeting", { closedAt: "2026-09-11T06:48:49Z" })
          : client.updateAgendaItemNotes("item", { discussionSummary: "Late autosave" });
      await expect(result).rejects.toMatchObject({ code, statusCode: 409 });
    },
  );
});
