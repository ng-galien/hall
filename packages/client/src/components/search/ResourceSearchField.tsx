import { useState } from "react";
import type { ResourceSearchScope } from "../../features/search/useResourceSearch";
import type { Mentionable } from "../editor/references";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { ResourceSearch } from "./ResourceSearch";

// @implements-requirement HALL-FR-SRC-030
export function ResourceSearchField({
  testId,
  label,
  scope,
  onPick,
  disabled = false,
  onClear,
  clearLabel,
}: {
  testId: string;
  label: string;
  scope: ResourceSearchScope;
  onPick(item: Mentionable): void;
  disabled?: boolean;
  onClear?(): void;
  clearLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start"
          data-testid={testId}
          disabled={disabled}
        >
          {label}
        </Button>
      </PopoverTrigger>
      {open && (
        <PopoverContent className="shared-search-field-panel" align="start">
          <ResourceSearch
            testId={`${testId}-search`}
            scope={scope}
            onPick={(item) => {
              onPick(item);
              setOpen(false);
            }}
            onClose={() => setOpen(false)}
          />
          {onClear && (
            <Button
              type="button"
              variant="ghost"
              data-testid={`${testId}-none`}
              onClick={() => {
                onClear();
                setOpen(false);
              }}
            >
              {clearLabel}
            </Button>
          )}
        </PopoverContent>
      )}
    </Popover>
  );
}
