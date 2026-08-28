import type { ErrorRequestHandler } from "express";
import { MulterError } from "multer";
import { ZodError } from "zod";
import { logger } from "../core/logger.js";
import { PersistenceError } from "../repositories/errors.js";
import { DomainError } from "../services/errors.js";
import { sendProblem } from "./problemDetails.js";

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
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
    sendProblem(request, response, error.statusCode, error.code);
    return;
  }
  if (error instanceof PersistenceError) {
    sendProblem(request, response, 409, error.code);
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
