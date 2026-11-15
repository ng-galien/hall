import { daysFromNow } from "../../common/dates.mjs";
import { createMeetingConduct } from "../../scenarios/history.mjs";
import { fullName } from "./names.mjs";

/**
 * The meetings of the Foncine-le-Bas scenarios, conducted through the public API with the facts of the
 * dataset: attendance and proxy of each meeting, a member who takes no part in a vote, secret ballots with a
 * blank paper, an adjournment, an arrival, the departure of the mayor and the chair taken by the first deputy.
 */
function meetingTools(api, fixture) {
  const { members } = fixture;
  const conduct = createMeetingConduct(api, {
    roster: { all: Object.values(members) },
    subjects: fixture.subjects,
    meetingLocation: fixture.meetingLocation,
  });
  const attendance = ({ represented, excused = [], absent = [] }) =>
    Object.entries(members).map(([key, member]) => {
      if (represented?.giver === key)
        return {
          councilMemberId: member.id,
          status: "represented",
          proxyHolderCouncilMemberId: members[represented.holder].id,
          proxyDocumentId: represented.proxy.id,
        };
      if (excused.includes(key)) return { councilMemberId: member.id, status: "excused" };
      if (absent.includes(key)) return { councilMemberId: member.id, status: "absent" };
      return { councilMemberId: member.id, status: "present" };
    });
  const openMeeting = async (meeting, date, { secretary, ...declarations }) => {
    const participants = await conduct.open(
      meeting,
      date,
      null,
      { chair: members.marchand, secretary: members[secretary] },
      attendance(declarations),
      { noticeMinute: -7 * 24 * 60 },
    );
    await conduct.declareAuxiliary(meeting, fixture.contacts.colin, "Secrétaire générale de mairie");
    return participants;
  };
  const freezeDecisions = async (meeting) => {
    for (const summary of await api.get("/council-decisions")) {
      if (summary.councilMeetingId !== meeting.id || summary.state !== "draft") continue;
      await api.post(`/council-decisions/${summary.id}/freeze`, { expectedVersion: summary.version });
    }
  };
  return { conduct, openMeeting, freezeDecisions };
}

