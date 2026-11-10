import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { families, severities } from "./rules/index.mjs";

/*
 * Static HTML report of the engine, named « Relevé ». Self-contained pages: inline style, inline SVG mark and a small
 * inline script for filters and sorting; no network access and no build step. Palette: slate greys, one blue, green
 * for what is sound, red for what blocks.
 */

const toolName = "Relevé";

const html = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const mark = `<svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M3 11V3h8M21 3h8v8M29 21v8h-8M11 29H3v-8" fill="none" stroke="currentColor" stroke-width="3"/><rect x="10" y="10" width="12" height="12" fill="currentColor"/></svg>`;

const style = `
:root{--ink:#0f172a;--text:#1e293b;--muted:#475569;--faint:#64748b;--line:#cbd5e1;--rule:#e2e8f0;--surface:#f1f5f9;--paper:#fff;
--blue:#1d4ed8;--blue-soft:#dbeafe;--green:#15803d;--green-soft:#dcfce7;--red:#b91c1c;--red-soft:#fee2e2;--radius:6px}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--text);background:var(--surface)}
a{color:var(--blue);text-underline-offset:2px}a:focus-visible,button:focus-visible,select:focus-visible,th[data-sort]:focus-visible{outline:2px solid var(--blue);outline-offset:-2px}
.top{background:var(--ink);color:#e2e8f0}.top-inner{max-width:1440px;margin:0 auto;padding:10px 24px;display:flex;flex-wrap:wrap;align-items:center;gap:8px 28px}
.brand{display:flex;align-items:center;gap:10px;color:#fff;text-decoration:none;font-weight:700;font-size:18px;letter-spacing:.01em}.brand .mark{width:24px;height:24px;color:#93c5fd}
.meta{display:flex;flex-wrap:wrap;gap:4px 22px;font-size:14px;color:#cbd5e1}.meta b{color:#fff;font-weight:600}
main{max-width:1440px;margin:0 auto;padding:28px 24px 72px}
h1{font-size:28px;line-height:1.2;margin:0 0 6px;color:var(--ink);letter-spacing:-.01em}h2{font-size:20px;margin:40px 0 10px;color:var(--ink)}h3{font-size:16px;margin:24px 0 8px;color:var(--ink)}
p{margin:0 0 10px;max-width:78ch}.lead{color:var(--muted)}
.figures{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;margin:20px 0 8px}
.figure{background:var(--paper);padding:14px 16px}.figure strong{display:block;font-size:28px;line-height:1.1;font-variant-numeric:tabular-nums;color:var(--ink)}.figure span{font-size:14px;color:var(--muted)}
.figure.block strong{color:var(--red)}.figure.sound strong{color:var(--green)}.figure.explore strong{color:var(--blue)}
.sections{display:flex;flex-wrap:wrap;gap:0 18px;margin:16px 0 0;border-bottom:1px solid var(--line);font-size:15px}
.sections a,.pager a,.brand{display:inline-flex;align-items:center;min-height:44px}
.controls{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;margin:10px 0;font-size:14px}
.controls label{display:flex;align-items:center;gap:8px;color:var(--muted)}
select{font:inherit;font-size:14px;color:var(--text);background:var(--paper);border:1px solid var(--line);border-radius:var(--radius);padding:7px 10px;min-height:44px}
.table-wrap{overflow-x:auto;background:var(--paper);border:1px solid var(--line);border-radius:var(--radius)}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:8px 10px;text-align:left;vertical-align:top;border-bottom:1px solid var(--rule)}
tr:last-child td{border-bottom:0}th{background:#f8fafc;color:var(--muted);font-weight:600;position:sticky;top:0;white-space:nowrap}
th[data-sort]{cursor:pointer;padding-top:12px;padding-bottom:12px}.table-wrap>table{min-width:960px}
td>a:only-child{display:inline-flex;align-items:center;min-height:44px;min-width:44px}td.prose{min-width:300px}td.params{min-width:420px}td.nowrap{white-space:nowrap}th[data-sort]::after{content:"";display:inline-block;width:10px}th[aria-sort=ascending]::after{content:" ▲"}th[aria-sort=descending]::after{content:" ▼"}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}.zero{color:#94a3b8}
td.rule-cell{min-width:340px}.state{display:inline-block;padding:1px 7px;border-radius:4px;font-size:14px;font-weight:600;border:1px solid}
.state.new{color:var(--red);background:var(--red-soft);border-color:#fecaca}.state.known{color:var(--muted);background:var(--surface);border-color:var(--line)}
.state.explore{color:var(--blue);background:var(--blue-soft);border-color:#bfdbfe}.state.sound{color:var(--green);background:var(--green-soft);border-color:#bbf7d0}
td.out{background:var(--blue-soft);color:var(--blue);font-weight:600}td.outlier{box-shadow:inset 0 0 0 2px var(--blue)}
.cell-link{display:flex;flex-wrap:wrap;align-items:center;gap:0 8px;min-height:44px;text-decoration:none;color:inherit}td:has(> .cell-link){padding-top:0;padding-bottom:0}.cell-link:hover{text-decoration:underline}
.count-new{color:var(--red);font-weight:600}.count-known{color:var(--muted)}.count-explore{color:var(--blue)}
.screen-layout{display:grid;grid-template-columns:minmax(0,auto) minmax(380px,1fr);gap:28px;align-items:start;margin-top:20px}
@media (max-width:1100px){.screen-layout{grid-template-columns:1fr}}
.shots{display:flex;flex-direction:column;gap:16px}.shot{position:relative;margin:0;background:var(--paper);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}
.shot img{display:block;width:100%;height:auto}.shot svg{position:absolute;left:0;top:0;width:100%}.shot figcaption{font-size:14px;color:var(--muted);padding:6px 10px;border-top:1px solid var(--rule)}
.shot .box{transition:stroke-width .1s}.shot .box.active{stroke-width:4}
.findings-panel{min-width:0}
.finding-row.active td{background:var(--blue-soft)}
.empty{display:flex;gap:12px;align-items:flex-start;padding:16px;background:var(--paper);border:1px solid #bbf7d0;border-left:4px solid var(--green);border-radius:var(--radius)}
.empty strong{color:var(--green)}
.pager{display:flex;flex-wrap:wrap;align-items:center;gap:10px 20px;font-size:15px}
.formats{display:inline-flex;border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;background:var(--paper)}
.formats a,.formats span{display:inline-flex;align-items:center;min-height:44px;padding:0 14px;text-decoration:none;font-size:14px;border-right:1px solid var(--line)}.formats :last-child{border-right:0}
.formats span{background:var(--ink);color:#fff;font-weight:600}
dl.settings{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;font-size:14px;margin:0}dl.settings dt{color:var(--muted)}dl.settings dd{margin:0}
code{font:14px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--rule);padding:1px 5px;border-radius:4px}
[hidden]{display:none!important}.visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
`;

