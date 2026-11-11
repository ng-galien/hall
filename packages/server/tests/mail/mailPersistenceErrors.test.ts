import { HallPostgresError } from "@hall/postgres";
import type { Request, Response } from "express";
import { expect, it, vi } from "vitest";
import { errorHandler } from "../../src/api/errorHandler.js";
import { translatePersistenceError } from "../../src/infrastructure/postgres/administrationRequest.js";

// @verifies-requirement HALL-FR-EML-060
it.each([
  ["HV850", 409, "mail_draft_changed"],
  ["HV851", 409, "mail_submission_blocks_changes"],
  ["HV852", 413, "mail_attachments_too_large"],
] as const)("reports %s with its specific user-facing error", (sqlState, status, code) => {
  const error = translatePersistenceError(
    new HallPostgresError(
      "SQL diagnostic",
      { sqlState, constraint: null, table: null, column: null, detail: null, schema: null },
      null,
    ),
  );
  const response = { locals: {}, status: vi.fn(), type: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);
  response.type.mockReturnValue(response);
  errorHandler(
    error,
    { originalUrl: "/api/mail/test", requestId: "request" } as Request,
    response as unknown as Response,
    vi.fn(),
  );
  expect(response.status).toHaveBeenCalledWith(status);
  expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ code, status }));
  expect(JSON.stringify(response.json.mock.calls)).not.toContain("SQL diagnostic");
});
