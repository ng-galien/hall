/**
 * Every name of a person, a company and an association of the Foncine-le-Bas dataset.
 * All of them are fictional. The loader, the texts and the document generator read them here only:
 * a name changes in this table, then `node scripts/seed/generate-foncine-le-bas-files.mjs` rewrites the files.
 */
export const people = {
  marchand: { firstName: "Hélène", lastName: "Marchand" },
  garnier: { firstName: "Nicolas", lastName: "Garnier" },
  renaud: { firstName: "Isabelle", lastName: "Renaud" },
  robert: { firstName: "Anne", lastName: "Robert" },
  lefort: { firstName: "Julien", lastName: "Lefort" },
  durand: { firstName: "Sylvie", lastName: "Durand" },
  roussel: { firstName: "Pascal", lastName: "Roussel" },
  morin: { firstName: "Laure", lastName: "Morin" },
  carre: { firstName: "Damien", lastName: "Carré" },
  fontaine: { firstName: "Camille", lastName: "Fontaine" },
  mathieu: { firstName: "Olivier", lastName: "Mathieu" },
  colin: { firstName: "Sandrine", lastName: "Colin" },
  leroy: { firstName: "Yannick", lastName: "Leroy" },
  dubois: { firstName: "Marc", lastName: "Dubois" },
  bertrand: { firstName: "Élise", lastName: "Bertrand" },
  moreau: { firstName: "Thierry", lastName: "Moreau" },
  aubry: { firstName: "Christine", lastName: "Aubry" },
  roche: { firstName: "Mathieu", lastName: "Roche" },
  faure: { firstName: "Romain", lastName: "Faure" },
  girard: { firstName: "Stéphane", lastName: "Girard" },
  bonnet: { firstName: "Agathe", lastName: "Bonnet" },
  lambert: { firstName: "Ghislaine", lastName: "Lambert" },
  legoff: { firstName: "Yann", lastName: "Le Goff" },
  michel: { firstName: "Agnès", lastName: "Michel" },
  simon: { firstName: "Gérard", lastName: "Simon" },
};

/** Fictional companies; real public bodies keep their real names in the dataset texts. */
export const companies = {
  terrassement: "Leclerc-Varenne Terrassement",
  revetements: "Revêtements Bertrand",
  enrobes: "Enrobés Moreau",
  mobilier: "Atelier Bois et Mobilier Urbain",
  menuiseries: "Menuiseries du Plateau",
};

export const associations = {
  summerFestival: "Les Fêtes d’été du village",
  champDeMars: "Comité d’animation du Champ de Mars",
  elders: "Les Aînés du Mardi",
};

export const fullName = (key) => {
  const person = people[key];
  if (!person) throw new Error(`Unknown Foncine-le-Bas person: ${key}`);
  return `${person.firstName} ${person.lastName}`;
};

/** Mailbox of a person of the dataset, in the reserved documentation domain. */
export const mailbox = (key) =>
  `${people[key].firstName}.${people[key].lastName}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z.]/g, "")
    .concat("@foncine-le-bas.example");

export const demonstrationIntroduction = "Démonstration dans une vraie commune de France : Foncine-le-Bas, Jura.";
export const demonstrationNotice = "Données de démonstration : réalistes, mais fictives.";
