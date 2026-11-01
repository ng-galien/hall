import { collectResourceReferences, parse } from "@hall/templating";
import { renderJinja } from "@hall/templating/jinja";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

const parameters = { seed: 20261101, numRuns: 200 };
const character = fc.constantFrom(...Array.from("abc XYZéèçœ日本語🙂0129 *_[#]{}<>|:!()+.-\\\"'&/"));
const scalar = fc.array(character, { maxLength: 80 }).map((characters) => characters.join(""));
const dataText = fc
  .array(fc.oneof(character, fc.constantFrom("\n", "{{ absent.value }}", "{% include 'secret' %}", "{# comment #}")), {
    maxLength: 40,
  })
  .map((parts) => parts.join(""));
function text(node: unknown): string {
  const value = node as { type: string; value?: string; children?: unknown[] };
  return value.type === "text" ? (value.value ?? "") : (value.children ?? []).map(text).join("");
}

// @verifies-requirement HALL-FR-DOC-580
describe("generated Jinja to Markdown semantic invariants", () => {
  it("preserves authored multiline Unicode and Jinja-looking data exactly without re-evaluation", () => {
    fc.assert(
      fc.property(dataText, (content) => {
        const context = { content };
        expect(renderJinja("{{ content | markdown }}", context)).toBe(content);
        expect(renderJinja("{{ content }}", context)).toBe(content);
        expect(context).toEqual({ content });
      }),
      parameters,
    );
  });
  it("round-trips scalar punctuation as text through the actual Markdown parser", () => {
    fc.assert(
      fc.property(scalar, (value) => {
        const output = renderJinja("Début {{ value | text }} fin", { value });
        const tree = parse(output);
        expect(tree.children).toHaveLength(1);
        expect(text(tree)).toBe(`Début ${value} fin`);
        expect(collectResourceReferences(tree)).toEqual([]);
      }),
      parameters,
    );
  });
  it("preserves separate ordered list entries including empty values and conditional suffixes", () => {
    fc.assert(
      fc.property(fc.array(fc.record({ value: scalar, extra: fc.boolean() }), { maxLength: 12 }), (entries) => {
        const source =
          "{% for entry in entries %}\n- Ligne {{ loop.index }} : {{ entry.value|text }}{% if entry.extra %} (suite){% endif %}\n{% endfor %}";
        const output = renderJinja(source, { entries });
        const items = parse(output).children.flatMap((node) => (node.type === "list" ? node.children : []));
        expect(items.map(text)).toEqual(
          entries.map((entry, index) =>
            `Ligne ${index + 1} : ${entry.value}${entry.extra ? " (suite)" : ""}`.trimEnd(),
          ),
        );
        expect(renderJinja(source, { entries })).toBe(output);
      }),
      parameters,
    );
  });
  it("retains native Hall references in source and inserted Markdown in exact order", () => {
    fc.assert(
      fc.property(fc.array(fc.uuid(), { maxLength: 10 }), fc.uuid(), (ids, staticId) => {
        const source = `:resource[Pièce fixe]{#${staticId}}\n\n{% for entry in entries %}{{ entry|markdown }}\n\n{% endfor %}`;
        const entries = ids.map((id) => `:resource[Pièce]{#${id}}`);
        const output = renderJinja(source, { entries });
        expect(collectResourceReferences(parse(output)).map((reference) => reference.id)).toEqual([staticId, ...ids]);
      }),
      parameters,
    );
  });
  it("evaluates nested selection deterministically without reordering or mutating inputs", () => {
    fc.assert(
      fc.property(fc.array(fc.record({ value: scalar, selected: fc.boolean() }), { maxLength: 20 }), (entries) => {
        const before = structuredClone(entries);
        const source =
          "{% for entry in entries %}{% if entry.selected %}{{ loop.index }}={{ entry.value }}\n{% endif %}{% endfor %}";
        const output = renderJinja(source, { entries });
        expect(output).toBe(
          entries.map((entry, index) => (entry.selected ? `${index + 1}=${entry.value}\n` : "")).join(""),
        );
        expect(renderJinja(source, { entries })).toBe(output);
        expect(entries).toEqual(before);
      }),
      parameters,
    );
  });
});
