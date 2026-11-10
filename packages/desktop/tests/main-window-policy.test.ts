import { expect, test } from "vitest";
import { demonstrationSessionApplies, mainWindowNavigation, permissionGranted } from "../src/mainWindowPolicy.js";

const hall = "http://127.0.0.1:41234/app/council-meetings";

test("the main window stays on the Hall origin and sends other safe addresses to the system browser", () => {
  expect(mainWindowNavigation(hall, "http://127.0.0.1:41234/app/workspace")).toBe("allow");
  expect(mainWindowNavigation(hall, "http://127.0.0.1:41234/api/resources/school/content")).toBe("allow");
  expect(mainWindowNavigation(hall, "https://www.legifrance.gouv.fr/codes/id/LEGITEXT000006070633")).toBe("external");
  expect(mainWindowNavigation(hall, "mailto:mairie@example.test")).toBe("external");
  expect(mainWindowNavigation(hall, "http://127.0.0.1:9999/app/")).toBe("external");
  expect(mainWindowNavigation(hall, "https://user:secret@example.test/")).toBe("block");
  expect(mainWindowNavigation(hall, "file:///etc/passwd")).toBe("block");
  expect(mainWindowNavigation(hall, "javascript:alert(1)")).toBe("block");
});

test("a page that is not served by Hall does not open a navigation inside the window", () => {
  expect(mainWindowNavigation("data:text/html,preparation", "data:text/html,other")).toBe("block");
  expect(mainWindowNavigation("data:text/html,preparation", "https://example.test/")).toBe("external");
  expect(mainWindowNavigation("", "http://127.0.0.1:41234/app/")).toBe("external");
});

test("device and location permissions are refused while clipboard writing and safe external links stay available", () => {
  for (const permission of ["media", "geolocation", "notifications", "clipboard-read", "display-capture", "midi"]) {
    expect(permissionGranted(permission), permission).toBe(false);
  }
  expect(permissionGranted("clipboard-sanitized-write")).toBe(true);
  expect(permissionGranted("fullscreen")).toBe(true);
  expect(permissionGranted("openExternal", "mailto:mairie@example.test")).toBe(true);
  expect(permissionGranted("openExternal", "file:///etc/passwd")).toBe(false);
  expect(permissionGranted("openExternal")).toBe(false);
});

const origin = "http://127.0.0.1:41234";
const hallPage = `${origin}/app/templates/minutes`;
const preview = `${origin}/api/templates/preview-pdf/e8fd593d-06fc-4b29-8d10-6eebfe251c64`;

test("the main frame of Hall receives the demonstration session for its reads and writes", () => {
  for (const [method, resourceType] of [
    ["GET", "xhr"],
    ["POST", "xhr"],
    ["DELETE", "xhr"],
  ] as const)
    expect(
      demonstrationSessionApplies(origin, {
        url: `${origin}/api/resources`,
        method,
        resourceType,
        referrer: hallPage,
        frame: "main",
      }),
      method,
    ).toBe(true);
  expect(
    demonstrationSessionApplies(origin, {
      url: "http://127.0.0.1:9999/api/resources",
      method: "GET",
      resourceType: "xhr",
      referrer: hallPage,
      frame: "main",
    }),
  ).toBe(false);
});

test("a Hall document loaded by Hall into a frame of the window receives the session", () => {
  for (const method of ["GET", "HEAD"])
    expect(
      demonstrationSessionApplies(origin, {
        url: preview,
        method,
        resourceType: "subFrame",
        referrer: hallPage,
        frame: "childOfMain",
      }),
      method,
    ).toBe(true);
});

test("a third-party frame that reads the Hall API does not receive the session", () => {
  const thirdParty = "https://example.test/page";
  for (const request of [
    { url: `${origin}/api/resources`, method: "GET", resourceType: "xhr", referrer: thirdParty, frame: "childOfMain" },
    { url: `${origin}/api/resources`, method: "GET", resourceType: "fetch", referrer: hallPage, frame: "childOfMain" },
    { url: preview, method: "GET", resourceType: "subFrame", referrer: thirdParty, frame: "childOfMain" },
    { url: preview, method: "GET", resourceType: "subFrame", referrer: hallPage, frame: "other" },
    { url: `${origin}/api/resources`, method: "GET", resourceType: "image", referrer: thirdParty, frame: "other" },
  ] as const)
    expect(demonstrationSessionApplies(origin, request), JSON.stringify(request)).toBe(false);
});

test("a write issued from a frame other than the main frame never receives the session", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"])
    for (const [resourceType, referrer] of [
      ["xhr", "https://example.test/page"],
      ["fetch", hallPage],
      ["subFrame", hallPage],
    ] as const)
      expect(
        demonstrationSessionApplies(origin, {
          url: `${origin}/api/resources/school/content`,
          method,
          resourceType,
          referrer,
          frame: "childOfMain",
        }),
        `${method} ${resourceType}`,
      ).toBe(false);
});
