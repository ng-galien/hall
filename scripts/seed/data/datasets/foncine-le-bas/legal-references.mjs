import { readFileSync } from "node:fs";

/** Articles of the general code of local authorities cited by the dataset, recorded in `files/legal-references.json`. */
export const legalArticles = [
  "L2121-2",
  "L2121-10",
  "L2121-11",
  "L2121-14",
  "L2121-15",
  "L2121-17",
  "L2121-20",
  "L2121-21",
  "L2131-1",
  "L2131-11",
  "L1111-10",
  "L2212-2",
];

/**
 * Creates each recorded article as an official reference: a draft that receives the resolved document recorded
 * from Légifrance by `scripts/seed/fetch-foncine-le-bas-legal-references.mjs`. No call reaches Légifrance; a
 * person with credentials updates the reference from its screen as any other one.
 */
export async function seedLegalReferences(api, path) {
  const recorded = JSON.parse(readFileSync(new URL("./files/legal-references.json", import.meta.url), "utf8"));
  const references = {};
  for (const article of legalArticles) {
    const entry = recorded.references.find((reference) => reference.article === article);
    if (!entry) throw new Error(`Article ${article} absent de files/legal-references.json`);
    const draft = await api.createWorkspaceResource({ kind: "legalReference", name: entry.title, path }, ["droit"]);
    references[article] = await api.put(`/resources/${draft.id}/content`, {
      kind: "legalReference",
      expectedVersion: (await api.get(`/resources/${draft.id}`)).version,
      document: entry.document,
    });
  }
  return references;
}
