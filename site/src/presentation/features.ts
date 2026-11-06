import { publicFileUrl, siteRoot } from "../site-root";
import { glyphs, type PieceKind, svgIcon } from "./icons";

/**
 * Partie qui suit l'animation : fonctionnalités, règles appliquées, données, publics, démonstration.
 * Chaque affirmation reprend une exigence du catalogue (requirements/catalog.json), notée en commentaire.
 * Variante a : capture et colonne de texte en alternance. Variante b : onglets par fonctionnalité (?texte=a|b).
 */

interface Feature {
  id: string;
  icon: PieceKind;
  title: string;
  lead: string;
  capture?: string;
  alt?: string;
  points: string[];
}

const features: Feature[] = [
  {
    id: "affaires",
    icon: "business",
    title: "Affaires et pièces",
    lead: "Chaque sujet du conseil a son affaire. Devis, courriers, photos et textes y restent jusqu’au vote, puis pendant les travaux.",
    capture: "affaires.png",
    alt: "Fiche d’une affaire : rapport, commission, projets et documents.",
    points: [
      "Dossier et rapport créés avec l’affaire", // WSP-010
      "Une pièce jointe reste aussi rangée dans son dossier", // WSP-140
      "Projets de délibération et questions rédigés dans l’affaire", // BUS-050, BUS-060
      "Rattachement aux commissions concernées", // BUS-070
      "Affaire ouverte après le vote, pour suivre les travaux", // WSP-430
    ],
  },
  {
    id: "espace",
    icon: "folder",
    title: "Espace de travail",
    lead: "Les documents de la mairie, rangés en dossiers et partagés entre le secrétariat et les élus.",
    capture: "espace-de-travail.png",
    alt: "Espace de travail : dossiers, affaires, textes et fichiers.",
    points: [
      "Textes, tableurs, PDF et liens vers des pages web", // DOC-550, DOC-190
      "Recherche d’un document par son titre", // SRC-010
      "Auteur et date de chaque modification", // DOC-280
      "Un dossier personnel pour chaque conseiller", // WSP-380
    ],
  },
  {
    id: "cartes",
    icon: "geographic",
    title: "Cartes",
    lead: "Vous dessinez les travaux sur la carte de la commune et vous les mesurez.",
    capture: "cartes.png",
    alt: "Carte avec points, tracés, zones et légende.",
    points: [
      "Points, tracés et zones sur le fond de carte IGN", // WSP-360, DOC-450 ; fond IGN vérifié dans le client
      "Longueurs et surfaces mesurées, gardées dans la carte", // DOC-410, DOC-460
      "Cadastre en couche, avec les numéros de parcelles", // DOC-320, DOC-370
      "Une note et des photos sur chaque dessin", // DOC-430
    ],
  },
  {
    id: "preparation",
    icon: "agenda",
    title: "Préparation de séance",
    lead: "Ordre du jour, convocation et dossier des élus partent des affaires, sans ressaisie.",
    capture: "preparation.png",
    alt: "Ordre du jour d’une séance, avec les sujets préparés.",
    points: [
      "Points classés : procès-verbal, projets, puis questions", // AGI-030, AGI-380
      "Convocation produite d’après votre modèle", // NOT-060, DOC-580
      "Délai de convocation rappelé sur la fiche de séance", // NOT-130
      "Rapports, projets et pièces réunis en un seul document", // NOT-120
    ],
  },
  {
    id: "seance",
    icon: "matter",
    title: "Séance et vote",
    lead: "Vous conduisez la séance point par point, sur ordinateur ou sur téléphone. Les élus la suivent en direct.",
    capture: "seance.png",
    alt: "Mode séance : ordre du jour, point en discussion et pièces.",
    points: [
      "Appel, pouvoirs et quorum sur un seul écran", // MTG-300
      "Point en cours affiché sur l’écran de chaque élu", // MTG-320
      "Vote public nominatif, ou à bulletin secret", // VOT-030
      "Résultat calculé, enregistré après votre confirmation", // BAL-260, BAL-320
    ],
  },
  {
    id: "actes",
    icon: "adopted",
    title: "Procès-verbal et délibérations",
    lead: "Le procès-verbal et les délibérations reprennent les notes et les votes de la séance.",
    capture: "deliberation.png",
    alt: "Rédaction d’une délibération adoptée, avant son gel.",
    points: [
      "Brouillon de délibération ouvert après le vote", // DEC-020
      "Délibération figée, numérotée et datée", // DEC-050, DEC-090
      "Projet de procès-verbal à la clôture", // MIN-080
      "Liste des délibérations prête pour l’affichage", // MIN-270
      "Modèles de documents adaptés à votre commune", // DOC-580
    ],
  },
  {
    id: "mcp",
    icon: "share",
    title: "Votre assistant IA",
    lead: "Vous utilisez déjà un assistant IA ? Hall peut lui ouvrir vos dossiers, avec vos droits. Comment ça marche : Hall fournit un connecteur. Vous l’ajoutez une fois dans votre assistant, puis vous vous identifiez avec votre compte Hall. Il reste une aide : les décisions appartiennent au conseil.", // WSP-470
    points: [],
  },
];

