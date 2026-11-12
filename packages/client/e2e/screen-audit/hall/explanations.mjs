import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

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
/* The second line of an entry of the « Nouveau » menu and of a stage of a meeting: a short label. */
const shortLabel = /^create\.kind\.[\w-]+\.description$|^meeting\.stage\.[\w-]+\.hint$/;
/* A message the decision keeps in clear: an error, a conflict, a blocking warning, a confirmation, a result. */
const message =
  /(Conflict|conflict|Success|Recorded|Preserved|alreadyPresent|capacityReached|Incomplete|delete\w*Help|offline|WithoutQuorum|Prepared|passwordRecorded)\b|^applicationError\./;

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
  // Decisions of 12 November 2026: messages stay in clear; short second lines are labels; the development page is out.
  if (message.test(key) || shortLabel.test(key) || /^editor\.lab\./.test(key)) return null;
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
  return explanationTexts().map(({ key, text }) => ({
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
    return /\.tsx?$/.test(name) && name !== "EditorLabPage.tsx" ? [path] : [];
  });
}

/* What the use of a text shows: behind the information icon, in an attribute read on hover or by a screen reader, or in
   clear in a component. */
const hiddenAttributes = new Set(["aria-label", "aria-description", "title", "placeholder", "label", "tooltip"]);
/** Whether the text at `position` of `line` is given to an attribute read on hover or by a screen reader, or a label. */
const hiddenAt = (line, position) => {
  const attribute = [...line.slice(0, position).matchAll(/([\w-]+)(?:=\{?|:\s*)/g)].at(-1)?.[1];
  return attribute ? hiddenAttributes.has(attribute) : false;
};

/**
 * The shared components that write one of their props behind the information icon today: `{ Component: Set(prop) }`,
 * read in their code (`<HelpHint text={prop}`), so that a text given to that prop is not counted as written in clear.
 */
export function componentsWithHelp() {
  const found = {};
  for (const path of files(join(clientDirectory, "src"))) {
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(/<HelpHint\s+text=\{(\w+)\}/g)) {
      const component = [
        ...source.slice(0, match.index).matchAll(/(?:export\s+)(?:function|const)\s+([A-Z]\w*)\s*[(=<]/g),
      ].at(-1)?.[1];
      if (!component) continue;
      found[component] ??= new Set();
      found[component].add(match[1]);
    }
  }
  return found;
}

/**
 * Every use, in the client sources, of a sentence of explanation, with the component that shows it; a message shown
 * beside a warning or a success icon stays in clear and is left out. A key composed at run time (`${kind}.membersDescription`) is found by its last segment.
 */
/** The sources of the folder of `path`: a key composed in one file of a feature is used by its siblings. */
const folderSource = (path) =>
  readdirSync(dirname(path))
    .filter((name) => /\.tsx?$/.test(name))
    .map((name) => readFileSync(join(dirname(path), name), "utf8"))
    .join("\n");

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
  const helped = componentsWithHelp();
  // The functions whose returned key is written behind the icon: `<HelpHint text={t(name(…))} />`.
  const helpCalls = new Set(
    files(join(clientDirectory, "src")).flatMap((path) =>
      [...readFileSync(path, "utf8").matchAll(/<HelpHint\s+text=\{t\((\w+)\(/g)].map((match) => match[1]),
    ),
  );
  for (const path of files(join(clientDirectory, "src"))) {
    const source = readFileSync(path, "utf8");
    const lines = source.split("\n");
    lines.forEach((line, index) => {
      const found = [];
      for (const match of line.matchAll(/["'`]([a-zA-Z][\w-]*(?:\.[\w-]+)+)["'`]/g))
        if (byKey.has(match[1])) found.push({ ...byKey.get(match[1]), position: match.index });
      // A key composed at run time: its last segment written alone, after an interpolation or a member (text.description).
      if (!/^\s*"\w+",?\s*$/.test(line))
        for (const match of line.matchAll(
          /(?:["'`]|\}\.|\btext\.)((?:[a-z][A-Za-z]*)?(?:[Dd]escription|Hint|Help|Intro))\b/g,
        ))
          for (const entry of /^[Dd]escription$/.test(match[1]) && !match[0].startsWith("text.")
            ? []
            : (bySegment.get(match[1]) ?? []))
            if (
              !found.some((other) => other.key === entry.key) &&
              new RegExp(`[(|<]\\s*"${entry.key.split(".")[0]}"`).test(folderSource(path))
            )
              found.push({ ...entry, composed: true, position: match.index });
      for (const entry of found) {
        const context = lines.slice(Math.max(0, index - 3), index + 1).join("\n");
        if (hiddenAt(line, entry.position) || /HelpHint|MinutesSectionHint|TooltipContent|<Explained\b/.test(context))
          continue;
        // The component and the prop that receive the text: read before the key, on its line and the lines above.
        const before = `${lines.slice(Math.max(0, index - 8), index).join("\n")}\n${line.slice(0, entry.position)}`;
        const prop = [...before.matchAll(/(\w+)=\{/g)].at(-1)?.[1];
        const tag = [...before.matchAll(/<([A-Z]?\w+)[\s>]/g)].at(-1)?.[1];
        // The text reaches the information icon through a constant (`const hint = t(…)`) or a function returning its key.
        const constant = [...before.matchAll(/const\s+(\w+)\s*=\s*t\(/g)].at(-1)?.[1];
        if (constant && new RegExp(`<HelpHint\\s+text=\\{${constant}\\}`).test(source)) continue;
        const enclosing = [...before.matchAll(/function\s+(\w+)\s*\(/g)].at(-1)?.[1];
        if (enclosing && helpCalls.has(enclosing)) continue;
        // A prop the shared component writes behind its information icon (PageHeader description, Field hint…).
        if (prop && tag && helped[tag]?.has(prop) && before.lastIndexOf(`${prop}={`) > before.lastIndexOf(`<${tag}`))
          continue;
        const key = `${entry.key} ${path}:${index}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (/Warning|Alert|CheckCircle/.test(context)) continue;
        uses.push({
          ...entry,
          file: relative(repository, path),
          line: index + 1,
          shownBy:
            prop && before.lastIndexOf(`${prop}={`) > before.lastIndexOf(`<${tag}`)
              ? `${tag ?? "?"} ${prop}`
              : (tag ?? "?"),
        });
      }
      /* A sentence written in the source itself, outside the catalogue. */
      const literal = line.match(/>\s*([A-ZÀ-Ý][^<>{}]{40,})\s*</u);
      if (literal && sentences(literal[1]) >= 1 && words(literal[1]) >= 8)
        uses.push({
          key: "(écrit dans le code)",
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
