import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "../../i18n/I18nProvider";

const maximumImageBytes = 60 * 1024;

function dataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const imageLabel = (value: string) => value.replaceAll(/([\\[\]])/g, "\\$1");

/**
 * The header or footer of a PDF template: editable Markdown/Jinja printed on every page, and a button that
 * places a JPEG or PNG image in it, embedded so that the template carries its own logo.
 */
// @implements-requirement HALL-FR-DOC-580
export function TemplateDecorationField({
  label,
  value,
  readOnly,
  testId,
  onChange,
}: {
  label: string;
  value: string;
  readOnly: boolean;
  testId: string;
  onChange(value: string): void;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const insert = async (file: File) => {
    if (!["image/jpeg", "image/png"].includes(file.type)) return setProblem(t("templates.imageType"));
    if (file.size > maximumImageBytes) return setProblem(t("templates.imageTooLarge"));
    setProblem(null);
    const image = `![${imageLabel(file.name)}](${await dataUrl(file)})`;
    onChange(value.trim() ? `${image}\n\n${value}` : image);
  };
  return (
    <div className="template-decoration" data-testid={testId}>
      {readOnly ? null : (
        <input
          ref={input}
          hidden
          type="file"
          accept="image/jpeg,image/png"
          data-testid={`${testId}-image-file`}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void insert(file);
          }}
        />
      )}
      <Field
        label={label}
        help={t("templates.decorationHelp")}
        error={problem ? <span data-testid={`${testId}-problem`}>{problem}</span> : undefined}
        labelAction={
          readOnly ? undefined : (
            <Button
              type="button"
              variant="secondary"
              data-testid={`${testId}-insert-image`}
              onClick={() => input.current?.click()}
            >
              {t("templates.insertImage")}
            </Button>
          )
        }
      >
        <Textarea
          className="template-decoration-source"
          spellCheck={false}
          readOnly={readOnly}
          value={value}
          data-testid={`${testId}-source`}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </Field>
    </div>
  );
}
