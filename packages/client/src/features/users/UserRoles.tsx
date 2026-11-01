import type { ApiRole } from "@hall/api-contract";
import { useId } from "react";
import { RequestErrorBanner } from "../../components/Ui";
import { Label } from "../../components/ui/label";
import { useI18n } from "../../i18n/I18nProvider";
import { useRoleOptions } from "../authorization/useRoleOptions";

export function UserRoles({
  value,
  onChange,
  disabled = false,
}: {
  value: ApiRole[];
  onChange(value: ApiRole[]): void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const id = useId();
  const { roles, loading, error } = useRoleOptions();
  return (
    <fieldset className="grid gap-3" disabled={disabled}>
      <legend className="mb-3 text-sm font-medium">{t("users.roles")}</legend>
      <RequestErrorBanner error={error} />
      {loading && roles.length === 0 && <p>{t("common.loading")}</p>}
      {roles.map(({ id: role, name }) => (
        <div className="flex items-center gap-2" key={role}>
          <input
            id={`${id}-${role}`}
            type="checkbox"
            data-testid={`user-role-${role}`}
            checked={value.includes(role)}
            onChange={(event) =>
              onChange(event.currentTarget.checked ? [...value, role] : value.filter((entry) => entry !== role))
            }
          />
          <Label htmlFor={`${id}-${role}`}>{name}</Label>
        </div>
      ))}
    </fieldset>
  );
}
