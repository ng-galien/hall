import { type KeyboardEvent, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { CloseIcon } from "./icons";

/**
 * Le champ de tags commun : des pastilles, une saisie légère.
 *
 * Entrée ou virgule pose la pastille, Retour arrière sur champ vide reprend la dernière.
 * Autonome et réutilisable : tout écran qui tague passe par ici, jamais par un champ texte
 * à virgules.
 */
export function TagInput({
  value,
  onChange,
  readOnly = false,
  label,
}: {
  value: string[];
  onChange(next: string[]): void;
  readOnly?: boolean;
  /** Nom accessible du champ de saisie. */
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
    /* Une étiquette englobante : cliquer le cadre donne le focus au champ, sans script. */
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
