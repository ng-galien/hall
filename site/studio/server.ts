import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import type { Connect, Plugin } from "vite";
import { type StorySettings, settingsFingerprint } from "../src/story/settings";

/** Folder of the settings versions saved by the studio. */
const versionsDirectory = fileURLToPath(new URL("./versions/", import.meta.url));
const ROUTE = "/__studio/versions";
const SETTINGS_ROUTE = "/__studio/settings";
const MAX_BYTES = 2_000_000;

function body(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BYTES) reject(new Error("Version too large"));
      else chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

const slug = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "reglages";

async function list(): Promise<string[]> {
  await mkdir(versionsDirectory, { recursive: true });
  return (await readdir(versionsDirectory)).filter((file) => file.endsWith(".json")).sort();
}

function send(response: ServerResponse, status: number, value: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
}

/**
 * /__studio/settings gives the fingerprint of the settings file on disk. /__studio/versions: GET lists the saved
 * versions, the last one with its content; POST writes a new version file named after its date and name, and is
 * refused when the version was made from settings that are no longer those of the file. Served by the development
 * server and by the preview of a studio build, never by the published site.
 */
const handler =
  (settingsFile: string): Connect.NextHandleFunction =>
  async (request, response, next) => {
    const current = async () => settingsFingerprint(JSON.parse(await readFile(settingsFile, "utf8")) as StorySettings);
    if (request.url?.startsWith(SETTINGS_ROUTE)) {
      try {
        send(response, 200, { fingerprint: await current() });
      } catch (error) {
        send(response, 500, { error: String(error) });
      }
      return;
    }
    if (!request.url?.startsWith(ROUTE)) return next();
    try {
      if (request.method === "GET") {
        const files = await list();
        const last = files.at(-1);
        send(response, 200, {
          files,
          last: last ? JSON.parse(await readFile(`${versionsDirectory}${last}`, "utf8")) : null,
        });
        return;
      }
      if (request.method !== "POST") return send(response, 405, { error: "GET or POST" });
      const version = JSON.parse(await body(request)) as { name?: string; date?: string; baseFingerprint?: string };
      if (!version || typeof version.name !== "string" || typeof version.date !== "string")
        return send(response, 400, { error: "A version needs a name and a date" });
      if (version.baseFingerprint !== (await current()))
        return send(response, 409, { error: "The settings file changed since the studio was opened" });
      const stamp = version.date.slice(0, 16).replace(/[T:]/g, "-");
      const file = `${stamp}-${slug(version.name)}.json`;
      await mkdir(versionsDirectory, { recursive: true });
      await writeFile(`${versionsDirectory}${file}`, `${JSON.stringify(version, null, 2)}\n`);
      send(response, 201, { file: `site/studio/versions/${file}` });
    } catch (error) {
      send(response, 500, { error: String(error) });
    }
  };

/** `settingsFile`: absolute path of the story's settings file. */
export function studioVersions(settingsFile: string): Plugin {
  const handle = handler(settingsFile);
  return {
    name: "hall-studio-versions",
    configureServer: (server) => {
      server.middlewares.use(handle);
    },
    configurePreviewServer: (server) => {
      server.middlewares.use(handle);
    },
  };
}
