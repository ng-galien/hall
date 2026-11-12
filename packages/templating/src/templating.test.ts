import type { Resource } from "@hall/domain";
import { describe, expect, it } from "vitest";
import {
  collectDirectives,
  collectResourceReferences,
  parse,
  renderHtml,
  serialize,
  validateStructure,
} from "./document.js";
import {
  directiveSpecs,
  fieldNames,
  parseResourceEmbedDirective,
  resourcePresentationKinds,
  serializeResourceEmbedDirective,
} from "./grammar.js";
import { preferredResourcePresentation, resourceSupportsPresentation } from "./resourcePresentation.js";

const roundTrip = (markdown: string) => serialize(parse(markdown)).trim();

const resourceBase = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "resource",
  title: "Resource",
  folderPath: "seed",
  tags: [],
  autosaveEnabled: true,
  state: { readiness: "ready" as const, availability: null },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const presentationResources = {
  text: { ...resourceBase, kind: "text", content: "" } satisfies Resource,
  remote: { ...resourceBase, kind: "remote", url: "https://example.test" } satisfies Resource,
  spreadsheet: { ...resourceBase, kind: "spreadsheet", version: 1 } satisfies Resource,
  geographic: { ...resourceBase, kind: "geographic", provider: "ign", version: 1 } satisfies Resource,
  legalReference: {
    ...resourceBase,
    kind: "legalReference",
    resolutionStatus: "draft",
    provider: "legifrance",
    referenceKind: "article",
  } satisfies Resource,
  image: {
    ...resourceBase,
    kind: "document",
    meetingId: null,
    fileName: "image.png",
    format: "png",
    mediaType: "image/png",
    byteSize: 1,
    contentSha256: "a".repeat(64),
    usage: "document",
    category: "supporting",
    editorOwner: null,
  } satisfies Resource,
  pdf: {
    ...resourceBase,
    kind: "document",
    meetingId: null,
    fileName: "document.pdf",
    format: "pdf",
    mediaType: "application/pdf",
    byteSize: 1,
    contentSha256: "b".repeat(64),
    usage: "document",
    category: "supporting",
    editorOwner: null,
  } satisfies Resource,
};

// @verifies-requirement HALL-FR-SRC-030
describe("resource presentation policy", () => {
  it("offers one preferred presentation for each resource", () => {
    expect(preferredResourcePresentation(presentationResources.text)).toBe("text");
    expect(preferredResourcePresentation(presentationResources.remote)).toBe("link");
    expect(preferredResourcePresentation(presentationResources.spreadsheet)).toBe("table");
    expect(preferredResourcePresentation(presentationResources.geographic)).toBe("map");
    expect(preferredResourcePresentation(presentationResources.legalReference)).toBe("legal-citation");
    expect(preferredResourcePresentation(presentationResources.image)).toBe("image");
    expect(preferredResourcePresentation(presentationResources.pdf)).toBeNull();
    expect(preferredResourcePresentation({ kind: "event" })).toBe("event");
  });

  it("owns the compatibility matrix shared by client rendering and PDF export", () => {
    expect(resourceSupportsPresentation(presentationResources.remote, "link")).toBe(true);
    expect(resourceSupportsPresentation(presentationResources.image, "image")).toBe(true);
    expect(resourceSupportsPresentation(presentationResources.image, "document")).toBe(true);
    expect(resourceSupportsPresentation(presentationResources.pdf, "image")).toBe(false);
    expect(resourceSupportsPresentation(presentationResources.spreadsheet, "table")).toBe(true);
    expect(resourceSupportsPresentation(presentationResources.geographic, "map")).toBe(true);
    expect(resourceSupportsPresentation(presentationResources.legalReference, "legal-citation")).toBe(true);
    expect(resourceSupportsPresentation(presentationResources.text, "document")).toBe(false);
  });
});