const script = `
document.querySelectorAll("table[data-sortable]").forEach((table) => {
  table.querySelectorAll("th[data-sort]").forEach((header, column) => {
    header.tabIndex = 0;
    const sort = () => {
      const body = table.tBodies[0];
      const ascending = header.getAttribute("aria-sort") !== "ascending";
      table.querySelectorAll("th[data-sort]").forEach((other) => other.removeAttribute("aria-sort"));
      header.setAttribute("aria-sort", ascending ? "ascending" : "descending");
      const index = [...header.parentElement.children].indexOf(header);
      const value = (row) => row.children[index].dataset.value ?? row.children[index].textContent.trim();
      const rows = [...body.rows].filter((row) => !row.dataset.fixed);
      rows.sort((a, b) => {
        const x = value(a), y = value(b), nx = Number(x), ny = Number(y);
        const order = !Number.isNaN(nx) && !Number.isNaN(ny) && x !== "" && y !== "" ? nx - ny : x.localeCompare(y, "fr");
        return ascending ? order : -order;
      });
      for (const row of rows) body.append(row);
    };
    header.addEventListener("click", sort);
    header.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); sort(); } });
  });
});
const filters = document.querySelectorAll("[data-filter]");
const applyFilters = () => {
  const chosen = Object.fromEntries([...filters].map((select) => [select.dataset.filter, select.value]));
  const matrix = document.getElementById("matrix-data");
  if (matrix) {
    const findings = JSON.parse(matrix.textContent);
    const counts = {};
    for (const [screen, format, rule, state] of findings) {
      if (chosen.rule && chosen.rule !== rule) continue;
      if (chosen.state && chosen.state !== state) continue;
      const key = screen + "|" + format;
      counts[key] ??= { new: 0, known: 0, explore: 0 };
      counts[key][state]++;
    }
    document.querySelectorAll("[data-cell]").forEach((cell) => {
      const count = counts[cell.dataset.cell] ?? { new: 0, known: 0, explore: 0 };
      cell.querySelector("[data-count=new]").textContent = count.new ? count.new + " nouveaux" : "";
      cell.querySelector("[data-count=known]").textContent = count.known ? count.known + " connus" : "";
      cell.querySelector("[data-count=explore]").textContent = count.explore ? count.explore + " exploratoires" : "";
      cell.querySelector("[data-count=none]").hidden = Boolean(count.new || count.known || count.explore);
    });
  }
  document.querySelectorAll("[data-row-rule]").forEach((row) => {
    row.hidden = Boolean((chosen.rule && chosen.rule !== row.dataset.rowRule) || (chosen.state && chosen.state !== row.dataset.rowState));
  });
  document.querySelectorAll("[data-box-rule]").forEach((box) => {
    box.style.display = (chosen.rule && chosen.rule !== box.dataset.boxRule) || (chosen.state && chosen.state !== box.dataset.boxState) ? "none" : "";
  });
};
filters.forEach((select) => select.addEventListener("change", applyFilters));
applyFilters();
document.querySelectorAll("[data-finding]").forEach((row) => {
  const toggle = (on) => {
    row.classList.toggle("active", on);
    document.querySelectorAll('[data-box="' + row.dataset.finding + '"]').forEach((box) => box.classList.toggle("active", on));
  };
  row.addEventListener("mouseenter", () => toggle(true));
  row.addEventListener("mouseleave", () => toggle(false));
});
`;

