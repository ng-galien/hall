import { defaultDocumentTemplates } from "@hall/domain";
import { daysFromNow } from "../../common/dates.mjs";
import { seedBusinesses } from "./businesses.mjs";
import { foncinePdfPresentation, seedDirectory, termStartedOn } from "./directory.mjs";
import { seedResources } from "./resources.mjs";

/** PDF models that carry the page header and footer of the dataset; the minutes keep the default model. */
const pdfTypes = new Set([
  "meeting-notice",
  "council-decision",
  "deliberation-list",
  "attendance-sheet",
  "proxy-form",
  "document-print",
  "meeting-dossier-cover",
  "meeting-dossier-point",
]);

async function seedTemplates({ get, post, put }, logo) {
  console.log("- Modèles de documents");
  const existing = await get("/templates");
  for (const template of defaultDocumentTemplates) {
    if (!existing.some((entry) => entry.documentType === template.documentType && entry.kind === template.kind))
      await post("/templates", template);
  }
  for (const template of await get("/templates")) {
    if (template.kind !== "pdf" || !pdfTypes.has(template.documentType)) continue;
    const bodyMarkdown =
      template.documentType === "meeting-notice"
        ? `::image[Logo de démonstration]{#${logo.id} align="left" width="25"}\n\n${template.bodyMarkdown}`
        : template.bodyMarkdown;
    await put(`/templates/${template.id}`, { ...template, ...foncinePdfPresentation, bodyMarkdown });
  }
}

/** The earliest meeting of the scenarios is held 91 days before the load, after the installation of the council. */
function assertLoadAfterInstallation() {
  if (daysFromNow(-91).slice(0, 10) <= termStartedOn) {
    throw new Error(
      `Le jeu Foncine-le-Bas se charge au plus tôt 92 jours après l’installation du conseil (${termStartedOn}).`,
    );
  }
}

export async function seedFoncineLeBas(api, { password }) {
  assertLoadAfterInstallation();
  const directory = await seedDirectory(api, { password });
  const { businesses, subjects } = await seedBusinesses(api, { committees: directory.committees });
  const seeded = await seedResources(api, { daysFromNow, password, businesses, ...directory });
  const logo = (await api.get("/resources/catalog")).find((resource) => resource.name === "Logo de démonstration");
  await seedTemplates(api, logo);
  return {
    members: directory.members,
    contacts: directory.contacts,
    subjects,
    proxies: seeded.resources.proxies,
    meetingLocation: "Salle du conseil, mairie",
  };
}