describe("canonical serialization", () => {
  it("preserves the identifier shorthand for business references", () => {
    for (const source of [
      ":member[Martine Delcourt]{#7c1e}",
      ":resource[Rapport préparatoire]{#d90a}",
      ":councilBusiness[Subventions]{#b21c}",
      ":decision[Délibération budgétaire]{#c44d}",
      ":meeting[Conseil du 12 septembre]{#a3f0}",
    ]) {
      expect(roundTrip(source)).toBe(source);
    }
  });

  it("normalizes named attributes to their quoted form", () => {
    expect(roundTrip(":field{name=meeting.startsAt}")).toBe(':field{name="meeting.startsAt"}');
    expect(roundTrip(':field{name="meeting.startsAt"}')).toBe(':field{name="meeting.startsAt"}');
    expect(roundTrip("::image[Vue de la mairie]{#37e4df8e-831e-4af2-a4cb-ec1352ae9677 align=center width=60}")).toBe(
      '::image[Vue de la mairie]{#37e4df8e-831e-4af2-a4cb-ec1352ae9677 align="center" width="60"}',
    );
    expect(roundTrip("::resource-embed[Budget]{#budget presentation=table sheet=sheet-1 range=A1:F20}")).toBe(
      '::resource-embed[Budget]{#budget presentation="table" sheet="sheet-1" range="A1:F20"}',
    );
  });

  it("shares the resource block parser and canonical serializer with rich editors", () => {
    const parsed = parseResourceEmbedDirective(
      '::resource-embed[Budget \\] 2026]{#sheet presentation="table" sheet="sheet-1" range="a1:f20"}',
    );
    expect(parsed).toMatchObject({
      id: "sheet",
      label: "Budget ] 2026",
      presentation: "table",
      sheet: "sheet-1",
      range: "a1:f20",
    });
    expect(serializeResourceEmbedDirective(parsed!)).toBe(
      '::resource-embed[Budget \\] 2026]{#sheet presentation="table" sheet="sheet-1" range="A1:F20"}',
    );
  });

  it("preserves an unsupported directive instead of corrupting it", () => {
    expect(roundTrip(":futur[Quelque chose]{#zz}")).toBe(":futur[Quelque chose]{#zz}");
    expect(roundTrip("::snippet[Signature du maire]{#signature-maire}")).toBe(
      "::snippet[Signature du maire]{#signature-maire}",
    );
  });
});

describe("shared rendering", () => {
  it("preserves documentary layout structure and classes through sanitization", () => {
    const source =
      '<section class="decision-facts"><div class="decision-facts-columns"><dl><dt>Membres en exercice</dt><dd>15</dd><dt>Présents</dt><dd>14</dd></dl><div><p>Présidence</p></div></div></section><p class="decision-result" onclick="alert(1)" style="position:fixed">Adoptée</p><script>alert(1)</script>';
    const html = renderHtml(parse(source));
    expect(html).toContain('<section class="decision-facts">');
    expect(html).toContain('<div class="decision-facts-columns"><dl><dt>Membres en exercice</dt><dd>15</dd>');
    expect(html).toContain('<p class="decision-result">Adoptée</p>');
    expect(html).not.toMatch(/onclick|position:fixed|<script|alert\(1\)/);
  });

  it("preserves explicit agenda numbers across withdrawn positions", () => {
    const html = renderHtml({
      type: "root",
      children: [
        {
          type: "html",
          value:
            '<ol><li value="1">PV</li><li value="2">Cession</li><li value="3">Information</li><li value="4">Stationnement</li><li value="6" onclick="alert(1)">Tarifs</li></ol>',
        },
      ],
    });
    expect(html).toBe(
      '<ol><li value="1">PV</li><li value="2">Cession</li><li value="3">Information</li><li value="4">Stationnement</li><li value="6">Tarifs</li></ol>',
    );
  });

  it("renders GFM tables without accepting raw HTML", () => {
    const html = renderHtml(parse("| Nom | Voix |\n| --- | ---: |\n| Alice | 1 |\n\n<script>alert(1)</script>"));
    expect(html).toContain("<table>");
    expect(html).not.toContain("<script>");
  });

  it("allows only generated image markup with a data source", () => {
    const html = renderHtml({
      type: "root",
      children: [
        {
          type: "image",
          url: "data:image/png;base64,iVBORw0KGgo=",
          alt: "Plan de circulation",
          data: {
            hProperties: {
              className: ["hall-template-image", "hall-template-image-center"],
              style: "width:75%",
              onClick: "alert(1)",
            },
          },
        },
      ],
    });
    expect(html).toContain('src="data:image/png;base64,iVBORw0KGgo="');
    expect(html).toContain('class="hall-template-image hall-template-image-center"');
    expect(html).toContain('style="width: 75%"');
    expect(html).not.toContain("onclick");
  });

  it("removes active protocols and remote images", () => {
    const html = renderHtml(
      parse(
        "[dangereux](javascript:alert(1)) [site](https://example.fr) ![traceur](https://tracker.example/pixel.png)",
      ),
    );
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("tracker.example");
    expect(html).toContain('href="https://example.fr"');
  });
});

