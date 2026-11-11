import type { ApiRole, ApiUser } from "@hall/api-contract";
import { AUTHENTICATION_REQUIRED_EVENT, apiSirenRequest, submitSirenAction, submitSirenActionAt } from "./apiClient";
import { getSession } from "./authApi";

export const USER_ACCESS_CHANGED_EVENT = "hall:user-access-changed";

export const listUsersSiren = () => apiSirenRequest<ApiUser[]>("/users");
export const getUserSiren = (id: string) => apiSirenRequest<ApiUser>(`/users/${id}`);
export const createUser = (input: Record<string, unknown>) =>
  submitSirenActionAt<ApiUser>("/users", "user.create", input);
export const assignUserRoles = (id: string, roles: ApiRole[]) =>
  getUserSiren(id).then(({ representation }) => {
    if (!representation) throw new Error("Missing user Siren representation");
    return submitSirenAction<ApiUser>(representation, "user.assign-role", { roles }).then(() => {
      window.dispatchEvent(new Event(USER_ACCESS_CHANGED_EVENT));
      return getUserSiren(id);
    });
  });
export const disableUser = (id: string) =>
  getUserSiren(id).then(({ representation }) => {
    if (!representation) throw new Error("Missing user Siren representation");
    return submitSirenAction<ApiUser>(representation, "user.disable", {}).then((result) => {
      window.dispatchEvent(new Event(USER_ACCESS_CHANGED_EVENT));
      return result;
    });
  });

export const updateUser = (id: string, input: Record<string, unknown>) =>
  getUserSiren(id).then(({ representation }) => {
    if (!representation) throw new Error("Missing user Siren representation");
    return submitSirenAction<ApiUser>(representation, "user.update", input);
  });

export async function resetUserPassword(
  id: string,
  newPassword: string,
  passwordChangeRequired?: boolean,
): Promise<void> {
  const session = await getSession();
  const user = await getUserSiren(id);
  if (!user.representation) throw new Error("Missing user Siren representation");
  await submitSirenAction(user.representation, "user.reset-password", { newPassword, passwordChangeRequired });
  if (session.id === id) window.dispatchEvent(new Event(AUTHENTICATION_REQUIRED_EVENT));
}

export const generatePassphrase = () =>
  submitSirenActionAt<{ passphrase: string }>("/users", "user.generate-passphrase", {}).then(
    (result) => result.data.passphrase,
  );

export const revokeUserAccess = (id: string) =>
  getUserSiren(id).then(({ representation }) => {
    if (!representation) throw new Error("Missing user Siren representation");
    return submitSirenAction<ApiUser>(representation, "user.revoke-access", {}).then((result) => {
      window.dispatchEvent(new Event(USER_ACCESS_CHANGED_EVENT));
      return result;
    });
  });

export const reactivateUser = (id: string) =>
  getUserSiren(id).then(({ representation }) => {
    if (!representation) throw new Error("Missing user Siren representation");
    return submitSirenAction<ApiUser & { passphrase: string }>(representation, "user.reactivate", {});
  });
