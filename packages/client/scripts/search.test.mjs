import assert from "node:assert/strict";
import test from "node:test";
import { normalizeForSearch, parseQuery, searchEntities } from "../src/lib/search.ts";

const corpus = [
  { kind: "member", id: "m1", label: "Élodie Marchand", extra: ["adjointe"] },
  { kind: "member", id: "m2", label: "Jean-Marc Baudry" },
  { kind: "resource", id: "r1", label: "Bilan des subventions 2025", folderPath: "finances/subventions" },
  { kind: "resource", id: "r2", label: "Critères d'attribution", folderPath: "finances/subventions" },
  { kind: "resource", id: "r3", label: "Plan de l'école", folderPath: "travaux/ecole", media: "image" },
  {
    kind: "councilBusiness",
    id: "b1",
    label: "Subventions aux associations",
    folderPath: "finances/subventions",
  },
  { kind: "councilBusiness", id: "b2", label: "Réfection du préau", folderPath: "travaux/ecole" },
  { kind: "meeting", id: "s1", label: "Séance de septembre", extra: ["2026-09"] },
  { kind: "decision", id: "d1", label: "Délibération budgétaire", extra: ["2026-014"], state: "adopted" },
];

test("normalization ignores case and accents", () => {
  assert.equal(normalizeForSearch("Délibération Budgétaire"), "deliberation budgetaire");
});

test("accents count neither in terms nor in facet keys", () => {
  const withAccents = searchEntities(corpus, "délib:budgétaire").results;
  const withoutAccents = searchEntities(corpus, "delib:budgetaire").results;
  assert.deepEqual(withAccents, withoutAccents);
  assert.equal(withAccents[0]?.id, "d1");
});

test("direct aliases restrict the kind", () => {
  const parsed = parseQuery("doc:subventions");
  assert.deepEqual(parsed.kinds, ["resource"]);
  assert.deepEqual(parsed.terms, ["subventions"]);
  const { results } = searchEntities(corpus, "doc:subventions");
  assert.deepEqual(
    results.map((entry) => entry.kind),
    ["resource"],
  );
});

test("the image shortcut targets archived images only", () => {
  const parsed = parseQuery("image");
  assert.deepEqual(parsed.kinds, ["resource"]);
  assert.deepEqual(parsed.media, ["image"]);
  assert.deepEqual(
    searchEntities(corpus, "image").results.map((entry) => entry.id),
    ["r3"],
  );
  assert.deepEqual(
    searchEntities(corpus, "image:école").results.map((entry) => entry.id),
    ["r3"],
  );
});

test("an unknown facet falls back to a plain term", () => {
  assert.deepEqual(parseQuery("http://x machin:truc").terms, ["http://x", "machin:truc"]);
});

test("the folder facet filters by subtree", () => {
  const { results } = searchEntities(corpus, "dossier:finances");
  assert.deepEqual(results.map((entry) => entry.id).sort(), ["b1", "r1", "r2"]);
});

test("the state facet filters entities that have a lifecycle", () => {
  const { results } = searchEntities(corpus, "délib: state:adopted");
  assert.deepEqual(
    results.map((entry) => entry.id),
    ["d1"],
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
