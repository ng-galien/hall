import { spawn } from "node:child_process";
import { cp, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";

const projectRoot = resolve(import.meta.dirname, "../..");
const desktopRoot = import.meta.dirname;
const require = createRequire(import.meta.url);
const runtimePackages = ["contracts", "api-contract", "mcp", "domain", "templating", "postgres", "server"];
const browserDirectory = join(desktopRoot, "dist", "playwright");

async function packageDirectory(name, from, optional = false) {
  let directory = from;
  while (true) {
    const candidate = join(directory, "node_modules", name);
    try {
      if ((await stat(join(candidate, "package.json"))).isFile()) return realpath(candidate);
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  if (optional) return null;
  throw new Error(`Missing production dependency ${name} required by ${from}`);
}

function packagedDirectory(source, buildPath) {
  const installedRoot = join(projectRoot, "node_modules");
  if (source.startsWith(`${installedRoot}${sep}`)) {
    return join(buildPath, "node_modules", relative(installedRoot, source));
  }
  for (const name of runtimePackages) {
    const workspaceRoot = join(projectRoot, "packages", name);
    if (source === workspaceRoot || source.startsWith(`${workspaceRoot}${sep}`)) {
      return join(buildPath, "node_modules", "@hall", name, relative(workspaceRoot, source));
    }
  }
  throw new Error(`Dependency is outside the supported workspace installation: ${source}`);
}

async function copyProductionRuntime(buildPath) {
  const visited = new Set();
  const manifest = [];
  async function copyPackage(source) {
    if (visited.has(source)) return;
    visited.add(source);
    const metadata = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
    const destination = packagedDirectory(source, buildPath);
    await mkdir(destination, { recursive: true });
    if (runtimePackages.some((name) => source === join(projectRoot, "packages", name))) {
      await cp(join(source, "package.json"), join(destination, "package.json"));
      await cp(join(source, "dist"), join(destination, "dist"), {
        recursive: true,
        filter: (file) => !file.includes("__tests__") && !/\.test\.[^/]+$/.test(file),
      });
      if (metadata.name === "@hall/postgres") {
        await cp(join(source, "sql"), join(destination, "sql"), {
          recursive: true,
          filter: (file) => !relative(join(source, "sql"), file).split(sep).includes("test"),
        });
      }
    } else {
      await cp(source, destination, {
        recursive: true,
        verbatimSymlinks: true,
        filter: (file) => !relative(source, file).split(sep).includes("node_modules"),
      });
    }
    manifest.push({ name: metadata.name, version: metadata.version, path: relative(buildPath, destination) });
    const optional = metadata.optionalDependencies ?? {};
    const dependencies = { ...metadata.peerDependencies, ...metadata.dependencies, ...optional };
    for (const name of Object.keys(dependencies)) {
      const dependency = await packageDirectory(
        name,
        source,
        name in optional || metadata.peerDependenciesMeta?.[name]?.optional === true,
      );
      if (dependency) await copyPackage(dependency);
    }
  }
  await copyPackage(await packageDirectory("@hall/server", desktopRoot));
  await writeFile(
    join(buildPath, "runtime-manifest.json"),
    `${JSON.stringify(
      manifest.sort((a, b) => a.path.localeCompare(b.path)),
      null,
      2,
    )}\n`,
  );
}

function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolveRun() : reject(new Error(`${command} ${args.join(" ")} failed: ${code}`)),
    );
  });
}

/** Replaces the signature invalidated by packaging with an ad-hoc signature; no developer identity is used. */
async function signMacApplicationAdHoc(outputPaths) {
  for (const outputPath of outputPaths) {
    const application = join(outputPath, "Hall.app");
    await run("codesign", ["--force", "--deep", "--sign", "-", application]);
    await run("codesign", ["--verify", "--deep", "--strict", application]);
  }
}

const desktopEditions = ["local", "demonstration"];

async function writeDesktopEdition(buildPath) {
  const edition = process.env.HALL_DESKTOP_EDITION ?? "local";
  if (!desktopEditions.includes(edition)) throw new Error(`Unknown HALL_DESKTOP_EDITION: ${edition}`);
  await writeFile(join(buildPath, "edition.json"), `${JSON.stringify({ edition })}\n`);
}

async function prepareBrowserRuntime(platform, arch) {
  if (platform !== process.platform || arch !== process.arch) {
    throw new Error(
      "Package Hall on the target OS and architecture so its native dependencies and Chromium match the app.",
    );
  }
  await new Promise((resolveInstall, reject) => {
    const child = spawn(
      process.execPath,
      [
        join(dirname(require.resolve("playwright/package.json")), require("playwright/package.json").bin.playwright),
        "install",
        "chromium",
        "--only-shell",
      ],
      {
        stdio: "inherit",
        env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browserDirectory },
      },
    );
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolveInstall() : reject(new Error(`Chromium installation failed: ${code}`)),
    );
  });
}

export default {
  packagerConfig: {
    name: "Hall",
    executableName: "Hall",
    asar: false,
    prune: false,
    extraResource: [resolve(import.meta.dirname, "../client/dist"), browserDirectory],
    ignore: [
      /^\/(?:src|scripts|out|node_modules)(?:\/|$)/,
      /^\/dist\/playwright(?:\/|$)/,
      /^\/(?:forge\.config\.mjs|tsconfig\.json)$/,
    ],
  },
  hooks: {
    prePackage: (_config, platform, arch) => prepareBrowserRuntime(platform, arch),
    packageAfterCopy: async (_config, buildPath) => {
      await copyProductionRuntime(buildPath);
      await writeDesktopEdition(buildPath);
    },
    postPackage: async (_config, { platform, outputPaths }) => {
      if (platform === "darwin") await signMacApplicationAdHoc(outputPaths);
    },
  },
  makers: [
    { name: "@electron-forge/maker-squirrel", config: { name: "hall" } },
    { name: "@electron-forge/maker-zip", platforms: ["darwin"] },
    { name: "@electron-forge/maker-deb", config: { options: { bin: "Hall" } } },
    { name: "@electron-forge/maker-rpm", config: { options: { bin: "Hall" } } },
  ],
};
