import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, cp, mkdir, readdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { isBuiltin } from "node:module";
import { dirname, join, resolve, sep } from "node:path";
import { build } from "esbuild";

// @implements-requirement HALL-TR-DST-010
const root = resolve(import.meta.dirname, "../..");
const output = join(root, "dist/npm");
const stage = join(output, "package");
const metadata = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const lock = JSON.parse(await readFile(join(root, "package-lock.json"), "utf8"));
function run(command, args, cwd = root) {
  const executable = command === "npm" ? process.execPath : command;
  const parameters = command === "npm" ? [process.env.npm_execpath, ...args] : args;
  if (command === "npm" && !process.env.npm_execpath)
    throw new Error("Run this build through npm run pack:distribution");
  const result = spawnSync(executable, parameters, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}
const workspaces = ["contracts", "api-contract", "mcp", "domain", "templating", "postgres", "server", "client"];
for (const name of workspaces) run("npm", ["run", "build", "-w", `@hall/${name}`]);
await rm(stage, { recursive: true, force: true });
await mkdir(join(stage, "bin"), { recursive: true });

const result = await build({
  absWorkingDir: root,
  entryPoints: ["packages/server/standalone/hall.mjs"],
  outfile: join(stage, "bin/hall.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  metafile: true,
  plugins: [
    {
      name: "external-runtime-dependencies",
      setup(builder) {
        builder.onResolve({ filter: /^[^./]/ }, ({ path }) => {
          if (path.startsWith("@hall/") || path.startsWith(root)) return;
          return { path, external: true };
        });
      },
    },
  ],
});
const dependencies = {};
for (const file of Object.values(result.metafile.outputs)) {
  for (const entry of file.imports.filter((entry) => entry.external && !isBuiltin(entry.path))) {
    const name = entry.path.startsWith("@") ? entry.path.split("/").slice(0, 2).join("/") : entry.path.split("/")[0];
    const installed = lock.packages[`node_modules/${name}`];
    if (!installed?.version || !installed.integrity || !installed.resolved?.startsWith("https://registry.npmjs.org/")) {
      throw new Error(`Runtime dependency ${name} must resolve to a locked npm registry version`);
    }
    dependencies[name] = installed.version;
  }
}
// The explicit browser installer resolves its CLI dynamically.
dependencies.playwright = lock.packages["node_modules/playwright"].version;
await cp(join(root, "packages/client/dist"), join(stage, "client"), { recursive: true });
await cp(join(root, "packages/postgres/sql"), join(stage, "sql"), {
  recursive: true,
  filter: (path) => !path.split(sep).includes("test"),
});
await mkdir(join(stage, "licenses"));
const visited = new Set();
const notices = [];
async function collectClientLicenses(directory) {
  const actual = await realpath(directory);
  if (visited.has(actual)) return;
  visited.add(actual);
  const current = JSON.parse(await readFile(join(actual, "package.json"), "utf8"));
  const licenseFiles = (await readdir(actual)).filter((name) =>
    /^(license|licence|copying|notice)(?:[.-]|$)/i.test(name),
  );
  const destination = join(stage, "licenses/client", `${current.name.replaceAll("/", "-")}-${current.version}`);
  for (const name of licenseFiles) {
    await mkdir(destination, { recursive: true });
    await cp(join(actual, name), join(destination, name), { recursive: true });
  }
  notices.push({ name: current.name, version: current.version, license: current.license ?? null, licenseFiles });
  for (const name of Object.keys(current.dependencies ?? {})) {
    let from = actual;
    while (true) {
      const candidate = join(from, "node_modules", name);
      try {
        if ((await stat(join(candidate, "package.json"))).isFile()) {
          await collectClientLicenses(candidate);
          break;
        }
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      const parent = dirname(from);
      if (from === parent) throw new Error(`Missing client dependency ${name} required by ${actual}`);
      from = parent;
    }
  }
}
await collectClientLicenses(join(root, "packages/client"));
await writeFile(join(stage, "licenses/client-dependencies.json"), `${JSON.stringify(notices, null, 2)}\n`);
await cp(join(root, "docs/distribution.md"), join(stage, "README.md"));
await cp(join(root, "docs/distribution.md"), join(stage, "distribution.md"));
await cp(join(root, "docs/municipal-bootstrap.md"), join(stage, "municipal-bootstrap.md"));
const manifest = {
  name: "@ng-galien/hall",
  version: metadata.version,
  description: "Standalone Hall municipal council server and web interface",
  type: "module",
  license: "UNLICENSED",
  engines: { node: ">=22.12.0" },
  bin: { hall: "bin/hall.mjs" },
  files: ["bin", "client", "sql", "licenses", "release.json", "README.md", "distribution.md", "municipal-bootstrap.md"],
  dependencies: Object.fromEntries(Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b))),
};
await writeFile(join(stage, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
const { loadSchemaManifest } = await import("../../packages/postgres/dist/schemaManifest.js");
await writeFile(
  join(stage, "release.json"),
  `${JSON.stringify(
    {
      name: manifest.name,
      version: manifest.version,
      schemaFingerprint: (await loadSchemaManifest()).fingerprint,
      runtimeDependencies: Object.fromEntries(
        Object.keys(manifest.dependencies).map((name) => {
          const { version, resolved, integrity } = lock.packages[`node_modules/${name}`];
          return [name, { version, resolved, integrity }];
        }),
      ),
    },
    null,
    2,
  )}\n`,
);
await chmod(join(stage, "bin/hall.mjs"), 0o755);
console.log(`Standalone package prepared in ${stage}`);
if (process.argv.includes("--pack")) {
  run("npm", ["pack", "--loglevel=error", "--ignore-scripts", "--pack-destination", output], stage);
  const archive = `ng-galien-hall-${manifest.version}.tgz`;
  const digest = createHash("sha256")
    .update(await readFile(join(output, archive)))
    .digest("hex");
  await writeFile(join(output, `${archive}.sha256`), `${digest}  ${archive}\n`);
}
