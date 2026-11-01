import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const manifest = join(root, "node_modules/.cache/hall/build.json");
const workspaces = [
  "contracts",
  "api-contract",
  "domain",
  "mcp",
  "templating",
  "postgres",
  "server",
  "client",
  "desktop",
];
function digest(entries) {
  const hash = createHash("sha256");
  for (const entry of entries.sort())
    hash
      .update(entry)
      .update("\0")
      .update(readFileSync(join(root, entry)))
      .update("\0");
  return hash.digest("hex");
}
function trackedFiles() {
  const result = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr);
  const files = [...new Set(result.stdout.split("\0").filter(Boolean))].filter((path) => existsSync(join(root, path)));
  for (const name of [".env", ".env.local", ".env.production", ".env.production.local"]) {
    const path = `packages/client/${name}`;
    if (existsSync(join(root, path)) && !files.includes(path)) files.push(path);
  }
  return files;
}
function buildEnvironment() {
  return Object.fromEntries(
    Object.entries(process.env)
      .filter(([key]) => key === "NODE_ENV" || key.startsWith("VITE_"))
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}
function revision() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}
export function cachePrefix() {
  return `${process.platform}-${process.arch}-node${process.versions.node}-${digest(["package-lock.json"])}`;
}
export function sourceKey() {
  const inputs = createHash("sha256")
    .update(digest(trackedFiles()))
    .update(JSON.stringify(buildEnvironment()))
    .update(revision())
    .digest("hex");
  return `${cachePrefix()}-${inputs}`;
}
function workspaceKey(name, outputs) {
  const directory = `packages/${name}/`;
  const inputs = trackedFiles().filter(
    (path) =>
      (path.startsWith(directory) &&
        !path.startsWith(`${directory}tests/`) &&
        !path.startsWith(`${directory}test/`) &&
        !path.startsWith(`${directory}e2e/`)) ||
      ["package-lock.json", "tsconfig.base.json", "scripts/testing/build.mjs"].includes(path) ||
      (name === "client" && path === "package.json") ||
      (name === "desktop" && path.startsWith("site/")),
  );
  const metadata = JSON.parse(readFileSync(join(root, directory, "package.json"), "utf8"));
  const dependencies = Object.keys({ ...metadata.dependencies, ...metadata.devDependencies })
    .filter((entry) => entry.startsWith("@hall/"))
    .sort();
  const dependencyOutputs = dependencies.map((entry) => {
    const value = outputs[entry.slice(6)];
    if (!value) throw new Error(`Build order does not provide ${entry} before ${name}`);
    return [entry, value];
  });
  return createHash("sha256")
    .update(cachePrefix())
    .update(digest(inputs))
    .update(JSON.stringify(dependencyOutputs))
    .update(name === "client" ? JSON.stringify(buildEnvironment()) + revision() : "")
    .digest("hex");
}

function outputFiles(selected = workspaces) {
  const files = [];
  function visit(path) {
    for (const entry of readdirSync(join(root, path), { withFileTypes: true })) {
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile()) files.push(child);
    }
  }
  for (const workspace of selected) visit(`packages/${workspace}/dist`);
  return files;
}
export function verifyBuild() {
  const saved = JSON.parse(readFileSync(manifest, "utf8"));
  if (saved.source !== sourceKey() || saved.output !== digest(outputFiles()))
    throw new Error("Hall build is absent, stale or modified; run npm run build:verified");
  return saved;
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  if (process.argv.includes("--prefix")) console.log(cachePrefix());
  else if (process.argv.includes("--key")) console.log(sourceKey());
  else if (process.argv.includes("--verify")) console.log(JSON.stringify(verifyBuild()));
  else {
    let valid = false;
    try {
      verifyBuild();
      valid = true;
    } catch {
      /* A cache miss requires a current build. */
    }
    if (valid) console.log("Verified current Hall build reused");
    else {
      const source = sourceKey();
      let saved = {};
      try {
        saved = JSON.parse(readFileSync(join(root, "node_modules/.cache/hall/workspaces.json"), "utf8"));
      } catch {
        /* No trusted component cache yet. */
      }
      const current = {};
      const outputs = {};
      for (const name of workspaces) {
        const input = workspaceKey(name, outputs);
        let output;
        try {
          output = digest(outputFiles([name]));
        } catch {
          /* Missing outputs require compilation. */
        }
        const reused = saved[name]?.input === input && saved[name]?.output === output;
        const began = Date.now();
        if (!reused) {
          const result = spawnSync("npm", ["run", "build", "-w", `@hall/${name}`], {
            cwd: root,
            stdio: "inherit",
            shell: process.platform === "win32",
          });
          if (result.status !== 0) process.exit(result.status ?? 1);
          output = digest(outputFiles([name]));
        }
        outputs[name] = output;
        current[name] = { input, output };
        console.log(
          `[build] ${name}: ${reused ? "verified reuse" : "compiled"} in ${((Date.now() - began) / 1000).toFixed(2)}s`,
        );
      }
      mkdirSync(join(root, "node_modules/.cache/hall"), { recursive: true });
      writeFileSync(join(root, "node_modules/.cache/hall/workspaces.json"), JSON.stringify(current));
      if (source !== sourceKey()) throw new Error("Sources changed during the build; refusing mixed outputs");
      mkdirSync(join(root, "node_modules/.cache/hall"), { recursive: true });
      writeFileSync(
        manifest,
        JSON.stringify({ source, output: digest(outputFiles()), builtAt: new Date().toISOString() }),
      );
    }
  }
}
