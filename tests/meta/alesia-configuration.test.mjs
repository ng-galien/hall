import { expect, it } from "vitest";
import {
  alesiaMailPresentation,
  enrichAlesiaConfiguration,
} from "../../scripts/seed/data/datasets/alesia/configuration.mjs";

// @verifies-requirement HALL-FR-CFG-020
// @verifies-requirement HALL-FR-CFG-030
// @verifies-requirement HALL-FR-MIN-290 (the Alésia minutes keep the default model, without a page header)
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
      documentType: "meeting-notice",
      headerHtml: "My header",
      footerHtml: "",
      stylesheet: "Custom CSS",
      bodyMarkdown: "Business facts",
    },
    {
      id: "two",
      kind: "pdf",
      documentType: "minutes",
      headerHtml: "",
      footerHtml: "",
      stylesheet: "",
      bodyMarkdown: "PV",
    },
  ];
  const api = {
    get: async (path) => (path === "/settings" ? settings : templates),
    put: async (path, value) => {
      if (path === "/settings") settings = value;
      else templates[templates.findIndex((template) => template.id === value.id)] = value;
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
  expect(templates[1]).toMatchObject({ headerHtml: "", footerHtml: "", stylesheet: "" });
  expect(await enrichAlesiaConfiguration(api)).toEqual({ settingsFields: [], templatesUpdated: 0 });
  settings.name = "Another municipality";
  await expect(enrichAlesiaConfiguration(api)).rejects.toThrow("Alésia");
});
