/**
 * Records the official text of the twelve articles of the general code of local authorities cited by the
 * Foncine-le-Bas dataset, so that the loader creates them without Légifrance credentials or connection.
 *
 *   SEED_API=http://127.0.0.1:<port>/api node scripts/seed/fetch-foncine-le-bas-legal-references.mjs
 *
 * SEED_API is a Hall server with development access and Légifrance credentials, on a disposable database:
 * each article is chosen by the official search of Hall and resolved there, its resolved document is written to
 * the dataset files, and the temporary reference is deleted.
 */
import { writeFileSync } from "node:fs";
import { createSeedApi } from "./data/common/api.mjs";
import { legalArticles } from "./data/datasets/foncine-le-bas/legal-references.mjs";

const api = createSeedApi((process.env.SEED_API ?? "").replace(/\/$/, ""));
const folder = "Références récupérées";
const references = [];
for (const article of legalArticles) {
  const title = `Code général des collectivités territoriales, article ${article}`;
  const match = (await api.post("/resources/legal-references/search", { query: article, effectiveAt: null })).find(
    (candidate) => candidate.citationLabel === article && candidate.title === title,
  );
  if (!match) throw new Error(`Article ${article} introuvable par la recherche officielle`);
  const draft = await api.createWorkspaceResource({ kind: "legalReference", name: title, path: folder });
  await api.post(`/resources/${draft.id}/legal-reference/resolve`, {
    title,
    provider: match.provider,
    referenceKind: match.referenceKind,
    fund: match.fund,
    versionId: match.versionId,
    effectiveAt: match.effectiveAt,
  });
  const resolved = await api.get(`/resources/${draft.id}`);
  references.push({ article, title, document: resolved.document });
  await api.remove(`/resources/${draft.id}`);
  console.log(`  ${title} : ${resolved.document.versionId}, ${resolved.document.legalStatus}`);
}
const output = new URL("./data/datasets/foncine-le-bas/files/legal-references.json", import.meta.url);
writeFileSync(
  output,
  `${JSON.stringify(
    {
      source: "Légifrance, API PISTE, Code général des collectivités territoriales",
      license: "Licence Ouverte 2.0",
      retrievedAt: references[0]?.document.fetchedAt ?? null,
      references,
    },
    null,
    1,
  )}\n`,
);
console.log(`${references.length} références enregistrées dans ${output.pathname}`);
