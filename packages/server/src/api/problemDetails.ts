import { PROBLEM_MEDIA_TYPE, type ProblemDetails } from "@hall/api-contract";
import type { Request, Response } from "express";

const titles: Record<string, string> = {
  recusal_already_recorded: "A recusal is already recorded for this member and agenda item",
  recusal_recording_closed: "Recusal recording is closed for this agenda item",
  recusal_member_not_declared: "The member has no attendance declaration in this meeting",
  recused_member_cannot_participate: "A recused member cannot participate in this ballot",
  recusal_immutable: "A recorded recusal cannot be rewritten",
  recusal_occurrence_locked: "An agenda item with recusals must remain in its meeting",
  authentication_required: "Authentication required",
  permission_denied: "Permission denied",
  personal_workspace_resource_not_associable:
    "A document of a personal workspace is taken over into a common folder before it joins an affair",
  council_business_report_not_deletable: "A council business report is deleted only with its council business",
  council_business_folder_not_deletable: "A council business folder is deleted only with its council business",
  meeting_cited_document_not_deletable: "A document cited by a council meeting is never deleted",
  meeting_dossier_unavailable: "The meeting dossier needs a frozen agenda",
  deliberation_list_unavailable: "The list of deliberations needs a closed meeting",
  proxy_form_invalid: "A proxy form names two distinct council members in mandate",
  councillor_requires_active_member: "A council member account requires a contact with an active mandate",
  invalid_credentials: "Invalid credentials",
  invalid_current_password: "Current password is incorrect",
  invalid_request: "Invalid request",
  unsupported_document_format: "Unsupported document format",
  document_content_mismatch: "Document content does not match its format",
  resource_preview_unavailable: "Document preview is unavailable",
  resource_preview_conversion_failed: "Document preview conversion failed",
  csrf_validation_failed: "Cross-origin request rejected",
  route_not_found: "Route not found",
  too_many_login_attempts: "Too many login attempts",
  request_too_large: "Request body too large",
  template_attachments_too_large: "Template attachments are too large",
  template_generation_busy: "Template generation capacity is busy",
  request_failed: "Request failed",
  database_statement_timeout: "A database statement exceeded its time limit",
  conflict: "Conflict",
  council_business_has_dependencies: "Council business still has resources or linked records",
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
  if (response.locals) response.locals.problemCode = code;
  response.status(status).type(PROBLEM_MEDIA_TYPE).json(problem);
}
