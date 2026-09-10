export async function seedBusinesses({ get, post, createWorkspaceResource }) {
  const seedFolderPath = "seed";
  console.log("- Affaires durables, projets et questions préparés");
  const councilBusinesses = [
    {
      key: "demo",
      path: seedFolderPath,
      name: "Veille autour de l’oppidum",
      reportContent:
        "Rassembler les observations des veilleurs sur les mouvements romains au-delà des défenses. Les rapports des veilleurs sont attendus avant toute décision.",
      subjects: [],
      resourceNames: [],
    },
    {
      key: "property",
      path: "seed/reserves",
      name: "Réserves et bâtiments",
      reportContent:
        "Affecter le grenier de Cornu au stockage des réserves. Étudier les abris avant de décider des travaux.",
      subjects: [
        {
          key: "granaryAllocation",
          kind: "councilDecisionProposal",
          name: "Affectation du grenier de Cornu aux réserves",
          content:
            "Affecter les deux espaces couverts du grenier de Cornu aux réserves communes : 60 sacs au nord, 40 au sud et 20 dans une réserve gardée de l’espace sud. Faire tenir un inventaire de 120 sacs et présenter un état des stocks à la prochaine séance.",
        },
        {
          key: "shelterStudy",
          kind: "openQuestion",
          name: "Aménagement des abris de Cornu - étude préalable",
          content:
            "Comparer les besoins de couverture et les capacités des abris de Cornu. Visite préalable et estimation à présenter au conseil avant toute décision de travaux.",
        },
      ],
      resourceNames: [
        "Inventaire du grenier de Cornu",
        "Note sur l’affectation du grenier de Cornu",
        "Diagnostic des abris de Cornu",
        "Règlement de mise à disposition",
      ],
    },
    {
      key: "foodSupply",
      path: "seed/ravitaillement",
      name: "Ravitaillement",
      reportContent:
        "Le stock du grenier comprend 120 sacs de céréales. La proposition de répartition de 80 sacs aux abris et 40 sacs aux équipes reste à examiner ; les besoins de chaque groupe doivent être justifiés.",
      subjects: [
        {
          key: "grainAllocation",
          kind: "councilDecisionProposal",
          name: "Répartition des réserves de céréales",
          content:
            "Répartir les 120 sacs disponibles : 80 pour les abris et 40 pour les équipes. Cette proposition est soumise au vote ; les sacs attribués devront être inscrits dans l’inventaire.",
        },
        {
          key: "grainAllocationReview",
          kind: "openQuestion",
          name: "Ravitaillement - réexamen de la répartition",
          content:
            "Examiner une répartition alternative au premier projet. Recueillir les besoins des abris et des équipes ; aucune nouvelle répartition n’est encore arrêtée.",
        },
      ],
      resourceNames: [
        "Organisation de la distribution des vivres",
        "Note sur la répartition des céréales",
        "Répartition proposée des vivres",
      ],
    },
    {
      key: "commerce",
      path: "seed/relations",
      name: "Relations avec les alliés",
      reportContent:
        "Préparer une motion de liaison avec les alliés face au siège de César. Le conseil examine les messages à transmettre et la coordination attendue.",
      subjects: [
        {
          key: "alliedCoordination",
          kind: "councilDecisionProposal",
          name: "Motion de liaison avec les alliés",
          content:
            "Adopter une motion sollicitant une coordination avec les alliés pour le ravitaillement et les liaisons. Confier à Commius la préparation du message et à Éporédorix le repérage du passage.",
        },
      ],
      resourceNames: [],
    },
    {
      key: "lighting",
      path: "seed/defense",
      name: "Défense du plateau",
      reportContent:
        "La première ligne a fait l’objet d’un bilan. La seconde ligne doit protéger les accès aux abris et préserver le passage des convois. Besoin de 96 poutres, 60 hottes de pierre et 30 journées de transport, pour 282 quinaires d’argent séquanes.",
      subjects: [
        {
          key: "secondDefenseLine",
          kind: "councilDecisionProposal",
          name: "Défense du plateau - renforcement de la seconde ligne",
          content:
            "Approuver le renforcement de la seconde ligne de défense en mobilisant 96 poutres à 2 quinaires, 60 hottes de pierre à 1 quinaire et 30 journées de transport à 1 quinaire, soit 282 quinaires d’argent séquanes. Préserver un accès pour les convois et demander un bilan à la commission.",
        },
        {
          key: "firstDefenseLineReview",
          kind: "openQuestion",
          name: "Défense du plateau - bilan de la première ligne",
          content:
            "Présenter l’état de la première ligne et recenser les besoins de consolidation. Question préparée, non inscrite à une séance.",
        },
      ],
      resourceNames: [
        "Défenses de Cornu",
        "Note de cadrage - défense du plateau",
        "Rapport - renforcement de la seconde ligne",
        "Estimation - défense du plateau",
        "État des défenses - première ligne",
      ],
    },
    {
      key: "associations",
      path: "seed/soutien",
      name: "Équipes de soutien",
      reportContent:
        "Coordonner les équipes des abris, des convois et des réserves. Moyens proposés : 24 journées de travail, 16 journées de travail et 9 journées de travail, soit 49 journées de travail. Allocations proposées : 48, 32 et 18 quinaires d’argent séquanes, soit 98 quinaires.",
      subjects: [
        {
          key: "supportFunding",
          kind: "councilDecisionProposal",
          name: "Moyens attribués aux équipes de soutien",
          content:
            "Attribuer 24 journées de travail à l’équipe des abris, 16 journées de travail à celle des convois et 9 journées de travail à celle des réserves, soit 49 journées de travail au total. Attribuer respectivement 48, 32 et 18 quinaires d’argent séquanes aux trois équipes, soit 98 quinaires. Demander un compte rendu de leur utilisation.",
        },
        {
          key: "sharedSupportResources",
          kind: "openQuestion",
          name: "Équipes de soutien - suivi des moyens partagés",
          content:
            "Vérifier les créneaux d’utilisation des locaux et les engagements des équipes. Appliquer les mêmes consignes de garde et de restitution dans les abris et les greniers.",
        },
      ],
      resourceNames: [
        "Tableau des moyens de soutien",
        "Convention de mise à disposition",
        "Engagements des équipes de soutien",
        "Export des moyens de soutien",
        "Suivi détaillé des moyens de soutien",
        "Règlement de mise à disposition",
      ],
    },
    {
      key: "school",
      path: "seed/accueil",
      name: "Accueil des habitants",
      reportContent:
        "Organiser les abris pour 142 habitants. Examiner les réserves de capacité et maintenir un tableau des besoins.",
      subjects: [
        {
          key: "shelterReport",
          kind: "openQuestion",
          name: "Accueil des habitants - bilan des abris",
          content:
            "Présenter le bilan des abris : 142 habitants accueillis. Recenser les besoins de couverture, d’eau et de distribution.",
        },
        {
          key: "shelterCapacity",
          kind: "openQuestion",
          name: "Accueil des habitants - capacités de réserve",
          content:
            "Examiner une capacité complémentaire de 20 places avant une éventuelle arrivée. Question préparée, pour les habitants déplacés des abris endommagés.",
        },
      ],
      resourceNames: ["Organisation des abris", "Accueil des habitants - capacités de réserve"],
    },
    {
      key: "roads",
      path: "seed/acces",
      name: "Accès et convois",
      reportContent:
        "Préparer le transport intérieur des vivres entre le grenier et les abris de Cornu. Le conseil doit examiner les créneaux des convois et les chemins à remettre en état.",
      subjects: [
        {
          key: "convoyAccess",
          kind: "openQuestion",
          name: "Acheminement des vivres entre le grenier et les abris",
          content:
            "Examiner deux options pour les convois entre le grenier et les abris : séparer les créneaux d’arrivée et de départ ou réserver un point de croisement. Le conseil n’a pas encore choisi.",
        },
        {
          key: "supplyRoadRepairs",
          kind: "councilDecisionProposal",
          name: "Remise en état des chemins de ravitaillement",
          content:
            "Préparer la remise en état des chemins de ravitaillement et des accès de Cornu. Faire estimer les interventions avant inscription à une séance.",
        },
      ],
      resourceNames: [
        "Remise en état des chemins de ravitaillement",
        "Repère du plateau",
        "Inventaire des chemins de liaison",
        "Consigne de circulation - accès de Cornu",
      ],
    },
  ];
  const seededBusinesses = new Map();
  const seededSubjects = new Map();
  for (const business of councilBusinesses) {
    const created = await post("/council-business", {
      path: business.path,
      name: business.name,
      reportContent: business.reportContent,
      reportName: "Rapport principal",
    });
    seededBusinesses.set(business.key, created);
    for (const subject of business.subjects) {
      seededSubjects.set(
        subject.key,
        await post(`/council-business/${created.id}/prepared-subjects`, {
          kind: subject.kind,
          name: subject.name,
          content: subject.content,
        }),
      );
    }
    await createWorkspaceResource({
      kind: "text",
      path: "seed",
      name: `Annexe - ${business.name}`,
      councilBusinessId: created.id,
      content: `## Éléments préparatoires\n\n${business.name}\n\n- Étude du dossier par les gardiens des réserves et les artisans.\n- Présentation des options et des observations des habitants.\n- Suivi des projets et questions de cette affaire au fil des séances.`,
    });
  }

  console.log("- Rattachement des pièces aux affaires durables");
  const subjectResourceIds = new Set([...seededSubjects.values()].map((subject) => subject.textResourceId));
  const resourceCatalog = (await get("/resources/catalog")).filter((resource) => !subjectResourceIds.has(resource.id));
  for (const business of councilBusinesses) {
    for (const name of business.resourceNames) {
      const candidates = resourceCatalog.filter((resource) => resource.name === name);
      if (candidates.length !== 1)
        throw new Error(`Expected one seeded resource named ${name}, found ${candidates.length}`);
      await post(`/council-business/${seededBusinesses.get(business.key).id}/resources`, {
        resourceId: candidates[0].id,
      });
    }
  }
  console.log(`  ${councilBusinesses.length} affaires durables, ${seededSubjects.size} projets/questions autonomes`);

  return seededSubjects;
}
