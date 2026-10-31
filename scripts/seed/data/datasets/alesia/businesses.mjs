export async function seedBusinesses({ get, post }, { committees }) {
  console.log("- Affaires durables, projets et questions préparés");
  const councilBusinesses = [
    {
      key: "watch",
      path: "Veille",
      name: "Veille autour de l’oppidum",
      committee: "defense",
      reportContent: `Les veilleurs du rempart nord et de la tour de guet relèvent chaque nuit les feux, les mouvements de troupes et les travaux de terrassement observés au-delà des défenses. Leurs relevés sont aujourd’hui transmis oralement au chef de poste, sans registre commun.

Sur les quinze dernières nuits, les veilleurs ont signalé onze déplacements de troupes romaines vers l’est et quatre chantiers nouveaux sur la ligne extérieure. Deux signalements sont arrivés au conseil avec plus d’un jour de retard.

Le conseil peut maintenir l’organisation actuelle, confier la tenue d’un registre à un veilleur désigné par poste, ou réunir chaque matin les chefs de poste à la maison commune.

La commission défense et soutien propose un registre par poste et une relève toutes les quatre heures. La question est préparée pour la prochaine séance.`,
      subjects: [
        {
          key: "watchRelief",
          kind: "openQuestion",
          name: "Relève des veilleurs du rempart nord",
          content: `## Relève des veilleurs du rempart nord

Le rempart nord compte trois postes de veille tenus par douze veilleurs. La relève a lieu deux fois par nuit et les veilleurs signalent une fatigue qui réduit la qualité des observations au petit matin.

La commission propose une relève toutes les quatre heures et la tenue d’un registre par poste, relu chaque matin par le chef de poste.

Le conseil est invité à dire s’il retient cette organisation et à désigner le conseiller chargé de présenter les relevés en séance.`,
        },
      ],
      resourceNames: [
        "Registre des observations de la tour nord",
        "Consigne de relève des veilleurs",
        "Ouvrages romains observés",
      ],
    },
    {
      key: "property",
      path: "Réserves",
      name: "Réserves et bâtiments",
      committee: "supply",
      reportContent: `Le grenier de Cornu dispose de deux espaces couverts. L’espace nord reçoit 60 sacs de céréales, l’espace sud 40 sacs et une réserve gardée de 20 sacs. L’inventaire du matin établit le stock à 120 sacs.

Le grenier n’a jusqu’ici aucune affectation décidée par le conseil : les sorties sont consignées par les gardiens, mais sans règle de priorité ni état présenté en séance.

Les abris voisins présentent des couvertures affaissées. Une visite des charpentiers est nécessaire avant toute attribution de bois, afin de distinguer la mise en sécurité immédiate de la réfection complète.

Il est proposé d’affecter le grenier aux réserves communes et de reporter la décision sur les abris après le diagnostic.`,
      subjects: [
        {
          key: "granaryAllocation",
          kind: "councilDecisionProposal",
          name: "Affectation du grenier de Cornu aux réserves",
          content: `## Affectation du grenier de Cornu aux réserves

Le conseil de l’oppidum,

Vu l’inventaire du grenier de Cornu établi par les gardiens ;

Considérant que les deux espaces couverts du grenier contiennent 120 sacs de céréales et qu’aucune affectation n’a été décidée ;

Considérant qu’une réserve gardée doit rester disponible pour les besoins urgents ;

Après en avoir délibéré,

**Décide :**

1. d’affecter les deux espaces couverts du grenier de Cornu aux réserves communes : 60 sacs au nord, 40 sacs au sud et 20 sacs dans une réserve gardée de l’espace sud ;
2. de placer les deux espaces sous garde permanente ;
3. de faire tenir par les gardiens un inventaire quotidien des entrées et des sorties ;
4. de demander qu’un état des stocks soit présenté à la prochaine séance.`,
        },
        {
          key: "shelterStudy",
          kind: "openQuestion",
          name: "Aménagement des abris de Cornu - étude préalable",
          content: `## Aménagement des abris de Cornu

Deux abris occupés présentent des couvertures affaissées et des infiltrations après la pluie. Le bois disponible ne permet pas de tout réparer à la fois.

Une visite des charpentiers doit préciser la stabilité des appuis contre le mur nord, la quantité de bois réutilisable et l’ordre des travaux entre les abris occupés et les espaces de réserve.

Le conseil est invité à prendre connaissance du diagnostic avant toute décision de travaux.`,
        },
      ],
      resourceNames: ["Inventaire du grenier de Cornu", "État des réserves de Cornu", "Diagnostic des abris de Cornu"],
    },
    {
      key: "foodSupply",
      path: "Ravitaillement",
      name: "Ravitaillement",
      committee: "supply",
      reportContent: `Le stock du grenier comprend 120 sacs de céréales. Les distributions quotidiennes sont relevées depuis vingt jours par les gardiens et figurent dans le relevé joint.

La première proposition de répartition attribue 80 sacs aux abris et 40 sacs aux équipes chargées des défenses. Elle ne tient pas compte des 142 habitants accueillis dans les abris ni de la consommation moyenne constatée.

Les besoins de chaque groupe doivent être justifiés : nombre de personnes, consommation des sept derniers jours, quantités déjà remises aux équipes.

La proposition initiale est présentée au vote ; une répartition alternative sera instruite si elle est rejetée.`,
      subjects: [
        {
          key: "grainAllocation",
          kind: "councilDecisionProposal",
          name: "Répartition des réserves de céréales",
          content: `## Répartition des réserves de céréales

Le conseil de l’oppidum,

Vu l’état des réserves du grenier de Cornu ;

Considérant que 120 sacs de céréales sont disponibles et que les abris comme les équipes de défense doivent être ravitaillés ;

Après en avoir délibéré,

**Décide :**

1. de répartir les 120 sacs disponibles à raison de 80 sacs pour les abris et 40 sacs pour les équipes chargées des défenses ;
2. de faire inscrire chaque attribution dans l’inventaire du grenier ;
3. de demander un relevé des quantités distribuées à la prochaine séance.`,
        },
        {
          key: "grainAllocationReview",
          kind: "openQuestion",
          name: "Ravitaillement - réexamen de la répartition",
          content: `## Réexamen de la répartition des céréales

La première répartition a été rejetée. Les besoins des abris et des équipes sont recueillis par la commission ravitaillement et accueil.

Le relevé des distributions des vingt derniers jours sert de base à une nouvelle proposition. Aucune nouvelle répartition n’est encore arrêtée.`,
        },
      ],
      resourceNames: ["Organisation de la distribution des vivres", "Relevé des distributions de vivres"],
    },
    {
      key: "allies",
      path: "Relations",
      name: "Relations avec les alliés",
      committee: "defense",
      reportContent: `Les liaisons avec les alliés au-delà des lignes romaines sont interrompues depuis douze jours. Deux messagers sont revenus sans avoir pu franchir la ligne extérieure.

Commius a rassemblé les dernières nouvelles : les alliés se rassemblent à l’ouest, mais ignorent l’état des réserves de l’oppidum et le calendrier souhaité par le conseil.

Deux passages restent envisageables. Le passage de l’est est le plus court mais il est surveillé après le coucher du soleil ; le passage par les bois du nord est plus long et moins exposé.

Le conseil examine une motion de liaison et la question du choix du passage. L’identité des messagers ne sera pas inscrite au procès-verbal.`,
      subjects: [
        {
          key: "alliedCoordination",
          kind: "councilDecisionProposal",
          name: "Motion de liaison avec les alliés",
          content: `## Motion de liaison avec les alliés

Le conseil de l’oppidum,

Considérant l’interruption des liaisons avec les alliés depuis douze jours ;

Considérant que les réserves de l’oppidum doivent être connues des alliés pour fixer le calendrier d’une action commune ;

Après en avoir délibéré,

**Adopte la motion suivante :**

1. le conseil sollicite des alliés une coordination pour le ravitaillement et les liaisons ;
2. Commius l’Atrébate est chargé de préparer le message ;
3. Éporédorix l’Éduen est chargé du repérage du passage ;
4. l’identité des messagers n’est pas inscrite au procès-verbal.`,
        },
        {
          key: "messengerRoute",
          kind: "openQuestion",
          name: "Choix du passage des messagers",
          content: `## Choix du passage des messagers

Le passage de l’est est le plus court mais il est surveillé après le coucher du soleil. Le passage par les bois du nord demande une nuit de marche de plus et traverse un terrain couvert.

Éporédorix présentera les observations des deux derniers repérages. Le conseil est invité à choisir le passage avant le départ des messagers.`,
        },
      ],
      resourceNames: ["Note de liaison avec les alliés", "Itinéraires des messagers"],
    },
    {
      key: "defense",
      path: "Défense",
      name: "Défense du plateau",
      committee: "defense",
      reportContent: `La première ligne de défense a fait l’objet d’un bilan : trois secteurs sont à consolider, en priorité près des accès aux abris.

La seconde ligne doit protéger les accès aux abris et préserver le passage des convois entre le grenier et les abris. Le chiffrage établi avec les artisans détaille seize postes par secteur.

Les besoins s’élèvent à 96 poutres à 2 quinaires, 60 hottes de pierre à 1 quinaire et 30 journées de transport à 1 quinaire, soit 282 quinaires d’argent séquanes.

Le dépôt de pierre sera déplacé au sud du chantier pour laisser libre le chemin du grenier. La carte des défenses montre les secteurs, le fossé et l’emprise du chantier.`,
      subjects: [
        {
          key: "secondDefenseLine",
          kind: "councilDecisionProposal",
          name: "Défense du plateau - renforcement de la seconde ligne",
          content: `## Renforcement de la seconde ligne

Le conseil de l’oppidum,

Vu le chiffrage de la seconde ligne établi avec les artisans ;

Considérant que la seconde ligne doit protéger les accès aux abris sans couper le passage des convois ;

Après en avoir délibéré,

**Décide :**

1. d’approuver le renforcement de la seconde ligne pour un montant de 282 quinaires d’argent séquanes, soit 96 poutres à 2 quinaires, 60 hottes de pierre à 1 quinaire et 30 journées de transport à 1 quinaire ;
2. de maintenir un couloir de circulation balisé entre le grenier et les abris pendant les travaux ;
3. de demander à la commission défense et soutien un point d’avancement à chaque séance.`,
        },
        {
          key: "firstDefenseLineReview",
          kind: "openQuestion",
          name: "Défense du plateau - bilan de la première ligne",
          content: `## Bilan de la première ligne

Le bilan relève trois secteurs à consolider : la porte ouest, la courtine nord et les abords du grenier.

La commission présentera les besoins de consolidation de chaque secteur et l’ordre des travaux proposé.`,
        },
      ],
      resourceNames: [
        "Défenses de l’oppidum",
        "Chiffrage de la seconde ligne",
        "Rapport - renforcement de la seconde ligne",
        "État des défenses - première ligne",
      ],
    },
    {
      key: "support",
      path: "Soutien",
      name: "Équipes de soutien",
      committee: "defense",
      reportContent: `Trois équipes de soutien travaillent pour l’oppidum : l’équipe des abris, l’équipe des convois intérieurs et l’équipe des réserves.

Les besoins consolidés s’élèvent à 24 journées de travail pour les abris, 16 pour les convois et 9 pour les réserves, soit 49 journées de travail.

Les allocations proposées sont de 48, 32 et 18 quinaires d’argent séquanes, soit 98 quinaires. Le suivi hebdomadaire joint compare les journées prévues aux journées réalisées.

Il est proposé d’attribuer ces moyens et de demander aux responsables un compte rendu commun de leur utilisation.`,
      subjects: [
        {
          key: "supportFunding",
          kind: "councilDecisionProposal",
          name: "Moyens attribués aux équipes de soutien",
          content: `## Moyens attribués aux équipes de soutien

Le conseil de l’oppidum,

Vu les besoins présentés par les responsables des trois équipes de soutien ;

Après en avoir délibéré,

**Décide :**

1. d’attribuer 24 journées de travail à l’équipe des abris, 16 à l’équipe des convois et 9 à l’équipe des réserves, soit 49 journées de travail ;
2. d’attribuer respectivement 48, 32 et 18 quinaires d’argent séquanes aux trois équipes, soit 98 quinaires ;
3. de demander aux responsables de conserver les justificatifs de dépense et de présenter un compte rendu commun de l’utilisation des moyens.`,
        },
        {
          key: "sharedSupportResources",
          kind: "openQuestion",
          name: "Équipes de soutien - suivi des moyens partagés",
          content: `## Suivi des moyens partagés

Les équipes partagent les locaux du grenier et des abris. Les créneaux d’utilisation ne sont pas inscrits et deux équipes se sont présentées le même jour au grenier.

La commission propose d’appliquer les mêmes consignes de garde et de restitution dans les abris et les greniers et d’inscrire les créneaux sur un registre commun.`,
        },
      ],
      resourceNames: [
        "Suivi des moyens de soutien",
        "Convention de mise à disposition",
        "Engagements des équipes de soutien",
        "Règlement de mise à disposition",
      ],
    },
    {
      key: "shelters",
      path: "Accueil",
      name: "Accueil des habitants",
      committee: "supply",
      reportContent: `Les abris accueillent 142 habitants. Merlin organise les soins près des sources et Viridomaros recense les besoins en eau et en couvertures.

Plusieurs besoins immédiats sont signalés : renouveler les couvertures de l’abri nord, protéger les deux points d’eau utilisés la nuit et dégager un passage pour les blessés et les porteurs.

Une capacité complémentaire de 20 places est à étudier pour les habitants déplacés des abris endommagés.

Le bilan des abris est présenté au conseil pour information ; la capacité complémentaire fait l’objet d’une question préparée.`,
      subjects: [
        {
          key: "shelterReport",
          kind: "openQuestion",
          name: "Accueil des habitants - bilan des abris",
          content: `## Bilan des abris

142 habitants sont accueillis dans les abris de Cornu. Les capacités restent suffisantes, mais les couvertures, l’eau et les passages demandent une attention immédiate.

Le bilan est présenté au conseil pour information.`,
        },
        {
          key: "shelterCapacity",
          kind: "openQuestion",
          name: "Accueil des habitants - capacités de réserve",
          content: `## Capacités de réserve

Une capacité complémentaire de 20 places est à étudier avant une éventuelle arrivée d’habitants déplacés des abris endommagés.

Luctérios vérifiera avec les charpentiers si les cloisons peuvent être déplacées sans fragiliser les abris. Le conseil est informé de l’état de l’étude.`,
        },
      ],
      resourceNames: ["Organisation des abris", "Bilan des abris", "Accueil des habitants - capacités de réserve"],
    },
    {
      key: "roads",
      path: "Accès",
      name: "Accès et convois",
      committee: "supply",
      reportContent: `Les convois relient le grenier aux abris par un chemin intérieur long d’environ 600 pas. Au passage le plus étroit, le croisement des porteurs et des chariots ralentit les distributions.

Deux solutions sont comparées : séparer les heures de départ et de retour des convois, ou aménager un point de croisement gardé à mi-chemin.

Les chemins de ravitaillement doivent par ailleurs être remis en état : ornières près du grenier, pierres déchaussées au passage des abris.

Le plan du plateau et la carte de repérage montrent le chemin des convois, le grenier, les abris et le point d’eau.`,
      subjects: [
        {
          key: "convoyAccess",
          kind: "openQuestion",
          name: "Acheminement des vivres entre le grenier et les abris",
          content: `## Acheminement des vivres

Deux options sont comparées pour les convois entre le grenier et les abris : séparer les créneaux d’arrivée et de départ, ou réserver un point de croisement gardé.

Un essai de deux journées est proposé avant de choisir une organisation définitive. Le conseil n’a pas encore choisi.`,
        },
        {
          key: "supplyRoadRepairs",
          kind: "councilDecisionProposal",
          name: "Remise en état des chemins de ravitaillement",
          content: `## Remise en état des chemins de ravitaillement

Le conseil de l’oppidum,

Vu l’inventaire des chemins de liaison ;

Considérant que les ornières près du grenier et les pierres déchaussées au passage des abris ralentissent les convois ;

Après en avoir délibéré,

**Décide :**

1. de faire remettre en état le chemin intérieur entre le grenier et les abris ;
2. de confier les travaux à l’équipe des convois, sans interrompre les distributions ;
3. de demander un relevé des temps de parcours avant et après les travaux.`,
        },
      ],
      resourceNames: ["Inventaire des chemins de liaison", "Plan du plateau de Cornu", "Repérage du plateau de Cornu"],
    },
    {
      key: "reliefArmy",
      path: "Relations/Armée de secours",
      name: "Armée de secours",
      committee: "defense",
      reportContent: `L’assemblée des cités de Gaule lève une armée de secours pour dégager l’oppidum. Son commandement est confié à quatre membres du conseil : Commius l’Atrébate, Viridomaros l’Éduen, Éporédorix l’Éduen et Vercassivellaunos l’Arverne.

Le conseil inscrit leur désignation dans les représentations extérieures, avec une lettre de mission qui fixe leur compte rendu par les messagers de la motion de liaison.

Pendant leur absence, les commissions gardent leur composition ; les pouvoirs nécessaires aux séances seront donnés à l’appel.

Un projet de délibération désignant les quatre représentants est préparé pour la prochaine séance.`,
      subjects: [
        {
          key: "reliefArmyRepresentatives",
          kind: "councilDecisionProposal",
          name: "Désignation des représentants auprès de l’armée de secours",
          content: `## Désignation des représentants auprès de l’armée de secours

Le conseil de l’oppidum,

Considérant que l’assemblée des cités lève une armée de secours et en confie le commandement à des membres du conseil ;

Après en avoir délibéré,

**Décide :**

1. de désigner Commius l’Atrébate, Viridomaros l’Éduen, Éporédorix l’Éduen et Vercassivellaunos l’Arverne pour représenter le conseil auprès de l’armée de secours ;
2. de leur remettre la lettre de mission jointe ;
3. de leur demander un compte rendu par les messagers de la motion de liaison.`,
        },
      ],
      resourceNames: ["Lettre de mission des chefs de l’armée de secours"],
    },
    {
      key: "proconsul",
      path: "Relations/Proconsul",
      name: "Correspondance avec le proconsul",
      committee: "supply",
      reportContent: `Le conseil demande à Jules César, proconsul, une trêve pour le passage des habitants les plus vulnérables accueillis dans les abris.

Le secrétariat prépare le courrier au proconsul et l’invitation au rendez-vous « Pourparlers avec Jules César », fixé dans la plaine au pied de l’oppidum. Le courriel d’invitation est préparé depuis le modèle du conseil ; l’envoi reste fait par le secrétariat.

Le conseil sait que César a déjà refusé de recevoir dans ses lignes des habitants sortis de l’oppidum ; le courrier rappelle que la trêve ne concerne que les plus vulnérables.`,
      subjects: [],
      resourceNames: ["Courrier au proconsul", "Pourparlers avec Jules César"],
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
    await post(`/council-business/${created.id}/committees`, { committeeId: committees[business.committee].id });
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
  }

  console.log("- Rattachement des pièces aux affaires durables");
  const subjectResourceIds = new Set([...seededSubjects.values()].map((subject) => subject.textResourceId));
  const resourceCatalog = (await get("/resources/catalog")).filter((resource) => !subjectResourceIds.has(resource.id));
  const attached = new Set();
  for (const business of councilBusinesses) {
    for (const name of business.resourceNames) {
      if (attached.has(name)) throw new Error(`Seeded resource attached twice: ${name}`);
      attached.add(name);
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
