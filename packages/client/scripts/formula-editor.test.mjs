import assert from "node:assert/strict";
import test from "node:test";
import {
  activeReferenceAtCursor, canonicalSpreadsheetFormulaFunction, createSpreadsheetAutoFormula,
  coloredSpreadsheetFormulaReferences, createSpreadsheetAutoFormulas, detectAdjacentFormulaRange, insertSpreadsheetFormulaFunction,
  isSupportedSpreadsheetFormulaFunction, normalizeSpreadsheetFormulaForEngine, parseSpreadsheetFormula,
  resizeSpreadsheetFormulaReference,
  replaceReferenceAtCursor, replaceSpreadsheetFormulaReferenceAtIndex, spreadsheetFormulaAliasesFrench, spreadsheetFormulaCatalogVersion,
  spreadsheetFormulaEnglishOnly, spreadsheetFormulaFrenchAliasSource, spreadsheetFormulaFunctionCount,
  spreadsheetFormulaFunctions, spreadsheetFormulaNames, spreadsheetFormulaNamesByLocale, spreadsheetFormulaNamesIdenticalFrench,
  spreadsheetFormulaHelp, spreadsheetFormulaReferenceIndexForCell, spreadsheetFormulaReferences, spreadsheetFormulaSuggestions, tokenizeSpreadsheetFormula,
  spreadsheetFormulaMetadataMissing,
} from "../src/features/spreadsheet/formulaEditor.ts";

test("catalogue Formula Basic exhaustif et partition fr-FR traçable", () => {
  assert.equal(spreadsheetFormulaCatalogVersion, "@jspreadsheet/formula@2.0.2");
  assert.equal(spreadsheetFormulaFrenchAliasSource, "https://fr.excel-translator.de/fonctions/");
  assert.equal(spreadsheetFormulaFunctionCount, 390);
  assert.equal(Object.keys(spreadsheetFormulaAliasesFrench).length, 260);
  assert.equal(spreadsheetFormulaNamesIdenticalFrench.length, 80);
  assert.equal(spreadsheetFormulaEnglishOnly.length, 50);
  assert.equal(new Set(spreadsheetFormulaFunctions).size, spreadsheetFormulaFunctions.length);
  assert.deepEqual([...spreadsheetFormulaFunctions].sort(), [...spreadsheetFormulaFunctions]);
  const aliasTargets = new Set(Object.values(spreadsheetFormulaAliasesFrench));
  const identical = new Set(spreadsheetFormulaNamesIdenticalFrench);
  const englishOnly = new Set(spreadsheetFormulaEnglishOnly);
  for (const canonical of spreadsheetFormulaFunctions) {
    assert.equal(isSupportedSpreadsheetFormulaFunction(canonical.toLowerCase()), true);
    assert.equal(canonicalSpreadsheetFormulaFunction(canonical), canonical);
    assert.equal(aliasTargets.has(canonical) || identical.has(canonical) || englishOnly.has(canonical), true, canonical);
  }
  for (const [alias, canonical] of Object.entries(spreadsheetFormulaAliasesFrench)) {
    assert.equal(canonicalSpreadsheetFormulaFunction(alias.toLowerCase()), canonical);
    assert.equal(isSupportedSpreadsheetFormulaFunction(alias), true);
    assert.equal(normalizeSpreadsheetFormulaForEngine(`=${alias}(A1;A2)`, "fr"), `=${canonical}(A1,A2)`);
  }
  assert.equal(spreadsheetFormulaNames.length, spreadsheetFormulaFunctions.length + 260);
  assert.equal(spreadsheetFormulaNamesByLocale.en.length, 390);
  assert.equal(spreadsheetFormulaNamesByLocale.fr.length, 390);
  assert.equal(new Set(spreadsheetFormulaNamesByLocale.fr).size, 390);
  assert.ok(spreadsheetFormulaNamesByLocale.en.includes("SUM"));
  assert.ok(!spreadsheetFormulaNamesByLocale.en.includes("SOMME"));
  assert.ok(spreadsheetFormulaNamesByLocale.fr.includes("SOMME"));
  assert.ok(!spreadsheetFormulaNamesByLocale.fr.includes("SUM"));
  for (const stub of ["ACCRINTM", "DURATION", "ISFORMULA", "SHEETS", "VDB", "YIELD", "INCONNUE"])
    assert.equal(isSupportedSpreadsheetFormulaFunction(stub), false);
});

