import { resolve } from "node:path";

/**
 * Checks the download links served by the public site against the latest published GitHub release: the version the
 * site announces, one address per file of that release, each address reachable, no address of another release.
 *
 * node scripts/distribution/check-site-downloads.mjs [--site <url>] [--repository <owner/name>]
 *   [--attempts <n>] [--delay <seconds>]
 */

export const defaultSite = "https://ng-galien.github.io/hall/";
export const defaultRepository = "ng-galien/hall";

/** File recognition of site/src/downloads.ts, by platform prefix and extension. */
export const downloadPatterns = [
  ["windows", /^windows-x64-.*-Setup\.exe$/],
  ["macos-arm64", /^macos-arm64-.*\.dmg$/],
  ["macos-x64", /^macos-x64-.*\.dmg$/],
  ["linux-deb", /^linux-x64-.*\.deb$/],
  ["linux-rpm", /^linux-x64-.*\.rpm$/],
  ["server", /^ng-galien-hall-.*\.tgz$/],
];
export const checksumsName = "SHA256SUMS.txt";

export const downloadLabels = {
  windows: "Windows",
  "macos-arm64": "Mac, Apple chip",
  "macos-x64": "Mac, Intel",
  "linux-deb": "Linux .deb",
  "linux-rpm": "Linux .rpm",
  server: "Server package",
  checksums: "SHA-256 checksums",
};

const quote = "[\"'`]";
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** Every release download address found in the served text, once each. */
export function servedDownloads(text, repository) {
  const pattern = new RegExp(
    `https://github\\.com/${escaped(repository)}/releases/download/([^/"'\`\\s]+)/([^"'\`\\s?#)]+)`,
    "g",
  );
  const found = new Map();
  for (const [url, tag, name] of text.matchAll(pattern)) found.set(url, { url, tag, name: decodeURIComponent(name) });
  return [...found.values()];
}

/** Every version the served text announces, with the release page it is paired with. */
export function servedVersions(text, repository) {
  const pattern = new RegExp(
    `["']?version["']?\\s*:\\s*${quote}([^"'\`]+)${quote}\\s*,\\s*["']?page["']?\\s*:\\s*${quote}https://github\\.com/${escaped(repository)}/releases/tag/([^"'\`]+)${quote}`,
    "g",
  );
  const found = new Map();
  for (const [, version, tag] of text.matchAll(pattern)) found.set(`${version} ${tag}`, { version, tag });
  return [...found.values()];
}

/** Addresses expected from the latest release: one per download of the site, and the checksums file. */
export function expectedDownloads(latest) {
  const problems = [];
  const files = [];
  for (const [key, pattern] of downloadPatterns) {
    const matching = latest.assets.filter((asset) => pattern.test(asset.name));
    if (matching.length === 1)
      files.push({ key, name: matching[0].name, url: matching[0].browser_download_url, pattern });
    else
      problems.push(
        `The latest release ${latest.tag_name} has ${matching.length} files for ${downloadLabels[key]}, expected 1`,
      );
  }
  const checksums = latest.assets.find((asset) => asset.name === checksumsName);
  if (checksums)
    files.push({
      key: "checksums",
      name: checksums.name,
      url: checksums.browser_download_url,
      pattern: new RegExp(`^${escaped(checksumsName)}$`),
    });
  else problems.push(`The latest release ${latest.tag_name} has no ${checksumsName}`);
  return { tag: latest.tag_name, version: latest.tag_name.replace(/^v/, ""), files, problems };
}

/** Compares what the site serves with the latest release; returns the checked addresses and every problem found. */
export function compareSiteDownloads({ served, latest, repository }) {
  const expected = expectedDownloads(latest);
  const problems = [...expected.problems];
  const versions = servedVersions(served, repository);
  if (versions.length === 0) problems.push("The site announces no release version");
  for (const announced of versions)
    if (announced.version !== expected.version || announced.tag !== expected.tag)
      problems.push(
        `The site announces version ${announced.version} (release ${announced.tag}); the latest release is ${expected.tag}`,
      );
  const downloads = servedDownloads(served, repository);
  for (const download of downloads)
    if (download.tag !== expected.tag)
      problems.push(`The site still serves an address of release ${download.tag}: ${download.url}`);
  const current = downloads.filter((download) => download.tag === expected.tag);
  const checked = [];
  for (const file of expected.files) {
    const label = downloadLabels[file.key];
    const candidates = current.filter((download) => file.pattern.test(download.name));
    if (candidates.length === 0) problems.push(`The site has no ${label} address of release ${expected.tag}`);
    else if (candidates.length > 1)
      problems.push(`The site has several ${label} addresses: ${candidates.map((c) => c.url).join(", ")}`);
    else if (candidates[0].name !== file.name || candidates[0].url !== file.url)
      problems.push(`The ${label} address ${candidates[0].url} is not the release file ${file.url}`);
    else checked.push({ key: file.key, label, url: file.url });
  }
  return { version: expected.version, checked, problems };
}

