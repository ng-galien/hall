import { Writable } from "node:stream";
import { HallPostgresError, StatementTimeoutError } from "@hall/postgres";
import express from "express";
import pino from "pino";
import request from "supertest";
import { afterEach, expect, it, vi } from "vitest";
import { auditApiRequest } from "../src/api/accessControl.js";
import { errorHandler } from "../src/api/errorHandler.js";
import { logger, loggerOptions } from "../src/core/logger.js";
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
  app.post("/api/contacts/import", () => {
    const databaseError = Object.assign(new Error('null value in column "family_name" violates not-null constraint'), {
      code: "23502",
      detail: "Failing row contains (Jeanne, null, jeanne.martin@example.test).",
      where: 'SQL statement "INSERT INTO hall.contact (given_name, email) VALUES (given, address)"',
      internalQuery: "INSERT INTO hall.contact (given_name, email) VALUES (given, address)",
      query: "SELECT hall_api.create_contact($1)",
      values: ['{"givenName":"Jeanne","email":"jeanne.martin@example.test"}'],
      parameters: ["jeanne.martin@example.test"],
    });
    throw new HallPostgresError(
      databaseError.message,
      {
        sqlState: "23502",
        constraint: null,
        table: "contact",
        column: "family_name",
        detail: databaseError.detail,
        schema: "hall",
      },
      databaseError,
    );
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

// @verifies-requirement HALL-TR-DST-050
it("logs an unhandled error with its type, message, code, stack and request, without query text or parameter values", async () => {
  const error = vi.spyOn(logger, "error");
  const response = await request(application()).post("/api/contacts/import").send({ email: "jeanne.martin@example.test" });

  expect(response.status).toBe(500);
  const [line] = loggedLines(error).filter(({ message }) => message === "Unhandled HTTP request error");
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk));
      callback();
    },
  });
  pino({ ...loggerOptions, level: "info" }, stream).error(line.fields, String(line.message));
  const written = JSON.parse(lines[0]);
  expect(Object.keys(line.fields)).toEqual(["requestId", "error"]);
  expect(Object.keys(written).filter((key) => !["level", "time", "pid", "hostname", "msg"].includes(key))).toEqual([
    "error",
  ]);
  expect(written.error).toMatchObject({
    type: "HallPostgresError",
    message: 'null value in column "family_name" violates not-null constraint',
    code: "23502",
    cause: { type: "Error", message: 'null value in column "family_name" violates not-null constraint', code: "23502" },
  });
  expect(written.error.stack).toContain("apiRefusalLog.test.ts");
  expect(Object.keys(written.error).sort()).toEqual(["cause", "code", "message", "stack", "type"]);
  expect(Object.keys(written.error.cause).sort()).toEqual(["code", "message", "stack", "type"]);
  for (const value of ["jeanne", "Jeanne", "INSERT", "create_contact", "Failing row"]) {
    expect(lines[0]).not.toContain(value);
  }
});