const notes = (fixture) => {
  const member = (key) => `:member[${fullName(key)}]{#${fixture.members[key].id}}`;
  return {
    montNoirProgramme: `### Présentation\n\n${member("garnier")} présente le programme d’entretien de la voie communale du Mont Noir, 564 mètres, et son plan de financement : DETR 30 %, aide départementale 20 %, autofinancement 50 %.\n\n**Suite retenue :** déposer les deux demandes de subvention.`,
    forestCuts: `### Présentation\n\n${member("garnier")} présente la proposition d’état d’assiette de l’ONF et le règlement de l’affouage. Trois garants sont proposés.`,
    associationGrants: `### Présentation\n\n${member("morin")} quitte la salle avant la présentation et ne prend part ni au débat ni au vote. ${member("renaud")} présente les trois demandes et le prêt du matériel. Le conseil vote les montants proposés.`,
    seasonalJob: `### Présentation\n\n${member("marchand")} présente l’emploi saisonnier d’entretien des espaces publics et du fleurissement, six mois au plus.`,
    ccReport: `### Rapport d’activité\n\n${member("marchand")} présente le rapport d’activité de la communauté de communes. Le document est joint au dossier.`,
    approval: `### Procès-verbal de la séance précédente\n\nLe procès-verbal est relu ; aucune correction n’est demandée.`,
    sidecPrimary: `### Désignation\n\n${member("garnier")} est seul candidat. Le scrutin a lieu à bulletin secret, s’agissant d’une nomination.`,
    sidecAlternate: `### Désignation\n\n${member("roussel")} est seul candidat. Le scrutin a lieu à bulletin secret.`,
    champDeMarsAgreement: `### Présentation\n\n${member("renaud")} présente la convention d’occupation du Champ de Mars et l’inventaire du matériel prêté.`,
    hallUse: `### Numérique\n\n${member("marchand")} présente l’utilisation de Hall et la transmission dématérialisée des convocations ; un conseiller peut demander par écrit l’envoi à son domicile. ${member("morin")} est proposée comme élue référente.`,
    hallOnboarding: `### Prise en main de Hall\n\n${member("morin")} présente le déroulé de la prise en main : comptes créés par le secrétariat, séance de prise en main, guide remis aux élus. La séance complémentaire sur le téléphone est annoncée.`,
    lightingAdjournedAgain: `### Éclairage public\n\nLe chiffrage du SIDEC est attendu dans les prochains jours. Le point est à nouveau ajourné et reporté à la séance suivante.`,
    lightingAdjourned: `### Éclairage public\n\nLe chiffrage du SIDEC n’est pas encore reçu. Le point est ajourné et reporté à une séance suivante.`,
    budgetAmendment: `### Décision modificative n° 1\n\n${member("robert")}, rapporteure de la commission Finances, présente les virements de crédits. Le conseiller aux décideurs locaux de la DGFiP répond aux questions sur l’équilibre des sections.`,
    walkFurniture: `### Départ de promenade\n\n${member("garnier")} présente l’installation d’une table, d’un banc et d’un panneau sur le Parking de la Tram’Jurassienne.`,
    ruralPathsProgramme: `### Chemins ruraux\n\n${member("garnier")}, qui préside la fin de séance, présente l’inventaire des chemins ruraux et l’ordre des travaux proposé par la commission Voirie.`,
    lighting: `### Éclairage public\n\n${member("garnier")} présente le chiffrage du SIDEC : 31 200 € HT, dont 12 480 € à la charge du syndicat. Les horaires d’extinction seront fixés par arrêté de la maire.`,
    montNoirAward: `### Attribution des travaux\n\n${member("garnier")} présente le comparatif et le plan de financement. ${member("carre")} demande que le chantier laisse un passage aux véhicules de secours ; ${member("garnier")} indique que les entreprises proposent de travailler par tronçons. ${member("robert")} confirme que la décision modificative n° 1 couvre la dépense.`,
    worksCalendar: `### Calendrier des travaux\n\nLe conseil préfère une organisation en deux tronçons, qui laisse toujours un passage. La réunion d’information des habitants est fixée à la salle communale.\n\n#### Points à reprendre dans le procès-verbal\n\n- consigner l’organisation par tronçons ;\n- joindre le plan de situation ;\n- préciser la date de la réunion d’information des habitants.`,
  };
};

/** An adjourned item comes back by itself on the agenda of the next meeting at its closure. */
async function carriedLighting(api, meeting) {
  const item = (await api.get(`/council-meetings/${meeting.id}/agenda-items`)).find((entry) =>
    entry.title.startsWith("Éclairage public"),
  );
  if (!item) throw new Error("Le point de l’éclairage public ajourné n’est pas reporté à la séance suivante");
  return item;
}

/** Meeting n° 1, held `days` before the load day, closed with generated minutes. */
async function firstMeeting(api, fixture, days) {
  const { conduct, openMeeting } = meetingTools(api, fixture);
  const text = notes(fixture);
  const meeting = await api.post("/council-meetings", {});
  const keys = ["montNoirProgramme", "forestCuts", "associationGrants", "seasonalJob", "ccReport"];
  const items = [];
  for (const [index, key] of keys.entries()) items.push(await conduct.schedule(meeting, key, index + 1));
  const date = daysFromNow(days, 20, 0);
  const present = await openMeeting(meeting, date, {
    secretary: "durand",
    represented: { giver: "fontaine", holder: "robert", proxy: fixture.proxies[1] },
    excused: ["mathieu"],
  });
  await conduct.vote(meeting, items[0], present, "public", 10, 0, text.montNoirProgramme, 5, 20);
  await conduct.vote(meeting, items[1], present, "public", 10, 0, text.forestCuts, 30, 15);
  await conduct.start(meeting, items[2], 50);
  const withoutMorin = await conduct.recuse(meeting, items[2], fixture.members.morin);
  await conduct.vote(meeting, items[2], withoutMorin, "public", 8, 0, text.associationGrants, 50, 15, {
    started: true,
  });
  await conduct.vote(meeting, items[3], present, "public", 10, 0, text.seasonalJob, 70, 10);
  await conduct.present(meeting, items[4], text.ccReport, 85, 15);
  const { nextMeeting } = await conduct.close(meeting, date, 105);
  return { meeting, nextMeeting };
}

