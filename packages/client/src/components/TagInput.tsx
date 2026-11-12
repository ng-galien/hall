import { type KeyboardEvent, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { CloseIcon } from "./icons";
import { Button } from "./ui/button";
import { Field } from "./ui/field";
import { Input } from "./ui/input";

/** Tag field: Enter or comma commits a tag, Backspace on an empty draft removes the last one. */
export function TagInput({
  value,
  onChange,
  readOnly = false,
  label,
}: {
  value: string[];
  onChange(next: string[]): void;
  readOnly?: boolean;
  /** Label written inside the field. */
  label: string;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");

  const commit = () => {
    const tag = draft.trim().replace(/,+$/, "").trim();
    setDraft("");
    if (!tag || value.includes(tag)) return;
    onChange([...value, tag]);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commit();
    } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <Field label={label} className="tag-input">
      <div className="tag-input-row hall-field-composite">
        {value.map((tag) =>
          readOnly ? (
            <span className="tag-input-tag" key={tag}>
              {tag}
            </span>
          ) : (
            <Button
              key={tag}
              variant="secondary"
              aria-label={`${t("common.cancel")} ${tag}`}
              onClick={() => onChange(value.filter((candidate) => candidate !== tag))}
            >
              {tag}
              <CloseIcon aria-hidden="true" />
            </Button>
          ),
        )}
        <Input
          type="text"
          data-testid="tag-input-draft"
          value={draft}
          readOnly={readOnly}
          placeholder={value.length === 0 ? t("common.notFilled") : ""}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={readOnly ? undefined : onKeyDown}
          onBlur={readOnly ? undefined : commit}
        />
      </div>
    </Field>
  );
}
