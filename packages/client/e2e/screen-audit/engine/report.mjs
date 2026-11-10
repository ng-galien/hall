import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { families, severities } from "./rules/index.mjs";

/* Static HTML report: one page per screen and format, and a summary page. Slate greys, one blue, green and red. */

const html = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const style = `
:root{--ink:#0f172a;--muted:#475569;--line:#cbd5e1;--soft:#f1f5f9;--paper:#ffffff;--blue:#1d4ed8;--green:#15803d;--red:#b91c1c}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--soft)}
main{max-width:1280px;margin:0 auto;padding:24px 16px 64px}h1{font-size:24px;margin:0 0 4px}h2{font-size:19px;margin:32px 0 8px}
h3{font-size:16px;margin:20px 0 6px}p{margin:4px 0 8px;color:var(--muted)}a{color:var(--blue)}
table{border-collapse:collapse;width:100%;background:var(--paper);font-size:14px}th,td{border:1px solid var(--line);padding:5px 8px;text-align:left;vertical-align:top}
th{background:#e2e8f0;font-weight:600}td.num{text-align:right;font-variant-numeric:tabular-nums}.scroll{overflow-x:auto}
.new{color:var(--red);font-weight:600}.known{color:var(--muted)}.ok{color:var(--green);font-weight:600}.explore{color:var(--blue)}
.out{background:#dbeafe;font-weight:600}.outlier{outline:2px solid var(--blue);outline-offset:-2px}.zero{color:#94a3b8}
.tag{display:inline-block;padding:0 6px;border-radius:4px;font-size:12px;border:1px solid currentColor}
.shots{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start}.shot{position:relative;background:var(--paper);border:1px solid var(--line)}
.shot img{display:block;width:100%;height:auto}.shot svg{position:absolute;inset:0;width:100%;height:100%}.shot figcaption{font-size:12px;color:var(--muted);padding:2px 6px}
nav.bar{display:flex;flex-wrap:wrap;gap:12px;margin:8px 0 16px;font-size:14px}code{font-size:13px;background:#e2e8f0;padding:0 4px;border-radius:3px}
`;

const page = (title, body) =>
  `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(title)}</title><style>${style}</style></head><body><main>${body}</main></body></html>`;

const pageName = (format, screen) => `${format}--${screen}.html`;

const formatValue = (value, unit) => `${html(value)}${unit && unit !== "" ? ` ${html(unit)}` : ""}`;

function statusCell(finding) {
  if (finding.exploratory) return '<span class="explore">exploratoire</span>';
  return finding.status === "new" ? '<span class="new">nouveau</span>' : '<span class="known">connu</span>';
}

