import { type ComponentProps, createContext, type ReactNode, useContext, useId } from "react";
import { ChevronDownIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { useI18n } from "../../i18n/I18nProvider";

type FieldControl = { id: string; describedBy?: string; invalid: boolean };
const FieldContext = createContext<FieldControl | null>(null);

/**
 * The single form field of Hall (reference design, page 5): no fill, a rule under its value, its label written small
 * above the value, its help under it. An empty field writes « Non renseigné », never a value. The control inside
 * (Input, Textarea, SelectTrigger, FieldPicker, FieldValue) takes its id from the field.
 * @implements-requirement HALL-FR-LAY-140
 */
export function Field({
  label,
  help,
  error,
  htmlFor,
  className,
  testId,
  action,
  labelAction,
  variant,
  children,
}: {
  label: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  /** Identifier of a control that sets its own id; the field generates one otherwise. */
  htmlFor?: string;
  className?: string;
  testId?: string;
  /** A control at the end of the field, such as the call of a number or a message to an address. */
  action?: ReactNode;
  /** A command written at the right end of the label line, above the field, such as « Insérer une image ». */
  labelAction?: ReactNode;
  /** `code`: a source text, framed, in monospace, one line per source line, its label above the frame. */
  variant?: "code";
  children: ReactNode;
}) {
  const generated = useId();
  const id = htmlFor ?? generated;
  const noteId = help || error ? `${id}-note` : undefined;
  return (
    <div className={cn("hall-field-block", className)} data-slot="field" data-testid={testId}>
      <div
        className="hall-field"
        data-invalid={error ? "true" : undefined}
        data-action={action ? "true" : undefined}
        data-variant={variant}
        data-label-action={labelAction ? "true" : undefined}
      >
        {labelAction ? (
          <div className="hall-field-head">
            <label className="hall-field-label" htmlFor={id}>
              {label}
            </label>
            {labelAction}
          </div>
        ) : (
          <label className="hall-field-label" htmlFor={id}>
            {label}
          </label>
        )}
        <FieldContext.Provider value={{ id, describedBy: noteId, invalid: Boolean(error) }}>
          {children}
        </FieldContext.Provider>
        {action ? <div className="hall-field-action">{action}</div> : null}
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

/** The text an empty control of a Field shows in place of a value; none outside a Field. */
export function useFieldEmptyText(): string | undefined {
  const field = useContext(FieldContext);
  const { t } = useI18n();
  return field ? t("common.notFilled") : undefined;
}

const isEmpty = (value: ReactNode) => value === null || value === undefined || value === false || value === "";

/** « Non renseigné » in place of an empty value. */
function EmptyValue() {
  const { t } = useI18n();
  return <span className="hall-field-empty">{t("common.notFilled")}</span>;
}

/** The value of a Field that the person may read but not change; « Non renseigné » when it is empty. */
export function FieldValue({ className, children, ...props }: ComponentProps<"span">) {
  return (
    <span className={cn("hall-input hall-field-value", className)} {...props}>
      {isEmpty(children) ? <EmptyValue /> : children}
    </span>
  );
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
      <span className="hall-field-picker-value">{isEmpty(children) ? <EmptyValue /> : children}</span>
      <ChevronDownIcon className="hall-select-chevron" aria-hidden="true" />
    </button>
  );
}
