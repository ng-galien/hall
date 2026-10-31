import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const downloadDir = process.argv[2];
if (!downloadDir) {
  console.error("Usage: npm run data:prepare -- <dossier contenant departements.geojson et communes-21.geojson>");
  process.exit(1);
}

const mapshaper = join(root, "node_modules", ".bin", "mapshaper");
const outDir = join(root, "src", "data");

const jobs = [
  {
    input: join(downloadDir, "departements.geojson"),
    output: join(outDir, "departements.json"),
    fields: "code,nom",
    simplify: "6%",
    precision: "0.001",
    extra: [],
  },
  {
    input: join(downloadDir, "departements.geojson"),
    output: join(outDir, "france.json"),
    fields: "code",
    simplify: "6%",
    precision: "0.001",
    extra: ["-dissolve"],
  },
  {
    input: join(downloadDir, "communes-21.geojson"),
    output: join(outDir, "communes-21.json"),
    fields: "code,nom,population",
    simplify: "8%",
    precision: "0.0005",
    extra: [],
  },
  {
    input: join(downloadDir, "communes-21.geojson"),
    output: join(outDir, "contour-21.json"),
    fields: "codeDepartement",
    simplify: "8%",
    precision: "0.0005",
    extra: ["-dissolve"],
  },
];

for (const job of jobs) {
  execFileSync(
    mapshaper,
    [
      job.input,
      "-filter-fields",
      job.fields,
      "-simplify",
      job.simplify,
      "keep-shapes",
      "-clean",
      ...job.extra,
      "-o",
      job.output,
      "format=geojson",
      `precision=${job.precision}`,
    ],
    { stdio: "inherit" },
  );
}

let total = 0;
for (const job of jobs) {
  const size = statSync(job.output).size;
  total += size;
  console.log(`${job.output}: ${(size / 1024).toFixed(1)} ko`);
}
console.log(`Total : ${(total / 1024).toFixed(1)} ko`);