describe("GFM tables", () => {
  const table = ["| Association | Montant |", "| --- | ---: |", "| Les Tilleuls | 1 200 € |"].join("\n");

  it("recognizes a table and retains each column alignment", () => {
    const [node] = parse(table).children;
    expect(node.type).toBe("table");
    expect((node as { align?: unknown }).align).toEqual([null, "right"]);
  });

  it("aligns columns during serialization and then leaves them stable", () => {
    const once = serialize(parse(table));
    expect(serialize(parse(once))).toBe(once);
  });

  it("accepts a business reference in a cell", () => {
    const votes = ["| Élu | Vote |", "| --- | --- |", "| :member[Martine Delcourt]{#7c1e} | Pour |"].join("\n");
    const [directive] = collectDirectives(parse(votes));
    expect([directive.name, directive.label, directive.attributes.id]).toEqual(["member", "Martine Delcourt", "7c1e"]);
    expect(validateStructure(parse(votes))).toEqual([]);
  });

  it("preserves an escaped vertical bar in a cell", () => {
    const escaped = ["| A |", "| --- |", "| a \\| b |"].join("\n");
    expect(serialize(parse(escaped))).toContain("a \\| b");
  });

  it("preserves and renders the HTML subset produced by rich Tiptap tables", () => {
    const richTable = [
      '<table style="min-width: 75px; width: 100%">',
      '<colgroup><col style="min-width: 25px; width: 40%"><col style="width: 60%"></colgroup>',
      '<thead><tr><th colspan="2" rowspan="1" style="text-align: center">Budget</th></tr></thead>',
      '<tbody><tr><td style="text-align: left">Voirie</td><td style="text-align: right">12 000 €</td></tr></tbody>',
      "</table>",
    ].join("");

    expect(serialize(parse(richTable)).trim()).toBe(richTable);
    const html = renderHtml(parse(richTable));
    expect(html).toContain("<table");
    expect(html).toContain("<colgroup>");
    expect(html).toContain('colspan="2"');
    expect(html).toContain("text-align: right");
    expect(html).toContain("width: 40%");
  });

  it("sanitizes active HTML and arbitrary styles from rich tables", () => {
    const html = renderHtml(
      parse(
        [
          '<table onclick="alert(1)" style="background-image: url(https://tracker.example/x); min-width: 999999px; width: 100%">',
          '<colgroup><col style="width: 40%; background: red"></colgroup>',
          '<tbody><tr><td colspan="2" rowspan="2" colwidth="40,60" align="center" ',
          'style="position: fixed; text-align: center">',
          '<iframe src="https://tracker.example/frame"></iframe>',
          '<a href="javascript:alert(1)" onmouseover="alert(1)">Valeur</a>',
          '<img src="https://tracker.example/pixel" onerror="alert(1)">',
          "<script>alert(1)</script></td></tr></tbody></table>",
        ].join(""),
      ),
    );
    expect(html).toContain("<table");
    expect(html).toContain("width: 100%");
    expect(html).toContain("width: 40%");
    expect(html).toContain("text-align: center");
    expect(html).toContain('colspan="2"');
    expect(html).toContain('rowspan="2"');
    expect(html).toContain('colwidth="40,60"');
    expect(html).toContain('align="center"');
    expect(html).not.toMatch(/on(?:click|error|mouseover)=/);
    expect(html).not.toContain("script");
    expect(html).not.toContain("iframe");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("position");
    expect(html).not.toContain("tracker.example");
    expect(html).not.toContain("background");
    expect(html).not.toContain("999999px");
  });
});

describe("underline", () => {
  it("renders Tiptap underline syntax, including inside another mark", () => {
    expect(renderHtml(parse("Avant ++souligné++ après"))).toContain("Avant <u>souligné</u> après");
    expect(renderHtml(parse("**++important++**"))).toContain("<strong><u>important</u></strong>");
    expect(renderHtml(parse("++**important** aussi++"))).toContain("<u><strong>important</strong> aussi</u>");
  });

  it("leaves unmatched and empty delimiters untouched", () => {
    expect(renderHtml(parse("Avant ++inachevé"))).toContain("Avant ++inachevé");
    expect(renderHtml(parse("Avant ++++ après"))).toContain("Avant ++++ après");
  });
});