async function secondMeeting(api, fixture, meeting, days) {
  const { conduct, openMeeting } = meetingTools(api, fixture);
  const text = notes(fixture);
  const [approval] = await api.get(`/council-meetings/${meeting.id}/agenda-items`);
  const items = [];
  for (const [index, key] of [
    "sidecPrimary",
    "sidecAlternate",
    "champDeMarsAgreement",
    "lighting",
    "hallUse",
  ].entries())
    items.push(await conduct.schedule(meeting, key, index + 2));
  const date = daysFromNow(days, 20, 0);
  const present = await openMeeting(meeting, date, {
    secretary: "fontaine",
    represented: { giver: "lefort", holder: "garnier", proxy: fixture.proxies[2] },
    excused: ["carre"],
  });
  await conduct.vote(meeting, approval, present, "public", 10, 0, text.approval, 2, 6);
  await conduct.vote(meeting, items[0], present, "secret", 9, 0, text.sidecPrimary, 10, 15, { blank: 1 });
  await conduct.vote(meeting, items[1], present, "secret", 10, 0, text.sidecAlternate, 27, 12);
  await conduct.vote(meeting, items[2], present, "public", 10, 0, text.champDeMarsAgreement, 42, 15);
  await conduct.start(meeting, items[3], 60);
  await api.patch(`/council-meetings/${meeting.id}/agenda-items/${items[3].id}/notes`, {
    discussionSummary: text.lightingAdjourned,
  });
  await conduct.adjourn(meeting, items[3], 65);
  await conduct.vote(meeting, items[4], present, "public", 10, 0, text.hallUse, 67, 15);
  const { nextMeeting } = await conduct.close(meeting, date, 90);
  return { nextMeeting };
}

async function thirdMeeting(api, fixture, meeting, days) {
  const { conduct, openMeeting } = meetingTools(api, fixture);
  const text = notes(fixture);
  const [approval] = await api.get(`/council-meetings/${meeting.id}/agenda-items`);
  const keys = ["budgetAmendment", "walkFurniture", "ruralPathsProgramme", "hallOnboarding"];
  const items = [];
  for (const [index, key] of keys.entries()) items.push(await conduct.schedule(meeting, key, index + 2));
  const date = daysFromNow(days, 20, 0);
  const present = await openMeeting(meeting, date, {
    secretary: "durand",
    represented: { giver: "roussel", holder: "carre", proxy: fixture.proxies[3] },
    excused: ["lefort"],
    absent: ["robert"],
  });
  await conduct.declareAuxiliary(meeting, fixture.contacts.legoff, "Conseiller aux décideurs locaux, DGFiP");
  await conduct.vote(meeting, approval, present, "public", 9, 0, text.approval, 2, 6);
  await conduct.recordAttendance(meeting, [{ councilMemberId: fixture.members.robert.id, status: "present" }]);
  const withRobert = await conduct.participants(meeting);
  await conduct.vote(meeting, items[0], withRobert, "public", 10, 0, text.budgetAmendment, 10, 25);
  await conduct.vote(meeting, items[1], withRobert, "public", 9, 0, text.walkFurniture, 40, 15);
  const lighting = await carriedLighting(api, meeting);
  await conduct.start(meeting, lighting, 56);
  await api.patch(`/council-meetings/${meeting.id}/agenda-items/${lighting.id}/notes`, {
    discussionSummary: text.lightingAdjournedAgain,
  });
  await conduct.adjourn(meeting, lighting, 58);
  await conduct.changeOfficer(meeting, "chair", fixture.members.garnier);
  await conduct.recordAttendance(meeting, [{ councilMemberId: fixture.members.marchand.id, status: "absent" }]);
  await conduct.present(meeting, items[2], text.ruralPathsProgramme, 62, 18);
  await conduct.present(meeting, items[3], text.hallOnboarding, 81, 14);
  const { nextMeeting } = await conduct.close(meeting, date, 100);
  return { nextMeeting };
}

