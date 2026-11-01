import { randomUUID } from "node:crypto";
import { makeDocx, makePng, makeXlsx } from "../../common/files.mjs";

const folders = {
  root: "",
  access: "Accès",
  shelters: "Accueil",
  shelterCapacity: "Accueil/Capacités",
  council: "Conseil",
  defense: "Défense",
  secondLine: "Défense/Seconde ligne",
  legal: "Guide/Références juridiques",
  supply: "Ravitaillement",
  allies: "Relations",
  proconsul: "Relations/Proconsul",
  reliefArmy: "Relations/Armée de secours",
  reserves: "Réserves",
  reserveShelters: "Réserves/Abris",
  support: "Soutien",
  supportMeans: "Soutien/Moyens",
  watch: "Veille",
};

const colors = {
  navy: "#1b2a78",
  blue: "#2f6fd6",
  slate: "#475569",
  grey: "#94a3b8",
  green: "#15803d",
  red: "#b42318",
};

const frenchDate = (iso) => {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
};
const spreadsheetSerial = (iso) => Math.round((Date.parse(iso.slice(0, 10)) - Date.UTC(1899, 11, 30)) / 86_400_000);
const percent = (value) => `${Math.round(value * 100)} %`;

function pathLength(coordinates) {
  const radius = 6_371_000;
  let total = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const [lon1, lat1] = coordinates[index - 1].map((value) => (value * Math.PI) / 180);
    const [lon2, lat2] = coordinates[index].map((value) => (value * Math.PI) / 180);
    const a = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2;
    total += 2 * radius * Math.asin(Math.sqrt(a));
  }
  return Math.round(total);
}

const marker = (label, coordinates, color = colors.navy, size = "medium") => ({
  type: "Feature",
  id: randomUUID(),
  properties: { kind: "marker", visible: true, label, style: { color, size } },
  geometry: { type: "Point", coordinates },
});
const line = (label, coordinates, color, width = 3, arrows = "none") => ({
  type: "Feature",
  id: randomUUID(),
  properties: { kind: "line", visible: true, label, style: { color, width, arrows } },
  geometry: { type: "LineString", coordinates },
});
const area = (label, coordinates, fillColor, strokeColor, fillOpacity = 0.25) => ({
  type: "Feature",
  id: randomUUID(),
  properties: { kind: "area", visible: true, label, style: { fillColor, strokeColor, strokeWidth: 2, fillOpacity } },
  geometry: { type: "Polygon", coordinates: [coordinates] },
});

