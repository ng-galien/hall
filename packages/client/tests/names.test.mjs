import assert from "node:assert/strict";
import { test } from "vitest";
import { compareNameParts, compareNames, comparePaths, personSortNames, sortByName } from "../src/lib/names.ts";
import { searchEntities } from "../src/lib/search.ts";

const ordered = (names) => [...names].sort(compareNames);

// @verifies-requirement HALL-FR-WSP-500
test("names compare in French with accents and case ignored", () => {
  assert.deepEqual(ordered(["Forêt", "école", "Éclairage public", "Bâtiments", "associations"]), [
    "associations",
    "Bâtiments",
    "Éclairage public",
    "école",
    "Forêt",
  ]);
  assert.equal(compareNames("Été", "ete"), 0);
  assert.equal(compareNames("RAPPORT", "rapport"), 0);
});

// @verifies-requirement HALL-FR-WSP-500
test("numbers in names keep their natural order", () => {
  assert.deepEqual(ordered(["Point 10", "Point 2", "Point 1", "Point 21"]), [
    "Point 1",
    "Point 2",
    "Point 10",
    "Point 21",
  ]);
  assert.deepEqual(ordered(["Devis 10", "devis 9"]), ["devis 9", "Devis 10"]);
});

// @verifies-requirement HALL-FR-WSP-500
test("folder paths compare segment by segment, each as a name", () => {
  assert.deepEqual(["Voirie/Chemins", "Voirie", "Écoles/Cantine", "Conseil 10", "Conseil 2"].sort(comparePaths), [
    "Conseil 2",
    "Conseil 10",
    "Écoles/Cantine",
    "Voirie",
    "Voirie/Chemins",
  ]);
});

// @verifies-requirement HALL-FR-WSP-500
test("items with names that compare equal are ordered by identifier, whatever their arrival order", () => {
  const items = [
    { id: "c", name: "Rapport" },
    { id: "a", name: "rapport" },
    { id: "b", name: "Avis" },
    { id: "d", name: "RAPPORT" },
  ];
  const expected = ["b", "a", "c", "d"];
  for (const arrival of [items, [...items].reverse(), [items[2], items[3], items[0], items[1]]]) {
    assert.deepEqual(
      sortByName(
        arrival,
        (item) => item.name,
        (item) => item.id,
      ).map((item) => item.id),
      expected,
    );
  }
});

// @verifies-requirement HALL-FR-WSP-500
test("people are ranked by family name, then given name, in the pickers as in every name order", () => {
  const people = [
    { id: "1", firstName: "Anne", lastName: "Vidal" },
    { id: "2", firstName: "Zoé", lastName: "Ébrard" },
    { id: "3", firstName: "Bruno", lastName: "Martin" },
    { id: "4", firstName: "Alice", lastName: "martin" },
  ];
  assert.deepEqual(
    [...people].sort((left, right) => compareNameParts(personSortNames(left), personSortNames(right))).map((p) => p.id),
    ["2", "4", "3", "1"],
  );
  const candidates = people.map((person) => ({
    kind: "member",
    id: person.id,
    label: `${person.firstName} ${person.lastName}`,
    sortNames: personSortNames(person),
  }));
  for (const arrival of [candidates, [...candidates].reverse()]) {
    assert.deepEqual(
      searchEntities(arrival, "").results.map((item) => item.id),
      ["2", "4", "3", "1"],
    );
  }
});
