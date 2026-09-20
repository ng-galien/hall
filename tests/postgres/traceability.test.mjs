import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const councilDirectory = resolve(root, "packages/postgres/sql/council");
const workspaceDirectory = resolve(root, "packages/postgres/sql/workspace");
const testDirectory = resolve(councilDirectory, "test");

function sqlFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => resolve(directory, entry.name));
}

function contents(files) {
  return files.map((file) => readFileSync(file, "utf8"));
}

function matches(texts, expression) {
  return texts.flatMap((text) => [...text.matchAll(expression)].map((match) => match[1]));
}

function requireEmpty(values, message) {
  if (values.length > 0) throw new Error(`${message}: ${values.join(", ")}`);
}

test("PostgreSQL requirements and SQLSTATEs remain traceable", () => {
  const requirements = spawnSync(process.execPath, [resolve(root, "scripts/checks/check-requirements.mjs")], {
    cwd: root,
    stdio: "inherit",
  });
  if (requirements.error) throw requirements.error;
  if (requirements.status !== 0) throw new Error(`Requirements check failed with status ${requirements.status}`);

  const productionSql = contents(sqlFiles(councilDirectory));
  const applicationSql = contents([
    ...sqlFiles(councilDirectory).filter((file) => !file.endsWith("002-error-codes.sql")),
    ...sqlFiles(workspaceDirectory),
  ]);
  const postgresTests = contents(sqlFiles(testDirectory).filter((file) => file.endsWith(".test.sql")));
  const catalogueSql = readFileSync(resolve(councilDirectory, "002-error-codes.sql"), "utf8");

  const productionRequirements = matches(
    productionSql,
    /@(?:functional-requirement|technical-requirement|implements-requirement) (HALL-(?:FR|TR)-[A-Z]+-[0-9]{3})/g,
  ).sort();
  requireEmpty(
    productionRequirements.filter((requirement, index) => productionRequirements[index - 1] === requirement),
    "Requirement annotations are reused",
  );
  const coveredRequirements = new Set(matches(postgresTests, /(HALL-(?:FR|TR)-[A-Z]+-[0-9]{3})/g));
  requireEmpty(
    productionRequirements.filter((requirement) => !coveredRequirements.has(requirement)),
    "Council requirements are missing from PostgreSQL tests",
  );

  const usedCodes = new Set(matches(applicationSql, /ERRCODE\s*=\s*'(HV[0-9]{3})'/g));
  const cataloguedCodes = matches([catalogueSql], /^-- (HV[0-9]{3})/gm).sort();
  requireEmpty(
    cataloguedCodes.filter((code, index) => cataloguedCodes[index - 1] === code),
    "SQLSTATE catalogue entries are duplicated",
  );
  requireEmpty(cataloguedCodes.filter((code) => !usedCodes.has(code)), "Catalogued SQLSTATE codes are unused");
  const assertedCodes = new Set(matches(postgresTests, /'(HV[0-9]{3})'/g));
  requireEmpty(cataloguedCodes.filter((code) => !assertedCodes.has(code)), "SQLSTATE codes are missing from PostgreSQL tests");

  const nativeCodes = [...new Set(matches(postgresTests, /'(235(?:02|03|05|14))'/g))].sort();
  const requiredNativeCodes = ["23502", "23503", "23505", "23514"];
  if (JSON.stringify(nativeCodes) !== JSON.stringify(requiredNativeCodes)) {
    throw new Error(`Native PostgreSQL SQLSTATE coverage differs: ${nativeCodes.join(", ")}`);
  }

  const applicationLines = applicationSql.flatMap((text) => text.split("\n"));
  const raiseCount = applicationLines.filter((line) => /RAISE EXCEPTION/.test(line)).length;
  const codedRaiseCount = applicationLines.filter((line) =>
    /ERRCODE\s*=\s*'(?:HV[0-9]{3}|23502|23503|23505|23514)'/.test(line),
  ).length;
  if (raiseCount !== codedRaiseCount) {
    throw new Error(
      `Every RAISE EXCEPTION must declare an accepted SQLSTATE (${raiseCount} raises, ${codedRaiseCount} codes)`,
    );
  }
});