function defenseCostingWorkbook(daysFromNow) {
  const header = { bl: 1, bg: { rgb: "#e7eaf8" } };
  const integer = { n: { pattern: "#,##0" } };
  const share = { n: { pattern: "0%" } };
  const date = { n: { pattern: "dd/mm/yyyy" } };
  const lines = [
    ["Porte ouest", "Poutres de chêne", 20, 2, 1, 3, "Vercassivellaunos"],
    ["Tour de guet nord", "Poutres de chêne", 16, 2, 1, 3, "Vercassivellaunos"],
    ["Courtine nord", "Poutres de chêne", 16, 2, 0.75, 5, "Drappès"],
    ["Courtine est", "Poutres de chêne", 14, 2, 0.5, 7, "Drappès"],
    ["Courtine sud", "Poutres de chêne", 16, 2, 0.25, 9, "Luctérios"],
    ["Abords du grenier", "Poutres de chêne", 14, 2, 0, 12, "Luctérios"],
    ["Porte ouest", "Hottes de pierre", 14, 1, 1, 4, "Éporédorix"],
    ["Courtine nord", "Hottes de pierre", 12, 1, 0.5, 6, "Éporédorix"],
    ["Courtine est", "Hottes de pierre", 10, 1, 0.5, 8, "Drappès"],
    ["Courtine sud", "Hottes de pierre", 14, 1, 0, 10, "Luctérios"],
    ["Dépôt sud", "Hottes de pierre", 10, 1, 0, 13, "Luctérios"],
    ["Semaine 1", "Journées de transport", 8, 1, 1, 7, "Commius"],
    ["Semaine 2", "Journées de transport", 7, 1, 0.5, 14, "Commius"],
    ["Semaine 3", "Journées de transport", 6, 1, 0, 21, "Commius"],
    ["Semaine 4", "Journées de transport", 5, 1, 0, 28, "Commius"],
    ["Semaine 5", "Journées de transport", 4, 1, 0, 35, "Commius"],
  ];
  const cellData = {
    0: Object.fromEntries(
      [
        "Secteur",
        "Poste",
        "Quantité",
        "Prix unitaire (quinaires)",
        "Total (quinaires)",
        "Part livrée",
        "Date prévue",
        "Responsable",
      ].map((title, column) => [column, { v: title, s: header }]),
    ),
  };
  lines.forEach(([sector, item, quantity, price, delivered, days, owner], index) => {
    const row = index + 1;
    const excelRow = row + 1;
    cellData[row] = {
      0: { v: sector },
      1: { v: item },
      2: { v: quantity, s: integer },
      3: { v: price, s: integer },
      4: { f: `=C${excelRow}*D${excelRow}`, v: quantity * price, s: integer },
      5: { v: delivered, s: share },
      6: { v: spreadsheetSerial(daysFromNow(days)), s: date },
      7: { v: owner },
    };
  });
  const totalRow = lines.length + 1;
  const total = lines.reduce((sum, [, , quantity, price]) => sum + quantity * price, 0);
  cellData[totalRow] = {
    0: { v: "Total", s: { bl: 1 } },
    4: { f: `=SUM(E2:E${totalRow})`, v: total, s: { bl: 1, ...integer } },
  };
  return {
    schemaVersion: 2,
    workbook: {
      id: "defense-costing-workbook",
      name: "Chiffrage de la seconde ligne",
      appVersion: "0.25.1",
      locale: "frFR",
      styles: {},
      sheetOrder: ["defense", "hypotheses"],
      sheets: {
        defense: {
          id: "defense",
          name: "Dépenses",
          rowCount: 40,
          columnCount: 10,
          cellData,
          rowData: { 0: { h: 30 } },
          columnData: {
            0: { w: 150 },
            1: { w: 170 },
            2: { w: 80 },
            3: { w: 170 },
            4: { w: 130 },
            5: { w: 90 },
            6: { w: 110 },
            7: { w: 150 },
          },
          mergeData: [{ startRow: totalRow, startColumn: 0, endRow: totalRow, endColumn: 3 }],
          showGridlines: 1,
        },
        hypotheses: {
          id: "hypotheses",
          name: "Hypothèses",
          rowCount: 20,
          columnCount: 8,
          cellData: {
            0: { 0: { v: "Hypothèse", s: header }, 1: { v: "Valeur", s: header } },
            1: { 0: { v: "Monnaie" }, 1: { v: "Quinaires d’argent séquanes" } },
            2: { 0: { v: "Poutres de chêne" }, 1: { v: "96 poutres à 2 quinaires" } },
            3: { 0: { v: "Hottes de pierre" }, 1: { v: "60 hottes à 1 quinaire" } },
            4: { 0: { v: "Journées de transport" }, 1: { v: "30 journées à 1 quinaire" } },
            5: { 0: { v: "Part livrée" }, 1: { v: "Mise à jour à chaque réception sur le chantier" } },
          },
          rowData: {},
          columnData: { 0: { w: 210 }, 1: { w: 320 } },
          mergeData: [],
          showGridlines: 1,
        },
      },
    },
  };
}

function distributionCsv(daysFromNow) {
  const rows = [
    [
      "Date",
      "Abri nord (sacs)",
      "Abri sud (sacs)",
      "Équipes (sacs)",
      "Total (sacs)",
      "Stock restant",
      "Part du stock initial",
    ],
  ];
  let stock = 160;
  for (let day = 20; day >= 1; day -= 1) {
    const north = day % 3 === 0 ? 1 : 0;
    const south = day % 4 === 0 ? 1 : 0;
    const teams = day % 5 === 0 ? 1 : 0;
    const total = north + south + teams;
    stock -= total;
    rows.push([frenchDate(daysFromNow(-day)), north, south, teams, total, stock, percent(stock / 160)]);
  }
  return Buffer.from(`${rows.map((row) => row.join(";")).join("\n")}\n`);
}

