# Exigences, origines et références juridiques

Hall distingue la preuve du comportement logiciel de la justification de la
règle qu'il applique. Une annotation et un test ne prouvent ni la légalité de
l'exigence ni la conformité complète du produit.

Ce document est l'autorité documentaire du dispositif transversal. Il complète
les [principes de code](principes-code.md), la [carte d'architecture](architecture.md)
et l'[analyse du quorum](council-quorum-requirements.md). Le référent législation
assure la curation des sources et des qualifications ; le propriétaire de
l'invariant implémente et vérifie le comportement. Une décision métier non
résolue revient au coordinateur et à the user.

## Deux axes indépendants

La **nature** est une union fermée `functional | technical`. Les marqueurs
existants `@functional-requirement HALL-FR-…` et
`@technical-requirement HALL-TR-…` expriment cet axe. Une règle fonctionnelle
n'est pas nécessairement imposée par le droit ; une protection technique peut
contribuer à satisfaire une obligation sans que sa forme soit imposée.

L'**origine** est une union fermée `regulatory | product` :

- `regulatory` : une obligation ou une interdiction applicable, étayée par un
  texte primaire ou une interprétation jurisprudentielle précisément localisée ;
- `product` : un choix de Hall, y compris organisation, représentation,
  ergonomie, politique de correction, conservation interne ou réalisation
  technique. Il exige une justification explicite, pas une citation juridique
  artificielle.

Les valeurs et leur validation ont une seule autorité. Le dispatch passe par
les matchers exhaustifs des principes de code. Une catégorie inconnue ne doit
jamais tomber implicitement dans `product`. Les préfixes historiques des IDs
restent stables ; une requalification ne justifie pas une renumérotation.

Une exigence **mixte** doit distinguer ses propositions : par exemple, conserver
les mentions obligatoires du PV est réglementaire, les copier dans un snapshot
SQL à la clôture est un choix Hall. `mixed` ne doit pas devenir une origine
fourre-tout dispensant de citer. La décomposition doit nommer chaque clause et
son origine, ou relier une exigence de réalisation produit à l'exigence
réglementaire qu'elle contribue à satisfaire. Les IDs déjà attribués restent
stables ; les clauses ne sont pas de nouveaux IDs de production.

## Chaîne de preuve attendue

`source primaire → proposition applicable → exigence → invariant → scénario → vérificateur`

Pour chaque lien, conserver l'autorité et la portée :

1. **Source** : code et article/alinéa, ou juridiction, numéro, date et
   considérant ; URL officielle directe ; identifiant de version ; début et,
   lorsqu'elle est connue, fin de validité ; date de consultation et date du
   droit recherchée. Une date de consultation n'est pas une date d'entrée en
   vigueur. Une décision de justice a une date de décision, pas une version de
   code.
2. **Applicabilité** : proposition réellement justifiée, commune/régime/type
   d'affaire concernés, préconditions et exceptions. Distinguer texte direct et
   interprétation. Une source secondaire peut orienter la recherche ; elle ne
   remplace pas silencieusement la source primaire.
3. **Exigence** : ID, nom stable, nature, origine, formulation et propriétaire.
   Pour une règle produit, documenter sa raison et sa frontière, sans prétendre
   que le législateur a choisi cette réalisation.
4. **Invariant** : fichier et autorité réellement exécutée, y compris SQL
   embarqué dans TypeScript ; préciser les refus et les accès qui pourraient
   contourner le contrôle.
5. **Scénario** : fichier et scénario vérifiant réellement le comportement,
   limites et exceptions utiles ; distinguer référence textuelle à un ID et
   assertion qui exerce l'invariant.
6. **Vérification** : validation structurelle du catalogue, couverture des
   invariants et résultats des tests restent trois preuves distinctes.

Le statut de preuve juridique est explicite : `verified | unproven`. Un texte
consulté dont la portée ne démontre pas la proposition laisse celle-ci
`unproven`. Ce statut ne signifie pas que la proposition est fausse. Un contrôle
automatique peut établir la présence et la cohérence des métadonnées ; il ne
certifie pas à lui seul l'interprétation juridique ni l'absence d'une
jurisprudence contraire.

## Contrat de contrôle et état de réalisation

Le contrat transversal doit couvrir `council`, `directory`, `document`,
`workspace` et les autres autorités découvertes, notamment le SQL embarqué du
serveur. Le format ci-dessous est retenu avec le propriétaire backend et son
implémentation a été relue dans le checkout. La section d'état distingue les
contrôles effectivement présents des garanties qui restent humaines.

### Format extractible retenu

Le [registre versionné](../packages/postgres/requirements.json) porte
`schemaVersion: 1`, un objet `sources` indexé par clé stable et un objet
`requirements` indexé par ID. L'annotation dans l'autorité reste le point
d'ancrage ; le registre ne remplace pas la découverte des annotations.

Chaque exigence possède `name`, `nature: functional | technical` et une liste
non vide `clauses`. Chaque clause possède :

- `key`, identifiant stable unique dans l'exigence ;
- `origin: regulatory | product`, et `statement`, proposition explicitement
  délimitée ; pour `product`, ce texte indique aussi sa justification ;
- `sourceIds`, références résolues dans `sources`, non vides pour `regulatory`,
  vides pour `product` ;

La variante `regulatory` possède en outre `assessment: verified | unproven`
et `interpretation: direct | interpreted`. La variante `product` ne reçoit
pas ces attributs de preuve juridique. `assessment` ne représente pas le
résultat d'un test runtime : la règle légale peut être établie alors que le
contrôle Hall reste incomplet.

Chaque source possède `kind: legislation | caseLaw`, `citation`, `localization`,
`url`, `verifiedAt`, `asOf` et `scope`. Pour `legislation`, `versionId` et
`validFrom` sont requis ; pour `caseLaw`, `decisionDate` est requis. `scope`
explicite les exceptions ou indique qu'aucune n'a été identifiée dans la portée
retenue. Une simple URL sans proposition/localisation ne suffit pas.

Exemple de structure d'une exigence réglementaire, sans renuméroter son ID :

```json
{
  "name": "ABSTENTION_IS_EXCLUDED_FROM_MAJORITY",
  "nature": "functional",
  "clauses": [
    {
      "key": "expressed-suffrages",
      "origin": "regulatory",
      "statement": "Pour une proposition binaire ordinaire, les abstentions ne contribuent pas aux suffrages exprimes utilises pour la majorite.",
      "sourceIds": ["S2"],
      "assessment": "verified",
      "interpretation": "interpreted"
    }
  ]
}
```

Cette entrée appartient à `requirements["HALL-FR-BAL-150"]`. Pour une exigence
mixte, ajouter des clauses distinctes : la proposition légale seule reçoit ses
sources ; la transaction, le snapshot ou la FK est décrit par une clause
produit. Ne pas recopier toute une règle mixte dans une clause réglementaire
`verified/direct`. Si aucune source primaire ne peut être attribuée, le
diagnostic de référence manquante doit rester visible ; `unproven` ne dispense
pas du contrôle de présence des références.

Le vérificateur expose une commande globale `npm run check:requirements`.
Le contrôle council appelle ce contrôle global avant ses propres
comparaisons pgTAP/SQLSTATE. La validation de frontière, les variantes, les
obligations de champs et les diagnostics relèvent d'une autorité unique et de
matchers exhaustifs, pas d'un second catalogue indépendant de catégories.

Le vérificateur doit diagnostiquer : catégorie absente ou inconnue, source
réglementaire absente ou introuvable, localisation/version/date/portée absente,
statut de preuve absent ou inconnu, ID orphelin, collision de noms pour
un ID, annotation hors convention et couverture manquante. Une règle produit
ne doit pas être rendue valide en lui attachant un article sans rapport.

Les répétitions d'un même ID et du même nom dans les catalogues DOC/DIR et leurs
autorités doivent être distinguées d'une nouvelle définition. Une autorité
canonique peut avoir plusieurs références ; deux règles distinctes ne peuvent
pas partager un ID. Le contrôle doit aussi trouver les marqueurs mal formés,
au lieu de limiter sa collecte aux seules lignes déjà valides.

Au relevé initial du 6 septembre 2026, le
[script council](../packages/postgres/sql/council/test/verify-traceability.sh)
lit les `.sql` immédiatement sous `council` et les `.test.sql` immédiatement
sous `council/test`. Il compare les IDs FR/TR, refuse les duplications, compare
les SQLSTATE Hall utilisés/catalogués/cités dans les tests, recherche les quatre
codes natifs `23502`, `23503`, `23505`, `23514`, et compare les nombres de lignes
`RAISE EXCEPTION` et `ERRCODE`.

Ce relevé du script ne prouve pas la pertinence des assertions : une citation
dans un commentaire peut satisfaire sa recherche lexicale. La comparaison des
nombres de lignes ne démontre pas l'association syntaxique exacte entre chaque
levée et son code. À cet instant initial, son contrôle ne lisait pas de
référence juridique et n'inventoriait pas le serveur TypeScript. L'évolution
décrite ci-dessous ajoute cette couverture structurelle.

### État de l'implémentation relue

Le [vérificateur global](../scripts/check-requirements.mjs) et le registre sont
présents. Le script council l'appelle avant ses propres comparaisons. La
découverte parcourt récursivement `packages`, pour les fichiers SQL,
TypeScript/TSX et JavaScript/MJS, en excluant dépendances, distributions et
répertoires/fichiers de tests. Les `.sql` embarqués dans un template TypeScript
sont donc inclus. Les définitions sont uniques ; leurs répétitions sont
marquées explicitement :

```sql
-- @requirement-reference HALL-FR-DOC-010 RESOURCE_HAS_EXACTLY_ONE_NATURE:
```

La validation Zod stricte contrôle les discriminants et les champs du registre.
Le rapprochement contrôle les identités, les clés de clauses, les sources
résolues et les références. Les clauses `unproven` produisent un avertissement
`UNPROVEN` et restent comptées dans le résultat ; elles n'entraînent pas seules
un code de sortie non nul. Les erreurs structurelles, elles, font échouer la
commande. Un succès structurel ne signifie donc pas que toutes les
interprétations sont établies.

La commande ne visite pas les URL : elle contrôle leur forme et les domaines
officiels pris en charge (Légifrance et Conseil d'État). Elle valide la forme
des dates, pas l'applicabilité juridique à une occurrence ni une recherche de
réforme. La pertinence source/proposition reste la responsabilité du référent.
Les scénarios pgTAP council restent un contrôle spécifique : il n'existe pas
dans ce script global une preuve automatique d'exécution de chaque test de
chaque package.

Commandes disponibles depuis la racine :

```sh
npm run check:requirements
node --test scripts/check-requirements.test.mjs
bash packages/postgres/sql/council/test/verify-traceability.sh
```

L'audit documentaire présent n'a lancé ni cette commande ni les suites runtime.
Un résultat de contrôle communiqué par un autre agent ne remplace pas une
preuve de l'état final intégré. Pour cette documentation seule : relire le diff
et vérifier les liens locaux. Pour l'implémentation : utiliser les commandes
du package affecté et les contrôles structurels de la carte d'architecture.

## Sources primaires consultées

Recherche effectuée le **6 septembre 2026**, pour le droit à cette date. Les
versions ci-dessous sont celles affichées par les pages officielles consultées.
Les URL ChronoLégi datées de certains articles ont retourné une erreur ; leurs
pages de version et la section courante ont été utilisées. Il ne s'agit pas
d'une certification de l'ensemble du droit applicable à toutes les communes.

Les clés S/J ci-dessous portent dans chaque ligne de la matrice la référence
exacte, la version et le lien ; elles évitent de dupliquer les citations.

| Clé | Source primaire et localisation | Version / date | Proposition et limites |
| --- | --- | --- | --- |
| S1 | [CGCT L2121-17, al. 1 et 2](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006389875) | Depuis 24/02/1996 | Majorité des membres en exercice présents ; exception de seconde convocation après premier défaut, sous conditions. Un seuil positif libre ne démontre pas cette règle. |
| S2 | [CGCT L2121-20, al. 1 à 3](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053152931) | Depuis 24/12/2025 | Pouvoir écrit à un collègue, unique par porteur et révocable ; limite de trois séances consécutives avec exceptions maladie constatée et congé de maternité. Majorité absolue des exprimés ; prépondérance présidentielle sauf secret. |
| S3 | [CGCT L2121-15, al. 1 à 6](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044190488) | Depuis 01/07/2022 | Secrétaire(s) membre(s), auxiliaires possibles ; PV arrêté au commencement suivant, signé ; mentions obligatoires al. 4, publicité al. 5, pérennité de l'original al. 6. Pas de format SQL/PDF prescrit. |
| S4 | [CGCT L2121-21, al. 1 à 6](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044190497) | Depuis 01/07/2022 | Demandes de scrutin public/secret, nominations et plusieurs tours, exceptions au secret. Les scrutins électoraux ne se ramènent pas au résultat binaire Hall. |
| S5 | [CGCT L2131-11, phrases 1 à 3](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053153029) | Depuis 24/12/2025 | Participation de l'intéressé personnellement ou comme mandataire ; seule présence insuffisante pour caractériser participation ; exclusion de l'effectif pour L1111-6 II. |
| S6 | [CGCT L1111-6, I, II et III](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053153012) | Depuis 24/12/2025 | II vise la commande publique envers l'organisme représenté et commissions concernées ; vérifier I et exceptions III : autres groupements, CCAS/CIAS et caisses des écoles. Ne pas réutiliser l'ancienne liste générale aides/garanties. |
| S7 | [CGCT L1111-13, al. 3, seconde phrase](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053147122) | Depuis 24/12/2025 | Engagement de faire connaître les intérêts personnels avant débat et vote ; ne prescrit pas une table nominative dans le PV. |
| S8 | [CGCT L2121-14, al. 1 à 3 et note d'application](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000051731835) | Depuis 01/01/2026 ; exercice budgétaire 2026 | Présidence maire/remplaçant ; pour CFU, président élu et retrait du maire au vote. Régime distinct des deux conflits modélisés. |
| S9 | [CGCT L2121-22, al. 1 à 3](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000027433901) | Depuis 23/03/2014 | Commissions, présidence de droit et vice-présidence, pluralisme au-delà de 1 000 habitants. Ne prescrit ni archivage applicatif ni fermeture SQL des appartenances. |
| S10 | [CGCT L2121-2, tableau](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000027433884) | Depuis 23/03/2014 | Effectif légal selon population ; un `expected_member_count` saisi ne prouve pas sa détermination. |
| S11 | [CGCT L2121-2-1, al. 1 à 4 et notes](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000051645319) | Depuis 15/03/2026, confirmé par la section courante | Conseil réputé complet sous conditions : seuils 5/9/13 pour moins de 100 / 100–499 / 500–999 habitants. Ne pas confondre complétude, effectif théorique et membres en exercice. |
| S12 | [Code du patrimoine L212-2, al. 1 et 2](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000019202835) | Depuis 17/07/2008 | Sélection des archives publiques et accord sur élimination ; une cascade documentaire n'autorise pas juridiquement toute destruction. |
| J1 | [CE, 18/10/1989, n° 63984, considérant relatif aux délibérations 40-80 et 42-80](https://www.legifrance.gouv.fr/ceta/id/CETATEXT000007761919) | Décision 18/10/1989 ; consultée 06/09/2026 | Quorum apprécié affaire par affaire à la mise en discussion ; ouverture seule insuffisante. |
| J2 | [CAA Nancy, 01/04/2010, n° 09NC01131, considérant sur L2121-17](https://www.legifrance.gouv.fr/ceta/id/CETATEXT000022155054) | Décision 01/04/2010 ; consultée 06/09/2026 | Retrait du maire au vote n'invalide pas à lui seul le quorum constaté à la discussion dans l'espèce jugée ; pas une dispense de toutes autres règles de vote. |
| J3 | [CE, 19/01/1983, n° 33241, considérant sur la délibération 36-79](https://www.legifrance.gouv.fr/ceta/id/CETATEXT000007679121) | Décision 19/01/1983 ; consultée 06/09/2026 | Trois intéressés parmi sept présents ne laissaient que quatre admissibles, quorum insuffisant. Application au numérateur actuel interprétative ; confirmation explicite post-réforme 2025 non prouvée ici. |
| J4 | [CE, 06/02/2025, n° 494627, points 2 et 3](https://www.conseil-etat.fr/fr/arianeweb/CE/decision/2025-02-06/494627) | Décision 06/02/2025 ; consultée 06/09/2026 | Prise d'effet d'une démission et remplacement à prendre en compte pour composer la séance ; ne tranche pas une formule arithmétique du quorum. |

## Matrice exhaustive du relevé

Relevé du checkout partagé sur HEAD
`e06e7da54e6c1254adb1b01428122f6ac8d526a8`, **avec WIP** : 268 occurrences
canoniques dans 41 fichiers, 191 IDs et 194 couples ID/nom distincts. Le
rapprochement pendant la rédaction porte ce total à **197 IDs fonctionnels** après
réattribution du nouveau déport à `BAL-310` et des créations/programmations
atomiques à `WSP-200`/`WSP-210`, puis normalisation des trois annotations de
lieux vers `LOC-010`/`LOC-020`/`LOC-030` par le backend. Les
autres agents modifient ces fichiers pendant l'audit : ce relevé ne constitue
pas un état de livraison gelé.

La recherche a porté sur les marqueurs `functional-requirement`, leurs variantes
usuelles et les IDs hors convention dans le dépôt, fichiers cachés inclus hors
`.git`, avec les exclusions usuelles de `rg`. Les dépendances et artefacts
ignorés ne sont pas un catalogue de règles Hall. Les références de tests et
les candidats documentaires ne sont pas comptés comme nouvelles définitions.

Notation : le préfixe de chaque ID abrégé est **`HALL-FR-`**. Toutes ces lignes
sont donc actuellement annotées `functional`, même lorsque leur réalisation
est technique. **P** = produit, source légale non applicable ; **R** = proposition
réglementaire étayée dans sa portée indiquée ; **M** = mélange à décomposer ;
**U** = portée juridique non prouvée. Pour P, version juridique et exceptions
légales sont sans objet : cela ne soustrait pas les données au droit général.
Le statut concerne la justification, jamais une conformité runtime présumée.

### Séances — MTG (26 IDs)

Autorités : [modèle](../packages/postgres/sql/council/005-council-meetings.sql),
[règles](../packages/postgres/sql/council/013-council-meeting-rules.sql),
[cycle](../packages/postgres/sql/council/014-council-meeting-lifecycle.sql),
[clôture](../packages/postgres/sql/council/060-council-meeting-closure.sql),
[API](../packages/postgres/sql/council/070-council-meeting-api.sql),
[déports](../packages/postgres/sql/council/026-agenda-item-recusals.sql).

| ID | Règle relevée | Origine, source et portée |
| --- | --- | --- |
| MTG-010 | Quorum stocké positif | P — S1 n'impose pas ce seuil libre ; prétention à une obligation universelle U, notamment seconde convocation. |
| MTG-020 | Seuls les présents physiques comptent | R — S1 al. 1 + S2 al. 1 ; distinguer admissibilité et simple présence, S5/J3. |
| MTG-030 | Séance non supprimable | P — conservation applicative de toute occurrence. |
| MTG-040 | Création avant démarrage | P — automate de préparation. |
| MTG-050 | Identité et quorum immuables | P — ne prouve pas le bon effectif ni les régimes par affaire. |
| MTG-060 | Dates et transitions à sens unique | P — politique de correction. |
| MTG-070 | Démarrage exige quorum | M — S1/J1 ; contrôle d'ouverture Hall, insuffisant pour les affaires suivantes. |
| MTG-080 | Date initialement absente | P — préparation anticipée. |
| MTG-090 | Clôture exige démarrage | P — automate. |
| MTG-100 | Séance close immuable | P — gel des données. |
| MTG-110 | Clôture produit successeur et PV | M — S3 al. 3 pour PV ; successeur automatique unique choisi par Hall. |
| MTG-120 | PV précédent traité avant clôture | M — règle du commencement établie par S3 al. 3 ; garde de clôture Hall insuffisante. Le SQL vérifie un point terminé, pas un résultat favorable. |
| MTG-130 | Création automatique séance suivante | P — aucune obligation de provisioning. |
| MTG-140 | Successeur après séance close | P — chaînage. |
| MTG-160 | Programmation par action nommée | P — API. |
| MTG-170 | Démarrage par action nommée | P — API. |
| MTG-180 | Provisionnement initial unique | P — modèle monotenant. |
| MTG-190 | Numérotation stable et séquentielle | P — identité de présentation. |
| MTG-200 | Date et lieu conjointement définis | P — formulaire/transaction ; ne prouve pas convocation régulière. |
| MTG-210 | Démarrage après programmation | P — précondition de l'automate. |
| MTG-220 | Slug dérivé | P — identité technique. |
| MTG-230 | Président/secrétaire membres du conseil | M — S3 al. 1 et S8 ; un secrétaire unique et désignation avant start sont des choix Hall. |
| MTG-240 | Présence préalable des responsables | M — S3/S8 ; ne prouve ni désignation régulière ni remplacement selon l'affaire. |
| MTG-250 | Désignation par action nommée | P — API. |
| MTG-260 | Préparation atomique | P — transaction. |
| MTG-280 | Effet du déport dépend du fondement | M — S5 phrase 3/S6 pour dénominateur ; J3 interprétatif pour numérateur général, confirmation post-2025 U ; projection SQL choisie. |

### Présences et pouvoirs — ATT (11 IDs)

Autorités : [types](../packages/postgres/sql/council/001-types.sql),
[modèle](../packages/postgres/sql/council/010-meeting-attendance.sql),
[pouvoirs](../packages/postgres/sql/council/011-meeting-attendance-rules.sql),
[cycle](../packages/postgres/sql/council/012-meeting-attendance-lifecycle.sql).

| ID | Règle relevée | Origine, source et portée |
| --- | --- | --- |
| ATT-010 | Quatre états explicites avant start | M — S3 al. 4 pour présents/représentés ; taxonomie et moment Hall. |
| ATT-020 | Une déclaration par membre/séance | P — unicité de représentation. |
| ATT-030 | Représentation exige porteur et pièce | M — S2 al. 1 impose écrit ; pièce numérique et champs Hall. |
| ATT-040 | Pas de pouvoir à soi-même | R — déduit de S2 al. 1, pouvoir à un collègue. |
| ATT-050 | Un seul pouvoir par porteur/séance | R — S2 al. 1, version 2025 ; durée/révocation non prouvées par cette unicité. |
| ATT-060 | Une utilisation de pièce par séance | P — un fichier pourrait contenir plusieurs écrits ; pas de cardinalité légale du fichier. |
| ATT-070 | Porteur présent dans cette séance | M — S2 al. 1 pour exercice par le collègue ; ligne d'ouverture ne prouve pas présence au vote. |
| ATT-080 | Déclarations immuables après ouverture | P — photographie initiale, pas interdiction légale des mouvements. |
| ATT-090 | Ensemble gelé au démarrage | P — ne prouve pas les départs/retours ultérieurs. |
| ATT-100 | Présence rattachée à CouncilMember | M — S1/S2 ; FK ne prouve pas mandat effectif, J4. |
| ATT-110 | Preuve du pouvoir en DocumentResource | P — support choisi ; obligation écrite portée par ATT-030. |

### Ordre du jour et affaires — AGI (35 IDs), BUS (2 IDs)

Autorités : [affaires](../packages/postgres/sql/council/015-council-business.sql),
[points](../packages/postgres/sql/council/016-council-agenda-items.sql),
[règles](../packages/postgres/sql/council/017-council-agenda-rules.sql),
[cycle](../packages/postgres/sql/council/018-council-agenda-lifecycle.sql),
[actions](../packages/postgres/sql/council/019-council-agenda-actions.sql),
[scrutins](../packages/postgres/sql/council/038-agenda-ballot-lifecycle.sql),
[clôture](../packages/postgres/sql/council/060-council-meeting-closure.sql).

| ID | Règle relevée | Origine, source et portée |
| --- | --- | --- |
| BUS-010 | CouncilBusiness racine préparatoire | P — modèle. |
| BUS-030 | Un CouncilBusiness par sujet de point | P — association. |
| AGI-010 | Exactement un sujet par point | P — union fermée. |
| AGI-020 | Signe de position encode programmation | P — encodage SQL. |
| AGI-030 | Approbation PV en première position | M — S3 al. 3 pour commencement ; ordinal 1 est Hall, ne prouve pas l'ordre effectif de traitement. |
| AGI-040 | Fin exige début | P — chronologie. |
| AGI-050 | Horodatages monotones | P — cohérence. |
| AGI-060 | Valeur absolue position unique | P — ordonnanceur. |
| AGI-070 | Sujet unique dans une séance | P — restriction d'occurrence. |
| AGI-080 | Un point actif à la fois | P — conduite séquentielle. |
| AGI-090 | Création inactive | P — automate. |
| AGI-100 | Point commencé non supprimable | P — historique. |
| AGI-110 | Sujet immuable | P — identité. |
| AGI-120 | Début exige séance ouverte | P — ne prouve pas quorum courant J1. |
| AGI-130 | Début immuable | P — historique. |
| AGI-140 | Fin immuable | P — historique. |
| AGI-150 | Question ouverte terminée sans scrutin | P — périmètre choisi pour OpenQuestion. |
| AGI-160 | Point soumis au vote exige scrutin clos | P — automate du point. |
| AGI-170 | Scrutin clos termine point | P — un scrutin épuise le point dans Hall. |
| AGI-180 | Démarrage distinct avant clôture | P — actions. |
| AGI-190 | Placement commencé immuable | P — historique. |
| AGI-200 | Programmation de proposition atomique | P — transaction. |
| AGI-210 | Programmation question atomique | P — transaction. |
| AGI-220 | Programmation approbation atomique | P — transaction. |
| AGI-230 | Déprogrammation possible | P — outil préparatoire ; aucune validation juridique implicite. |
| AGI-240 | Reprogrammation avant début | P — automate. |
| AGI-250 | Démarrage par action nommée | P — API. |
| AGI-260 | Fin question par action nommée | P — API. |
| AGI-270 | Aucune écriture agenda après clôture | P — gel transactionnel. |
| AGI-280 | Report automatique des inachevés | P — proposition de prochain agenda, pas convocation automatique. |
| AGI-290 | Réordonnancement ensemble exact | P — cohérence de commande. |
| AGI-300 | Programmation nommée position positive | P — encodage. |
| AGI-310 | Point terminé reste programmé | P — historique. |
| AGI-320 | Point déprogrammé non terminable | P — automate. |
| AGI-330 | Scrutin ouvert bloque déprogrammation | P — cohérence. |
| AGI-340 | Déprogrammation commencée irréversible | P — restriction Hall. |
| AGI-370 | Déport identifié membre × point | P — FK, unicité, journal et horodatages Hall ; S5/S7 motivent la preuve mais n'imposent pas cette table ni ne prouvent un signalement avant débat. |

### Scrutins — BAL (31 IDs après correction du doublon)

Autorités : [modèle](../packages/postgres/sql/council/020-ballots.sql),
[participations](../packages/postgres/sql/council/025-ballot-participation.sql),
[cycle participation](../packages/postgres/sql/council/035-ballot-participation-lifecycle.sql),
[résultat](../packages/postgres/sql/council/037-ballot-rules.sql),
[cycle scrutin](../packages/postgres/sql/council/040-ballot-lifecycle.sql),
[actions](../packages/postgres/sql/council/055-ballot-actions.sql).

| ID | Règle relevée | Origine, source et portée |
| --- | --- | --- |
| BAL-010 | Mode détermine anonymat | M — S4 et S3 al. 4 ; représentation binaire Hall. |
| BAL-020 | Aucun résultat avant clôture | P — automate binaire. |
| BAL-030 | Un scrutin par point | P — ne couvre pas les tours électoraux S4. |
| BAL-040 | Résultat et clôture coexistants | P — invariant d'état. |
| BAL-050 | Une participation par présence/scrutin | P — cardinalité ; porteur et mandant restent distincts. |
| BAL-060 | Président référence une participation | P — FK différée ; loi ne prescrit pas ce couplage. |
| BAL-070 | Participation immuable | P — historique. |
| BAL-080 | Scrutin clos refuse participation | P — gel. |
| BAL-090 | Participation de la même séance | P — intégrité relationnelle. |
| BAL-100 | Seuls présents/représentés participent | M — S2 ; vérifier effectivité et exclusions S5, pas seulement statut initial. |
| BAL-110 | Nombre participants par déclarations | P — mécanisme de comptage. |
| BAL-120 | Nombre votes somme des counts | P — représentation des suffrages. |
| BAL-130 | Décompte filtré par choix | P — projection. |
| BAL-140 | Président participant physiquement présent | P — couplage Hall ; obligation de participer au vote U, S8 ne l'établit pas. |
| BAL-150 | Abstentions exclues majorité | R — interprétation de S2 al. 2, hors suffrages exprimés. |
| BAL-160 | Majorité pour adopte | R — S2 al. 2, proposition binaire ordinaire. |
| BAL-170 | Majorité contre rejette | R — S2 al. 2, même périmètre. |
| BAL-180 | Égalité publique selon vote président | M — S2 al. 3 ; texte vise tout scrutin non secret, Hall l'encode public. |
| BAL-190 | Égalité secrète ou sans choix décisif rejette | M — S2 al. 2–3 pour proposition ordinaire ; ne généraliser ni aux élections S4 ni aux régimes spéciaux. |
| BAL-200 | Scrutin non supprimable | P — historique. |
| BAL-210 | Création ouverte | P — automate. |
| BAL-220 | Scrutin exige séance commencée | P — automate. |
| BAL-230 | Scrutin exige point actif, hors question | P — périmètre et parcours Hall. |
| BAL-240 | Identité/mode/président immuables | P — restriction de correction. |
| BAL-250 | Scrutin clos immuable | P — historique. |
| BAL-260 | Résultat exclusivement dérivé en base | P — autorité technique, calcul légal dans BAL-150 à 190. |
| BAL-270 | Un choix par participation déclarée | P — cohérence de saisie ; ne crée pas obligation légale de voter. |
| BAL-280 | Séance close refuse nouveau scrutin | P — automate. |
| BAL-290 | Scrutin ouvert bloque clôture séance | P — automate. |
| BAL-300 | Clôture par action nommée | P — `BALLOT_COMPLETION_IS_A_NAMED_ACTION`, 055. |
| BAL-310 | Déporté exclu personnellement/comme porteur | M — `RECUSED_MEMBER_CANNOT_PARTICIPATE`, 035 ; S5/S6, qualification et garde Hall. Nouveau déport initialement en collision sous BAL-300, corrigé par son propriétaire. |

### Votes — VOT (9 IDs)

Autorités : [votes](../packages/postgres/sql/council/030-votes.sql),
[cycle](../packages/postgres/sql/council/050-vote-lifecycle.sql).

| ID | Règle relevée | Origine, source et portée |
| --- | --- | --- |
| VOT-010 | Abstention enregistrée et exclue majorité | M — enregistrement Hall ; exclusion S2 al. 2. « Vote exprimé » technique ne doit pas signifier suffrage exprimé juridique. |
| VOT-020 | Count positif | P — zéro représenté par absence de ligne. |
| VOT-030 | Public nominatif, secret anonyme | M — S3 al. 4/S4 ; formes SQL choisies. |
| VOT-040 | Un vote public par participation | P — unicité SQL. |
| VOT-050 | Un agrégat secret par choix | P — une ligne par choix n'est pas une forme imposée. |
| VOT-060 | Vote immuable | P — correction/history. |
| VOT-070 | Aucun vote après clôture | P — gel. |
| VOT-080 | Forme vote conforme au mode | M — S4 pour secret ; garde SQL choisie. |
| VOT-090 | Participation du bon scrutin | P — intégrité relationnelle. |

### Procès-verbaux — MIN (21 IDs)

Autorités : [modèle](../packages/postgres/sql/council/015-council-business.sql),
[capture/cycle](../packages/postgres/sql/council/061-minutes.sql),
[génération](../packages/postgres/sql/council/073-minutes-api.sql),
[clôture API](../packages/postgres/sql/council/074-meeting-closure-api.sql),
[notes](../packages/postgres/sql/workspace/030-council-agenda-api.sql).

| ID | Règle relevée | Origine, source et portée |
| --- | --- | --- |
| MIN-010 | Un PV par séance | M — S3 al. 3 ; unicité d'agrégat Hall. |
| MIN-020 | Une approbation par PV | P — objet unique n'est pas une obligation de réussir un vote unique. |
| MIN-030 | Clôture crée approbation | M — S3 al. 3 ; génération immédiate de l'objet Hall. |
| MIN-040 | Document généré distinct et immuable | P — propriété hors workspace. |
| MIN-050 | Approbation hors workspace | P — frontière de domaine. |
| MIN-060 | Identités et votes capturés | M — S3 al. 4 ; copie SQL ne prouve pas toutes les mentions. |
| MIN-070 | Historique non supprimable | M — S3 al. 6 pour original ; tout historique technique non supprimable est Hall. |
| MIN-080 | Brouillon initial à clôture | P — moment et automatisation. |
| MIN-090 | Faits et origine immuables | P — politique de correction. |
| MIN-100 | Brouillon gelé dès génération | P — S3 ne prescrit pas ce gel anticipé. |
| MIN-110 | Document généré immuable | P — une version dérivée n'est pas automatiquement original signé. |
| MIN-120 | Octets PDF exigés | P — pas de format PDF imposé par S3. |
| MIN-130 | Vote d'approbation référence PDF généré | P — mécanisme de rattachement. |
| MIN-140 | Clôture retourne brouillon autonome | P — API. |
| MIN-150 | Notes éditables jusqu'à clôture | P — politique éditoriale. |
| MIN-160 | Faits capturés à clôture | P — photographie choisie. |
| MIN-170 | Une section par point capturé | P — plan éditorial. |
| MIN-180 | Plan non supprimable/réassignable | P — restriction de correction. |
| MIN-190 | Section de l'agenda capturé | P — intégrité. |
| MIN-200 | Notes initialisent section correspondante | P — automatisation éditoriale. |
| MIN-210 | PV conserve preuve nominative des déports | P — preuve Hall motivée par S5/S7 ; rubrique autonome non prescrite par S3. |

### Annuaire — DIR (12 IDs)

Autorités : [catalogue](../packages/postgres/sql/directory/000-requirements.sql),
[modèle](../packages/postgres/sql/directory/010-model.sql),
[API](../packages/postgres/sql/directory/020-api.sql).

| ID | Règle relevée | Origine, source et portée |
| --- | --- | --- |
| DIR-010 | Contact indépendant du mandat | P — modèle d'annuaire. |
| DIR-020 | Une mandature active, capacité positive | P — singleton et configuration ; pas calcul légal S10/S11. |
| DIR-030 | Membre = mandat contact/mandature | P — représentation ; ne prouve pas investiture ni prise d'effet J4. |
| DIR-040 | Un mandat actif par contact | P — intégrité monotenant. |
| DIR-050 | Capacité active non dépassée | P/U — plafond configuré ; prétention à garantir effectif légal non prouvée par S10/S11. |
| DIR-060 | Contact archivé sans mandat actif | P — sémantique archive applicative. |
| DIR-070 | Dates mandat ordonnées | P — cohérence ; une date de fin ne suffit pas à qualifier une démission. |
| DIR-080 | Commission indépendante des membres | P — objet durable ; contexte S9 ne prescrit pas sa structure. |
| DIR-090 | Une appartenance active par commission | P — unicité. |
| DIR-100 | Appartenance active exige entités actives | P — `active` applicatif, pas preuve complète de composition S9. |
| DIR-110 | Dates appartenance dans mandat | P — cohérence temporelle. |
| DIR-120 | Fin mandat/archive clôt appartenances | P — automatisation à la même date, non règle textuelle S9. |

### Ressources documentaires — DOC (26 IDs)

Autorité descriptive : [catalogue](../packages/postgres/sql/document/000-requirements.sql),
avec modèle, règles, API et projections dans le même domaine SQL. Toutes les
règles suivantes sont **P** ; aucune source légale ni version applicable à leur
forme n'est attribuée. La protection des données et des archives reste un
chantier réglementaire transversal distinct ; S12 empêche de présenter la
suppression technique complète comme une autorisation générale de détruire.

| ID | Règle relevée | Origine |
| --- | --- | --- |
| DOC-010 | Exactement une nature concrète | P |
| DOC-020 | Localisation normalisée unique | P |
| DOC-030 | Dossier est une ressource | P |
| DOC-040 | Conteneur est un dossier | P |
| DOC-050 | Racine implicite | P |
| DOC-060 | Suppression explicite dossier vide | P |
| DOC-070 | Contenus complexes structurés | P |
| DOC-080 | Octets séparés immuables | P |
| DOC-090 | Nature immuable | P |
| DOC-100 | Modèle de lecture stable | P |
| DOC-110 | Liste des enfants directs | P |
| DOC-120 | Création des parents manquants | P |
| DOC-130 | Déplacement/renommage atomique | P |
| DOC-140 | Contenu éditable versionné | P |
| DOC-150 | Suppression enveloppe et composant | P — réserve archives S12, source de limite seulement. |
| DOC-160 | Métadonnées binaires cohérentes | P |
| DOC-170 | Slug public stable | P |
| DOC-180 | Catalogue plat | P |
| DOC-190 | Cible distante structurelle | P |
| DOC-200 | Présentation sous autorité persistante | P |
| DOC-210 | Hydratation limitée au périmètre | P |
| DOC-220 | Siren documentaire produit en base | P |
| DOC-230 | Actif éditeur propriété du texte | P |
| DOC-240 | Actifs suivent références du texte | P |
| DOC-250 | Référence binaire unifiée | P |
| DOC-260 | Structure minimale des contenus validée | P — une référence juridique bien formée n'est pas une source vérifiée. |

### Espace de travail — WSP (21 IDs après correction des collisions)

Autorités : [modèle](../packages/postgres/sql/workspace/010-council-business-workspace.sql),
[API affaires](../packages/postgres/sql/workspace/020-council-business-api.sql),
[API agenda](../packages/postgres/sql/workspace/030-council-agenda-api.sql).
Toutes les lignes sont **P**, source/version juridique sans objet.

| ID | Règle relevée | Origine |
| --- | --- | --- |
| WSP-010 | Affaire possède dossier et rapport | P |
| WSP-015 | Toute affaire possède workspace | P |
| WSP-020 | Rapport dans dossier de l'affaire | P |
| WSP-030 | Déplacement préserve identité affaire | P |
| WSP-040 | Projection affaire limitée | P |
| WSP-050 | Création affaire/workspace atomique | P |
| WSP-060 | Projection agenda limitée | P |
| WSP-070 | Actions retournent projection limitée | P |
| WSP-090 | Association ressource sans déplacement | P |
| WSP-100 | Ordre stable des ressources associées | P |
| WSP-110 | Identité d'association immuable | P |
| WSP-120 | Pièce de travail distincte du rapport/dossier | P |
| WSP-130 | Projection ressources limitée | P |
| WSP-140 | Ajout pièce sans déplacement | P |
| WSP-150 | Dissociation possible | P |
| WSP-160 | Réordonnancement exact | P |
| WSP-170 | Historique agenda projeté en lot | P |
| WSP-180 | Liste workspaces en lot | P — `BUSINESS_WORKSPACE_LIST_IS_BULK_PROJECTED`. |
| WSP-190 | Ressources affaires en lot | P — `BUSINESS_RESOURCES_ARE_BULK_PROJECTED`. |
| WSP-200 | Création affaire et programmation décision atomiques | P — `COUNCIL_BUSINESS_CREATION_AND_DECISION_PROGRAMMING_ARE_ATOMIC`, initialement collision WSP-180. |
| WSP-210 | Création affaire et programmation question atomiques | P — `COUNCIL_BUSINESS_CREATION_AND_OPEN_QUESTION_PROGRAMMING_ARE_ATOMIC`, initialement collision WSP-190. |

### Lieux — LOC (trois IDs normalisés)

Autorité : [SQL embarqué](../packages/server/src/infrastructure/database/meetingLocationsSchema.ts).
Les trois annotations initialement hors convention ont été normalisées par le
backend. Leur correspondance est conservée ci-dessous : elles ne doivent pas
disparaître du catalogue parce qu'une expression régulière n'accepte que
`HALL-FR-*`. La découverte globale doit continuer de diagnostiquer les futurs
formats non reconnus.

| ID courant (préfixe HALL-FR-) | Ancien ID et règle | Origine, source/version |
| --- | --- | --- |
| LOC-010 | `FR-HALL-LOCATION-001` : chaque lieu appartient au singleton Hall | P — sans objet. |
| LOC-020 | `FR-HALL-LOCATION-002` : rangs positifs uniques ; premier lieu par défaut | P — sans objet. |
| LOC-030 | `FR-HALL-LOCATION-003` : nom normalisé non vide, unique dans Hall | P — sans objet ; limite SQL de 200 caractères également produit. |

### Candidats documentaires non comptés comme production

L'[analyse du quorum](council-quorum-requirements.md) propose encore des IDs
qui ne doivent pas recevoir artificiellement une preuve d'implémentation.

| ID candidat | Proposition | Qualification |
| --- | --- | --- |
| HALL-FR-MTG-270 | Quorum ordinaire depuis membres en exercice | M — S1 pour seuil ; provenance persistée Hall ; qualification de l'effectif à établir pour chaque régime. |
| HALL-FR-AGI-350 | Contrôle du quorum à la discussion | M — J1 pour instant ; atomicité et preuve enregistrée Hall. |
| HALL-FR-AGI-360 | Pas de remplacement du contrôle par celui du vote | M — J2, dans sa portée ; mémoire du contrôle Hall. |
| HALL-FR-ATT-120 | Historique des changements de présence | P — réalise le suivi nécessaire à J1, qui n'impose pas ce journal. |

Les autres candidats de ce document, AGI-370/MTG-280/MIN-210 et le déport nommé
initialement BAL-300 puis affecté à BAL-310, apparaissent déjà dans le WIP lu.
Le document de quorum n'est donc pas
une autorité d'allocation fiable sans rapprochement avec le checkout courant.

## Lacunes et décisions à rendre visibles

- **Quorum** : un seuil positif hérité et un contrôle d'ouverture ne prouvent
  ni S1 ni J1. Seconde convocation, déports et composition effective doivent
  conserver leurs conditions. La computation détaillée du délai et les régimes
  territoriaux particuliers, notamment Alsace-Moselle, ne sont pas validés ici.
- **Déports** : les deux variantes de conflits constituent une tranche fermée,
  pas la liste de tous les empêchements légaux. S8 couvre un autre cas, le CFU.
  La qualification des représentants exige S6 I/II/III. L'exclusion du
  numérateur général s'appuie sur J3 ; ne pas la qualifier de formule
  textuellement écrite dans S5 après 2025.
- **Pouvoirs** : unicité d'une pièce et gel de présence ne prouvent pas durée,
  révocation, ni situation du porteur lors de chaque scrutin (S2).
- **Scrutins** : résultats `approve/reject`, un scrutin par point et absence de
  tours/candidatures ne couvrent pas S4. Le zéro suffrage, les blancs/nuls et
  les non-participations nécessitent des qualifications distinctes ; ne pas
  assimiler automatiquement ces faits à l'abstention technique.
- **PV** : l'ordre de traitement, les corrections avant arrêté, les signatures,
  les demandes de scrutin et les formalités de diffusion/conservation doivent
  être prouvés séparément. Un PDF généré ou un point terminé ne les établit pas.
- **Annuaire** : dates ordonnées, capacité configurée et `active` ne constituent
  pas un moteur du droit des mandats ou de la composition des commissions.
- **Dossiers et lieux** : les choix de structure ne prouvent ni accès légal aux
  pièces, ni protection des données, ni lieu juridiquement admissible. Une
  exigence réglementaire correspondante doit être formulée et sourcée
  séparément si elle entre dans le périmètre d'automatisation.
- **Couverture** : cet inventaire est exhaustif des annotations relevées, pas
  de toutes les obligations applicables à Hall. Les convocations, formalités
  des actes, archives et protection des données ne deviennent pas conformes
  parce qu'aucun ID réglementaire correspondant n'apparaît dans ces tables.

## Maintenance

Toute évolution d'une règle doit mettre à jour sa proposition, sa source ou sa
justification produit, sa portée, son invariant et ses scénarios. Une réforme
ne justifie pas de réécrire rétroactivement les faits des anciennes séances.
Une source remplacée doit être conservée avec son intervalle et ses usages.
Le référent distingue ce qui a été lu, ce qui a été interprété et ce qui reste
non prouvé. Aucun statut global « conforme » ne se déduit de la seule réussite
du vérificateur.