const stateOf = (finding) => (finding.exploratory ? "explore" : finding.status === "new" ? "new" : "known");
const stateLabels = { new: "Nouveau", known: "Connu", explore: "Exploratoire" };
const colours = { new: "#b91c1c", known: "#475569", explore: "#1d4ed8" };

function page({ title, context, body }) {
  const meta = [
    `Projet <b>${html(context.project)}</b>`,
    context.label ? `État <b>${html(context.label)}</b>` : "",
    `Relevé du <b>${html(context.date)}</b>`,
    context.revision ? `Commit <b>${html(context.revision)}</b>` : "",
  ]
    .filter(Boolean)
    .map((item) => `<span>${item}</span>`)
    .join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(title)}, ${toolName}</title><style>${style}</style></head><body>
<header class="top"><div class="top-inner"><a class="brand" href="${context.root}index.html">${mark}${toolName}</a><div class="meta">${meta}</div></div></header>
<main>${body}</main><script>${script}</script></body></html>`;
}

const pageName = (format, screen) => `${format}--${screen}.html`;
const value = (finding) => `${html(finding.value)}${finding.unit ? ` ${html(finding.unit)}` : ""}`;
const threshold = (finding) => `${html(finding.threshold)}${finding.unit ? ` ${html(finding.unit)}` : ""}`;

function filterControls(rules, { states = ["new", "known", "explore"] } = {}) {
  const ruleOptions = rules.map((rule) => `<option value="${html(rule.id)}">${html(rule.title)}</option>`).join("");
  const stateOptions = states.map((state) => `<option value="${state}">${stateLabels[state]}</option>`).join("");
  return `<div class="controls"><label>Règle <select data-filter="rule"><option value="">Toutes les règles</option>${ruleOptions}</select></label><label>État <select data-filter="state"><option value="">Tous les états</option>${stateOptions}</select></label></div>`;
}

function screenPage({ record, findings, metrics, annotations, rulesById, formats, screens, records, context }) {
  const width = record.viewport.width;
  const height = record.viewport.height;
  const numbered = findings.map((finding, position) => ({ ...finding, number: position + 1, state: stateOf(finding) }));
  const shots = record.parts
    .map((part, partIndex) => {
      const marks = [];
      for (const finding of numbered)
        for (const placement of finding.placements) {
          if (placement.part !== partIndex || finding.element === "page") continue;
          const { x, y, w, h } = placement.rect;
          const colour = colours[finding.state];
          const labelY = y >= 16 ? y - 16 : y + Math.max(h, 2);
          marks.push(
            `<g data-box="${finding.number}" data-box-rule="${html(finding.rule)}" data-box-state="${finding.state}"><rect class="box" data-box="${finding.number}" x="${x}" y="${y}" width="${Math.max(w, 2)}" height="${Math.max(h, 2)}" fill="none" stroke="${colour}" stroke-width="2"/><rect x="${Math.max(0, x)}" y="${labelY}" width="${String(finding.number).length * 8 + 8}" height="16" fill="${colour}"/><text x="${Math.max(0, x) + 4}" y="${labelY + 12.5}" font-size="12" font-weight="600" font-family="system-ui,sans-serif" fill="#fff">${finding.number}</text></g>`,
          );
        }
      if (partIndex === 0) {
        for (const finding of numbered)
          if (finding.line !== undefined)
            marks.push(
              `<line data-box-rule="${html(finding.rule)}" data-box-state="${finding.state}" x1="0" x2="${width}" y1="${finding.line}" y2="${finding.line}" stroke="${colours[finding.state]}" stroke-width="2" stroke-dasharray="8 5"/>`,
            );
        for (const annotation of annotations)
          marks.push(
            `<rect x="${annotation.rect.x}" y="${annotation.rect.y}" width="${annotation.rect.w}" height="${annotation.rect.h}" fill="#1d4ed8" fill-opacity="0.07" stroke="#1d4ed8" stroke-dasharray="4 4"/>`,
          );
      }
      const shown = Math.min(width, 520);
      return `<figure class="shot" style="width:${shown}px;max-width:100%"><img src="../raw/${html(record.format)}/${html(part.file)}" width="${width}" height="${height}" alt="Capture de ${html(record.screen.title)}, partie ${partIndex + 1}"><svg viewBox="0 0 ${width} ${height}" style="aspect-ratio:${width}/${height}">${marks.join("")}</svg><figcaption>${partIndex === 0 ? "Première hauteur d'écran" : `Après défilement de ${part.offset} px`}</figcaption></figure>`;
    })
    .join("");
  const blocking = numbered.filter((finding) => !finding.exploratory);
  const rows = numbered
    .map((finding) => {
      const rule = rulesById.get(finding.rule);
      const outside = finding.placements.every((placement) => placement.part === null);
      const notes = [
        finding.occurrences > 1 ? `${finding.occurrences} occurrences` : "",
        outside ? "hors des captures" : "",
        finding.detail,
      ]
        .filter(Boolean)
        .join(" ; ");
      return `<tr class="finding-row" data-finding="${finding.number}" data-row-rule="${html(finding.rule)}" data-row-state="${finding.state}"><td class="num">${finding.number}</td><td><strong>${html(rule.title)}</strong><br>${html(finding.label)}${notes ? `<br><span class="count-known">${html(notes)}</span>` : ""}</td><td class="num">${value(finding)}</td><td class="num">${threshold(finding)}</td><td><span class="state ${finding.state}">${stateLabels[finding.state]}</span></td></tr>`;
    })
    .join("");
  const presentRules = [...new Set(numbered.map((finding) => finding.rule))].map((id) => rulesById.get(id));
  const findingsHtml = numbered.length
    ? `${filterControls(presentRules)}<div class="table-wrap"><table><thead><tr><th class="num">N°</th><th>Règle et élément</th><th class="num">Mesure</th><th class="num">Seuil</th><th>État</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : "";
  const sound = blocking.length
    ? ""
    : `<div class="empty">${mark.replace('class="mark"', 'class="mark" style="width:22px;height:22px;color:#15803d;flex:none"')}<p><strong>Aucun écart de dimensionnement.</strong> Les règles bloquantes actives à ce format ne relèvent rien sur cet écran.</p></div>`;
  const metricRows = metrics
    .map((metric) => {
      const rule = rulesById.get(metric.rule);
      return `<tr><td>${html(rule.title)}</td><td class="num${metric.outside ? " out" : ""}">${html(metric.value)}${rule.unit ? ` ${html(rule.unit)}` : ""}</td><td class="num">${html(metric.low)} à ${html(metric.high)}</td><td>${html(rule.explanation)}</td></tr>`;
    })
    .join("");
  const sameFormat = screens.filter((screen) =>
    records.some((other) => other.format === record.format && other.screen.id === screen.id),
  );
  const position = sameFormat.findIndex((screen) => screen.id === record.screen.id);
  const previous = sameFormat[position - 1];
  const next = sameFormat[position + 1];
  const formatSwitch = formats
    .map((format) =>
      format.id === record.format
        ? `<span aria-current="page">${html(format.label)}</span>`
        : records.some((other) => other.format === format.id && other.screen.id === record.screen.id)
          ? `<a href="${pageName(format.id, record.screen.id)}">${html(format.label)}</a>`
          : "",
    )
    .join("");
  const jump = `<label class="controls" style="margin:0"><span class="visually-hidden">Écran</span><select onchange="location.href=this.value">${sameFormat
    .map(
      (screen) =>
        `<option value="${pageName(record.format, screen.id)}"${screen.id === record.screen.id ? " selected" : ""}>${html(screen.title)}</option>`,
    )
    .join("")}</select></label>`;
  const format = formats.find((entry) => entry.id === record.format);
  return page({
    title: `${record.screen.title}, ${format.label}`,
    context,
    body: `<nav class="pager" aria-label="Navigation entre écrans">${previous ? `<a href="${pageName(record.format, previous.id)}" title="${html(previous.title)}">Précédent</a>` : ""}${next ? `<a href="${pageName(record.format, next.id)}" title="${html(next.title)}">Suivant</a>` : ""}${jump}<span class="formats">${formatSwitch}</span></nav>
<h1 style="margin-top:20px">${html(record.screen.title)}</h1>
<p class="lead">${html(format.label)} ${format.width} × ${format.height}, adresse <code>${html(record.screen.route)}</code>. ${blocking.filter((finding) => finding.state === "new").length} écarts nouveaux, ${blocking.filter((finding) => finding.state === "known").length} connus, ${numbered.length - blocking.length} signalements exploratoires.</p>
<div class="screen-layout"><div class="shots">${shots}</div><section class="findings-panel" aria-label="Écarts">${sound}${findingsHtml}</section></div>
<h2>Indicateurs d'équilibre</h2>
<p class="lead">Mesurés sur la première hauteur d'écran. Une valeur hors de la plage réglée est surlignée en bleu ; ces indicateurs ne font pas échouer le contrôle.</p>
<div class="table-wrap"><table><thead><tr><th>Indicateur</th><th class="num">Valeur</th><th class="num">Plage</th><th>Définition</th></tr></thead><tbody>${metricRows}</tbody></table></div>`,
  });
}

