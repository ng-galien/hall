import { associations, companies, fullName } from "./names.mjs";

const decision = (title, visas, considerations, decisions) =>
  `## ${title}\n\nLe conseil municipal,\n\n${visas.map((visa) => `Vu ${visa} ;`).join("\n\n")}\n\n${considerations
    .map((text) => `Considérant ${text} ;`)
    .join(
      "\n\n",
    )}\n\nAprès en avoir délibéré,\n\n**Décide :**\n\n${decisions.map((text, index) => `${index + 1}. ${text}`).join("\n")}`;
const cgct = "le code général des collectivités territoriales";

/**
 * The ten businesses of the dataset: folder, committees, report and prepared subjects.
 * `report` receives the references of the created resources, so a report can cite them once they exist.
 */
export const businesses = [
  {
    key: "montNoir",
    path: "Voirie",
    name: "Réfection du chemin communal du Mont Noir",
    committees: ["roads", "finances"],
    report: (
      ref = {},
    ) => `La commune programme l’entretien de la voie communale qui dessert le lieu-dit le Mont Noir, sur 564 mètres. Le programme comprend le reprofilage de la chaussée et le traitement des ornières sur toute la longueur, le curage du fossé, la reprise d’un accotement, le remplacement d’une buse en fin de vie et un enrobé neuf sur la partie en pente, longue de 160 mètres.

${ref.photo ?? ""}

Un habitant a écrit à la mairie pour signaler l’usure de la voie (${ref.letter ?? "courrier des riverains"}) ; la maire lui a répondu que les travaux seraient présentés au conseil. ${ref.garnier ?? fullName("garnier")}, premier adjoint, suit le dossier avec ${ref.bertrand ?? fullName("bertrand")} pour l’enrobé.

## Cadre

L’entretien des voies communales est une dépense obligatoire (code de la voirie routière, ${ref.l1418 ?? "article L141-8"} ; CGCT, L2321-2). Le montant, 19 350 € HT, permet de consulter directement des entreprises (code de la commande publique, R2122-8). La commune a demandé la dotation d’équipement des territoires ruraux (CGCT, L2334-32 et suivants) et l’aide départementale à la voirie communale ; le maître d’ouvrage finance au moins 20 % du projet (CGCT, L1111-10). La préfecture a accusé réception du dossier complet ; la décision d’attribution n’est pas encore notifiée.

## Travaux et devis

| Poste | Entreprise | Montant HT |
| --- | --- | ---: |
| Terrassement : reprofilage et ornières sur 564 m, curage du fossé, reprise de l’accotement | ${companies.terrassement} | 4 800 € |
| Busage : remplacement d’une buse de 400 mm, 12 m, deux têtes | ${companies.terrassement} | 2 650 € |
| Enrobé à chaud 0/10 sur la partie en pente, 160 m × 3 m = 480 m² | ${companies.revetements} | 11 900 € |
| **Total** | | **19 350 €**, soit 23 220 € TTC |

Offre comparée : ${companies.enrobes}, enrobé à 13 400 € HT. Les devis sont joints : ${ref.quotes ?? "devis de terrassement, de busage et d’enrobé"} ; le plan de situation situe la voie (${ref.plan ?? "plan de situation"}).

## Plan de financement

| Financeur | Montant HT | Part |
| --- | ---: | ---: |
| État, DETR (demandée) | 5 805 € | 30 % |
| Département du Jura, aide à la voirie communale (demandée) | 3 870 € | 20 % |
| Commune, autofinancement | 9 675 € | 50 % |
| **Total** | **19 350 €** | **100 %** |

## Carte du chemin

${ref.map ?? ""}`,
    subjects: [
      {
        key: "montNoirProgramme",
        kind: "councilDecisionProposal",
        name: "Chemin du Mont Noir : approbation du programme, plan de financement et demandes de subventions",
        content: decision(
          "Chemin du Mont Noir : approbation du programme, plan de financement et demandes de subventions",
          [
            `${cgct}, notamment ses articles L2121-29, L2321-2, L2334-32 et suivants et L1111-10`,
            "le code de la voirie routière, notamment son article L141-8",
          ],
          [
            "que la voie communale qui dessert le lieu-dit le Mont Noir demande un entretien programmé sur 564 mètres",
            "que le coût estimé des travaux s’élève à 19 350 € HT, soit 23 220 € TTC",
          ],
          [
            "d’approuver le programme d’entretien de la voie communale du Mont Noir pour un montant estimé de 19 350 € HT ;",
            "d’approuver le plan de financement : DETR 5 805 € (30 %), aide départementale 3 870 € (20 %), autofinancement 9 675 € (50 %) ;",
            "de solliciter la dotation d’équipement des territoires ruraux auprès de l’État et l’aide à la voirie communale auprès du département du Jura ;",
            "d’autoriser la maire à signer toute pièce relative à ces demandes.",
          ],
        ),
      },
      {
        key: "montNoirAward",
        kind: "councilDecisionProposal",
        name: "Réfection du chemin communal du Mont Noir : attribution des travaux",
        content: decision(
          "Réfection du chemin communal du Mont Noir : attribution des travaux",
          [
            `${cgct}, notamment ses articles L2121-29 et L2321-2`,
            "le code de la voirie routière, notamment son article L141-8",
            "le code de la commande publique, notamment son article R2122-8",
            "la délibération de la séance n° 1 approuvant le programme de travaux et son plan de financement",
            "l’accusé de réception du dossier complet de demande de dotation d’équipement des territoires ruraux",
            "les devis reçus et le comparatif établi par le secrétariat",
            "l’avis favorable de la commission Voirie",
          ],
          [
            "que l’entretien programmé de la voie communale qui dessert le lieu-dit le Mont Noir comprend, sur 564 mètres, le reprofilage de la chaussée, le curage du fossé, la reprise d’un accotement, le remplacement d’une buse et un enrobé sur la partie en pente",
          ],
          [
            "d’approuver la réfection de la voie communale du Mont Noir sur 564 mètres, pour un montant de 19 350 € HT, soit 23 220 € TTC ;",
            `de confier le terrassement et le busage à ${companies.terrassement}, pour 7 450 € HT, et l’enrobé à ${companies.revetements}, pour 11 900 € HT ;`,
            "d’autoriser la maire à signer les devis et toute pièce nécessaire à l’exécution des travaux ;",
            "de dire que les crédits sont inscrits au budget principal, section d’investissement, opération « Voirie ».",
          ],
        ),
      },
      {
        key: "worksCalendar",
        kind: "openQuestion",
        name: "Calendrier des travaux",
        content: `## Calendrier des travaux

Les entreprises proposent trois semaines de travaux. Deux organisations sont possibles :

1. fermer la voie pendant dix jours ouvrés ;
2. travailler en deux tronçons en laissant toujours un passage.

La maire prendra un arrêté de circulation (CGCT, L2213-1). Le conseil est invité à dire quelle organisation il préfère et à fixer la date de la réunion d’information des habitants.`,
      },
    ],
  },
  {
    key: "lighting",
    path: "",
    name: "Éclairage public",
    committees: ["roads", "finances"],
    report:
      () => `La commune fait rénover avec le SIDEC du Jura ses 48 points lumineux : remplacement des lanternes par des lanternes à LED et pose d’horloges astronomiques. Le chiffrage du SIDEC s’élève à 31 200 € HT.

| Financeur | Montant |
| --- | ---: |
| SIDEC du Jura | 12 480 € |
| Commune, crédits de l’opération « Éclairage public » | 18 720 € |
| **Total** | **31 200 € HT** |

La contribution de la commune est couverte par les 19 000 € de l’opération « Éclairage public » inscrits au budget primitif. La délibération approuve le programme et le principe d’une extinction de l’éclairage en milieu de nuit. Les horaires et les voies exclues relèvent d’un arrêté de la maire, au titre de la police municipale (CGCT, L2212-1 et L2212-2) : le projet d’arrêté prévoit l’extinction de 23 h 00 à 5 h 00, sauf sur la traversée principale du village.`,
    subjects: [
      {
        key: "lighting",
        kind: "councilDecisionProposal",
        name: "Éclairage public : rénovation en LED avec le SIDEC du Jura et principe d’une extinction en milieu de nuit",
        content: decision(
          "Éclairage public : rénovation en LED avec le SIDEC du Jura et principe d’une extinction en milieu de nuit",
          [`${cgct}, notamment ses articles L2121-29, L2212-1 et L2212-2`, "le chiffrage établi par le SIDEC du Jura"],
          [
            "que la rénovation des 48 points lumineux réduit la consommation d’énergie de l’éclairage public",
            "que la contribution de la commune, 18 720 €, est couverte par les crédits de l’opération « Éclairage public »",
          ],
          [
            "d’approuver le programme de rénovation de l’éclairage public établi par le SIDEC du Jura pour 31 200 € HT ;",
            "d’approuver la contribution de la commune de 18 720 € ;",
            "d’approuver le principe d’une extinction de l’éclairage public en milieu de nuit, dont les horaires et les voies exclues seront fixés par arrêté de la maire ;",
            "d’autoriser la maire à signer la convention avec le SIDEC du Jura.",
          ],
        ),
      },
    ],
  },
  {
    key: "finances",
    path: "",
    name: "Finances",
    committees: ["finances"],
    report: () =>
      `Le budget principal s’élève à 190 000 € en fonctionnement et 95 000 € en investissement. L’opération « Voirie » était dotée de 12 000 € ; la réfection du chemin du Mont Noir demande 23 220 € TTC. La décision modificative n° 1 inscrit 11 220 € supplémentaires pour la voirie et 1 680 € TTC pour l’aménagement du départ de promenade, soit 12 900 €, financés par un virement de la section de fonctionnement. La rénovation de l’éclairage public est financée par les crédits de l’opération « Éclairage public » déjà inscrits au budget primitif.`,
    subjects: [
      {
        key: "budgetAmendment",
        kind: "councilDecisionProposal",
        name: "Budget principal : décision modificative n° 1",
        content: decision(
          "Budget principal : décision modificative n° 1",
          [
            `${cgct}, notamment son article L1612-11`,
            "le budget primitif de l’exercice",
            "l’avis de la commission Finances",
          ],
          [
            "qu’il convient d’ajuster les crédits de l’opération « Voirie » et d’ouvrir les crédits de l’aménagement du départ de promenade",
          ],
          [
            "d’approuver la décision modificative n° 1 du budget principal : 11 220 € à l’opération « Voirie », 1 680 € à l’opération « Promenade », soit 12 900 € ;",
            "de financer ces crédits par un virement de la section de fonctionnement de 12 900 €.",
          ],
        ),
      },
    ],
  },
  {
    key: "forest",
    path: "",
    name: "Forêt",
    committees: ["roads"],
    report: () =>
      `La forêt communale relève du régime forestier et est gérée par l’Office national des forêts. L’ONF propose l’état d’assiette des coupes de l’exercice suivant. Les habitants qui le souhaitent reçoivent un lot de bois de chauffage (affouage) ; le conseil fixe le règlement et désigne trois garants (code forestier, L243-1).`,
    subjects: [
      {
        key: "forestCuts",
        kind: "councilDecisionProposal",
        name: "Forêt communale : état d’assiette des coupes et affouage",
        content: decision(
          "Forêt communale : état d’assiette des coupes et affouage",
          [
            "le code forestier, notamment ses articles L214-5 et L243-1",
            "la proposition d’état d’assiette de l’Office national des forêts",
          ],
          ["que les coupes proposées assurent la gestion durable de la forêt communale"],
          [
            "d’approuver l’état d’assiette des coupes proposé par l’Office national des forêts ;",
            "de destiner à l’affouage les coupes de feuillus et de vendre les résineux ;",
            "d’approuver le règlement de l’affouage ;",
            `de désigner comme garants ${fullName("garnier")}, ${fullName("roussel")} et ${fullName("carre")}.`,
          ],
        ),
      },
    ],
  },
  {
    key: "ruralPaths",
    path: "Voirie",
    name: "Chemins ruraux",
    committees: ["roads"],
    report: () =>
      `Les chemins ruraux appartiennent au domaine privé de la commune et sont affectés à l’usage du public (code rural et de la pêche maritime, L161-1) ; la maire veille à leur conservation (L161-5). La commune programme leur entretien courant : empierrement des passages ravinés, curage des renvois d’eau, fauchage des abords. Le garde-corps du pont du chemin des Serrettes sur la Sainette est à repeindre et à resceller, entretien courant.`,
    subjects: [
      {
        key: "ruralPathsProgramme",
        kind: "openQuestion",
        name: "Programme d’entretien des chemins ruraux",
        content: `## Programme d’entretien des chemins ruraux

L’inventaire recense les chemins ruraux qui desservent les pâturages. La commission Voirie propose de traiter cette année les passages ravinés et les renvois d’eau, et de faucher les abords au début de l’été.

Le conseil est invité à donner son avis sur l’ordre des chemins à traiter.`,
      },
      {
        key: "bridgeRailing",
        kind: "openQuestion",
        name: "Entretien du garde-corps du pont communal",
        content: `## Entretien du garde-corps du pont communal

Le garde-corps du pont du chemin des Serrettes sur la Sainette est écaillé et deux montants sont descellés. L’entretien courant comprend la reprise des scellements, un brossage et deux couches de peinture.

Le conseil est invité à dire si les travaux sont confiés à l’adjoint technique ou à une entreprise.`,
      },
    ],
  },
  {
    key: "walk",
    path: "",
    name: "Promenade",
    committees: ["roads", "community"],
    report: () =>
      `De nombreux promeneurs partent du Parking de la Tram’Jurassienne, au bout du chemin des Douanets, pour suivre l’ancienne voie du tram, qui franchit aussitôt la Saine par le viaduc des Douanets puis entre en forêt. La commune installe sur ce parking communal une table de pique-nique, un banc et un panneau d’information, avec l’appui du parc naturel régional du Haut-Jura.`,
    subjects: [
      {
        key: "walkFurniture",
        kind: "councilDecisionProposal",
        name: "Aménagement du départ de promenade : table, banc et panneau d’information",
        content: decision(
          "Aménagement du départ de promenade : table, banc et panneau d’information",
          [`${cgct}, notamment son article L2121-29`, "le devis du mobilier", "la décision modificative n° 1"],
          ["que le Parking de la Tram’Jurassienne est le point de départ de la promenade de l’ancienne voie du tram"],
          [
            "d’approuver l’installation d’une table de pique-nique, d’un banc et d’un panneau d’information sur le parking communal, pour 1 400 € HT, soit 1 680 € TTC ;",
            "d’autoriser la maire à signer le devis.",
          ],
        ),
      },
      {
        key: "walkRegister",
        kind: "councilDecisionProposal",
        name: "Demande d’inscription de chemins ruraux au plan départemental des itinéraires de promenade et de randonnée",
        content: decision(
          "Demande d’inscription de chemins ruraux au plan départemental des itinéraires de promenade et de randonnée",
          [
            "le code de l’environnement, notamment son article L361-1",
            "le code rural et de la pêche maritime, notamment son article L161-1",
          ],
          ["que les chemins ruraux empruntés par la promenade contribuent à la continuité des itinéraires"],
          [
            "de demander au département du Jura l’inscription au plan départemental des itinéraires de promenade et de randonnée des chemins ruraux désignés sur la carte jointe ;",
            "de s’engager à conserver leur caractère public et ouvert.",
          ],
        ),
      },
    ],
  },
  {
    key: "festivals",
    path: "",
    name: "Associations et fêtes",
    committees: ["community"],
    report:
      () => `Trois associations demandent une subvention annuelle, pour un total de 1 150 € : 500 € aux ${associations.summerFestival.replace(/^Les /, "")}, 400 € au ${associations.champDeMars}, 250 € aux ${associations.elders.replace(/^Les /, "")}. La commune prête la salle communale et le matériel communal (tables, bancs, barrières) pour les deux fêtes : la fête patronale du dernier dimanche de juillet et le vide-grenier et marché aux fleurs de la mi-juin. L’occupation du Champ de Mars pour le vide-grenier fait l’objet d’une convention ; la maire prend les arrêtés de circulation et de stationnement des jours de fête.

${fullName("morin")}, membre du bureau de l’association ${associations.summerFestival}, ne prend part ni au débat ni au vote sur les subventions (CGCT, L2131-11). La commune cotise au syndicat horticole, qui accompagne le fleurissement du village.`,
    subjects: [
      {
        key: "associationGrants",
        kind: "councilDecisionProposal",
        name: "Subventions aux associations",
        content: decision(
          "Subventions aux associations",
          [`${cgct}, notamment ses articles L2311-7 et L2131-11`, "les demandes présentées par les associations"],
          ["que les associations du village animent la vie locale et organisent les fêtes"],
          [
            `d’attribuer les subventions suivantes : ${associations.summerFestival}, 500 € ; ${associations.champDeMars}, 400 € ; ${associations.elders}, 250 € ;`,
            "de dire que les crédits sont inscrits au budget principal.",
          ],
        ),
      },
      {
        key: "champDeMarsAgreement",
        kind: "councilDecisionProposal",
        name: "Convention d’occupation du Champ de Mars et prêt du matériel communal",
        content: decision(
          "Convention d’occupation du Champ de Mars et prêt du matériel communal",
          [
            `${cgct}, notamment son article L2121-29`,
            "le code général de la propriété des personnes publiques, notamment son article L2125-1",
          ],
          [
            "que le vide-grenier et marché aux fleurs de la mi-juin est une manifestation d’intérêt local sans but lucratif",
          ],
          [
            `d’approuver la convention d’occupation temporaire et gratuite du Champ de Mars avec l’association ${associations.champDeMars} ;`,
            "d’approuver le prêt du matériel communal inscrit à l’inventaire ;",
            "d’autoriser la maire à signer la convention.",
          ],
        ),
      },
    ],
  },
  {
    key: "buildings",
    path: "",
    name: "Bâtiments",
    committees: ["finances", "community"],
    report: () =>
      `La commune remplace les menuiseries de la salle communale pour réduire les dépenses de chauffage, et met à jour le règlement de prêt de la salle aux associations et aux habitants.`,
    subjects: [
      {
        key: "hallWindows",
        kind: "councilDecisionProposal",
        name: "Salle communale : remplacement des menuiseries",
        content: decision(
          "Salle communale : remplacement des menuiseries",
          [`${cgct}, notamment son article L2121-29`, "le devis des menuiseries"],
          ["que les menuiseries anciennes de la salle communale laissent passer l’air froid"],
          [
            "d’approuver le remplacement des six fenêtres et de la porte d’entrée de la salle communale ;",
            "d’autoriser la maire à signer le devis et à solliciter les aides à la rénovation énergétique.",
          ],
        ),
      },
    ],
  },
  {
    key: "staff",
    path: "",
    name: "Personnel",
    committees: ["finances"],
    report: () =>
      `Le conseil crée un emploi non permanent d’adjoint technique pour accroissement saisonnier d’activité, pour l’entretien des espaces publics et du fleurissement pendant la belle saison (code général de la fonction publique, L313-1 et L332-23).`,
    subjects: [
      {
        key: "seasonalJob",
        kind: "councilDecisionProposal",
        name: "Création d’un emploi saisonnier d’entretien des espaces publics",
        content: decision(
          "Création d’un emploi saisonnier d’entretien des espaces publics",
          ["le code général de la fonction publique, notamment ses articles L313-1 et L332-23"],
          ["que l’entretien des espaces publics et du fleurissement demande un renfort pendant la belle saison"],
          [
            "de créer un emploi non permanent d’adjoint technique à temps complet pour accroissement saisonnier d’activité, pour une durée de six mois au plus sur douze mois ;",
            "de dire que les crédits sont inscrits au budget principal.",
          ],
        ),
      },
    ],
  },
  {
    key: "intercommunality",
    path: "",
    name: "Intercommunalité",
    committees: [],
    report: () =>
      `La maire présente au conseil le rapport d’activité de la communauté de communes Champagnole Nozeroy Jura (CGCT, L5211-39). Le conseil désigne ses délégués titulaire et suppléant au SIDEC du Jura.`,
    subjects: [
      {
        key: "ccReport",
        kind: "openQuestion",
        name: "Rapport d’activité de la communauté de communes",
        content: `## Rapport d’activité de la communauté de communes

La maire présente le rapport d’activité de la communauté de communes Champagnole Nozeroy Jura, transmis aux communes membres (CGCT, L5211-39). Le rapport est joint au dossier.`,
      },
      {
        key: "sidecPrimary",
        kind: "councilDecisionProposal",
        name: "Désignation du délégué titulaire au SIDEC du Jura",
        content: decision(
          "Désignation du délégué titulaire au SIDEC du Jura",
          [`${cgct}, notamment ses articles L2121-21, L2121-33 et L5711-1`, "les statuts du SIDEC du Jura"],
          ["que la désignation a lieu au scrutin secret, s’agissant d’une nomination"],
          [`de désigner ${fullName("garnier")} délégué titulaire de la commune au SIDEC du Jura.`],
        ),
      },
      {
        key: "sidecAlternate",
        kind: "councilDecisionProposal",
        name: "Désignation du délégué suppléant au SIDEC du Jura",
        content: decision(
          "Désignation du délégué suppléant au SIDEC du Jura",
          [`${cgct}, notamment ses articles L2121-21, L2121-33 et L5711-1`, "les statuts du SIDEC du Jura"],
          ["que la désignation a lieu au scrutin secret, s’agissant d’une nomination"],
          [`de désigner ${fullName("roussel")} délégué suppléant de la commune au SIDEC du Jura.`],
        ),
      },
    ],
  },
  {
    key: "digital",
    path: "",
    name: "Numérique",
    committees: [],
    report:
      () => `La commune prépare ses séances, ses convocations, ses procès-verbaux et ses délibérations avec Hall, logiciel libre diffusé sous la licence publique de l’Union européenne (EUPL 1.2). La licence ne coûte rien ; Hall est installé sur l’équipement informatique de la mairie. Chaque élu reçoit un compte rattaché à son mandat, avec un dossier personnel dans « Espaces personnels ».

Les convocations sont transmises par voie dématérialisée à l’adresse électronique de chaque conseiller ; un élu qui le demande par écrit les reçoit à son domicile (CGCT, L2121-10). La prise en main demande une séance de deux heures pour les élus et une séance complémentaire d’une heure et demie sur le téléphone ; le secrétariat consacre environ une demi-journée à la création des comptes et à la remise des accès.

${fullName("morin")} est l’élue référente pour la prise en main.`,
    subjects: [
      {
        key: "hallUse",
        kind: "councilDecisionProposal",
        name: "Numérique : utilisation de Hall et transmission dématérialisée des convocations",
        content: decision(
          "Numérique : utilisation de Hall et transmission dématérialisée des convocations",
          [`${cgct}, notamment ses articles L2121-10 et L2121-29`, "la note de présentation sur l’utilisation de Hall"],
          [
            "que la commune prépare et conduit ses séances avec Hall, logiciel libre diffusé sous la licence publique de l’Union européenne, sans coût de licence",
            "que la convocation est transmise de manière dématérialisée ou, si le conseiller en fait la demande, adressée par écrit à son domicile",
          ],
          [
            "d’approuver l’utilisation de Hall pour préparer les affaires et les séances du conseil, conduire les séances et produire les procès-verbaux et les délibérations ;",
            "de transmettre les convocations et le dossier de séance à l’adresse électronique de chaque conseiller, sauf demande écrite d’envoi au domicile ;",
            "d’ouvrir à chaque conseiller un compte personnel et d’organiser une séance de prise en main ;",
            `de désigner ${fullName("morin")} comme élue référente pour la prise en main.`,
          ],
        ),
      },
      {
        key: "hallOnboarding",
        kind: "openQuestion",
        name: "Prise en main de Hall par les élus",
        content: `## Prise en main de Hall par les élus

${fullName("morin")} présente le déroulé : création des comptes par le secrétariat, séance de prise en main tenue en salle du conseil, guide remis aux élus, comptes restant à ouvrir. Le conseil prend connaissance du calendrier de la séance complémentaire sur le téléphone.`,
      },
      {
        key: "hallFollowUp",
        kind: "openQuestion",
        name: "Hall : suite de la prise en main",
        content: `## Hall : suite de la prise en main

Le conseil est invité à dire si une seconde séance complémentaire est utile et si les commissions préparent aussi leurs réunions dans Hall.`,
      },
    ],
  },
];

export async function seedBusinesses({ post }, { committees }) {
  console.log("- Affaires, rapports, projets et questions");
  const created = {};
  const subjects = new Map();
  for (const business of businesses) {
    const record = await post("/council-business", {
      path: business.path,
      name: business.name,
      reportName: "Rapport",
      reportContent: business.report(),
    });
    created[business.key] = {
      ...record,
      folderPath: business.path ? `${business.path}/${business.name}` : business.name,
      definition: business,
    };
    for (const committee of business.committees) {
      await post(`/council-business/${record.id}/committees`, { committeeId: committees[committee].id });
    }
    for (const subject of business.subjects) {
      subjects.set(
        subject.key,
        await post(`/council-business/${record.id}/prepared-subjects`, {
          kind: subject.kind,
          name: subject.name,
          content: subject.content,
        }),
      );
    }
  }
  console.log(`  ${businesses.length} affaires, ${subjects.size} sujets préparés`);
  return { businesses: created, subjects };
}
