import { existsSync, readFileSync, writeFileSync } from "node:fs";

/*
 * The baseline freezes the known findings of the blocking rules, one line per format, screen, rule and element.
 * A finding absent from it is new and fails the check; a baseline line without a finding is reported for removal,
 * unless its screen was not measured in this run.
 */

export function readBaseline(file) {
  if (!existsSync(file)) return new Set();
  return new Set(JSON.parse(readFileSync(file, "utf8")).findings ?? []);
}

export function writeBaseline(file, findings) {
  const lines = [...new Set(findings.filter((finding) => !finding.exploratory).map((finding) => finding.key))].sort();
  writeFileSync(
    file,
    `${JSON.stringify(
      {
        description:
          "Known screen-audit findings: format | screen | rule | element. Regenerate with the --update-baseline option.",
        findings: lines,
      },
      null,
      2,
    )}\n`,
  );
  return lines.length;
}

export function compareWithBaseline(findings, baseline, measuredScreens) {
  const blocking = findings.filter((finding) => !finding.exploratory);
  const current = new Set(blocking.map((finding) => finding.key));
  for (const finding of blocking) finding.status = baseline.has(finding.key) ? "known" : "new";
  const resolved = [...baseline].filter((key) => {
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
