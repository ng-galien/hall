import { makeXlsx } from "../../common/files.mjs";
import { associations, companies } from "./names.mjs";

const header = { bl: 1, bg: { rgb: "#e2e8f0" } };
const money = { n: { pattern: "#,##0.00 €" } };
const integer = { n: { pattern: "#,##0" } };
const column = (index) => String.fromCharCode(65 + index);

/**
 * A Hall spreadsheet document. Each sheet gives its column titles and rows; a cell is a value or
 * { f: "=formula", v: value, s?: style }; `total` adds a last row summing the listed columns.
 */
function workbook(id, name, sheets) {
  const built = {};
  for (const sheet of sheets) {
    const cellData = { 0: Object.fromEntries(sheet.columns.map((title, index) => [index, { v: title, s: header }])) };
    sheet.rows.forEach((row, rowIndex) => {
      cellData[rowIndex + 1] = Object.fromEntries(
        row.map((cell, index) => {
          const style = sheet.styles?.[index];
          if (cell !== null && typeof cell === "object") return [index, { ...(style ? { s: style } : {}), ...cell }];
          return [index, { v: cell, ...(style ? { s: style } : {}) }];
        }),
      );
    });
    if (sheet.total) {
      const last = sheet.rows.length + 1;
      cellData[last] = {
        0: { v: "Total", s: { bl: 1 } },
        ...Object.fromEntries(
          sheet.total.map((index) => [
            index,
            {
              f: `=SUM(${column(index)}2:${column(index)}${last})`,
              v: sheet.rows.reduce((sum, row) => sum + (typeof row[index] === "object" ? row[index].v : row[index]), 0),
              s: { bl: 1, ...(sheet.styles?.[index] ?? {}) },
            },
          ]),
        ),
      };
    }
    built[sheet.id] = {
      id: sheet.id,
      name: sheet.name,
      rowCount: Math.max(40, sheet.rows.length + 10),
      columnCount: Math.max(8, sheet.columns.length + 2),
      cellData,
      rowData: { 0: { h: 30 } },
      columnData: Object.fromEntries(sheet.columns.map((_, index) => [index, { w: sheet.widths?.[index] ?? 130 }])),
      mergeData: [],
      showGridlines: 1,
    };
  }
  return {
    schemaVersion: 2,
    workbook: {
      id,
      name,
      appVersion: "0.25.1",
      locale: "frFR",
      styles: {},
      sheetOrder: sheets.map((sheet) => sheet.id),
      sheets: built,
    },
  };
}
const product = (row, quantityIndex, priceIndex, excelRow) => ({
  f: `=${column(quantityIndex)}${excelRow}*${column(priceIndex)}${excelRow}`,
  v: Math.round(row[quantityIndex] * row[priceIndex] * 100) / 100,
});

export function roadBudget() {
  const lines = [
    ["Terrassement", "Installation de chantier, signalisation temporaire", "forfait", 1, 520, companies.terrassement],
    ["Terrassement", "Reprofilage de la chaussée", "m", 564, 4, companies.terrassement],
    ["Terrassement", "Traitement des ornières, grave 0/31,5", "t", 26, 34, companies.terrassement],
    ["Terrassement", "Curage du fossé et évacuation", "m", 210, 2.6, companies.terrassement],
    ["Terrassement", "Reprise d’accotement affaissé", "m", 18, 27, companies.terrassement],
    ["Terrassement", "Compactage et finitions", "forfait", 1, 108, companies.terrassement],
    ["Busage", "Dépose de la buse existante", "forfait", 1, 380, companies.terrassement],
    ["Busage", "Buse PEHD Ø 400 mm", "m", 12, 98, companies.terrassement],
    ["Busage", "Têtes de buse béton", "u", 2, 385, companies.terrassement],
    ["Busage", "Remblai et réfection de surface", "forfait", 1, 324, companies.terrassement],
    ["Enrobé", "Préparation du support, couche d’accrochage", "m²", 480, 3.1, companies.revetements],
    ["Enrobé", "Enrobé à chaud BBSG 0/10, 6 cm", "m²", 480, 19.6, companies.revetements],
    ["Enrobé", "Joints de raccordement et rives", "forfait", 1, 520, companies.revetements],
    ["Enrobé", "Signalisation et gestion de la circulation", "forfait", 1, 484, companies.revetements],
    ["Divers", "Arrêté de circulation et information des riverains", "forfait", 1, 0, "Mairie"],
    ["Divers", "Réunion d’information des habitants", "forfait", 1, 0, "Mairie"],
  ];
  return workbook("foncine-road-budget", "Budget prévisionnel de la réfection", [
    {
      id: "postes",
      name: "Postes",
      columns: ["Poste", "Désignation", "Unité", "Quantité", "Prix unitaire HT", "Montant HT", "Entreprise"],
      widths: [110, 300, 70, 80, 130, 120, 220],
      styles: { 3: integer, 4: money, 5: money },
      rows: lines.map((row, index) => [row[0], row[1], row[2], row[3], row[4], product(row, 3, 4, index + 2), row[5]]),
      total: [5],
    },
    {
      id: "financement",
      name: "Financement",
      columns: ["Financeur", "Montant HT", "Part"],
      widths: [320, 130, 80],
      styles: { 1: money, 2: { n: { pattern: "0%" } } },
      rows: [
        ["État, DETR (demandée)", 5805, { f: "=B2/B5", v: 0.3 }],
        ["Département du Jura, aide à la voirie communale (demandée)", 3870, { f: "=B3/B5", v: 0.2 }],
        ["Commune, autofinancement", 9675, { f: "=B4/B5", v: 0.5 }],
      ],
      total: [1],
    },
  ]);
}

