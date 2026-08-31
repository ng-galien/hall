import { expect, test } from "../fixtures/application";
import type { Page } from "@playwright/test";
import {
  spreadsheetFormulaMetadataMissing,
  spreadsheetFormulaNamesByLocale,
} from "../../src/features/spreadsheet/formulaEditor";

async function createSpreadsheetInSeed(page: Page, title: string) {
  await page.goto("/app/workspace?path=seed");
  await page.getByTestId("workspace-tree-root").click({ button: "right" });
  await page.getByTestId("workspace-tree-create").press("ArrowRight");
  await page.getByTestId("workspace-tree-create-spreadsheet").press("Enter");
  const creationInput = page.getByTestId("workspace-tree-create-input");
  await creationInput.fill(title);
  await creationInput.press("Enter");
  const createdResource = page.locator('[data-testid^="workspace-resource-open-"]:focus');
  await expect(createdResource).toBeVisible();
  const testId = await createdResource.getAttribute("data-testid");
  if (!testId) throw new Error("The created spreadsheet has no functional identifier");
  await createdResource.dblclick();
  await expect(page.getByTestId("spreadsheet-editor")).toBeVisible();
  await expect(page.getByTestId("spreadsheet-cell-address")).toHaveValue("A1");
  return testId.replace("workspace-resource-open-", "");
}

async function setSpreadsheetColumnFormat(page: Page, resourceId: string, column: number, format: "currency") {
  await page.evaluate(async ({ id, columnIndex, columnFormat }) => {
    const detailsResponse = await fetch(`/api/resources/${id}`, { headers: { Accept: "application/json" } });
    if (!detailsResponse.ok) throw new Error(`Unable to load spreadsheet setup: ${detailsResponse.status}`);
    const representation = await detailsResponse.json();
    const details = representation.properties;
    details.spreadsheet.columns[columnIndex].format = columnFormat;
    const updateResponse = await fetch(`/api/resources/${id}/spreadsheet`, {
      method: "PUT",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ document: details.spreadsheet, expectedVersion: details.resource.version }),
    });
    if (!updateResponse.ok) throw new Error(`Unable to update spreadsheet setup: ${updateResponse.status}`);
  }, { id: resourceId, columnIndex: column, columnFormat: format });
  await page.reload();
  await expect(page.getByTestId("spreadsheet-editor")).toBeVisible();
  await expect(page.getByTestId("spreadsheet-cell-address")).toHaveValue("A1");
}

async function editSpreadsheetCell(page: Page, column: number, row: number, value: string) {
  const formulaInput = page.getByTestId("spreadsheet-formula-input");
  await page.getByTestId(`spreadsheet-cell-${column}-${row}`).click();
  await formulaInput.click();
  await formulaInput.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await formulaInput.pressSequentially(value);
  await formulaInput.press("Enter");
  await page.getByTestId(`spreadsheet-cell-${column}-${row}`).click();
  await expect(formulaInput).toHaveValue(value);
}

async function useFrenchInterface(page: Page) {
  await page.goto("/app/settings");
  await page.getByTestId("settings-language").click();
  await page.getByTestId("settings-language-fr").click();
}

async function useEnglishInterface(page: Page) {
  await page.goto("/app/settings");
  await page.getByTestId("settings-language").click();
  await page.getByTestId("settings-language-en").click();
}

async function createSpreadsheetWithReferenceValues(page: Page, title: string) {
  await useFrenchInterface(page);
  await createSpreadsheetInSeed(page, title);
  await editSpreadsheetCell(page, 1, 1, "3");
  await editSpreadsheetCell(page, 1, 2, "2");
  await editSpreadsheetCell(page, 1, 3, "4");
  await editSpreadsheetCell(page, 2, 1, "12");
  await editSpreadsheetCell(page, 2, 2, "5");
}

async function expectAutomaticFormula(
  page: Page,
  title: string,
  action: "average" | "max" | "min",
  formula: string,
  result: string,
) {
  await useFrenchInterface(page);
  await createSpreadsheetInSeed(page, title);
  await editSpreadsheetCell(page, 1, 1, "6");
  await editSpreadsheetCell(page, 1, 2, "2");
  await page.getByTestId("spreadsheet-cell-1-3").click();
  await page.getByTestId("spreadsheet-auto-sum-menu-trigger").click();
  await page.getByTestId(`spreadsheet-auto-formula-${action}`).click();
  await expect(page.getByTestId("spreadsheet-formula-input")).toHaveValue(formula);
  await page.getByTestId("spreadsheet-formula-input").press("Enter");
  await expect(page.getByTestId("spreadsheet-cell-1-3")).toHaveText(result);
  await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
}

async function expectPersistentHorizontalAlignment(
  page: Page,
  title: string,
  alignment: "left" | "center" | "right",
) {
  await createSpreadsheetInSeed(page, title);
  await editSpreadsheetCell(page, 0, 0, "Budget");
  await editSpreadsheetCell(page, 0, 1, "Recettes");
  const nameBox = page.getByTestId("spreadsheet-cell-address");
  await nameBox.fill("A1:A2");
  await nameBox.press("Enter");
  await page.getByTestId("spreadsheet-align").click();
  await page.getByTestId(`spreadsheet-align-${alignment}`).click();
  await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveCSS("text-align", alignment);
  await expect(page.getByTestId("spreadsheet-cell-0-1")).toHaveCSS("text-align", alignment);
  await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
  await page.reload();
  await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveCSS("text-align", alignment);
  await expect(page.getByTestId("spreadsheet-cell-0-1")).toHaveCSS("text-align", alignment);
}

type BorderSide = "top" | "right" | "bottom" | "left";

async function expectPersistentBorders(
  page: Page,
  title: string,
  command: string,
  checks: Array<{ column: number; row: number; side: BorderSide; present: boolean }>,
) {
  await createSpreadsheetInSeed(page, title);
  const nameBox = page.getByTestId("spreadsheet-cell-address");
  await nameBox.fill("A1:B2");
  await nameBox.press("Enter");
  await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveClass(/highlight/);
  await expect(page.getByTestId("spreadsheet-cell-1-1")).toHaveClass(/highlight/);
  await page.getByTestId("spreadsheet-borders").click();
  const borderCommand = page.getByTestId(`spreadsheet-border-${command}`);
  await expect(borderCommand).toBeVisible();
  await borderCommand.click();
  const assertBorders = async () => {
    for (const { column, row, side, present } of checks) {
      const borderStyle = () => page.getByTestId(`spreadsheet-cell-${column}-${row}`).evaluate((cell, currentSide) => {
        const style = document.createElement("div").style;
        style.cssText = cell.getAttribute("style") ?? "";
        return style.getPropertyValue(`border-${currentSide}-style`);
      }, side);
      if (present) await expect.poll(borderStyle).toBe("solid");
      else await expect.poll(borderStyle).not.toBe("solid");
    }
  };
  await assertBorders();
  await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "dirty");
  await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
  await page.reload();
  await assertBorders();
}

async function expectPersistentCellStyle(
  page: Page,
  title: string,
  control: string,
  option: string,
  property: string,
  expected: string,
) {
  await createSpreadsheetInSeed(page, title);
  const nameBox = page.getByTestId("spreadsheet-cell-address");
  await nameBox.fill("A1:A2");
  await nameBox.press("Enter");
  await page.getByTestId(control).click();
  await page.getByTestId(option).click();
  const styleValue = (row: number) => page.getByTestId(`spreadsheet-cell-0-${row}`).evaluate((cell, currentProperty) => {
    const style = document.createElement("div").style;
    style.cssText = cell.getAttribute("style") ?? "";
    return style.getPropertyValue(currentProperty);
  }, property);
  await expect.poll(() => styleValue(0)).toBe(expected);
  await expect.poll(() => styleValue(1)).toBe(expected);
  await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "dirty");
  await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
  await page.reload();
  await expect.poll(() => styleValue(0)).toBe(expected);
  await expect.poll(() => styleValue(1)).toBe(expected);
}

