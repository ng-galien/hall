import { existsSync } from "node:fs";
import { join } from "node:path";
import { type Request, Router } from "express";
import type { ServerConfig } from "../../core/config.js";
import type { Cradle } from "../../core/container.js";
import { printDocumentation } from "../../services/documentRenderer.js";
import { sendProblem } from "../problemDetails.js";

// @implements-requirement HALL-FR-DOC-560

const DOCUMENTATION_PRINT_PATH = "/app/docs-print";

const footerHtml =
  '<div style="width:100%;text-align:center;font-family:sans-serif;font-size:8pt;color:#555">' +
  'Documentation de Hall · page <span class="pageNumber"></span> / <span class="totalPages"></span></div>';

export function documentationPrintUrl(config: ServerConfig, request: Request): string | null {
  if (config.clientDirectory && existsSync(join(config.clientDirectory, "index.html"))) {
    const address = request.socket.localAddress ?? "127.0.0.1";
    const hostname = address.includes(":") ? `[${address}]` : address;
    return `http://${hostname}:${request.socket.localPort}${DOCUMENTATION_PRINT_PATH}`;
  }
  return config.documentationPrintOrigin ? `${config.documentationPrintOrigin}${DOCUMENTATION_PRINT_PATH}` : null;
}

export function createDocumentationRouter({
  config,
  contentTemplateService,
}: Pick<Cradle, "config" | "contentTemplateService">): Router {
  const router = Router();
  router.get("/pdf", async (request, response) => {
    const url = documentationPrintUrl(config, request);
    if (!url) {
      sendProblem(request, response, 503, "documentation_print_unavailable");
      return;
    }
    const pdf = await contentTemplateService.withGenerationSlot(() =>
      printDocumentation({ url, footerHtml }).catch(() => null),
    );
    if (!pdf) {
      sendProblem(request, response, 503, "documentation_print_unavailable");
      return;
    }
    response.set("Cache-Control", "private, no-store");
    response.set("Content-Disposition", 'attachment; filename="documentation-hall.pdf"');
    response.type("application/pdf").send(pdf);
  });
  return router;
}
