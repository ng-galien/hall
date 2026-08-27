import { randomUUID, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../core/logger.js";

function sameToken(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function authenticateApi(apiToken?: string) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (!apiToken) {
      next();
      return;
    }
    const authorization = request.header("authorization");
    const actualToken = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    if (!sameToken(actualToken, apiToken)) {
      response.status(401).json({ code: "authentication_required" });
      return;
    }
    next();
  };
}

export function auditApiRequest(request: Request, response: Response, next: NextFunction): void {
  const requestId = request.header("x-request-id") ?? randomUUID();
  response.setHeader("X-Request-Id", requestId);
  response.once("finish", () => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      logger.info(
        { requestId, method: request.method, path: request.path, statusCode: response.statusCode },
        "API change",
      );
    }
  });
  next();
}