test.describe("spreadsheet selection and formula bar", () => {
  test("EXL-SEL-001 selects a rectangular range by mouse drag", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Sélection rectangulaire");
    await page.getByTestId("spreadsheet-cell-1-1").dragTo(page.getByTestId("spreadsheet-cell-3-3"));
    await expect(page.getByTestId("spreadsheet-cell-1-1")).toHaveClass(/highlight/);
    await expect(page.getByTestId("spreadsheet-cell-3-3")).toHaveClass(/highlight/);
    await expect(page.getByTestId("spreadsheet-cell-address")).toHaveValue("B2");
  });

  test("EXL-SEL-002 extends the active selection with Shift and arrow keys", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Extension de sélection");
    await page.getByTestId("spreadsheet-cell-1-1").click();
    await page.keyboard.down("Shift");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.up("Shift");
    await expect(page.getByTestId("spreadsheet-cell-1-1")).toHaveClass(/highlight/);
    await expect(page.getByTestId("spreadsheet-cell-2-2")).toHaveClass(/highlight/);
  });

  test("EXL-SEL-003 selects a complete row from its header", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Sélection de ligne");
    await page.getByTestId("spreadsheet-row-header-2").click();
    await expect(page.getByTestId("spreadsheet-cell-0-2")).toHaveClass(/highlight/);
    await expect(page.getByTestId("spreadsheet-cell-7-2")).toHaveClass(/highlight/);
    await expect(page.getByTestId("spreadsheet-cell-0-1")).not.toHaveClass(/highlight/);
  });

  test("EXL-SEL-004 selects a complete column from its header", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Sélection de colonne");
    await page.getByTestId("spreadsheet-column-header-2").click();
    await expect(page.getByTestId("spreadsheet-cell-2-0")).toHaveClass(/highlight/);
    await expect(page.getByTestId("spreadsheet-cell-2-29")).toHaveClass(/highlight/);
    await expect(page.getByTestId("spreadsheet-cell-1-0")).not.toHaveClass(/highlight/);
  });

  test("EXL-SEL-006 selects the complete sheet", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Sélection de feuille");
    await page.getByTestId("spreadsheet-select-all").click();
    await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveClass(/highlight/);
    await expect(page.getByTestId("spreadsheet-cell-7-29")).toHaveClass(/highlight/);
  });

  test("EXL-FB-001 displays the active address, source and calculated value", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Affichage cellule active");
    await editSpreadsheetCell(page, 0, 0, "=SOMME(1;2)");
    await page.getByTestId("spreadsheet-cell-0-0").click();
    await expect(page.getByTestId("spreadsheet-cell-address")).toHaveValue("A1");
    await expect(page.getByTestId("spreadsheet-formula-input")).toHaveValue("=SOMME(1;2)");
    await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveText("3");
  });

  test("EXL-FB-002 edits directly in the cell and synchronizes the formula bar", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Édition directe synchronisée");
    await editSpreadsheetCell(page, 0, 0, "2");
    const formulaInput = page.getByTestId("spreadsheet-formula-input");
    const formulaCell = page.getByTestId("spreadsheet-cell-1-0");
    await formulaCell.dblclick();
    const nativeCellEditor = page.getByTestId("spreadsheet-cell-editor");
    await expect(nativeCellEditor).toHaveClass(/editor/);
    const nativeCellEditorInput = page.getByTestId("spreadsheet-cell-editor-input");
    await expect(nativeCellEditorInput).toBeFocused();
    await nativeCellEditorInput.pressSequentially("=A1*2", { delay: 40 });
    await expect(formulaInput).toHaveValue("=A1*2");
    await page.keyboard.press("Enter");
    await expect(formulaCell).toHaveText("4");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
  });

  test("EXL-FB-003 edits from the formula bar without moving the grid selection", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Cible édition formule");
    await editSpreadsheetCell(page, 1, 0, "=SOMME(1;2)");
    const formulaCell = page.getByTestId("spreadsheet-cell-1-0");
    const formulaInput = page.getByTestId("spreadsheet-formula-input");
    await formulaCell.click();
    await expect(page.getByTestId("spreadsheet-cell-address")).toHaveValue("B1");
    await expect(formulaInput).toHaveValue("=SOMME(1;2)");
    await formulaInput.click();
    await formulaInput.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await formulaInput.pressSequentially("=SOMME(1;3)");
    await expect(page.getByTestId("spreadsheet-cell-address")).toHaveValue("B1");
    await expect(formulaInput).toHaveValue("=SOMME(1;3)");
    await formulaInput.press("Enter");
    await expect(formulaCell).toHaveText("4");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
  });

  test("EXL-FB-004 cancels an edit and restores the original formula", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Annulation formule");
    await editSpreadsheetCell(page, 1, 1, "12");
    await editSpreadsheetCell(page, 2, 1, "89.9");
    await editSpreadsheetCell(page, 3, 1, "=ROUND(B2*C2;2)");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
    const saveRequests: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "PUT" && /\/api\/resources\/[^/]+\/spreadsheet$/.test(new URL(request.url()).pathname))
        saveRequests.push(request.url());
    });
    const formulaInput = page.getByTestId("spreadsheet-formula-input");
    await page.getByTestId("spreadsheet-cell-3-1").click();
    await expect(page.getByTestId("spreadsheet-cell-3-1")).toHaveText("1078.8");
    await formulaInput.click();
    await formulaInput.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await formulaInput.pressSequentially("=1");
    await page.getByTestId("spreadsheet-formula-cancel").click();
    await expect(formulaInput).toHaveValue("=ROUND(B2*C2;2)");
    await expect(page.getByTestId("spreadsheet-cell-3-1")).toHaveText("1078.8");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
    await page.reload();
    await page.getByTestId("spreadsheet-cell-3-1").click();
    await expect(formulaInput).toHaveValue("=ROUND(B2*C2;2)");
    expect(saveRequests).toEqual([]);
  });

  test("EXL-FB-005 commits an edit and persists the calculated result", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Validation formule");
    const formulaInput = page.getByTestId("spreadsheet-formula-input");
    await formulaInput.click();
    await formulaInput.pressSequentially("=SOMME(1;2)");
    await page.getByTestId("spreadsheet-formula-validate").click();
    await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveText("3");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
    await page.reload();
    await page.getByTestId("spreadsheet-cell-0-0").click();
    await expect(formulaInput).toHaveValue("=SOMME(1;2)");
    await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveText("3");
  });

  test("EXL-FB-006 expands the formula bar to multiple visible lines", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Dépliage barre formule");
    const formulaBar = page.getByTestId("spreadsheet-formula-bar");
    const formulaInput = page.getByTestId("spreadsheet-formula-input");
    const sheetScroll = page.getByTestId("spreadsheet-sheet-scroll");
    const workbenchHeader = page.getByTestId("resource-workbench-header");
    const headerTop = (await workbenchHeader.boundingBox())?.y;
    const longFormula = "=SOMME(1;2;3;4;5;6;7;8;9;10)";
    await formulaInput.click();
    await formulaInput.pressSequentially(longFormula);
    await page.getByTestId("spreadsheet-formula-expand").click();
    await expect(page.getByTestId("spreadsheet-formula-expand")).toHaveAttribute("aria-pressed", "true");
    await expect(formulaBar).toHaveClass(/is-expanded/);
    const box = await formulaInput.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThan(80);
    await formulaInput.press("Home");
    await expect(formulaInput).toHaveJSProperty("selectionStart", 0);
    await formulaInput.press("End");
    await expect(formulaInput).toHaveJSProperty("selectionStart", longFormula.length);
    await formulaInput.pressSequentially("+1");
    await expect(formulaInput).toHaveValue(`${longFormula}+1`);
    await sheetScroll.hover();
    await page.mouse.wheel(0, 1_000);
    await expect.poll(() => sheetScroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect((await workbenchHeader.boundingBox())?.y).toBe(headerTop);
    await formulaInput.press("Escape");
  });

  test("EXL-FB-007 toggles the formula bar with Control Shift U", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Raccourci barre formule");
    const formulaInput = page.getByTestId("spreadsheet-formula-input");
    await formulaInput.click();
    await formulaInput.pressSequentially("=SOMME(1;2;3)");
    await formulaInput.focus();
    await expect(formulaInput).toBeFocused();
    await formulaInput.press("Home");
    for (let index = 0; index < 8; index += 1) await formulaInput.press("ArrowRight");
    await expect(formulaInput).toHaveJSProperty("selectionStart", 8);
    await expect(formulaInput).toHaveJSProperty("selectionEnd", 8);
    await formulaInput.press("Control+Shift+u");
    await expect(page.getByTestId("spreadsheet-formula-expand")).toHaveAttribute("aria-pressed", "true");
    await expect(formulaInput).toHaveValue("=SOMME(1;2;3)");
    await expect(formulaInput).toHaveJSProperty("selectionStart", 8);
    await expect(formulaInput).toHaveJSProperty("selectionEnd", 8);
    await formulaInput.press("Control+Shift+u");
    await expect(page.getByTestId("spreadsheet-formula-expand")).toHaveAttribute("aria-pressed", "false");
    await expect(formulaInput).toHaveValue("=SOMME(1;2;3)");
    await expect(formulaInput).toHaveJSProperty("selectionStart", 8);
    await expect(formulaInput).toHaveJSProperty("selectionEnd", 8);
  });

  test("EXL-FB-008 preserves a long formula after collapse and reload", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Persistance formule longue");
    const formulaInput = page.getByTestId("spreadsheet-formula-input");
    const longFormula = "=SOMME(1;2;3;4;5;6;7;8;9;10)";
    await formulaInput.click();
    await formulaInput.pressSequentially(longFormula);
    await page.getByTestId("spreadsheet-formula-expand").click();
    await page.getByTestId("spreadsheet-formula-expand").click();
    await page.getByTestId("spreadsheet-formula-validate").click();
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
    await page.reload();
    await page.getByTestId("spreadsheet-cell-0-0").click();
    await expect(formulaInput).toHaveValue(longFormula);
    await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveText("55");
  });

  test("EXL-FB-009 cancels an edit with Escape and restores the original formula", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Annulation formule clavier");
    await editSpreadsheetCell(page, 3, 1, "=SOMME(1;2)");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
    const saveRequests: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "PUT" && /\/api\/resources\/[^/]+\/spreadsheet$/.test(new URL(request.url()).pathname))
        saveRequests.push(request.url());
    });
    const formulaInput = page.getByTestId("spreadsheet-formula-input");
    await page.getByTestId("spreadsheet-cell-3-1").click();
    await formulaInput.click();
    await formulaInput.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await formulaInput.pressSequentially("=1");
    await formulaInput.press("Escape");
    await expect(formulaInput).toHaveValue("=SOMME(1;2)");
    await expect(page.getByTestId("spreadsheet-cell-3-1")).toHaveText("3");
    await page.reload();
    await page.getByTestId("spreadsheet-cell-3-1").click();
    await expect(formulaInput).toHaveValue("=SOMME(1;2)");
    expect(saveRequests).toEqual([]);
  });

  test("EXL-FB-010 commits an edit with Enter and persists the result", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Validation formule clavier");
    const formulaInput = page.getByTestId("spreadsheet-formula-input");
    await formulaInput.click();
    await formulaInput.pressSequentially("=SOMME(2;3)");
    await formulaInput.press("Enter");
    await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveText("5");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
    await page.reload();
    await page.getByTestId("spreadsheet-cell-0-0").click();
    await expect(formulaInput).toHaveValue("=SOMME(2;3)");
    await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveText("5");
  });

  test("EXL-FB-011 enters direct cell edit mode with F2", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Édition directe F2");
    await editSpreadsheetCell(page, 1, 0, "Préfixe");
    const formulaCell = page.getByTestId("spreadsheet-cell-1-0");
    await formulaCell.click();
    await page.keyboard.press("F2");
    const nativeCellEditor = page.getByTestId("spreadsheet-cell-editor");
    await expect(nativeCellEditor).toHaveClass(/editor/);
    const nativeInput = page.getByTestId("spreadsheet-cell-editor-input");
    await expect(nativeInput).toBeFocused();
    await expect(nativeInput).toHaveValue("Préfixe");
    await expect(nativeInput).toHaveJSProperty("selectionStart", "Préfixe".length);
    await expect(nativeInput).toHaveJSProperty("selectionEnd", "Préfixe".length);
    await page.keyboard.type(" suite");
    await expect(page.getByTestId("spreadsheet-formula-input")).toHaveValue("Préfixe suite");
    await page.keyboard.press("Enter");
    await expect(formulaCell).toHaveText("Préfixe suite");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
  });

  test("EXL-NAME-001 navigates to a cell entered in the name box", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Navigation zone Nom");
    const sheetScroll = page.getByTestId("spreadsheet-sheet-scroll");
    await sheetScroll.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const nameBox = page.getByTestId("spreadsheet-cell-address");
    await nameBox.fill("D12");
    await nameBox.press("Enter");
    await expect(nameBox).toHaveValue("D12");
    const target = page.getByTestId("spreadsheet-cell-3-11");
    await expect(target).toHaveClass(/highlight-selected/);
    const viewport = await sheetScroll.boundingBox();
    const cell = await target.boundingBox();
    expect(cell).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(cell!.x).toBeGreaterThanOrEqual(viewport!.x);
    expect(cell!.y).toBeGreaterThanOrEqual(viewport!.y);
    expect(cell!.x + cell!.width).toBeLessThanOrEqual(viewport!.x + viewport!.width);
    expect(cell!.y + cell!.height).toBeLessThanOrEqual(viewport!.y + viewport!.height);
  });

  test("EXL-NAME-002 selects a range entered in the name box", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Navigation plage zone Nom");
    const nameBox = page.getByTestId("spreadsheet-cell-address");
    await nameBox.fill("B2:C3");
    await nameBox.press("Enter");
    await expect(nameBox).toHaveValue("B2");
    await expect(page.getByTestId("spreadsheet-cell-1-1")).toHaveClass(/highlight/);
    await expect(page.getByTestId("spreadsheet-cell-2-2")).toHaveClass(/highlight/);
  });

});

