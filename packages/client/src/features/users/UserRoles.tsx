import type { ApiRole } from "@hall/api-contract";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { RequestErrorBanner } from "../../components/Ui";
import { useI18n } from "../../i18n/I18nProvider";
import { useRoleOptions } from "../authorization/useRoleOptions";

// @implements-requirement HALL-FR-USR-110
/** Presents the roles the Siren action offers; a role it does not offer keeps its current state in the value. */
export function UserRoles({
  value,
  offered,
  onChange,
  disabled = false,
}: {
  value: ApiRole[];
  offered: readonly string[];
  onChange(value: ApiRole[]): void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const { roles: options, loading, error } = useRoleOptions();
  const roles = options.filter((role) => offered.includes(role.id));
  return (
    <fieldset className="checkbox-group" disabled={disabled}>
      <legend>{t("users.roles")}</legend>
      <RequestErrorBanner error={error} />
      {loading && roles.length === 0 && <LoadingIndicator size="zone" label={t("common.loading")} />}
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
