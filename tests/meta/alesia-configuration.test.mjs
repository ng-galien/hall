import { expect, it } from "vitest";
import {
  alesiaMailPresentation,
  enrichAlesiaConfiguration,
} from "../../scripts/seed/data/datasets/alesia/configuration.mjs";

// @verifies-requirement HALL-FR-CFG-020
// @verifies-requirement HALL-FR-CFG-030
it("enriches only empty Alésia presentation fields and is idempotent", async () => {
  let settings = {
    name: "Alésia",
    outboundEmailSignatureMarkdown: "My signature",
    outboundEmailFooterMarkdown: "",
    city: "Preserved",
  };
  const templates = [
    {
      id: "one",
      kind: "pdf",
      documentType: "minutes",
      headerHtml: "My header",
      footerHtml: "",
      stylesheet: "Custom CSS",
      bodyMarkdown: "Business facts",
    },
  ];
  const api = {
    get: async (path) => (path === "/settings" ? settings : templates),
    put: async (path, value) => {
      if (path === "/settings") settings = value;
      else templates[0] = value;
    },
  };
  expect(await enrichAlesiaConfiguration(api)).toEqual({
    settingsFields: ["outboundEmailFooterMarkdown"],
    templatesUpdated: 1,
  });
  expect(settings).toMatchObject({
    outboundEmailSignatureMarkdown: "My signature",
    outboundEmailFooterMarkdown: alesiaMailPresentation.outboundEmailFooterMarkdown,
    city: "Preserved",
  });
  expect(templates[0]).toMatchObject({
    headerHtml: "My header",
    stylesheet: "Custom CSS",
    bodyMarkdown: "Business facts",
  });
  expect(templates[0].footerHtml).toContain("Démonstration");
  expect(await enrichAlesiaConfiguration(api)).toEqual({ settingsFields: [], templatesUpdated: 0 });
  settings.name = "Another municipality";
  await expect(enrichAlesiaConfiguration(api)).rejects.toThrow("Alésia");
});
