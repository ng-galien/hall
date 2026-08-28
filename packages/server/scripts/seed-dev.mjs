/**
 * Seed de développement — commune fictive de Saint-Aubin.
 *
 * Peuple le serveur via l'API HTTP (jamais en SQL direct) :
 * membres, ressources classées par chemins, topics, délibérations,
 * une séance passée entièrement déroulée (présences, pouvoirs, scrutins),
 * une séance à venir programmée et une séance en préparation.
 *
 * Prérequis : serveur de dev démarré (npm run dev) sur une base vide.
 */
import { randomUUID } from "node:crypto";

const API = process.env.SEED_API ?? "http://127.0.0.1:3100/api";
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "Mairie-demo-2026!";

function unwrapRepresentation(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.class)) return payload;
  if (Array.isArray(payload.properties?.items)) return payload.properties.items;
  if (payload.class.some((name) => name.endsWith("-collection")) && Array.isArray(payload.entities)) {
    return payload.entities.map((entity) => entity.properties);
  }
  return payload.properties ?? payload;
}

async function request(method, path, body) {
  const init = { method };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const response = await fetch(`${API}${path}`, init);
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : unwrapRepresentation(await response.json());
}
const get = (path) => request("GET", path);
const post = (path, body) => request("POST", path, body);
const put = (path, body) => request("PUT", path, body);

/** Génère un PDF A4 d'une page (Helvetica, WinAnsi) sans dépendance. */
function makePdf(title, lines) {
  const esc = (text) =>
    text
      .replace(/—/g, "-")
      .replace(/’/g, "'")
      .replace(/œ/g, "oe")
      .replace(/…/g, "...")
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");
  let y = 760;
  const ops = [`BT /F1 16 Tf 56 792 Td (${esc(title)}) Tj ET`];
  for (const line of lines) {
    ops.push(`BT /F1 11 Tf 56 ${y} Td (${esc(line)}) Tj ET`);
    y -= 18;
  }
  const content = ops.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

async function uploadPdf({ title, fileName, folderPath = "", meetingId, category, lines }) {
  const form = new FormData();
  form.set("title", title);
  form.set("folderPath", folderPath);
  if (meetingId) form.set("meetingId", meetingId);
  form.set("category", category);
  form.set("file", new File([makePdf(title, lines)], fileName, { type: "application/pdf" }));
  return request("POST", "/resources/documents", form);
}

const daysFromNow = (days, hour = 18, minute = 30) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};

