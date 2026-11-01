import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createReadStream,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

// @implements-requirement HALL-TR-DST-030
const provenanceName = "HALL-BUILD-PROVENANCE.json";
const checksumName = "SHA256SUMS.txt";
const ciWorkflow = ".github/workflows/ci.yml";
const buildWorkflow = ".github/workflows/release.yml";
const requiredJobs = [
  "build",
  "verification",
  "browser (1)",
  "browser (2)",
  "distribution-build",
  "distribution-install (ubuntu-latest)",
  "distribution-install (windows-2025)",
  "test",
];
const requiredPlatforms = ["macos-arm64", "macos-x64", "windows-x64", "linux-x64"];

export class PublicationBlocked extends Error {
  constructor(message, pending = false) {
    super(message);
    this.pending = pending;
  }
}

function ensure(condition, message) {
  if (!condition) throw new PublicationBlocked(message);
}

function gh(args) {
  try {
    return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }).trim();
  } catch (failure) {
    const status = String(failure.stderr ?? "").match(/HTTP \d+/)?.[0] ?? "command failed";
    throw new PublicationBlocked(`GitHub ${args[0]}: ${status}; publication was not authorized by an unavailable API.`);
  }
}

function api(path, paginate = false) {
  return JSON.parse(gh(["api", path, ...(paginate ? ["--paginate", "--slurp"] : [])]));
}

function pages(path, property) {
  const result = api(path, true);
  ensure(Array.isArray(result), "Invalid paginated GitHub response");
  return result.flatMap((page) => {
    const values = property ? page[property] : page;
    ensure(Array.isArray(values), "Incomplete GitHub response");
    return values;
  });
}

function source(repo, tag) {
  const commit = api(`repos/${repo}/commits/${encodeURIComponent(tag)}`);
  ensure(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit.sha), "Tag does not resolve to an exact commit");
  const file = api(`repos/${repo}/contents/packages/desktop/package.json?ref=${commit.sha}`);
  ensure(file.encoding === "base64" && typeof file.content === "string", "Missing version manifest at the tag commit");
  const metadata = JSON.parse(Buffer.from(file.content, "base64").toString("utf8"));
  ensure(tag === `v${metadata.version}`, "Tag differs from the application version at that exact commit");
  return { repo, tag, sha: commit.sha, version: metadata.version };
}

function jobs(repo, run) {
  const result = api(`repos/${repo}/actions/runs/${run}/jobs?filter=latest&per_page=100`, true);
  ensure(Array.isArray(result) && result.length > 0, "Missing CI job pages");
  const values = result.flatMap((page) => {
    ensure(Array.isArray(page.jobs), "Missing CI jobs");
    return page.jobs;
  });
  ensure(
    result[0].total_count === values.length && new Set(values.map((job) => job.id)).size === values.length,
    "Incomplete CI job inventory",
  );
  return values;
}

export function assertCompleteCI(run, runJobs, expected) {
  ensure(run.head_sha === expected.sha, "CI validates another commit, not the published source");
  ensure(
    run.repository?.full_name === expected.repo && run.head_repository?.full_name === expected.repo,
    "CI belongs to another repository",
  );
  ensure(run.path?.split("@")[0] === ciWorkflow && run.event === "push", "CI is not the complete configured push gate");
  if (run.status !== "completed") throw new PublicationBlocked("CI is pending; publication remains blocked", true);
  ensure(run.conclusion === "success", `CI is not green (${run.conclusion ?? "missing conclusion"})`);
  ensure(
    requiredJobs.every((name) => runJobs.some((job) => job.name === name)),
    "A required complete CI job is missing",
  );
  ensure(
    runJobs.length > 0 && runJobs.every((job) => job.status === "completed" && job.conclusion === "success"),
    "CI contains missing, skipped, pending or unsuccessful jobs",
  );
  return run.id;
}

