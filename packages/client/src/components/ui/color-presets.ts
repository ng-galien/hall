import type { ColorPickerPreset } from "./color-picker";

type ColorLabelKey =
  | "geographic.color.blue"
  | "geographic.color.lightBlue"
  | "geographic.color.green"
  | "geographic.color.violet"
  | "geographic.color.red"
  | "geographic.color.gray"
  | "geographic.color.black";

function cssToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** The colour swatches offered by every colour picker, read from the charter tokens of the current theme. */
export function standardColorPresets(t: (key: ColorLabelKey) => string): ColorPickerPreset[] {
  return [
    { value: cssToken("--hall-color-brand"), label: t("geographic.color.blue") },
    { value: cssToken("--hall-color-nature-data"), label: t("geographic.color.lightBlue") },
    { value: cssToken("--hall-color-success"), label: t("geographic.color.green") },
    { value: cssToken("--hall-color-nature-visual"), label: t("geographic.color.violet") },
    { value: cssToken("--hall-color-danger"), label: t("geographic.color.red") },
    { value: cssToken("--hall-color-text-muted"), label: t("geographic.color.gray") },
    { value: cssToken("--hall-color-text"), label: t("geographic.color.black") },
  ];
}