describe("directive collection", () => {
  it("numbers occurrences by name in document order", () => {
    const found = collectDirectives(parse(":member[Alice]{#a} puis :member[Bernard]{#b} et :decision[Budget]{#c}"));
    expect(found.map((d) => [d.name, d.occurrence, d.label, d.attributes.id])).toEqual([
      ["member", 0, "Alice", "a"],
      ["member", 1, "Bernard", "b"],
      ["decision", 0, "Budget", "c"],
    ]);
  });

  it("exposes a usable source position", () => {
    const [directive] = collectDirectives(parse(":member[Alice]{#a}"));
    expect(directive.position?.start.line).toBe(1);
  });

  it("collects every durable resource link, including block presentations", () => {
    const references = collectResourceReferences(
      parse(
        [
          ":resource[Rapport]{#report}",
          '::image[Plan]{#image align="center" width="75"}',
          '::resource-embed[Budget]{#sheet presentation="table" sheet="sheet-1" range="A1:C4"}',
        ].join("\n\n"),
      ),
    );
    expect(references).toEqual([
      expect.objectContaining({ id: "report", directive: "resource", occurrence: 0 }),
      expect.objectContaining({ id: "image", directive: "image", occurrence: 0 }),
      expect.objectContaining({ id: "sheet", directive: "resource-embed", occurrence: 0, presentation: "table" }),
    ]);
  });
});

describe("structural validation", () => {
  it("accepts the initial scope forms", () => {
    const markdown = ':member[Martine Delcourt]{#7c1e} ouvre la séance du :field{name="meeting.startsAt"}.';
    expect(validateStructure(parse(markdown))).toEqual([]);
  });

  it("reports an unknown block directive", () => {
    const [diagnostic] = validateStructure(parse("::inconnue[X]{#a}"));
    expect(diagnostic.code).toBe("unknown_directive");
    expect(diagnostic.severity).toBe("error");
    expect(diagnostic.anchor.directive).toBe("inconnue");
  });

  it("keeps an inline colon followed by a word or a number as the text written", () => {
    const sentences = [
      "Résultat annoncé : CRTP :9+1 pouvoir pour,0 contre.",
      "BejeanTP :0 pour,10 contre.",
      "La séance ouvre à 19:30.",
      "Source :p.3",
      "Score final 9:1",
      "Voir :inconnue[X]{#a} ici",
    ];
    for (const sentence of sentences) {
      const tree = parse(sentence);
      expect(validateStructure(tree)).toEqual([]);
      expect(collectDirectives(tree)).toEqual([]);
      expect(renderHtml(tree)).toBe(`<p>${sentence}</p>`);
      expect(roundTrip(sentence)).toBe(sentence);
    }
  });

  it("still resolves known inline directives next to literal colons", () => {
    const tree = parse(":member[Alice]{#a} vote à 19:30, page :page-number.");
    expect(validateStructure(tree)).toEqual([]);
    expect(collectDirectives(tree).map((directive) => directive.name)).toEqual(["member", "page-number"]);
  });

  it("treats snippet as unsupported while it remains outside the scope", () => {
    const [diagnostic] = validateStructure(parse("::snippet[Signature]{#signature-maire}"));
    expect(diagnostic.code).toBe("unknown_directive");
  });

  it("reports a missing identifier on a reference", () => {
    const [diagnostic] = validateStructure(parse(":member[Martine Delcourt]"));
    expect(diagnostic.code).toBe("missing_attribute");
    expect(diagnostic.severity).toBe("error");
    expect(diagnostic.anchor.occurrence).toBe(0);
  });

  it("rejects a field outside the closed list", () => {
    const [diagnostic] = validateStructure(parse(':field{name="meeting.inexistant"}'));
    expect(diagnostic.code).toBe("unknown_field");
    expect(diagnostic.severity).toBe("error");
  });

  it("rejects dynamic navigation disguised as a field name", () => {
    expect(validateStructure(parse(':field{name="meeting.chair.firstName"}'))[0].code).toBe("unknown_field");
  });

  it("reports an unsupported attribute without blocking", () => {
    const [diagnostic] = validateStructure(parse(":member[Martine]{#a role=maire}"));
    expect(diagnostic.code).toBe("unexpected_attribute");
    expect(diagnostic.severity).toBe("warning");
  });

  it("validates an archived image with alternative text, alignment and width", () => {
    expect(
      validateStructure(
        parse('::image[Vue de la mairie]{#37e4df8e-831e-4af2-a4cb-ec1352ae9677 align="center" width="60"}'),
      ),
    ).toEqual([]);
  });

  it("requires alternative text for an image", () => {
    const diagnostics = validateStructure(parse('::image[]{#mairie align="left" width="100"}'));
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain("missing_label");
  });

  it("constrains image alignment and width", () => {
    const diagnostics = validateStructure(parse('::image[Vue]{#mairie align="right" width="120"}'));
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["invalid_attribute", "invalid_attribute"]);
  });

  it("accepts the closed resource presentation contract", () => {
    const examples = [
      '::resource-embed[Plan]{#image presentation="image" align="center" width="60"}',
      '::resource-embed[Annexe]{#pdf presentation="document"}',
      '::resource-embed[Site]{#remote presentation="link"}',
      '::resource-embed[Article]{#legal presentation="legal-citation"}',
      '::resource-embed[Parcelles]{#map presentation="map"}',
      '::resource-embed[Budget]{#sheet presentation="table" sheet="sheet-1" range="A1:F20"}',
    ];
    for (const markdown of examples) expect(validateStructure(parse(markdown))).toEqual([]);
  });

  it("rejects unknown presentations, presentation-specific options and malformed table ranges", () => {
    expect(validateStructure(parse('::resource-embed[X]{#id presentation="iframe"}'))[0]).toMatchObject({
      code: "invalid_attribute",
      severity: "error",
    });
    expect(validateStructure(parse('::resource-embed[X]{#id presentation="map" range="A1:B2"}'))[0]).toMatchObject({
      code: "unexpected_attribute",
      severity: "error",
    });
    expect(validateStructure(parse('::resource-embed[X]{#id presentation="table" sheet="s" range="A0:B"}'))).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "invalid_attribute", severity: "error" })]),
    );
  });
});

