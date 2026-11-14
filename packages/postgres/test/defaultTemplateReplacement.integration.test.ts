import { readFile } from "node:fs/promises";
import { defaultDocumentTemplates } from "@hall/domain";
import { expect, it } from "vitest";
import { createTestPool, postgresDescribe, useFreshHallDatabase } from "./support/database.js";

const replacement = readFile(new URL("../sql/migrations/replace-default-templates-1.0.4.sql", import.meta.url), "utf8");
const generator = new URL("../../../scripts/distribution/document-template-sql.mjs", import.meta.url).href;

type Template = {
  kind: string;
  documentType: string;
  name: string;
  bodyMarkdown: string;
  stylesheet: string;
  headerHtml: string;
  footerHtml: string;
};

postgresDescribe("explicit replacement of the default document templates", () => {
  const pool = createTestPool(1);
  useFreshHallDatabase(pool);

  const install = (template: Template, change: Partial<Template> = {}) => {
    const row = { ...template, ...change };
    return pool.query(
      `INSERT INTO hall.document_template (kind, document_type, name, body_markdown, subject, stylesheet, header_html, footer_html)
       VALUES ($1, $2, $3, $4, NULL, $5, $6, $7)`,
      [row.kind, row.documentType, row.name, row.bodyMarkdown, row.stylesheet, row.headerHtml, row.footerHtml],
    );
  };
  const minutes = () =>
    pool
      .query<{ body: string; stylesheet: string; header: string; footer: string }>(
        `SELECT body_markdown AS body, stylesheet, header_html AS header, footer_html AS footer
         FROM hall.document_template WHERE kind = 'pdf' AND document_type = 'minutes'`,
      )
      .then((result) => result.rows[0]);
  const outcomes = async () => {
    const results = (await pool.query(await replacement)) as unknown as Array<{ rows: Array<Record<string, string>> }>;
    return Object.fromEntries(
      results
        .flatMap((result) => result.rows ?? [])
        .filter((row) => "outcome" in row)
        .map((row) => [row.document_type, row.outcome]),
    );
  };

  // @verifies-requirement HALL-FR-MIN-290
  it("gives the current minutes default to a template left at the 1.3.0 default and keeps a customized one", async () => {
    const { previousDefaults } = (await import(generator)) as {
      previousDefaults(release: string): Promise<Template[]>;
    };
    const former = (await previousDefaults("v1.3.0")).find((entry) => entry.documentType === "minutes")!;
    const current = defaultDocumentTemplates.find((entry) => entry.documentType === "minutes")!;
    await pool.query("DELETE FROM hall.document_template");
    await install(former);
    expect(await outcomes()).toEqual({ minutes: "replaced" });
    expect(await minutes()).toEqual({
      body: current.bodyMarkdown,
      stylesheet: current.stylesheet,
      header: "",
      footer: current.footerHtml,
    });
    expect(await outcomes()).toEqual({ minutes: "current" });

    await pool.query("DELETE FROM hall.document_template");
    await install(former, { headerHtml: "Mairie de la commune" });
    expect(await outcomes()).toEqual({ minutes: "replaced" });
    expect((await minutes())?.header).toBe("Mairie de la commune");
    expect((await minutes())?.footer).toBe(current.footerHtml);

    await pool.query("DELETE FROM hall.document_template");
    const customized = { ...former, bodyMarkdown: `${former.bodyMarkdown}\nTexte de la commune` };
    await install(customized);
    expect(await outcomes()).toEqual({ minutes: "customized" });
    expect(await minutes()).toEqual({
      body: customized.bodyMarkdown,
      stylesheet: former.stylesheet,
      header: former.headerHtml,
      footer: former.footerHtml,
    });
  }, 120_000);
});
