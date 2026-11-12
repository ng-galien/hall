import { existsSync, readFileSync, writeFileSync } from "node:fs";

/*
 * The baseline lists the findings of the blocking rules that are accepted, one entry per format, screen, rule and
 * element, each with the measured value and the reason written by the verifier. An entry without a reason accepts
 * nothing. A finding that is not accepted, or whose value changed since it was accepted, fails the check; an entry
 * without a finding is reported for removal, unless its screen was not measured in this run.
 */

/** `Map(key → { value, reason })` of the accepted findings; entries without a written reason are left out. */
export function readBaseline(file) {
  if (!existsSync(file)) return new Map();
  const accepted = JSON.parse(readFileSync(file, "utf8")).accepted ?? [];
  return new Map(accepted.filter((entry) => entry.reason?.trim()).map((entry) => [entry.key, entry]));
}

/**
 * Writes the current blocking findings as entries to review: an entry already accepted keeps its reason, a new one
 * gets an empty reason, which accepts nothing until the verifier writes one.
 */
export function writeBaseline(file, findings) {
  const previous = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")).accepted ?? []) : [];
  const reasons = new Map(previous.map((entry) => [entry.key, entry.reason ?? ""]));
  const entries = new Map();
  for (const finding of findings.filter((entry) => !entry.exploratory))
    entries.set(finding.key, { key: finding.key, value: finding.value, reason: reasons.get(finding.key) ?? "" });
  const accepted = [...entries.values()].sort((a, b) => a.key.localeCompare(b.key));
  writeFileSync(
    file,
    `${JSON.stringify(
      {
        description:
          "Accepted screen-audit findings: format | screen | rule | element, the measured value and the reason written by the verifier. An entry without a reason accepts nothing.",
        accepted,
      },
      null,
      2,
    )}\n`,
  );
  return accepted.length;
}

export function compareWithBaseline(findings, baseline, measuredScreens) {
  const blocking = findings.filter((finding) => !finding.exploratory);
  const current = new Set(blocking.map((finding) => finding.key));
  for (const finding of blocking) {
    const entry = baseline.get(finding.key);
    finding.status = entry && (entry.value === undefined || entry.value === finding.value) ? "known" : "new";
  }
  const resolved = [...baseline.keys()].filter((key) => {
    if (current.has(key)) return false;
    const [format, screen] = key.split(" | ");
    return measuredScreens.has(`${format} | ${screen}`);
  });
  return {
    fresh: blocking.filter((finding) => finding.status === "new"),
    known: blocking.filter((finding) => finding.status === "known"),
    resolved,
  };
}
