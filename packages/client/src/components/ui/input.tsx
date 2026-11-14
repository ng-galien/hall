import type * as React from "react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { useI18n } from "../../i18n/I18nProvider";
import { HiddenIcon, VisibleIcon } from "../icons";
import { Button } from "./button";
import { useFieldControl, useFieldEmptyText } from "./field";

/** Text input; inside a Field it takes the field's label, help and « Non renseigné » when it is empty. */
function Input({ className, type, placeholder, ...props }: React.ComponentProps<"input">) {
  const empty = useFieldEmptyText();
  const control = useFieldControl(props);
  if (type === "password" && empty !== undefined)
    return <PasswordInput className={className} placeholder={placeholder ?? empty} {...control} />;
  return (
    <input
      type={type}
      data-slot="input"
      className={cn("hall-input", className)}
      placeholder={placeholder ?? empty}
      data-empty={type === "date" && props.value === "" ? "true" : undefined}
      {...control}
    />
  );
}

// @implements-requirement HALL-FR-USR-080
/**
 * A password of a Field, with the command at its right end that shows or hides what is typed. It is hidden again when
 * its form is sent; its autocomplete attribute is left to the caller, so that password managers keep filling it.
 */
function PasswordInput({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const form = toggle.current?.form;
    if (!form) return;
    const hide = () => setVisible(false);
    form.addEventListener("submit", hide);
    return () => form.removeEventListener("submit", hide);
  }, []);
  const testId = (props as { "data-testid"?: string })["data-testid"];
  return (
    <>
      <input
        type={visible ? "text" : "password"}
        data-slot="input"
        data-password-visibility={visible ? "visible" : "hidden"}
        className={cn("hall-input", className)}
        {...props}
      />
      <div className="hall-field-action">
        <Button
          ref={toggle}
          variant="plain"
          size="icon"
          data-testid={testId ? `${testId}-visibility` : "password-visibility"}
          aria-label={t(visible ? "auth.hidePassword" : "auth.showPassword")}
          aria-pressed={visible}
          aria-controls={props.id}
          disabled={props.disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <HiddenIcon /> : <VisibleIcon />}
        </Button>
      </div>
    </>
  );
}

export { Input };
