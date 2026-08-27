import { randomUUID } from "node:crypto";
import type { ErrorRequestHandler } from "express";
import { MulterError } from "multer";
import { ZodError } from "zod";
import { logger } from "../core/logger.js";
import { PersistenceError } from "../repositories/errors.js";
import { DomainError } from "../services/errors.js";

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(400).json({ code: "invalid_request", issues: error.issues });
    return;
  }
  if (error instanceof DomainError) {
    response.status(error.statusCode).json({ code: error.code });
    return;
  }
  if (error instanceof PersistenceError) {
    response.status(409).json({ code: error.code });
    return;
  }
  if (error instanceof MulterError) {
    response.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
      code: error.code === "LIMIT_FILE_SIZE" ? "upload_too_large" : "invalid_request",
    });
    return;
  }
  const correlationId = randomUUID();
  logger.error({ correlationId, error }, "Unhandled HTTP request error");
  response.status(500).json({ code: "request_failed", correlationId });
};