function validatedSource(repo, tag) {
  const expected = source(repo, tag);
  const runs = pages(
    `repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${expected.sha}&per_page=100`,
    "workflow_runs",
  );
  const candidates = runs.filter((run) => run.head_sha === expected.sha && run.event === "push");
  if (!candidates.length) throw new PublicationBlocked("No complete CI exists for the tag commit", runs.length === 0);
  candidates.sort(
    (a, b) =>
      Date.parse(b.run_started_at ?? b.created_at) - Date.parse(a.run_started_at ?? a.created_at) || b.id - a.id,
  );
  const run = candidates[0];
  const ciRun = assertCompleteCI(run, jobs(repo, run.id), expected);
  return { ...expected, ciRun };
}

async function waitForValidation(options) {
  const deadline = Date.now() + options.waitSeconds * 1000;
  for (;;) {
    try {
      return validatedSource(options.repo, options.tag);
    } catch (failure) {
      if (!(failure instanceof PublicationBlocked) || !failure.pending || Date.now() >= deadline) throw failure;
      await new Promise((accept) => setTimeout(accept, Math.min(15_000, deadline - Date.now())));
    }
  }
}

function buildProof(expected, buildRun) {
  const run = api(`repos/${expected.repo}/actions/runs/${buildRun}`);
  ensure(run.head_sha === expected.sha && run.head_branch === expected.tag, "Build run differs from the tag source");
  ensure(
    run.repository?.full_name === expected.repo && run.path?.split("@")[0] === buildWorkflow && run.event === "push",
    "Artifacts were not produced by the configured tag workflow",
  );
  const producers = jobs(expected.repo, buildRun).filter((job) => job.name.startsWith("Build the "));
  ensure(
    producers.length > 0 && producers.every((job) => job.status === "completed" && job.conclusion === "success"),
    "Not every maker completed successfully",
  );
  const artifacts = pages(`repos/${expected.repo}/actions/runs/${buildRun}/artifacts?per_page=100`, "artifacts").filter(
    (artifact) => artifact.name.startsWith("hall-demonstration-"),
  );
  ensure(
    artifacts.length === producers.length &&
      requiredPlatforms.every((platform) =>
        artifacts.some((artifact) => artifact.name === `hall-demonstration-${platform}`),
      ) &&
      new Set(artifacts.map((artifact) => artifact.name)).size === artifacts.length &&
      artifacts.every((artifact) => !artifact.expired),
    "Maker artifacts are missing, duplicated or expired",
  );
  ensure(
    artifacts.every((artifact) => !artifact.workflow_run || artifact.workflow_run.head_sha === expected.sha),
    "Artifact provenance differs from the validated source",
  );
  return artifacts.map(({ id, name, digest }) => ({ id, name, digest: digest ?? null })).sort((a, b) => a.id - b.id);
}

