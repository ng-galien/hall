import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LinkIcon } from "../../components/icons";
import { ResourceSearch } from "../../components/search/ResourceSearch";
import type { DocumentaryLeafSummary } from "../../features/documents/DocumentaryResourceGlyph";
import { resourceMentionable } from "../../hooks/useReferenceMentionables";
import { useI18n } from "../../i18n/I18nProvider";

/** Resource picker: search, with current-folder suggestions first. */
export function ResourcePicker({
  suggestions,
  others,
  excludedIds = [],
  context,
  disabled,
  onPick,
  compact = false,
  open: controlledOpen,
  onOpenChange,
}: {
  suggestions: DocumentaryLeafSummary[];
  others: DocumentaryLeafSummary[];
  excludedIds?: string[];
  context?: string;
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
  const pick = (resourceId: string) => {
    setOpen(false);
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
          disabled={disabled}
          aria-expanded={open}
        >
          <LinkIcon />
          {compact ? null : t("workspace.addResource")}
        </Button>
      </PopoverTrigger>
      {open ? (
        <PopoverContent
          className="resource-picker-panel max-h-(--radix-popover-content-available-height) w-(--hall-size-resource-picker) p-(--hall-space-3)"
          align="end"
          collisionPadding={16}
          side="bottom"
          data-testid="resource-picker-panel"
          aria-label={t("workspace.addResource")}
        >
          <ResourceSearch
            testId="resource-picker-search"
            scope={{ types: ["resource"], excludedIds, context }}
            items={[...suggestions, ...others].map((resource) => ({
              ...resourceMentionable(resource, t),
              preferred: suggestions.some((item) => item.id === resource.id),
            }))}
            onPick={(item) => pick(item.id)}
            onClose={() => setOpen(false)}
          />
        </PopoverContent>
      ) : null}
    </Popover>
  );
}