function outliers(metrics) {
  const flagged = new Set();
  const groups = new Map();
  for (const metric of metrics) {
    const key = `${metric.rule}|${metric.format}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(metric);
  }
  for (const group of groups.values()) {
    const values = group.map((metric) => metric.value);
    const mean = values.reduce((sum, item) => sum + item, 0) / values.length;
    const deviation = Math.sqrt(values.reduce((sum, item) => sum + (item - mean) ** 2, 0) / values.length);
    if (!deviation) continue;
    for (const metric of group)
      if (Math.abs(metric.value - mean) / deviation >= 1.5)
        flagged.add(`${metric.rule}|${metric.format}|${metric.screen}`);
  }
  return flagged;
}

function confrontation({ humanDefects, findings, metrics, rulesById, comparison, label, screensById }) {
  if (!humanDefects?.length) return { section: "", result: [] };
  const result = humanDefects.map((defect) => {
    const matches = findings.filter(
      (finding) =>
        finding.screen === defect.screen && finding.format === defect.format && defect.rules.includes(finding.rule),
    );
    const metricMatches = metrics.filter(
      (metric) =>
        metric.outside &&
        metric.screen === defect.screen &&
        metric.format === defect.format &&
        defect.rules.includes(metric.rule),
    );
    return { ...defect, found: matches.length + metricMatches.length > 0, matches, metricMatches };
  });
  const claimed = new Set(
    humanDefects.flatMap((defect) => defect.rules.map((rule) => `${defect.format}|${defect.screen}|${rule}`)),
  );
  const unmatched = new Map();
  for (const finding of findings) {
    if (finding.exploratory || claimed.has(`${finding.format}|${finding.screen}|${finding.rule}`)) continue;
    if (!unmatched.has(finding.rule)) unmatched.set(finding.rule, { count: 0, screens: new Set() });
    unmatched.get(finding.rule).count++;
    unmatched
      .get(finding.rule)
      .screens.add(`${screensById.get(finding.screen)?.title ?? finding.screen} (${finding.format})`);
  }
  const diagnosis = (entry) =>
    [
      ...entry.matches
        .slice(0, 3)
        .map((finding) => `${rulesById.get(finding.rule).title} : ${finding.label}, ${finding.value} ${finding.unit}`),
      ...entry.metricMatches.map((metric) => `${rulesById.get(metric.rule).title} : ${metric.value}`),
    ]
      .map(html)
      .join("<br>");
  const rows = result
    .map((entry, index) => {
      const other = comparison?.[index];
      const cell = (found) =>
        found ? '<span class="state sound">Retrouvé</span>' : '<span class="state new">Manqué</span>';
      return `<tr><td class="nowrap">${html(screensById.get(entry.screen)?.title ?? entry.screen)}, ${html(entry.format)}</td><td class="prose">${html(entry.defect)}</td><td class="prose">${html(entry.rules.map((rule) => rulesById.get(rule)?.title ?? rule).join(", "))}</td>${comparison ? `<td>${other ? cell(other.found) : "-"}</td>` : ""}<td>${cell(entry.found)}</td><td class="prose">${entry.found ? diagnosis(entry) : ""}</td></tr>`;
    })
    .join("");
  const found = result.filter((entry) => entry.found).length;
  const section = `<h2 id="confrontation">Confrontation aux défauts constatés à la main</h2>
<p class="lead">${found} défauts sur ${result.length} retrouvés par une règle dans l'état ${html(label ?? "mesuré")}.${comparison ? ` La colonne « ${html(comparison.label)} » donne le résultat sur l'autre état mesuré.` : ""}</p>
<div class="table-wrap"><table><thead><tr><th>Écran et format</th><th>Défaut constaté</th><th>Règles attendues</th>${comparison ? `<th>${html(comparison.label)}</th>` : ""}<th>${html(label ?? "Cet état")}</th><th>Diagnostic</th></tr></thead><tbody>${rows}</tbody></table></div>
<h3>Écarts sans défaut constaté correspondant</h3>
<p class="lead">À classer par le propriétaire : défaut réel non vu, ou bruit de la règle.</p>
<div class="table-wrap"><table data-sortable><thead><tr><th data-sort>Règle</th><th class="num" data-sort>Écarts</th><th>Écrans concernés</th></tr></thead><tbody>${[
    ...unmatched.entries(),
  ]
    .sort((a, b) => b[1].count - a[1].count)
    .map(
      ([rule, entry]) =>
        `<tr><td class="prose">${html(rulesById.get(rule).title)}</td><td class="num">${entry.count}</td><td>${html([...entry.screens].slice(0, 14).join(", "))}${entry.screens.size > 14 ? ` et ${entry.screens.size - 14} autres` : ""}</td></tr>`,
    )
    .join("")}</tbody></table></div>`;
  return { section, result };
}

export function writeReport({ outputDirectory, config, records, missing, evaluation, comparison, label, revision }) {
  const pages = join(outputDirectory, "pages");
  mkdirSync(pages, { recursive: true });
  const rulesById = new Map(evaluation.rules.map((entry) => [entry.rule.id, entry.rule]));
  const formats = config.formats;
  const screens = [...new Map(records.map((record) => [record.screen.id, record.screen])).values()];
  const order = config.screenOrder ?? screens.map((screen) => screen.id);
  screens.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const screensById = new Map(screens.map((screen) => [screen.id, screen]));
  const captured = records.map((record) => record.capturedAt).sort()[0];
  const date = new Date(captured ?? Date.now()).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  const context = { project: config.name, label, revision, date, root: "../" };
  const byPage = (format, screen) =>
    evaluation.findings
      .filter((finding) => finding.format === format && finding.screen === screen)
      .sort(
        (a, b) =>
          Number(a.exploratory) - Number(b.exploratory) ||
          Number(a.status !== "new") - Number(b.status !== "new") ||
          a.rule.localeCompare(b.rule),
      );

  for (const record of records)
    writeFileSync(
      join(pages, pageName(record.format, record.screen.id)),
      screenPage({
        record,
        findings: byPage(record.format, record.screen.id),
        metrics: evaluation.metrics.filter(
          (metric) => metric.format === record.format && metric.screen === record.screen.id,
        ),
        annotations: evaluation.annotations.filter(
          (annotation) => annotation.format === record.format && annotation.screen === record.screen.id,
        ),
        rulesById,
        formats,
        screens,
        records,
        context,
      }),
    );

  const findings = evaluation.findings;
  const count = (filter) => findings.filter(filter).length;
  const fresh = count((finding) => finding.status === "new");
  const known = count((finding) => finding.status === "known");
  const explore = count((finding) => finding.exploratory);
  const outsideMetrics = evaluation.metrics.filter((metric) => metric.outside).length;
  const figures = `<div class="figures">
<div class="figure"><strong>${screens.length}</strong><span>écrans, ${records.length} pages mesurées sur ${formats.length} formats</span></div>
<div class="figure ${fresh ? "block" : "sound"}"><strong>${fresh}</strong><span>écarts nouveaux, absents de la référence</span></div>
<div class="figure"><strong>${known}</strong><span>écarts connus de la référence</span></div>
<div class="figure explore"><strong>${explore}</strong><span>signalements exploratoires sur les listes et l'équilibre</span></div>
<div class="figure explore"><strong>${outsideMetrics}</strong><span>indicateurs d'équilibre hors plage</span></div>
<div class="figure ${missing.length ? "block" : "sound"}"><strong>${missing.length}</strong><span>écrans qui n'ont pas pu être ouverts</span></div>
</div>`;

  const matrixData = JSON.stringify(
    findings.map((finding) => [finding.screen, finding.format, finding.rule, stateOf(finding)]),
  ).replaceAll("<", "\\u003c");
  const matrixRows = screens
    .map((screen) => {
      const cells = formats
        .map((format) => {
          const has = records.some((record) => record.format === format.id && record.screen.id === screen.id);
          const absent = missing.find((entry) => entry.format === format.id && entry.screen.id === screen.id);
          if (!has)
            return `<td>${absent ? '<span class="state new">Non ouvert</span>' : '<span class="zero">Sans objet</span>'}</td>`;
          return `<td data-cell="${html(screen.id)}|${format.id}"><a class="cell-link" href="pages/${pageName(format.id, screen.id)}"><span class="count-new" data-count="new"></span> <span class="count-known" data-count="known"></span> <span class="count-explore" data-count="explore"></span><span class="state sound" data-count="none">Aucun écart</span></a></td>`;
        })
        .join("");
      return `<tr><td><strong>${html(screen.title)}</strong></td>${cells}</tr>`;
    })
    .join("");
  const listedRules = evaluation.rules.filter((entry) => entry.rule.kind !== "metric");
  const ruleRows = listedRules
    .map((entry) => {
      const cells = formats
        .map((format) => {
          const total = count((finding) => finding.rule === entry.rule.id && finding.format === format.id);
          const newCount = count(
            (finding) => finding.rule === entry.rule.id && finding.format === format.id && finding.status === "new",
          );
          return `<td class="num${total ? "" : " zero"}" data-value="${total}">${total}${newCount ? ` <span class="count-new">(${newCount} nouv.)</span>` : ""}</td>`;
        })
        .join("");
      const total = count((finding) => finding.rule === entry.rule.id);
      return `<tr><td class="rule-cell"><strong>${html(entry.rule.title)}</strong>${entry.enabled ? "" : " (désactivée)"}<br><span class="count-known">${html(entry.rule.explanation)}</span></td><td>${html(families[entry.rule.family].title)}</td>${cells}<td class="num" data-value="${total}">${total}</td></tr>`;
    })
    .join("");

  const flagged = outliers(evaluation.metrics);
  const metricRules = evaluation.rules.filter((entry) => entry.enabled && entry.rule.kind === "metric");
  const metricTables = formats
    .map((format) => {
      const header = metricRules
        .map(
          (entry) =>
            `<th class="num" data-sort title="${html(entry.rule.explanation)}">${html(entry.rule.title)}${entry.rule.unit ? ` (${html(entry.rule.unit)})` : ""}</th>`,
        )
        .join("");
      const ranges = metricRules
        .map((entry) => {
          const params = entry.params(format.id);
          return `<td class="num count-known">${html(params.low)} à ${html(params.high)}</td>`;
        })
        .join("");
      const body = screens
        .filter((screen) => records.some((record) => record.format === format.id && record.screen.id === screen.id))
        .map((screen) => {
          const cells = metricRules
            .map((entry) => {
              const metric = evaluation.metrics.find(
                (candidate) =>
                  candidate.rule === entry.rule.id && candidate.format === format.id && candidate.screen === screen.id,
              );
              if (!metric) return '<td class="zero">-</td>';
              const classes = [
                "num",
                metric.outside ? "out" : "",
                flagged.has(`${metric.rule}|${format.id}|${screen.id}`) ? "outlier" : "",
              ];
              return `<td class="${classes.filter(Boolean).join(" ")}" data-value="${metric.value}">${html(metric.value)}</td>`;
            })
            .join("");
          return `<tr><td><a href="pages/${pageName(format.id, screen.id)}">${html(screen.title)}</a></td>${cells}</tr>`;
        })
        .join("");
      return `<h3>${html(format.label)} ${format.width} × ${format.height}</h3><div class="table-wrap"><table data-sortable><thead><tr><th data-sort>Écran</th>${header}</tr></thead><tbody><tr data-fixed="1"><td class="count-known">Plage réglée</td>${ranges}</tr>${body}</tbody></table></div>`;
    })
    .join("");
  const definitions = metricRules
    .map((entry) => `<dt>${html(entry.rule.title)}</dt><dd>${html(entry.rule.explanation)}</dd>`)
    .join("");
  const settingsRows = evaluation.rules
    .map((entry) => {
      const params = formats
        .filter((format) => entry.applies(format))
        .map(
          (format) =>
            `<div>${html(format.label)} : ${html(
              Object.entries(entry.params(format.id))
                .map(([name, item]) => `${name} ${item}`)
                .join(", "),
            )}</div>`,
        )
        .join("");
      return `<tr><td class="nowrap"><code>${html(entry.rule.id)}</code></td><td>${entry.enabled ? "Active" : "Désactivée"}</td><td>${html(severities[entry.severity] ?? entry.severity)}</td><td class="params">${params || "Aucun format"}</td><td class="prose">${html([...entry.excludeScreens].join(", "))}</td><td class="prose">${html(entry.justification)}</td></tr>`;
    })
    .join("");
  const confronted = confrontation({
    humanDefects: config.humanDefects,
    findings,
    metrics: evaluation.metrics,
    rulesById,
    comparison,
    label,
    screensById,
  });
  const missingHtml = missing.length
    ? `<h2>Écrans non ouverts</h2><div class="table-wrap"><table><thead><tr><th>Écran</th><th>Format</th><th>Erreur</th></tr></thead><tbody>${missing
        .map(
          (entry) =>
            `<tr><td>${html(entry.screen.title)}</td><td>${html(entry.format)}</td><td>${html(entry.error.split("\n")[0])}</td></tr>`,
        )
        .join("")}</tbody></table></div>`
    : "";
  const resolvedHtml = evaluation.resolved?.length
    ? `<h2>Lignes de la référence à retirer</h2><p class="lead">${evaluation.resolved.length} écarts connus ne sont plus mesurés ; régénérez la référence pour les retirer.</p><div class="table-wrap"><table><tbody>${evaluation.resolved
        .map((key) => `<tr><td><code>${html(key)}</code></td></tr>`)
        .join("")}</tbody></table></div>`
    : "";
  const filterRules = [...new Set(findings.map((finding) => finding.rule))].map((id) => rulesById.get(id));
  writeFileSync(
    join(outputDirectory, "index.html"),
    page({
      title: `Revue des écrans de ${config.name}`,
      context: { ...context, root: "" },
      body: `<h1>Revue des écrans de ${html(config.name)}</h1>
<p class="lead">${formats.map((format) => `${html(format.label)} ${format.width} × ${format.height}`).join(", ")}. Les textes visibles de chaque écran sont dans <a href="textes.json">textes.json</a>.</p>
${figures}
<nav class="sections" aria-label="Sections"><a href="#ecrans">Écarts par écran</a><a href="#regles">Écarts par règle</a><a href="#equilibre">Indicateurs d'équilibre</a>${confronted.section ? '<a href="#confrontation">Confrontation</a>' : ""}<a href="#reglages">Réglage des règles</a></nav>
${missingHtml}
<h2 id="ecrans">Écarts par écran et par format</h2>
<p class="lead">Rouge : écart nouveau, qui fait échouer le contrôle. Gris : écart connu de la référence. Bleu : signalement exploratoire.</p>
${filterControls(filterRules)}
<div class="table-wrap"><table><thead><tr><th>Écran</th>${formats.map((format) => `<th>${html(format.label)}</th>`).join("")}</tr></thead><tbody>${matrixRows}</tbody></table></div>
<script type="application/json" id="matrix-data">${matrixData}</script>
<h2 id="regles">Écarts par règle</h2>
<div class="table-wrap"><table data-sortable><thead><tr><th data-sort>Règle</th><th data-sort>Famille</th>${formats.map((format) => `<th class="num" data-sort>${html(format.label)}</th>`).join("")}<th class="num" data-sort>Total</th></tr></thead><tbody>${ruleRows}</tbody></table></div>
${resolvedHtml}
<h2 id="equilibre">Indicateurs d'équilibre de tous les écrans</h2>
<p class="lead">Fond bleu : valeur hors de la plage réglée. Cadre bleu : écran éloigné d'au moins 1,5 écart type de la moyenne des écrans du même format. Cliquez un en-tête pour trier.</p>
${metricTables}
<h3>Définitions</h3><dl class="settings">${definitions}</dl>
${confronted.section}
<h2 id="reglages">Réglage des règles</h2>
<div class="table-wrap"><table data-sortable><thead><tr><th data-sort>Règle</th><th data-sort>Activation</th><th data-sort>Gravité</th><th>Paramètres par format</th><th>Écrans exclus</th><th>Raison</th></tr></thead><tbody>${settingsRows}</tbody></table></div>`,
    }),
  );
  return confronted.result;
}
