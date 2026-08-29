import assert from "node:assert/strict";
import test from "node:test";
import { normalizeForSearch, parseQuery, searchEntities } from "../src/lib/search.ts";

const corpus = [
  { kind: "member", id: "m1", label: "Élodie Marchand", extra: ["adjointe"] },
  { kind: "member", id: "m2", label: "Jean-Marc Baudry" },
  { kind: "resource", id: "r1", label: "Bilan des subventions 2025", folderPath: "finances/subventions" },
  { kind: "resource", id: "r2", label: "Critères d'attribution", folderPath: "finances/subventions" },
  { kind: "resource", id: "r3", label: "Plan de l'école", folderPath: "travaux/ecole" },
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

test("la normalisation ignore casse et accents", () => {
  assert.equal(normalizeForSearch("Délibération Budgétaire"), "deliberation budgetaire");
});

test("les accents ne comptent ni dans les termes ni dans les clés de facette", () => {
  const withAccents = searchEntities(corpus, "délib:budgétaire").results;
  const withoutAccents = searchEntities(corpus, "delib:budgetaire").results;
  assert.deepEqual(withAccents, withoutAccents);
  assert.equal(withAccents[0]?.id, "d1");
});

test("les alias directs restreignent le type", () => {
  const parsed = parseQuery("doc:subventions");
  assert.deepEqual(parsed.kinds, ["resource"]);
  assert.deepEqual(parsed.terms, ["subventions"]);
  const { results } = searchEntities(corpus, "doc:subventions");
  assert.deepEqual(
    results.map((entry) => entry.kind),
    ["resource"],
  );
});

test("une facette inconnue redevient un terme ordinaire", () => {
  assert.deepEqual(parseQuery("http://x machin:truc").terms, ["http://x", "machin:truc"]);
});

test("la facette dossier filtre par sous-arbre", () => {
  const { results } = searchEntities(corpus, "dossier:finances");
  assert.deepEqual(results.map((entry) => entry.id).sort(), ["b1", "r1", "r2"]);
});

test("la facette état filtre les entités qui possèdent un cycle de vie", () => {
  const { results } = searchEntities(corpus, "délib: state:adopted");
  assert.deepEqual(
    results.map((entry) => entry.id),
    ["d1"],
  );
});

test("plusieurs termes exigent que chacun corresponde", () => {
  assert.equal(searchEntities(corpus, "subventions bilan").results[0]?.id, "r1");
  assert.equal(searchEntities(corpus, "subventions préau").total, 0);
});

test("les champs secondaires comptent, mais moins que le libellé", () => {
  const { results } = searchEntities(corpus, "adjointe");
  assert.equal(results[0]?.id, "m1");
});

test("le contexte de dossier fait remonter les entités adjacentes", () => {
  const near = searchEntities(corpus, "", { context: "travaux/ecole" }).results;
  assert.deepEqual(
    near
      .slice(0, 2)
      .map((entry) => entry.id)
      .sort(),
    ["b2", "r3"],
  );
});

test("le total annonce les correspondances au-delà de la coupe", () => {
  const outcome = searchEntities(corpus, "", { limit: 3 });
  assert.equal(outcome.results.length, 3);
  assert.equal(outcome.total, corpus.length);
});
