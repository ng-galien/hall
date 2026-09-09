import { useEffect, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { LinkIcon, SearchIcon } from "../../components/icons";
import { matchesQuery } from "../../components/Ui";
import {
  type DocumentaryLeafSummary,
  DocumentaryResourceGlyph,
  useDocumentaryResourceTypeLabel,
} from "../../features/documents/DocumentaryResourceGlyph";
import { useI18n } from "../../i18n/I18nProvider";

function PickerGroup({
  headingKey,
  resources,
  onPick,
}: {
  headingKey: "workspace.pickerInPath" | "workspace.pickerElsewhere";
  resources: DocumentaryLeafSummary[];
  onPick(resourceId: string): void;
}) {
  const { t } = useI18n();
  const typeLabel = useDocumentaryResourceTypeLabel();
  if (resources.length === 0) return null;
  return (
    <div className="resource-picker-group">
      <span className="workspace-list-heading">{t(headingKey)}</span>
      {resources.map((resource) => (
        <button
          className="resource-picker-row"
          data-testid={`resource-picker-item-${resource.id}`}
          type="button"
          key={resource.id}
          onClick={() => onPick(resource.id)}
        >
          <DocumentaryResourceGlyph resource={resource} />
          <span className="workspace-row-copy">
            <strong>{resource.name}</strong>
            <span>
              {typeLabel(resource)}
              {resource.path ? ` · ${resource.path}` : ""}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** Resource picker: search, with current-folder suggestions first. */
export function ResourcePicker({
  suggestions,
  others,
  disabled,
  onPick,
  compact = false,
  open: controlledOpen,
  onOpenChange,
}: {
  suggestions: DocumentaryLeafSummary[];
  others: DocumentaryLeafSummary[];
  disabled?: boolean;
  compact?: boolean;
  open?: boolean;
  onOpenChange?(open: boolean): void;
  onPick(resourceId: string): void;
}) {
  const { t } = useI18n();
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = (value: boolean) => {
    setLocalOpen(value);
    onOpenChange?.(value);
  };
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) searchInput.current?.focus();
  }, [open]);

  const filter = (resources: DocumentaryLeafSummary[]) =>
    resources.filter((resource) => matchesQuery(query, resource.name, resource.path, resource.tags.join(" ")));
  const visibleSuggestions = filter(suggestions);
  const visibleOthers = filter(others);
  const empty = visibleSuggestions.length === 0 && visibleOthers.length === 0;

  const pick = (resourceId: string) => {
    setOpen(false);
    setQuery("");
    onPick(resourceId);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          data-testid="resource-picker-open"
          variant={compact ? "ghost" : "outline"}
          size={compact ? "icon-xs" : "default"}
          aria-label={t("workspace.addResource")}
          disabled={disabled || (suggestions.length === 0 && others.length === 0)}
          aria-expanded={open}
        >
          <LinkIcon />
          {compact ? null : t("workspace.addResource")}
        </Button>
      </PopoverTrigger>
      {open ? (
        <>
          <PopoverContent
            className="resource-picker-panel"
            align="end"
            side="bottom"
            data-testid="resource-picker-panel"
            aria-label={t("workspace.addResource")}
          >
            <div className="workspace-search">
              <SearchIcon aria-hidden="true" />
              <input
                ref={searchInput}
                data-testid="resource-picker-search"
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
          </PopoverContent>
        </>
      ) : null}
    </Popover>
  );
}
