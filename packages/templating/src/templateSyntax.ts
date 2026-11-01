/** Existing Markdown templates remain readable until explicitly converted. */
export function isJinjaTemplate(source: string): boolean {
  return /\{[{%]|\{#[\s\S]*?#\}/.test(source);
}
