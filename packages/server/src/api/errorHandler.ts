import type { ErrorRequestHandler } from "express";
import { MulterError } from "multer";
import { ZodError } from "zod";
import { CouncilClientError } from "../clients/councilClient.js";
import { logger } from "../core/logger.js";
import { hallSqlState, PersistenceError, statementTimeout } from "../repositories/errors.js";
import { DomainError } from "../services/errors.js";
import { sendProblem } from "./problemDetails.js";

// @implements-requirement HALL-FR-WSP-390
// @implements-requirement HALL-FR-WSP-420
// @implements-requirement HALL-FR-DIR-150
// @implements-requirement HALL-FR-WSP-440
// @implements-requirement HALL-FR-WSP-450
// @implements-requirement HALL-FR-USR-060
const postgresProblems: ReadonlyMap<string, { readonly status: number; readonly code: string }> = new Map([
  ["HV801", { status: 409, code: "built_in_administrator_protected" }],
  ["HV802", { status: 400, code: "invalid_authorization_grant" }],
  ["HV803", { status: 409, code: "authorization_role_changed" }],
  ["HV804", { status: 409, code: "authorization_role_in_use" }],
  ["HV614", { status: 403, code: "permission_denied" }],
  ["HV615", { status: 403, code: "permission_denied" }],
  ["HV617", { status: 422, code: "councillor_requires_active_member" }],
  ["HV707", { status: 409, code: "personal_workspace_resource_not_associable" }],
  ["HV713", { status: 409, code: "council_business_report_not_deletable" }],
  ["HV714", { status: 409, code: "council_business_folder_not_deletable" }],
]);

// @implements-requirement HALL-TR-DST-040
// @implements-requirement HALL-TR-DST-050
export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  const sqlState = hallSqlState(error);
  response.locals.sqlState = sqlState;
  if (statementTimeout(error)) {
    sendProblem(request, response, 503, "database_statement_timeout");
    return;
  }
  const postgresProblem = sqlState === null ? undefined : postgresProblems.get(sqlState);
  if (postgresProblem) {
    sendProblem(request, response, postgresProblem.status, postgresProblem.code);
    return;
  }
  if (error instanceof URIError) {
    sendProblem(request, response, 400, "invalid_request");
    return;
  }
  if (error instanceof Error && "type" in error && error.type === "entity.too.large") {
    sendProblem(request, response, 413, "request_too_large");
    return;
  }
  if (error instanceof SyntaxError && "type" in error && error.type === "entity.parse.failed") {
    sendProblem(request, response, 400, "invalid_request");
    return;
  }
  if (error instanceof ZodError) {
    sendProblem(request, response, 400, "invalid_request", { errors: error.issues });
    return;
  }
  if (error instanceof DomainError) {
    sendProblem(request, response, error.statusCode, error.code, error.detail ? { detail: error.detail } : {});
    return;
  }
  if (error instanceof CouncilClientError) {
    sendProblem(request, response, error.failure === "invalidResourceLocation" ? 400 : 409, error.failure);
    return;
  }
  if (error instanceof PersistenceError) {
    const code = error.constraint?.startsWith("council_term_")
      ? error.constraint
      : error.constraint === "resource_location_unique" ||
          error.constraint === "resource_folder_target" ||
          error.constraint === "one_resource_title_per_folder" ||
          error.constraint === "one_council_business_title_per_folder"
        ? "workspace_title_conflict"
        : error.code;
    sendProblem(request, response, 409, code);
    return;
  }
  if (error instanceof MulterError) {
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    sendProblem(request, response, status, error.code === "LIMIT_FILE_SIZE" ? "upload_too_large" : "invalid_request");
    return;
  }
  logger.error({ requestId: request.requestId, error }, "Unhandled HTTP request error");
  sendProblem(request, response, 500, "request_failed");
};
