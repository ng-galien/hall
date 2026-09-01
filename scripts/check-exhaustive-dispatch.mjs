import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import ts from "typescript";

const projectRoot = process.cwd();
const ignoredDirectories = new Set(["coverage", "dist", "node_modules", "out"]);
const typescriptExtensions = new Set([".cts", ".mts", ".ts", ".tsx"]);
const requestedPaths = process.argv.slice(2);
const roots = (requestedPaths.length > 0 ? requestedPaths : ["packages"]).map((entry) => resolve(projectRoot, entry));

function sourceFiles(path) {
  const stats = statSync(path);
  if (stats.isFile()) return typescriptExtensions.has(extname(path)) ? [path] : [];
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => !ignoredDirectories.has(entry.name))
    .flatMap((entry) => sourceFiles(join(path, entry.name)));
}

function switchLocations(path, source = readFileSync(path, "utf8")) {
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    extname(path) === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const locations = [];
  const visit = (node) => {
    if (ts.isSwitchStatement(node)) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      locations.push(position.line + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return locations;
}

const switchProbe = switchLocations("probe.ts", "const value = 'switch';\nswitch (value) { default: break; }");
const textProbe = switchLocations("probe.ts", "const value = 'switch';\n// switch (value) {}\n");
if (switchProbe.length !== 1 || switchProbe[0] !== 2 || textProbe.length !== 0) {
  throw new Error("TypeScript switch detection self-test failed.");
}

const violations = roots
  .flatMap(sourceFiles)
  .flatMap((path) => switchLocations(path).map((line) => `${relative(projectRoot, path)}:${line}`));

if (violations.length > 0) {
  console.error("Switch statements bypass Hall's exhaustive matcher authority:");
  for (const violation of violations) console.error(`- ${violation}`);
  console.error("Use matchDiscriminated, matchLiteral, or a named exhaustive domain matcher.");
  process.exitCode = 1;
}
