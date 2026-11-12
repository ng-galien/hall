import type { ReferenceEntityKind } from "@hall/domain";
import { useState } from "react";
import { ResourceSearchField } from "./ResourceSearchField";

/** Form adapter: caller-owned candidates determine admissibility, never search behavior. */
// @implements-requirement HALL-FR-SRC-030
export function EntitySelect({
  type,
  options,
  value: controlled,
  defaultValue = "",
  onValueChange,
  name,
  placeholder,
  testId,
  disabled = false,
  clearLabel,
}: {
  type: Exclude<ReferenceEntityKind, "resource">;
  options: readonly { value: string; label: string }[];
  value?: string;
  defaultValue?: string;
  onValueChange?(value: string): void;
  name?: string;
  /** Text shown while nothing is chosen, when it says more than « Non renseigné ». */
  placeholder?: string;
  testId: string;
  disabled?: boolean;
  clearLabel?: string;
}) {
  const [local, setLocal] = useState(defaultValue);
  const value = controlled ?? local;
  const choose = (id: string) => {
    setLocal(id);
    onValueChange?.(id);
  };
  return (
    <>
      {name && <input type="hidden" name={name} value={value} />}
      <ResourceSearchField
        testId={testId}
        label={options.find((option) => option.value === value)?.label ?? placeholder ?? ""}
        scope={{ types: [type], includedIds: options.map((option) => option.value) }}
        disabled={disabled}
        onPick={(item) => choose(item.id)}
        onClear={clearLabel ? () => choose("") : undefined}
        clearLabel={clearLabel}
      />
    </>
  );
}