test("tokenisation conserve source, casse, offsets et familles de tokens", () => {
  const formula = '=Round($A$1:B2 * 1,5,"a""b";_nom)<=2<>3&4%5^6';
  const tokens = tokenizeSpreadsheetFormula(formula);
  assert.equal(tokens.map(({ text }) => text).join(""), formula);
  for (const token of tokens) assert.equal(formula.slice(token.start, token.end), token.text);
  assert.equal(tokens.find((token) => token.kind === "function")?.supported, true);
  assert.equal(tokenizeSpreadsheetFormula("=INCONNUE(A1)")[1].supported, false);
  assert.equal(tokenizeSpreadsheetFormula("=A1 + -B2").map(({ text }) => text).join(""), "=A1 + -B2");
  assert.equal(tokenizeSpreadsheetFormula('="non terminée')[1].kind, "string");
  assert.deepEqual(tokenizeSpreadsheetFormula(""), []);
  assert.equal(tokenizeSpreadsheetFormula("POSTE")[0].text, "POSTE");
});

test("normalisation moteur traduit fonctions et séparateurs hors chaînes", () => {
  assert.equal(normalizeSpreadsheetFormulaForEngine('=SOMME(A1;1,5;"a;b")', "fr"), '=SUM(A1,1.5,"a;b")');
  assert.equal(normalizeSpreadsheetFormulaForEngine("=SUM(1,5)", "en"), "=SUM(1,5)");
  assert.equal(normalizeSpreadsheetFormulaForEngine("texte", "fr"), "texte");
});

test("parseur léger couvre appels, groupes, séparateurs, opérateurs et diagnostics", () => {
  for (const formula of [
    "=ROUND(SUM(A1:B3)*2+(-C4),2)>=10", "=SOMME(A1;B2)", "=2^3^2", "=1<>2", "=1<=2",
    "=2>1", "=2<3", "=1&2", "=4/2", "=5%2", "=+1", "=-1", '="a""b"', "=(1+2)", "=FOO", "=A1",
  ]) assert.equal(parseSpreadsheetFormula(formula).formula, true);
  assert.equal(parseSpreadsheetFormula("texte").formula, false);
  assert.deepEqual(parseSpreadsheetFormula("").expression, null);
  assert.ok(parseSpreadsheetFormula("=SUM(A1:B2").errors.includes("Parenthèse fermante manquante"));
  assert.ok(parseSpreadsheetFormula("=A1+").errors.includes("Opérande droit manquant"));
  assert.ok(parseSpreadsheetFormula("=-").errors.includes("Opérande manquant"));
  assert.ok(parseSpreadsheetFormula("=A1:B").errors.includes("Référence de fin de plage manquante"));
  assert.ok(parseSpreadsheetFormula("=SUM(A1 B2)").errors.includes("Séparateur d’arguments attendu"));
  assert.ok(parseSpreadsheetFormula("=(1").errors.includes("Parenthèse fermante manquante"));
  assert.equal(parseSpreadsheetFormula("=()").expression, null);
  assert.ok(parseSpreadsheetFormula("=:").errors[0].startsWith("Élément inattendu"));
  assert.ok(parseSpreadsheetFormula("=1 2").errors.includes("Fin de formule inattendue"));
  assert.equal(parseSpreadsheetFormula("=UNKNOWN()").expression?.supported, false);
});

test("suggestions et insertion bilingues opèrent au curseur", () => {
  assert.deepEqual(spreadsheetFormulaSuggestions("texte", 5, "fr"), []);
  assert.deepEqual(spreadsheetFormulaSuggestions("=", 1, "fr"), []);
  assert.deepEqual(spreadsheetFormulaSuggestions("=RO", 3, "en", 2), ["ROMAN", "ROUND"]);
  assert.ok(spreadsheetFormulaSuggestions("=SO", 3, "fr").includes("SOMME"));
  assert.ok(spreadsheetFormulaSuggestions("=SU", 3, "en").includes("SUM"));
  assert.deepEqual(insertSpreadsheetFormulaFunction("=SU+1", 3, "SUM"), { value: "=SUM(+1", cursor: 5 });
  assert.deepEqual(insertSpreadsheetFormulaFunction("=1+", 3, "SOMME"), { value: "=1+SOMME(", cursor: 9 });
  assert.equal(spreadsheetFormulaHelp("SOMME", "fr").signature, "SOMME(nombre1; [nombre2]; …)");
  assert.equal(spreadsheetFormulaHelp("SUM", "en").source, "https://support.microsoft.com/en-us/excel/functions/sum-function");
  for (const name of ["AVERAGE", "COUNT", "MAX", "MIN"])
    for (const locale of ["fr", "en"]) assert.ok(spreadsheetFormulaHelp(name, locale).description);
  assert.equal(spreadsheetFormulaHelp("ABS", "en").description, "Returns the absolute value of a number.");
  assert.equal(spreadsheetFormulaHelp("ABS", "fr").description, null);
  assert.equal(spreadsheetFormulaHelp("ABS", "fr").signature, "ABS(x)");
  const missingHelp = new Set(spreadsheetFormulaMetadataMissing);
  assert.equal(missingHelp.size, 16);
  for (const name of spreadsheetFormulaFunctions)
    assert.equal(spreadsheetFormulaHelp(name, "en").source === null, missingHelp.has(name), name);
  assert.deepEqual(spreadsheetFormulaHelp("Z", "fr"), { name: "Z", signature: "Z(…)", description: null, source: null });
  assert.deepEqual(spreadsheetFormulaHelp("inconnue", "en"), { name: "INCONNUE", signature: "INCONNUE(…)", description: null, source: null });
});