test.describe("spreadsheet functions", () => {
  test("EXL-FX-001 suggests functions from the typed prefix", async ({ appPage: page }) => {
    await useFrenchInterface(page);
    await createSpreadsheetInSeed(page, "Suggestions de fonctions");
    const formulaInput = page.getByTestId("spreadsheet-formula-input");
    await page.getByTestId("spreadsheet-cell-0-0").click();
    await formulaInput.click();
    await formulaInput.pressSequentially("=SO");

    await expect(page.getByTestId("spreadsheet-formula-suggestions")).toHaveClass(/is-open/);
    const suggestions = page.locator('[data-testid^="spreadsheet-formula-suggestion-"]');
    await expect(suggestions.first()).toBeVisible();
    await expect(suggestions.first()).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("spreadsheet-formula-suggestion-somme")).toBeVisible();
    for (const suggestion of await suggestions.all()) await expect(suggestion).toContainText(/^SO/i);
    await formulaInput.press("Escape");
  });

  test("EXL-FX-006 accepts a French formula with French separators", async ({ appPage: page }) => {
    await useFrenchInterface(page);
    await createSpreadsheetInSeed(page, "Formule décimale française");
    await editSpreadsheetCell(page, 0, 0, "=SOMME(1,5;2,5)");

    await page.getByTestId("spreadsheet-cell-0-0").click();
    await expect(page.getByTestId("spreadsheet-formula-input")).toHaveValue("=SOMME(1,5;2,5)");
    await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveText("4");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
  });

  test("EXL-FX-003 inserts a nested function at the caret without losing the suffix", async ({ appPage: page }) => {
    await useEnglishInterface(page);
    await createSpreadsheetInSeed(page, "Fonction imbriquée");
    const formulaInput = page.getByTestId("spreadsheet-formula-input");
    await page.getByTestId("spreadsheet-cell-0-0").click();
    await formulaInput.click();
    await formulaInput.pressSequentially("=IF(A1,SU,C1)");
    await formulaInput.press("Home");
    for (let index = 0; index < 9; index += 1) await formulaInput.press("ArrowRight");
    await page.getByTestId("spreadsheet-formula-suggestion-sum").click();
    await expect(formulaInput).toHaveValue("=IF(A1,SUM(,C1)");
    await formulaInput.press("Escape");
  });

  test("EXL-FX-005 searches the complete catalog and inserts a documented function", async ({ appPage: page }) => {
    await useEnglishInterface(page);
    await createSpreadsheetInSeed(page, "Complete function catalog");
    const formulaInput = page.getByTestId("spreadsheet-formula-input");
    await formulaInput.click();
    await expect(page.getByTestId("spreadsheet-formula-functions")).toBeVisible();
    await page.getByTestId("spreadsheet-formula-functions").click();
    const catalog = page.getByTestId("spreadsheet-formula-suggestions");
    await expect(catalog).toHaveClass(/is-open/);
    const suggestions = catalog.locator('[data-testid^="spreadsheet-formula-suggestion-"]');
    await expect(suggestions).toHaveCount(spreadsheetFormulaNamesByLocale.en.length);
    expect(await suggestions.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-testid")))).toEqual(
      spreadsheetFormulaNamesByLocale.en.map(
        (name) => `spreadsheet-formula-suggestion-${name.toLowerCase().replaceAll(".", "-")}`,
      ),
    );
    await page.getByTestId("spreadsheet-formula-suggestion-sum").click();
    await expect(formulaInput).toHaveValue("=SUM(");
    await formulaInput.press("Escape");
  });

  test("EXL-FX-007 accepts an English formula with English separators", async ({ appPage: page }) => {
    await useEnglishInterface(page);
    await createSpreadsheetInSeed(page, "English formula syntax");
    await editSpreadsheetCell(page, 0, 0, "=SUM(1.5,2.5)");
    await page.getByTestId("spreadsheet-cell-0-0").click();
    await expect(page.getByTestId("spreadsheet-formula-input")).toHaveValue("=SUM(1.5,2.5)");
    await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveText("4");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
  });

  test("EXL-FX-011 displays sourced help or an explicit unavailable state", async ({ appPage: page }) => {
    await useEnglishInterface(page);
    await createSpreadsheetInSeed(page, "Function help");
    await page.getByTestId("spreadsheet-formula-functions").click();
    const suggestion = page.getByTestId("spreadsheet-formula-suggestion-sum");
    await expect(suggestion).toContainText("SUM(number1, [number2], …)");
    await expect(suggestion).toContainText("Adds values");
    const missingName = spreadsheetFormulaMetadataMissing[0];
    const unavailable = page.getByTestId(`spreadsheet-formula-suggestion-${missingName.toLowerCase().replaceAll(".", "-")}`);
    await expect(unavailable).toContainText(missingName);
    await expect(unavailable).toContainText("No help entry is available for this function.");
  });

  test("EXL-FX-012 inserts the selected catalog function at the caret", async ({ appPage: page }) => {
    await useEnglishInterface(page);
    await createSpreadsheetInSeed(page, "Catalog insertion");
    const formulaInput = page.getByTestId("spreadsheet-formula-input");
    await page.getByTestId("spreadsheet-cell-0-0").click();
    await formulaInput.click();
    await formulaInput.pressSequentially("=1+");
    await page.getByTestId("spreadsheet-formula-functions").click();
    await page.getByTestId("spreadsheet-formula-suggestion-sum").click();
    await expect(formulaInput).toHaveValue("=1+SUM(");
    await expect(page.getByTestId("spreadsheet-cell-address")).toHaveValue("A1");
    await formulaInput.press("Escape");
  });

});

