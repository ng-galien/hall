import assert from "node:assert/strict";
import test from "node:test";
import { normalizeForSearch, searchEntities } from "../src/lib/search.ts";

const corpus = [
  { kind: "member", id: "m1", label: "Élodie Marchand", extra: ["adjointe"] },
  { kind: "member", id: "m2", label: "Jean-Marc Baudry" },
  {
    kind: "resource",
    id: "r1",
    label: "Bilan des subventions 2025",
    folderPath: "finances/subventions",
    tags: ["budget"],
  },
  { kind: "resource", id: "r2", label: "Critères d'attribution", folderPath: "finances/subventions" },
  { kind: "resource", id: "r3", label: "Plan de l'école", folderPath: "travaux/ecole", media: "image" },
  {
    kind: "councilBusiness",
    id: "b1",
    label: "Subventions aux associations",
    folderPath: "finances/subventions",
  },
  { kind: "councilBusiness", id: "b2", label: "Réfection du préau", folderPath: "travaux/ecole" },
  { kind: "meeting", id: "s1", label: "Séance de septembre", extra: ["2026-09"], state: "scheduled" },
  { kind: "decision", id: "d1", label: "Délibération budgétaire", extra: ["2026-014"], state: "adopted" },
];

test("normalization ignores case and accents", () => {
  assert.equal(normalizeForSearch("Délibération Budgétaire"), "deliberation budgetaire");
});

test("accents do not affect text terms", () => {
  const withAccents = searchEntities(corpus, "budgétaire").results;
  const withoutAccents = searchEntities(corpus, "budgetaire").results;
  assert.deepEqual(withAccents, withoutAccents);
  assert.equal(withAccents[0]?.id, "d1");
});

test("structured facets restrict the kind", () => {
  const { results } = searchEntities(corpus, "subventions", { kinds: ["resource"] });
  assert.deepEqual(
    results.map((entry) => entry.kind),
    ["resource"],
  );
});

test("colon aliases are plain text rather than a second facet language", () => {
  assert.equal(searchEntities(corpus, "doc:subventions").total, 0);
});

test("the structured image facet targets images only", () => {
  assert.deepEqual(
    searchEntities(corpus, "", { media: ["image"] }).results.map((entry) => entry.id),
    ["r3"],
  );
});

test("the structured state facet targets the persisted lifecycle state", () => {
  assert.deepEqual(
    searchEntities(corpus, "", { states: ["adopted"] }).results.map((entry) => entry.id),
    ["d1"],
  );
});

test("a trailing hash fragment is reserved for structured facet completion", () => {
  assert.deepEqual(
    searchEntities(corpus, "subventions #dos").results.map((entry) => entry.id),
    searchEntities(corpus, "subventions").results.map((entry) => entry.id),
  );
});

test("the structured folder facet filters by subtree", () => {
  const { results } = searchEntities(corpus, "", { folders: ["finances"] });
  assert.deepEqual(results.map((entry) => entry.id).sort(), ["b1", "r1", "r2"]);
});

test("the structured tag facet filters resources", () => {
  const { results } = searchEntities(corpus, "", { tags: ["budget"] });
  assert.deepEqual(
    results.map((entry) => entry.id),
    ["r1"],
  );
});

test("several terms require every one to match", () => {
  assert.equal(searchEntities(corpus, "subventions bilan").results[0]?.id, "r1");
  assert.equal(searchEntities(corpus, "subventions préau").total, 0);
});

test("secondary fields count, but less than the label", () => {
  const { results } = searchEntities(corpus, "adjointe");
  assert.equal(results[0]?.id, "m1");
});

test("folder context lifts adjacent entities", () => {
  const near = searchEntities(corpus, "", { context: "travaux/ecole" }).results;
  assert.deepEqual(
    near
      .slice(0, 2)
      .map((entry) => entry.id)
      .sort(),
    ["b2", "r3"],
  );
});

test("the total reports matches beyond the cut", () => {
  const outcome = searchEntities(corpus, "", { limit: 3 });
  assert.equal(outcome.results.length, 3);
  assert.equal(outcome.total, corpus.length);
});
