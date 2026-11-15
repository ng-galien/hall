import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { mediaTypeOf } from "../../common/api.mjs";
import { accountsTracker, guide, presentationNote } from "./digital.mjs";
import { communalParcelLayer, communalParcels, mapDefinitions, riversideParcels, territory } from "./maps.mjs";
import { documents, folders, illustrations, imageFile, proxies } from "./media.mjs";
import { associations, companies, demonstrationNotice, fullName, mapNotice } from "./names.mjs";
import {
  associationGrants,
  budgetExecutionXlsx,
  firewoodLotsCsv,
  lightingInventory,
  roadBudget,
  ruralPathsInventory,
} from "./workbooks.mjs";

const documentFile = (file) => new URL(`./files/documents/${file}`, import.meta.url);
const folderColors = {
  [folders.roads]: "#1D4ED8",
  [folders.lighting]: "#60A5FA",
  [folders.finances]: "#475569",
  [folders.forest]: "#14532D",
  [folders.walk]: "#15803D",
};
const legalArticles = [
  ["L2121-2", "Code général des collectivités territoriales"],
  ["L2121-10", "Code général des collectivités territoriales"],
  ["L2121-11", "Code général des collectivités territoriales"],
  ["L2121-14", "Code général des collectivités territoriales"],
  ["L2121-15", "Code général des collectivités territoriales"],
  ["L2121-17", "Code général des collectivités territoriales"],
  ["L2121-20", "Code général des collectivités territoriales"],
  ["L2121-21", "Code général des collectivités territoriales"],
  ["L2131-1", "Code général des collectivités territoriales"],
  ["L2131-11", "Code général des collectivités territoriales"],
  ["L1111-10", "Code général des collectivités territoriales"],
  ["L2212-2", "Code général des collectivités territoriales"],
  ["L141-8", "Code de la voirie routière"],
  ["L161-1", "Code rural et de la pêche maritime"],
  ["L243-1", "Code forestier"],
  ["L361-1", "Code de l’environnement"],
];

/**
 * Seeds the documents, media, spreadsheets, maps, layers, calendar, mail drafts and personal notes of the
 * dataset, and completes the reports with their references. Returns the resources the scenarios use.
 */