test("références absolues, mixtes, plages, colonnes et lignes", () => {
  const value = "=SUM($A$1,B$2,$C3,D2:D4,A:A,2:5)";
  assert.deepEqual(spreadsheetFormulaReferences(value).map(({ text, kind }) => [text, kind]), [
    ["$A$1", "cell"], ["B$2", "cell"], ["$C3", "cell"], ["D2:D4", "cellRange"],
    ["A:A", "columnRange"], ["2:5", "rowRange"],
  ]);
  const range = activeReferenceAtCursor(value, value.indexOf("D2:D4") + 3);
  assert.equal(range?.text, "D2:D4");
  assert.equal(activeReferenceAtCursor(value, 1), null);
  assert.deepEqual(replaceReferenceAtCursor(value, range.start + 1, "e1:f9"), {
    value: value.replace("D2:D4", "E1:F9"), cursor: range.start + 5,
  });
  assert.deepEqual(replaceReferenceAtCursor("=SUM()", 5, "A1"), { value: "=SUM(A1)", cursor: 7 });
  assert.deepEqual(resizeSpreadsheetFormulaReference("=SUM(B2:B3)+SUM(C2:C3)", 0, "B4"), {
    value: "=SUM(B2:B4)+SUM(C2:C3)", cursor: 10,
  });
  assert.deepEqual(resizeSpreadsheetFormulaReference("=A1", 0, "A1"), { value: "=A1", cursor: 3 });
  assert.deepEqual(resizeSpreadsheetFormulaReference("=A1", 0, "C3"), { value: "=A1:C3", cursor: 6 });
  assert.deepEqual(resizeSpreadsheetFormulaReference("=A:C", 0, "D8"), { value: "=A:D", cursor: 4 });
  assert.deepEqual(resizeSpreadsheetFormulaReference("=2:5", 0, "D8"), { value: "=2:8", cursor: 4 });
  assert.deepEqual(resizeSpreadsheetFormulaReference("=1", 0, "D8"), { value: "=1", cursor: 2 });
  assert.equal(spreadsheetFormulaReferenceIndexForCell("=SOMME(E2)", "E2"), 0);
  assert.equal(spreadsheetFormulaReferenceIndexForCell("=SUM($C$4:$A$2)", "B3"), 0);
  assert.equal(spreadsheetFormulaReferenceIndexForCell("=SUM(C:A)", "B99"), 0);
  assert.equal(spreadsheetFormulaReferenceIndexForCell("=SUM(5:2)", "X3"), 0);
  assert.equal(spreadsheetFormulaReferenceIndexForCell("=SUM(E2)", "D2"), -1);
  assert.equal(spreadsheetFormulaReferenceIndexForCell("=SUM(E2)", "invalide"), -1);
  assert.deepEqual(replaceSpreadsheetFormulaReferenceAtIndex("=SOMME(E2)", 0, "e2:e4"), {
    value: "=SOMME(E2:E4)", cursor: 12,
  });
  assert.deepEqual(replaceSpreadsheetFormulaReferenceAtIndex("=SOMME(E2)", 2, "E2:E4"), {
    value: "=SOMME(E2)", cursor: 10,
  });
  assert.deepEqual(spreadsheetFormulaReferences("=DATA1+A1X+AA.2"), []);
  assert.deepEqual(spreadsheetFormulaReferences("=$A:$C+$2:$5").map(({ kind }) => kind), ["columnRange", "rowRange"]);
  const colored = coloredSpreadsheetFormulaReferences("=A1+B2+C3+D4+E5+F6+G7", 4);
  assert.deepEqual(colored.map(({ colorIndex }) => colorIndex), [0, 1, 2, 3, 4, 5, 0]);
  assert.deepEqual(colored.filter(({ active }) => active).map(({ text }) => text), ["B2"]);
});