const rules: string[] = [
  "Quorum compté sur les élus en exercice présents, sans les pouvoirs", // MTG-270, MTG-020
  "Un seul pouvoir par élu, valable trois séances consécutives au plus", // ATT-050, ATT-160
  "Majorité calculée sur les suffrages exprimés, abstentions exclues", // BAL-150, BAL-160
  "En vote public, voix prépondérante du président en cas d’égalité", // BAL-180
  "Délai de convocation compté en jours francs", // NOT-110
  "Approbation du procès-verbal en premier point de la séance suivante", // AGI-030
];

const data: string[] = [
  "Installation sur un serveur ou sur un poste de la mairie", // TR-DST-020, TR-DSK-010
  "Sauvegardes datées, contrôlées par une restauration d’essai", // TR-DST-020
  "Accès par compte, selon ce que chacun doit faire", // USR-050, USR-060
  "Un compte retiré n’a plus accès, immédiatement", // USR-010, USR-020
  "Export de tout ce que le compte peut lire", // USR-050
];

/* Travail d'équipe : USR-050 (tout compte lit Hall), WSP-400 (chaque conseiller lit l'espace, les affaires et les
   procès-verbaux), BUS-070 (chaque commission retrouve ses affaires), DOC-280 et MTG-320 (modifications datées par
   auteur, séance suivie en direct). */
const teamwork = {
  text: "Secrétariat, maire, adjoints et conseillers travaillent sur les mêmes dossiers. Chacun prépare, relit et suit les affaires du conseil, au même endroit.",
  points: [
    "Les mêmes dossiers pour toute l’équipe",
    "Chacun voit ce qui le concerne",
    "Les modifications de chacun visibles par tous",
  ],
};

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function icon(kind: PieceKind, className = "f-icon"): HTMLElement {
  const node = element("span", className);
  node.style.color = glyphs[kind].color;
  node.innerHTML = svgIcon(kind);
  return node;
}

function pointList(points: string[]): HTMLElement {
  const list = element("ul", "f-points");
  for (const point of points) {
    const item = element("li", "");
    item.append(icon("check", "f-check"), document.createTextNode(point));
    list.append(item);
  }
  return list;
}

/** Illustration de l'assistant IA : petit robot au trait des icônes de Hall. */
function robot(): HTMLElement {
  const box = element("div", "f-capture f-capture-empty f-robot");
  box.setAttribute("role", "img");
  box.setAttribute("aria-label", "Un petit robot : votre assistant IA, relié à vos dossiers.");
  box.innerHTML = `<svg viewBox="0 0 160 160" aria-hidden="true">
    <g fill="none" stroke="#334155" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
      <line x1="80" y1="30" x2="80" y2="46"/>
      <rect x="40" y="46" width="80" height="58" rx="18"/>
      <path d="M40 72h-8M120 72h8"/>
      <path d="M62 104v10h36v-10"/>
      <rect x="52" y="114" width="56" height="26" rx="10"/>
      <path d="M68 90q12 8 24 0"/>
    </g>
    <circle class="f-robot-antenna" cx="80" cy="24" r="7" fill="#1f5fbf"/>
    <g class="f-robot-eyes" fill="#1f5fbf">
      <rect x="58" y="64" width="12" height="14" rx="6"/>
      <rect x="90" y="64" width="12" height="14" rx="6"/>
    </g>
  </svg>`;
  return box;
}

