import { type KeyboardEvent, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { CloseIcon } from "./icons";

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
  /** Accessible name for the text input. */
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
    <label className={`tag-input${readOnly ? " tag-input-readonly" : ""}`}>
      {value.map((tag) => (
        <span className="tag-chip" key={tag}>
          {tag}
          {readOnly ? null : (
            <button
              type="button"
              aria-label={`${t("common.cancel")} ${tag}`}
              onClick={() => onChange(value.filter((candidate) => candidate !== tag))}
            >
              <CloseIcon />
            </button>
          )}
        </span>
      ))}
      <input
        type="text"
        value={draft}
        readOnly={readOnly}
        aria-label={label}
        placeholder={!readOnly && value.length === 0 ? t("workspace.addTag") : ""}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={readOnly ? undefined : onKeyDown}
        onBlur={readOnly ? undefined : commit}
      />
    </label>
  );
}