function screenPage({ record, findings, metrics, annotations, rulesById, formatsById, navigation }) {
  const width = record.viewport.width;
  const height = record.viewport.height;
  const numbered = findings.map((finding, position) => ({ ...finding, number: position + 1 }));
  const colour = (finding) => (finding.exploratory ? "#1d4ed8" : finding.status === "new" ? "#b91c1c" : "#475569");
  const shots = record.parts
    .map((part, partIndex) => {
      const marks = [];
      for (const finding of numbered)
        for (const placement of finding.placements) {
          if (placement.part !== partIndex || finding.element === "page") continue;
          const { x, y, w, h } = placement.rect;
          marks.push(
            `<rect x="${x}" y="${y}" width="${Math.max(w, 2)}" height="${Math.max(h, 2)}" fill="none" stroke="${colour(finding)}" stroke-width="1.5"/>` +
              `<rect x="${Math.max(0, x - 1)}" y="${Math.max(0, y - 15)}" width="${String(finding.number).length * 8 + 6}" height="15" fill="${colour(finding)}" fill-opacity="0.75"/>` +
              `<text x="${Math.max(0, x - 1) + 3}" y="${Math.max(0, y - 15) + 12}" font-size="12" font-family="system-ui" fill="#fff">${finding.number}</text>`,
          );
        }
      if (partIndex === 0) {
        for (const finding of numbered)
          if (finding.line !== undefined)
            marks.push(
              `<line x1="0" x2="${width}" y1="${finding.line}" y2="${finding.line}" stroke="${colour(finding)}" stroke-width="2" stroke-dasharray="6 4"/>`,
            );
        for (const annotation of annotations)
          marks.push(
            `<rect x="${annotation.rect.x}" y="${annotation.rect.y}" width="${annotation.rect.w}" height="${annotation.rect.h}" fill="#1d4ed8" fill-opacity="0.08" stroke="#1d4ed8" stroke-dasharray="4 4"/>`,
          );
      }
      const shown = Math.min(width, 480);
      return `<figure class="shot" style="width:${shown}px;margin:0"><img src="../raw/${html(record.format)}/${html(part.file)}" alt="Capture ${partIndex + 1}"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${marks.join("")}</svg><figcaption>Partie ${partIndex + 1}${part.offset ? `, défilement de ${part.offset} px` : ""}</figcaption></figure>`;
    })
    .join("");
  const rows = numbered
    .map((finding) => {
      const rule = rulesById.get(finding.rule);
      const outside = finding.placements.every((placement) => placement.part === null);
      return `<tr><td class="num">${finding.number}</td><td>${html(rule.title)}</td><td>${html(finding.label)}${finding.occurrences > 1 ? ` <span class="known">(${finding.occurrences} occurrences)</span>` : ""}${outside ? ' <span class="known">(hors capture)</span>' : ""}</td><td class="num">${formatValue(finding.value, finding.unit)}</td><td class="num">${formatValue(finding.threshold, finding.unit)}</td><td>${html(finding.detail)}</td><td>${statusCell(finding)}</td></tr>`;
    })
    .join("");
  const metricRows = metrics
    .map((metric) => {
      const rule = rulesById.get(metric.rule);
      return `<tr${metric.outside ? ' class="out"' : ""}><td>${html(rule.title)}</td><td class="num">${formatValue(metric.value, rule.unit)}</td><td class="num">${html(metric.low)} à ${html(metric.high)}</td><td>${metric.outside ? "hors plage" : "dans la plage"}</td><td>${html(rule.explanation)}</td></tr>`;
    })
    .join("");
  const format = formatsById.get(record.format);
  return page(
    `${record.screen.title} · ${format.label}`,
    `<nav class="bar"><a href="../index.html">Récapitulatif</a>${navigation}</nav>
<h1>${html(record.screen.title)} · ${html(format.label)} ${format.width} × ${format.height}</h1>
<p>Adresse : <code>${html(record.screen.route)}</code>. Rouge : écart nouveau ; gris : écart connu de la référence ; bleu : règle exploratoire. Le trait pointillé marque le début du contenu ; le rectangle bleu pâle, le plus grand vide.</p>
<div class="shots">${shots}</div>
<h2>Écarts (${numbered.length})</h2>
${numbered.length ? `<div class="scroll"><table><tr><th>N°</th><th>Règle</th><th>Élément</th><th>Valeur mesurée</th><th>Seuil</th><th>Précision</th><th>État</th></tr>${rows}</table></div>` : '<p class="ok">Aucun écart.</p>'}
<h2>Indicateurs d'équilibre (exploratoires)</h2>
<p>Mesurés sur la première hauteur d'écran, sans défiler. Hors plage, l'indicateur est surligné ; il ne fait jamais échouer le contrôle.</p>
<div class="scroll"><table><tr><th>Indicateur</th><th>Valeur</th><th>Plage</th><th>État</th><th>Définition</th></tr>${metricRows}</table></div>`,
  );
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
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
    if (!deviation) continue;
    for (const metric of group)
      if (Math.abs(metric.value - mean) / deviation >= 1.5)
        flagged.add(`${metric.rule}|${metric.format}|${metric.screen}`);
  }
  return flagged;
}

