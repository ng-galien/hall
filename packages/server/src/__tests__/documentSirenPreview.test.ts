import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("projects PostgreSQL preview media types and omits unsupported Office previews", async () => {
  const db = new PGlite();
  try {
    const sql = await readFile(new URL("../../../postgres/sql/document/050-siren.sql", import.meta.url), "utf8");
    await db.exec(`CREATE SCHEMA hall; ${sql.slice(0, sql.indexOf("CREATE FUNCTION hall.resource_siren_actions"))}`);
    for (const [mediaType, expected] of [
      ["application/pdf", "application/pdf"],
      ["image/png", "image/png"],
      ["image/jpeg", "image/jpeg"],
      ["text/plain; charset=utf-8", "text/plain; charset=utf-8"],
      ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/markdown; charset=utf-8"],
      ["application/vnd.oasis.opendocument.text", null],
      ["application/vnd.openxmlformats-officedocument.presentationml.presentation", null],
      ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", null],
      ["text/csv; charset=utf-8", null],
    ] as const) {
      const result = await db.query<{ links: { rel: string[]; type: string }[] }>(
        "SELECT hall.resource_siren_links($1::jsonb) AS links",
        [JSON.stringify({ id: "document", kind: "document", binary: { mediaType } })],
      );
      const links = result.rows[0].links;
      expect(links.find((link) => link.rel.includes("content"))?.type).toBe(mediaType);
      expect(links.find((link) => link.rel.includes("preview"))?.type ?? null).toBe(expected);
    }
  } finally {
    await db.close();
  }
});
