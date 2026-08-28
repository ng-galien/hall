import { describe, expect, it } from "vitest";
import { collectDirectives, parse, renderHtml, serialize, validateStructure } from "./document.js";
import { directiveSpecs, fieldNames } from "./grammar.js";

const roundTrip = (markdown: string) => serialize(parse(markdown)).trim();

describe("sérialisation canonique", () => {
  it("conserve le raccourci d'identifiant des références métier", () => {
    for (const source of [
      ":member[Martine Delcourt]{#7c1e}",
      ":resource[Rapport préparatoire]{#d90a}",
      ":topic[Subventions]{#b21c}",
      ":decision[Délibération budgétaire]{#c44d}",
      ":meeting[Conseil du 12 septembre]{#a3f0}",
    ]) {
      expect(roundTrip(source)).toBe(source);
    }
  });

  it("normalise les attributs nommés en forme entre guillemets", () => {
    // La forme canonique est celle que produit remark : l'écrire autrement ferait réécrire
    // le document à chaque enregistrement.
    expect(roundTrip(":field{name=meeting.startsAt}")).toBe(':field{name="meeting.startsAt"}');
    expect(roundTrip(':field{name="meeting.startsAt"}')).toBe(':field{name="meeting.startsAt"}');
  });

  it("préserve une directive hors contrat au lieu de la mutiler", () => {
    // Vaut pour un type d'une version plus récente comme pour `snippet`, hors périmètre initial.
    expect(roundTrip(":futur[Quelque chose]{#zz}")).toBe(":futur[Quelque chose]{#zz}");
    expect(roundTrip("::snippet[Signature du maire]{#signature-maire}")).toBe(
      "::snippet[Signature du maire]{#signature-maire}",
    );
  });
});

describe("rendu partagé", () => {
  it("rend les tableaux GFM sans accepter de HTML brut", () => {
    const html = renderHtml(parse("| Nom | Voix |\n| --- | ---: |\n| Alice | 1 |\n\n<script>alert(1)</script>"));
    expect(html).toContain("<table>");
    expect(html).not.toContain("<script>");
  });

  it("retire les protocoles actifs et les images distantes", () => {
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

describe("tableaux GFM", () => {
  const table = ["| Association | Montant |", "| --- | ---: |", "| Les Tilleuls | 1 200 € |"].join("\n");

  it("reconnaît un tableau et retient l'alignement de chaque colonne", () => {
    const [node] = parse(table).children;
    expect(node.type).toBe("table");
    expect((node as { align?: unknown }).align).toEqual([null, "right"]);
  });

  it("aligne les colonnes à la sérialisation, puis n'y touche plus", () => {
    // La première écriture normalise le remplissage ; les suivantes sont identiques, donc
    // aucune réécriture parasite dans les diffs au-delà de cette passe.
    const once = serialize(parse(table));
    expect(serialize(parse(once))).toBe(once);
  });

  it("accepte une référence métier dans une cellule", () => {
    const votes = ["| Élu | Vote |", "| --- | --- |", "| :member[Martine Delcourt]{#7c1e} | Pour |"].join("\n");
    const [directive] = collectDirectives(parse(votes));
    expect([directive.name, directive.label, directive.attributes.id]).toEqual(["member", "Martine Delcourt", "7c1e"]);
    expect(validateStructure(parse(votes))).toEqual([]);
  });

  it("préserve une barre verticale échappée dans une cellule", () => {
    const escaped = ["| A |", "| --- |", "| a \\| b |"].join("\n");
    expect(serialize(parse(escaped))).toContain("a \\| b");
  });
});

describe("relevé des directives", () => {
  it("numérote les occurrences par nom, dans l'ordre du document", () => {
    const found = collectDirectives(parse(":member[Alice]{#a} puis :member[Bernard]{#b} et :decision[Budget]{#c}"));
    expect(found.map((d) => [d.name, d.occurrence, d.label, d.attributes.id])).toEqual([
      ["member", 0, "Alice", "a"],
      ["member", 1, "Bernard", "b"],
      ["decision", 0, "Budget", "c"],
    ]);
  });

  it("expose une position source exploitable", () => {
    const [directive] = collectDirectives(parse(":member[Alice]{#a}"));
    expect(directive.position?.start.line).toBe(1);
  });
});

describe("validation structurelle", () => {
  it("accepte les formes du périmètre initial", () => {
    const markdown = ':member[Martine Delcourt]{#7c1e} ouvre la séance du :field{name="meeting.startsAt"}.';
    expect(validateStructure(parse(markdown))).toEqual([]);
  });

  it("signale une directive inconnue", () => {
    const [diagnostic] = validateStructure(parse(":inconnue[X]{#a}"));
    expect(diagnostic.code).toBe("unknown_directive");
    expect(diagnostic.severity).toBe("error");
    expect(diagnostic.anchor.directive).toBe("inconnue");
  });

  it("traite snippet comme hors contrat tant qu'il n'est pas au périmètre", () => {
    const [diagnostic] = validateStructure(parse("::snippet[Signature]{#signature-maire}"));
    expect(diagnostic.code).toBe("unknown_directive");
  });

  it("signale un identifiant manquant sur une référence", () => {
    const [diagnostic] = validateStructure(parse(":member[Martine Delcourt]"));
    expect(diagnostic.code).toBe("missing_attribute");
    expect(diagnostic.severity).toBe("error");
    expect(diagnostic.anchor.occurrence).toBe(0);
  });

  it("refuse un champ hors de la liste fermée", () => {
    const [diagnostic] = validateStructure(parse(':field{name="meeting.inexistant"}'));
    expect(diagnostic.code).toBe("unknown_field");
    expect(diagnostic.severity).toBe("error");
  });

  it("refuse une navigation dynamique déguisée en nom de champ", () => {
    // La liste est fermée : `name` n'est pas un chemin évalué.
    expect(validateStructure(parse(':field{name="meeting.chair.firstName"}'))[0].code).toBe("unknown_field");
  });

  it("signale un attribut hors contrat sans bloquer", () => {
    const [diagnostic] = validateStructure(parse(":member[Martine]{#a role=maire}"));
    expect(diagnostic.code).toBe("unexpected_attribute");
    expect(diagnostic.severity).toBe("warning");
  });
});

describe("registre", () => {
  it("n'expose que le périmètre initial", () => {
    expect(directiveSpecs.map((spec) => spec.name)).toEqual([
      "member",
      "resource",
      "topic",
      "decision",
      "meeting",
      "field",
    ]);
  });

  it("n'expose pas snippet, hors périmètre", () => {
    expect(directiveSpecs.some((spec) => spec.name === ("snippet" as never))).toBe(false);
  });

  it("ne déclare aucune directive de bloc dans ce périmètre", () => {
    expect(directiveSpecs.every((spec) => spec.node === "textDirective")).toBe(true);
  });

  it("expose la liste fermée des champs contextuels", () => {
    expect(fieldNames).toContain("hall.name");
    expect(fieldNames).toContain("meeting.startsAt");
  });
});
