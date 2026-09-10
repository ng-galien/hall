import { useId, useState } from "react";
import { Input } from "./input";

/** Searchable single-choice input; the host owns the selected values. */
export function Autocomplete({
  options,
  onSelect,
  label,
  placeholder,
  testId,
}: {
  options: { value: string; label: string }[];
  onSelect(value: string): void;
  label: string;
  placeholder: string;
  testId: string;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const normalize = (text: string) =>
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase();
  const filtered = options.filter((option) => normalize(option.label).includes(normalize(query.trim())));
  const choose = (value: string) => {
    onSelect(value);
    setQuery("");
    setActive(0);
    setOpen(false);
  };
  return (
    <div className="relative">
      <Input
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={open && filtered.length > 0}
        aria-controls={id}
        aria-activedescendant={open && filtered[active] ? `${id}-${active}` : undefined}
        autoComplete="off"
        placeholder={placeholder}
        data-testid={testId}
        value={query}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActive((index) =>
              Math.max(0, Math.min(filtered.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))),
            );
          } else if (event.key === "Enter" && open) {
            event.preventDefault();
            if (filtered[active]) choose(filtered[active].value);
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {open && filtered.length > 0 && (
        <div
          id={id}
          role="listbox"
          aria-label={label}
          className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {filtered.map((option, index) => (
            <button
              type="button"
              tabIndex={-1}
              key={option.value}
              id={`${id}-${index}`}
              role="option"
              aria-selected={active === index}
              data-testid={`${testId}-option-${option.value}`}
              className={`block w-full cursor-pointer text-left rounded-sm px-3 py-2 text-sm ${active === index ? "bg-accent text-accent-foreground" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseMove={() => setActive(index)}
              onClick={() => choose(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
