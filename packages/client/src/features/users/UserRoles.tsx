import type { ApiRole } from "@hall/api-contract";
import { RequestErrorBanner } from "../../components/Ui";
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
  const { roles, loading, error } = useRoleOptions();
  return (
    <fieldset className="checkbox-group" disabled={disabled}>
      <legend>{t("users.roles")}</legend>
      <RequestErrorBanner error={error} />
      {loading && roles.length === 0 && <p>{t("common.loading")}</p>}
      {roles.map(({ id: role, name }) => (
        <label className="checkbox-field" key={role}>
          <input
            type="checkbox"
            data-testid={`user-role-${role}`}
            checked={value.includes(role)}
            onChange={(event) =>
              onChange(event.currentTarget.checked ? [...value, role] : value.filter((entry) => entry !== role))
            }
          />
          {name}
        </label>
      ))}
    </fieldset>
  );
}
