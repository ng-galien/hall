import { describe, expect, it } from "vitest";
import { isExportHref } from "../src/api/readAuthorization.js";

describe("export detection follows Express path matching", () => {
  it("treats case and trailing-slash variants of an export path as exports", () => {
    for (const href of [
      "/api/resources/school/content",
      "/api/resources/school/CONTENT",
      "/api/resources/school/content/",
      "/api/resources/school/Content.PDF/",
      "/API/council-meetings/m1/DELIBERATION-LIST.pdf",
      "/api/council-businesses/b1/Bundle//",
      "/api/council-businesses/b1/DOSSIER?download=1",
    ]) {
      expect(isExportHref(href), href).toBe(true);
    }
  });

  it("keeps previews and embedded assets as readings", () => {
    for (const href of [
      "/api/resources/school/preview",
      "/api/resources/editor-assets/a1/content",
      "/API/Resources/Editor-Assets/a1/CONTENT/",
      "/api/resources/binary-references/r1/content",
    ]) {
      expect(isExportHref(href), href).toBe(false);
    }
  });
});
