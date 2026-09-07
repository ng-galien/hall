import { spawn } from "node:child_process";
import { cp, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";

const desktopRoot = resolve(import.meta.dirname, "..");
const projectRoot = resolve(desktopRoot, "../..");
const require = createRequire(import.meta.url);
const runtimePackages = ["contracts", "api-contract", "domain", "templating", "postgres", "server"];
export const browserDirectory = join(desktopRoot, "dist", "playwright");

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
  if (source.startsWith(`${installedRoot}${sep}`))
    return join(buildPath, "node_modules", relative(installedRoot, source));
  for (const name of runtimePackages) {
    const workspaceRoot = join(projectRoot, "packages", name);
    if (source === workspaceRoot || source.startsWith(`${workspaceRoot}${sep}`)) {
      return join(buildPath, "node_modules", "@hall", name, relative(workspaceRoot, source));
    }
  }
  throw new Error(`Dependency is outside the supported workspace installation: ${source}`);
}

export async function copyProductionRuntime(buildPath) {
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

export async function prepareBrowserRuntime(platform, arch) {
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