async function main() {
  const inspectedCollections = await Promise.all([
    get("/council-members"),
    get("/users"),
    get("/resources"),
    get("/topics"),
    get("/council-decisions"),
    get("/council-meetings"),
  ]);
  if (inspectedCollections.some((items) => items.length > 0)) {
    console.error("La base n'est pas vide : seed annulé. Supprimez packages/server/data/mairie.sqlite et relancez.");
    process.exit(1);
  }

  console.log("— Membres du conseil");
  const membersSpec = [
    ["Martine", "Delcourt", "mayor"],
    ["Bernard", "Lefèvre", "deputyMayor"],
    ["Sophie", "Renaud", "deputyMayor"],
    ["Patrick", "Morel", "deputyMayor"],
    ["Isabelle", "Charpentier", "councillor"],
    ["Jean-Marc", "Baudry", "councillor"],
    ["Claire", "Vasseur", "councillor"],
    ["Thierry", "Lambert", "councillor"],
    ["Nadia", "Benali", "councillor"],
    ["François", "Guérin", "councillor"],
    ["Élodie", "Marchand", "councillor"],
    ["Didier", "Rousseau", "councillor"],
    ["Catherine", "Petit", "councillor"],
    ["Olivier", "Fontaine", "councillor"],
    ["Sylvie", "Garnier", "councillor"],
  ];
  const members = {};
  for (const [firstName, lastName, role] of membersSpec) {
    members[lastName] = await post("/council-members", {
      firstName,
      lastName,
      role,
      email: `${firstName
        .toLowerCase()
        .normalize("NFD")
        .replace(/[^a-z-]/g, "")}.${lastName
        .toLowerCase()
        .normalize("NFD")
        .replace(/[^a-z-]/g, "")}@saint-aubin.fr`,
      termStartedOn: "2026-03-15",
    });
  }

  console.log("— Utilisateurs, rôles et rattachements au conseil");
  const usersSpec = [
    {
      email: "martine.delcourt@saint-aubin.fr",
      displayName: "Martine Delcourt",
      roles: ["administrator"],
      councilMemberId: members.Delcourt.id,
    },
    {
      email: "secretariat@saint-aubin.fr",
      displayName: "Secrétariat de mairie",
      roles: ["clerk"],
      councilMemberId: null,
    },
    {
      email: "jean-marc.baudry@saint-aubin.fr",
      displayName: "Jean-Marc Baudry",
      roles: ["contributor"],
      councilMemberId: members.Baudry.id,
    },
    {
      email: "bernard.lefevre@saint-aubin.fr",
      displayName: "Bernard Lefèvre",
      roles: ["meetingConductor"],
      councilMemberId: members.Lefèvre.id,
    },
    {
      email: "claire.vasseur@saint-aubin.fr",
      displayName: "Claire Vasseur",
      roles: ["reader"],
      councilMemberId: members.Vasseur.id,
    },
  ];
  for (const user of usersSpec) await post("/users", { ...user, password: DEMO_PASSWORD });
  for (const user of usersSpec) {
    const authenticated = await post("/auth/login", { email: user.email, password: DEMO_PASSWORD });
    if (
      authenticated.email !== user.email ||
      user.roles.some((role) => !authenticated.roles.includes(role))
    ) {
      throw new Error(`Le compte de démonstration ${user.email} ne restitue pas les rôles attendus`);
    }
  }
  console.log(`  Mot de passe de démonstration : ${DEMO_PASSWORD}`);

  console.log("— Ressources (textes et documents)");
  const noteCadrage = await post("/resources/texts", {
    title: "Note de cadrage — éclairage public",
    folderPath: "travaux/eclairage",
    tags: ["travaux", "éclairage"],
    content:
      "## Objectif\n\nRemplacer les 240 luminaires restants par des LED d'ici fin 2027.\n\n- Tranche 2 : centre-bourg et abords de l'école\n- Économie attendue : **38 %** sur la consommation\n- Subvention SDE sollicitée : 40 % du montant HT",
  });
  const reglementCantine = await post("/resources/texts", {
    title: "Règlement intérieur de la cantine",
    folderPath: "ecole/cantine",
    tags: ["école", "cantine"],
    content:
      "## Inscription\n\nL'inscription se fait au trimestre via le portail famille.\n\n## Tarification\n\nLes tarifs sont fixés par délibération du conseil municipal selon le quotient familial.",
  });
  const rapportEclairage = await uploadPdf({
    title: "Rapport — éclairage public tranche 2",
    fileName: "rapport-eclairage-tranche2.pdf",
    folderPath: "travaux/eclairage",
    category: "report",
    lines: [
      "Commune de Saint-Aubin - Services techniques",
      "",
      "La tranche 2 couvre le centre-bourg et les abords de l'ecole :",
      "240 luminaires a remplacer par des LED 3000 K.",
      "",
      "Montant estime : 186 000 EUR HT.",
      "Subvention attendue du SDE : 74 400 EUR.",
      "Duree des travaux : 4 mois a compter de novembre 2026.",
    ],
  });
  const planFinancement = await uploadPdf({
    title: "Plan de financement — éclairage",
    fileName: "plan-financement-eclairage.pdf",
    folderPath: "travaux/eclairage",
    category: "supporting",
    lines: [
      "Depenses : 186 000 EUR HT",
      "Subvention SDE (40 %) : 74 400 EUR",
      "FCTVA : 30 512 EUR",
      "Autofinancement : 81 088 EUR",
    ],
  });
  const tableauSubventions = await uploadPdf({
    title: "Tableau des subventions 2026",
    fileName: "tableau-subventions-2026.pdf",
    folderPath: "finances/subventions",
    category: "supporting",
    lines: [
      "Association sportive de Saint-Aubin : 3 200 EUR",
      "Comite des fetes : 2 500 EUR",
      "Club des aines : 900 EUR",
      "Cooperative scolaire : 1 400 EUR",
      "Harmonie municipale : 1 800 EUR",
    ],
  });
  const avisDomaines = await uploadPdf({
    title: "Avis des Domaines — parcelle AB 127",
    fileName: "avis-domaines-AB127.pdf",
    folderPath: "urbanisme/cessions",
    category: "supporting",
    lines: [
      "Direction de l'immobilier de l'Etat",
      "",
      "Parcelle AB 127 - 1 240 m2 - zone UB du PLU.",
      "Valeur venale estimee : 62 000 EUR,",
      "assortie d'une marge de negociation de 10 %.",
    ],
  });
  const noteTarifs = await uploadPdf({
    title: "Note sur les tarifs 2026-2027",
    fileName: "note-tarifs-cantine.pdf",
    folderPath: "ecole/cantine",
    category: "report",
    lines: [
      "Le prestataire applique une hausse de 4,1 % au 1er septembre.",
      "Proposition : repercuter 2 % sur les tranches QF superieures,",
      "geler le tarif de la premiere tranche.",
      "Cout residuel pour la commune : 6 300 EUR/an.",
    ],
  });

  console.log("— Topics et délibérations (« soumettre au vote »)");
  const submitToVote = async (topic, draftText) =>
    Object.assign(topic, await post(`/topics/${topic.id}/decision`, { draftText }));
  const topicCession = await post("/topics", {
    kind: "subject",
    title: "Cession de la parcelle AB 127",
    report:
      "La commune n'a pas d'usage de cette parcelle enclavée. Un riverain s'est porté acquéreur au prix de l'avis des Domaines.",
    folderPath: "urbanisme/cessions",
    resourceIds: [avisDomaines.id],
  });
  await submitToVote(
    topicCession,
    "**Le conseil municipal**, vu l'avis des Domaines du 12 juin 2026,\n\n**décide** de céder la parcelle AB 127 (1 240 m²) au prix de 62 000 €, et **autorise** madame la maire à signer l'acte authentique.",
  );
  const topicCantine = await post("/topics", {
    kind: "subject",
    title: "Tarifs de la restauration scolaire 2026-2027",
    report:
      "Le prestataire augmente ses prix de 4,1 %. La commission scolaire propose de ne répercuter qu'une partie de la hausse.",
    folderPath: "ecole/cantine",
    resourceIds: [noteTarifs.id, reglementCantine.id],
  });
  await submitToVote(
    topicCantine,
    "**Le conseil municipal décide** :\n\n- de geler le tarif de la première tranche de quotient familial ;\n- d'appliquer une hausse de 2 % aux autres tranches à compter du 1er septembre 2026.",
  );
  const topicMotion = await post("/topics", {
    kind: "subject",
    title: "Motion de soutien au commerce de proximité",
    report:
      "Suite à la fermeture annoncée du dernier commerce alimentaire, il est proposé au conseil d'adopter une motion de soutien.",
    folderPath: "",
    resourceIds: [],
  });
  const topicQuestionsPassees = await post("/topics", {
    kind: "openQuestion",
    title: "Questions diverses",
    report: "",
    folderPath: "",
    resourceIds: [],
  });
  const topicEclairage = await post("/topics", {
    kind: "subject",
    title: "Éclairage public — engagement de la tranche 2",
    report:
      "Après la tranche 1 achevée au printemps, la tranche 2 couvre le centre-bourg et les abords de l'école. Le plan de financement intègre la subvention du SDE.",
    folderPath: "travaux/eclairage",
    resourceIds: [noteCadrage.id, rapportEclairage.id, planFinancement.id],
  });
  await submitToVote(
    topicEclairage,
    "**Le conseil municipal approuve** le programme de la tranche 2 pour un montant de 186 000 € HT, **sollicite** la subvention du SDE à hauteur de 40 %, et **autorise** madame la maire à signer les marchés correspondants.",
  );
  const topicSubventions = await post("/topics", {
    kind: "subject",
    title: "Subventions aux associations 2026",
    report: "La commission vie associative a examiné les huit dossiers reçus. Cinq demandes sont retenues.",
    folderPath: "finances/subventions",
    resourceIds: [tableauSubventions.id],
  });
  await submitToVote(
    topicSubventions,
    "**Le conseil municipal attribue** les subventions conformément au tableau annexé, pour un montant total de **9 800 €**, inscrit au budget 2026.",
  );
  const topicRentree = await post("/topics", {
    kind: "subject",
    title: "Rentrée scolaire — bilan et effectifs",
    report: "Point d'information : 142 élèves inscrits (+6), ouverture d'un poste d'ATSEM à mi-temps.",
    folderPath: "ecole",
    resourceIds: [],
  });
  const topicQuestions = await post("/topics", {
    kind: "openQuestion",
    title: "Questions diverses",
    report: "",
    folderPath: "",
    resourceIds: [],
  });
  // Restent volontairement « à inscrire » (backlog de préparation).
  await post("/topics", {
    kind: "subject",
    title: "Rénovation de la salle des fêtes — étude préalable",
    report: "Lancement d'une étude de programmation (toiture, chauffage, accessibilité).",
    folderPath: "travaux/salle-des-fetes",
    resourceIds: [],
  });
  await post("/topics", {
    kind: "openQuestion",
    title: "Stationnement rue des Tilleuls",
    report: "",
    folderPath: "voirie",
    resourceIds: [],
  });

  console.log("— Séance passée : préparation");
  const pastMeeting = await post("/council-meetings", {
    title: "Conseil municipal — séance de juin",
    startsAt: daysFromNow(-14),
    location: "Salle du conseil",
  });
  const pastAgenda = [topicCession, topicCantine, topicMotion, topicQuestionsPassees];
  for (const [index, topic] of pastAgenda.entries()) {
    await post(`/topics/${topic.id}/schedule`, { meetingId: pastMeeting.id, position: index + 1 });
  }
  await put(`/council-meetings/${pastMeeting.id}/status`, { status: "scheduled" });
  await put(`/council-meetings/${pastMeeting.id}/officers`, {
    chairMemberId: members.Delcourt.id,
    secretaryMemberId: members.Renaud.id,
  });

  console.log("— Séance passée : présences et pouvoirs");
  const proxyDocument = await uploadPdf({
    title: "Pouvoir — Olivier Fontaine",
    fileName: "pouvoir-fontaine.pdf",
    meetingId: pastMeeting.id,
    category: "proxy",
    lines: [
      "Je soussigne Olivier Fontaine, conseiller municipal,",
      "donne pouvoir a Sylvie Garnier pour me representer",
      "et voter en mon nom lors de la seance du conseil municipal.",
      "",
      "Fait a Saint-Aubin.",
    ],
  });
  for (const member of Object.values(members)) {
    if (member.id === members.Fontaine.id || member.id === members.Lambert.id) continue;
    await put(`/council-meetings/${pastMeeting.id}/attendance`, {
      memberId: member.id,
      status: "present",
      proxyHolderMemberId: null,
      proxyDocumentId: null,
    });
  }
  await put(`/council-meetings/${pastMeeting.id}/attendance`, {
    memberId: members.Fontaine.id,
    status: "represented",
    proxyHolderMemberId: members.Garnier.id,
    proxyDocumentId: proxyDocument.id,
  });
  await put(`/council-meetings/${pastMeeting.id}/attendance`, {
    memberId: members.Lambert.id,
    status: "excused",
    proxyHolderMemberId: null,
    proxyDocumentId: null,
  });
  await put(`/council-meetings/${pastMeeting.id}/status`, { status: "inProgress" });

  console.log("— Séance passée : déroulé, scrutins, clôture");
  const publicVotes = (aggregate, choiceByMemberId = {}) =>
    aggregate.attendance
      .filter((attendance) => ["present", "represented"].includes(attendance.status))
      .map((attendance) => ({
        memberId: attendance.memberId,
        castByMemberId: attendance.proxyHolderMemberId ?? attendance.memberId,
        choice: choiceByMemberId[attendance.memberId] ?? "for",
      }));

  const aggregate = await get(`/council-meetings/${pastMeeting.id}`);
  const itemFor = (topic) => aggregate.agendaItems.find((item) => item.topic.id === topic.id);

  const conduct = [
    {
      topic: topicCession,
      ballot: { councilDecisionId: topicCession.councilDecisionId },
      choices: { [members.Benali.id]: "against", [members.Rousseau.id]: "abstain" },
      notes:
        "Présentation de l'avis des Domaines. M. Benali estime le prix insuffisant ; Mme Rousseau s'interroge sur l'accès à la parcelle voisine.",
    },
    {
      topic: topicCantine,
      ballot: { councilDecisionId: topicCantine.councilDecisionId },
      choices: { [members.Marchand.id]: "against" },
      notes: "Débat sur la répartition de la hausse entre les tranches. Le gel de la première tranche fait consensus.",
    },
    {
      topic: topicMotion,
      ballot: { agendaItemId: null }, // renseigné après démarrage
      choices: { [members.Morel.id]: "abstain" },
      notes: "Lecture de la motion. Le conseil souhaite y associer la chambre de commerce.",
    },
    {
      topic: topicQuestionsPassees,
      ballot: null,
      notes: "Mme Petit signale un dépôt sauvage chemin des Carrières ; les services techniques interviendront.",
    },
  ];
  for (const step of conduct) {
    const item = itemFor(step.topic);
    await post(`/council-meetings/${pastMeeting.id}/agenda-items/${item.id}/start`, {});
    if (step.ballot) {
      const target = step.ballot.councilDecisionId
        ? { councilDecisionId: step.ballot.councilDecisionId }
        : { agendaItemId: item.id };
      await post(`/council-meetings/${pastMeeting.id}/ballots`, {
        method: "public",
        idempotencyKey: randomUUID(),
        ...target,
        votes: publicVotes(aggregate, step.choices ?? {}),
      });
    }
    await post(`/council-meetings/${pastMeeting.id}/agenda-items/${item.id}/complete`, {
      discussionSummary: step.notes,
      status: "examined",
    });
  }
  await put(`/council-meetings/${pastMeeting.id}/status`, { status: "closed" });

  console.log("— Séance à venir : ordre du jour et convocation");
  const upcomingMeeting = await post("/council-meetings", {
    title: "Conseil municipal — séance de septembre",
    startsAt: daysFromNow(9),
    location: "Salle du conseil",
  });
  const minutesTopics = await get("/topics?state=toSchedule");
  const minutesApproval = minutesTopics.find((topic) => topic.kind === "minutesApproval");
  const upcomingAgenda = [minutesApproval, topicEclairage, topicSubventions, topicRentree, topicQuestions];
  for (const [index, topic] of upcomingAgenda.entries()) {
    await post(`/topics/${topic.id}/schedule`, { meetingId: upcomingMeeting.id, position: index + 1 });
  }
  await put(`/council-meetings/${upcomingMeeting.id}/status`, { status: "scheduled" });
  await put(`/council-meetings/${upcomingMeeting.id}/officers`, {
    chairMemberId: members.Delcourt.id,
    secretaryMemberId: members.Renaud.id,
  });
  await uploadPdf({
    title: "Convocation — séance de septembre",
    fileName: "convocation-septembre.pdf",
    meetingId: upcomingMeeting.id,
    category: "meetingNotice",
    lines: [
      "Mesdames et Messieurs les conseillers municipaux sont convoques",
      "en seance ordinaire du conseil municipal, salle du conseil.",
      "",
      "L'ordre du jour comporte cinq points, dont l'approbation",
      "du proces-verbal de la seance precedente.",
    ],
  });

  console.log("— Séance en préparation");
  await post("/council-meetings", {
    title: "Conseil municipal — séance de novembre",
    startsAt: daysFromNow(65),
    location: "Salle du conseil",
  });

  console.log("Seed terminé.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
