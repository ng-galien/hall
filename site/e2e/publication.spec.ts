import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";

const builtPage = (path: string) => readFileSync(new URL(`../dist/${path}`, import.meta.url), "utf8");
const publication = JSON.parse(builtPage("publication.json"));
const checker = /<head><script>([\s\S]+?)<\/script>/.exec(builtPage("index.html"))?.[1];
if (!checker) throw new Error("Build the public site before checking its publication script");
const first = "aaaaaaaaaaaaaaaa";
const second = "bbbbbbbbbbbbbbbb";
let server: Server;
let origin: string;
let published: string;
let manifestMode: "valid" | "invalid" | "offline";
let keepOldHtml: boolean;
let documents: string[];
let checks: number;

test.beforeAll(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/hall/publication.json") {
      checks += 1;
      response.writeHead(manifestMode === "offline" ? 503 : 200, {
        "Content-Type": "application/json",
        "Cache-Control": "max-age=86400",
      });
      response.end(JSON.stringify(manifestMode === "invalid" ? { version: "invalid" } : { version: published }));
      return;
    }
    documents.push(url.href);
    const version = keepOldHtml ? first : published;
    const root = url.pathname === "/hall/" ? "./" : "../";
    response.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "max-age=86400" });
    response.end(
      `<!doctype html><html data-site-root="${root}" data-hall-build="${version}"><head><script>${checker}</script></head><body><h1>${version}</h1></body></html>`,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing publication test server");
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test.beforeEach(() => {
  published = first;
  manifestMode = "valid";
  keepOldHtml = false;
  documents = [];
  checks = 0;
});

test("ships the same publication version and independent checker in both pages", () => {
  expect(publication.version).toMatch(/^[a-f0-9]{16}$/);
  for (const path of ["index.html", "demonstration/index.html"]) {
    const html = builtPage(path);
    expect(html).toContain(`data-hall-build="${publication.version}"`);
    expect(html).toContain(`<head><script>${checker}</script>`);
  }
});

for (const path of ["/hall/", "/hall/demonstration/"]) {
  test(`replaces cached HTML after publication at ${path}`, async ({ page }) => {
    const original = `${origin}${path}?view=3d#actes`;
    await page.goto(original);
    await expect(page.locator("h1")).toHaveText(first);
    await expect.poll(() => checks).toBe(1);
    expect(page.url()).toBe(original);
    await page.goto("about:blank");
    published = second;
    await page.goto(original);
    await expect(page.locator("h1")).toHaveText(second);
    const current = new URL(page.url());
    expect(current.pathname).toBe(path);
    expect(current.searchParams.get("view")).toBe("3d");
    expect(current.hash).toBe("#actes");
    expect(current.searchParams.get("_hall")).toBe(second);
    expect(documents.filter((url) => new URL(url).search === "?view=3d")).toHaveLength(1);
    await page.reload();
    await expect(page.locator("h1")).toHaveText(second);
    expect(new URL(page.url()).searchParams.getAll("_hall")).toEqual([second]);
  });
}

for (const failure of ["invalid", "offline"] as const) {
  test(`keeps the loaded page usable when the version check is ${failure}`, async ({ page }) => {
    manifestMode = failure;
    const original = `${origin}/hall/demonstration/#ouverture`;
    await page.goto(original);
    await expect.poll(() => checks).toBe(1);
    await expect(page.locator("h1")).toHaveText(first);
    expect(page.url()).toBe(original);
  });
}

test("does not loop if the cache-bypassing document still has the old version", async ({ page }) => {
  published = second;
  keepOldHtml = true;
  await page.goto(`${origin}/hall/demonstration/#ouverture`);
  await expect(page).toHaveURL(`${origin}/hall/demonstration/?_hall=${second}#ouverture`);
  await expect.poll(() => checks).toBe(2);
  await expect(page.locator("h1")).toHaveText(first);
  await page.reload();
  await expect.poll(() => checks).toBe(3);
  expect(new URL(page.url()).searchParams.getAll("_hall")).toEqual([second]);
});