/** Meeting n° 4 in progress: the minutes approved, the lighting voted, the Mont Noir award under discussion. */
async function currentMeeting(api, fixture, meeting, { closed }) {
  const { conduct, openMeeting } = meetingTools(api, fixture);
  const text = notes(fixture);
  const [approval] = await api.get(`/council-meetings/${meeting.id}/agenda-items`);
  const lighting = await carriedLighting(api, meeting);
  const award = await conduct.schedule(meeting, "montNoirAward", 3);
  const calendar = await conduct.schedule(meeting, "worksCalendar", 4);
  await api.put(`/council-meetings/${meeting.id}/agenda-order`, {
    agendaItemIds: [approval.id, lighting.id, award.id, calendar.id],
  });
  const date = new Date(Date.now() - (closed ? 150 : 20) * 60_000).toISOString();
  const present = await openMeeting(meeting, date, {
    secretary: "fontaine",
    represented: { giver: "mathieu", holder: "renaud", proxy: fixture.proxies[4] },
  });
  await conduct.vote(meeting, approval, present, "public", 11, 0, text.approval, 2, 4);
  await conduct.vote(meeting, lighting, present, "public", 11, 0, text.lighting, 7, 10);
  if (!closed) {
    await conduct.start(meeting, award, 18);
    await api.patch(`/council-meetings/${meeting.id}/agenda-items/${award.id}/notes`, {
      discussionSummary: text.montNoirAward,
    });
    await conduct.backdate(meeting, date);
    return { award };
  }
  await conduct.vote(meeting, award, present, "public", 10, 0, text.montNoirAward, 18, 40);
  await conduct.present(meeting, calendar, text.worksCalendar, 60, 50);
  const closure = await api.post(`/council-meetings/${meeting.id}/close`, {});
  conduct.mark(meeting, closure.closedMeeting.closedAt, 120);
  await conduct.backdate(meeting, date);
  await conduct.plan(closure.nextMeeting, daysFromNow(14, 20, 0), [
    "walkRegister",
    "hallWindows",
    "bridgeRailing",
    "hallFollowUp",
  ]);
  return { minutesId: closure.minutes.id, nextMeeting: closure.nextMeeting };
}

export async function seedFoncineEmpty({ post }) {
  console.log("- Séance n° 1 provisionnée, sans date, ordre du jour vide");
  await post("/council-meetings", {});
}

export async function seedFoncinePreparation(api, fixture) {
  console.log("- Séance n° 1 close, séance n° 2 en préparation");
  const { meeting, nextMeeting } = await firstMeeting(api, fixture, -35);
  await meetingTools(api, fixture).freezeDecisions(meeting);
  await meetingTools(api, fixture).conduct.plan(nextMeeting, daysFromNow(10, 20, 0), [
    "sidecPrimary",
    "sidecAlternate",
    "champDeMarsAgreement",
    "lighting",
    "hallUse",
    "ruralPathsProgramme",
  ]);
  console.log(`  Séance n° 2 en préparation : /app/meetings/${nextMeeting.id}`);
}

async function history(api, fixture) {
  const { freezeDecisions } = meetingTools(api, fixture);
  const first = await firstMeeting(api, fixture, -91);
  await freezeDecisions(first.meeting);
  const second = await secondMeeting(api, fixture, first.nextMeeting, -56);
  await freezeDecisions(first.nextMeeting);
  const third = await thirdMeeting(api, fixture, second.nextMeeting, -28);
  return third.nextMeeting;
}

export async function seedFoncineSession(api, fixture) {
  console.log("- Séances n° 1 à 3 closes, séance n° 4 en cours");
  const current = await history(api, fixture);
  await currentMeeting(api, fixture, current, { closed: false });
  console.log(`  Séance n° 4 en cours, vote du chemin du Mont Noir à mener : /app/meetings/${current.id}/live`);
}

export async function seedFoncineMinutes(api, fixture) {
  console.log("- Séances n° 1 à 4 closes, procès-verbal n° 4 modifiable, séance n° 5 datée");
  const current = await history(api, fixture);
  const { minutesId } = await currentMeeting(api, fixture, current, { closed: true });
  const draft = await api.get(`/minutes/${minutesId}`);
  if (draft.generatedAt !== null || draft.documentId !== null)
    throw new Error("Le procès-verbal n° 4 doit rester modifiable");
  console.log(`  Procès-verbal à corriger puis générer : /app/minutes/${minutesId}`);
}
