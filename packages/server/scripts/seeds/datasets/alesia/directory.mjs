export async function seedDirectory({ post, put }, { daysFromNow, password }) {
  console.log("- Configuration de la commune");
  await put("/settings", {
    name: "Alésia",
    inseeCode: "12345",
    siren: "123456789",
    population: 2_500,
    populationReferenceDate: daysFromNow(-120).slice(0, 10),
    addressLine1: "Enceinte de l’oppidum",
    addressLine2: "Plateau de Cornu",
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
  const members = {};
  const memberContactIds = {};
  for (const [firstName, lastName, role] of membersSpec) {
    const contact = await post("/contacts", {
      firstName,
      lastName,
      email: `${firstName.toLowerCase().normalize("NFD").replace(/[^a-z-]/g, "")}@alesia.example`,
      phone: null,
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
    firstName: "Jules", lastName: "César",
    organizationName: "Armée romaine", jobTitle: "Proconsul",
    email: "jules.cesar@alesia.example", phone: null,
    notes: "Interlocuteur pour les pourparlers devant les lignes romaines.",
  });
  await post("/contacts", {
    firstName: "Titus", lastName: "Labienus",
    organizationName: "Armée romaine", jobTitle: "Légat de César",
    email: "titus.labienus@alesia.example", phone: null,
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
  await post(`/council-committees/${supplyCommittee.id}/memberships`, {
    contactId: members["Commius"].contactId,
    role: "chair",
    startedOn: daysFromNow(-100).slice(0, 10),
  });
  await post(`/council-committees/${supplyCommittee.id}/memberships`, {
    contactId: members["Convictolitavis"].contactId,
    role: "member",
    startedOn: daysFromNow(-100).slice(0, 10),
  });
  await post(`/council-committees/${defenseCommittee.id}/memberships`, {
    contactId: members["Luctérios"].contactId,
    role: "chair",
    startedOn: daysFromNow(-100).slice(0, 10),
  });
  await post(`/council-committees/${defenseCommittee.id}/memberships`, {
    contactId: members["Éporédorix"].contactId,
    role: "member",
    startedOn: daysFromNow(-100).slice(0, 10),
  });

  console.log("- Utilisateurs, rôles et rattachements au conseil");
  const usersSpec = [
    {
      email: "vercingetorix@alesia.example",
      displayName: "Vercingétorix l’Arverne",
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
      roles: ["meetingConductor"],
      contactId: null,
    },
    {
      email: "viridomaros@alesia.example",
      displayName: "Viridomaros l’Éduen",
      roles: ["reader"],
      contactId: null,
    },
  ];
  for (const user of usersSpec) await post("/users", { ...user, password: password });
  for (const user of usersSpec) {
    const authenticated = await post("/auth/login", { email: user.email, password: password });
    if (authenticated.email !== user.email || user.roles.some((role) => !authenticated.roles.includes(role))) {
      throw new Error(`Le compte de démonstration ${user.email} ne restitue pas les rôles attendus`);
    }
  }
  console.log(`  Mot de passe de démonstration : ${password}`);

  return { members, memberContactIds, caesarContactId: caesar.id };
}
