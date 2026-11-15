/**
 * Writes the files of the Foncine-le-Bas demonstration dataset: the PDF documents, the Word convention,
 * the demonstration logo and the stand-ins of the 21 scene images, rendered with Chromium (Playwright).
 * The plan of situation draws the Mont Noir road on IGN Plan tiles fetched from the Géoplateforme.
 *
 *   node scripts/seed/generate-foncine-le-bas-files.mjs [--reference-date 2026-11-15] [--skip-images]
 *
 * Dated documents follow the dataset calendar counted from the reference date (the load day « J »).
 * Names come from the dataset table. A delivered drawing `files/images/NN-title.png` replaces the stand-in
 * JPEG of scene NN, which this script then removes instead of rewriting it.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { makeStoredZip } from "./data/common/files.mjs";
import { guide } from "./data/datasets/foncine-le-bas/digital.mjs";
import { documentDays, illustrations, proxies } from "./data/datasets/foncine-le-bas/media.mjs";
import {
  associations,
  companies,
  demonstrationNotice,
  fullName,
  people,
} from "./data/datasets/foncine-le-bas/names.mjs";

const { values } = parseArgs({
  options: { "reference-date": { type: "string" }, "skip-images": { type: "boolean" } },
});
const reference = new Date(`${values["reference-date"] ?? "2026-11-15"}T12:00:00Z`);
const filesDirectory = new URL("./data/datasets/foncine-le-bas/files/", import.meta.url);
const documentsDirectory = new URL("documents/", filesDirectory);
const imagesDirectory = new URL("images/", filesDirectory);
mkdirSync(documentsDirectory, { recursive: true });
mkdirSync(imagesDirectory, { recursive: true });
const territory = JSON.parse(readFileSync(new URL("territory/territory.json", filesDirectory), "utf8"));

const day = (offset) => new Date(reference.getTime() + offset * 86_400_000);
const longDate = (offset) =>
  day(offset).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
const euro = (value) =>
  `${value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ /g, " ")} €`;
const year = day(0).getFullYear();

const style = `
  @page { margin: 18mm 18mm 22mm 18mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; font-size: 10.5pt; line-height: 1.45; }
  h1 { font-size: 15pt; margin: 18px 0 6px; color: #0f2a5c; }
  h2 { font-size: 12pt; margin: 16px 0 6px; color: #0f2a5c; }
  .head { display: flex; justify-content: space-between; border-bottom: 2px solid #334155; padding-bottom: 10px; margin-bottom: 14px; }
  .sender strong { font-size: 13pt; letter-spacing: .02em; }
  .muted { color: #64748b; font-size: 9pt; }
  .recipient { margin: 10px 0 18px auto; width: 48%; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  th, td { border: 1px solid #cbd5e1; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: #e2e8f0; font-size: 9.5pt; }
  td.n, th.n { text-align: right; white-space: nowrap; }
  tr.total td { font-weight: bold; background: #f1f5f9; }
  .sign { margin-top: 28px; width: 46%; margin-left: auto; }
  .stamp { border: 1px dashed #94a3b8; padding: 10px; margin-top: 10px; color: #64748b; font-size: 9pt; }
  .page { break-before: page; }
  .notice { border: 1px solid #94a3b8; padding: 6px 8px; font-size: 8.5pt; color: #475569; margin-top: 18px; }
`;
const footer = `<div style="font-family: Arial; font-size: 7.5pt; color: #64748b; width: 100%; padding: 0 18mm; display: flex; justify-content: space-between;"><span>${demonstrationNotice}</span><span style="white-space: nowrap; margin-left: 12px;">Page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
const html = (body, extraStyle = "") =>
  `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${style}${extraStyle}</style></head><body>${body}</body></html>`;
const companyHead = (company, lines) =>
  `<div class="head"><div class="sender"><strong>${company}</strong><br>${lines.join("<br>")}</div><div class="muted" style="text-align:right">Entreprise fictive<br>Démonstration de Hall</div></div>`;
const bodyHead = (organisation, lines) =>
  `<div class="head"><div class="sender"><strong>${organisation}</strong><br>${lines.join("<br>")}</div><div class="muted" style="text-align:right">En-tête de démonstration<br>sans logo</div></div>`;
const mairie = `Mairie de Foncine-le-Bas<br>39520 Foncine-le-Bas`;
const mayor = fullName("marchand");
const quoteTable = (rows, vatRate = 0.2) => {
  const total = rows.reduce((sum, [, quantity, , price]) => sum + quantity * price, 0);
  return `<table><tr><th>Désignation</th><th class="n">Quantité</th><th>Unité</th><th class="n">Prix unitaire HT</th><th class="n">Montant HT</th></tr>${rows
    .map(
      ([label, quantity, unit, price]) =>
        `<tr><td>${label}</td><td class="n">${quantity.toLocaleString("fr-FR")}</td><td>${unit}</td><td class="n">${euro(price)}</td><td class="n">${euro(quantity * price)}</td></tr>`,
    )
    .join(
      "",
    )}<tr class="total"><td colspan="4">Total HT</td><td class="n">${euro(total)}</td></tr><tr><td colspan="4">TVA ${vatRate * 100} %</td><td class="n">${euro(total * vatRate)}</td></tr><tr class="total"><td colspan="4">Total TTC</td><td class="n">${euro(total * (1 + vatRate))}</td></tr></table>`;
};
const quoteConditions = (delay) =>
  `<h2>Conditions</h2><ul><li>Validité de l’offre : trois mois.</li><li>Délai d’exécution : ${delay}, à compter de l’ordre de service.</li><li>Paiement par mandat administratif à trente jours, auprès du service de gestion comptable.</li><li>Prix fermes, révisables au-delà de six mois selon l’index TP09.</li></ul><div class="sign">Bon pour accord, date et signature de la commune :<div class="stamp">Cadre réservé à la mairie</div></div>`;

const documents = {
  "devis-terrassement-leclerc-varenne.pdf": () =>
    html(`${companyHead(companies.terrassement, ["Travaux publics, terrassement, assainissement", "Zone artisanale, 39300 Champagnole", `Contact : ${fullName("dubois")}`])}
<div class="recipient">${mairie}</div>
<h1>Devis n° ${year}-0412 · Voie communale du Mont Noir</h1>
<p class="muted">Établi le ${longDate(documentDays.quotes)} · Visite sur place avec la commune · Lot : terrassement</p>
<p>Objet : reprofilage de la chaussée et traitement des ornières sur 564 mètres, curage du fossé et reprise d’un accotement, voie communale qui dessert le lieu-dit le Mont Noir.</p>
${quoteTable([
  ["Installation de chantier, signalisation temporaire", 1, "forfait", 520],
  ["Reprofilage de la chaussée à la niveleuse", 564, "m", 4],
  ["Traitement des ornières, apport de grave 0/31,5", 26, "t", 34],
  ["Curage du fossé et évacuation des terres", 210, "m", 2.6],
  ["Reprise d’accotement affaissé, purge et grave", 18, "m", 27],
  ["Compactage et finitions", 1, "forfait", 108],
])}
<div class="page"></div>
<h2>Mode opératoire</h2>
<p>Les travaux se déroulent par tronçons d’environ 150 mètres. Un passage reste ouvert aux riverains et aux véhicules de secours en dehors des heures de compactage. Les terres de curage sont évacuées vers une installation autorisée.</p>
<h2>Moyens</h2><ul><li>Niveleuse, pelle de 14 tonnes, compacteur vibrant.</li><li>Équipe de trois personnes, chef de chantier présent.</li></ul>
${quoteConditions("cinq jours ouvrés")}`),
  "devis-busage-leclerc-varenne.pdf": () =>
    html(`${companyHead(companies.terrassement, ["Travaux publics, terrassement, assainissement", "Zone artisanale, 39300 Champagnole", `Contact : ${fullName("dubois")}`])}
<div class="recipient">${mairie}</div>
<h1>Devis n° ${year}-0413 · Busage sous la voie du Mont Noir</h1>
<p class="muted">Établi le ${longDate(documentDays.quotes)} · Lot : busage</p>
<p>Objet : remplacement de la buse en fin de vie sous l’entrée de pré, diamètre 400 mm, longueur 12 mètres, avec deux têtes de buse.</p>
${quoteTable([
  ["Dépose de la buse existante et évacuation", 1, "forfait", 380],
  ["Fourniture et pose de buse PEHD annelée Ø 400 mm", 12, "m", 98],
  ["Têtes de buse béton préfabriquées", 2, "u", 385],
  ["Remblai, compactage et réfection de surface", 1, "forfait", 324],
])}
${quoteConditions("deux jours ouvrés")}`),
  "devis-enrobe-bertrand.pdf": () =>
    html(`${companyHead(companies.revetements, ["Enrobés, revêtements, voirie", "Route de Lons, 39300 Champagnole", `Contact : ${fullName("bertrand")}`])}
<div class="recipient">${mairie}</div>
<h1>Devis n° RB-${year}-087 · Enrobé de la partie en pente</h1>
<p class="muted">Établi le ${longDate(documentDays.quotes)} · Lot : enrobé</p>
<p>Objet : mise en œuvre d’un enrobé à chaud 0/10 sur la partie en pente de la voie communale du Mont Noir, 160 mètres sur 3 mètres, soit 480 m².</p>
${quoteTable([
  ["Préparation du support, balayage, couche d’accrochage", 480, "m²", 3.1],
  ["Enrobé à chaud BBSG 0/10, 6 cm, mis en œuvre au finisseur", 480, "m²", 19.6],
  ["Joints de raccordement et rives", 1, "forfait", 520],
  ["Signalisation et gestion de la circulation", 1, "forfait", 484],
])}
<p class="muted">Soit 24,79 € HT le m² en moyenne pour 480 m².</p>
<div class="page"></div>
<h2>Fiche technique</h2>
<table><tr><th>Caractéristique</th><th>Valeur</th></tr><tr><td>Formule</td><td>Béton bitumineux semi-grenu 0/10</td></tr><tr><td>Épaisseur</td><td>6 cm après compactage</td></tr><tr><td>Température de mise en œuvre</td><td>150 à 170 °C</td></tr><tr><td>Conditions</td><td>Support sec, température extérieure supérieure à 5 °C</td></tr></table>
<h2>Organisation</h2><p>Intervention en une journée après les travaux de terrassement. Fermeture de la partie en pente pendant la mise en œuvre et le refroidissement, environ six heures ; un itinéraire de détour est proposé à la commune.</p>
${quoteConditions("une journée")}`),
  "devis-enrobe-moreau.pdf": () =>
    html(`${companyHead(companies.enrobes, ["Enrobés et travaux routiers", "39250 Nozeroy", `Contact : ${fullName("moreau")}`])}
<div class="recipient">${mairie}</div>
<h1>Devis n° EM ${year}/156 · Enrobé, voie du Mont Noir</h1>
<p class="muted">Établi le ${longDate(documentDays.quotes + 3)} · Lot : enrobé</p>
${quoteTable([
  ["Préparation du support et couche d’accrochage", 480, "m²", 3.4],
  ["Enrobé à chaud 0/10, 6 cm", 480, "m²", 22.1],
  ["Raccordements, rives et signalisation", 1, "forfait", 1160],
])}
${quoteConditions("deux journées")}`),
  "accuse-reception-detr.pdf": () =>
    html(`${bodyHead("PRÉFECTURE DU JURA", ["Direction de la citoyenneté et de la légalité", "Bureau des dotations de l’État", `Affaire suivie par ${fullName("aubry")}`])}
<div class="recipient">Madame la maire<br>${mairie}</div>
<p class="muted">Lons-le-Saunier, le ${longDate(documentDays.detrAcknowledgement)}</p>
<p><strong>Objet :</strong> dotation d’équipement des territoires ruraux, exercice ${year}. Accusé de réception de dossier complet.<br><strong>Opération :</strong> réfection de la voie communale du Mont Noir, 19 350 € HT.</p>
<p>Madame la maire,</p>
<p>J’accuse réception du dossier de demande de subvention au titre de la dotation d’équipement des territoires ruraux déposé par la commune de Foncine-le-Bas. Ce dossier est complet à la date du présent courrier.</p>
<p>Vous pouvez commencer l’opération à compter de cette date. Ce commencement ne préjuge pas de l’attribution de la subvention, qui fera l’objet d’un arrêté après l’avis de la commission d’élus.</p>
<p>Je vous prie d’agréer, Madame la maire, l’expression de ma considération distinguée.</p>
<div class="sign">Pour le préfet et par délégation,<br>la cheffe du bureau des dotations de l’État</div>
<div class="notice">Pièce fictive au nom d’un organisme réel, produite pour la démonstration de Hall. Elle ne reproduit aucun courrier de la préfecture du Jura.</div>`),
  "chiffrage-eclairage-sidec.pdf": () =>
    html(`${bodyHead("SIDEC DU JURA", ["Syndicat mixte d’énergies, d’équipements et de communication", "Service éclairage public", `Chargé d’opérations : ${fullName("faure")}`])}
<div class="recipient">Madame la maire<br>${mairie}</div>
<h1>Rénovation de l’éclairage public de Foncine-le-Bas · Chiffrage</h1>
<p class="muted">Remis le ${longDate(documentDays.lightingCosting)} · Montants fictifs</p>
<h2>1. Programme</h2><p>Remplacement des lanternes des 48 points lumineux par des lanternes à LED, pose d’horloges astronomiques dans les trois armoires de commande et mise en place d’un abaissement ou d’une extinction en milieu de nuit selon l’arrêté de la maire.</p>
<h2>2. Estimation</h2>
${quoteTable([
  ["Lanternes LED 25 W, crosse conservée", 40, "u", 460],
  ["Lanternes LED 35 W, traversée principale", 8, "u", 560],
  ["Horloges astronomiques et réfection des armoires", 3, "u", 1400],
  ["Main-d’œuvre, nacelle, mise en service", 1, "forfait", 2920],
  ["Maîtrise d’œuvre et coordination", 1, "forfait", 1200],
])}
<div class="page"></div>
<h2>3. Plan de financement</h2>
<table><tr><th>Financeur</th><th class="n">Montant</th><th class="n">Part</th></tr><tr><td>SIDEC du Jura</td><td class="n">${euro(12480)}</td><td class="n">40 %</td></tr><tr><td>Commune de Foncine-le-Bas</td><td class="n">${euro(18720)}</td><td class="n">60 %</td></tr><tr class="total"><td>Total HT</td><td class="n">${euro(31200)}</td><td class="n">100 %</td></tr></table>
<h2>4. Économies attendues</h2><p>La puissance installée passe de 4,6 kW à 1,4 kW. Avec une extinction de 23 h 00 à 5 h 00 hors traversée principale, la consommation annuelle estimée baisse d’environ 75 %.</p>
<div class="page"></div>
<h2>5. Calendrier indicatif</h2><table><tr><th>Étape</th><th>Délai</th></tr><tr><td>Délibération de la commune</td><td>À la prochaine séance</td></tr><tr><td>Commande des lanternes</td><td>Quatre semaines</td></tr><tr><td>Travaux</td><td>Deux semaines</td></tr><tr><td>Réglage des horloges</td><td>À la mise en service</td></tr></table>
<div class="notice">Pièce fictive au nom d’un organisme réel, produite pour la démonstration de Hall. Les montants, les taux et le mode d’intervention sont fictifs.</div>`),
  "etat-assiette-onf.pdf": () =>
    html(`${bodyHead("OFFICE NATIONAL DES FORÊTS", ["Agence territoriale du Jura", `Technicien forestier territorial : ${fullName("girard")}`])}
<div class="recipient">Madame la maire<br>${mairie}</div>
<h1>Forêt communale de Foncine-le-Bas · Proposition d’état d’assiette ${year + 1}</h1>
<p class="muted">Volumes fictifs, établis pour la démonstration</p>
<table><tr><th>Parcelle forestière</th><th>Nature de la coupe</th><th class="n">Surface (ha)</th><th class="n">Volume estimé (m³)</th><th>Destination proposée</th></tr>
<tr><td>Roche Blanche, 1</td><td>Amélioration feuillus</td><td class="n">4,2</td><td class="n">120</td><td>Affouage</td></tr>
<tr><td>Roche Blanche, 2</td><td>Amélioration résineux</td><td class="n">3,9</td><td class="n">210</td><td>Vente en bloc et sur pied</td></tr>
<tr><td>La Louvatière</td><td>Éclaircie</td><td class="n">1,2</td><td class="n">45</td><td>Affouage</td></tr>
<tr class="total"><td colspan="2">Total</td><td class="n">9,3</td><td class="n">375</td><td></td></tr></table>
<div class="page"></div>
<h2>Affouage</h2><p>Les coupes destinées à l’affouage sont délivrées aux habitants inscrits selon le règlement fixé par le conseil municipal, qui désigne trois garants. Le martelage est proposé avec un élu de la commune.</p>
<h2>Délibération attendue</h2><ul><li>Approbation de l’état d’assiette des coupes.</li><li>Destination des coupes et mode de vente.</li><li>Règlement de l’affouage et désignation des garants.</li></ul>
<div class="notice">Pièce fictive au nom d’un organisme réel, produite pour la démonstration de Hall. Elle ne reproduit aucun document de l’Office national des forêts.</div>`),
  "devis-mobilier-promenade.pdf": () =>
    html(`${companyHead(companies.mobilier, ["Mobilier urbain en bois du Jura", "39150 Saint-Laurent-en-Grandvaux"])}
<div class="recipient">${mairie}</div>
<h1>Devis n° ${year}-31 · Départ de promenade, Parking de la Tram’Jurassienne</h1>
${quoteTable([
  ["Table de pique-nique en mélèze, bancs attenants", 1, "u", 690],
  ["Banc en mélèze avec dossier", 1, "u", 340],
  ["Pupitre d’information sous petit toit, impression comprise", 1, "u", 370],
])}
${quoteConditions("quatre semaines")}`),
  "devis-menuiseries-salle.pdf": () =>
    html(`${companyHead(companies.menuiseries, ["Menuiseries bois et aluminium", "39300 Champagnole"])}
<div class="recipient">${mairie}</div>
<h1>Devis n° M-${year}-219 · Salle communale, remplacement des menuiseries</h1>
${quoteTable([
  ["Fenêtres bois double vitrage 120 × 140, petits bois", 6, "u", 1180],
  ["Porte d’entrée vitrée, seuil accessible", 1, "u", 2350],
  ["Dépose, évacuation et finitions", 1, "forfait", 980],
])}
${quoteConditions("six semaines après validation des cotes")}`),
  "rapport-activite-communaute-de-communes.pdf": () => {
    const chapters = [
      [
        "Le territoire",
        "La communauté de communes réunit des communes rurales du plateau et de la montagne. Ce rapport présente l’activité de l’année écoulée à l’intention des conseils municipaux (CGCT, L5211-39).",
      ],
      [
        "Les compétences",
        "Développement économique, aménagement de l’espace, collecte et traitement des déchets, accueil des gens du voyage, gestion des milieux aquatiques et prévention des inondations, tourisme.",
      ],
      [
        "Les finances",
        "Le budget principal et les budgets annexes sont présentés en fonctionnement et en investissement. Les montants de ce document sont fictifs.",
      ],
      [
        "Les déchets",
        "Organisation de la collecte, déchèteries, prévention et tri. Les tonnages de ce document sont fictifs.",
      ],
      [
        "Le tourisme et les sentiers",
        "Entretien et balisage des itinéraires de promenade, en lien avec le parc naturel régional du Haut-Jura et les communes.",
      ],
      ["L’enfance et la jeunesse", "Accueils de loisirs et actions en direction des familles du territoire."],
      [
        "Les projets de l’année à venir",
        "Programme d’investissement, schémas en cours et calendrier des conseils communautaires.",
      ],
    ];
    return html(`${bodyHead("COMMUNAUTÉ DE COMMUNES CHAMPAGNOLE NOZEROY JURA", [`Rapport d’activité ${year - 1}`, `Contact : ${fullName("michel")}`])}
<h1>Rapport d’activité ${year - 1}</h1><p>Document de présentation fictif, sans logo, produit pour la démonstration de Hall.</p>
<div class="notice">Pièce fictive au nom d’un organisme réel. Les chiffres, les projets et les actions décrits sont fictifs.</div>
${chapters
  .map(
    ([title, text], index) =>
      `<div class="page"></div><h1>${index + 1}. ${title}</h1><p>${text}</p><table><tr><th>Indicateur</th><th class="n">Valeur fictive</th></tr><tr><td>Actions conduites</td><td class="n">${12 + index * 3}</td></tr><tr><td>Communes concernées</td><td class="n">${20 + index}</td></tr><tr><td>Budget consacré</td><td class="n">${euro(85000 + index * 21000)}</td></tr></table>`,
  )
  .join("")}`);
  },
  "proces-verbal-installation.pdf": () =>
    html(`${bodyHead("COMMUNE DE FONCINE-LE-BAS", ["Conseil municipal", `Séance d’installation de mars ${2026}`])}
<h1>Procès-verbal de l’installation du conseil municipal</h1>
<p>Les membres du conseil municipal élus au scrutin de liste lors des élections municipales générales de mars 2026 se sont réunis en mairie pour l’installation du conseil.</p>
<h2>Installation des conseillers</h2><p>${Object.keys(people).slice(0, 11).map(fullName).join(", ")}.</p>
<h2>Élection de la maire</h2><p>${mayor} est élue maire au premier tour à la majorité absolue.</p>
<h2>Nombre et élection des adjoints</h2><p>Le conseil fixe à deux le nombre des adjoints. ${fullName("garnier")} est élu premier adjoint et ${fullName("renaud")} deuxième adjointe.</p>
<h2>Lecture de la charte de l’élu local</h2><p>La maire donne lecture de la charte de l’élu local et en remet une copie à chaque conseiller.</p>
<div class="notice">Procès-verbal fictif. Les élus nommés sont des personnages de la démonstration de Hall.</div>`),
  "courrier-riverains-mont-noir.pdf": () =>
    html(
      `<div class="letter"><p style="text-align:right">Foncine-le-Bas, le ${longDate(documentDays.residentLetter)}</p>
<p>${fullName("simon")}</p>
<p style="margin-left:45%">Madame la maire<br>Mairie de Foncine-le-Bas</p>
<p>Madame la maire,</p>
<p>J’emprunte souvent la petite route du Mont Noir et je constate que la chaussée s’use : des ornières se creusent du côté est, le fossé se remplit et l’eau passe sur la route quand il pleut. Le bord s’est aussi un peu affaissé dans le virage.</p>
<p>Je me permets de vous demander si des travaux sont prévus sur cette route, et à quel moment.</p>
<p>Je vous remercie de l’attention que vous porterez à ce courrier et vous prie d’agréer, Madame la maire, mes salutations respectueuses.</p>
<p style="margin-left:55%">${fullName("simon")}</p></div>
<div class="notice">Lettre fictive, écrite pour la démonstration de Hall.</div>`,
      `body { background: #f7f5ef; } .letter { font-family: "Bradley Hand", "Segoe Script", cursive; font-size: 15pt; line-height: 1.7; color: #1f2f5c; transform: rotate(-0.4deg); }`,
    ),
};
/** Minimal Markdown of the guide: headings, paragraphs, bold. */
const guideHtml = guide
  .split("\n\n")
  .map((block) => {
    const inline = block.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replaceAll("’", "’");
    if (block.startsWith("### ")) return `<h2>${inline.slice(4)}</h2>`;
    if (block.startsWith("## ")) return `<h1>${inline.slice(3)}</h1>`;
    return `<p>${inline}</p>`;
  })
  .join("");
