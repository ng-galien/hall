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
  return {
    meetingLocation: "Maison commune de l’oppidum",
    discussions: {
      firstDecision: "Commius présente l’inventaire des 120 sacs. Vercingétorix demande de mettre les deux espaces du grenier sous garde et de tenir le compte des sorties.",
      rejectedDecision: "Critognatos conteste le partage de 80 sacs pour les abris et 40 pour les équipes. Viridomaros demande de revoir les besoins des familles avant de prélever les réserves. Le projet est soumis au vote sans répartition de remplacement.",
      information: "Viridomaros fait état de 142 habitants dans les abris. Merlin l’Enchanteur demande des couvertures pour les blessés et la protection de deux points d’eau. La possibilité de dégager 20 places supplémentaires reste à étudier.",
      secondDecision: "Luctérios présente 49 journées de travail : 24 pour les abris, 16 pour les convois intérieurs et 9 pour les réserves. Il propose 48, 32 et 18 quinaires d’argent séquanes pour ces équipes, soit 98 quinaires. Les responsables rendront compte des dépenses.",
      secretDecision: "Commius expose les contacts avec les alliés. Éporédorix précise les risques du passage entre les lignes romaines. Le conseil examine le message à confier aux messagers.",
      currentDecision: "Vercassivellaunos demande 96 poutres, 60 hottes de pierre et 30 journées de transport pour renforcer la seconde ligne. Le chiffrage atteint 282 quinaires d’argent séquanes. Drappès demande de maintenir le chemin du grenier accessible aux porteurs.",
      approval: "Convictolitavis relit le compte rendu. Le conseil vérifie les quantités consignées et les résultats des scrutins précédents.",
      deferredQuestion: "Viridomaros et Luctérios doivent examiner les couvertures des abris avant d’arrêter la liste des réparations. Les observations seront présentées au conseil.",
      editableMinutes: "## Échanges sur les abris\n\nViridomaros signale des couvertures affaissées près du grenier. Luctérios propose de faire venir les charpentiers avant d’attribuer le bois.\n\nLa commission présentera ses conclusion lors de la prochaine séance.",
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
      folderPath: "seed",
      lines: [
        "CONSEIL D’ALESIA",
        "Dumnacos l’Andécave donne pouvoir a Vercassivellaunos l’Arverne pour la seance du conseil.",
        "Dumnacos reste auprès des porteurs ; Vercassivellaunos le représente au conseil.",
      ],
    },
  };
}
