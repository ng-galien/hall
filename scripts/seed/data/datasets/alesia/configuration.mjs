/** Presentation examples belong to Alésia, never to production defaults. */
export const alesiaMailPresentation = {
  outboundEmailSignatureMarkdown: "**Le secrétariat du conseil de l’oppidum d’Alésia**\n\nsecretariat@alesia.example",
  outboundEmailFooterMarkdown: "*Démonstration Hall : commune, personnes et coordonnées fictives.*",
};
export const alesiaPdfPresentation = {
  headerHtml: "ALÉSIA · Conseil de l’oppidum · Démonstration",
  footerHtml: "Démonstration Hall · Données fictives · :page-number / :page-count",
  stylesheet:
    "body { font-family: Arial, sans-serif; color: #18263c; font-size: 11pt; line-height: 1.4; } h1, h2 { color: #102a83; break-after: avoid; } table { width: 100%; border-collapse: collapse; } th, td { padding: 4px; border-bottom: 1px solid #bbb; text-align: left; }",
};
const pdfTypes = new Set([
  "meeting-notice",
  "minutes",
  "council-decision",
  "deliberation-list",
  "document-print",
  "meeting-dossier-cover",
  "meeting-dossier-point",
]);
const empty = (value) => value === null || value === undefined || (typeof value === "string" && !value.trim());

/** Add examples only to empty presentation fields, keeping all existing data and customizations. */
export async function enrichAlesiaConfiguration({ get, put }) {
  const settings = await get("/settings");
  if (settings.name !== "Alésia") throw new Error("This enrichment requires the existing Alésia demonstration dataset");
  const settingsPatch = Object.fromEntries(
    Object.entries(alesiaMailPresentation).filter(([key]) => empty(settings[key])),
  );
  if (Object.keys(settingsPatch).length) await put("/settings", { ...settings, ...settingsPatch });
  let templatesUpdated = 0;
  for (const template of await get("/templates")) {
    if (template.kind !== "pdf" || !pdfTypes.has(template.documentType)) continue;
    const patch = Object.fromEntries(Object.entries(alesiaPdfPresentation).filter(([key]) => empty(template[key])));
    if (!Object.keys(patch).length) continue;
    await put(`/templates/${template.id}`, { ...template, ...patch });
    templatesUpdated += 1;
  }
  return { settingsFields: Object.keys(settingsPatch), templatesUpdated };
}
