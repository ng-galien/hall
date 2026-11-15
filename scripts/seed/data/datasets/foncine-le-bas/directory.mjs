import { associations, demonstrationNotice, fullName, mailbox, people } from "./names.mjs";

/** Installation of the council after the general municipal elections of March 2026, the same for every load. */
export const termStartedOn = "2026-03-21";

export const foncineAdministrator = { email: "maire@foncine-le-bas.example", displayName: fullName("marchand") };

export const foncineMailPresentation = {
  outboundEmailSignatureMarkdown: `**Mairie de Foncine-le-Bas**\n\nsecretariat@foncine-le-bas.example\n\n*${demonstrationNotice}*`,
  outboundEmailFooterMarkdown: `*${demonstrationNotice}*`,
};
export const foncinePdfPresentation = {
  headerHtml: "FONCINE-LE-BAS · Conseil municipal · Démonstration",
  footerHtml: `${demonstrationNotice} · :page-number / :page-count`,
  stylesheet:
    "body { font-family: Arial, sans-serif; color: #1e293b; font-size: 11pt; line-height: 1.4; } h1, h2 { color: #0f2a5c; break-after: avoid; } table { width: 100%; border-collapse: collapse; } th, td { padding: 4px; border-bottom: 1px solid #cbd5e1; text-align: left; }",
};

/** The eleven members in the order of the table (CGCT, L2121-1), with their role. */
const membersSpec = [
  ["marchand", "mayor"],
  ["garnier", "deputyMayor"],
  ["renaud", "deputyMayor"],
  ["robert", "councillor"],
  ["lefort", "councillor"],
  ["durand", "councillor"],
  ["roussel", "councillor"],
  ["morin", "councillor"],
  ["carre", "councillor"],
  ["fontaine", "councillor"],
  ["mathieu", "councillor"],
];
const memberNotes = {
  garnier: "Premier adjoint : voirie, éclairage public, forêt, chemins.",
  renaud: "Deuxième adjointe : finances, bâtiments, vie associative, fêtes et cérémonies.",
  morin: `Membre du bureau de l’association ${associations.summerFestival}.`,
  carre: "Correspondant incendie et secours, désigné par arrêté de la maire.",
};
/** Fictional numbers from the ranges reserved for audiovisual works. */
const phones = {
  marchand: { mobilePhone: "06 39 98 10 01", professionalPhone: "03 53 01 10 00" },
  garnier: { mobilePhone: "06 39 98 10 02" },
  renaud: { mobilePhone: "06 39 98 10 03" },
  colin: { professionalPhone: "03 53 01 10 00" },
  leroy: { mobilePhone: "06 39 98 10 20" },
};

const externalContacts = [
  [
    "dubois",
    "Leclerc-Varenne Terrassement (entreprise fictive)",
    "Conducteur de travaux",
    "Devis de terrassement et de busage du chemin du Mont Noir.",
    { mobilePhone: "06 39 98 20 01" },
  ],
  [
    "bertrand",
    "Revêtements Bertrand (entreprise fictive)",
    "Gérante",
    "Devis d’enrobé retenu ; rendez-vous sur place au chemin du Mont Noir.",
    { mobilePhone: "06 39 98 20 02" },
  ],
  [
    "moreau",
    "Enrobés Moreau (entreprise fictive)",
    "Chargé d’affaires",
    "Second devis d’enrobé.",
    { professionalPhone: "03 53 01 20 03" },
  ],
  ["aubry", "Préfecture du Jura", "Bureau des dotations de l’État", "Accusé de réception du dossier de DETR.", {}],
  ["roche", "Département du Jura", "Service d’aide aux communes", "Aide départementale à la voirie communale.", {}],
  [
    "faure",
    "SIDEC du Jura",
    "Chargé d’opérations d’éclairage public",
    "Chiffrage de la rénovation de l’éclairage public.",
    { professionalPhone: "03 53 01 20 06" },
  ],
  [
    "girard",
    "Office national des forêts",
    "Technicien forestier territorial",
    "État d’assiette, martelage.",
    { mobilePhone: "06 39 98 20 07" },
  ],
  [
    "bonnet",
    "Parc naturel régional du Haut-Jura",
    "Chargée de mission randonnée",
    "Panneau du départ de promenade.",
    {},
  ],
  ["lambert", "Service de gestion comptable, DGFiP", "Comptable public", "Paiement des entreprises.", {}],
  ["legoff", "DGFiP", "Conseiller aux décideurs locaux", "Présent à la séance n° 3 pour la décision modificative.", {}],
  ["michel", "Communauté de communes Champagnole Nozeroy Jura", "Chargée de mission", "Rapport d’activité.", {}],
  ["simon", null, "Habitant", "Courrier sur l’état du chemin du Mont Noir.", {}],
];
const contactDomains = {
  dubois: "leclerc-varenne.example",
  bertrand: "revetements-bertrand.example",
  moreau: "enrobes-moreau.example",
  aubry: "prefecture-jura.example",
  roche: "departement-jura.example",
  faure: "sidec-jura.example",
  girard: "onf.example",
  bonnet: "parc-haut-jura.example",
  lambert: "dgfip.example",
  legoff: "dgfip.example",
  michel: "cc-champagnole-nozeroy.example",
};
const associationContacts = [
  ["summerFestival", "fetes-ete"],
  ["champDeMars", "champ-de-mars"],
  ["elders", "aines-du-mardi"],
];

