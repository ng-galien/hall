import { type ReactNode, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { comparePaths } from "../../lib/names";
import { CheckIcon, CloseIcon } from "../icons";
import { Button } from "../ui/button";
import { Sheet } from "../ui/sheet";
import type { FacetSuggestion } from "./facetSuggestions";

type Facet = FacetSuggestion["facet"];

/**
 * The filters of a search on a phone: under the field, a flow of marks. Each active filter is a mark that a
 * touch removes; each criterion (type, folder, tag, state) is a mark that opens its values in a sheet from the
 * bottom, where a touch adds or removes a value and closes the sheet.
 */
// @implements-requirement HALL-FR-SRC-030
export function PhoneSearchFilters<K extends string, S extends string>({
  testId,
  labels,
  groups,
  active,
  onToggle,
  glyph,
}: {
  testId: string;
  labels: Record<Facet, string>;
  groups: { category: Facet; values: FacetSuggestion<K, S>[] }[];
  active: FacetSuggestion<K, S>[];
  onToggle(facet: FacetSuggestion<K, S>, remove: boolean): void;
  /** Icon of a value, the type icon of the document lists for a type. */
  glyph(facet: FacetSuggestion<K, S>): ReactNode;
}) {
  const { t } = useI18n();
  const [opened, setOpened] = useState<Facet | null>(null);
  const isActive = (f: FacetSuggestion<K, S>) => active.some((x) => x.facet === f.facet && x.value === f.value);
  const group = groups.find((entry) => entry.category === opened);
  const values =
    group?.category === "folder"
      ? [...group.values].sort((left, right) => comparePaths(left.value, right.value))
      : (group?.values ?? []);
  if (!groups.length && !active.length) return null;
  return (
    <>
      <div
        className="searchbox-filter-bar"
        role="toolbar"
        aria-label={t("search.addFilter")}
        data-testid={`${testId}-filter-bar`}
        data-layout-flow="true"
      >
        {active.map((f) => (
          <Button
            variant="plain"
            key={`${f.facet}:${f.value}`}
            className="searchbox-filter-mark"
            data-active="true"
            data-testid={`${testId}-remove-${f.facet}-${f.value}`}
            aria-label={`${t("common.delete")} ${labels[f.facet]} ${f.label}`}
            title={`${labels[f.facet]} : ${f.label}`}
            onClick={() => onToggle(f, true)}
          >
            {glyph(f)}
            <span>{f.label}</span>
            <CloseIcon aria-hidden="true" />
          </Button>
        ))}
        {groups.map((entry) => (
          <Button
            variant="plain"
            key={entry.category}
            className="searchbox-filter-mark"
            data-testid={`${testId}-filter-category-${entry.category}`}
            aria-haspopup="dialog"
            aria-expanded={opened === entry.category}
            onClick={() => setOpened(entry.category)}
          >
            <span>{labels[entry.category]}</span>
          </Button>
        ))}
      </div>
      <Sheet
        open={opened !== null}
        onOpenChange={(open) => {
          if (!open) setOpened(null);
        }}
        side="bottom"
        title={opened ? labels[opened] : ""}
        testId={`${testId}-filters`}
        closeTestId={`${testId}-filters-close`}
        className="searchbox-filter-sheet"
      >
        <div role="listbox" aria-label={opened ? labels[opened] : undefined} aria-multiselectable="true">
          {values.map((f) => {
            const selected = isActive(f);
            const depth = f.facet === "folder" ? f.value.split("/").length - 1 : 0;
            return (
              <Button
                variant="plain"
                role="option"
                key={`${f.facet}:${f.value}`}
                aria-selected={selected}
                className="searchbox-filter-value"
                data-testid={`${testId}-filter-${f.facet}-${f.value}`}
                aria-label={f.facet === "folder" ? f.value : undefined}
                style={
                  depth
                    ? { paddingInlineStart: `calc(var(--hall-space-4) + ${depth} * var(--hall-space-4))` }
                    : undefined
                }
                onClick={() => {
                  onToggle(f, selected);
                  setOpened(null);
                }}
              >
                {glyph(f)}
                <span className="searchbox-filter-value-label">
                  {f.facet === "folder" ? f.value.split("/").at(-1) : f.label}
                </span>
                {f.count !== undefined ? <span className="searchbox-filter-value-count">{f.count}</span> : null}
                <span className="searchbox-filter-value-check" aria-hidden="true">
                  {selected ? <CheckIcon /> : null}
                </span>
              </Button>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}