function supportWorkbook(daysFromNow) {
  const plan = {
    "Équipe des abris": [5, 5, 5, 5, 4],
    "Équipe des convois": [4, 3, 3, 3, 3],
    "Équipe des réserves": [2, 2, 2, 2, 1],
  };
  const done = {
    "Équipe des abris": [5, 4, 5, 4, 3],
    "Équipe des convois": [4, 3, 2, 3, 2],
    "Équipe des réserves": [2, 2, 1, 2, 1],
  };
  const rows = [
    ["Semaine", "Équipe", "Journées prévues", "Journées réalisées", "Quinaires engagés", "Taux de réalisation"],
  ];
  for (let week = 0; week < 5; week += 1) {
    for (const team of Object.keys(plan)) {
      const planned = plan[team][week];
      const realised = done[team][week];
      rows.push([
        `Semaine du ${frenchDate(daysFromNow(-35 + week * 7))}`,
        team,
        planned,
        realised,
        realised * 2,
        percent(realised / planned),
      ]);
    }
  }
  const plannedTotal = Object.values(plan)
    .flat()
    .reduce((sum, value) => sum + value, 0);
  const realisedTotal = Object.values(done)
    .flat()
    .reduce((sum, value) => sum + value, 0);
  rows.push([
    "Total",
    "Trois équipes",
    plannedTotal,
    realisedTotal,
    realisedTotal * 2,
    percent(realisedTotal / plannedTotal),
  ]);
  return makeXlsx(rows, "Suivi hebdomadaire");
}

function romanWorksWorkbook(daysFromNow) {
  const observations = [
    [-15, "Fossé de la plaine, tronçon ouest", 120, "Tour de guet nord"],
    [-14, "Tour de bois sur la ligne intérieure", 40, "Tour de guet nord"],
    [-12, "Camp au pied du coteau nord", 2_000, "Rempart nord"],
    [-11, "Fossé de la plaine, tronçon est", 150, "Rempart nord"],
    [-9, "Pièges devant le fossé intérieur", 60, "Tour de guet nord"],
    [-8, "Tour de bois sur la ligne intérieure", 35, "Rempart ouest"],
    [-6, "Ligne extérieure, terrassement", 300, "Rempart nord"],
    [-5, "Camp de cavalerie vers l’est", 800, "Tour de guet nord"],
    [-3, "Ligne extérieure, palissade", 250, "Rempart ouest"],
    [-1, "Tour de bois sur la ligne extérieure", 45, "Tour de guet nord"],
  ];
  return makeXlsx(
    [
      ["Date", "Poste d’observation", "Ouvrage observé", "Effectif estimé"],
      ...observations.map(([days, work, strength, post]) => [frenchDate(daysFromNow(days)), post, work, strength]),
    ],
    "Observations",
  );
}

function plateauPlan() {
  return makePng({
    width: 640,
    height: 400,
    background: [241, 245, 249],
    shapes: [
      { kind: "rect", x: 40, y: 30, width: 560, height: 340, color: [71, 85, 105], stroke: 6 },
      { kind: "rect", x: 430, y: 80, width: 120, height: 80, color: [47, 111, 214] },
      { kind: "rect", x: 90, y: 70, width: 110, height: 70, color: [148, 163, 184] },
      { kind: "rect", x: 90, y: 260, width: 110, height: 70, color: [148, 163, 184] },
      { kind: "disc", x: 280, y: 200, radius: 18, color: [21, 128, 61] },
      {
        kind: "path",
        points: [
          [430, 120],
          [330, 140],
          [250, 120],
          [200, 105],
        ],
        width: 6,
        color: [27, 42, 120],
        dash: 14,
      },
      {
        kind: "path",
        points: [
          [250, 120],
          [220, 220],
          [200, 295],
        ],
        width: 6,
        color: [27, 42, 120],
        dash: 14,
      },
    ],
  });
}

