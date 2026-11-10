import { describe } from "./geometry.mjs";
import { engineRules } from "./rules/index.mjs";

/**
 * Resolves the project's rule settings over the engine defaults. A setting may give `enabled`, `formats`
 * ("all", "touch", "pointer" or a list of format identifiers), `severity`, `params` (a value, or an object keyed by
 * format identifier) and `excludeScreens`. A severity of "indicator" lowers a blocking rule to an exploratory one.
 */
export function resolveRules(config) {
  const settings = config.rules ?? {};
  for (const id of Object.keys(settings))
    if (!engineRules.some((rule) => rule.id === id)) throw new Error(`Unknown screen-audit rule in settings: ${id}`);
  return engineRules.map((rule) => {
    const setting = settings[rule.id] ?? {};
    const formats = setting.formats ?? rule.defaults.formats;
    const applies = (format) =>
      Array.isArray(formats)
        ? formats.includes(format.id)
        : formats === "all" || (formats === "touch" ? format.touch : formats === "pointer" ? !format.touch : false);
    const params = (formatId) =>
      Object.fromEntries(
        Object.entries({ ...rule.defaults.params, ...(setting.params ?? {}) }).map(([name, value]) => [
          name,
          value !== null && typeof value === "object" ? (value[formatId] ?? value.default) : value,
        ]),
      );
    return {
      rule,
      enabled: setting.enabled ?? true,
      formats,
      applies,
      severity: setting.severity ?? rule.defaults.severity,
      params,
      excludeScreens: new Set(setting.excludeScreens ?? []),
      justification: setting.justification ?? "",
      exploratory: Boolean(rule.exploratory) || (setting.severity ?? rule.defaults.severity) === "indicator",
    };
  });
}

/** Where an element of the snapshot appears in the screenshots: the part index and its rectangle in that part. */
export function placement(record, index, rect) {
  if (index < 0) return { part: 0, rect: { x: 0, y: 0, w: record.viewport.width, h: record.viewport.height } };
  const fixedChain = (() => {
    for (let current = index; current >= 0; current = record.elements[current].parent)
      if (["fixed", "sticky"].includes(record.elements[current].position)) return true;
    return false;
  })();
  const scrolls = (() => {
    if (!record.scroller) return !fixedChain;
    for (let current = record.elements[index].parent; current >= 0; current = record.elements[current].parent)
      if (current === record.scroller.index) return !fixedChain;
    return false;
  })();
  const height = record.viewport.height;
  for (const [part, { offset }] of record.parts.entries()) {
    const shifted = { ...rect, y: rect.y - (scrolls ? offset : 0) };
    if (shifted.y >= -1 && shifted.y + Math.min(shifted.h, height) <= height + 1) return { part, rect: shifted };
    if (!scrolls) break;
  }
  return { part: null, rect };
}

const findingKey = (finding) => [finding.format, finding.screen, finding.rule, finding.element].join(" | ");

/** Applies the enabled rules to every captured record; returns grouped findings and screen indicators. */
export function evaluate(records, config) {
  const rules = resolveRules(config).filter((entry) => entry.enabled);
  const formats = new Map(config.formats.map((format) => [format.id, format]));
  const raw = [];
  const metrics = [];
  const annotations = [];
  const push = (entry, record, result) => {
    const element = result.index >= 0 ? record.elements[result.index] : null;
    const rect = element ? element.visibleRect : null;
    raw.push({
      rule: entry.rule.id,
      family: entry.rule.family,
      exploratory: entry.exploratory,
      severity: entry.severity,
      unit: entry.rule.unit,
      format: record.format,
      screen: record.screen.id,
      element: element ? element.key : "page",
      label: element ? describe(element) : "page entière",
      value: result.value,
      sortValue: result.sortValue ?? (typeof result.value === "number" ? result.value : 0),
      threshold: result.threshold,
      detail: result.detail ?? "",
      line: result.line,
      placement: placement(record, result.index, rect ?? { x: 0, y: 0, w: 0, h: 0 }),
    });
  };
  for (const entry of rules) {
    for (const [formatId, format] of formats) {
      if (!entry.applies(format)) continue;
      const params = entry.params(formatId);
      const scoped = records.filter(
        (record) => record.format === formatId && !entry.excludeScreens.has(record.screen.id),
      );
      if (entry.rule.kind === "cross-screen") {
        const byScreen = new Map(scoped.map((record) => [record.screen.id, record]));
        for (const result of entry.rule.evaluateAll({ records: scoped, params, format }))
          push(entry, byScreen.get(result.screen), result);
        continue;
      }
      for (const record of scoped) {
        if (entry.rule.kind === "metric") {
          const value = entry.rule.measure({
            snapshot: record,
            params,
            format,
            annotate: (rect) =>
              annotations.push({ rule: entry.rule.id, format: formatId, screen: record.screen.id, rect }),
          });
          const outside = value < params.low || value > params.high;
          metrics.push({
            rule: entry.rule.id,
            format: formatId,
            screen: record.screen.id,
            value,
            low: params.low,
            high: params.high,
            outside,
          });
          continue;
        }
        for (const result of entry.rule.evaluate({ snapshot: record, params, format })) push(entry, record, result);
      }
    }
  }
  const grouped = new Map();
  for (const finding of raw) {
    const key = findingKey(finding);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...finding, key, occurrences: 1, placements: [finding.placement] });
      continue;
    }
    existing.occurrences++;
    if (existing.placements.length < 12) existing.placements.push(finding.placement);
    if (finding.sortValue < existing.sortValue) {
      existing.value = finding.value;
      existing.sortValue = finding.sortValue;
    }
  }
  return { findings: [...grouped.values()], metrics, annotations, rules: resolveRules(config) };
}