function capture(feature: Feature): HTMLElement {
  if (feature.id === "mcp") return robot();
  if (!feature.capture) {
    const box = element("div", "f-capture f-capture-empty");
    box.append(icon(feature.icon, "f-capture-icon"));
    return box;
  }
  const image = element("img", "f-capture");
  image.src = publicFileUrl(`captures/${feature.capture}`);
  image.alt = feature.alt ?? "";
  image.loading = "lazy";
  image.width = 1200;
  image.height = 750;
  const figure = element("figure", "f-figure");
  figure.append(image, element("figcaption", "f-caption", "Application de démonstration, données fictives"));
  return figure;
}

function heading(feature: Feature, tag: "h3" | "p" = "h3"): HTMLElement {
  const node = element(tag, "f-title");
  node.append(icon(feature.icon), document.createTextNode(feature.title));
  return node;
}

function editorial(root: HTMLElement) {
  for (const feature of features) {
    const row = element("article", "f-row");
    const words = element("div", "f-words");
    words.append(heading(feature), element("p", "f-lead", feature.lead));
    if (feature.points.length) words.append(pointList(feature.points));
    row.append(capture(feature), words);
    root.append(row);
  }
}

function tabbed(root: HTMLElement) {
  const box = element("div", "f-tabs");
  const list = element("div", "f-tablist");
  list.setAttribute("role", "tablist");
  const panel = element("div", "f-tabpanel");
  panel.setAttribute("role", "tabpanel");
  const buttons = features.map((feature, index) => {
    const button = element("button", "f-tab");
    button.type = "button";
    button.setAttribute("role", "tab");
    button.append(icon(feature.icon), element("span", "", feature.title));
    button.addEventListener("click", () => select(index));
    list.append(button);
    return button;
  });
  function select(index: number) {
    const feature = features[index];
    buttons.forEach((button, i) => {
      button.setAttribute("aria-selected", String(i === index));
      button.tabIndex = i === index ? 0 : -1;
    });
    const words = element("div", "f-panel-words");
    words.append(heading(feature, "p"), element("p", "f-lead", feature.lead));
    if (feature.points.length) words.append(pointList(feature.points));
    panel.replaceChildren(capture(feature), words);
  }
  list.addEventListener("keydown", (event) => {
    const current = buttons.findIndex((button) => button.getAttribute("aria-selected") === "true");
    const step =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    event.stopPropagation();
    const next = (current + step + buttons.length) % buttons.length;
    select(next);
    buttons[next].focus();
  });
  select(0);
  box.append(list, panel);
  root.append(box);
}

function block(title: string, kind: PieceKind, body: HTMLElement): HTMLElement {
  const section = element("section", "f-block");
  const head = element("h3", "f-block-title");
  head.append(icon(kind), document.createTextNode(title));
  section.append(head, body);
  return section;
}

export function renderFeatures(variant: "a" | "b") {
  const root = document.querySelector(".p-more-inner") as HTMLElement | null;
  if (!root) return;
  root.replaceChildren();
  root.dataset.variant = variant;
  const kicker = element("p", "f-kicker", "En savoir plus");
  const heading2 = element("h2", "f-heading", "Fonctionnalités");
  heading2.id = "en-savoir-plus-titre";
  root.append(kicker, heading2);
  const list = element("div", "f-list");
  if (variant === "b") tabbed(list);
  else editorial(list);
  root.append(list);

  const blocks = element("div", "f-blocks");
  blocks.append(
    block("Les règles du conseil, appliquées", "rule", pointList(rules)),
    block("Vos données", "folder", pointList(data)),
  );
  const team = element("div", "f-team");
  team.append(element("p", "f-team-text", teamwork.text), pointList(teamwork.points));
  blocks.append(block("Un travail d’équipe", "committee", team));
  const demo = element("div", "f-demo");
  const demoText = element(
    "p",
    "",
    "La démonstration se passe à Alésia, une commune inventée. Élus, affaires, séances et documents y sont fictifs.",
  );
  const demoLink = element("a", "p-button is-quiet", "Ouvrir la démonstration");
  demoLink.href = `${siteRoot}demonstration/`;
  demo.append(demoText, demoLink);
  blocks.append(block("La démonstration", "business", demo));
  root.append(blocks);
}