async function fileHash(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

function hashBytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    ensure(!entry.isSymbolicLink(), "A release artifact cannot contain a symbolic link");
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

async function collectArtifacts(expected, buildRun, artifacts, temporary) {
  const directory = join(temporary, "artifacts");
  gh([
    "run",
    "download",
    String(buildRun),
    "--repo",
    expected.repo,
    "--pattern",
    "hall-demonstration-*",
    "--dir",
    directory,
  ]);
  const files = [];
  const uploadDirectory = join(temporary, "release");
  mkdirSync(uploadDirectory);
  for (const artifact of artifacts) {
    const platform = artifact.name.slice("hall-demonstration-".length);
    ensure(/^[a-z0-9-]+$/.test(platform), "Invalid artifact platform");
    const paths = filesUnder(join(directory, artifact.name));
    ensure(paths.length > 0, "A maker artifact is empty");
    for (const path of paths) {
      const original = basename(path);
      ensure(
        original === "RELEASES" ||
          [".exe", ".nupkg", ".dmg", ".deb", ".rpm", ".tgz", ".tgz.sha256"].some((suffix) => original.endsWith(suffix)),
        "Unexpected file in a maker artifact",
      );
      ensure(
        original === "RELEASES" || original.includes(expected.version),
        "Artifact filename differs from the release version",
      );
      const name = (
        original.startsWith("ng-galien-hall-")
          ? original
          : original === "RELEASES"
            ? `RELEASES-${platform}`
            : `${platform}-${original}`
      ).replaceAll(" ", "-");
      ensure(!files.some((file) => file.name === name), "Duplicate release filename");
      ensure(/^[A-Za-z0-9._-]+$/.test(name), "Unsafe public artifact filename");
      const uploadPath = join(uploadDirectory, name);
      linkSync(path, uploadPath);
      files.push({ name, path: uploadPath, bytes: statSync(path).size, sha256: await fileHash(path) });
    }
  }
  return files;
}

function releaseFor(repo, tag) {
  return pages(`repos/${repo}/releases?per_page=100`).find((release) => release.tag_name === tag);
}

function assertSameSource(first, second) {
  ensure(first.sha === second.sha && first.version === second.version, "Tag source changed before publication");
}

function writeMetadata(expected, buildRun, artifacts, files, temporary) {
  const provenance = {
    schemaVersion: 1,
    ...expected,
    buildRun,
    artifacts,
    files: files.map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })),
  };
  const path = join(temporary, provenanceName);
  const bytes = Buffer.from(`${JSON.stringify(provenance, null, 2)}\n`);
  writeFileSync(path, bytes);
  files.push({ name: provenanceName, path, bytes: bytes.length, sha256: hashBytes(bytes) });
  const checksum = join(temporary, checksumName);
  writeFileSync(
    checksum,
    files
      .map((file) => `${file.sha256}  ${file.name}\n`)
      .sort()
      .join(""),
  );
  return { path: checksum, name: checksumName };
}