documents["guide-prise-en-main-hall.pdf"] = () =>
  html(
    `${bodyHead("COMMUNE DE FONCINE-LE-BAS", ["Prise en main de Hall", `Élue référente : ${fullName("morin")}`])}${guideHtml}`,
  );
for (const { meeting, giver, holder, file } of proxies) {
  documents[file] = () =>
    html(`${bodyHead("COMMUNE DE FONCINE-LE-BAS", ["Conseil municipal"])}
<h1>Pouvoir</h1>
<p>Je soussigné(e) ${fullName(giver)}, conseiller(ère) municipal(e) de Foncine-le-Bas, empêché(e) d’assister à la séance n° ${meeting} du conseil municipal, donne pouvoir à ${fullName(holder)}, conseiller(ère) municipal(e), de voter en mon nom (CGCT, L2121-20).</p>
<p>Ce pouvoir vaut pour cette seule séance.</p>
<div class="sign">Fait à Foncine-le-Bas<br><br><span style="font-family: 'Bradley Hand', cursive; font-size: 16pt; color: #1f2f5c">${fullName(giver)}</span></div>
<div class="notice">Pouvoir fictif, démonstration de Hall.</div>`);
}

/** The A3 plan of situation: IGN Plan tiles and the drawn road, in Web Mercator pixels at one zoom. */
function situationPlan() {
  const zoom = 16;
  const project = ([lon, lat]) => {
    const scale = 256 * 2 ** zoom;
    const x = ((lon + 180) / 360) * scale;
    const sin = Math.sin((lat * Math.PI) / 180);
    const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
    return [x, y];
  };
  const road = territory.montNoir.line.map(project);
  const slope = territory.montNoir.slope.map(project);
  const culvert = project(territory.montNoir.culvert);
  const width = 1500;
  const height = 930;
  const centre = road.reduce(([sx, sy], [x, y]) => [sx + x / road.length, sy + y / road.length], [0, 0]);
  const left = centre[0] - width / 2;
  const top = centre[1] - height / 2;
  const tiles = [];
  for (let tx = Math.floor(left / 256); tx <= Math.floor((left + width) / 256); tx += 1)
    for (let ty = Math.floor(top / 256); ty <= Math.floor((top + height) / 256); ty += 1)
      tiles.push(
        `<img style="position:absolute;left:${tx * 256 - left}px;top:${ty * 256 - top}px;width:256px;height:256px" src="https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX=${zoom}&TILEROW=${ty}&TILECOL=${tx}&FORMAT=image/png">`,
      );
  const points = (line) => line.map(([x, y]) => `${x - left},${y - top}`).join(" ");
  return html(
    `<div style="display:flex;justify-content:space-between;align-items:flex-end"><div><strong style="font-size:15pt">COMMUNE DE FONCINE-LE-BAS · PLAN DE SITUATION</strong><br>Réfection de la voie communale du Mont Noir · 564 m · échelle indicative 1/5 000</div><div class="muted">Fond : Plan IGN v2, IGN, Licence Ouverte 2.0</div></div>
<div style="position:relative;width:${width}px;height:${height}px;overflow:hidden;border:1px solid #334155;margin-top:8px">${tiles.join("")}
<svg width="${width}" height="${height}" style="position:absolute;left:0;top:0"><polyline points="${points(road)}" fill="none" stroke="#1d4ed8" stroke-width="9" stroke-linecap="round" opacity=".85"/><polyline points="${points(slope)}" fill="none" stroke="#b91c1c" stroke-width="9" stroke-linecap="round"/><circle cx="${culvert[0] - left}" cy="${culvert[1] - top}" r="12" fill="#ffffff" stroke="#0f172a" stroke-width="4"/></svg>
<div style="position:absolute;right:16px;bottom:16px;background:#ffffffee;border:1px solid #334155;padding:10px 14px;font-size:10pt;line-height:1.6"><strong>Légende</strong><br><span style="color:#1d4ed8">━━</span> Voie communale du Mont Noir, 564 m : reprofilage, ornières, fossé, accotement<br><span style="color:#b91c1c">━━</span> Partie en pente, 160 m : enrobé 0/10, 480 m²<br>◯ Buse Ø 400 mm à remplacer<br><span class="muted">Dessins et états fictifs, démonstration de Hall</span></div></div>`,
    "@page { size: A3 landscape; margin: 12mm; }",
  );
}
documents["plan-situation-chemin-mont-noir.pdf"] = situationPlan;