export function lightingInventory(points) {
  const streetName = {
    "RTE NATIONALE": "Route nationale (traversée)",
    "RTE DE CHAMPAGNOLE": "Route de Champagnole",
    "CHE DE L'EGLISE": "Chemin de l’Église",
    "CHE DU MOULIN": "Chemin du Moulin",
    "CHE DE LA TANNERIE": "Chemin de la Tannerie",
    "CHE DES BROUGEONS": "Chemin des Brougeons",
    "LOT LES ROCQUERIES": "Lotissement les Rocqueries",
    "PL DU CHALET": "Place du Chalet",
  };
  return workbook("foncine-lighting", "Parc d’éclairage public", [
    {
      id: "points",
      name: "Points lumineux",
      columns: [
        "Point",
        "Rue",
        "Lanterne actuelle",
        "Puissance actuelle (W)",
        "Puissance après rénovation (W)",
        "Heures par an",
        "Économie annuelle (kWh)",
        "Extinction 23 h – 5 h",
      ],
      widths: [70, 220, 170, 150, 190, 100, 160, 140],
      styles: { 3: integer, 4: integer, 5: integer, 6: integer },
      rows: points.map((point, index) => {
        const before = point.main ? 150 : 100;
        const after = point.main ? 35 : 25;
        const hours = point.main ? 4100 : 1900;
        return [
          `EP ${String(index + 1).padStart(2, "0")}`,
          streetName[point.street] ?? point.street,
          point.main ? "Sodium haute pression" : "Ballon fluorescent",
          before,
          after,
          hours,
          { f: `=(D${index + 2}-E${index + 2})*F${index + 2}/1000`, v: ((before - after) * hours) / 1000 },
          point.main ? "Non, traversée éclairée" : "Oui",
        ];
      }),
      total: [6],
    },
  ]);
}

export function associationGrants() {
  const rows = [
    [associations.summerFestival, "Fête patronale du dernier dimanche de juillet", 450, 450, 500],
    [associations.champDeMars, "Vide-grenier et marché aux fleurs de la mi-juin", 350, 400, 400],
    [associations.elders, "Rencontres et repas des aînés", 250, 250, 250],
  ];
  return workbook("foncine-grants", "Subventions aux associations", [
    {
      id: "subventions",
      name: "Subventions",
      columns: ["Association", "Objet", "Avant-dernier exercice", "Exercice précédent", "Exercice en cours"],
      widths: [260, 330, 150, 150, 150],
      styles: { 2: money, 3: money, 4: money },
      rows,
      total: [2, 3, 4],
    },
  ]);
}

