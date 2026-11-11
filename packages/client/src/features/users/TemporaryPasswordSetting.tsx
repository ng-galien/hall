import { useId } from "react";
import { Label } from "../../components/ui/label";
import { useI18n } from "../../i18n/I18nProvider";

// @implements-requirement HALL-FR-USR-070
export function TemporaryPasswordSetting({
  value,
  disabled,
  onChange,
}: {
  value: boolean;
  disabled?: boolean;
  onChange(value: boolean): void;
}) {
  const id = useId();
  const { t } = useI18n();
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="checkbox"
          checked={value}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.checked)}
          data-testid="user-temporary-password"
        />
        <Label htmlFor={id}>{t("users.temporaryPassword")}</Label>
      </div>
      <p className="text-sm text-muted-foreground">{t("users.temporaryPasswordDescription")}</p>
    </div>
  );
}
