import { type ApiPrincipal, findSirenAction } from "@hall/api-contract";
import { AUTHENTICATION_REQUIRED_EVENT, apiSirenRequest, submitSirenAction } from "./apiClient";

export interface AuthenticationStatus {
  bootstrapRequired: boolean;
  bootstrapAllowed: boolean;
  bootstrapTokenRequired: boolean;
  developmentAccess: boolean;
}

export async function getAuthenticationStatus() {
  return apiSirenRequest<AuthenticationStatus>("/auth/status");
}

export async function getSession(): Promise<ApiPrincipal> {
  return (await apiSirenRequest<ApiPrincipal>("/auth/session")).data;
}

export async function canLogout(): Promise<boolean> {
  const session = await apiSirenRequest<ApiPrincipal>("/auth/session");
  return Boolean(session.representation && findSirenAction(session.representation, "session.logout"));
}

export async function logout(): Promise<boolean> {
  const session = await apiSirenRequest<ApiPrincipal>("/auth/session");
  if (!session.representation || !findSirenAction(session.representation, "session.logout")) return false;
  await submitSirenAction(session.representation, "session.logout");
  window.dispatchEvent(new Event(AUTHENTICATION_REQUIRED_EVENT));
  return true;
}

export async function authenticate(
  statusRepresentation: NonNullable<Awaited<ReturnType<typeof getAuthenticationStatus>>["representation"]>,
  input: { email: string; password: string; displayName?: string; setupToken?: string },
): Promise<ApiPrincipal> {
  const actionName = input.displayName ? "user.create" : "session.login";
  return (await submitSirenAction<ApiPrincipal>(statusRepresentation, actionName, input)).data;
}

export const getSessionSiren = () => apiSirenRequest<ApiPrincipal>("/auth/session");

export async function changePassword(input: { currentPassword?: string; newPassword: string }): Promise<void> {
  const session = await getSessionSiren();
  if (!session.representation) throw new Error("Missing session Siren representation");
  await submitSirenAction(session.representation, "session.change-password", input);
  window.dispatchEvent(new Event(AUTHENTICATION_REQUIRED_EVENT));
}
