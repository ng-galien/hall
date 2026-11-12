import { HelpHint } from "../../components/HelpHint";
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
  const { t } = useI18n();
  return (
    <div className="checkbox-group">
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={value}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.checked)}
          data-testid="user-temporary-password"
        />
        {t("users.temporaryPassword")}
        <HelpHint text={t("users.temporaryPasswordDescription")} />
      </label>
    </div>
  );
}
