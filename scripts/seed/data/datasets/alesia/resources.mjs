import { randomUUID } from "node:crypto";
import { makeDocx, makePng, makeXlsx } from "../../common/files.mjs";

// @implements-requirement HALL-FR-WSP-250
export async function seedResources(api, { daysFromNow, memberContactIds, caesarContactId }) {
  const { post, createWorkspaceResource, createGeographicResource, uploadPdf, uploadDocument, importSpreadsheet } = api;
  const seedFolderPath = "";

  console.log("- Ressources (textes, documents, carte et liens web)");
  await createWorkspaceResource(
    {
      kind: "remote",
      name: "Code général des collectivités territoriales",
      path: "guide/references-techniques",
      target: { kind: "url", url: "https://www.legifrance.gouv.fr/codes/id/LEGITEXT000006070633/" },
    },
    ["droit", "conseil municipal", "référence"],
  );
  await createGeographicResource({
    name: "Défenses de Cornu",
    path: "defense",
    tags: ["seed", "défense"],
    layers: [{ id: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", visible: true, opacity: 1 }],
    hallLayer: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: randomUUID(),
          properties: {
            kind: "marker",
            visible: true,
            label: "Seconde ligne",
            style: { color: "#1b2a78", size: "medium" },
          },
          geometry: { type: "Point", coordinates: [4.438, 47.558] },
        },
        {
          type: "Feature",
          id: randomUUID(),
          properties: {
            kind: "line",
            visible: true,
            label: "Liaison intérieure des défenses",
            style: { color: "#a2620b", width: 3 },
          },
          geometry: {
            type: "LineString",
            coordinates: [
              [4.438, 47.558],
              [4.44, 47.559],
              [4.442, 47.56],
            ],
          },
        },
      ],
    },
  });

  console.log("- Dossier seed de repérage des types de ressources");
  await createWorkspaceResource(
    {
      kind: "event",
      name: "Pourparlers avec Jules César",
      path: seedFolderPath,
      document: {
        content:
          "Vercingétorix rencontre Jules César pour demander une trêve permettant le passage des habitants les plus vulnérables. Préparer les conditions du passage et les garanties réciproques.",
        location: "Entre les lignes gauloises et romaines, au pied de Cornu",
        schedule: { kind: "timed", start: daysFromNow(1, 10, 0), end: daysFromNow(1, 11, 0) },
        participants: [
          { kind: "contact", contactId: memberContactIds["Vercingétorix"] },
          { kind: "contact", contactId: caesarContactId },
        ],
      },
    },
    ["seed", "rendez-vous"],
  );
  await createWorkspaceResource(
    {
      kind: "text",
      name: "Situation de l’oppidum",
      path: seedFolderPath,
      content:
        "## Situation de l’oppidum\n\nLes lignes romaines resserrent l’étau autour de Cornu. Vercingétorix réunit le conseil : garder le grenier, consolider les abris et obtenir des nouvelles des alliés. Commius prépare les messages tandis que Vercassivellaunos inspecte les défenses.\n\nLes pourparlers avec César porteront sur une trêve et le passage des habitants vulnérables. Aucun passage ne sera engagé avant accord sur les garanties.",
    },
    ["seed", "texte"],
  );
  await createWorkspaceResource(
    {
      kind: "spreadsheet",
      name: "Chiffrage de la seconde ligne",
      path: seedFolderPath,
      document: {
        schemaVersion: 2,
        workbook: {
          id: "seed-defense-workbook",
          name: "Chiffrage de la seconde ligne",
          appVersion: "0.25.1",
          locale: "frFR",
          styles: {},
          sheetOrder: ["defense", "hypotheses"],
          sheets: {
            defense: {
              id: "defense",
              name: "Dépenses",
              rowCount: 20,
              columnCount: 8,
              cellData: {
                0: {
                  0: { v: "Poste", s: { bl: 1, bg: { rgb: "#e7eaf8" } } },
                  1: { v: "Quantité", s: { bl: 1, bg: { rgb: "#e7eaf8" } } },
                  2: { v: "Prix (quinaires)", s: { bl: 1, bg: { rgb: "#e7eaf8" } } },
                  3: { v: "Total (quinaires)", s: { bl: 1, bg: { rgb: "#e7eaf8" } } },
                  4: { v: "Part livrée", s: { bl: 1, bg: { rgb: "#e7eaf8" } } },
                  5: { v: "Date prévisionnelle", s: { bl: 1, bg: { rgb: "#e7eaf8" } } },
                },
                1: {
                  0: { v: "Poutres" },
                  1: { v: 96, s: { n: { pattern: "#,##0" } } },
                  2: { v: 2, s: { n: { pattern: "#,##0" } } },
                  3: { f: "=ROUND(B2*C2,2)", v: 192, s: { n: { pattern: "#,##0" } } },
                  4: { v: 0, s: { n: { pattern: "0.00%" } } },
                  5: { v: daysFromNow(7).slice(0, 10) },
                },
                2: {
                  0: { v: "Hottes de pierre" },
                  1: { v: 60, s: { n: { pattern: "#,##0" } } },
                  2: { v: 1, s: { n: { pattern: "#,##0" } } },
                  3: { f: "=ROUND(B3*C3,2)", v: 60, s: { n: { pattern: "#,##0" } } },
                  4: { v: 0, s: { n: { pattern: "0.00%" } } },
                  5: { v: daysFromNow(7).slice(0, 10) },
                },
                3: {
                  0: { v: "Journées de transport" },
                  1: { v: 30, s: { n: { pattern: "#,##0" } } },
                  2: { v: 1, s: { n: { pattern: "#,##0" } } },
                  3: { f: "=ROUND(B4*C4,2)", v: 30, s: { n: { pattern: "#,##0" } } },
                  4: { v: 0, s: { n: { pattern: "0.00%" } } },
                  5: { v: daysFromNow(14).slice(0, 10) },
                },
                4: {
                  0: { v: "Total", s: { bl: 1 } },
                  3: { f: "=ROUND(SUM(D2:D4),2)", v: 282, s: { bl: 1, n: { pattern: "#,##0" } } },
                },
              },
              rowData: { 0: { h: 30 }, 1: { h: 24 }, 2: { h: 24 }, 3: { h: 24 }, 4: { h: 26 } },
              columnData: {
                0: { w: 210 },
                1: { w: 90 },
                2: { w: 140 },
                3: { w: 140 },
                4: { w: 90 },
                5: { w: 150 },
              },
              mergeData: [{ startRow: 4, startColumn: 0, endRow: 4, endColumn: 2 }],
              showGridlines: 1,
            },
            hypotheses: {
              id: "hypotheses",
              name: "Hypothèses",
              rowCount: 20,
              columnCount: 8,
              cellData: {
                0: {
                  0: { v: "Hypothèse", s: { bl: 1, bg: { rgb: "#e7eaf8" } } },
                  1: { v: "Valeur", s: { bl: 1, bg: { rgb: "#e7eaf8" } } },
                },
                1: { 0: { v: "Monnaie" }, 1: { v: "Quinaires d’argent séquanes" } },
                2: { 0: { v: "Poutres : 96 × 2 ; pierre : 60 × 1 ; transport : 30 × 1." } },
                3: { 0: { v: "Total prévu : 282 quinaires. Part livrée mise à jour après réception." } },
              },
              rowData: {},
              columnData: { 0: { w: 210 }, 1: { w: 120 } },
              mergeData: [],
              showGridlines: 1,
            },
          },
        },
      },
    },
    ["seed", "tableur", "defense"],
  );
  await uploadPdf({
    title: "État des réserves de Cornu",
    fileName: "document-seed.pdf",
    folderPath: seedFolderPath,
    tags: ["seed", "document"],
    lines: [
      "ETAT DU GRENIER DE CORNU",
      "120 sacs : 60 au nord, 40 au sud et 20 dans la reserve gardee de l’espace sud.",
      "Tenir le compte des sacs remis aux porteurs.",
    ],
  });
  await createWorkspaceResource(
    {
      kind: "remote",
      name: "Alésia - histoire et archéologie",
      path: seedFolderPath,
      target: { kind: "url", url: "https://alesia.com/archeologie/" },
    },
    ["seed", "web"],
  );
  await createGeographicResource({
    name: "Repérage du plateau de Cornu",
    path: seedFolderPath,
    tags: ["seed", "carte"],
    layers: [{ id: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", visible: true, opacity: 1 }],
    view: { kind: "center", center: [4.438, 47.558], zoom: 15 },
    hallLayer: { type: "FeatureCollection", features: [] },
  });
  try {
    const legalMatches = await post("/resources/legal-references/search", {
      query: "L2121-10",
      effectiveAt: null,
    });
    const legalMatch = legalMatches[0];
    if (!legalMatch) throw new Error("Aucun résultat Légifrance pour L2121-10");
    const legalDraft = await createWorkspaceResource(
      { kind: "legalReference", name: legalMatch.title, path: "guide/references-techniques" },
      ["seed", "droit"],
    );
    await post(`/resources/${legalDraft.id}/legal-reference/resolve`, {
      title: legalMatch.title,
      provider: legalMatch.provider,
      referenceKind: legalMatch.referenceKind,
      fund: legalMatch.fund,
      versionId: legalMatch.versionId,
      effectiveAt: legalMatch.effectiveAt,
    });
  } catch (error) {
    console.warn(`  Référence juridique non créée : ${error instanceof Error ? error.message : String(error)}`);
  }
  await createWorkspaceResource({ kind: "folder", path: "defense", name: "a-classer" });
  await createWorkspaceResource(
    {
      kind: "text",
      path: "defense",
      name: "Note de cadrage - défense du plateau",
      content:
        "## Objectif\n\nConsolider les accès des abris et la seconde ligne de défense de Cornu.\n\n- Examiner les besoins en bois et en pierre.\n- Maintenir le passage des équipes de ravitaillement.\n- Présenter un bilan au conseil.\n\n",
    },
    ["seed", "Alésia"],
  );
  await createWorkspaceResource(
    {
      kind: "text",
      path: "ravitaillement",
      name: "Organisation de la distribution des vivres",
      content:
        "## Organisation proposée\n\nRecenser les réserves, organiser deux points de distribution et consigner les besoins des abris. La répartition proposée reste soumise au conseil.",
    },
    ["seed", "Alésia"],
  );
  await uploadPdf({
    title: "Rapport - renforcement de la seconde ligne",
    fileName: "alesia-dossier-1.pdf",
    folderPath: "defense",
    lines: [
      "CONSEIL D’ALESIA",
      "Vercassivellaunos presente les besoins de la seconde ligne.",
      "Renforcer les acces de Cornu en maintenant le passage des convois.",
      "Besoins : 96 poutres, 60 hottes et 30 journees de transport.",
      "Bois : 192 quinaires ; pierre : 60 quinaires ; transport : 30 quinaires. Total : 282 quinaires d’argent.",
    ],
  });
  await uploadPdf({
    title: "Estimation - défense du plateau",
    fileName: "alesia-dossier-2.pdf",
    folderPath: "defense",
    lines: [
      "CONSEIL D’ALESIA",
      "Bois : 96 poutres a 2 quinaires, soit 192 quinaires",
      "Pierre : 60 hottes a 1 quinaire, soit 60 quinaires",
      "Transport : 30 journees a 1 quinaire, soit 30 quinaires",
      "Total : 282 quinaires d’argent sequanes. Garder le chemin des abris ouvert.",
    ],
  });
  await uploadPdf({
    title: "Tableau des moyens de soutien",
    fileName: "alesia-dossier-3.pdf",
    folderPath: "soutien",
    lines: [
      "CONSEIL D’ALESIA",
      "Equipe des abris : 24 journees de travail ; allocation de 48 quinaires",
      "Equipe des convois : 16 journees de travail ; allocation de 32 quinaires",
      "Equipe des reserves : 9 journees de travail ; allocation de 18 quinaires",
      "Total : 49 journees de travail et 98 quinaires d’argent sequanes.",
    ],
  });
  await uploadPdf({
    title: "Inventaire du grenier de Cornu",
    fileName: "alesia-dossier-4.pdf",
    folderPath: "reserves",
    lines: [
      "CONSEIL D’ALESIA",
      "Deux espaces couverts : 60 sacs au nord, 40 au sud et 20 dans la reserve gardee au sud.",
      "Stock disponible : 120 sacs de cereales.",
      "Affectation proposee aux reserves du conseil.",
    ],
  });
  await uploadPdf({
    title: "Note sur la répartition des céréales",
    fileName: "alesia-dossier-5.pdf",
    folderPath: "ravitaillement",
    lines: [
      "CONSEIL D’ALESIA",
      "Stock : 120 sacs de cereales.",
      "Proposition initiale : 80 sacs aux abris et 40 aux equipes.",
      "Repartir les sacs sans epuiser la reserve : proposition a examiner.",
    ],
  });

  console.log("- Fonds documentaire (plan de classement complet)");
  const libraryTexts = [
    [
      "reserves",
      "Note sur l’affectation du grenier de Cornu",
      ["seed", "Alésia"],
      "Deux espaces couverts sont proposés au stockage commun : 60 sacs au nord, 40 au sud et 20 dans la réserve gardée de l’espace sud, soit 120 sacs.",
    ],
    [
      "reserves/abris",
      "Diagnostic des abris de Cornu",
      ["seed", "Alésia"],
      "Deux couvertures sont à examiner. Une visite doit préciser les réparations nécessaires avant attribution des matériaux.",
    ],
    [
      "reserves/abris",
      "Règlement de mise à disposition",
      ["seed", "Alésia"],
      "Projet de consigne commune : inscrire les créneaux des équipes et signaler tout besoin de réparation.",
    ],
    [
      "ravitaillement",
      "Répartition proposée des vivres",
      ["seed", "Alésia"],
      "Projet initial : 80 sacs aux abris et 40 sacs aux équipes. Les besoins de chaque groupe doivent être examinés avant attribution.",
    ],
    [
      "defense",
      "État des défenses - première ligne",
      ["seed", "Alésia"],
      "Le bilan relève trois secteurs à examiner, en priorité près des accès aux abris.",
    ],
    [
      "accueil",
      "Organisation des abris",
      ["seed", "Alésia"],
      "142 habitants sont accueillis. Merlin l’Enchanteur organise les soins près des sources ; Viridomaros recense les besoins en eau et en couvertures.",
    ],
    [
      "accueil/capacites",
      "Accueil des habitants - capacités de réserve",
      ["seed", "Alésia"],
      "Une extension de 20 places est à étudier. Ce besoin reste une question préparée.",
    ],
    [
      "acces",
      "Remise en état des chemins de ravitaillement",
      ["seed", "Alésia"],
      "## Priorités proposées\n\n1. Accès aux réserves\n2. Liaison des abris\n3. Passage des convois",
    ],
    [
      "acces",
      "Inventaire des chemins de liaison",
      ["seed", "Alésia"],
      "Inventaire de travail : chemin intérieur entre le grenier et les abris de Cornu. Les porteurs doivent reconnaître le chemin avant le prochain départ.",
    ],
    [
      "acces",
      "Consigne de circulation - accès de Cornu",
      ["seed", "Alésia"],
      "Projet : conserver un passage aux équipes de ravitaillement pendant les travaux de défense.",
    ],
    [
      "soutien",
      "Engagements des équipes de soutien",
      ["seed", "Alésia"],
      "Les équipes des abris, des convois et des réserves présentent leurs besoins et rendent compte des moyens utilisés.",
    ],
    [
      "soutien/moyens/preparation/arbitrages",
      "Synthèse des moyens proposés",
      ["seed", "Alésia"],
      "| Équipe | Journées | Quinaires d’argent |\n| --- | ---: | ---: |\n| Abris | 24 | 48 |\n| Convois | 16 | 32 |\n| Réserves | 9 | 18 |\n| Total | 49 | 98 |",
    ],
    [
      "defense/seconde-ligne/preparation/estimations/pieces",
      "Hypothèses de l’estimation",
      ["seed", "Alésia"],
      "96 poutres à 2 quinaires : 192 quinaires. 60 hottes de pierre à 1 quinaire : 60 quinaires. 30 journées de transport à 1 quinaire : 30 quinaires. Total : 282 quinaires d’argent séquanes.",
    ],
    [
      "relations",
      "Note de liaison avec les alliés",
      ["seed", "Alésia"],
      "Préparer un message sur les besoins de ravitaillement et la coordination. Commius rassemble les nouvelles des alliés ; Éporédorix vérifie les itinéraires des messagers.",
    ],
    [
      "conseil",
      "Travaux du conseil",
      ["seed", "Alésia"],
      "Convictolitavis rassemble les comptes rendus du conseil. Les questions sur les abris restent à reprendre après la visite des charpentiers.",
    ],
  ];
  for (const [folderPath, title, tags, content] of libraryTexts) {
    await createWorkspaceResource({ kind: "text", name: title, path: folderPath, content }, tags);
  }
  console.log(`  ${libraryTexts.length} textes classés`);

  const libraryPdfs = [
    [
      "defense/seconde-ligne/preparation/estimations/pieces",
      "Bordereau des matériaux",
      "bordereau-materiaux.pdf",
      [
        "CONSEIL D’ALESIA",
        "96 poutres : 192 quinaires ; 60 hottes de pierre : 60 quinaires.",
        "30 journees de transport : 30 quinaires. Total : 282 quinaires d’argent sequanes.",
      ],
    ],
    [
      "accueil",
      "Bilan des abris",
      "bilan-abris.pdf",
      ["CONSEIL D’ALESIA", "142 habitants accueillis.", "Capacite complementaire a etudier : 20 places."],
    ],
  ];
  for (const [folderPath, title, fileName, lines] of libraryPdfs) {
    await uploadPdf({ title, fileName, folderPath, lines });
  }
  console.log(`  ${libraryPdfs.length} documents PDF classés`);

  await uploadDocument({
    title: "Repère du plateau",
    fileName: "repere-plateau.png",
    folderPath: "acces",
    content: makePng(),
    mediaType: "image/png",
  });
  await uploadDocument({
    title: "Convention de mise à disposition",
    fileName: "convention-mise-a-disposition.docx",
    folderPath: "soutien",
    content: makeDocx(
      "Accord du grenier : Commius l’Atrébate met les espaces couverts à disposition des équipes. Vercassivellaunos l’Arverne examine les couvertures. Les porteurs rendent les paniers et signalent les sacs abîmés.",
    ),
    mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  await importSpreadsheet({
    title: "Export des moyens de soutien",
    fileName: "moyens-soutien.csv",
    folderPath: "",
    content: Buffer.from(
      "equipe;journees_de_travail;quinaires_argent\nAbris;24;48\nConvois;16;32\nRéserves;9;18\nTotal;49;98\n",
    ),
    mediaType: "text/csv",
  });
  await importSpreadsheet({
    title: "Suivi détaillé des moyens de soutien",
    fileName: "suivi-moyens-soutien.xlsx",
    folderPath: "",
    content: makeXlsx(
      [
        ["Équipe", "Journées proposées", "Quinaires d’argent", "Objet"],
        ["Abris", 24, 48, "Accueil des habitants"],
        ["Convois", 16, 32, "Liaisons de ravitaillement"],
        ["Réserves", 9, 18, "Stockage et distribution"],
        ["Total", 49, 98, "Quinaires d’argent séquanes"],
      ],
      "Moyens de soutien",
    ),
    mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  console.log("  2 documents multi-formats classés (PNG, DOCX) et 2 tableurs importés (CSV, XLSX)");
}