function confrontation(humanDefects, findings, metrics, rulesById, label) {
  if (!humanDefects?.length) return { html: "", result: [] };
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
    const key = finding.rule;
    if (!unmatched.has(key)) unmatched.set(key, { count: 0, screens: new Set() });
    unmatched.get(key).count++;
    unmatched.get(key).screens.add(`${finding.screen} (${finding.format})`);
  }
  const describeMatch = (entry) =>
    [
      ...entry.matches
        .slice(0, 3)
        .map((finding) => `${rulesById.get(finding.rule).title} : ${finding.label} = ${finding.value}`),
      ...entry.metricMatches.map((metric) => `${rulesById.get(metric.rule).title} = ${metric.value}`),
    ]
      .map(escape)
      .join("<br>");
  const list = (entries) =>
    entries.length
      ? `<table><tr><th>Écran</th><th>Format</th><th>Défaut constaté</th><th>Règles attendues</th><th>Diagnostic du scanner</th></tr>${entries
          .map(
            (entry) =>
              `<tr><td>${html(entry.screen)}</td><td>${html(entry.format)}</td><td>${html(entry.defect)}</td><td>${html(entry.rules.join(", "))}</td><td>${entry.found ? describeMatch(entry) : "—"}</td></tr>`,
          )
          .join("")}</table>`
      : "<p>Aucun.</p>";
  const section = `<h2>Confrontation aux défauts constatés à la main${label ? ` (${html(label)})` : ""}</h2>
<h3>Défauts retrouvés par une règle (${result.filter((entry) => entry.found).length})</h3>${list(result.filter((entry) => entry.found))}
<h3>Défauts manqués (${result.filter((entry) => !entry.found).length})</h3>${list(result.filter((entry) => !entry.found))}
<h3>Diagnostics sans défaut constaté correspondant</h3>
<p>À juger : vrai défaut non vu ou bruit de la règle. Regroupés par règle.</p>
<table><tr><th>Règle</th><th>Écarts</th><th>Écrans</th></tr>${[...unmatched.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(
      ([rule, entry]) =>
        `<tr><td>${html(rulesById.get(rule).title)}</td><td class="num">${entry.count}</td><td>${html([...entry.screens].slice(0, 12).join(", "))}${entry.screens.size > 12 ? ` … (${entry.screens.size} écrans)` : ""}</td></tr>`,
    )
    .join("")}</table>`;
  return { html: section, result };
}

