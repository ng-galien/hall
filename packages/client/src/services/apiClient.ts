import {
  type ApiActionName,
  findSirenAction,
  findSirenLink,
  PROBLEM_MEDIA_TYPE,
  SIREN_MEDIA_TYPE,
  type SirenEntity,
  sirenData,
} from "@hall/api-contract";

export type ApiErrorCode =
  | "recusal_already_recorded"
  | "recusal_recording_closed"
  | "recusal_member_not_declared"
  | "recused_member_cannot_participate"
  | "recusal_immutable"
  | "recusal_occurrence_locked"
  | "agenda_ballot_required"
  | "agenda_inconsistent"
  | "agenda_item_not_found"
  | "agenda_order_invalid"
  | "agenda_sequence_invalid"
  | "attendance_incomplete"
  | "authentication_required"
  | "permission_denied"
  | "csrf_validation_failed"
  | "invalid_credentials"
  | "too_many_login_attempts"
  | "bootstrap_unavailable"
  | "last_administrator_required"
  | "ballot_already_recorded"
  | "ballot_not_found"
  | "ballot_voters_invalid"
  | "conflict"
  | "workspace_title_conflict"
  | "workspace_folder_conflict"
  | "workspace_folder_not_found"
  | "council_decision_not_found"
  | "council_member_not_found"
  | "council_term_not_configured"
  | "council_term_capacity_reached"
  | "council_term_capacity_below_active_count"
  | "contact_not_found"
  | "contact_archived"
  | "contact_already_active_council_member"
  | "contact_has_active_council_membership"
  | "upload_too_large"
  | "invalid_request"
  | "invalid_meeting_transition"
  | "meeting_not_found"
  | "meeting_officers_required"
  | "minutes_approval_required"
  | "meeting_roster_locked"
  | "network_unavailable"
  | "official_source_access_denied"
  | "official_source_invalid_response"
  | "official_source_unavailable"
  | "proxy_invalid"
  | "quorum_not_reached"
  | "request_too_large"
  | "request_failed"
  | "resource_content_unavailable"
  | "resource_preview_conversion_failed"
  | "resource_preview_conversion_unavailable"
  | "resource_preview_unavailable"
  | "resource_not_found"
  | "council_committee_not_found"
  | "committee_membership_not_found"
  | "route_not_found"
  | "attendance_not_found"
  | "council_business_not_found";

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly status: number,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

export class SirenCapabilityUnavailable extends Error {
  constructor(readonly capability: string) {
    super(`Siren capability is not available: ${capability}`);
    this.name = "SirenCapabilityUnavailable";
  }
}

export const AUTHENTICATION_REQUIRED_EVENT = "mairie:authentication-required";

export function apiPathFromHref(href: string): string {
  const url = new URL(href, window.location.origin);
  if (url.origin !== window.location.origin || !url.pathname.startsWith("/api")) {
    throw new SirenCapabilityUnavailable(href);
  }
  return `${url.pathname.slice(4)}${url.search}`;
}

const apiErrorCodes = new Set<ApiErrorCode>([
  "recusal_already_recorded",
  "recusal_recording_closed",
  "recusal_member_not_declared",
  "recused_member_cannot_participate",
  "recusal_immutable",
  "recusal_occurrence_locked",
  "agenda_ballot_required",
  "agenda_inconsistent",
  "agenda_item_not_found",
  "agenda_order_invalid",
  "agenda_sequence_invalid",
  "attendance_incomplete",
  "authentication_required",
  "permission_denied",
  "csrf_validation_failed",
  "invalid_credentials",
  "too_many_login_attempts",
  "bootstrap_unavailable",
  "last_administrator_required",
  "ballot_already_recorded",
  "ballot_not_found",
  "ballot_voters_invalid",
  "conflict",
  "workspace_title_conflict",
  "workspace_folder_conflict",
  "workspace_folder_not_found",
  "council_decision_not_found",
  "council_member_not_found",
  "council_term_not_configured",
  "council_term_capacity_reached",
  "council_term_capacity_below_active_count",
  "contact_not_found",
  "contact_archived",
  "contact_already_active_council_member",
  "contact_has_active_council_membership",
  "upload_too_large",
  "invalid_meeting_transition",
  "invalid_request",
  "meeting_not_found",
  "meeting_officers_required",
  "minutes_approval_required",
  "meeting_roster_locked",
  "network_unavailable",
  "official_source_access_denied",
  "official_source_invalid_response",
  "official_source_unavailable",
  "proxy_invalid",
  "quorum_not_reached",
  "request_too_large",
  "request_failed",
  "resource_content_unavailable",
  "resource_preview_conversion_failed",
  "resource_preview_conversion_unavailable",
  "resource_preview_unavailable",
  "resource_not_found",
  "council_committee_not_found",
  "committee_membership_not_found",
  "route_not_found",
  "attendance_not_found",
  "council_business_not_found",
]);

