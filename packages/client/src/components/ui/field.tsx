import { type ComponentProps, createContext, type ReactNode, useContext, useId } from "react";
import { ChevronDownIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

type FieldControl = { id: string; describedBy?: string; invalid: boolean };
const FieldContext = createContext<FieldControl | null>(null);

/**
 * The single form field of Hall (choice 12D): a filled, underlined field whose label is written small inside it,
 * with its help under it. The control inside (Input, Textarea, SelectTrigger, a picker) takes its id from the field.
 * @implements-requirement HALL-FR-LAY-140
 */
export function Field({
  label,
  help,
  error,
  htmlFor,
  className,
  testId,
  children,
}: {
  label: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  /** Identifier of a control that sets its own id; the field generates one otherwise. */
  htmlFor?: string;
  className?: string;
  testId?: string;
  children: ReactNode;
}) {
  const generated = useId();
  const id = htmlFor ?? generated;
  const noteId = help || error ? `${id}-note` : undefined;
  return (
    <div className={cn("hall-field-block", className)} data-slot="field" data-testid={testId}>
      <div className="hall-field" data-invalid={error ? "true" : undefined}>
        <label className="hall-field-label" htmlFor={id}>
          {label}
        </label>
        <FieldContext.Provider value={{ id, describedBy: noteId, invalid: Boolean(error) }}>
          {children}
        </FieldContext.Provider>
      </div>
      {error ? (
        <p id={noteId} className="hall-field-note" data-tone="danger" role="alert">
          {error}
        </p>
      ) : help ? (
        <p id={noteId} className="hall-field-note">
          {help}
        </p>
      ) : null}
    </div>
  );
}

/** Fields that go together share one row when the width allows it. */
export function FieldRow({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("hall-field-row", className)} data-slot="field-row">
      {children}
    </div>
  );
}

/** Identifier and description a control receives from its surrounding Field. */
export function useFieldControl<T extends { id?: string; "aria-describedby"?: string; "aria-invalid"?: unknown }>(
  props: T,
): T {
  const field = useContext(FieldContext);
  if (!field) return props;
  return {
    ...props,
    id: props.id ?? field.id,
    "aria-describedby": props["aria-describedby"] ?? field.describedBy,
    "aria-invalid": props["aria-invalid"] ?? (field.invalid || undefined),
  };
}

/** A control of a Field that opens a picker, drawn like the text of the field with a chevron at its end. */
export function FieldPicker({ className, children, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      data-slot="field-picker"
      className={cn("hall-input hall-select-trigger", className)}
      {...useFieldControl(props)}
    >
      <span className="hall-field-picker-value">{children}</span>
      <ChevronDownIcon className="hall-select-chevron" aria-hidden="true" />
    </button>
  );
}
