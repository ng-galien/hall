import { HallPostgresError, StatementTimeoutError } from "@hall/postgres";
import express from "express";
import request from "supertest";
import { afterEach, expect, it, vi } from "vitest";
import { auditApiRequest } from "../src/api/accessControl.js";
import { errorHandler } from "../src/api/errorHandler.js";
import { logger } from "../src/core/logger.js";
import { PersistenceError } from "../src/repositories/errors.js";
import { DomainError } from "../src/services/errors.js";

function application() {
  const app = express();
  app.use(express.json());
  app.use("/api", auditApiRequest);
  app.post("/api/ballot-previews/:id/confirm", () => {
    throw new DomainError("ballot_preview_stale", 409);
  });
  app.post("/api/contacts", () => {
    throw new PersistenceError("conflict", {
      cause: new HallPostgresError(
        "duplicate key",
        { sqlState: "23505", constraint: null, table: null, column: null, detail: null, schema: null },
        undefined,
      ),
    });
  });
  app.get("/api/council-meetings/:id/documents", () => {
    throw new StatementTimeoutError("interactive", 15_000, new Error("canceling statement due to statement timeout"));
  });
  app.use(errorHandler);
  return app;
}

function loggedLines(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.map(([fields, message]) => ({ fields: fields as Record<string, unknown>, message }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

// @verifies-requirement HALL-TR-DST-050
it("logs the problem code of a 409 refusal without the request body", async () => {
  const info = vi.spyOn(logger, "info");
  const response = await request(application())
    .post("/api/ballot-previews/00000000-0000-4000-8000-000000000001/confirm")
    .send({ secretNote: "Mme Dupont, 12 rue des Lilas" });

  expect(response.status).toBe(409);
  const [line] = loggedLines(info).filter(({ message }) => message === "API change");
  expect(line.fields).toEqual({
    requestId: undefined,
    actorUserId: null,
    method: "POST",
    path: "/api/ballot-previews/00000000-0000-4000-8000-000000000001/confirm",
    statusCode: 409,
    problemCode: "ballot_preview_stale",
  });
  expect(JSON.stringify(info.mock.calls)).not.toContain("Dupont");
});

// @verifies-requirement HALL-TR-DST-050
it("logs the SQLSTATE of a database conflict", async () => {
  const info = vi.spyOn(logger, "info");
  const response = await request(application()).post("/api/contacts").send({ name: "Jeanne Martin" });

  expect(response.status).toBe(409);
  const [line] = loggedLines(info).filter(({ message }) => message === "API change");
  expect(line.fields).toMatchObject({ statusCode: 409, problemCode: "conflict", sqlState: "23505" });
  expect(JSON.stringify(info.mock.calls)).not.toContain("Jeanne");
});

// @verifies-requirement HALL-TR-DST-040
// @verifies-requirement HALL-TR-DST-050
it("answers a statement timeout with a named 503 problem and logs the failed read", async () => {
  const info = vi.spyOn(logger, "info");
  const response = await request(application()).get(
    "/api/council-meetings/00000000-0000-4000-8000-000000000002/documents",
  );

  expect(response.status).toBe(503);
  expect(response.body).toMatchObject({ status: 503, code: "database_statement_timeout" });
  const [line] = loggedLines(info).filter(({ message }) => message === "API read failed");
  expect(line.fields).toMatchObject({
    method: "GET",
    statusCode: 503,
    problemCode: "database_statement_timeout",
    sqlState: "57014",
  });
});
