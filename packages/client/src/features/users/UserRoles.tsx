import { type ApiRole, apiRoles } from "@hall/api-contract";
import { useId } from "react";
import { Label } from "../../components/ui/label";
import { useI18n } from "../../i18n/I18nProvider";

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
  return (
    <fieldset className="grid gap-3" disabled={disabled}>
      <legend className="mb-3 text-sm font-medium">{t("users.roles")}</legend>
      {apiRoles.map((role) => (
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
          <Label htmlFor={`${id}-${role}`}>{t(`users.role.${role}`)}</Label>
        </div>
      ))}
    </fieldset>
  );
}
