import { alesiaMailPresentation } from "./configuration.mjs";
/** The Alésia administrator: the first account on a server without development access. */
export const alesiaAdministrator = { email: "vercingetorix@alesia.example", displayName: "Vercingétorix l’Arverne" };

/** Seeds the Alésia directory; member telephones are fictional numbers from the ranges reserved for audiovisual works. */
export async function seedDirectory({ post, put, signedInEmail }, { daysFromNow, password }) {
  console.log("- Configuration de la commune");
  await put("/settings", {
    name: "Alésia",
    ...alesiaMailPresentation,
    inseeCode: "12345",
    siren: "123456789",
    population: 2_500,
    populationReferenceDate: daysFromNow(-120).slice(0, 10),
    addressLine1: "Enceinte de l’oppidum",
    addressLine2: "Plateau d’Alésia",
    postalCode: "12345",
    city: "Alésia",
    geographicPosition: [4.438, 47.558],
    phone: "",
    email: "contact@alesia.example",
    website: "https://alesia.example",
    meetingLocations: ["Maison commune de l’oppidum"],
    timeZone: "Europe/Paris",
    outboundEmailSenderName: "Conseil de l’oppidum d’Alésia",
    outboundEmailSenderAddress: "conseil@alesia.example",
    outboundEmailReplyToAddress: "secretariat@alesia.example",
  });

  await put("/council-terms", { expectedMemberCount: 15 });

  console.log("- Contacts et membres du conseil");
  const membersSpec = [
    ["Vercingétorix", "l’Arverne", "mayor"],
    ["Vercassivellaunos", "l’Arverne", "deputyMayor"],
    ["Commius", "l’Atrébate", "deputyMayor"],
    ["Luctérios", "le Cadurque", "deputyMayor"],
    ["Convictolitavis", "l’Éduen", "councillor"],
    ["Éporédorix", "l’Éduen", "councillor"],
    ["Viridomaros", "l’Éduen", "councillor"],
    ["Critognatos", "l’Arverne", "councillor"],
    ["Sédullos", "le Lémovice", "councillor"],
    ["Drappès", "le Sénon", "councillor"],
    ["Surus", "l’Éduen", "councillor"],
    ["Merlin", "l’Enchanteur", "councillor"],
    ["Dumnacos", "l’Andécave", "councillor"],
    ["Cotuatos", "le Carnute", "councillor"],
    ["Conconnetodumnos", "le Carnute", "councillor"],
  ];
  const memberPhones = {
    Vercingétorix: { mobilePhone: "06 39 98 00 01", professionalPhone: "03 53 01 00 01" },
    Vercassivellaunos: { mobilePhone: "06 39 98 00 02" },
    Commius: { professionalPhone: "03 53 01 00 03" },
    Luctérios: { mobilePhone: "06 39 98 00 04", personalPhone: "03 53 01 00 04" },
  };
  const members = {};
  const memberContactIds = {};
  for (const [firstName, lastName, role] of membersSpec) {
    const contact = await post("/contacts", {
      firstName,
      lastName,
      email: `${firstName
        .toLowerCase()
        .normalize("NFD")
        .replace(/[^a-z-]/g, "")}@alesia.example`,
      mobilePhone: null,
      personalPhone: null,
      professionalPhone: null,
      ...memberPhones[firstName],
      organizationName: "Oppidum d’Alésia",
      jobTitle: "Conseil de l’oppidum",
      notes: "",
    });
    memberContactIds[firstName] = contact.id;
    members[firstName] = await post("/council-members", {
      contactId: contact.id,
      role,
      termStartedOn: daysFromNow(-100).slice(0, 10),
    });
  }

  const caesar = await post("/contacts", {
    firstName: "Jules",
    lastName: "César",
    organizationName: "Armée romaine",
    jobTitle: "Proconsul",
    email: "jules.cesar@alesia.example",
    mobilePhone: "06 39 98 00 50",
    personalPhone: null,
    professionalPhone: "+39 06 1234 5678",
    notes: "Interlocuteur pour les pourparlers devant les lignes romaines.",
  });
  await post("/contacts", {
    firstName: "Titus",
    lastName: "Labienus",
    organizationName: "Armée romaine",
    jobTitle: "Légat de César",
    email: "titus.labienus@alesia.example",
    mobilePhone: null,
    personalPhone: null,
    professionalPhone: null,
    notes: "Organisation du passage des délégations entre les deux lignes.",
  });

  console.log("- Commissions municipales");
  const supplyCommittee = await post("/council-committees", {
    name: "Commission ravitaillement et accueil",
    description: "Prépare les dossiers de réserves alimentaires et d’accueil dans les abris.",
  });
  const defenseCommittee = await post("/council-committees", {
    name: "Commission défense et soutien",
    description: "Examine les besoins de défense du plateau et de coordination des équipes de soutien.",
  });
  const committeeMemberships = [
    [supplyCommittee, "Commius", "chair"],
    [supplyCommittee, "Convictolitavis", "member"],
    [supplyCommittee, "Viridomaros", "member"],
    [supplyCommittee, "Merlin", "member"],
    [defenseCommittee, "Luctérios", "chair"],
    [defenseCommittee, "Éporédorix", "member"],
    [defenseCommittee, "Vercassivellaunos", "member"],
    [defenseCommittee, "Drappès", "member"],
  ];
  for (const [committee, firstName, role] of committeeMemberships) {
    await post(`/council-committees/${committee.id}/memberships`, {
      contactId: members[firstName].contactId,
      role,
      startedOn: daysFromNow(-100).slice(0, 10),
    });
  }

  console.log("- Utilisateurs, rôles et rattachements au conseil");
  const usersSpec = [
    {
      ...alesiaAdministrator,
      roles: ["administrator"],
      contactId: null,
    },
    {
      email: "secretariat@alesia.example",
      displayName: "Écriture du conseil - Convictolitavis",
      roles: ["clerk"],
      contactId: null,
    },
    {
      email: "eporedorix@alesia.example",
      displayName: "Éporédorix l’Éduen",
      roles: ["contributor"],
      contactId: null,
    },
    {
      email: "vercassivellaunos@alesia.example",
      displayName: "Vercassivellaunos l’Arverne",
      roles: ["councillor"],
      contactId: members.Vercassivellaunos.contactId,
    },
    {
      email: "viridomaros@alesia.example",
      displayName: "Viridomaros l’Éduen",
      roles: ["councillor"],
      contactId: members.Viridomaros.contactId,
    },
  ];
  for (const user of usersSpec) {
    if (user.email !== signedInEmail) await post("/users", { ...user, password: password });
  }
  for (const user of usersSpec) {
    const authenticated = await post("/auth/login", { email: user.email, password: password });
    if (authenticated.email !== user.email || user.roles.some((role) => !authenticated.roles.includes(role))) {
      throw new Error(`Le compte de démonstration ${user.email} ne restitue pas les rôles attendus`);
    }
  }
  console.log(`  Mot de passe de démonstration : ${password}`);

  return {
    members,
    memberContactIds,
    caesarContactId: caesar.id,
    committees: { supply: supplyCommittee, defense: defenseCommittee },
  };
}