test.describe("spreadsheet references", () => {
  test("EXL-REF-001 inserts a grid selection at the formula caret", async ({ appPage: page }) => {
    await useFrenchInterface(page);
    await createSpreadsheetInSeed(page, "Insertion de référence");
    const formulaInput = page.getByTestId("spreadsheet-formula-input");
    await page.getByTestId("spreadsheet-cell-5-1").click();
    await formulaInput.click();
    await formulaInput.pressSequentially("=SOMME(");
    await page.getByTestId("spreadsheet-cell-1-1").dragTo(page.getByTestId("spreadsheet-cell-1-2"));

    await expect(formulaInput).toHaveValue("=SOMME(B2:B3");
    await formulaInput.press("Escape");
  });

  test("EXL-REF-002 gives every reference a matching distinct token and border color", async ({ appPage: page }) => {
    await createSpreadsheetWithReferenceValues(page, "Couleurs des références");
    await editSpreadsheetCell(page, 5, 1, "=SUM(B2:B3)+SUM(C2:C3)");
    const formulaInput = page.getByTestId("spreadsheet-formula-input");
    await page.getByTestId("spreadsheet-cell-5-1").click();
    await formulaInput.click();

    const firstCell = page.getByTestId("spreadsheet-cell-1-1");
    const secondCell = page.getByTestId("spreadsheet-cell-2-1");
    const firstColor = await firstCell.evaluate((cell) => getComputedStyle(cell).borderLeftColor);
    const secondColor = await secondCell.evaluate((cell) => getComputedStyle(cell).borderLeftColor);
    expect(firstColor).not.toBe(secondColor);
    await expect(page.getByTestId("spreadsheet-formula-reference-token-0").first()).toHaveCSS("color", firstColor);
    await expect(page.getByTestId("spreadsheet-formula-reference-token-1").first()).toHaveCSS("color", secondColor);
    await expect(page.getByTestId("spreadsheet-formula-range-handle-0")).toBeVisible();
    await expect(page.getByTestId("spreadsheet-formula-range-handle-1")).toBeVisible();
    await formulaInput.press("Escape");
  });

  test("EXL-REF-005 resizes only the referenced range dragged by its corner", async ({ appPage: page }) => {
    await createSpreadsheetWithReferenceValues(page, "Redimensionnement de référence");
    await editSpreadsheetCell(page, 5, 1, "=SOMME(B2:B3)+SOMME(C2:C3)");
    const formulaInput = page.getByTestId("spreadsheet-formula-input");
    const formulaCell = page.getByTestId("spreadsheet-cell-5-1");
    await formulaCell.click();
    await formulaInput.click();
    await page.getByTestId("spreadsheet-formula-range-handle-0").dragTo(page.getByTestId("spreadsheet-cell-1-3"));

    await expect(formulaInput).toHaveValue("=SOMME(B2:B4)+SOMME(C2:C3)");
    await expect(page.getByTestId("spreadsheet-cell-2-1")).toHaveClass(/spreadsheet-formula-reference-1/);
    await page.getByTestId("spreadsheet-formula-validate").click();
    await expect(formulaCell).toHaveText("26");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
  });

  test("EXL-REF-007 preserves neighboring references when one range is resized", async ({ appPage: page }) => {
    await createSpreadsheetWithReferenceValues(page, "Références voisines");
    await editSpreadsheetCell(page, 5, 1, "=SUM(B2:B3)+SUM(C2:C3)");
    const formulaInput = page.getByTestId("spreadsheet-formula-input");
    const formulaCell = page.getByTestId("spreadsheet-cell-5-1");
    await formulaCell.click();
    await formulaInput.click();
    const secondReference = page.getByTestId("spreadsheet-cell-2-1");
    const secondColor = await secondReference.evaluate((cell) => getComputedStyle(cell).borderLeftColor);
    await page.getByTestId("spreadsheet-formula-range-handle-0").dragTo(page.getByTestId("spreadsheet-cell-1-3"));

    await expect(formulaInput).toHaveValue("=SUM(B2:B4)+SUM(C2:C3)");
    await expect(secondReference).toHaveClass(/spreadsheet-formula-reference-1/);
    expect(await secondReference.evaluate((cell) => getComputedStyle(cell).borderLeftColor)).toBe(secondColor);
    await formulaInput.press("Enter");
    await expect(formulaCell).toHaveText("26");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
  });

  test("EXL-REF-003 emphasizes the reference under the formula caret", async ({ appPage: page }) => {
    await createSpreadsheetWithReferenceValues(page, "Référence active");
    await editSpreadsheetCell(page, 5, 1, "=SUM(B2:B3)+SUM(C2:C3)");
    const formulaInput = page.getByTestId("spreadsheet-formula-input");
    await page.getByTestId("spreadsheet-cell-5-1").click();
    await formulaInput.click();
    await formulaInput.press("Home");
    for (let index = 0; index < 17; index += 1) await formulaInput.press("ArrowRight");
    await expect(page.getByTestId("spreadsheet-cell-2-1")).toHaveClass(/is-active-reference/);
    await expect(page.getByTestId("spreadsheet-cell-1-1")).not.toHaveClass(/is-active-reference/);
    await formulaInput.press("Escape");
  });

  test("EXL-REF-006 replaces the referenced range without corrupting the formula", async ({ appPage: page }) => {
    await useFrenchInterface(page);
    await createSpreadsheetInSeed(page, "Régression plage formule");
    const formulaInput = page.getByTestId("spreadsheet-formula-input");
    await editSpreadsheetCell(page, 4, 1, "1");
    await editSpreadsheetCell(page, 4, 2, "2");
    await editSpreadsheetCell(page, 4, 3, "3");
    await editSpreadsheetCell(page, 5, 1, "=SOMME(E2)");
    await page.getByTestId("spreadsheet-cell-5-1").click();
    await formulaInput.click();
    await formulaInput.press("End");
    await page.getByTestId("spreadsheet-cell-4-1").dragTo(page.getByTestId("spreadsheet-cell-4-3"));
    await expect(formulaInput).toHaveValue("=SOMME(E2:E4)");
    await formulaInput.press("Enter");
    await expect(page.getByTestId("spreadsheet-cell-5-1")).toHaveText("6");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
    await page.reload();
    await page.getByTestId("spreadsheet-cell-5-1").click();
    await expect(formulaInput).toHaveValue("=SOMME(E2:E4)");
    await expect(page.getByTestId("spreadsheet-cell-5-1")).toHaveText("6");
  });

});

test.describe("spreadsheet fill", () => {
  test("EXL-FILL-001 copies a value with the fill handle", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Recopie de valeur");
    await editSpreadsheetCell(page, 1, 1, "Budget");
    await page.getByTestId("spreadsheet-cell-1-1").click();
    await page.getByTestId("spreadsheet-fill-handle").dragTo(page.getByTestId("spreadsheet-cell-1-2"));

    await expect(page.getByTestId("spreadsheet-cell-1-2")).toHaveText("Budget");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
  });

  test("EXL-FILL-002 translates relative references vertically", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Recopie de références relatives");
    await editSpreadsheetCell(page, 1, 1, "3");
    await editSpreadsheetCell(page, 2, 1, "12.345");
    await editSpreadsheetCell(page, 1, 2, "2");
    await editSpreadsheetCell(page, 2, 2, "5");
    await editSpreadsheetCell(page, 3, 1, "=ROUND(B2*C2,2)");
    await page.getByTestId("spreadsheet-cell-3-1").click();
    await page.getByTestId("spreadsheet-fill-handle").dragTo(page.getByTestId("spreadsheet-cell-3-2"));

    await page.getByTestId("spreadsheet-cell-3-2").click();
    await expect(page.getByTestId("spreadsheet-formula-input")).toHaveValue("=ROUND(B3*C3,2)");
    await expect(page.getByTestId("spreadsheet-cell-3-2")).toHaveText("10");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
  });

  test("EXL-FILL-003 preserves absolute and mixed references vertically", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Recopie de références absolues");
    await editSpreadsheetCell(page, 1, 1, "3");
    await editSpreadsheetCell(page, 1, 2, "2");
    await editSpreadsheetCell(page, 1, 3, "4");
    await editSpreadsheetCell(page, 7, 1, "=$B$2+B2");
    await page.getByTestId("spreadsheet-cell-7-1").click();
    await page.getByTestId("spreadsheet-fill-handle").dragTo(page.getByTestId("spreadsheet-cell-7-3"));

    await page.getByTestId("spreadsheet-cell-7-2").click();
    await expect(page.getByTestId("spreadsheet-formula-input")).toHaveValue("=$B$2+B3");
    await page.getByTestId("spreadsheet-cell-7-3").click();
    await expect(page.getByTestId("spreadsheet-formula-input")).toHaveValue("=$B$2+B4");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
  });

  test("EXL-FILL-004 translates relative references horizontally", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Recopie horizontale");
    await editSpreadsheetCell(page, 0, 0, "2");
    await editSpreadsheetCell(page, 1, 0, "3");
    await editSpreadsheetCell(page, 2, 0, "4");
    await editSpreadsheetCell(page, 1, 1, "=A1+$A$1");
    await page.getByTestId("spreadsheet-cell-1-1").click();
    await page.getByTestId("spreadsheet-fill-handle").dragTo(page.getByTestId("spreadsheet-cell-3-1"));
    await page.getByTestId("spreadsheet-cell-2-1").click();
    await expect(page.getByTestId("spreadsheet-formula-input")).toHaveValue("=B1+$A$1");
    await page.getByTestId("spreadsheet-cell-3-1").click();
    await expect(page.getByTestId("spreadsheet-formula-input")).toHaveValue("=C1+$A$1");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
  });

  test("EXL-FILL-005 translates only the relative part of mixed references", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Recopie de référence mixte");
    await editSpreadsheetCell(page, 1, 1, "3");
    await editSpreadsheetCell(page, 1, 2, "2");
    await editSpreadsheetCell(page, 1, 3, "4");
    await editSpreadsheetCell(page, 7, 1, "=B$2+$B2");
    await page.getByTestId("spreadsheet-cell-7-1").click();
    await page.getByTestId("spreadsheet-fill-handle").dragTo(page.getByTestId("spreadsheet-cell-7-3"));
    await page.getByTestId("spreadsheet-cell-7-2").click();
    await expect(page.getByTestId("spreadsheet-formula-input")).toHaveValue("=B$2+$B3");
    await page.getByTestId("spreadsheet-cell-7-3").click();
    await expect(page.getByTestId("spreadsheet-formula-input")).toHaveValue("=B$2+$B4");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
  });

  test("EXL-FILL-008 extends a formula series across existing formula cells", async ({ appPage: page }) => {
    const resourceId = await createSpreadsheetInSeed(page, "Recopie sur formules existantes");
    await editSpreadsheetCell(page, 1, 1, "12");
    await editSpreadsheetCell(page, 2, 1, "89.9");
    await editSpreadsheetCell(page, 3, 1, "=ROUND(B2*C2,2)");
    await editSpreadsheetCell(page, 1, 2, "48");
    await editSpreadsheetCell(page, 2, 2, "34.5");
    await editSpreadsheetCell(page, 3, 2, "=ROUND(B2*C2,2)");
    await editSpreadsheetCell(page, 1, 3, "2");
    await editSpreadsheetCell(page, 2, 3, "279");
    await editSpreadsheetCell(page, 3, 3, "=ROUND(B2*C2,2)");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
    await setSpreadsheetColumnFormat(page, resourceId, 3, "currency");
    await page.getByTestId("spreadsheet-cell-3-1").click();
    await page.getByTestId("spreadsheet-fill-handle").dragTo(page.getByTestId("spreadsheet-cell-3-3"));

    await page.getByTestId("spreadsheet-cell-3-2").click();
    await expect(page.getByTestId("spreadsheet-formula-input")).toHaveValue("=ROUND(B3*C3,2)");
    await expect(page.getByTestId("spreadsheet-cell-3-2")).toHaveText("1.656,00 €");
    await page.getByTestId("spreadsheet-cell-3-3").click();
    await expect(page.getByTestId("spreadsheet-formula-input")).toHaveValue("=ROUND(B4*C4,2)");
    await expect(page.getByTestId("spreadsheet-cell-3-3")).toHaveText("558,00 €");
    await page.getByTestId("spreadsheet-undo").click();
    await page.getByTestId("spreadsheet-cell-3-2").click();
    await expect(page.getByTestId("spreadsheet-formula-input")).toHaveValue("=ROUND(B2*C2,2)");
    await page.getByTestId("spreadsheet-cell-3-3").click();
    await expect(page.getByTestId("spreadsheet-formula-input")).toHaveValue("=ROUND(B2*C2,2)");
    await page.getByTestId("spreadsheet-redo").click();
    await page.getByTestId("spreadsheet-cell-3-2").click();
    await expect(page.getByTestId("spreadsheet-formula-input")).toHaveValue("=ROUND(B3*C3,2)");
    await page.getByTestId("spreadsheet-cell-3-3").click();
    await expect(page.getByTestId("spreadsheet-formula-input")).toHaveValue("=ROUND(B4*C4,2)");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
    await page.reload();
    await page.getByTestId("spreadsheet-cell-3-2").click();
    await expect(page.getByTestId("spreadsheet-formula-input")).toHaveValue("=ROUND(B3*C3,2)");
    await expect(page.getByTestId("spreadsheet-cell-3-2")).toHaveText("1.656,00 €");
    await page.getByTestId("spreadsheet-cell-3-3").click();
    await expect(page.getByTestId("spreadsheet-formula-input")).toHaveValue("=ROUND(B4*C4,2)");
    await expect(page.getByTestId("spreadsheet-cell-3-3")).toHaveText("558,00 €");
  });

});

