import { readFile, stat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

const [reportName, expectedScope] = process.argv.slice(2);
if (!reportName || !expectedScope || !/^realtime-(meeting|resource|frontend)\.json$/.test(reportName)) {
  throw new Error('Expected a realtime review report and scope');
}
const path = resolve('.trust/reviews', reportName);
const report = JSON.parse(await readFile(path, 'utf8'));
if (report.scope !== expectedScope) throw new Error('Review scope mismatch');
if (!Array.isArray(report.findings) || report.findings.length === 0) throw new Error('Review has no findings');
if (!Array.isArray(report.evidencePaths) || report.evidencePaths.length === 0) throw new Error('Review has no evidence paths');
if (!Array.isArray(report.openDecisions)) throw new Error('Review has no openDecisions field');
for (const value of [...report.findings, ...report.openDecisions]) {
  if (typeof value !== 'string' || !value.trim() || value.includes('|') || value.includes('\n')) {
    throw new Error('Invalid review text');
  }
}
for (const source of report.evidencePaths) {
  if (typeof source !== 'string' || source.startsWith('/') || source.includes('..')) throw new Error('Invalid evidence path');
  const absolute = resolve(source);
  if (relative(process.cwd(), absolute).startsWith('..')) throw new Error('Evidence outside workspace');
  if (!(await stat(absolute)).isFile()) throw new Error(`Evidence is not a file: ${source}`);
}
process.stdout.write(`scope:${report.scope}\n`);
process.stdout.write(`findings:${report.findings.join('|')}\n`);
process.stdout.write(`evidence:${report.evidencePaths.join('|')}\n`);
process.stdout.write(`openDecisions:${report.openDecisions.join('|')}\n`);
process.stdout.write(`decisionStatus:${report.openDecisions.length === 0 ? 'clear' : 'needs-resolution'}\n`);
