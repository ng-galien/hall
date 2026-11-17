import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  compareSiteDownloads,
  downloadPatterns,
  parseOptions,
} from "../../scripts/distribution/check-site-downloads.mjs";

const repository = "ng-galien/hall";
const names = [
  "windows-x64-Hall-1.4.2-Setup.exe",
  "macos-arm64-Hall-1.4.2-arm64.dmg",
  "macos-x64-Hall-1.4.2-x64.dmg",
  "linux-x64-hall-desktop_1.4.2_amd64.deb",
  "linux-x64-hall-desktop-1.4.2-1.x86_64.rpm",
  "ng-galien-hall-1.4.2.tgz",
  "SHA256SUMS.txt",
];
const url = (tag, name) => `https://github.com/${repository}/releases/download/${tag}/${name}`;
const latest = {
  tag_name: "v1.4.2",
  assets: [...names, "HALL-BUILD-PROVENANCE.json"].map((name) => ({ name, browser_download_url: url("v1.4.2", name) })),
};
const bundle = (version, tag, files) =>
  `var o={version:\`${version}\`,page:\`https://github.com/${repository}/releases/tag/${tag}\`,files:[${files
    .map((name) => `{key:\`k\`,name:\`${name}\`,size:1,url:\`${url(tag, name)}\`}`)
    .join(",")}]};`;
const current = bundle("1.4.2", "v1.4.2", names);

describe("site download comparison", () => {
  it("accepts a site that serves the seven files of the latest release", () => {
    const result = compareSiteDownloads({ served: current, latest, repository });
    expect(result.problems).toEqual([]);
    expect(result.version).toBe("1.4.2");
    expect(result.checked.map((entry) => entry.url)).toEqual(names.map((name) => url("v1.4.2", name)));
  });

  it("names a site still built with an older release", () => {
    const older = bundle(
      "1.4.1",
      "v1.4.1",
      names.map((name) => name.replaceAll("1.4.2", "1.4.1")),
    );
    const { problems } = compareSiteDownloads({ served: older, latest, repository });
    expect(problems).toContain("The site announces version 1.4.1 (release v1.4.1); the latest release is v1.4.2");
    expect(problems).toContain(
      `The site still serves an address of release v1.4.1: ${url("v1.4.1", "windows-x64-Hall-1.4.1-Setup.exe")}`,
    );
    expect(problems).toContain("The site has no Windows address of release v1.4.2");
  });

  it("names an older address left beside the current ones", () => {
    const served = `${current} const old=\`${url("v1.3.0", "SHA256SUMS.txt")}\`;`;
    const { problems } = compareSiteDownloads({ served, latest, repository });
    expect(problems).toEqual([
      `The site still serves an address of release v1.3.0: ${url("v1.3.0", "SHA256SUMS.txt")}`,
    ]);
  });

  it("names a missing download, a file of another name and a missing version", () => {
    const files = names.filter((name) => !name.endsWith(".rpm")).map((name) => name.replace("arm64.dmg", "arm.dmg"));
    const served = bundle("1.4.2", "v1.4.2", files).replace(/version:`1\.4\.2`,/, "");
    const { problems } = compareSiteDownloads({ served, latest, repository });
    expect(problems).toEqual([
      "The site announces no release version",
      `The Mac, Apple chip address ${url("v1.4.2", "macos-arm64-Hall-1.4.2-arm.dmg")} is not the release file ${url("v1.4.2", names[1])}`,
      "The site has no Linux .rpm address of release v1.4.2",
    ]);
  });

  it("names a latest release that lacks a file the site offers", () => {
    const incomplete = { ...latest, assets: latest.assets.filter((asset) => !asset.name.endsWith(".tgz")) };
    const { problems } = compareSiteDownloads({ served: current, latest: incomplete, repository });
    expect(problems).toContain("The latest release v1.4.2 has 0 files for Server package, expected 1");
  });

  it("recognises the files with the same patterns as the site", () => {
    const source = readFileSync("site/src/downloads.ts", "utf8");
    const site = [...source.matchAll(/\["([\w-]+)", \/(.+)\/\]/g)].map(([, key, pattern]) => [key, pattern]);
    expect(downloadPatterns.map(([key, pattern]) => [key, pattern.source])).toEqual(site);
  });

  it("reads the site, repository and retry options", () => {
    expect(
      parseOptions(["--site", "https://example.test/hall", "--repository", "a/b", "--attempts", "3", "--delay", "5"]),
    ).toEqual({ site: "https://example.test/hall/", repository: "a/b", attempts: 3, delay: 5 });
    expect(() => parseOptions(["--attempts", "0"])).toThrow("--attempts must be at least 1");
  });
});