test.describe("spreadsheet functions and AutoSum", () => {
  test("EXL-SUM-002 proposes the contiguous vertical range", async ({ appPage: page }) => {
    await useFrenchInterface(page);
    await createSpreadsheetInSeed(page, "Somme verticale contiguë");
    await editSpreadsheetCell(page, 1, 1, "3");
    await editSpreadsheetCell(page, 1, 2, "2");
    await page.getByTestId("spreadsheet-cell-1-3").click();
    await page.getByTestId("spreadsheet-auto-sum").click();

    const formulaInput = page.getByTestId("spreadsheet-formula-input");
    await expect(formulaInput).toHaveValue("=SOMME(B2:B3)");
    await expect(formulaInput).toBeFocused();
    await expect(page.getByTestId("spreadsheet-cell-1-1")).toHaveClass(/spreadsheet-formula-reference/);
    await expect(page.getByTestId("spreadsheet-cell-1-2")).toHaveClass(/spreadsheet-formula-reference/);
    await expect(page.getByTestId("spreadsheet-formula-cancel")).toBeVisible();
    await formulaInput.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await formulaInput.pressSequentially("=SOMME(B2:B2)");
    await formulaInput.press("Enter");
    await page.getByTestId("spreadsheet-cell-1-3").click();
    await expect(formulaInput).toHaveValue("=SOMME(B2:B2)");
    await expect(page.getByTestId("spreadsheet-cell-1-3")).toHaveText("3");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
  });

  test("EXL-SUM-007 offers Sum Average Count Max Min and More Functions", async ({ appPage: page }) => {
    await useFrenchInterface(page);
    await createSpreadsheetInSeed(page, "Menu Somme automatique");
    await page.getByTestId("spreadsheet-auto-sum-menu-trigger").click();

    await expect(page.getByTestId("spreadsheet-auto-formula-menu")).toBeVisible();
    await expect(page.getByTestId("spreadsheet-auto-formula-sum")).toHaveText("Somme");
    await expect(page.getByTestId("spreadsheet-auto-formula-average")).toHaveText("Moyenne");
    await expect(page.getByTestId("spreadsheet-auto-formula-count")).toHaveText("Nombre");
    await expect(page.getByTestId("spreadsheet-auto-formula-max")).toHaveText("Maximum");
    await expect(page.getByTestId("spreadsheet-auto-formula-min")).toHaveText("Minimum");
    await expect(page.getByTestId("spreadsheet-auto-formula-more")).toHaveText("Plus de fonctions…");
  });

  test("EXL-SUM-001 places AutoSum in the toolbar and not in the formula bar", async ({ appPage: page }) => {
    await useFrenchInterface(page);
    await createSpreadsheetInSeed(page, "Position Somme automatique");
    await editSpreadsheetCell(page, 1, 1, "3");
    await editSpreadsheetCell(page, 1, 2, "2");
    await page.getByTestId("spreadsheet-cell-1-3").click();
    const autoSum = page.getByTestId("spreadsheet-auto-sum");
    await expect(autoSum).toBeVisible();
    const menuTrigger = page.getByTestId("spreadsheet-auto-sum-menu-trigger");
    await expect(menuTrigger).toBeVisible();
    expect(await autoSum.evaluate((element) => element.closest('[data-testid="spreadsheet-formula-bar"]'))).toBeNull();
    await autoSum.click();
    await expect(page.getByTestId("spreadsheet-formula-input")).toHaveValue("=SOMME(B2:B3)");
    await page.getByTestId("spreadsheet-formula-input").press("Escape");
    await menuTrigger.click();
    await expect(page.getByTestId("spreadsheet-auto-formula-menu")).toBeVisible();
    await expect(page.getByTestId("spreadsheet-auto-formula-average")).toBeVisible();
  });

  test("EXL-SUM-003 proposes the contiguous horizontal range", async ({ appPage: page }) => {
    await useFrenchInterface(page);
    await createSpreadsheetInSeed(page, "Somme horizontale");
    await editSpreadsheetCell(page, 1, 1, "3");
    await editSpreadsheetCell(page, 2, 1, "2");
    await page.getByTestId("spreadsheet-cell-3-1").click();
    await page.getByTestId("spreadsheet-auto-sum").click();
    const formulaInput = page.getByTestId("spreadsheet-formula-input");
    await expect(formulaInput).toHaveValue("=SOMME(B2:C2)");
    await formulaInput.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await formulaInput.pressSequentially("=SOMME(B2:B2)");
    await formulaInput.press("Enter");
    await page.getByTestId("spreadsheet-cell-3-1").click();
    await expect(formulaInput).toHaveValue("=SOMME(B2:B2)");
    await expect(page.getByTestId("spreadsheet-cell-3-1")).toHaveText("3");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
  });

  test("EXL-SUM-004 stops the proposed range at the first blank", async ({ appPage: page }) => {
    await useFrenchInterface(page);
    await createSpreadsheetInSeed(page, "Somme arrêtée au blanc");
    await editSpreadsheetCell(page, 1, 1, "9");
    await editSpreadsheetCell(page, 1, 2, "8");
    await editSpreadsheetCell(page, 1, 4, "3");
    await editSpreadsheetCell(page, 1, 5, "2");
    await page.getByTestId("spreadsheet-cell-1-6").click();
    await page.getByTestId("spreadsheet-auto-sum").click();
    await expect(page.getByTestId("spreadsheet-formula-input")).toHaveValue("=SOMME(B5:B6)");
    await page.getByTestId("spreadsheet-formula-input").press("Escape");
  });

  test("EXL-SUM-005 creates one total per selected empty total cell", async ({ appPage: page }) => {
    await useFrenchInterface(page);
    await createSpreadsheetInSeed(page, "Totaux multiples");
    await editSpreadsheetCell(page, 1, 1, "3");
    await editSpreadsheetCell(page, 1, 2, "2");
    await editSpreadsheetCell(page, 2, 1, "12");
    await editSpreadsheetCell(page, 2, 2, "5");
    const nameBox = page.getByTestId("spreadsheet-cell-address");
    await nameBox.fill("B4:C4");
    await nameBox.press("Enter");
    await page.getByTestId("spreadsheet-auto-sum").click();
    await page.getByTestId("spreadsheet-formula-input").press("Enter");
    await page.getByTestId("spreadsheet-cell-1-3").click();
    await expect(page.getByTestId("spreadsheet-formula-input")).toHaveValue("=SOMME(B2:B3)");
    await page.getByTestId("spreadsheet-cell-2-3").click();
    await expect(page.getByTestId("spreadsheet-formula-input")).toHaveValue("=SOMME(C2:C3)");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
  });

  test("EXL-SUM-006 totals a selected data range in the expected direction", async ({ appPage: page }) => {
    await useFrenchInterface(page);
    await createSpreadsheetWithReferenceValues(page, "Total de plage sélectionnée");
    const nameBox = page.getByTestId("spreadsheet-cell-address");
    await nameBox.fill("B2:C3");
    await nameBox.press("Enter");
    await page.getByTestId("spreadsheet-auto-sum").click();
    await expect(nameBox).toHaveValue("B4");
    await expect(page.getByTestId("spreadsheet-formula-input")).toHaveValue("=SOMME(B2:B3)");
    await page.getByTestId("spreadsheet-formula-input").press("Enter");
    await page.getByTestId("spreadsheet-cell-1-3").click();
    await expect(page.getByTestId("spreadsheet-formula-input")).toHaveValue("=SOMME(B2:B3)");
    await expect(page.getByTestId("spreadsheet-cell-1-3")).toHaveText("5");
    await page.getByTestId("spreadsheet-cell-2-3").click();
    await expect(page.getByTestId("spreadsheet-formula-input")).toHaveValue("=SOMME(C2:C3)");
    await expect(page.getByTestId("spreadsheet-cell-2-3")).toHaveText("17");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
  });

  test("EXL-SUM-008 proposes and calculates Average", async ({ appPage: page }) => {
    await expectAutomaticFormula(page, "Moyenne automatique", "average", "=MOYENNE(B2:B3)", "4");
  });

  test("EXL-SUM-010 proposes and calculates Maximum", async ({ appPage: page }) => {
    await expectAutomaticFormula(page, "Maximum automatique", "max", "=MAX(B2:B3)", "6");
  });

  test("EXL-SUM-011 proposes and calculates Minimum", async ({ appPage: page }) => {
    await expectAutomaticFormula(page, "Minimum automatique", "min", "=MIN(B2:B3)", "2");
  });

  test("EXL-SUM-012 opens the complete catalog from More Functions", async ({ appPage: page }) => {
    await useFrenchInterface(page);
    await createSpreadsheetInSeed(page, "Catalogue depuis Somme automatique");
    await page.getByTestId("spreadsheet-cell-2-2").click();
    await page.getByTestId("spreadsheet-auto-sum-menu-trigger").click();
    await page.getByTestId("spreadsheet-auto-formula-more").click();
    const catalog = page.getByTestId("spreadsheet-formula-suggestions");
    await expect(catalog).toHaveClass(/is-open/);
    await expect(catalog.locator('[data-testid^="spreadsheet-formula-suggestion-"]'))
      .toHaveCount(spreadsheetFormulaNamesByLocale.fr.length);
    await expect(page.getByTestId("spreadsheet-cell-address")).toHaveValue("C3");
  });

});