describe("registry", () => {
  it("round-trips the two standalone minutes sections", () => {
    const source = "::minutes{section=facts}\n\n::minutes{section=proceedings}";
    expect(validateStructure(parse(source))).toEqual([]);
    expect(collectDirectives(parse(roundTrip(source))).map((entry) => entry.attributes.section)).toEqual([
      "facts",
      "proceedings",
    ]);
  });

  it("rejects unknown, missing and inline minutes sections", () => {
    expect(validateStructure(parse("::minutes{section=made-up}"))).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "invalid_attribute" })]),
    );
    expect(validateStructure(parse("::minutes"))).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "missing_attribute" })]),
    );
    expect(validateStructure(parse(":minutes{section=facts}"))).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "invalid_attribute" })]),
    );
  });

  it("validates the three documentary decision sections and rejects invalid forms", () => {
    for (const section of ["facts", "content", "result"])
      expect(validateStructure(parse(`::council-decision{section=${section}}`))).toEqual([]);
    for (const source of ["::council-decision{section=unknown}", ":council-decision{section=facts}"]) {
      expect(validateStructure(parse(source))).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "invalid_attribute" })]),
      );
    }
    expect(validateStructure(parse("::council-decision"))).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "missing_attribute" })]),
    );
  });

  it("exposes the resource presentation directive", () => {
    expect(directiveSpecs.map((spec) => spec.name)).toEqual([
      "member",
      "contact",
      "resource",
      "councilBusiness",
      "decision",
      "meeting",
      "page-break",
      "page-number",
      "page-count",
      "generated-content",
      "meeting-notice",
      "deliberation-list",
      "minutes",
      "council-decision",
      "image",
      "resource-embed",
      "field",
    ]);
  });

  it("does not expose snippet while it remains outside the scope", () => {
    expect(directiveSpecs.some((spec) => spec.name === ("snippet" as never))).toBe(false);
  });

  it("reserves block directives for meeting notices, deliberation lists, minutes sections, archived images and resource presentations", () => {
    expect(directiveSpecs.filter((spec) => spec.node === "leafDirective").map((spec) => spec.name)).toEqual([
      "page-break",
      "generated-content",
      "meeting-notice",
      "deliberation-list",
      "minutes",
      "council-decision",
      "image",
      "resource-embed",
    ]);
    expect(resourcePresentationKinds).toEqual([
      "image",
      "document",
      "link",
      "legal-citation",
      "map",
      "table",
      "text",
      "event",
    ]);
  });

  it("exposes the closed list of contextual fields", () => {
    expect(fieldNames).toContain("hall.name");
    expect(fieldNames).toContain("meeting.startsAt");
  });
});
