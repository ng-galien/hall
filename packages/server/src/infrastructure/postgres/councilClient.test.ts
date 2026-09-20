import { HallPostgresError, PostgresCouncil } from "@hall/postgres";
import { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { RequestContextStore } from "../../security/requestContext.js";
import { createPostgresCouncilClient } from "./councilClient.js";

it("maps recusal storage conflicts to stable API codes without reclassifying unrelated uniqueness errors", async () => {
  const pool = new Pool();
  const postgresCouncil = new PostgresCouncil(pool);
  const requestContext = new RequestContextStore();
  const client = createPostgresCouncilClient({ postgresCouncil, requestContext });
  const record = vi.spyOn(postgresCouncil, "recordAgendaItemRecusal");
  try {
    await requestContext.run(
      {
        requestId: "recusal-errors",
        principal: {
          id: "clerk",
          displayName: "Clerk",
          roles: ["administrator"],
          permissions: [],
          contactId: null,
        },
      },
      async () => {
        for (const [sqlState, constraint, code] of [
          ["HV231", null, "recusal_immutable"],
          ["HV232", null, "recusal_recording_closed"],
          ["HV233", null, "recusal_member_not_declared"],
          ["HV234", null, "recusal_occurrence_locked"],
          ["HV305", null, "recused_member_cannot_participate"],
          ["23505", "agenda_item_recusal_agenda_item_council_member_key", "recusal_already_recorded"],
          ["23505", "unrelated_unique_key", "conflict"],
        ] as const) {
          record.mockRejectedValue(
            new HallPostgresError(
              "storage conflict",
              {
                sqlState,
                constraint,
                table: null,
                column: null,
                detail: null,
                schema: null,
              },
              undefined,
            ),
          );
          await expect(
            client.recordAgendaItemRecusal("item", {
              councilMemberId: "member",
              legalBasis: "personalInterest",
              declaredAt: "2026-09-05T09:00:00Z",
            }),
          ).rejects.toMatchObject(code === "conflict" ? { failure: code } : { code, statusCode: 409 });
        }
      },
    );
  } finally {
    await pool.end();
  }
});

it("returns HTTP 409 when PostgreSQL detects a missing previous-PV agenda occurrence", async () => {
  const { default: express } = await import("express");
  const { default: request } = await import("supertest");
  const { errorHandler } = await import("../../api/errorHandler.js");
  const pool = new Pool();
  const postgresCouncil = new PostgresCouncil(pool);
  const requestContext = new RequestContextStore();
  const client = createPostgresCouncilClient({ postgresCouncil, requestContext });
  const close = vi
    .spyOn(postgresCouncil, "close")
    .mockRejectedValue(
      new HallPostgresError(
        "a successor requires its previous minutes approval in first position",
        { sqlState: "HV126", constraint: null, table: null, column: null, detail: null, schema: null },
        undefined,
      ),
    );
  const app = express();
  app.post("/api/council-meetings/:id/close", async (req, res) => {
    await requestContext.run(
      {
        requestId: "missing-minutes-occurrence-http",
        principal: {
          id: "clerk",
          displayName: "Clerk",
          roles: ["administrator"],
          permissions: ["meetings.conduct"],
          contactId: null,
        },
      },
      async () => {
        res.json(await client.closeMeeting(req.params.id, { closedAt: "2026-01-02T18:00:00Z" }));
      },
    );
  });
  app.use(errorHandler);
  try {
    const response = await request(app).post("/api/council-meetings/00000000-0000-4000-8000-000000000001/close");
    expect(response.status).toBe(409);
    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(response.body).toMatchObject({
      status: 409,
      code: "agenda_inconsistent",
      type: "/api/problems/agenda-inconsistent",
    });
    expect(close).toHaveBeenCalledOnce();
  } finally {
    close.mockRestore();
    await pool.end();
  }
});