async function text(url) {
  const response = await fetch(url, { headers: { "Cache-Control": "no-cache" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.text();
}

/** The page and every script it loads, directly or through relative imports, on the site's origin. */
export async function servedSite(site) {
  const page = new URL(site);
  page.searchParams.set("check", String(Date.now()));
  const html = await text(page);
  const pending = [];
  for (const [, source] of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) pending.push(new URL(source, page));
  for (const [, source] of html.matchAll(/<link\b[^>]*\bhref="([^"]+\.js)"/g)) pending.push(new URL(source, page));
  const seen = new Set();
  const parts = [html];
  while (pending.length > 0) {
    const script = pending.shift();
    script.search = "";
    if (script.origin !== page.origin || seen.has(script.href)) continue;
    seen.add(script.href);
    const code = await text(script);
    parts.push(code);
    for (const [, path] of code.matchAll(/["'`](\.{1,2}\/[^"'`\s]+?\.js)["'`]/g)) pending.push(new URL(path, script));
  }
  return { served: parts.join("\n"), scripts: [...seen] };
}

export async function latestRelease(repository) {
  const token = process.env.GITHUB_TOKEN;
  const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "hall-site-download-check",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`GitHub answered ${response.status} for the latest release of ${repository}`);
  return response.json();
}

async function unreachable(checked) {
  const problems = [];
  for (const { label, url } of checked) {
    try {
      const response = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(30_000) });
      if (!response.ok) problems.push(`The ${label} address answers ${response.status}: ${url}`);
    } catch (error) {
      problems.push(`The ${label} address does not answer (${error.message}): ${url}`);
    }
  }
  return problems;
}

export function parseOptions(args) {
  const options = { site: defaultSite, repository: defaultRepository, attempts: 1, delay: 30 };
  for (let index = 0; index < args.length; index += 2) {
    const [name, value] = [args[index], args[index + 1]];
    if (value === undefined) throw new Error(`${name} needs a value`);
    if (name === "--site") options.site = value.endsWith("/") ? value : `${value}/`;
    else if (name === "--repository") options.repository = value;
    else if (name === "--attempts") options.attempts = Number(value);
    else if (name === "--delay") options.delay = Number(value);
    else throw new Error(`Unknown option ${name}`);
  }
  if (!Number.isInteger(options.attempts) || options.attempts < 1) throw new Error("--attempts must be at least 1");
  if (!Number.isFinite(options.delay) || options.delay < 0) throw new Error("--delay must be a number of seconds");
  return options;
}

export async function checkOnce({ site, repository }) {
  const [{ served }, latest] = await Promise.all([servedSite(site), latestRelease(repository)]);
  const result = compareSiteDownloads({ served, latest, repository });
  if (result.problems.length === 0) result.problems.push(...(await unreachable(result.checked)));
  return result;
}

export async function main(args) {
  const options = parseOptions(args);
  let result;
  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    try {
      result = await checkOnce(options);
    } catch (error) {
      result = { checked: [], problems: [error.message] };
    }
    if (result.problems.length === 0) break;
    if (attempt < options.attempts) {
      console.error(`Attempt ${attempt}/${options.attempts}: ${result.problems.join("; ")}`);
      await new Promise((done) => setTimeout(done, options.delay * 1000));
    }
  }
  if (result.problems.length > 0) throw new Error(result.problems.join("\n"));
  return [
    `${options.site} offers Hall ${result.version}, the latest release of ${options.repository}.`,
    ...result.checked.map(({ label, url }) => `  ${label}: ${url}`),
  ].join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main(process.argv.slice(2)).then(
    (report) => console.log(report),
    (failure) => {
      console.error(`Site downloads check failed:\n${failure.message}`);
      process.exitCode = 1;
    },
  );
}