export async function seedDirectory({ post, put, signedInEmail }, { password }) {
  console.log("- Commune, élus, personnel et contacts");
  await put("/settings", {
    name: "Foncine-le-Bas",
    ...foncineMailPresentation,
    inseeCode: "39227",
    siren: null,
    population: 203,
    populationReferenceDate: "2026-01-01",
    addressLine1: "Mairie",
    addressLine2: "",
    postalCode: "39520",
    city: "Foncine-le-Bas",
    geographicPosition: [6.0294, 46.6324],
    phone: "03 53 01 10 00",
    email: "mairie@foncine-le-bas.example",
    website: null,
    meetingLocations: ["Salle du conseil, mairie", "Salle communale"],
    timeZone: "Europe/Paris",
    outboundEmailSenderName: "Mairie de Foncine-le-Bas",
    outboundEmailSenderAddress: "mairie@foncine-le-bas.example",
    outboundEmailReplyToAddress: "secretariat@foncine-le-bas.example",
  });
  await put("/council-terms", { expectedMemberCount: 11 });

  const members = {};
  const contacts = {};
  for (const [index, [key, role]] of membersSpec.entries()) {
    const contact = await post("/contacts", {
      ...people[key],
      email: mailbox(key),
      mobilePhone: null,
      personalPhone: null,
      professionalPhone: null,
      ...phones[key],
      organizationName: "Conseil municipal de Foncine-le-Bas",
      jobTitle:
        { mayor: "Maire", deputyMayor: index === 1 ? "Premier adjoint" : "Deuxième adjointe" }[role] ??
        "Conseiller municipal",
      notes: memberNotes[key] ?? "",
    });
    contacts[key] = contact.id;
    members[key] = await post("/council-members", { contactId: contact.id, role, rank: index + 1, termStartedOn });
  }
  for (const [key, jobTitle, notes] of [
    ["colin", "Secrétaire générale de mairie", "Secrétariat de la mairie."],
    ["leroy", "Adjoint technique territorial", "Entretien de la voirie, des espaces publics et du matériel communal."],
  ]) {
    contacts[key] = (
      await post("/contacts", {
        ...people[key],
        email: key === "colin" ? "secretariat@foncine-le-bas.example" : "technique@foncine-le-bas.example",
        mobilePhone: null,
        personalPhone: null,
        professionalPhone: null,
        ...phones[key],
        organizationName: "Mairie de Foncine-le-Bas",
        jobTitle,
        notes,
      })
    ).id;
  }
  for (const [key, organizationName, jobTitle, notes, numbers] of externalContacts) {
    contacts[key] = (
      await post("/contacts", {
        ...people[key],
        email: key === "simon" ? null : `${mailbox(key).split("@")[0]}@${contactDomains[key]}`,
        mobilePhone: null,
        personalPhone: null,
        professionalPhone: null,
        ...numbers,
        organizationName,
        jobTitle,
        notes,
      })
    ).id;
  }
  const associationAddresses = {};
  for (const [key, slug] of associationContacts) {
    associationAddresses[key] = `contact@${slug}.example`;
    contacts[key] = (
      await post("/contacts", {
        firstName: "Association",
        lastName: associations[key],
        email: associationAddresses[key],
        mobilePhone: null,
        personalPhone: null,
        professionalPhone: null,
        organizationName: associations[key],
        jobTitle: "Association du village (fictive)",
        notes: "Adresse générique de l’association ; aucun dirigeant n’est nommé.",
      })
    ).id;
  }

  console.log("- Commissions");
  const committeeSpec = {
    roads: [
      "Commission Voirie",
      "Voies communales, chemins ruraux, pont, éclairage public, forêt, promenade.",
      [
        ["marchand", "chair"],
        ["garnier", "viceChair"],
        ["lefort", "member"],
        ["roussel", "member"],
        ["carre", "member"],
      ],
    ],
    finances: [
      "Commission Finances",
      "Budget, plans de financement, subventions.",
      [
        ["marchand", "chair"],
        ["renaud", "viceChair"],
        ["robert", "rapporteur"],
        ["durand", "member"],
        ["mathieu", "member"],
      ],
    ],
    community: [
      "Commission Vie locale",
      "Associations, fêtes, cérémonies, fleurissement, salle communale.",
      [
        ["marchand", "chair"],
        ["renaud", "viceChair"],
        ["morin", "member"],
        ["durand", "member"],
        ["fontaine", "member"],
      ],
    ],
  };
  const committees = {};
  for (const [key, [name, description, memberships]] of Object.entries(committeeSpec)) {
    committees[key] = await post("/council-committees", { name, description });
    for (const [person, role] of memberships) {
      await post(`/council-committees/${committees[key].id}/memberships`, {
        contactId: contacts[person],
        role,
        startedOn: termStartedOn,
      });
    }
  }

  console.log("- Représentations extérieures");
  const delegations = [
    [
      "Communauté de communes Champagnole Nozeroy Jura",
      "Conseillers communautaires : la maire puis les adjoints dans l’ordre du tableau (code électoral, L273-11).",
      [
        ["marchand", "primary"],
        ["garnier", "alternate"],
      ],
    ],
    [
      "SIDEC du Jura",
      "Syndicat mixte d’énergies, d’équipements et de communication du Jura ; délégués désignés par le conseil.",
      [
        ["garnier", "primary"],
        ["roussel", "alternate"],
      ],
    ],
    [
      "Parc naturel régional du Haut-Jura",
      "Syndicat mixte du parc ; délégués désignés par le conseil.",
      [
        ["fontaine", "primary"],
        ["carre", "alternate"],
      ],
    ],
    [
      "Syndicat horticole et d’embellissement de la région de Champagnole",
      "Fleurissement du village.",
      [["durand", "primary"]],
    ],
  ];
  for (const [name, description, memberships] of delegations) {
    const delegation = await post("/council-delegations", { name, description });
    for (const [person, role] of memberships) {
      await post(`/council-delegations/${delegation.id}/memberships`, {
        contactId: contacts[person],
        role,
        startedOn: termStartedOn,
      });
    }
  }

  console.log("- Comptes");
  const usersSpec = [
    { ...foncineAdministrator, roles: ["administrator"], contactId: null },
    { email: "secretariat@foncine-le-bas.example", displayName: fullName("colin"), roles: ["clerk"], contactId: null },
    {
      email: "technique@foncine-le-bas.example",
      displayName: fullName("leroy"),
      roles: ["contributor"],
      contactId: null,
    },
    {
      email: "nicolas.garnier@foncine-le-bas.example",
      displayName: fullName("garnier"),
      roles: ["councillor"],
      contactId: contacts.garnier,
    },
    {
      email: "laure.morin@foncine-le-bas.example",
      displayName: fullName("morin"),
      roles: ["councillor"],
      contactId: contacts.morin,
    },
  ];
  for (const user of usersSpec) {
    if (user.email !== signedInEmail) await post("/users", { ...user, password });
  }
  for (const user of usersSpec) {
    const authenticated = await post("/auth/login", { email: user.email, password });
    if (authenticated.email !== user.email || user.roles.some((role) => !authenticated.roles.includes(role))) {
      throw new Error(`Le compte de démonstration ${user.email} ne restitue pas les rôles attendus`);
    }
  }
  console.log(`  Mot de passe de démonstration : ${password}`);

  console.log("- Groupes de destinataires");
  const memberRecipient = (key) => ({ name: fullName(key), address: mailbox(key), contactId: contacts[key] });
  const groups = {};
  for (const [key, name, list] of [
    ["council", "Conseil municipal", membersSpec.map(([person]) => memberRecipient(person))],
    ["roads", "Commission Voirie", committeeSpec.roads[2].map(([person]) => memberRecipient(person))],
    [
      "associations",
      "Associations du village",
      associationContacts.map(([association]) => ({
        name: associations[association],
        address: associationAddresses[association],
        contactId: contacts[association],
      })),
    ],
  ]) {
    groups[key] = await post("/mail-recipient-groups", { name, members: list });
  }
  return { members, contacts, committees, groups, usersSpec };
}