export function writeReport({ outputDirectory, config, records, missing, evaluation, comparison, label }) {
  const pages = join(outputDirectory, "pages");
  mkdirSync(pages, { recursive: true });
  const rulesById = new Map(evaluation.rules.map((entry) => [entry.rule.id, entry.rule]));
  const formatsById = new Map(config.formats.map((format) => [format.id, format]));
  const screens = [...new Map(records.map((record) => [record.screen.id, record.screen])).values()];
  const order = config.screenOrder ?? screens.map((screen) => screen.id);
  screens.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const byPage = (format, screen) =>
    evaluation.findings
      .filter((finding) => finding.format === format && finding.screen === screen)
      .sort((a, b) => Number(a.exploratory) - Number(b.exploratory) || a.rule.localeCompare(b.rule));

  for (const record of records) {
    const others = config.formats
      .filter((format) => format.id !== record.format)
      .filter((format) => records.some((other) => other.format === format.id && other.screen.id === record.screen.id))
      .map((format) => `<a href="${pageName(format.id, record.screen.id)}">${html(format.label)}</a>`);
    const sameFormat = screens.filter((screen) =>
      records.some((other) => other.format === record.format && other.screen.id === screen.id),
    );
    const position = sameFormat.findIndex((screen) => screen.id === record.screen.id);
    const previous = sameFormat[position - 1];
    const next = sameFormat[position + 1];
    const navigation = [
      previous ? `<a href="${pageName(record.format, previous.id)}">← ${html(previous.title)}</a>` : "",
      next ? `<a href="${pageName(record.format, next.id)}">${html(next.title)} →</a>` : "",
      ...others,
    ].join("");
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
        formatsById,
        navigation,
      }),
    );
  }

  const blocking = evaluation.rules.filter((entry) => !entry.exploratory && entry.rule.kind !== "metric");
  const exploratoryElement = evaluation.rules.filter((entry) => entry.exploratory && entry.rule.kind !== "metric");
  const metricRules = evaluation.rules.filter((entry) => entry.enabled && entry.rule.kind === "metric");
  const count = (filter) => evaluation.findings.filter(filter).length;
  const ruleRows = [...blocking, ...exploratoryElement]
    .map((entry) => {
      const cells = config.formats
        .map((format) => {
          const total = count((finding) => finding.rule === entry.rule.id && finding.format === format.id);
          const fresh = count(
            (finding) => finding.rule === entry.rule.id && finding.format === format.id && finding.status === "new",
          );
          return `<td class="num${total ? "" : " zero"}">${total}${fresh ? ` <span class="new">(${fresh} nouv.)</span>` : ""}</td>`;
        })
        .join("");
      return `<tr><td>${html(entry.rule.title)}<br><span class="known">${html(entry.rule.id)}${entry.enabled ? "" : ", désactivée"}</span></td><td>${html(families[entry.rule.family].title)}</td>${cells}<td>${html(entry.rule.explanation)}</td></tr>`;
    })
    .join("");
  const screenRows = screens
    .map((screen) => {
      const cells = config.formats
        .map((format) => {
          const has = records.some((record) => record.format === format.id && record.screen.id === screen.id);
          const absent = missing.find((entry) => entry.format === format.id && entry.screen.id === screen.id);
          if (!has) return `<td>${absent ? '<span class="new">non ouvert</span>' : '<span class="zero">—</span>'}</td>`;
          const list = byPage(format.id, screen.id);
          const fresh = list.filter((finding) => finding.status === "new").length;
          const known = list.filter((finding) => finding.status === "known").length;
          const explore = list.filter((finding) => finding.exploratory).length;
          return `<td><a href="pages/${pageName(format.id, screen.id)}">${fresh + known} écart(s)</a>${fresh ? ` <span class="new">${fresh} nouv.</span>` : ""}${explore ? ` <span class="explore">+${explore} expl.</span>` : ""}</td>`;
        })
        .join("");
      return `<tr><td>${html(screen.title)}<br><span class="known">${html(screen.id)}</span></td>${cells}</tr>`;
    })
    .join("");
  const flagged = outliers(evaluation.metrics);
  const metricTables = config.formats
    .map((format) => {
      const header = metricRules
        .map(
          (entry) =>
            `<th title="${html(entry.rule.explanation)}">${html(entry.rule.title)}${entry.rule.unit ? ` (${html(entry.rule.unit)})` : ""}</th>`,
        )
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
              if (!metric) return '<td class="zero">—</td>';
              const classes = [
                "num",
                metric.outside ? "out" : "",
                flagged.has(`${metric.rule}|${metric.format}|${metric.screen}`) ? "outlier" : "",
              ].filter(Boolean);
              return `<td class="${classes.join(" ")}">${html(metric.value)}</td>`;
            })
            .join("");
          return `<tr><td><a href="pages/${pageName(format.id, screen.id)}">${html(screen.title)}</a></td>${cells}</tr>`;
        })
        .join("");
      const ranges = metricRules
        .map((entry) => {
          const params = entry.params(format.id);
          return `<td class="num known">${html(params.low)} à ${html(params.high)}</td>`;
        })
        .join("");
      return `<h3>${html(format.label)} ${format.width} × ${format.height}</h3><div class="scroll"><table><tr><th>Écran</th>${header}</tr><tr><td class="known">Plage</td>${ranges}</tr>${body}</table></div>`;
    })
    .join("");
  const definitions = metricRules
    .map((entry) => `<tr><td>${html(entry.rule.title)}</td><td>${html(entry.rule.explanation)}</td></tr>`)
    .join("");
  const settingsRows = evaluation.rules
    .map((entry) => {
      const params = config.formats
        .filter((format) => entry.applies(format))
        .map(
          (format) =>
            `${html(format.label)} : ${html(
              Object.entries(entry.params(format.id))
                .map(([name, value]) => `${name} ${value}`)
                .join(", "),
            )}`,
        )
        .join("<br>");
      return `<tr><td>${html(entry.rule.id)}</td><td>${entry.enabled ? "oui" : "non"}</td><td>${html(severities[entry.severity] ?? entry.severity)}</td><td>${params || "aucun format"}</td><td>${html([...entry.excludeScreens].join(", "))}</td></tr>`;
    })
    .join("");
  const confronted = confrontation(config.humanDefects, evaluation.findings, evaluation.metrics, rulesById, label);
  const comparisonHtml = comparison?.length
    ? `<h3>Comparaison avec l'autre état mesuré</h3><table><tr><th>Défaut constaté</th><th>Écran</th><th>${html(label ?? "Cet état")}</th><th>${html(comparison.label)}</th></tr>${confronted.result
        .map((entry, index) => {
          const other = comparison[index];
          const cell = (found) =>
            found ? '<span class="ok">retrouvé</span>' : '<span class="new">non retrouvé</span>';
          return `<tr><td>${html(entry.defect)}</td><td>${html(entry.screen)} (${html(entry.format)})</td><td>${cell(entry.found)}</td><td>${other ? cell(other.found) : "—"}</td></tr>`;
        })
        .join("")}</table>`
    : "";
  const missingHtml = missing.length
    ? `<h2 class="new">Écrans non ouverts (${missing.length})</h2><table><tr><th>Écran</th><th>Format</th><th>Erreur</th></tr>${missing
        .map(
          (entry) =>
            `<tr><td>${html(entry.screen.title)}</td><td>${html(entry.format)}</td><td>${html(entry.error.split("\n")[0])}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const resolvedHtml = comparisonBaseline(evaluation);
  writeFileSync(
    join(outputDirectory, "index.html"),
    page(
      `Revue des écrans${label ? ` · ${label}` : ""}`,
      `<h1>Revue des écrans de ${html(config.name)}${label ? ` · ${html(label)}` : ""}</h1>
<p>Mesuré le ${html(new Date().toLocaleString("fr-FR"))} : ${screens.length} écrans, ${records.length} pages mesurées sur ${config.formats.length} formats (${config.formats.map((format) => `${html(format.label)} ${format.width} × ${format.height}`).join(", ")}). Textes extraits : <a href="textes.json">textes.json</a>.</p>
<p>${count((finding) => !finding.exploratory)} écarts des règles de dimensionnement, dont <span class="new">${count((finding) => finding.status === "new")} absents de la référence</span> ; ${evaluation.resolved?.length ?? 0} lignes de la référence ne correspondent plus à un écart.</p>
${missingHtml}
<h2>Écarts par écran et par format</h2><div class="scroll"><table><tr><th>Écran</th>${config.formats.map((format) => `<th>${html(format.label)}</th>`).join("")}</tr>${screenRows}</table></div>
<h2>Écarts par règle</h2><div class="scroll"><table><tr><th>Règle</th><th>Famille</th>${config.formats.map((format) => `<th>${html(format.label)}</th>`).join("")}<th>Définition</th></tr>${ruleRows}</table></div>
${resolvedHtml}
<h2>Indicateurs d'équilibre, tous écrans (exploratoires)</h2>
<p>Valeur surlignée : hors de la plage réglée. Cadre bleu : écran qui s'écarte d'au moins 1,5 écart type de la moyenne des écrans du même format. Ces indicateurs ne font jamais échouer le contrôle.</p>
${metricTables}
<h3>Définitions</h3><table>${definitions}</table>
${confronted.html}${comparisonHtml}
<h2>Réglage effectif des règles</h2><div class="scroll"><table><tr><th>Règle</th><th>Active</th><th>Gravité</th><th>Paramètres par format</th><th>Écrans exclus</th></tr>${settingsRows}</table></div>`,
    ),
  );
  return confronted.result;
}

function comparisonBaseline(evaluation) {
  if (!evaluation.resolved?.length) return "";
  return `<h2>Lignes de la référence à retirer (${evaluation.resolved.length})</h2><p>Ces écarts connus ne sont plus mesurés : retirez-les en régénérant la référence.</p><ul>${evaluation.resolved
    .map((key) => `<li><code>${html(key)}</code></li>`)
    .join("")}</ul>`;
}
