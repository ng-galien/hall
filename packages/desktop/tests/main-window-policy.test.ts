import { expect, test } from "vitest";
import { mainWindowNavigation, permissionGranted } from "../src/mainWindowPolicy.js";

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
