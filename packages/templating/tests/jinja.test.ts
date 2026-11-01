import { describe, expect, it } from "vitest";
import { renderJinja, validateJinja } from "../src/jinja.js";
import { isJinjaTemplate } from "../src/templateSyntax.js";

describe("Jinja document engine", () => {
  it("evaluates real loops, conditions, macros, dotted values and filters", () => {
    const markdown = renderJinja(
      "{% macro row(p, index) %}## {{ index }} {{ p.title }}\n\n{% endmacro %}{% for point in points %}{% if point.visible %}{{ row(point, loop.index) }}{% endif %}{% endfor %}",
      {
        points: [
          { title: "Visible", visible: true },
          { title: "Hidden", visible: false },
        ],
      },
    );
    expect(markdown).toContain("Visible");
    expect(markdown).not.toContain("Hidden");
  });
  it("keeps authored Markdown and escapes scalar Markdown punctuation without evaluating data as Jinja", () => {
    const result = renderJinja("# {{ title|text }}\n\n{{ content }}", {
      title: "<Titre> *spécial*",
      content: "**Texte** {{ untouched }}",
    });
    expect(result).toContain("\\<Titre\\> \\*spécial\\*");
    expect(result).toContain("**Texte** {{ untouched }}");
    expect(result).not.toContain("<p>");
  });
  it("preserves list line breaks around optional inline conditions", () => {
    const output = renderJinja(
      "{% for person in people %}\n- {{ person.name }} : Présent{% if person.proxy %}, pouvoir{% endif %}\n{% endfor %}",
      {
        people: [
          { name: "Première personne", proxy: false },
          { name: "Deuxième personne", proxy: false },
        ],
      },
    );
    expect(output).toContain("- Première personne : Présent\n");
    expect(output).toContain("- Deuxième personne : Présent\n");
    expect(output).not.toContain("Présent- Deuxième");
  });

  it("preserves Hall references alongside real Jinja comments and expressions", () => {
    const source = '{# real comment #}\n:image[Logo]{#abc width="30%"}\n{{ title }}';
    expect(() => validateJinja(source)).not.toThrow();
    expect(renderJinja(source, { title: "Titre" })).toBe('\n:image[Logo]{id="abc" width="30%"}\nTitre');
    expect(renderJinja('{{ ":resource[Doc]{#abc}" }}', {})).toBe(":resource[Doc]{#abc}");
    expect(renderJinja("{% raw %}:resource[Doc]{#abc}{% endraw %}", {})).toBe(':resource[Doc]{id="abc"}');
  });
  it("escapes time punctuation for the Markdown directive grammar", () => {
    expect(renderJinja("{{ instant|datetime }}", { instant: "2026-11-10T10:00:00Z" })).toBe(
      "10 novembre 2026 à 11\\:00",
    );
  });

  it("compiles independently of data and reports undefined values at render time", () => {
    expect(() => validateJinja("{{ meeting.number }}")).not.toThrow();
    expect(() => validateJinja("{% for broken %}")).toThrow();
    expect(() => renderJinja("{{ absent.value }}", {})).toThrow();
    expect(() => renderJinja('{% include "/etc/passwd" %}', {})).toThrow();
  });
  it("limits template work and distinguishes legacy Markdown", () => {
    expect(() => renderJinja("{% for i in range(10000000) %}{{ i }}{% endfor %}", {})).toThrow();
    expect(isJinjaTemplate("{# hall:jinja #}# Bonjour")).toBe(true);
    expect(isJinjaTemplate("::minutes{section=facts}")).toBe(false);
    expect(isJinjaTemplate(":image[Logo]{#resource-id}")).toBe(false);
  });
});
