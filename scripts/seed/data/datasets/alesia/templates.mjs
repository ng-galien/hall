import { defaultDocumentTemplates } from "@hall/domain";
import { enrichAlesiaConfiguration } from "./configuration.mjs";

export async function seedTemplates({ post, get, put }) {
  console.log("- Templates PDF et Outlook");
  const existing = await get("/templates");
  for (const template of defaultDocumentTemplates) {
    if (!existing.some((entry) => entry.documentType === template.documentType && entry.kind === template.kind))
      await post("/templates", template);
  }
  await enrichAlesiaConfiguration({ get, put });
}
