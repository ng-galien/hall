import { describe, expect, it } from "vitest";
import { createServiceTestServer } from "./testServer.js";

describe("template images", () => {
  it("renders a stored image reference without persisting binary content in Markdown", async () => {
    const { container } = await createServiceTestServer();
    const content = Buffer.from("89504e470d0a1a0a", "hex");
    const resource = await container.cradle.resourcesClient.createDocument({
      name: "Plan du quartier",
      path: "urbanisme/centre",
      mediaType: "image/png",
      content,
    });

    const preview = await container.cradle.templateRenderingService.preview({
      bodyMarkdown: `::image[Plan du quartier]{#${resource.data.id} align="center" width="50"}`,
      subject: null,
      stylesheet: "",
      headerHtml: "",
      footerHtml: "",
    });

    expect(preview.diagnostics).toEqual([]);
    expect(preview.html).toContain(`src="data:image/png;base64,${content.toString("base64")}"`);
    expect(preview.printHtml).toContain("hall-template-image-center");
    expect(preview.printHtml).toContain("width: 50%");
    expect(preview.text).toBe("Plan du quartier");
    expect(preview.html).not.toContain(resource.data.id);
  });

  it("diagnoses missing and non-image resources instead of emitting an unsafe source", async () => {
    const { container } = await createServiceTestServer();
    const pdf = await container.cradle.resourcesClient.createDocument({
      name: "Annexe PDF",
      path: "",
      mediaType: "application/pdf",
      content: Buffer.from("not-an-image"),
    });

    const preview = await container.cradle.templateRenderingService.preview({
      bodyMarkdown: [
        `::image[Document invalide]{#${pdf.data.id} align="left" width="100"}`,
        "",
        '::image[Image absente]{#missing-image align="center" width="75"}',
      ].join("\n"),
      subject: null,
      stylesheet: "",
      headerHtml: "",
      footerHtml: "",
    });

    expect(preview.diagnostics).toEqual([
      expect.objectContaining({ code: "unresolved_reference" }),
      expect.objectContaining({ code: "unresolved_reference" }),
    ]);
    expect(preview.html).not.toContain("data:");
  });
});
