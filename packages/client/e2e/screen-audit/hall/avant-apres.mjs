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
const after = spawnSync("git", ["rev-parse", "--short", argument("after") ?? "HEAD"], {
  cwd: repository,
  encoding: "utf8",
}).stdout.trim();
const phase = argument("phase");

/** The application of `commit` exported outside the repository, with its own packages and the shared dependencies. */
function exportCommit(commit) {
  const root = join(
    process.env.HALL_SCREEN_AUDIT_BUILDS ?? join(tmpdir(), "hall-screen-audit-builds"),
    `${commit}-application`,
  );
  const source = join(root, "source");
  if (existsSync(join(source, "package.json"))) {
    // The capture journey and the screen list of today are copied again at every run.
    const audit = join(source, "packages/client/e2e/screen-audit/hall");
    cpSync(join(here, "capture.audit.ts"), join(audit, "capture.audit.ts"));
    cpSync(join(here, "screens.mjs"), join(audit, "screens.mjs"));
    return source;
  }
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
  /* The packages the journeys runner does not build itself: PostgreSQL and those it depends on. */
  for (const name of ["@hall/contracts", "@hall/api-contract", "@hall/domain", "@hall/templating", "@hall/postgres"]) {
    const build = spawnSync("npm", ["run", "build", "-w", name], { cwd: source, stdio: "inherit" });
    if (build.status !== 0) throw new Error(`La construction de ${name} dans ${source} a échoué`);
  }
  /* The capture journey and the screen list of today, in place of the audit files of the commit. */
  const audit = join(source, "packages/client/e2e/screen-audit/hall");
  for (const file of readdirSync(audit)) if (/\.audit\.ts$/.test(file)) rmSync(join(audit, file));
  cpSync(join(here, "capture.audit.ts"), join(audit, "capture.audit.ts"));
  cpSync(join(here, "screens.mjs"), join(audit, "screens.mjs"));
  return source;
}

/** --screens=a,b retakes these screens only and keeps the other captures. */
const retake = argument("screens");

/** The lock of the test database (the same as e2e/run.mjs), taken around a run of an exported commit. */
const lockDirectory = "/private/tmp/hall-e2e.lock";
function withLock(run) {
  for (;;) {
    try {
      mkdirSync(lockDirectory);
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      spawnSync("sleep", ["5"]);
    }
  }
  writeFileSync(join(lockDirectory, "owner"), `vérificateur (avant-apres.mjs) — pid ${process.pid}\n`);
  try {
    return run();
  } finally {
    rmSync(lockDirectory, { recursive: true, force: true });
  }
}

function capture(label, application) {
  const directory = join(output, label);
  if (!retake) rmSync(directory, { recursive: true, force: true });
  const result = withLock(() =>
    spawnSync(process.execPath, [join(application, "packages/client/e2e/run.mjs")], {
      cwd: application,
      env: {
        ...process.env,
        HALL_SCREEN_AUDIT: "true",
        HALL_SCREEN_AUDIT_MODE: "capture",
        HALL_SCREEN_AUDIT_OUTPUT: directory,
        ...(retake ? { HALL_SCREEN_AUDIT_SCREENS: retake } : {}),
        // One lane: the client of an earlier commit may share one Vite cache between lanes.
        HALL_E2E_LANES: "1",
        CI: "true",
        // The disposable PostgreSQL of the journeys is shared: the exported application uses the same container.
        COMPOSE_PROJECT_NAME: "hall",
        HALL_E2E_LOCK_HELD: "true",
      },
      stdio: "inherit",
    }),
  );
  mkdirSync(directory, { recursive: true });
  // The commit of each capture: the whole run, or the screens retaken.
  const commits = existsSync(join(directory, "commits.json"))
    ? JSON.parse(readFileSync(join(directory, "commits.json"), "utf8"))
    : {};
  commits[retake ?? "*"] = label === "avant" ? before : after;
  writeFileSync(join(directory, "commits.json"), JSON.stringify(commits, null, 2));
  // The commit captured and every screen that could not be opened, with its reason.
  const unopened = ["ordinateur", "800", "telephone"].flatMap((format) =>
    existsSync(join(directory, format))
      ? readdirSync(join(directory, format))
          .filter((file) => file.startsWith("non-ouverts"))
          .flatMap((file) => Object.entries(JSON.parse(readFileSync(join(directory, format, file), "utf8"))))
          .map(([id, reason]) => `- ${format}/${id} : ${reason}`)
      : [],
  );
  writeFileSync(
    join(directory, "statut.txt"),
    [
      `Commits capturés : ${commitsOf(label)}`,
      `Fin du lancement : ${result.status === 0 ? "réussie" : `code ${result.status}`}`,
      unopened.length ? "Écrans non ouverts :" : "Écrans non ouverts : aucun",
      ...unopened,
      "",
    ].join("\n"),
  );
}

const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (character) => `&#${character.charCodeAt(0)};`);

function commitsOf(label) {
  const file = join(output, label, "commits.json");
  if (!existsSync(file)) return label === "avant" ? before : after;
  return Object.entries(JSON.parse(readFileSync(file, "utf8")))
    .map(([screens, commit]) => (screens === "*" ? commit : `${commit} pour ${screens}`))
    .join(", ");
}

function page() {
  // The differences are noted by hand in notes.json beside the captures (not tracked), with the order of the board.
  const notes = existsSync(join(output, "notes.json"))
    ? JSON.parse(readFileSync(join(output, "notes.json"), "utf8"))
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
  for (const format of ["ordinateur", "800", "telephone"]) {
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
        return `<p class="manque">Non ouvert : ${escapeHtml(missing(label, format)[id] ?? "capture absente")}</p>`;
      };
      const differences = screens?.[`${format}/${id}`] ?? screens?.[id] ?? null;
      sections.push(`<section id="${format}-${id}"><h2>${escapeHtml(id)} · ${{ ordinateur: "1280 px", 800: "800 px", telephone: "375 px" }[format]}</h2>
<div class="paire"><figure><figcaption>Avant (${before})</figcaption>${cell("avant")}</figure><figure><figcaption>Après (${after})</figcaption>${cell("apres")}</figure></div>
${differences ? `<ul>${differences.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : `<p class="attente">Différences : pas encore relevées.</p>`}</section>`);
    }
  }
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Hall · avant et après la refonte</title>
<style>body{font:15px/1.45 system-ui,sans-serif;margin:24px;color:#161A20;background:#fff}h1{font-size:22px}h2{font-size:17px;margin:28px 0 8px}
.paire{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}figure{margin:0}figcaption{font-weight:600;margin-bottom:4px}
img{width:100%;border:1px solid #DFE3E8}ul{margin:8px 0 0}.manque,.attente{color:#5B6472}section{border-top:1px solid #DFE3E8;padding-top:8px}</style></head>
<body><h1>Hall · avant et après la refonte</h1>
<p>Commits capturés — avant : ${escapeHtml(commitsOf("avant"))} ; après : ${escapeHtml(commitsOf("apres"))}.</p>
<p>Chaque écran de l'outil de vérification, ouvert sur la base jetable de chaque version, à 1280 px à la souris et à 375 px au doigt. Les différences sont relevées en comparant les deux images.</p>
${sections.join("\n")}</body></html>`;
  writeFileSync(join(output, "index.html"), html);
  console.log(join(output, "index.html"));
}

if (!phase || phase === "avant") capture("avant", exportCommit(before));
if (!phase || phase === "apres") capture("apres", exportCommit(after));
page();