test("Somme automatique détecte les plages numériques/formules contiguës", () => {
  const data = [
    ["Poste", "Montant", "Quantité", "Total HT"], ["A", 10, 2, "=B2*C2"],
    ["B", 20, 3, "=B3*C3"], ["C", 30, 4, "=B4*C4"], [null, null, null, null],
  ];
  assert.deepEqual(detectAdjacentFormulaRange(data, 3, 4), { left: 3, top: 1, right: 3, bottom: 3 });
  assert.deepEqual(detectAdjacentFormulaRange([[1, 2, null]], 2, 0), { left: 0, top: 0, right: 1, bottom: 0 });
  assert.deepEqual(detectAdjacentFormulaRange([[null, 1]], 0, 0), { left: 1, top: 0, right: 1, bottom: 0 });
  assert.deepEqual(detectAdjacentFormulaRange([[null], [1]], 0, 0), { left: 0, top: 1, right: 0, bottom: 1 });
  assert.equal(detectAdjacentFormulaRange([["Titre"]], 0, 0), null);
  assert.deepEqual(createSpreadsheetAutoFormula(data, { left: 3, top: 4, right: 3, bottom: 4 }, "sum", "fr"), {
    kind: "sum", target: { column: 3, row: 4 }, reference: "D2:D4", formula: "=SOMME(D2:D4)",
  });
  assert.deepEqual(createSpreadsheetAutoFormula(data, { left: 1, top: 1, right: 1, bottom: 3 }, "average", "en"), {
    kind: "average", target: { column: 1, row: 4 }, reference: "B2:B4", formula: "=AVERAGE(B2:B4)",
  });
  assert.equal(createSpreadsheetAutoFormula([], { left: 0, top: 0, right: 0, bottom: 0 }, "count", "fr").formula, "=NB()");
  assert.equal(createSpreadsheetAutoFormula(data, { left: 1, top: 1, right: 3, bottom: 1 }, "max", "fr").formula, "=MAX(B2:D2)");
  assert.equal(createSpreadsheetAutoFormula(data, { left: 3, top: 3, right: 1, bottom: 1 }, "min", "fr").formula, "=MIN(B2:D4)");
  assert.equal(createSpreadsheetAutoFormula([[1], [null]], { left: 0, top: 1, right: 0, bottom: 1 }, "sum", "en").reference, "A1");
});

test("Somme automatique produit un résultat par colonne pour des cellules vides", () => {
  const data = [[1, 10], [2, 20], [null, null]];
  const formulas = createSpreadsheetAutoFormulas(data, { left: 0, top: 2, right: 1, bottom: 2 }, "sum", "fr");
  assert.deepEqual(formulas.map(({ formula, target }) => [formula, target]), [
    ["=SOMME(A1:A2)", { column: 0, row: 2 }], ["=SOMME(B1:B2)", { column: 1, row: 2 }],
  ]);
  assert.equal(createSpreadsheetAutoFormulas([[1]], { left: 0, top: 0, right: 0, bottom: 0 }, "sum", "en").length, 1);
  assert.equal(createSpreadsheetAutoFormulas([[null, undefined, ""]], { left: 0, top: 0, right: 2, bottom: 0 }, "sum", "en").length, 3);
  assert.deepEqual(spreadsheetFormulaReferences("A1"), [{ text: "A1", start: 0, end: 2, kind: "cell" }]);
});

test("Somme automatique produit un total par série d'une plage de données rectangulaire", () => {
  const vertical = createSpreadsheetAutoFormulas([[1, 10], [2, 20], [3, 30]],
    { left: 0, top: 0, right: 1, bottom: 2 }, "sum", "fr");
  assert.deepEqual(vertical.map(({ formula, target }) => [formula, target]), [
    ["=SOMME(A1:A3)", { column: 0, row: 3 }], ["=SOMME(B1:B3)", { column: 1, row: 3 }],
  ]);
  const horizontal = createSpreadsheetAutoFormulas([[1, 2, 3], [10, 20, 30]],
    { left: 0, top: 0, right: 2, bottom: 1 }, "sum", "en");
  assert.deepEqual(horizontal.map(({ formula, target }) => [formula, target]), [
    ["=SUM(A1:C1)", { column: 3, row: 0 }], ["=SUM(A2:C2)", { column: 3, row: 1 }],
  ]);
});
