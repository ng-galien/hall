import { PROBLEM_MEDIA_TYPE, type ProblemDetails } from "@hall/api-contract";
import type { Request, Response } from "express";

const titles: Record<string, string> = {
  authentication_required: "Authentication required",
  permission_denied: "Permission denied",
  invalid_credentials: "Invalid credentials",
  invalid_request: "Invalid request",
  unsupported_document_format: "Unsupported document format",
  document_content_mismatch: "Document content does not match its format",
  resource_preview_unavailable: "Document preview is unavailable",
  resource_preview_conversion_unavailable: "Document preview conversion is unavailable",
  resource_preview_conversion_failed: "Document preview conversion failed",
  csrf_validation_failed: "Cross-origin request rejected",
  route_not_found: "Route not found",
  too_many_login_attempts: "Too many login attempts",
  request_too_large: "Request body too large",
  template_attachments_too_large: "Template attachments are too large",
  template_generation_busy: "Template generation capacity is busy",
  request_failed: "Request failed",
  conflict: "Conflict",
  bootstrap_unavailable: "Bootstrap unavailable",
  last_administrator_required: "The last administrator must remain active",
};

export function sendProblem(
  request: Request,
  response: Response,
  status: number,
  code: string,
  options: { detail?: string; errors?: unknown[] } = {},
): void {
  const problem: ProblemDetails = {
    type: `/api/problems/${code.replaceAll("_", "-")}`,
    title: titles[code] ?? code.replaceAll("_", " "),
    status,
    code,
    instance: request.originalUrl,
    requestId: request.requestId,
    ...options,
  };
  response.status(status).type(PROBLEM_MEDIA_TYPE).json(problem);
}