export function apiErrorCode(error: unknown): ApiErrorCode {
  return error instanceof ApiError ? error.code : "request_failed";
}

export async function apiResponse(path: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    const headers = new Headers(init?.headers);
    if (!headers.has("Accept")) headers.set("Accept", `${SIREN_MEDIA_TYPE}, ${PROBLEM_MEDIA_TYPE}`);
    if (!(init?.body instanceof FormData)) headers.set("Content-Type", "application/json");
    response = await fetch(`/api${path}`, {
      ...init,
      headers,
      credentials: "same-origin",
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
    if (code === "authentication_required") {
      representations.clear();
      window.dispatchEvent(new Event(AUTHENTICATION_REQUIRED_EVENT));
    }
    throw new ApiError(code, response.status);
  }
  return response;
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  return (await apiSirenRequest<T>(path, init)).data;
}

export interface SirenApiResult<T> {
  data: T;
  representation: SirenEntity<Record<string, unknown>> | null;
}

const representations = new Map<string, SirenEntity<Record<string, unknown>>>();

function cacheRepresentation(
  path: string,
  representation: SirenEntity<Record<string, unknown>>,
  cacheRequestPath: boolean,
): void {
  if (cacheRequestPath) representations.set(path.split("#", 1)[0], representation);
  const self = findSirenLink(representation, "self");
  if (self) representations.set(apiPathFromHref(self.href), representation);
}

export async function apiSirenRequest<T>(path: string, init?: RequestInit): Promise<SirenApiResult<T>> {
  const response = await apiResponse(path, init);
  const readRequest = !init?.method || init.method.toUpperCase() === "GET";
  if (response.status === 204) {
    representations.delete(path.split("#", 1)[0]);
    return { data: undefined as T, representation: null };
  }
  const payload = (await response.json()) as SirenEntity<Record<string, unknown>>;
  if (!response.headers.get("content-type")?.startsWith(SIREN_MEDIA_TYPE)) {
    return { data: payload as T, representation: null };
  }
  cacheRepresentation(path, payload, readRequest);
  return { data: sirenData<T>(payload), representation: payload };
}

export async function sirenRepresentation(path: string): Promise<SirenEntity<Record<string, unknown>>> {
  const normalized = path.split("#", 1)[0];
  const cached = representations.get(normalized);
  if (cached) return cached;
  const result = await apiSirenRequest<unknown>(normalized);
  if (!result.representation) throw new SirenCapabilityUnavailable(normalized);
  return result.representation;
}

export async function submitSirenActionAt<T>(
  resourcePath: string,
  name: ApiActionName,
  input?: unknown,
): Promise<SirenApiResult<T>> {
  return submitSirenAction<T>(await sirenRepresentation(resourcePath), name, input);
}

export function followSirenLink<T>(entity: SirenEntity, rel: string): Promise<SirenApiResult<T>> {
  const link = findSirenLink(entity, rel);
  if (!link) throw new SirenCapabilityUnavailable(rel);
  return apiSirenRequest<T>(apiPathFromHref(link.href));
}

export function submitSirenAction<T>(
  entity: SirenEntity,
  name: ApiActionName,
  input?: unknown,
): Promise<SirenApiResult<T>> {
  const action = findSirenAction(entity, name);
  if (!action) throw new SirenCapabilityUnavailable(name);
  const defaults = Object.fromEntries(
    (action.fields ?? []).filter((field) => field.value !== undefined).map((field) => [field.name, field.value]),
  );
  const body = input ?? (Object.keys(defaults).length > 0 ? defaults : undefined);
  const requestBody = body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body);
  return apiSirenRequest<T>(apiPathFromHref(action.href), {
    method: action.method ?? "GET",
    body: requestBody,
  });
}
