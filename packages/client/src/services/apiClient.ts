export type ApiErrorCode =
  | "agenda_ballot_required"
  | "agenda_inconsistent"
  | "agenda_item_not_found"
  | "agenda_sequence_invalid"
  | "attendance_incomplete"
  | "authentication_required"
  | "ballot_already_recorded"
  | "ballot_not_found"
  | "case_file_not_found"
  | "conflict"
  | "council_decision_not_found"
  | "council_member_not_found"
  | "document_not_found"
  | "upload_too_large"
  | "invalid_request"
  | "invalid_meeting_transition"
  | "meeting_not_found"
  | "meeting_officers_required"
  | "meeting_roster_locked"
  | "network_unavailable"
  | "proxy_invalid"
  | "quorum_not_reached"
  | "request_failed"
  | "topic_not_found";

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly status: number,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

const apiErrorCodes = new Set<ApiErrorCode>([
  "agenda_ballot_required",
  "agenda_inconsistent",
  "agenda_item_not_found",
  "agenda_sequence_invalid",
  "attendance_incomplete",
  "authentication_required",
  "ballot_already_recorded",
  "ballot_not_found",
  "case_file_not_found",
  "conflict",
  "council_decision_not_found",
  "council_member_not_found",
  "document_not_found",
  "upload_too_large",
  "invalid_meeting_transition",
  "invalid_request",
  "meeting_not_found",
  "meeting_officers_required",
  "meeting_roster_locked",
  "network_unavailable",
  "proxy_invalid",
  "quorum_not_reached",
  "request_failed",
  "topic_not_found",
]);

export function apiErrorCode(error: unknown): ApiErrorCode {
  return error instanceof ApiError ? error.code : "request_failed";
}

export async function apiResponse(path: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    const apiToken = getApiToken();
    const headers = new Headers(init?.headers);
    if (!(init?.body instanceof FormData)) headers.set("Content-Type", "application/json");
    if (apiToken) headers.set("Authorization", `Bearer ${apiToken}`);
    response = await fetch(`/api${path}`, {
      ...init,
      headers,
    });
  } catch {
    throw new ApiError("network_unavailable", 0);
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { code?: string } | null;
    const code =
      payload?.code && apiErrorCodes.has(payload.code as ApiErrorCode)
        ? (payload.code as ApiErrorCode)
        : "request_failed";
    throw new ApiError(code, response.status);
  }
  return response;
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiResponse(path, init);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

import { getApiToken } from "./apiAccess";
