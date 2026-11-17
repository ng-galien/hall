import type { ApiRole } from "@hall/api-contract";
import { useEffect, useState } from "react";
import type { TranslationKey } from "../../i18n/en";
import { getSessionSiren } from "../../services/authApi";
import { getUserSiren } from "../../services/usersApi";

export interface SignedInAccount {
  displayName: string;
  /** The sign-in address; null until the account is read. */
  email: string | null;
  roles: ApiRole[];
}

/** Label of each role of an account. */
export const roleLabels: Record<ApiRole, TranslationKey> = {
  administrator: "users.role.administrator",
  clerk: "users.role.clerk",
  contributor: "users.role.contributor",
  councillor: "role.councillor",
};

/** The name, the roles and the sign-in address of the person signed in; null until the session is read. */
export function useSignedInAccount(): SignedInAccount | null {
  const [account, setAccount] = useState<SignedInAccount | null>(null);
  useEffect(() => {
    let active = true;
    void getSessionSiren()
      .then(async ({ data: principal }) => {
        if (!active) return;
        setAccount({ displayName: principal.displayName, email: null, roles: principal.roles });
        const { data: user } = await getUserSiren(principal.id);
        if (active) setAccount({ displayName: user.displayName, email: user.email, roles: user.roles });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return account;
}