test.describe("spreadsheet structure, formatting and history", () => {
  test("EXL-SORT-001 sorts complete rows ascending and persists the order", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Tri croissant");
    await editSpreadsheetCell(page, 0, 0, "Bravo");
    await editSpreadsheetCell(page, 1, 0, "2");
    await editSpreadsheetCell(page, 0, 1, "Alpha");
    await editSpreadsheetCell(page, 1, 1, "1");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
    await page.getByTestId("spreadsheet-column-header-0").click({ button: "right" });
    await page.getByTestId("spreadsheet-sort-ascending").click();
    await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveText("Alpha");
    await expect(page.getByTestId("spreadsheet-cell-1-0")).toHaveText("1");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "dirty");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
    await page.reload();
    await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveText("Alpha");
    await expect(page.getByTestId("spreadsheet-cell-1-0")).toHaveText("1");
  });

  test("EXL-SORT-002 sorts complete rows descending and persists the order", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Tri décroissant");
    await editSpreadsheetCell(page, 0, 0, "Alpha");
    await editSpreadsheetCell(page, 1, 0, "1");
    await editSpreadsheetCell(page, 0, 1, "Bravo");
    await editSpreadsheetCell(page, 1, 1, "2");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
    await page.getByTestId("spreadsheet-column-header-0").click({ button: "right" });
    await page.getByTestId("spreadsheet-sort-descending").click();
    await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveText("Bravo");
    await expect(page.getByTestId("spreadsheet-cell-1-0")).toHaveText("2");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "dirty");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
    await page.reload();
    await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveText("Bravo");
    await expect(page.getByTestId("spreadsheet-cell-1-0")).toHaveText("2");
  });

  test("EXL-GRID-001 inserts one row from its header menu", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Insertion de ligne");
    await editSpreadsheetCell(page, 1, 1, "Budget");
    await page.getByTestId("spreadsheet-row-header-1").click({ button: "right" });
    await page.getByTestId("spreadsheet-insert-row-before").click();
    await expect(page.getByTestId("spreadsheet-cell-1-2")).toHaveText("Budget");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
    await page.reload();
    await expect(page.getByTestId("spreadsheet-cell-1-2")).toHaveText("Budget");
  });

  test("EXL-GRID-002 deletes one row from its header menu", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Suppression de ligne");
    await editSpreadsheetCell(page, 1, 1, "À supprimer");
    await editSpreadsheetCell(page, 1, 2, "À conserver");
    await page.getByTestId("spreadsheet-row-header-1").click({ button: "right" });
    await page.getByTestId("spreadsheet-delete-rows").click();
    await expect(page.getByTestId("spreadsheet-cell-1-1")).toHaveText("À conserver");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
    await page.reload();
    await expect(page.getByTestId("spreadsheet-cell-1-1")).toHaveText("À conserver");
  });

  test("EXL-GRID-005 inserts one column from its header menu", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Insertion de colonne");
    await editSpreadsheetCell(page, 1, 1, "Budget");
    await page.getByTestId("spreadsheet-column-header-1").click({ button: "right" });
    await page.getByTestId("spreadsheet-insert-column-before").click();
    await expect(page.getByTestId("spreadsheet-cell-2-1")).toHaveText("Budget");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
    await page.reload();
    await expect(page.getByTestId("spreadsheet-cell-2-1")).toHaveText("Budget");
  });

  test("EXL-GRID-006 deletes one column from its header menu", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Suppression de colonne");
    await editSpreadsheetCell(page, 1, 1, "À supprimer");
    await editSpreadsheetCell(page, 2, 1, "À conserver");
    await page.getByTestId("spreadsheet-column-header-1").click({ button: "right" });
    await page.getByTestId("spreadsheet-delete-columns").click();
    await expect(page.getByTestId("spreadsheet-cell-1-1")).toHaveText("À conserver");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
    await page.reload();
    await expect(page.getByTestId("spreadsheet-cell-1-1")).toHaveText("À conserver");
  });

  test("EXL-GRID-009 inserts one row below from its header menu", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Insertion de ligne en dessous");
    await editSpreadsheetCell(page, 1, 2, "Ligne suivante");
    await page.getByTestId("spreadsheet-row-header-1").click({ button: "right" });
    await page.getByTestId("spreadsheet-insert-row-after").click();
    await expect(page.getByTestId("spreadsheet-cell-1-3")).toHaveText("Ligne suivante");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
    await page.reload();
    await expect(page.getByTestId("spreadsheet-cell-1-3")).toHaveText("Ligne suivante");
  });

  test("EXL-GRID-010 inserts one column to the right from its header menu", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Insertion de colonne à droite");
    await editSpreadsheetCell(page, 2, 1, "Colonne suivante");
    await page.getByTestId("spreadsheet-column-header-1").click({ button: "right" });
    await page.getByTestId("spreadsheet-insert-column-after").click();
    await expect(page.getByTestId("spreadsheet-cell-3-1")).toHaveText("Colonne suivante");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
    await page.reload();
    await expect(page.getByTestId("spreadsheet-cell-3-1")).toHaveText("Colonne suivante");
  });

  test("EXL-GRID-004 merges adjacent cells and retains the upper-left value", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Fusion de cellules");
    await editSpreadsheetCell(page, 0, 0, "Budget");
    await editSpreadsheetCell(page, 1, 0, "Écarté");
    const nameBox = page.getByTestId("spreadsheet-cell-address");
    await nameBox.fill("A1:B2");
    await nameBox.press("Enter");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId("spreadsheet-merge-cells").click();
    await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveAttribute("colspan", "2");
    await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveAttribute("rowspan", "2");
    await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveText("Budget");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
    await page.reload();
    await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveAttribute("colspan", "2");
    await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveText("Budget");
  });

  test("EXL-GRID-008 unmerges a merged cell and retains its value", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Défusion de cellules");
    await editSpreadsheetCell(page, 0, 0, "Budget");
    const nameBox = page.getByTestId("spreadsheet-cell-address");
    await nameBox.fill("A1:B2");
    await nameBox.press("Enter");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId("spreadsheet-merge-cells").click();
    await page.getByTestId("spreadsheet-cell-0-0").click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId("spreadsheet-merge-cells").click();
    await expect(page.getByTestId("spreadsheet-cell-0-0")).not.toHaveAttribute("colspan", "2");
    await expect(page.getByTestId("spreadsheet-cell-0-0")).not.toHaveAttribute("rowspan", "2");
    await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveText("Budget");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "dirty");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
    await page.reload();
    await expect(page.getByTestId("spreadsheet-cell-0-0")).not.toHaveAttribute("colspan", "2");
    await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveText("Budget");
  });

  test("EXL-FMT-001 applies and persists bold", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Mise en gras persistée");
    await editSpreadsheetCell(page, 0, 0, "Budget");
    await editSpreadsheetCell(page, 0, 1, "Recettes");
    const nameBox = page.getByTestId("spreadsheet-cell-address");
    await nameBox.fill("A1:A2");
    await nameBox.press("Enter");
    await page.getByTestId("spreadsheet-bold").click();
    await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveCSS("font-weight", "700");
    await expect(page.getByTestId("spreadsheet-cell-0-1")).toHaveCSS("font-weight", "700");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
    await page.reload();
    await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveCSS("font-weight", "700");
    await expect(page.getByTestId("spreadsheet-cell-0-1")).toHaveCSS("font-weight", "700");
  });

  test("EXL-FMT-006 applies and persists text color", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Couleur de texte persistée");
    await editSpreadsheetCell(page, 0, 0, "Budget");
    await editSpreadsheetCell(page, 0, 1, "Recettes");
    const nameBox = page.getByTestId("spreadsheet-cell-address");
    await nameBox.fill("A1:A2");
    await nameBox.press("Enter");
    await page.getByTestId("spreadsheet-text-color").click();
    await page.getByTestId("spreadsheet-text-color-option-red").click();
    await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveCSS("color", "rgb(239, 154, 154)");
    await expect(page.getByTestId("spreadsheet-cell-0-1")).toHaveCSS("color", "rgb(239, 154, 154)");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
    await page.reload();
    await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveCSS("color", "rgb(239, 154, 154)");
    await expect(page.getByTestId("spreadsheet-cell-0-1")).toHaveCSS("color", "rgb(239, 154, 154)");
  });

  test("EXL-FMT-007 applies and persists fill color", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Couleur de fond persistée");
    await editSpreadsheetCell(page, 0, 0, "Budget");
    await editSpreadsheetCell(page, 0, 1, "Recettes");
    const nameBox = page.getByTestId("spreadsheet-cell-address");
    await nameBox.fill("A1:A2");
    await nameBox.press("Enter");
    await page.getByTestId("spreadsheet-fill-color").click();
    await page.getByTestId("spreadsheet-fill-color-option-yellow").click();
    await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveCSS("background-color", "rgb(255, 245, 157)");
    await expect(page.getByTestId("spreadsheet-cell-0-1")).toHaveCSS("background-color", "rgb(255, 245, 157)");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
    await page.reload();
    await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveCSS("background-color", "rgb(255, 245, 157)");
    await expect(page.getByTestId("spreadsheet-cell-0-1")).toHaveCSS("background-color", "rgb(255, 245, 157)");
  });

  test("EXL-FMT-008 applies and persists left alignment", async ({ appPage: page }) => {
    await expectPersistentHorizontalAlignment(page, "Alignement à gauche", "left");
  });

  test("EXL-FMT-009 applies and persists top alignment", async ({ appPage: page }) => {
    await expectPersistentCellStyle(page, "Alignement vertical haut", "spreadsheet-vertical-align",
      "spreadsheet-vertical-align-top", "vertical-align", "top");
  });

  test("EXL-FMT-010 applies and persists font family", async ({ appPage: page }) => {
    await expectPersistentCellStyle(page, "Police Verdana", "spreadsheet-font-family",
      "spreadsheet-font-family-verdana", "font-family", "Verdana");
  });

  test("EXL-FMT-011 applies and persists font size", async ({ appPage: page }) => {
    await expectPersistentCellStyle(page, "Grande police", "spreadsheet-font-size",
      "spreadsheet-font-size-large", "font-size", "large");
  });

  test("EXL-FMT-013 applies and persists center alignment", async ({ appPage: page }) => {
    await expectPersistentHorizontalAlignment(page, "Alignement centré", "center");
  });

  test("EXL-FMT-014 applies and persists right alignment", async ({ appPage: page }) => {
    await expectPersistentHorizontalAlignment(page, "Alignement à droite", "right");
  });

  test("EXL-FMT-015 applies and persists justified alignment", async ({ appPage: page }) => {
    await expectPersistentCellStyle(page, "Alignement justifié", "spreadsheet-align",
      "spreadsheet-align-justify", "text-align", "justify");
  });

  test("EXL-FMT-016 applies and persists middle vertical alignment", async ({ appPage: page }) => {
    await expectPersistentCellStyle(page, "Alignement vertical milieu", "spreadsheet-vertical-align",
      "spreadsheet-vertical-align-middle", "vertical-align", "middle");
  });

  test("EXL-FMT-017 applies and persists bottom alignment", async ({ appPage: page }) => {
    await expectPersistentCellStyle(page, "Alignement vertical bas", "spreadsheet-vertical-align",
      "spreadsheet-vertical-align-bottom", "vertical-align", "bottom");
  });

  test("EXL-FMT-012 applies and persists all borders", async ({ appPage: page }) => {
    await expectPersistentBorders(page, "Toutes les bordures", "all", [
      { column: 0, row: 0, side: "top", present: true },
      { column: 0, row: 0, side: "left", present: true },
      { column: 1, row: 1, side: "bottom", present: true },
      { column: 1, row: 1, side: "left", present: true },
      { column: 1, row: 0, side: "right", present: true },
    ]);
  });

  test("EXL-FMT-018 applies and persists outer borders", async ({ appPage: page }, testInfo) => {
    await expectPersistentBorders(page, `Bordure extérieure ${testInfo.repeatEachIndex}`, "outer", [
      { column: 0, row: 0, side: "top", present: true },
      { column: 0, row: 0, side: "left", present: true },
      { column: 1, row: 1, side: "right", present: true },
      { column: 1, row: 1, side: "bottom", present: true },
      { column: 0, row: 0, side: "right", present: false },
    ]);
  });

  test("EXL-FMT-019 applies and persists inner borders", async ({ appPage: page }) => {
    await expectPersistentBorders(page, "Bordures intérieures", "inner", [
      { column: 1, row: 0, side: "left", present: true },
      { column: 0, row: 1, side: "top", present: true },
      { column: 0, row: 0, side: "top", present: false },
      { column: 1, row: 1, side: "right", present: false },
    ]);
  });

  test("EXL-FMT-020 applies and persists inner horizontal borders", async ({ appPage: page }) => {
    await expectPersistentBorders(page, "Bordures horizontales", "horizontal", [
      { column: 0, row: 1, side: "top", present: true },
      { column: 1, row: 1, side: "top", present: true },
      { column: 1, row: 0, side: "left", present: false },
    ]);
  });

  test("EXL-FMT-021 applies and persists inner vertical borders", async ({ appPage: page }) => {
    await expectPersistentBorders(page, "Bordures verticales", "vertical", [
      { column: 1, row: 0, side: "left", present: true },
      { column: 1, row: 1, side: "left", present: true },
      { column: 0, row: 1, side: "top", present: false },
    ]);
  });

  test("EXL-FMT-022 applies and persists a left border", async ({ appPage: page }) => {
    await expectPersistentBorders(page, "Bordure gauche", "left", [
      { column: 0, row: 0, side: "left", present: true },
      { column: 0, row: 1, side: "left", present: true },
      { column: 1, row: 0, side: "left", present: false },
    ]);
  });

  test("EXL-FMT-023 applies and persists a top border", async ({ appPage: page }) => {
    await expectPersistentBorders(page, "Bordure supérieure", "top", [
      { column: 0, row: 0, side: "top", present: true },
      { column: 1, row: 0, side: "top", present: true },
      { column: 0, row: 1, side: "top", present: false },
    ]);
  });

  test("EXL-FMT-024 applies and persists a right border", async ({ appPage: page }) => {
    await expectPersistentBorders(page, "Bordure droite", "right", [
      { column: 1, row: 0, side: "right", present: true },
      { column: 1, row: 1, side: "right", present: true },
      { column: 0, row: 0, side: "right", present: false },
    ]);
  });

  test("EXL-FMT-025 applies and persists a bottom border", async ({ appPage: page }) => {
    await expectPersistentBorders(page, "Bordure inférieure", "bottom", [
      { column: 0, row: 1, side: "bottom", present: true },
      { column: 1, row: 1, side: "bottom", present: true },
      { column: 0, row: 0, side: "bottom", present: false },
    ]);
  });

  test("EXL-FMT-026 clears borders and persists their removal", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Effacement des bordures");
    const nameBox = page.getByTestId("spreadsheet-cell-address");
    await nameBox.fill("A1:B2");
    await nameBox.press("Enter");
    await page.getByTestId("spreadsheet-borders").click();
    await page.getByTestId("spreadsheet-border-all").click();
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "dirty");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
    await page.getByTestId("spreadsheet-borders").click();
    await page.getByTestId("spreadsheet-border-clear").click();
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "dirty");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
    const assertClearedRange = async () => {
      for (const column of [0, 1]) for (const row of [0, 1])
        for (const side of ["top", "right", "bottom", "left"] as const)
          await expect.poll(() => page.getByTestId(`spreadsheet-cell-${column}-${row}`).evaluate((cell, currentSide) => {
            const style = document.createElement("div").style;
            style.cssText = cell.getAttribute("style") ?? "";
            return style.getPropertyValue(`border-${currentSide}-style`);
          }, side)).not.toBe("solid");
    };
    await assertClearedRange();
    await page.reload();
    await assertClearedRange();
  });

  test("EXL-HIST-001 undoes a validated edit", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Annulation historique");
    await editSpreadsheetCell(page, 0, 0, "Budget");
    await page.getByTestId("spreadsheet-undo").click();
    await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveText("");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
  });

  test("EXL-HIST-002 copies and pastes values", async ({ appPage: page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await createSpreadsheetInSeed(page, "Copie de valeurs");
    await editSpreadsheetCell(page, 0, 0, "Budget");
    await editSpreadsheetCell(page, 0, 1, "42");
    const nameBox = page.getByTestId("spreadsheet-cell-address");
    await nameBox.fill("A1:A2");
    await nameBox.press("Enter");
    await page.keyboard.press(process.platform === "darwin" ? "Meta+C" : "Control+C");
    await page.getByTestId("spreadsheet-cell-2-0").click();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+V" : "Control+V");
    await expect(page.getByTestId("spreadsheet-cell-2-0")).toHaveText("Budget");
    await expect(page.getByTestId("spreadsheet-cell-2-1")).toHaveText("42");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
  });

  test("EXL-HIST-003 redoes an undone edit", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Rétablissement historique");
    await editSpreadsheetCell(page, 0, 0, "Budget");
    await page.getByTestId("spreadsheet-undo").click();
    await page.getByTestId("spreadsheet-redo").click();
    await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveText("Budget");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
  });

  test("EXL-HIST-005 copies and pastes visual formatting", async ({ appPage: page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await createSpreadsheetInSeed(page, "Copie de mise en forme");
    await editSpreadsheetCell(page, 0, 0, "Budget");
    await page.getByTestId("spreadsheet-cell-0-0").click();
    await page.getByTestId("spreadsheet-bold").click();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+C" : "Control+C");
    await page.getByTestId("spreadsheet-cell-2-0").click();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+V" : "Control+V");
    await expect(page.getByTestId("spreadsheet-cell-2-0")).toHaveCSS("font-weight", "700");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
    await page.reload();
    await expect(page.getByTestId("spreadsheet-cell-2-0")).toHaveCSS("font-weight", "700");
  });

  test("EXL-HIST-006 undoes a validated edit with the platform shortcut", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Annulation clavier");
    await editSpreadsheetCell(page, 0, 0, "Budget");
    await page.getByTestId("spreadsheet-grid").click();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+Z" : "Control+Z");
    await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveText("");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
  });

  test("EXL-HIST-007 redoes an undone edit with the platform shortcut", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Rétablissement clavier");
    await editSpreadsheetCell(page, 0, 0, "Budget");
    await page.getByTestId("spreadsheet-grid").click();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+Z" : "Control+Z");
    await page.keyboard.press(process.platform === "darwin" ? "Meta+Y" : "Control+Y");
    await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveText("Budget");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
  });

  test("EXL-HIST-008 cuts a range and pastes it to a destination", async ({ appPage: page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await createSpreadsheetInSeed(page, "Déplacement de plage");
    await editSpreadsheetCell(page, 0, 0, "Budget");
    await editSpreadsheetCell(page, 0, 1, "42");
    const nameBox = page.getByTestId("spreadsheet-cell-address");
    await nameBox.fill("A1:A2");
    await nameBox.press("Enter");
    await page.keyboard.press(process.platform === "darwin" ? "Meta+X" : "Control+X");
    await page.getByTestId("spreadsheet-cell-2-0").click();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+V" : "Control+V");
    await expect(page.getByTestId("spreadsheet-cell-0-0")).toHaveText("");
    await expect(page.getByTestId("spreadsheet-cell-0-1")).toHaveText("");
    await expect(page.getByTestId("spreadsheet-cell-2-0")).toHaveText("Budget");
    await expect(page.getByTestId("spreadsheet-cell-2-1")).toHaveText("42");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
  });

});

