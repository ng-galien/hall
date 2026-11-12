import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/*
 * Sentences of explanation or of instructions: decision of 12 November 2026, an explanation is not written in clear on a
 * screen, it lies behind the information icon (HelpHint). Data, labels, states, error messages, empty states, warnings
 * that block an action and the help pages stay in clear.
 *
 * The catalogue of the French texts is the source: a text is an explanation when its key names one (…Hint, …Help,
 * …Description, …Intro, …Explanation, …Instructions, …Guide) or when it holds two sentences or more; the keys of an
 * error, an empty state, a blocking warning, a confirmation and the help pages are not. The screen rule compares the
 * visible texts with these sentences, so that a text drawn from the data never counts.
 */

const clientDirectory = resolve(import.meta.dirname, "../../..");
const repository = resolve(clientDirectory, "../..");

const explanationKey = /(Hint|Help|Description|Desc|Intro|Explanation|Explain|Instructions?|Guide|Guidance)$/i;
const keptKey =
  /(^|\.)(error|errors|issue|empty|noMatch|none|blocked|blocker|blockers|warning|confirm\w*|docs|authorization)(\.|$)|(Error|Failed|Empty|Blocked|Blocker|Confirm|Warning|Unavailable)\w*$/i;
const keptText = /^(Aucun|Aucune|Impossible|Erreur|Échec)\b/;

/** The texts of the French catalogue, by key. */
export function catalogue() {
  const source = readFileSync(join(clientDirectory, "src/i18n/fr.ts"), "utf8");
  const entries = new Map();
  for (const match of source.matchAll(/^\s+"([^"]+)":\s*\n?\s*("(?:[^"\\]|\\.)*")/gm))
    entries.set(match[1], JSON.parse(match[2]));
  return entries;
}

const words = (text) => text.split(/\s+/).filter((word) => /\p{L}/u.test(word)).length;
const sentences = (text) => text.split(/(?<=[.!?…])\s+(?=[A-ZÀ-Ý«])/u).filter((part) => words(part) >= 2).length;

/** Whether a text of the catalogue is a sentence of explanation, and why. */
export function explanationOf(key, text) {
  if (keptKey.test(key) || keptText.test(text.trim())) return null;
  if (words(text) < 4) return null;
  if (explanationKey.test(key)) return "clé d'explication";
  if (sentences(text) >= 2 && words(text) >= 10) return "deux phrases ou plus";
  return null;
}

/** The sentences of explanation of the catalogue: `{ key, text, why }`. */
export function explanationTexts() {
  const found = [];
  for (const [key, text] of catalogue()) {
    const why = explanationOf(key, text);
    if (why) found.push({ key, text, why });
  }
  return found;
}

/** The texts as the screen shows them: placeholders become any text, spaces are collapsed. */
export function screenPatterns() {
  return explanationTexts()
    .filter(({ key }) => !message.test(key))
    .map(({ key, text }) => ({
      key,
      // A placeholder ({name}) becomes any text; every other character is written as itself.
      pattern: text
        .replace(/\s+/g, " ")
        .trim()
        .split(/\{[^{}]*\}/)
        .map((part) => part.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&"))
        .join(".+?"),
    }));
}

function files(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === "docs" || name === "i18n" ? [] : files(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/* What the use of a text shows: behind the information icon, in an attribute read on hover or by a screen reader, or in
   clear in a component. */
const hidden = /HelpHint|aria-label|aria-description|title=|placeholder|TooltipContent|tooltip|label=\{?\s*t\(/;

/* A message the decision keeps in clear: an error, a conflict, a blocking warning, a confirmation, a result. */
const message =
  /(Conflict|conflict|Success|Recorded|Preserved|alreadyPresent|capacityReached|Incomplete|delete\w*Help|offline|WithoutQuorum|Prepared|passwordRecorded)\b|^applicationError\./;

/**
 * Every use, in the client sources, of a sentence of explanation, with the component that shows it. `kind` is
 * « explication » or « message » (an error, a warning, a confirmation or a result, which the decision keeps in clear).
 * A key composed at run time (`${kind}.membersDescription`) is found by its last segment.
 */
export function inventory() {
  const texts = explanationTexts();
  const byKey = new Map(texts.map((entry) => [entry.key, entry]));
  const bySegment = new Map();
  for (const entry of texts) {
    const segment = entry.key.split(".").at(-1);
    if (!bySegment.has(segment)) bySegment.set(segment, []);
    bySegment.get(segment).push(entry);
  }
  const uses = [];
  const seen = new Set();
  for (const path of files(join(clientDirectory, "src"))) {
    const source = readFileSync(path, "utf8");
    const lines = source.split("\n");
    lines.forEach((line, index) => {
      const found = [];
      for (const match of line.matchAll(/["'`]([a-zA-Z][\w-]*(?:\.[\w-]+)+)["'`]/g))
        if (byKey.has(match[1])) found.push(byKey.get(match[1]));
      // A key composed at run time: its last segment written alone, or after an interpolation.
      for (const match of line.matchAll(/(?:["'`]|\}\.)([a-z][A-Za-z]*(?:Description|Hint|Help|Intro))["'`]?/g))
        for (const entry of bySegment.get(match[1]) ?? [])
          if (!found.includes(entry) && new RegExp(`[(|<]\\s*"${entry.key.split(".")[0]}"`).test(source))
            found.push({ ...entry, composed: true });
      for (const entry of found) {
        const context = lines.slice(Math.max(0, index - 3), index + 1).join("\n");
        if (hidden.test(line) || /HelpHint|MinutesSectionHint|TooltipContent|<Explained\b/.test(context)) continue;
        const prop = [...context.matchAll(/(\w+)=\{/g)].at(-1)?.[1];
        const tag = [...context.matchAll(/<([A-Z]?\w+)[\s>]/g)].at(-1)?.[1];
        const key = `${entry.key} ${path}:${index}`;
        if (seen.has(key)) continue;
        seen.add(key);
        uses.push({
          ...entry,
          kind: message.test(entry.key) || /Warning|Alert|CheckCircle/.test(context) ? "message" : "explication",
          file: relative(repository, path),
          line: index + 1,
          shownBy:
            prop && context.lastIndexOf(`${prop}={`) > context.lastIndexOf(`<${tag}`)
              ? `${tag ?? "?"} ${prop}`
              : (tag ?? "?"),
        });
      }
      /* A sentence written in the source itself, outside the catalogue. */
      const literal = line.match(/>\s*([A-ZÀ-Ý][^<>{}]{40,})\s*</u);
      if (literal && sentences(literal[1]) >= 1 && words(literal[1]) >= 8)
        uses.push({
          key: "(écrit dans le code)",
          kind: "explication",
          text: literal[1].trim(),
          why: "phrase écrite dans le code",
          file: relative(repository, path),
          line: index + 1,
          shownBy: [...line.matchAll(/<([A-Z]?\w+)[\s>]/g)].at(-1)?.[1] ?? "?",
        });
    });
  }
  return uses;
}
