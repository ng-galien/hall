import { createHash } from "node:crypto";
import { copyFile, cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { refreshPublishedPage } from "./src/publication";
import { studioVersions } from "./studio/server";

const publicDirectory = fileURLToPath(new URL("./public/", import.meta.url));
const versionsModule = "virtual:public-file-versions";
const resolvedVersionsModule = `\0${versionsModule}`;

/** Short content hash, appended as ?v= so that a changed file gets a new URL. */
async function contentVersion(file: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(file))
    .digest("hex")
    .slice(0, 10);
}

async function directoryVersions(directory: string): Promise<Record<string, string>> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const versions: Record<string, string> = {};
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith(".")) continue;
    const file = join(entry.parentPath, entry.name);
    versions[relative(directory, file).split(sep).join("/")] = await contentVersion(file);
  }
  return versions;
}

/** Exposes the content version of every file in public/ to the site code. */
function publicFileVersions(): Plugin {
  return {
    name: "hall-public-file-versions",
    resolveId: (id) => (id === versionsModule ? resolvedVersionsModule : undefined),
    async load(id) {
      if (id !== resolvedVersionsModule) return undefined;
      return `export default ${JSON.stringify(await directoryVersions(publicDirectory))};`;
    },
    configureServer(server) {
      const refresh = (file: string) => {
        if (!file.startsWith(publicDirectory)) return;
        const module = server.moduleGraph.getModuleById(resolvedVersionsModule);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("add", refresh);
      server.watcher.on("change", refresh);
      server.watcher.on("unlink", refresh);
    },
  };
}

/** Publishes one version for the HTML and checks it before loading its cached bundles. */
function publicationVersion(): Plugin {
  return {
    name: "hall-publication-version",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const script = `<script>(${refreshPublishedPage.toString()})();</script>`;
      const fingerprint = createHash("sha256");
      fingerprint.update(script);
      for (const [name, output] of Object.entries(bundle).sort(([left], [right]) => left.localeCompare(right))) {
        fingerprint.update(name);
        fingerprint.update(output.type === "chunk" ? output.code : output.source);
      }
      const version = fingerprint.digest("hex").slice(0, 16);
      for (const name of ["index.html", "demonstration/index.html"]) {
        const page = bundle[name];
        if (page?.type !== "asset" || typeof page.source !== "string") continue;
        page.source = page.source
          .replace("<html ", `<html data-hall-build="${version}" `)
          .replace("<head>", `<head>${script}`);
      }
      this.emitFile({ type: "asset", fileName: "publication.json", source: JSON.stringify({ version }) });
    },
  };
}

/** Appends the content version to the capture URLs written in the documentation page. */
async function versionDocumentationCaptures(page: string, capturesDirectory: string) {
  const versions = await directoryVersions(capturesDirectory);
  const html = await readFile(page, "utf8");
  const versioned = html.replace(/captures\/([\w./-]+\.(?:png|jpe?g|webp|svg))/g, (match, path: string) =>
    versions[path] ? `${match}?v=${versions[path]}` : match,
  );
  await writeFile(page, versioned);
}

/** The story studio (studio/, ?studio) is served in development and by a `--mode studio` build, not by `npm run build`. */
export default defineConfig(({ command, mode }) => ({
  base: "./",
  define: {
    __HALL_STUDIO__: JSON.stringify(command === "serve" || mode === "studio"),
  },
  plugins: [
    publicFileVersions(),
    ...(mode === "studio" ? [] : [publicationVersion()]),
    ...(command === "serve" || mode === "studio"
      ? [studioVersions(fileURLToPath(new URL("./src/presentation/story-settings.json", import.meta.url)))]
      : []),
    {
      name: "hall-rendered-documentation",
      async closeBundle() {
        const target = fileURLToPath(new URL("./dist/documentation/", import.meta.url));
        await mkdir(target, { recursive: true });
        await cp(
          fileURLToPath(new URL("../packages/client/public/documentation/captures/", import.meta.url)),
          `${target}/captures`,
          { recursive: true },
        );
        await copyFile(
          fileURLToPath(new URL("../packages/client/dist-docs/index.html", import.meta.url)),
          `${target}/index.html`,
        );
        await versionDocumentationCaptures(`${target}/index.html`, `${target}/captures`);
      },
    },
  ],
  server: {
    allowedHosts: [".ts.net"],
  },
  preview: {
    allowedHosts: [".ts.net"],
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        demonstration: fileURLToPath(new URL("./demonstration/index.html", import.meta.url)),
        ...(mode === "studio" ? { studio: fileURLToPath(new URL("./studio/index.html", import.meta.url)) } : {}),
      },
      output: {
        /* Three.js in its own chunk, shared by both pages and loaded with the 3D scene */
        manualChunks: (id) => (id.includes("/node_modules/three/") ? "three" : undefined),
      },
    },
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
  },
}));
