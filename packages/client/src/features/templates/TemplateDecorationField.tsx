import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageIcon } from "../../components/icons";
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

const attribute = (value: string) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

/**
 * The header or footer of a PDF template: the HTML fragment the PDF engine prints on every page, and a button that
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
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const insert = async (file: File) => {
    if (!["image/jpeg", "image/png"].includes(file.type)) return setProblem(t("templates.imageType"));
    if (file.size > maximumImageBytes) return setProblem(t("templates.imageTooLarge"));
    setProblem(null);
    const image = `<img src="${await dataUrl(file)}" alt="${attribute(file.name)}" style="width:35mm">`;
    onChange(value.trim() ? `${image}\n${value}` : image);
  };
  return (
    <div className="grid gap-1.5" data-testid={testId}>
      <div className="template-decoration-heading">
        <Label htmlFor={id}>{label}</Label>
        {readOnly ? null : (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid={`${testId}-insert-image`}
              onClick={() => input.current?.click()}
            >
              <ImageIcon aria-hidden="true" />
              {t("templates.insertImage")}
            </Button>
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
          </>
        )}
      </div>
      <Textarea
        id={id}
        className="template-decoration-source"
        spellCheck={false}
        readOnly={readOnly}
        value={value}
        data-testid={`${testId}-source`}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <p className="text-xs text-muted">{t("templates.decorationHelp")}</p>
      {problem ? (
        <p role="alert" className="form-error" data-testid={`${testId}-problem`}>
          {problem}
        </p>
      ) : null}
    </div>
  );
}