export async function seedResources(api, { daysFromNow, members, contacts, groups, businesses, password }) {
  const { post, createWorkspaceResource, createGeographicResource, uploadFile } = api;
  const attach = async (businessKey, resource) => {
    if (!businessKey || !resource) return;
    await post(`/council-business/${businesses[businessKey].id}/resources`, { resourceId: resource.id });
  };
  const resources = {};

  console.log("- Documents de la commune et pièces des affaires");
  for (const document of documents) {
    resources[document.title] = await uploadFile({
      title: document.title,
      file: documentFile(document.file),
      folderPath: document.folder,
      tags: document.tags,
    });
    await attach(document.business, resources[document.title]);
  }
  resources.proxies = {};
  for (const proxy of proxies) {
    resources.proxies[proxy.meeting] = await uploadFile({
      title: `Pouvoir de ${fullName(proxy.giver)} à ${fullName(proxy.holder)}, séance n° ${proxy.meeting}`,
      file: documentFile(proxy.file),
      folderPath: folders.council,
      tags: ["droit"],
    });
  }
  await uploadFile({
    title: "Logo de démonstration",
    file: new URL("./files/logo-demonstration.png", import.meta.url),
    folderPath: folders.guide,
    tags: ["photo"],
  });

  console.log("- Images des affaires");
  const technician = await api.signIn("technique@foncine-le-bas.example", password);
  const councillor = await api.signIn("nicolas.garnier@foncine-le-bas.example", password);
  const images = {};
  for (const { number, title, business } of illustrations) {
    const file = imageFile(number);
    const folder = number === 1 ? folders.root : (businesses[business]?.folderPath ?? folders.council);
    const uploader = [1, 2, 3, 5].includes(number) ? technician : api;
    if (number === 4) {
      const personal = `Espaces personnels/${fullName("garnier")}`;
      images[number] = await councillor.uploadFile({ title, file, folderPath: personal, tags: ["photo"] });
      images[number] = await api.patch(`/resources/${images[number].id}/location`, {
        path: businesses.montNoir.folderPath,
        name: title,
      });
    } else {
      images[number] = await uploader.uploadFile({ title, file, folderPath: folder, tags: ["photo"] });
    }
    if (businesses[business]) await attach(business, images[number]);
  }

  console.log("- Tableurs");
  resources.budget = await createWorkspaceResource(
    { kind: "spreadsheet", name: "Budget prévisionnel de la réfection", path: folders.root, document: roadBudget() },
    ["voirie", "budget", "devis"],
  );
  await attach("montNoir", resources.budget);
  await attach(
    "lighting",
    await createWorkspaceResource(
      {
        kind: "spreadsheet",
        name: "Parc d’éclairage public",
        path: folders.lighting,
        document: lightingInventory(territory.lighting.points),
      },
      ["éclairage"],
    ),
  );
  await attach(
    "festivals",
    await createWorkspaceResource(
      {
        kind: "spreadsheet",
        name: "Tableau des subventions aux associations",
        path: folders.festivals,
        document: associationGrants(),
      },
      ["associations", "budget"],
    ),
  );
  await attach(
    "ruralPaths",
    await createWorkspaceResource(
      {
        kind: "spreadsheet",
        name: "Inventaire des chemins ruraux",
        path: folders.ruralPaths,
        document: ruralPathsInventory(),
      },
      ["chemins"],
    ),
  );
  await attach(
    "digital",
    await createWorkspaceResource(
      {
        kind: "spreadsheet",
        name: "Suivi des comptes et de la formation",
        path: folders.digital,
        document: accountsTracker(),
      },
      ["conseil", "personnel"],
    ),
  );
  await attach(
    "finances",
    await api.importSpreadsheet({
      title: "Exécution du budget principal",
      fileName: "execution-budget-principal.xlsx",
      folderPath: folders.finances,
      content: budgetExecutionXlsx(),
      mediaType: mediaTypeOf("x.xlsx"),
    }),
  );
  await attach(
    "forest",
    await api.importSpreadsheet({
      title: "Relevé des lots d’affouage",
      fileName: "releve-lots-affouage.csv",
      folderPath: folders.forest,
      content: firewoodLotsCsv(),
      mediaType: "text/csv",
    }),
  );

  console.log("- Cartes, couche des parcelles riveraines et parcelles de la commune");
  const maps = {};
  for (const definition of mapDefinitions()) {
    maps[definition.key] = await createGeographicResource({
      name: definition.name,
      path: definition.folder,
      tags: definition.tags,
      view: definition.view,
      layers: definition.layers,
      hallLayer: { type: "FeatureCollection", legend: definition.legend, features: definition.features },
    });
    await attach(definition.key, maps[definition.key]);
    for (const note of definition.notes) {
      const created = await api.createDrawingNote(maps[definition.key].id, note.feature.id);
      const noteId = created.noteId;
      let image = "";
      if (note.image) {
        const file = imageFile(note.image);
        const asset = await api.uploadEditorAsset({
          ownerId: noteId,
          title: illustrations[note.image - 1].title,
          fileName: basename(fileURLToPath(file)),
          content: readFileSync(file),
          mediaType: mediaTypeOf(fileURLToPath(file)),
        });
        image = `\n\n::image[${illustrations[note.image - 1].title}]{#${asset.id} align="center" width="100"}`;
      }
      await api.updateText(noteId, `${note.text}${image}\n\n*${mapNotice}.*\n`);
    }
  }
  const layer = await api.importGeographicLayer({
    name: "Parcelles riveraines",
    path: folders.montNoir,
    fileName: "parcelles-riveraines.geojson",
    content: riversideParcels(),
    geographicResourceId: maps.montNoir.id,
  });
  await attach("montNoir", layer);
  const communalLayer = await api.importGeographicLayer({
    name: "Parcelles de la commune",
    path: folders.forest,
    fileName: "parcelles-communales.geojson",
    content: communalParcelLayer(),
    geographicResourceId: maps.forest.id,
  });
  await attach("forest", communalLayer);
  await api.put(`/resources/${maps.montNoir.id}/overlays`, { layerId: communalLayer.id, visible: true, opacity: 0.6 });
  await api.importMunicipalProperty({
    label: "Parcelles de la commune, DGFiP, fichier des parcelles des personnes morales, situation 2025",
    list: communalParcels(),
  });

  console.log("- Textes");
  const member = (key) => `:member[${fullName(key)}]{#${members[key].id}}`;
  const contact = (key) => `:contact[${fullName(key)}]{#${contacts[key]}}`;
  const link = (title) => `:resource[${title}]{#${resources[title].id}}`;
  const texts = [
    [
      folders.root,
      "Présentation de la commune",
      null,
      ["conseil"],
      `## Foncine-le-Bas

Commune du Jura (code INSEE 39227, code postal 39520), 203 habitants (population légale), 9,19 km² entre 730 et 1 181 mètres d’altitude. La Saine traverse le village ; les ruisseaux de la Sainette, du Galavo, de la Senge et du Lac la rejoignent. Environ la moitié du territoire est boisée et plus d’un tiers en pâturages.

La commune est membre de la communauté de communes Champagnole Nozeroy Jura, du SIDEC du Jura, du syndicat mixte du parc naturel régional du Haut-Jura et du syndicat horticole et d’embellissement de la région de Champagnole. Le conseil municipal compte onze membres.

> ${demonstrationNotice}`,
    ],
    [
      folders.montNoir,
      "Comparatif des devis",
      "montNoir",
      ["devis", "voirie"],
      `## Comparatif des devis · voie communale du Mont Noir

| Poste | ${companies.terrassement} | ${companies.revetements} | ${companies.enrobes} | Délai |
| --- | ---: | ---: | ---: | --- |
| Terrassement | 4 800 € HT | | | 5 jours |
| Busage | 2 650 € HT | | | 2 jours |
| Enrobé 0/10, 480 m² | | 11 900 € HT | 13 400 € HT | 1 à 2 jours |

L’offre la moins chère est retenue pour chaque poste : ${link("Devis · Terrassement")}, ${link("Devis · Busage")}, ${link("Devis · Enrobé")}. Total retenu : 19 350 € HT, soit 23 220 € TTC.`,
    ],
    [
      folders.montNoir,
      "Réponse de la maire",
      "montNoir",
      ["courrier", "voirie"],
      `## Votre courrier sur le chemin du Mont Noir

À ${contact("simon")}

Monsieur,

Je vous remercie de votre courrier sur l’état de la voie communale du Mont Noir. Le conseil municipal examinera un programme d’entretien de cette voie : reprofilage, curage du fossé, reprise de l’accotement et enrobé sur la partie en pente. Une réunion d’information des habitants sera organisée avant les travaux.

Je vous prie d’agréer, Monsieur, mes salutations distinguées.

${member("marchand")}, maire`,
    ],
    [
      folders.montNoir,
      "Compte rendu de la commission Voirie",
      "montNoir",
      ["commission", "voirie"],
      `## Commission Voirie · réunion du ${new Date(daysFromNow(-9)).toLocaleDateString("fr-FR")}

Présents : ${member("marchand")}, ${member("garnier")}, ${member("lefort")}, ${member("roussel")}, ${member("carre")}.

${member("garnier")} présente le comparatif des devis et le plan de financement. La commission rend un **avis favorable** à l’attribution des travaux et recommande une organisation par tronçons, qui laisse toujours un passage aux riverains et aux véhicules de secours.`,
    ],
    [
      folders.lighting,
      "Projet d’arrêté d’extinction",
      "lighting",
      ["éclairage", "droit"],
      `## Arrêté portant extinction de l’éclairage public en milieu de nuit

La maire de Foncine-le-Bas,

Vu le code général des collectivités territoriales, notamment ses articles L2212-1 et L2212-2 ;

Vu la délibération du conseil municipal approuvant le principe d’une extinction en milieu de nuit ;

**Arrête :**

1. L’éclairage public est éteint de 23 h 00 à 5 h 00 sur l’ensemble des voies de la commune.
2. La traversée principale du village (route nationale et route de Champagnole) reste éclairée toute la nuit.
3. L’éclairage peut être maintenu lors des fêtes et manifestations publiques.`,
    ],
    [
      folders.finances,
      "Décision modificative n° 1",
      "finances",
      ["budget"],
      `## Décision modificative n° 1 · budget principal

| Section | Article | Libellé | Montant |
| --- | --- | --- | ---: |
| Fonctionnement, dépenses | 023 | Virement à la section d’investissement | + 12 900 € |
| Fonctionnement, dépenses | 615231 | Entretien de voiries | − 12 900 € |
| Investissement, recettes | 021 | Virement de la section de fonctionnement | + 12 900 € |
| Investissement, dépenses | 2151 | Opération « Voirie » | + 11 220 € |
| Investissement, dépenses | 2188 | Opération « Promenade » | + 1 680 € |`,
    ],
    [
      folders.finances,
      "Note de la commission Finances",
      "finances",
      ["commission", "budget"],
      `## Note de la commission Finances

${member("robert")}, rapporteure, présente la décision modificative n° 1 : elle porte l’opération « Voirie » à 23 220 € TTC pour le chemin du Mont Noir et ouvre 1 680 € TTC pour le départ de promenade. Le virement de la section de fonctionnement reste dans les marges de l’entretien courant.`,
    ],
    [
      folders.forest,
      "Règlement de l’affouage",
      "forest",
      ["forêt"],
      `## Règlement de l’affouage

1. **Inscription.** Les habitants de la commune s’inscrivent en mairie jusqu’au 31 décembre.
2. **Lots.** Les lots sont numérotés et tirés au sort ; un lot par foyer.
3. **Délais.** Le bois est façonné avant le 15 avril et sorti avant le 30 septembre.
4. **Garants.** Trois garants désignés par le conseil veillent au respect du règlement.
5. **Sécurité.** Chaque affouagiste porte les équipements de protection et respecte les consignes de l’ONF.`,
    ],
    [
      folders.festivals,
      "Inventaire du matériel prêté",
      "festivals",
      ["associations", "fêtes"],
      `## Inventaire du matériel communal prêté

| Matériel | Quantité | État |
| --- | ---: | --- |
| Tables pliantes | 20 | Bon |
| Bancs | 30 | Bon |
| Barrières de police | 12 | Deux à repeindre |
| Coffret électrique de chantier | 1 | Vérifié |
| Chapiteau 5 × 8 m | 1 | Bon |`,
    ],
    [
      folders.festivals,
      "Arrêté de circulation, fête patronale",
      "festivals",
      ["fêtes", "droit"],
      `## Arrêté de circulation et de stationnement · fête patronale

La maire de Foncine-le-Bas, vu le code général des collectivités territoriales, notamment son article L2213-1,

**Arrête :** la circulation et le stationnement sont réglementés le dernier dimanche de juillet, de 8 h 00 à 24 h 00, aux abords du pré de la fête. Une déviation est signalée. Modèle annuel : les dates sont reprises chaque année.`,
    ],
    [
      folders.festivals,
      "Programme de fleurissement",
      "festivals",
      ["fêtes"],
      `## Programme de fleurissement

- Massifs devant la mairie et au monument aux morts.
- Jardinières de la traversée du village.
- Calendrier : plantation après les dernières gelées, arrosage par l’emploi saisonnier, bilan à l’automne avec le syndicat horticole.`,
    ],
    [
      folders.buildings,
      "Règlement de la salle communale",
      "buildings",
      ["bâtiments"],
      `## Règlement de la salle communale

1. **Réservation** en mairie, au moins quinze jours à l’avance.
2. **Caution** de 300 € par chèque, rendue après l’état des lieux.
3. **Ménage** à la charge de l’occupant ; tables et chaises rangées.
4. **Associations du village** : prêt gratuit pour leurs activités.`,
    ],
    [
      folders.staff,
      "Fiche de poste saisonnier",
      "staff",
      ["personnel"],
      `## Fiche de poste · adjoint technique saisonnier

- **Missions** : entretien des espaces publics, tonte, arrosage du fleurissement, petits travaux de voirie.
- **Durée** : six mois au plus sur douze mois, à temps complet.
- **Encadrement** : ${contact("leroy")}, adjoint technique territorial.`,
    ],
    [folders.digital, "Note de présentation au conseil", "digital", ["conseil"], presentationNote],
    [folders.digital, "Guide de prise en main remis aux élus", "digital", ["conseil"], guide],
  ];
  const textOrder = (entry) => (entry[2] === "montNoir" ? 1 : 0);
  for (const [path, name, business, tags, content] of [...texts].sort((a, b) => textOrder(a) - textOrder(b))) {
    resources[name] = await createWorkspaceResource({ kind: "text", name, path, content }, tags);
    await attach(business, resources[name]);
  }

  console.log("- Liens et références officielles");
  for (const [name, path, target, business] of [
    [
      "Code général des collectivités territoriales",
      folders.root,
      "https://www.legifrance.gouv.fr/codes/id/LEGITEXT000006070633/",
      null,
    ],
    [
      "Code de la voirie routière",
      folders.guide,
      "https://www.legifrance.gouv.fr/codes/id/LEGITEXT000006070667/",
      "montNoir",
    ],
    ["Itinéraires du parc naturel régional du Haut-Jura", folders.walk, "https://www.parc-haut-jura.fr/", "walk"],
    ["Documentation de Hall", folders.digital, `${new URL(api.baseUrl).origin}/app/docs`, "digital"],
  ]) {
    await attach(
      business,
      await createWorkspaceResource({ kind: "remote", name, path, target: { kind: "url", url: target } }, ["droit"]),
    );
  }
  const legal = {};
  for (const [article, code] of legalArticles) {
    try {
      const [match] = await post("/resources/legal-references/search", {
        query: `${code} ${article}`,
        effectiveAt: null,
      });
      if (!match) throw new Error(`aucun résultat Légifrance pour ${article}`);
      const draft = await createWorkspaceResource({ kind: "legalReference", name: match.title, path: folders.legal }, [
        "droit",
      ]);
      await post(`/resources/${draft.id}/legal-reference/resolve`, {
        title: match.title,
        provider: match.provider,
        referenceKind: match.referenceKind,
        fund: match.fund,
        versionId: match.versionId,
        effectiveAt: match.effectiveAt,
      });
      legal[article] = draft;
    } catch (error) {
      console.warn(
        `  Référence juridique ${code} ${article} non créée : ${error instanceof Error ? error.message.slice(0, 80) : String(error)}`,
      );
    }
  }
  await attach("montNoir", legal["L141-8"]);
  await attach("montNoir", legal["L1111-10"]);
  await attach("digital", legal["L2121-10"]);

  console.log("- Rapport du chemin du Mont Noir : photo insérée, carte incluse, renvois");
  const report = businesses.montNoir.reportResourceId;
  const rutFile = imageFile(1);
  const rutAsset = await api.uploadEditorAsset({
    ownerId: report,
    title: "Ornière, côté est",
    fileName: basename(fileURLToPath(rutFile)),
    content: readFileSync(rutFile),
    mediaType: mediaTypeOf(fileURLToPath(rutFile)),
  });
  await api.updateText(
    report,
    businesses.montNoir.definition.report({
      photo: `::image[Ornière, côté est]{#${rutAsset.id} align="center" width="75"}`,
      letter: link("Courrier des riverains"),
      garnier: member("garnier"),
      bertrand: contact("bertrand"),
      l1418: legal["L141-8"] ? `:resource[article L141-8]{#${legal["L141-8"].id}}` : "article L141-8",
      quotes: [link("Devis · Terrassement"), link("Devis · Busage"), link("Devis · Enrobé")].join(", "),
      plan: link("Plan de situation"),
      map: `::resource-embed[Carte du chemin communal]{#${maps.montNoir.id} presentation="map"}`,
    }),
  );

  console.log("- Dossiers des affaires, couleurs et étiquettes");
  for (const [path, color] of Object.entries(folderColors)) await api.updateFolder(path, { color });

  console.log("- Calendrier");
  const at = (days, hour, minute) => daysFromNow(days, hour, minute);
  const people = (...keys) => keys.map((key) => ({ kind: "contact", contactId: contacts[key] }));
  const councilMembers = Object.keys(members);
  const events = [
    [
      "Rendez-vous sur place, chemin du Mont Noir",
      folders.montNoir,
      "montNoir",
      "Bas de la voie communale du Mont Noir",
      { kind: "timed", start: at(-12, 9, 30), end: at(-12, 10, 30) },
      [
        ...people("garnier", "leroy", "bertrand"),
        { kind: "guest", name: `Le conducteur de travaux de ${companies.revetements}` },
      ],
      "Repérage de la partie en pente, du fossé et de la buse avec l’entreprise d’enrobé.",
    ],
    [
      "Commission Finances",
      folders.finances,
      "finances",
      "Salle du conseil, mairie",
      { kind: "timed", start: at(-35, 18, 30), end: at(-35, 20, 0) },
      people("marchand", "renaud", "robert", "durand", "mathieu"),
      "Décision modificative n° 1.",
    ],
    [
      "Commission Voirie",
      folders.montNoir,
      "montNoir",
      "Salle du conseil, mairie",
      { kind: "timed", start: at(-9, 18, 30), end: at(-9, 20, 0) },
      people("marchand", "garnier", "lefort", "roussel", "carre"),
      "Attribution des travaux du chemin du Mont Noir, calendrier.",
    ],
    [
      "Fermeture du secrétariat (formation du CNFPT)",
      folders.root,
      null,
      "Mairie",
      { kind: "allDay", start: at(4, 12, 0).slice(0, 10), end: at(5, 12, 0).slice(0, 10) },
      people("colin"),
      "Le secrétariat de mairie est fermé toute la journée.",
    ],
    [
      "Martelage en forêt communale",
      folders.forest,
      "forest",
      "Forêt communale, secteur de Roche Blanche",
      { kind: "timed", start: at(6, 9, 0), end: at(6, 12, 0) },
      people("garnier", "girard"),
      "Martelage des coupes de l’exercice avec l’ONF.",
    ],
    [
      "Commission Vie locale",
      folders.festivals,
      "festivals",
      "Salle du conseil, mairie",
      { kind: "timed", start: at(9, 18, 30), end: at(9, 20, 0) },
      people("marchand", "renaud", "morin", "durand", "fontaine"),
      "Fête patronale, fleurissement, salle communale.",
    ],
    [
      "Calendrier de l’éclairage avec le SIDEC",
      folders.lighting,
      "lighting",
      "Mairie",
      { kind: "timed", start: at(9, 18, 30), end: at(9, 19, 30) },
      people("garnier", "faure"),
      "Calendrier des travaux de rénovation de l’éclairage public.",
    ],
    [
      "Préparation de la fête patronale",
      folders.festivals,
      "festivals",
      "Salle communale",
      { kind: "timed", start: at(11, 18, 30), end: at(11, 20, 0) },
      [...people("renaud"), ...Object.keys(associations).map((key) => ({ kind: "contact", contactId: contacts[key] }))],
      "Programme, matériel prêté, arrêté de circulation.",
    ],
    [
      "Réunion d’information des habitants",
      folders.montNoir,
      "montNoir",
      "Salle communale",
      { kind: "timed", start: at(16, 18, 30), end: at(16, 20, 0) },
      people("marchand", "garnier"),
      "Présentation des travaux du chemin du Mont Noir et de leur calendrier.",
    ],
    [
      "Réunion sur le programme de fleurissement",
      folders.festivals,
      "festivals",
      "Mairie",
      { kind: "timed", start: at(20, 18, 0), end: at(20, 19, 0) },
      people("durand", "renaud"),
      "Réunion avec le syndicat horticole.",
    ],
    [
      "Séance de prise en main de Hall",
      folders.digital,
      "digital",
      "Salle du conseil, mairie",
      { kind: "timed", start: at(-42, 18, 30), end: at(-42, 20, 30) },
      people(...councilMembers, "colin"),
      "Prise en main de Hall par les élus : connexion, Accueil, documents, agenda, séances.",
    ],
    [
      "Séance complémentaire : Hall sur le téléphone",
      folders.digital,
      "digital",
      "Salle du conseil, mairie",
      { kind: "timed", start: at(18, 18, 30), end: at(18, 20, 0) },
      people(...councilMembers),
      "Installer l’application sur le téléphone, recevoir la convocation, ouvrir le dossier de séance.",
    ],
    [
      "Préparation de la prochaine cérémonie commémorative",
      folders.festivals,
      "festivals",
      "Salle du conseil, mairie",
      { kind: "timed", start: at(30, 18, 30), end: at(30, 19, 30) },
      people(...councilMembers),
      "Organisation de la cérémonie au monument aux morts.",
    ],
  ];
  const calendar = {};
  for (const [name, path, business, location, schedule, participants, content] of events) {
    calendar[name] = await createWorkspaceResource(
      { kind: "event", name, path, document: { content, location, schedule, participants } },
      ["rendez-vous"],
    );
    await attach(business, calendar[name]);
  }

  console.log("- Courriels en brouillon");
  const fromGroup = (group) => group.members.map((entry) => ({ kind: "to", ...entry }));
  const drafts = [
    [
      "Réunion d’information sur les travaux du chemin du Mont Noir",
      fromGroup(groups.council),
      "Plan de situation",
      `Bonjour,\n\nLa réunion d’information des habitants sur les travaux du chemin du Mont Noir aura lieu à la salle communale. Vous trouverez le plan de situation en pièce jointe.\n\nBien cordialement,\n\n${fullName("colin")}`,
    ],
    [
      "Votre courrier sur le chemin du Mont Noir",
      [],
      "Réponse de la maire",
      "Monsieur,\n\nVous trouverez ci-joint la réponse de la maire à votre courrier.\n\nBien cordialement,",
    ],
    [
      "Prêt du matériel pour la fête patronale",
      fromGroup(groups.associations),
      "Inventaire du matériel prêté",
      "Bonjour,\n\nVoici l’inventaire du matériel communal prêté pour la fête patronale. Merci de nous indiquer vos besoins.\n\nBien cordialement,",
    ],
  ];
  for (const [subject, recipients, attachment, bodyMarkdown] of drafts) {
    const resource = resources[attachment];
    if (resource.kind === "document") {
      const created = await post("/mail", { subject, bodyMarkdown, recipients });
      await post(`/mail/${created.id}/attachments`, { expectedRevision: created.revision, resourceId: resource.id });
    } else {
      const text = await api.get(`/resources/${resource.id}`);
      const prepared = await post("/mail/prepare", { kind: "pdf", title: attachment, bodyMarkdown: text.content });
      await api.put(`/mail/${prepared.id}`, { subject, bodyMarkdown, recipients, expectedRevision: prepared.revision });
    }
  }
  await post(`/resources/${calendar["Rendez-vous sur place, chemin du Mont Noir"].id}/event-invitation`, {
    method: "request",
  });

  console.log("- Dossiers personnels");
  const personalNotes = [
    [
      "garnier",
      councillor,
      "Visite du chemin du Mont Noir",
      `## Visite du chemin du Mont Noir\n\n- Fossé à curer sur environ 210 mètres.\n- Partie en pente : 160 mètres, enrobé prévu.\n- Proposer une organisation par tronçons pour garder un passage.\n- Photo de la buse prise sur place, transmise au secrétariat.`,
    ],
    [
      "morin",
      await api.signIn("laure.morin@foncine-le-bas.example", password),
      "Questions pour la séance n° 4",
      `## Questions pour la séance n° 4\n\n1. Quel passage reste ouvert pendant les travaux du chemin ?\n2. Quelle date pour la réunion d’information des habitants ?`,
    ],
  ];
  const personal = [];
  for (const [key, client, name, content] of personalNotes) {
    personal.push(
      await client.createWorkspaceResource(
        { kind: "text", name, path: `Espaces personnels/${fullName(key)}`, content },
        [],
      ),
    );
  }
  return { resources, images, maps, calendar, legal, personal };
}