test.describe("spreadsheet Hall integration", () => {
  test("EXL-LAYOUT-002 opens a stable Hall fullscreen with internal sheet scrolling", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Vue étendue stable");
    for (let index = 0; index < 4; index += 1) {
      await page.getByTestId(`spreadsheet-column-header-${7 + index}`).click({ button: "right" });
      await page.getByTestId("spreadsheet-insert-column-after").click();
    }
    await page.getByTestId("spreadsheet-fullscreen").click();
    const extendedEditor = page.getByTestId("spreadsheet-editor-fullscreen");
    const title = page.getByTestId("spreadsheet-fullscreen-title");
    const close = page.getByTestId("spreadsheet-fullscreen-close");
    const sheetScroll = page.getByTestId("spreadsheet-sheet-scroll");
    await expect(extendedEditor).toBeVisible();
    await page.getByTestId("spreadsheet-fullscreen-dialog").evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    await expect(title).toHaveText("Vue étendue stable");
    await expect(close).toBeVisible();
    await expect(sheetScroll).toBeVisible();
    const titlePosition = await title.boundingBox();
    const closePosition = await close.boundingBox();
    await sheetScroll.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event("scroll"));
    });
    await expect.poll(() => sheetScroll.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await expect.poll(() => sheetScroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    const titleAfterScroll = await title.boundingBox();
    const closeAfterScroll = await close.boundingBox();
    expect(titlePosition).not.toBeNull();
    expect(closePosition).not.toBeNull();
    expect(titleAfterScroll).not.toBeNull();
    expect(closeAfterScroll).not.toBeNull();
    expect(titleAfterScroll!.x).toBeCloseTo(titlePosition!.x, 0);
    expect(titleAfterScroll!.y).toBeCloseTo(titlePosition!.y, 0);
    expect(closeAfterScroll!.x).toBeCloseTo(closePosition!.x, 0);
    expect(closeAfterScroll!.y).toBeCloseTo(closePosition!.y, 0);
    expect(await extendedEditor.evaluate((element) => ({ left: element.scrollLeft, top: element.scrollTop })))
      .toEqual({ left: 0, top: 0 });
  });

  test("EXL-LAYOUT-003 closes fullscreen without losing saved data", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Fermeture de vue étendue");
    await page.getByTestId("spreadsheet-cell-1-1").click();
    await page.getByTestId("spreadsheet-fullscreen").click();
    await expect(page.getByTestId("spreadsheet-editor-fullscreen")).toBeVisible();
    await editSpreadsheetCell(page, 1, 1, "42");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
    await page.getByTestId("spreadsheet-fullscreen-close").click();
    await expect(page.getByTestId("spreadsheet-editor-fullscreen")).toHaveCount(0);
    await expect(page.getByTestId("spreadsheet-cell-address")).toHaveValue("B2");
    await expect(page.getByTestId("spreadsheet-cell-1-1")).toHaveText("42");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
    await page.reload();
    await expect(page.getByTestId("spreadsheet-cell-1-1")).toHaveText("42");
  });

  test("EXL-LAYOUT-001 scrolls the sheet without moving Workbench chrome", async ({ appPage: page }) => {
    await createSpreadsheetInSeed(page, "Défilement interne de la feuille");
    const workbench = page.getByTestId("resource-workbench");
    const header = page.getByTestId("resource-workbench-header");
    const sheetScroll = page.getByTestId("spreadsheet-sheet-scroll");
    const workbenchTop = (await workbench.boundingBox())?.y;
    const headerTop = (await header.boundingBox())?.y;

    await sheetScroll.hover();
    await page.mouse.wheel(0, 1_000);
    await expect.poll(() => sheetScroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect((await workbench.boundingBox())?.y).toBe(workbenchTop);
    expect((await header.boundingBox())?.y).toBe(headerTop);
  });

  test("EXL-LAYOUT-004 changes display modality without interrupting the editing session", async ({
    appPage: page,
  }) => {
    await createSpreadsheetInSeed(page, "Continuité vue étendue");

    const saveRequests: string[] = [];
    page.on("request", (request) => {
      if (request.postData()?.includes('"expectedVersion"')) saveRequests.push(request.url());
    });

    const nameBox = page.getByTestId("spreadsheet-cell-address");
    await nameBox.fill("B2:C3");
    await nameBox.press("Enter");
    await expect(page.getByTestId("spreadsheet-cell-1-1")).toHaveClass(/highlight/);
    await expect(page.getByTestId("spreadsheet-cell-2-2")).toHaveClass(/highlight/);

    const draft = "=SOMME(B2:C3)+10";
    const formulaInput = page.getByTestId("spreadsheet-formula-input");
    await formulaInput.click();
    await formulaInput.pressSequentially(draft);
    await formulaInput.press("Home");
    for (let index = 0; index < 8; index += 1) await formulaInput.press("ArrowRight");
    await page.getByTestId("spreadsheet-formula-expand").click();
    await expect(page.getByTestId("spreadsheet-formula-expand")).toHaveAttribute("aria-pressed", "true");
    await expect(formulaInput).toHaveJSProperty("selectionStart", 8);
    await expect(formulaInput).toHaveJSProperty("selectionEnd", 8);

    await page.getByTestId("spreadsheet-fullscreen").click();
    await expect(page.getByTestId("spreadsheet-editor-fullscreen")).toBeVisible();
    await expect(page.getByTestId("spreadsheet-cell-address")).toHaveValue("B2");
    await expect(page.getByTestId("spreadsheet-cell-1-1")).toHaveClass(/highlight/);
    await expect(page.getByTestId("spreadsheet-cell-2-2")).toHaveClass(/highlight/);
    await expect(page.getByTestId("spreadsheet-formula-input")).toHaveValue(draft);
    await expect(page.getByTestId("spreadsheet-formula-input")).toHaveJSProperty("selectionStart", 8);
    await expect(page.getByTestId("spreadsheet-formula-input")).toHaveJSProperty("selectionEnd", 8);
    await expect(page.getByTestId("spreadsheet-formula-expand")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("spreadsheet-formula-cancel")).toBeVisible();
    await expect(page.getByTestId("spreadsheet-formula-validate")).toBeVisible();
    await expect(page.getByTestId("spreadsheet-cell-1-1")).toHaveText("");

    await page.getByTestId("spreadsheet-fullscreen-close").click();
    await expect(page.getByTestId("spreadsheet-editor-fullscreen")).toHaveCount(0);
    await expect(page.getByTestId("spreadsheet-cell-address")).toHaveValue("B2");
    await expect(page.getByTestId("spreadsheet-formula-input")).toHaveValue(draft);
    await expect(page.getByTestId("spreadsheet-formula-input")).toHaveJSProperty("selectionStart", 8);
    await expect(page.getByTestId("spreadsheet-formula-input")).toHaveJSProperty("selectionEnd", 8);
    await expect(page.getByTestId("spreadsheet-formula-expand")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("spreadsheet-cell-1-1")).toHaveText("");
    await page.waitForTimeout(1_200);
    expect(saveRequests).toEqual([]);
  });

});

