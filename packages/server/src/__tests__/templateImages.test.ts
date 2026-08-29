import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createTestServer } from "./testServer.js";

describe("template images", () => {
  it("renders a stored image reference without persisting binary content in Markdown", async () => {
    const { container } = await createTestServer();
    const content = Buffer.from("89504e470d0a1a0a", "hex");
    const resource = await container.cradle.resourceRepository.createDocument({
      title: "Plan du quartier",
      folderPath: "urbanisme/centre",
      tags: ["plan"],
      fileName: "plan.png",
      format: "png",
      mediaType: "image/png",
      contentSha256: createHash("sha256").update(content).digest("hex"),
      category: "supporting",
      content,
    });

    const preview = await container.cradle.templateRenderingService.preview({
      bodyMarkdown: `::image[Plan du quartier]{#${resource.id} align="center" width="50"}`,
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
    expect(preview.html).not.toContain(resource.id);
  });

  it("diagnoses missing and non-image resources instead of emitting an unsafe source", async () => {
    const { container } = await createTestServer();
    const pdf = await container.cradle.resourceRepository.createDocument({
      title: "Annexe PDF",
      folderPath: "",
      tags: [],
      fileName: "annexe.pdf",
      format: "pdf",
      mediaType: "application/pdf",
      contentSha256: "0".repeat(64),
      category: "supporting",
      content: Buffer.from("not-an-image"),
    });

    const preview = await container.cradle.templateRenderingService.preview({
      bodyMarkdown: [
        `::image[Document invalide]{#${pdf.id} align="left" width="100"}`,
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