function wordConvention() {
  const paragraph = (text, { bold = false, size = 22, align, pageBreak = false } = {}) =>
    `<w:p><w:pPr>${align ? `<w:jc w:val="${align}"/>` : ""}<w:spacing w:after="160"/></w:pPr>${pageBreak ? '<w:r><w:br w:type="page"/></w:r>' : ""}<w:r><w:rPr>${bold ? "<w:b/>" : ""}<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${text.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</w:t></w:r></w:p>`;
  const heading = (text, options = {}) => paragraph(text, { bold: true, size: 26, ...options });
  const cell = (text, bold = false) =>
    `<w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr>${paragraph(text, { bold })}</w:tc>`;
  const table = (rows) =>
    `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>${rows
      .map((row, index) => `<w:tr>${row.map((value) => cell(value, index === 0)).join("")}</w:tr>`)
      .join("")}</w:tbl>`;
  const body = [
    paragraph("COMMUNE DE FONCINE-LE-BAS", { bold: true, size: 24, align: "center" }),
    heading("Convention d’occupation temporaire du Champ de Mars et de prêt du matériel communal", { align: "center" }),
    paragraph(demonstrationNotice, { size: 18, align: "center" }),
    heading("Entre les soussignés"),
    paragraph(
      `La commune de Foncine-le-Bas, représentée par sa maire, ${mayor}, autorisée par délibération du conseil municipal, ci-après « la commune » ;`,
    ),
    paragraph(
      `Et l’association ${associations.champDeMars}, représentée par son président ou sa présidente en exercice, ci-après « l’association ».`,
    ),
    heading("Article 1 · Objet"),
    paragraph(
      "La présente convention autorise l’association à occuper le terrain communal du Champ de Mars pour l’organisation du vide-grenier et du marché aux fleurs de la mi-juin, et fixe les conditions du prêt du matériel communal.",
    ),
    heading("Article 2 · Durée"),
    paragraph(
      "L’occupation vaut pour la journée de la manifestation, montage la veille à partir de 14 h 00 et démontage le lendemain avant 12 h 00.",
    ),
    heading("Article 3 · Redevance", { pageBreak: true }),
    paragraph(
      "L’occupation est consentie à titre gratuit, la manifestation ayant un objet d’intérêt local et ne poursuivant aucun but lucratif.",
    ),
    heading("Article 4 · Matériel prêté"),
    table([
      ["Matériel", "Quantité"],
      ["Tables pliantes", "20"],
      ["Bancs", "30"],
      ["Barrières de police", "12"],
      ["Coffret électrique de chantier", "1"],
    ]),
    heading("Article 5 · Obligations de l’association"),
    paragraph(
      "L’association assure la sécurité de la manifestation, le respect des emplacements, la propreté du terrain et la restitution du matériel en bon état. Elle souscrit une assurance de responsabilité civile.",
    ),
    heading("Article 6 · Circulation et stationnement", { pageBreak: true }),
    paragraph("La maire prend les arrêtés de circulation et de stationnement nécessaires le jour de la manifestation."),
    heading("Article 7 · Résiliation"),
    paragraph(
      "La commune peut résilier la convention pour un motif d’intérêt général, sans indemnité, en prévenant l’association au moins quinze jours à l’avance.",
    ),
    paragraph("Fait à Foncine-le-Bas, en deux exemplaires."),
    table([
      ["Pour la commune", "Pour l’association"],
      [`La maire, ${mayor}`, "Le président ou la présidente"],
    ]),
  ].join("");
  return makeStoredZip([
    [
      "[Content_Types].xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ],
    [
      "_rels/.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ],
    [
      "word/document.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418"/></w:sectPr></w:body></w:document>`,
    ],
  ]);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const [file, render] of Object.entries(documents)) {
    await page.setContent(render(), { waitUntil: "load", timeout: 120_000 });
    const a3 = file.startsWith("plan-situation");
    const pdf = await page.pdf({
      format: a3 ? "A3" : "A4",
      landscape: a3,
      printBackground: true,
      displayHeaderFooter: !a3,
      headerTemplate: "<span></span>",
      footerTemplate: footer,
      preferCSSPageSize: true,
    });
    writeFileSync(new URL(file, documentsDirectory), pdf);
    console.log(`  ${file}`);
  }
  writeFileSync(new URL("convention-champ-de-mars.docx", documentsDirectory), wordConvention());
  console.log("  convention-champ-de-mars.docx");

  await page.setViewportSize({ width: 600, height: 160 });
  await page.setContent(
    html(
      `<div style="width:600px;height:160px;display:flex;align-items:center;gap:18px;font-family:Arial;background:#fff"><div style="width:120px;height:120px;border:4px solid #1e3a8a;display:flex;align-items:center;justify-content:center;font-size:44px;font-weight:bold;color:#1e3a8a;margin-left:10px">FB</div><div><div style="font-size:30px;font-weight:bold;color:#0f172a;letter-spacing:.04em">FONCINE-LE-BAS</div><div style="font-size:18px;color:#475569">Démonstration</div></div></div>`,
      "body{margin:0}",
    ),
  );
  writeFileSync(new URL("logo-demonstration.png", filesDirectory), await page.screenshot({ type: "png" }));
  console.log("  logo-demonstration.png");

  if (!values["skip-images"]) {
    await page.setViewportSize({ width: 1600, height: 1200 });
    const delivered = (number) =>
      readdirSync(imagesDirectory).some(
        (name) => name.startsWith(`${String(number).padStart(2, "0")}-`) && name.endsWith(".png"),
      );
    for (const { number, standIn: file, title } of illustrations) {
      const target = new URL(file, imagesDirectory);
      if (delivered(number)) {
        if (existsSync(target)) rmSync(target);
        continue;
      }
      await page.setContent(
        html(
          `<div style="width:1600px;height:1200px;background:linear-gradient(160deg,#cbd5e1,#94a3b8);display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Arial;color:#0f172a"><div style="font-size:48px;color:#334155">Image ${number} sur 21</div><div style="font-size:92px;font-weight:bold;margin:30px 80px;text-align:center">${title}</div><div style="font-size:40px;color:#334155">Image provisoire, remplacée par le dessin de la scène</div></div>`,
          "body{margin:0}",
        ),
      );
      writeFileSync(target, await page.screenshot({ type: "jpeg", quality: 82 }));
      console.log(`  images/${file}`);
    }
  }
} finally {
  await browser.close();
}