async function prepare(options) {
  const expected = await waitForValidation(options);
  const artifacts = buildProof(expected, options.buildRun);
  const existing = releaseFor(options.repo, options.tag);
  ensure(!existing || existing.draft, "A published release is never replaced");
  const temporary = mkdtempSync(join(tmpdir(), "hall-release-publication-"));
  try {
    const files = await collectArtifacts(expected, options.buildRun, artifacts, temporary);
    const checksum = writeMetadata(expected, options.buildRun, artifacts, files, temporary);
    const current = validatedSource(options.repo, options.tag);
    assertSameSource(expected, current);
    const upload = files.map((file) => file.path);
    upload.push(checksum.path);
    if (existing) {
      gh(["release", "upload", options.tag, ...upload, "--repo", options.repo, "--clobber"]);
      gh(["release", "edit", options.tag, "--repo", options.repo, "--draft", "--notes-file", options.notes]);
    } else {
      gh([
        "release",
        "create",
        options.tag,
        ...upload,
        "--repo",
        options.repo,
        "--verify-tag",
        "--draft",
        "--title",
        `Hall ${expected.version}`,
        "--notes-file",
        options.notes,
      ]);
    }
    return { ...current, buildRun: options.buildRun, draft: true };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function downloadAsset(repo, release, name, directory) {
  ensure(
    release.assets.some((asset) => asset.name === name),
    `Missing ${name} in the draft`,
  );
  gh(["release", "download", release.tag_name, "--repo", repo, "--pattern", name, "--dir", directory]);
  return readFileSync(join(directory, name));
}

async function publish(options) {
  const expected = await waitForValidation(options);
  const artifacts = buildProof(expected, options.buildRun);
  const release = releaseFor(options.repo, options.tag);
  ensure(release?.draft, "Only an existing draft can be promoted; a public release is never replaced");
  const temporary = mkdtempSync(join(tmpdir(), "hall-release-proof-"));
  try {
    const bytes = downloadAsset(options.repo, release, provenanceName, temporary);
    const proof = JSON.parse(bytes.toString("utf8"));
    ensure(
      proof.schemaVersion === 1 &&
        proof.repo === expected.repo &&
        proof.tag === expected.tag &&
        proof.sha === expected.sha &&
        proof.version === expected.version &&
        proof.buildRun === options.buildRun,
      "Draft provenance differs from the tag and validated source",
    );
    ensure(
      JSON.stringify(proof.artifacts) === JSON.stringify(artifacts),
      "Draft artifacts differ from the official maker run",
    );
    ensure(
      Array.isArray(proof.files) &&
        proof.files.length > 0 &&
        proof.files.every(
          (file) =>
            /^[A-Za-z0-9._-]+$/.test(file.name) &&
            Number.isSafeInteger(file.bytes) &&
            file.bytes > 0 &&
            /^[a-f0-9]{64}$/.test(file.sha256),
        ),
      "Missing or invalid draft file inventory",
    );
    const expectedFiles = [...proof.files, { name: provenanceName, bytes: bytes.length, sha256: hashBytes(bytes) }];
    const names = [...expectedFiles.map((file) => file.name), checksumName];
    ensure(
      new Set(names).size === names.length &&
        release.assets.length === names.length &&
        release.assets.every((asset) => names.includes(asset.name)),
      "Draft asset inventory is incomplete or contains unverified files",
    );
    for (const file of expectedFiles) {
      const asset = release.assets.find((entry) => entry.name === file.name);
      ensure(
        asset?.size === file.bytes && asset.digest === `sha256:${file.sha256}`,
        `Draft asset bytes differ: ${file.name}`,
      );
    }
    const checksumBytes = downloadAsset(options.repo, release, checksumName, temporary);
    const checksumAsset = release.assets.find((asset) => asset.name === checksumName);
    ensure(checksumAsset.digest === `sha256:${hashBytes(checksumBytes)}`, "Checksum manifest digest differs");
    const lines = checksumBytes.toString("utf8").trim().split("\n").sort();
    ensure(
      JSON.stringify(lines) === JSON.stringify(expectedFiles.map((file) => `${file.sha256}  ${file.name}`).sort()),
      "Checksum manifest differs from the draft inventory",
    );
    const current = validatedSource(options.repo, options.tag);
    assertSameSource(expected, current);
    gh([
      "release",
      "edit",
      options.tag,
      "--repo",
      options.repo,
      "--draft=false",
      ...(release.prerelease ? [] : ["--latest"]),
    ]);
    return { ...current, buildRun: options.buildRun, published: true };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

export function parseOptions(args) {
  const [operation, ...rest] = args;
  ensure(["check", "prepare", "publish"].includes(operation), "Choose check, prepare or publish");
  const options = { operation, repo: process.env.GH_REPO ?? "ng-galien/hall", waitSeconds: 0 };
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    ensure(
      ["--repo", "--tag", "--build-run", "--notes-file", "--wait-seconds"].includes(key) && value !== undefined,
      `Unknown or incomplete option: ${key}`,
    );
    const field = {
      "--repo": "repo",
      "--tag": "tag",
      "--build-run": "buildRun",
      "--notes-file": "notes",
      "--wait-seconds": "waitSeconds",
    }[key];
    options[field] = ["buildRun", "waitSeconds"].includes(field) ? Number(value) : value;
  }
  ensure(
    /^[\w.-]+\/[\w.-]+$/.test(options.repo) && /^v[\w.+-]+$/.test(options.tag ?? ""),
    "A repository and version tag are required",
  );
  ensure(
    Number.isInteger(options.waitSeconds) && options.waitSeconds >= 0 && options.waitSeconds <= 1800,
    "Wait must be between 0 and 1800 seconds",
  );
  if (operation !== "check")
    ensure(Number.isSafeInteger(options.buildRun) && options.buildRun > 0, "The official maker run is required");
  if (operation === "prepare")
    ensure(typeof options.notes === "string" && statSync(options.notes).isFile(), "A release notice file is required");
  return options;
}

export async function main(args) {
  const options = parseOptions(args);
  const operations = { check: waitForValidation, prepare, publish };
  return operations[options.operation](options);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main(process.argv.slice(2)).then(
    (result) => console.log(JSON.stringify(result)),
    (failure) => {
      console.error(`Publication blocked: ${failure.message}`);
      process.exitCode = 1;
    },
  );
}