// @implements-requirement HALL-FR-WSP-250
export async function seedResources(api, { daysFromNow, memberContactIds, caesarContactId }) {
  const { post, createWorkspaceResource, createGeographicResource, uploadPdf, uploadDocument, importSpreadsheet } = api;

  console.log("- Références juridiques et ressource web");
  await createWorkspaceResource(
    {
      kind: "remote",
      name: "Code général des collectivités territoriales",
      path: folders.root,
      target: { kind: "url", url: "https://www.legifrance.gouv.fr/codes/id/LEGITEXT000006070633/" },
    },
    ["droit", "conseil municipal"],
  );
  try {
    const legalMatches = await post("/resources/legal-references/search", { query: "L2121-10", effectiveAt: null });
    const legalMatch = legalMatches[0];
    if (!legalMatch) throw new Error("Aucun résultat Légifrance pour L2121-10");
    const legalDraft = await createWorkspaceResource(
      { kind: "legalReference", name: legalMatch.title, path: folders.legal },
      ["droit", "convocation"],
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

  console.log("- Cartes");
  const view = { kind: "center", center: [5.957, 46.668], zoom: 16 };
  const layers = [{ id: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", visible: true, opacity: 1 }];
  await createGeographicResource({
    name: "Défenses de l’oppidum",
    path: folders.root,
    tags: ["défense", "carte"],
    view,
    layers,
    hallLayer: {
      type: "FeatureCollection",
      legend: [
        {
          color: colors.navy,
          label:
            "Seconde ligne : poste de commandement de Vercassivellaunos, porte ouest gardée jour et nuit, tour de guet nord relevée toutes les quatre heures",
        },
        { color: colors.red, label: "Fossé extérieur : à recreuser sur la partie sud" },
        { color: colors.blue, label: "Chantier de la seconde ligne : 96 poutres et 60 hottes de pierre" },
        { color: colors.slate, label: "Dépôt de pierre : déplacé au sud pour libérer le chemin du grenier" },
      ],
      features: [
        marker("Poste de commandement", [5.957, 46.6677], colors.navy, "large"),
        marker("Porte ouest des convois", [5.952, 46.6672], colors.navy),
        marker("Tour de guet nord", [5.9575, 46.6702], colors.navy),
        line(
          "Fossé extérieur de l’oppidum",
          [
            [5.951, 46.6652],
            [5.9515, 46.6697],
            [5.956, 46.6712],
            [5.961, 46.6702],
            [5.963, 46.6662],
          ],
          colors.red,
          4,
        ),
        line(
          "Liaison intérieure des défenses",
          [
            [5.957, 46.6677],
            [5.959, 46.6687],
            [5.961, 46.6697],
          ],
          colors.navy,
          3,
        ),
        area(
          "Chantier de la seconde ligne",
          [
            [5.955, 46.6667],
            [5.959, 46.6667],
            [5.959, 46.6687],
            [5.955, 46.6687],
            [5.955, 46.6667],
          ],
          colors.blue,
          colors.navy,
        ),
        area(
          "Dépôt de pierre",
          [
            [5.956, 46.6647],
            [5.958, 46.6647],
            [5.958, 46.6657],
            [5.956, 46.6657],
            [5.956, 46.6647],
          ],
          colors.slate,
          colors.slate,
          0.35,
        ),
      ],
    },
  });
  const convoyPath = [
    [5.959, 46.6687],
    [5.9575, 46.6682],
    [5.9555, 46.6687],
    [5.9545, 46.6697],
  ];
  await createGeographicResource({
    name: "Repérage du plateau d’Alésia",
    path: folders.access,
    tags: ["convois", "carte"],
    view,
    layers,
    hallLayer: {
      type: "FeatureCollection",
      legend: [
        { color: colors.blue, label: "Grenier d’Alésia : 120 sacs, garde permanente" },
        {
          color: colors.slate,
          label:
            "Abris : nord, 78 habitants, couvertures à renouveler ; sud, 64 habitants, deux couvertures affaissées",
        },
        { color: colors.green, label: "Point d’eau : gardé la nuit" },
        { color: colors.navy, label: "Chemins des convois : départs aux heures paires, retours aux heures impaires" },
      ],
      features: [
        area(
          "Enceinte de l’oppidum",
          [
            [5.951, 46.6647],
            [5.963, 46.6647],
            [5.963, 46.6712],
            [5.951, 46.6712],
            [5.951, 46.6647],
          ],
          colors.grey,
          colors.slate,
          0.1,
        ),
        marker("Grenier d’Alésia", [5.959, 46.6687], colors.blue, "large"),
        marker("Abri nord des habitants", [5.9545, 46.6697], colors.slate),
        marker("Abri sud des habitants", [5.954, 46.6662], colors.slate),
        marker("Point d’eau de l’oppidum", [5.956, 46.6675], colors.green),
        line("Chemin des convois", convoyPath, colors.navy, 4, "forward"),
        line(
          "Chemin des abris sud",
          [
            [5.9555, 46.6687],
            [5.9545, 46.6672],
            [5.954, 46.6662],
          ],
          colors.navy,
          3,
        ),
        {
          type: "Feature",
          id: randomUUID(),
          properties: {
            kind: "lengthMeasurement",
            label: "Longueur du chemin des convois",
            length: pathLength(convoyPath),
          },
          geometry: { type: "LineString", coordinates: convoyPath },
        },
      ],
    },
  });

  console.log("- Calendrier");
  await createWorkspaceResource(
    {
      kind: "event",
      name: "Pourparlers avec Jules César",
      path: folders.allies,
      document: {
        content:
          "Vercingétorix rencontre Jules César pour demander une trêve permettant le passage des habitants les plus vulnérables. Préparer les conditions du passage et les garanties réciproques.",
        location: "Plaine au pied de l’oppidum",
        schedule: { kind: "timed", start: daysFromNow(1, 10, 0), end: daysFromNow(1, 11, 0) },
        participants: [
          { kind: "contact", contactId: memberContactIds["Vercingétorix"] },
          { kind: "contact", contactId: caesarContactId },
        ],
      },
    },
    ["rendez-vous"],
  );
  await createWorkspaceResource(
    {
      kind: "event",
      name: "Commission ravitaillement et accueil : état des réserves",
      path: folders.supply,
      document: {
        content:
          "Examen de l’état des réserves du grenier, du relevé des distributions et des besoins des abris avant la prochaine séance du conseil.",
        location: "Maison commune de l’oppidum",
        schedule: { kind: "timed", start: daysFromNow(5, 18, 0), end: daysFromNow(5, 19, 30) },
        participants: ["Commius", "Convictolitavis", "Viridomaros", "Merlin"].map((firstName) => ({
          kind: "contact",
          contactId: memberContactIds[firstName],
        })),
      },
    },
    ["rendez-vous", "commission"],
  );

  console.log("- Tableurs");
  await createWorkspaceResource(
    {
      kind: "spreadsheet",
      name: "Chiffrage de la seconde ligne",
      path: folders.root,
      document: defenseCostingWorkbook(daysFromNow),
    },
    ["défense", "chiffrage"],
  );
  await importSpreadsheet({
    title: "Relevé des distributions de vivres",
    fileName: "releve-distributions-vivres.csv",
    folderPath: folders.supply,
    content: distributionCsv(daysFromNow),
    mediaType: "text/csv",
  });
  await importSpreadsheet({
    title: "Ouvrages romains observés",
    fileName: "ouvrages-romains-observes.xlsx",
    folderPath: folders.watch,
    content: romanWorksWorkbook(daysFromNow),
    mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  await importSpreadsheet({
    title: "Suivi des moyens de soutien",
    fileName: "suivi-moyens-soutien.xlsx",
    folderPath: folders.supportMeans,
    content: supportWorkbook(daysFromNow),
    mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  console.log("- Textes classés");
  const texts = [
    [
      folders.root,
      "Situation de l’oppidum",
      ["conseil"],
      "## Situation de l’oppidum\n\nLes lignes romaines resserrent l’étau autour d’Alésia. Vercingétorix réunit le conseil : garder le grenier, consolider les abris et obtenir des nouvelles des alliés.\n\nCommius prépare les messages tandis que Vercassivellaunos inspecte les défenses. Les pourparlers avec César porteront sur une trêve et le passage des habitants vulnérables ; aucun passage ne sera engagé avant accord sur les garanties.",
    ],
    [
      folders.council,
      "Travaux du conseil",
      ["conseil"],
      "## Travaux du conseil\n\nConvictolitavis rassemble les comptes rendus du conseil et tient le registre des délibérations.\n\nLes questions sur les abris restent à reprendre après la visite des charpentiers.",
    ],
    [
      folders.watch,
      "Consigne de relève des veilleurs",
      ["veille"],
      "## Consigne de relève\n\n1. La relève a lieu toutes les quatre heures, à partir du coucher du soleil.\n2. Le veilleur sortant inscrit au registre les feux, les mouvements et les travaux observés.\n3. Le chef de poste relit le registre chaque matin et le transmet à la maison commune.",
    ],
    [
      folders.reserveShelters,
      "Diagnostic des abris d’Alésia",
      ["abris"],
      "## Diagnostic des abris\n\nDeux couvertures sont affaissées près du grenier et laissent passer la pluie.\n\n- Abri nord : appuis fragilisés contre le mur nord.\n- Abri sud : deux poutres fendues, réutilisables pour moitié.\n\nUne visite des charpentiers doit préciser les réparations nécessaires avant attribution des matériaux.",
    ],
    [
      folders.supply,
      "Organisation de la distribution des vivres",
      ["ravitaillement"],
      "## Organisation proposée\n\nDeux points de distribution sont ouverts : au grenier pour les équipes, à l’abri nord pour les habitants.\n\nChaque distribution est inscrite au relevé avec la date, l’abri et le nombre de sacs. La répartition proposée reste soumise au conseil.",
    ],
    [
      folders.allies,
      "Note de liaison avec les alliés",
      ["alliés"],
      "## Note de liaison\n\nPréparer un message sur les besoins de ravitaillement et la coordination attendue.\n\nCommius rassemble les nouvelles des alliés ; Éporédorix vérifie les itinéraires des messagers. Le message ne mentionne ni le nombre de sacs restants ni l’identité des porteurs.",
    ],
    [
      folders.defense,
      "État des défenses - première ligne",
      ["défense"],
      "## Première ligne\n\nLe bilan relève trois secteurs à consolider :\n\n1. la porte ouest, où le portail ferme mal ;\n2. la courtine nord, dont la palissade penche sur vingt pas ;\n3. les abords du grenier, sans fossé sur la partie est.",
    ],
    [
      folders.defense,
      "Note de cadrage - défense du plateau",
      ["défense"],
      "## Objectif\n\nConsolider les accès des abris et la seconde ligne de défense d’Alésia.\n\n- Examiner les besoins en bois et en pierre.\n- Maintenir le passage des équipes de ravitaillement.\n- Présenter un bilan au conseil.",
    ],
    [
      folders.support,
      "Engagements des équipes de soutien",
      ["soutien"],
      "## Engagements\n\nChaque responsable d’équipe s’engage à tenir le compte des journées réalisées, à conserver les justificatifs de dépense et à signaler toute réaffectation entre équipes.",
    ],
    [
      folders.support,
      "Règlement de mise à disposition",
      ["soutien"],
      "## Mise à disposition des locaux\n\n- Inscrire les créneaux des équipes sur le registre commun.\n- Rendre les paniers et signaler les sacs abîmés.\n- Signaler tout besoin de réparation au gardien du grenier.",
    ],
    [
      folders.shelters,
      "Organisation des abris",
      ["abris"],
      "## Organisation des abris\n\n142 habitants sont accueillis : 78 à l’abri nord et 64 à l’abri sud.\n\nMerlin organise les soins près des sources ; Viridomaros recense les besoins en eau et en couvertures.",
    ],
    [
      folders.shelterCapacity,
      "Accueil des habitants - capacités de réserve",
      ["abris"],
      "## Capacités de réserve\n\nUne extension de 20 places est à étudier en déplaçant les cloisons de l’abri sud. Ce besoin reste une question préparée.",
    ],
    [
      folders.access,
      "Inventaire des chemins de liaison",
      ["convois"],
      "## Chemins de liaison\n\n| Chemin | Longueur | État |\n| --- | ---: | --- |\n| Grenier vers abri nord | 600 pas | Ornières près du grenier |\n| Embranchement vers abri sud | 350 pas | Pierres déchaussées |\n| Porte ouest vers grenier | 900 pas | Praticable |",
    ],
    [
      folders.access,
      "Consigne de circulation - accès d’Alésia",
      ["convois"],
      "## Consigne de circulation\n\nConserver un passage aux équipes de ravitaillement pendant les travaux de défense. Les chariots montent aux heures paires et descendent aux heures impaires.",
    ],
    [
      folders.proconsul,
      "Courrier au proconsul",
      ["proconsul", "courrier"],
      "## Courrier au proconsul\n\nÀ Jules César, proconsul.\n\nLe conseil de l’oppidum d’Alésia demande une trêve pour le passage des habitants les plus vulnérables : enfants, blessés et personnes âgées accueillis dans les abris.\n\nVercingétorix, maire d’Alésia, propose de vous rencontrer dans la plaine au pied de l’oppidum pour fixer les conditions du passage et les garanties réciproques. L’invitation au rendez-vous est jointe.\n\nPour le conseil, Convictolitavis l’Éduen, secrétaire.",
    ],
    [
      folders.reliefArmy,
      "Lettre de mission des chefs de l’armée de secours",
      ["armée de secours"],
      "## Lettre de mission\n\nL’assemblée des cités lève une armée de secours. Le conseil désigne pour le représenter auprès d’elle Commius l’Atrébate, Viridomaros l’Éduen, Éporédorix l’Éduen et Vercassivellaunos l’Arverne.\n\nIls rendent compte au conseil par les messagers de la motion de liaison.",
    ],
  ];
  for (const [path, name, tags, content] of texts) {
    await createWorkspaceResource({ kind: "text", name, path, content }, tags);
  }

  console.log("- Documents PDF, image et traitement de texte");
  const pdfs = [
    [
      folders.watch,
      "Registre des observations de la tour nord",
      "registre-tour-nord.pdf",
      [
        "REGISTRE DE LA TOUR DE GUET NORD",
        "Nuit 1 : trois feux à l’est, mouvement de cavalerie vers la ligne extérieure.",
        "Nuit 2 : travaux de terrassement au pied du coteau, environ quarante hommes.",
        "Nuit 3 : calme ; relève effectuée à l’heure.",
        "Nuit 4 : deux colonnes vers l’est, retour avant l’aube.",
      ],
    ],
    [
      folders.root,
      "Inventaire du grenier d’Alésia",
      "inventaire-grenier-alesia.pdf",
      [
        "INVENTAIRE DU GRENIER D’ALÉSIA",
        "Espace nord : 60 sacs de céréales.",
        "Espace sud : 40 sacs de céréales et une réserve gardée de 20 sacs.",
        "Stock total : 120 sacs, compté le matin par les deux gardiens.",
      ],
    ],
    [
      folders.reserves,
      "État des réserves d’Alésia",
      "etat-reserves-alesia.pdf",
      [
        "ÉTAT DES RÉSERVES",
        "Sorties des sept derniers jours : 14 sacs, dont 9 pour les abris et 5 pour les équipes.",
        "Consommation moyenne : 2 sacs par jour.",
        "Réserve gardée intacte : 20 sacs.",
      ],
    ],
    [
      folders.allies,
      "Itinéraires des messagers",
      "itineraires-messagers.pdf",
      [
        "ITINÉRAIRES REPÉRÉS PAR ÉPORÉDORIX",
        "Passage de l’est : une nuit de marche, surveillance renforcée après le coucher du soleil.",
        "Passage des bois du nord : deux nuits de marche, terrain couvert, gué à traverser.",
        "Recommandation : partir par les bois du nord à la nouvelle lune.",
      ],
    ],
    [
      folders.secondLine,
      "Rapport - renforcement de la seconde ligne",
      "rapport-seconde-ligne.pdf",
      [
        "RAPPORT DE VERCASSIVELLAUNOS",
        "La seconde ligne doit protéger les accès aux abris et préserver le passage des convois.",
        "Six secteurs sont concernés, de la porte ouest aux abords du grenier.",
        "Le dépôt de pierre sera déplacé au sud du chantier.",
        "Montant total : 282 quinaires d’argent séquanes, détaillé dans le chiffrage.",
      ],
    ],
    [
      folders.shelters,
      "Bilan des abris",
      "bilan-abris.pdf",
      [
        "BILAN DES ABRIS",
        "142 habitants accueillis : 78 à l’abri nord et 64 à l’abri sud.",
        "Besoins : 30 couvertures, protection de deux points d’eau, passage pour les blessés.",
        "Capacité complémentaire à étudier : 20 places.",
      ],
    ],
  ];
  for (const [folderPath, title, fileName, lines] of pdfs) {
    await uploadPdf({ title, fileName, folderPath, lines });
  }
  await uploadDocument({
    title: "Plan du plateau d’Alésia",
    fileName: "plan-plateau-alesia.png",
    folderPath: folders.access,
    content: plateauPlan(),
    mediaType: "image/png",
  });
  await uploadDocument({
    title: "Convention de mise à disposition",
    fileName: "convention-mise-a-disposition.docx",
    folderPath: folders.support,
    content: makeDocx(
      "Accord du grenier : Commius l’Atrébate met les espaces couverts à disposition des équipes. Vercassivellaunos l’Arverne examine les couvertures. Les porteurs rendent les paniers et signalent les sacs abîmés.",
    ),
    mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  console.log(
    `  ${texts.length} textes, ${pdfs.length} PDF, une image, un document Word, quatre tableurs, deux cartes`,
  );
}
