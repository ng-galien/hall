import { daysFromNow } from "../../common/dates.mjs";
import { seedBusinesses } from "./businesses.mjs";
import { seedDirectory } from "./directory.mjs";
import { seedResources } from "./resources.mjs";
import { seedTemplates } from "./templates.mjs";

export async function seedAlesia(api, options) {
  const { members, memberContactIds, caesarContactId } = await seedDirectory(api, { daysFromNow, ...options });
  await seedResources(api, { daysFromNow, memberContactIds, caesarContactId });
  const subjects = await seedBusinesses(api);
  await seedTemplates(api);
  const memberLabels = {
    Commius: "Commius l’Atrébate",
    Convictolitavis: "Convictolitavis l’Éduen",
    Critognatos: "Critognatos l’Arverne",
    Drappès: "Drappès le Sénon",
    Éporédorix: "Éporédorix l’Éduen",
    Luctérios: "Luctérios le Cadurque",
    Merlin: "Merlin l’Enchanteur",
    Vercassivellaunos: "Vercassivellaunos l’Arverne",
    Vercingétorix: "Vercingétorix l’Arverne",
    Viridomaros: "Viridomaros l’Éduen",
  };
  const memberRef = (firstName) => {
    const member = members[firstName];
    const label = memberLabels[firstName];
    if (!member || !label) throw new Error(`Unknown seeded member: ${firstName}`);
    return `:member[${label}]{#${member.id}}`;
  };
  return {
    meetingLocation: "Maison commune de l’oppidum",
    discussions: {
      firstDecision: `### Présentation de l’inventaire

${memberRef("Commius")} présente l’état des réserves établi le matin même. Le grenier de Cornu contient **120 sacs de céréales**, répartis entre les deux espaces couverts.

${memberRef("Vercingétorix")} demande que chaque sortie soit inscrite sur le registre tenu par les gardiens et qu’un relevé soit présenté lors de la prochaine séance.

Les mesures suivantes sont retenues :

- placer les deux espaces du grenier sous garde permanente ;
- réserver 20 sacs aux besoins urgents ;
- tenir un décompte quotidien des entrées et des sorties.

> Le conseil rappelle que l’affectation du grenier ne préjuge pas de la répartition future des vivres.`,
      rejectedDecision: `### Répartition proposée

Le projet prévoit d’affecter **80 sacs aux abris** et **40 sacs aux équipes chargées des défenses**.

${memberRef("Critognatos")} conteste cette répartition. Il estime que les réserves disponibles ne permettent pas de garantir les besoins des familles jusqu’à la prochaine livraison.

${memberRef("Viridomaros")} demande que soient précisés :

1. le nombre de personnes accueillies dans chaque abri ;
2. la consommation moyenne constatée sur les sept derniers jours ;
3. la quantité déjà remise aux équipes de travail.

Après discussion, le président maintient le projet au vote. **Aucune répartition de remplacement n’est proposée.**`,
      information: `### Situation des abris

${memberRef("Viridomaros")} fait état de **142 habitants accueillis** dans les abris. Les capacités restent suffisantes, mais plusieurs besoins immédiats sont signalés.

- renouveler les couvertures dans l’abri nord ;
- protéger les deux points d’eau utilisés la nuit ;
- dégager un passage pour les blessés et les porteurs ;
- préparer 20 places supplémentaires en cas d’évacuation.

${memberRef("Merlin")} demande que les couvertures les plus épaisses soient réservées aux blessés. ${memberRef("Luctérios")} vérifiera avec les charpentiers si les cloisons peuvent être déplacées sans fragiliser les abris.

La question des places supplémentaires reste à instruire avant toute décision.`,
      secondDecision: `### Moyens demandés

${memberRef("Luctérios")} présente les besoins consolidés des trois équipes :

| Équipe | Journées de travail | Allocation |
| --- | ---: | ---: |
| Abris | 24 | 48 quinaires |
| Convois intérieurs | 16 | 32 quinaires |
| Réserves | 9 | 18 quinaires |
| **Total** | **49** | **98 quinaires** |

${memberRef("Convictolitavis")} propose un compte rendu commun afin de comparer les moyens engagés aux travaux effectivement réalisés.

Le conseil demande aux responsables de conserver les justificatifs de dépense et de signaler toute réaffectation entre équipes.`,
      secretDecision: `### Liaison avec les alliés

${memberRef("Commius")} expose les derniers contacts établis avec les alliés au-delà des lignes romaines. Deux passages restent envisageables, mais aucun ne peut être considéré comme sûr.

${memberRef("Éporédorix")} présente les risques observés :

- surveillance renforcée à l’est après le coucher du soleil ;
- terrain découvert sur la partie centrale du trajet ;
- possibilité d’un passage plus long par les bois du nord.

Le conseil examine le message à confier aux messagers et décide de ne pas inscrire dans le procès-verbal l’identité des porteurs. Le scrutin se déroule à bulletin secret.`,
      currentDecision: `### Renforcement de la seconde ligne

${memberRef("Vercassivellaunos")} présente le chiffrage préparé avec les artisans :

- **96 poutres** à 2 quinaires ;
- **60 hottes de pierre** à 1 quinaire ;
- **30 journées de transport** à 1 quinaire ;
- soit un total de **282 quinaires d’argent séquanes**.

${memberRef("Drappès")} demande que le chemin du grenier reste accessible aux porteurs pendant les travaux. Il propose de déplacer le dépôt de pierre vers la partie sud du chantier.

Après échange, le conseil retient deux conditions d’exécution :

1. maintenir un couloir de circulation balisé entre le grenier et les abris ;
2. présenter chaque soir l’avancement des travaux et les matériaux consommés.

${memberRef("Vercingétorix")} soumet le projet ainsi précisé au scrutin public.`,
      approval: `### Lecture du procès-verbal précédent

${memberRef("Convictolitavis")} relit les passages relatifs aux réserves, aux pouvoirs et aux résultats des scrutins. Les membres vérifient les quantités consignées ainsi que les noms des conseillers ayant pris part aux votes.

Deux corrections de forme sont demandées :

- préciser que les 20 sacs conservés constituent une réserve gardée ;
- remplacer « chemin principal » par « chemin du grenier » dans le compte rendu des échanges.

Ces corrections ne modifient aucune décision. Le procès-verbal corrigé est soumis à l’approbation du conseil.`,
      deferredQuestion: `### État des couvertures

${memberRef("Viridomaros")} signale plusieurs couvertures affaissées à proximité du grenier. ${memberRef("Luctérios")} estime qu’une visite des charpentiers est nécessaire avant toute attribution de bois.

Points à vérifier :

- stabilité des appuis contre le mur nord ;
- quantité de bois réutilisable ;
- priorité entre les abris occupés et les espaces de réserve.

Le conseil ne dispose pas d’un diagnostic suffisant pour arrêter les réparations. La question est ajournée et sera reprise après la visite des artisans.`,
      editableMinutes: `### Diagnostic présenté en séance

${memberRef("Viridomaros")} décrit les couvertures affaissées près du grenier et les infiltrations observées après la dernière pluie. Deux abris occupés sont concernés ; le passage vers le point d’eau reste praticable.

${memberRef("Luctérios")} propose de faire intervenir les charpentiers avant d’attribuer le bois disponible. Il distingue les travaux urgents des améliorations qui peuvent attendre la prochaine livraison.

#### Points à reprendre dans le procès-verbal

- consigner la visite des deux abris concernés ;
- joindre l’estimation des poutres réutilisables ;
- préciser que le conseil **ne décide pas encore les travaux** ;
- présenter le diagnostic à la prochaine séance.

> La commission doit revenir avec une estimation séparant la mise en sécurité immédiate et la réfection complète.

La rédaction reste modifiable avant la génération du document.`,
      pendingQuestion: `### Organisation des convois

${memberRef("Drappès")} présente les difficultés rencontrées sur le chemin reliant le grenier aux abris. Le croisement des porteurs et des chariots ralentit les distributions au passage le plus étroit.

Deux solutions sont comparées :

1. séparer les heures de départ et de retour des convois ;
2. aménager un point de croisement gardé à mi-chemin.

${memberRef("Vercassivellaunos")} demande de conserver un accès permanent pour les équipes chargées des défenses. ${memberRef("Commius")} propose un essai sur deux journées avant de choisir une organisation définitive.

**Suite retenue :** expérimenter des créneaux séparés et présenter un relevé des temps de parcours à la prochaine séance.`,
    },
    roster: {
      all: Object.values(members),
      chair: members["Vercingétorix"],
      secretary: members["Convictolitavis"],
      proxyGiver: members["Dumnacos"],
      proxyHolder: members["Vercassivellaunos"],
      excused: members["Cotuatos"],
      absent: members["Conconnetodumnos"],
    },
    subjects: new Map([
      ["firstDecision", subjects.get("granaryAllocation")],
      ["rejectedDecision", subjects.get("grainAllocation")],
      ["information", subjects.get("shelterReport")],
      ["secondDecision", subjects.get("supportFunding")],
      ["secretDecision", subjects.get("alliedCoordination")],
      ["deferredQuestion", subjects.get("shelterStudy")],
      ["currentDecision", subjects.get("secondDefenseLine")],
      ["pendingQuestion", subjects.get("convoyAccess")],
    ]),
    proxyDocument: {
      title: "Pouvoir de Dumnacos à Vercassivellaunos",
      fileName: "pouvoir-demo.pdf",
      folderPath: "",
      lines: [
        "CONSEIL D’ALESIA",
        "Dumnacos l’Andécave donne pouvoir a Vercassivellaunos l’Arverne pour la seance du conseil.",
        "Dumnacos reste auprès des porteurs ; Vercassivellaunos le représente au conseil.",
      ],
    },
  };
}
