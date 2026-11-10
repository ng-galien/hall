import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/api/errorHandler.js";
import { createDocumentationRouter } from "../src/api/routes/documentationRoutes.js";
import type { ServerConfig } from "../src/core/config.js";
import { createContentTemplateService } from "../src/services/contentTemplateService.js";

const printing = vi.hoisted(() => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { gate, release: () => release() };
});

vi.mock("../src/services/documentRenderer.js", () => ({
  printDocumentation: vi.fn(async () => {
    await printing.gate;
    return Buffer.from("%PDF-1.7");
  }),
}));

describe("documentation PDF printing", () => {
  it("shares the bounded template generation queue and is refused when the queue is full", async () => {
    const { printDocumentation } = await import("../src/services/documentRenderer.js");
    const contentTemplateService = createContentTemplateService(
      {} as unknown as Parameters<typeof createContentTemplateService>[0],
    );
    const slot = vi.spyOn(contentTemplateService, "withGenerationSlot");
    const app = express();
    app.use(
      "/api/documentation",
      createDocumentationRouter({
        config: { documentationPrintOrigin: "http://127.0.0.1:5174" } as ServerConfig,
        contentTemplateService,
      }),
    );
    app.use(errorHandler);
    const server = app.listen(0, "127.0.0.1");
    try {
      const accepted = Array.from({ length: 6 }, () =>
        request(server)
          .get("/api/documentation/pdf")
          .then((r) => r),
      );
      await vi.waitFor(() => expect(slot).toHaveBeenCalledTimes(6));
      expect(printDocumentation).toHaveBeenCalledTimes(2);
      const refused = await request(server).get("/api/documentation/pdf");
      expect(refused.status).toBe(429);
      expect(refused.body).toMatchObject({ code: "template_generation_busy" });
      printing.release();
      const responses = await Promise.all(accepted);
      expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200, 200, 200]);
      expect(printDocumentation).toHaveBeenCalledTimes(6);
    } finally {
      server.close();
    }
  });
});
