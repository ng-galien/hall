import type { Resource } from "@hall/domain";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AddIcon, SearchIcon } from "../../components/icons";
import { matchesQuery } from "../../components/Ui";
import { ResourceGlyph, useResourceTypeLabel } from "../../features/documents/ResourceGlyph";
import { useI18n } from "../../i18n/I18nProvider";

function PickerGroup({
  headingKey,
  resources,
  onPick,
}: {
  headingKey: "workspace.pickerInPath" | "workspace.pickerElsewhere";
  resources: Resource[];
  onPick(resourceId: string): void;
}) {
  const { t } = useI18n();
  const typeLabel = useResourceTypeLabel();
  if (resources.length === 0) return null;
  return (
    <div className="resource-picker-group">
      <span className="workspace-list-heading">{t(headingKey)}</span>
      {resources.map((resource) => (
        <button className="resource-picker-row" type="button" key={resource.id} onClick={() => onPick(resource.id)}>
          <ResourceGlyph resource={resource} />
          <span className="workspace-row-copy">
            <strong>{resource.title}</strong>
            <span>
              {typeLabel(resource)}
              {resource.folderPath ? ` · ${resource.folderPath}` : ""}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** Sélecteur de ressource : recherche, suggestions du dossier courant en tête. */
export function ResourcePicker({
  suggestions,
  others,
  disabled,
  onPick,
}: {
  suggestions: Resource[];
  others: Resource[];
  disabled?: boolean;
  onPick(resourceId: string): void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filter = (resources: Resource[]) =>
    resources.filter((resource) => matchesQuery(query, resource.title, resource.folderPath, resource.tags.join(" ")));
  const visibleSuggestions = filter(suggestions);
  const visibleOthers = filter(others);
  const empty = visibleSuggestions.length === 0 && visibleOthers.length === 0;

  const pick = (resourceId: string) => {
    setOpen(false);
    setQuery("");
    onPick(resourceId);
  };

  return (
    <div className="resource-picker">
      <Button
        variant="outline"
        disabled={disabled || (suggestions.length === 0 && others.length === 0)}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <AddIcon />
        {t("workspace.addResource")}
      </Button>
      {open ? (
        <>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: voile de fermeture à la souris ; le clavier ferme via Échap sur le panneau */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: idem — l'équivalent clavier est Échap, géré sur le panneau focalisé */}
          <div className="resource-picker-backdrop" onClick={() => setOpen(false)} />
          <div
            className="resource-picker-panel"
            role="dialog"
            aria-label={t("workspace.addResource")}
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
            }}
          >
            <div className="workspace-search">
              <SearchIcon aria-hidden="true" />
              <input
                // biome-ignore lint/a11y/noAutofocus: le panneau s'ouvre à la demande, le focus suit l'intention
                autoFocus
                type="search"
                value={query}
                placeholder={t("workspace.pickerSearch")}
                aria-label={t("common.search")}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="resource-picker-groups">
              {empty ? (
                <p className="workspace-list-empty">{t("workspace.pickerEmpty")}</p>
              ) : (
                <>
                  <PickerGroup headingKey="workspace.pickerInPath" resources={visibleSuggestions} onPick={pick} />
                  <PickerGroup headingKey="workspace.pickerElsewhere" resources={visibleOthers} onPick={pick} />
                </>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
