import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/*
 * Before-and-after board: captures every screen of screens.mjs with the whole application (client, server, database)
 * of an earlier commit, then with the current one, on the seed of each, and writes one HTML page that sets them side
 * by side with the differences noted in avant-apres-notes.json.
 * The earlier commit is exported with git archive outside the repository; its packages are built there and resolve
 * among themselves. Usage: node avant-apres.mjs --before=<commit> [--phase=avant|apres|page].
 */

const here = import.meta.dirname;
const clientDirectory = resolve(here, "../../..");
const repository = resolve(clientDirectory, "../..");
const output = resolve(clientDirectory, "test-results/avant-apres");
const argument = (name) => process.argv.find((entry) => entry.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const before = spawnSync("git", ["rev-parse", "--short", argument("before") ?? "c588536"], {
  cwd: repository,
  encoding: "utf8",
}).stdout.trim();
const after = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repository, encoding: "utf8" }).stdout.trim();
const phase = argument("phase");

/** The application of `commit` exported outside the repository, with its own packages and the shared dependencies. */
function exportCommit(commit) {
  const root = join(
    process.env.HALL_SCREEN_AUDIT_BUILDS ?? join(tmpdir(), "hall-screen-audit-builds"),
    `${commit}-application`,
  );
  const source = join(root, "source");
  if (existsSync(join(source, "package.json"))) return source;
  rmSync(root, { recursive: true, force: true });
  mkdirSync(source, { recursive: true });
  const archive = spawnSync("sh", ["-c", `git archive ${commit} | tar -x -C "${source}"`], {
    cwd: repository,
    stdio: "inherit",
  });
  if (archive.status !== 0) throw new Error(`git archive ${commit} a échoué`);
  /* Shared dependencies come from the repository; the packages of Hall resolve to the exported ones. */
  mkdirSync(join(source, "node_modules", "@hall"), { recursive: true });
  for (const entry of readdirSync(join(repository, "node_modules"))) {
    if (entry === "@hall" || entry === ".bin" || entry.startsWith(".vite")) continue;
    symlinkSync(join(repository, "node_modules", entry), join(source, "node_modules", entry));
  }
  symlinkSync(join(repository, "node_modules", ".bin"), join(source, "node_modules", ".bin"));
  for (const name of readdirSync(join(source, "packages")))
    symlinkSync(join("..", "..", "packages", name), join(source, "node_modules", "@hall", name));
  for (const name of readdirSync(join(source, "packages"))) {
    const modules = join(repository, "packages", name, "node_modules");
    if (!existsSync(modules)) continue;
    mkdirSync(join(source, "packages", name, "node_modules"), { recursive: true });
    for (const entry of readdirSync(modules))
      if (entry !== ".vite" && !entry.startsWith(".vite-e2e"))
        symlinkSync(join(modules, entry), join(source, "packages", name, "node_modules", entry));
  }
  /* The capture journey and the screen list of today, in place of the audit files of the commit. */
  const audit = join(source, "packages/client/e2e/screen-audit/hall");
  for (const file of readdirSync(audit)) if (/\.audit\.ts$/.test(file)) rmSync(join(audit, file));
  cpSync(join(here, "capture.audit.ts"), join(audit, "capture.audit.ts"));
  cpSync(join(here, "screens.mjs"), join(audit, "screens.mjs"));
  return source;
}

function capture(label, application) {
  const directory = join(output, label);
  rmSync(directory, { recursive: true, force: true });
  const result = spawnSync(process.execPath, [join(application, "packages/client/e2e/run.mjs")], {
    cwd: application,
    env: {
      ...process.env,
      HALL_SCREEN_AUDIT: "true",
      HALL_SCREEN_AUDIT_MODE: "capture",
      HALL_SCREEN_AUDIT_OUTPUT: directory,
      HALL_E2E_LANES: "2",
      CI: "true",
      // The disposable PostgreSQL of the journeys is shared: the exported application uses the same container.
      COMPOSE_PROJECT_NAME: "hall",
    },
    stdio: "inherit",
  });
  writeFileSync(join(directory, "statut.txt"), `${result.status}\n`);
}

const escape = (text) => String(text).replace(/[&<>"]/g, (character) => `&#${character.charCodeAt(0)};`);

function page() {
  const notes = existsSync(join(here, "avant-apres-notes.json"))
    ? JSON.parse(readFileSync(join(here, "avant-apres-notes.json"), "utf8"))
    : {};
  const { screens } = notes;
  const order = notes.order ?? [];
  const missing = (label, format) => {
    const directory = join(output, label, format);
    if (!existsSync(directory)) return {};
    return Object.assign(
      {},
      ...readdirSync(directory)
        .filter((file) => file.startsWith("non-ouverts"))
        .map((file) => JSON.parse(readFileSync(join(directory, file), "utf8"))),
    );
  };
  const sections = [];
  for (const format of ["ordinateur", "telephone"]) {
    const ids = new Set(
      ["avant", "apres"].flatMap((label) =>
        existsSync(join(output, label, format))
          ? readdirSync(join(output, label, format))
              .filter((file) => file.endsWith(".png"))
              .map((file) => file.slice(0, -4))
          : [],
      ),
    );
    for (const id of Object.keys({ ...missing("avant", format), ...missing("apres", format) })) ids.add(id);
    const sorted = [...ids].sort(
      (a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999) || a.localeCompare(b),
    );
    for (const id of sorted) {
      const cell = (label) => {
        const file = join(label, format, `${id}.png`);
        if (existsSync(join(output, file)))
          return `<a href="${file}"><img src="${file}" alt="${label} ${id}" loading="lazy"></a>`;
        return `<p class="manque">Non ouvert : ${escape(missing(label, format)[id] ?? "capture absente")}</p>`;
      };
      const differences = screens?.[`${format}/${id}`] ?? screens?.[id] ?? null;
      sections.push(`<section id="${format}-${id}"><h2>${escape(id)} · ${format === "ordinateur" ? "1280 px" : "375 px"}</h2>
<div class="paire"><figure><figcaption>Avant (${before})</figcaption>${cell("avant")}</figure><figure><figcaption>Après (${after})</figcaption>${cell("apres")}</figure></div>
${differences ? `<ul>${differences.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : `<p class="attente">Différences : pas encore relevées.</p>`}</section>`);
    }
  }
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Hall · avant et après la refonte</title>
<style>body{font:15px/1.45 system-ui,sans-serif;margin:24px;color:#161A20;background:#fff}h1{font-size:22px}h2{font-size:17px;margin:28px 0 8px}
.paire{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}figure{margin:0}figcaption{font-weight:600;margin-bottom:4px}
img{width:100%;border:1px solid #DFE3E8}ul{margin:8px 0 0}.manque,.attente{color:#5B6472}section{border-top:1px solid #DFE3E8;padding-top:8px}</style></head>
<body><h1>Hall · avant (${before}) et après (${after}) la refonte</h1>
<p>Chaque écran de l'outil de vérification, ouvert sur la base jetable de chaque version, à 1280 px à la souris et à 375 px au doigt. Les différences sont relevées en comparant les deux images.</p>
${sections.join("\n")}</body></html>`;
  writeFileSync(join(output, "index.html"), html);
  console.log(join(output, "index.html"));
}

if (!phase || phase === "avant") capture("avant", exportCommit(before));
if (!phase || phase === "apres") capture("apres", exportCommit(after));
page();