test.describe("spreadsheet smoke", () => {
  test("creates, calculates and reloads a spreadsheet resource", async ({ appPage: page }) => {
    test.setTimeout(90_000);
    await useFrenchInterface(page);
    await createSpreadsheetInSeed(page, "Budget de fonctionnement test");
    await editSpreadsheetCell(page, 1, 1, "3");
    await editSpreadsheetCell(page, 2, 1, "12.345");
    await editSpreadsheetCell(page, 3, 1, "=ROUND(B2*C2,2)");
    await expect(page.getByTestId("spreadsheet-cell-3-1")).toHaveText("37.04");
    await expect(page.getByTestId("workspace-save-status")).toHaveAttribute("data-state", "saved");
    await page.reload();
    await expect(page.getByTestId("spreadsheet-editor")).toBeVisible();
    await expect(page.getByTestId("spreadsheet-cell-1-1")).toHaveText("3");
    await expect(page.getByTestId("spreadsheet-cell-2-1")).toHaveText("12.345");
    await expect(page.getByTestId("spreadsheet-cell-3-1")).toHaveText("37.04");
  });

});

test.describe("workspace explorer", () => {
  test("keeps the workspace home focused on active council work", async ({ appPage: page }) => {
    await page.goto("/app/workspace");

    await expect(page.getByTestId("workspace-home-active-count")).toContainText("7");
    await expect(page.getByText("Subventions aux associations 2026", { exact: true })).toBeVisible();
    await expect(page.getByText("Éclairage public - engagement de la tranche 2", { exact: true })).toBeVisible();
    await expect(page.getByText("Cession de la parcelle AB 127", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Tarifs de la restauration scolaire 2026-2027", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("workspace-home-folder-travaux")).toBeVisible();
  });

  test("presents one filtered tree and previews documents directly", async ({ appPage: page }) => {
    await page.goto("/app/workspace?path=finances");
    const document = page
      .locator('[data-testid^="workspace-resource-open-"]')
      .filter({ hasText: "Compte administratif 2025" });

    await expect(page.getByTestId("workspace-view-all")).toHaveAttribute("aria-pressed", "true");
    await expect(document).toBeVisible();
    const business = page.locator('[data-testid^="workspace-business-open-"]').first();
    await expect(business).toBeVisible();
    await expect(business.locator('[data-testid^="workspace-business-lifecycle-"]')).toBeVisible();
    await expect(business).not.toContainText("pièce");
    await expect(document.locator('[data-testid^="workspace-resource-metadata-"]')).toContainText("PDF");
    await expect(document.locator('[data-testid^="workspace-resource-metadata-"]')).toContainText(
      /\d{2}\/\d{2}\/\d{4}/,
    );
    await expect(page.locator(".workspace-explorer-count")).toHaveCount(0);
    await expect(page.locator(".workspace-tree-count")).toHaveCount(0);

    await page.getByTestId("workspace-view-resources").click();
    await expect(page.locator('[data-testid^="workspace-business-open-"]')).toHaveCount(0);
    await expect(document).toBeVisible();

    await page.getByTestId("workspace-view-all").click();
    await page.getByTestId("workspace-tree-filter").fill("Compte administratif 2025");
    await expect(document).toBeVisible();
    await expect(page.locator('[data-testid^="workspace-resource-open-"]')).toHaveCount(1);

    await document.click();
    await expect(page.getByTestId("resource-preview")).toBeVisible();
    await expect(page.getByTestId("resource-preview-object")).toBeVisible();
    await page.getByTestId("resource-preview-close").click();
    await expect(page.getByTestId("resource-preview")).toHaveCount(0);
  });
});