export function ruralPathsInventory() {
  const paths = [
    ["Chemin de la Grand’Vie", 680, "Empierrement de deux passages ravinés", 1],
    ["Chemin de la Grange à l’Olive, partie haute", 632, "Curage des renvois d’eau", 1],
    ["Chemin sur les Replats", 955, "Fauchage des abords", 1],
    ["Chemin de Combe Maria", 249, "Empierrement", 1],
    ["Chemin des Serrettes, pont sur la Sainette", 40, "Garde-corps à repeindre et resceller", 1],
    ["Chemin de la Cingerneaux, partie empierrée", 410, "Reprise de la bande de roulement", 2],
    ["Chemin du Rapoutier Dessous", 727, "Curage du fossé", 2],
    ["Chemin des Brougeons, prolongement", 340, "Fauchage des abords", 2],
    ["Chemin de Combe David", 402, "Renvois d’eau", 2],
    ["Chemin du Lac à la Dame, abords", 300, "Fauchage, aucun travaux dans la zone humide", 2],
    ["Chemin du Tatchet n° 1", 87, "Empierrement", 3],
    ["Chemin du Tatchet n° 2", 227, "Empierrement", 3],
    ["Chemin du Moulin, partie empierrée", 108, "Curage", 3],
    ["Chemin des Douanets, partie empierrée", 67, "Reprofilage", 3],
    ["Chemin de la Grand’Vie, partie basse", 384, "Fauchage des abords", 3],
    ["Chemin de la Grange à l’Olive, partie basse", 520, "Renvois d’eau", 3],
  ];
  return workbook("foncine-rural-paths", "Inventaire des chemins ruraux", [
    {
      id: "chemins",
      name: "Chemins",
      columns: ["Chemin ou tronçon", "Longueur (m)", "Travaux d’entretien", "Année du programme"],
      widths: [320, 110, 320, 150],
      styles: { 1: integer },
      rows: paths.map(([name, length, work, year]) => [name, length, work, `Année ${year}`]),
      total: [1],
    },
  ]);
}

/** Budget execution workbook imported as an XLSX file: chapter, article, planned, realised, remaining. */
export function budgetExecutionXlsx() {
  const lines = [
    ["011", "60611", "Eau et assainissement", 1200, 940],
    ["011", "60612", "Énergie, électricité", 9500, 7820],
    ["011", "60621", "Combustibles", 6500, 5100],
    ["011", "60632", "Fournitures de petit équipement", 2500, 1890],
    ["011", "615231", "Entretien de voiries", 8000, 6450],
    ["011", "615221", "Entretien de bâtiments publics", 5000, 3120],
    ["011", "6156", "Maintenance", 2800, 2400],
    ["011", "6161", "Assurances", 3600, 3600],
    ["011", "6232", "Fêtes et cérémonies", 1500, 980],
    ["011", "6261", "Frais d’affranchissement", 600, 410],
    ["011", "6262", "Frais de télécommunications", 1400, 1150],
    ["012", "6411", "Personnel titulaire", 42000, 34500],
    ["012", "6413", "Personnel non titulaire", 6000, 5200],
    ["012", "6451", "Cotisations à l’URSSAF", 9500, 7900],
    ["65", "6531", "Indemnités des élus", 19000, 15800],
    ["65", "6554", "Contributions aux organismes de regroupement", 14500, 14500],
    ["65", "6574", "Subventions aux associations", 1150, 1150],
    ["66", "66111", "Intérêts des emprunts", 1800, 1350],
    ["023", "023", "Virement à la section d’investissement", 12900, 0],
    ["21", "2151", "Réseaux de voirie, opération Voirie", 23220, 0],
    ["21", "21534", "Réseaux d’électrification, opération Éclairage public", 19000, 0],
    ["21", "2188", "Autres immobilisations, opération Promenade", 1680, 0],
    ["16", "1641", "Remboursement du capital des emprunts", 7400, 5550],
  ];
  return makeXlsx(
    [
      ["Chapitre", "Article", "Libellé", "Prévu (€)", "Réalisé (€)", "Reste (€)"],
      ...lines.map(([chapter, article, label, planned, realised]) => [
        chapter,
        article,
        label,
        planned,
        realised,
        planned - realised,
      ]),
    ],
    "Exécution",
  );
}

/** Firewood lots imported as a CSV file, numbered, without any inhabitant name. */
export function firewoodLotsCsv() {
  const rows = [["Lot", "Parcelle forestière", "Essence", "Volume (stères)", "Garant", "État"]];
  const sectors = ["Roche Blanche, 1", "Roche Blanche, 1", "La Louvatière", "Roche Blanche, 1"];
  for (let lot = 1; lot <= 18; lot += 1) {
    rows.push([
      `Lot ${String(lot).padStart(2, "0")}`,
      sectors[lot % sectors.length],
      lot % 3 === 0 ? "Frêne" : "Hêtre",
      String(8 + (lot % 4)),
      ["Garant 1", "Garant 2", "Garant 3"][lot % 3],
      lot <= 12 ? "Attribué" : "Disponible",
    ]);
  }
  return Buffer.from(`${rows.map((row) => row.join(";")).join("\n")}\n`);
}
