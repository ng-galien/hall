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

## Décision produit : régime du quorum

Décision explicite du propriétaire du **6 septembre 2026** : Hall relève du
**régime de droit commun pour les règles du quorum** et ne prend pas en charge
le régime territorial particulier d'Alsace-Moselle. Cette décision définit le
périmètre du produit, pas seulement celui d'une livraison. Elle ne prétend pas
que les règles de droit commun s'appliquent juridiquement à toutes les communes.

Sa classification est `nature: functional`, `origin: product` ; la clause
de périmètre porte `sourceIds: []`, sans statut de validation juridique.
Les clauses réglementaires du calcul restent distinctes et renvoient à S1,
J1/J2 et, pour les déports, S5/S6/J3 ci-dessous. Les deux fondements de déport
`personalInterest` et `designatedRepresentativeConflict` restent en périmètre.
L'exclusion territoriale ne supprime aucun de ces deux traitements.

La réalisation et sa traçabilité sont détaillées dans l'[analyse du
quorum](council-quorum-requirements.md). Le rattachement convenu dans le
[registre](../packages/postgres/requirements.json) est
`HALL-FR-MTG-270/common-law-scope`, séparément des clauses qui établissent le
contenu légal du calcul. La clause est présente dans le registre relu.

## Décision produit : aperçu, correction et confirmation du scrutin

À la demande explicite du propriétaire, la saisie d'un résultat passe par un aperçu
calculé par le backend, corrigeable avant une confirmation explicite. Cette
exigence `HALL-FR-BAL-320` est de nature `functional` et d'origine `product`.
Elle ne découle pas d'une obligation légale de disposer de cet écran.

- L'aperçu conserve une version du candidat et son calcul ; il ne crée ni
  `Ballot`, ni `Vote` définitif, ni décision, et ne termine pas le point.
- Une correction produit un nouvel aperçu calculé en SQL. La version précédente
  ne peut plus être confirmée ; un changement du contexte de séance exige aussi
  un nouvel aperçu.
- Seule la confirmation explicite enregistre atomiquement le scrutin et ses
  votes définitifs et termine le point. Le backend lie le résultat enregistré
  au candidat effectivement présenté ; le frontend n'est pas une autorité de
  calcul du résultat. Une seconde confirmation est refusée.

the user demande également que le **quorum courant soit satisfait avant
l'aperçu**, ou que la dispense de seconde convocation soit applicable. Ce
contrôle supplémentaire est `product`. Il s'ajoute au contrôle réglementaire à
la mise en discussion (J1) ; il ne remplace ni ne réécrit ce constat et ne
transforme pas un départ ultérieur en irrégularité rétroactive (J2).

Les clauses produit convenues pour `HALL-FR-BAL-320` sont
`candidate-review-confirmation` et `current-quorum-before-preview`, avec
`sourceIds: []`. La liaison technique du candidat, de sa version et du contexte
est `HALL-TR-CON-200/reviewed-candidate-and-context`, de nature `technical` et
d'origine `product`. Ces entrées
et leurs clauses sont présentes dans le registre relu, avec les annotations
correspondantes dans le code. Les sources S2/S4 demeurent les références distinctes des
règles de majorité et de scrutin, pas des choix d'interface ou de confirmation.

Autorités : [calcul et versions SQL](../packages/postgres/sql/council/039-ballot-result-preview.sql)
et [création et confirmation de l'aperçu](../packages/postgres/sql/council/076-ballot-result-preview-api.sql).
Les [scénarios de l'aperçu](../packages/postgres/sql/council/test/19-ballot-result-preview.test.sql)
vérifient notamment l'absence d'écriture définitive avant confirmation, la
correction, les versions périmées, le contexte modifié et la confirmation unique.
Le [parcours quorum](../packages/postgres/sql/council/test/18-quorum-workflows.test.sql)
distingue le refus produit avant aperçu de la conservation du constat de
discussion. Après les 51 assertions initialement annoncées pour ces deux
fichiers, le backend annonce désormais 35 assertions réussies pour le fichier
18 enrichi des bornes temporelles, du refus après clôture et du remplacement
d'un mandat. Le référent a relu ces scénarios sans réexécuter les tests. Cela ne
prouve pas encore le parcours HTTP/IHM intégré.

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
des dates et rejette une entrée en vigueur ou une décision postérieure à
`asOf`, ainsi qu'un `asOf` postérieur à `verifiedAt`. Ces contrôles ne prouvent
pas l'applicabilité juridique à une occurrence ni l'absence d'une réforme.
La pertinence source/proposition reste la responsabilité du référent.
Les scénarios pgTAP council restent un contrôle spécifique : il n'existe pas
dans ce script global une preuve automatique d'exécution de chaque test de
chaque package.

Commandes disponibles depuis la racine :

```sh
npm run check:requirements
node --test scripts/check-requirements.test.mjs
bash packages/postgres/sql/council/test/verify-traceability.sh
```

Résultats communiqués par le propriétaire backend le 6 septembre 2026 :
premier état de **251 définitions, 84 références, 16 sources**, avec une clause explicitement
`UNPROVEN` (`HALL-FR-MTG-280/general-presence`). Les **huit tests du
vérificateur** passent. Le contrôle council chaîné est vert : **169 exigences,
115 levées métier, 79 SQLSTATE Hall et quatre codes natifs**. Ces résultats
portent sur la structure et la traçabilité ; ils ne changent pas le statut
juridique de la clause non prouvée.

Après consolidation du quorum et de l'aperçu, le contrôle structurel relancé
par le référent relève **261 définitions, 84 références et 18 sources**, avec
la même clause `UNPROVEN`. Les ajouts J5/J6 documentent les jours francs ; ce
nouveau résultat ne remplace pas les preuves d'exécution des parcours.

Le référent documentaire a relu les nouveaux contrôles de dates et de références
malformées dans le script et leurs scénarios, sans réexécuter ces tests ni les
suites runtime. Pour cette documentation seule : relire le diff
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
| J5 | [CE, 16/06/1997, n° 142691, considérants sur L121-11](https://www.legifrance.gouv.fr/ceta/id/CETATEXT000007970358/) | Décision 16/06/1997 ; consultée 06/09/2026 | Trois jours francs depuis envoi de la nouvelle convocation, également après perte de quorum en cours de séance. |
| J6 | [CE, 13/10/1993, n° 141677, considérant sur l’envoi du 21 décembre](https://www.legifrance.gouv.fr/ceta/id/CETATEXT000007838872/) | Décision 13/10/1993 ; consultée 06/09/2026 | Jours calendaires incluant weekends et fériés, sans prorogation civile au prochain jour ouvrable. |

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
| MTG-070 | `COUNCIL_MEETING_OPENING_RECORDS_QUORUM` — constat conservé à l’ouverture, y compris `notMet` | M — ouverture logicielle produit ; S1/J1 pour la validité des délibérations. |
| MTG-080 | Date initialement absente | P — préparation anticipée. |
| MTG-090 | Clôture exige démarrage | P — automate. |
| MTG-100 | Séance close immuable | P — gel des données. |
| MTG-110 | Clôture produit successeur et PV | M — S3 al. 3 pour PV ; successeur automatique unique choisi par Hall. |
| MTG-120 | PV précédent approuvé avant clôture | M — règle du commencement établie par S3 al. 3 ; garde de clôture Hall vérifiant l’approbation effective. L’ajournement ne satisfait pas cette garde. |
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

### Exigences de quorum en cours de consolidation

Les IDs ci-dessous sont désormais annotés dans le SQL du chantier courant.
Leur qualification reste distincte de la validation finale de leur intégration.

| ID en consolidation | Proposition | Qualification |
| --- | --- | --- |
| HALL-FR-MTG-270 | Quorum ordinaire depuis membres en exercice | M — S1 pour seuil ; provenance persistée Hall ; qualification de l'effectif à établir pour chaque régime. |
| HALL-FR-AGI-350 | `DECISION_CONSIDERATION_REQUIRES_RECORDED_CURRENT_QUORUM` — quorum à l’examen formel des projets de délibération et du PV | M — J1 pour instant ; atomicité, preuve enregistrée et distinction des échanges Hall. |
| HALL-FR-AGI-360 | Pas de remplacement du contrôle par celui du vote | M — J2, dans sa portée ; mémoire du contrôle Hall. |
| HALL-FR-ATT-120 | Historique des changements de présence | P — réalise le suivi nécessaire à J1, qui n'impose pas ce journal. |

AGI-370/MTG-280/MIN-210 et le déport initialement nommé BAL-300 puis affecté
à BAL-310 sont également présents dans le code. Toute nouvelle attribution
reste à rapprocher du registre et du checkout courant.

## Curation du contrôle par affaire — 6 septembre 2026

Ces scénarios orientent les invariants et leurs tests ; leur présence dans ce
document ne constitue pas une preuve d'exécution.

| Situation | Résultat attendu et qualification |
| --- | --- |
| 15 membres en exercice, sept présents admissibles, un pouvoir | Quorum non atteint : le pouvoir n'ajoute pas de présence (S1/S2). Avec huit présents admissibles, quorum atteint. |
| 14 membres en exercice, sept puis huit présents admissibles | Seuil huit : la majorité exige strictement plus de la moitié (S1). |
| Une affaire A discutée avec quorum, puis départ avant le vote ; affaire B suivante | Conserver le constat de A ; le départ ne l'invalide pas à lui seul (J2). Recontrôler pour B (J1). Cela ne dispense pas de vérifier qui participe effectivement au scrutin. |
| Un membre arrive avant la discussion suivante | Le nouveau constat tient compte de sa présence réelle ; le journal de mouvements est une réalisation produit de J1. |
| 15 membres en exercice, huit présents dont un déporté pour intérêt personnel | Sept présences admissibles, dénominateur 15, seuil huit selon l'interprétation J3 retenue. La confirmation post-réforme 2025 reste `unproven` pour `MTG-280/general-presence`. |
| 15 membres en exercice dont deux relevant effectivement de S6 II | Dénominateur 13, seuil sept ; les déportés ne contribuent pas aux présences admissibles. Vérifier les conditions et exclusions de S6 I/II/III, sans assimiler tout représentant à ce cas. |
| Une abstention volontaire, sans motif de déport | Ne diminue pas automatiquement le dénominateur ou la présence pour le quorum ; exclue des suffrages exprimés (S1/S2). |
| Composition de l'annuaire modifiée après un constat | Les faits anciens restent conservés ; un nouvel instantané conserve la composition utilisée sans réécrire le précédent. La source produit est la mandature actuelle, pas une liste justificative saisie séparément. |

**Décision produit du 7 septembre 2026 — `HALL-FR-MTG-300`** : la commande
unique `meeting.record-opening` capture dans PostgreSQL tous les membres actifs de la mandature actuelle,
y compris les absents et représentés, puis enregistre l'appel, les pouvoirs,
les officiers et l'observation de quorum dans une transaction. Aucun formulaire
séparé ni référence justificative libre ne sert à ressaisir cet effectif.
La décision ultérieure du propriétaire autorise l'ouverture logicielle et le
déroulement des échanges même si le verdict est `notMet`, tout en conservant
ce constat. Sans quorum applicable, aucun vote n'est permis et les points
soumis au vote sont à ajourner. Cette décision remplace le choix précédent de
laisser `startedAt` nul. Les entrées invalides et autres prérequis non satisfaits
restent refusés sans écriture partielle. La dispense d'une seconde convocation
régulièrement qualifiée reste applicable sous ses propres conditions.
L'instantané nominatif daté reste
une preuve interne conservée, jamais déduite des seuls présents ou des sièges
théoriques. Cette décision remplace le constat nominal manuel précédemment
proposé ; elle ne modifie pas la clause réglementaire de `MTG-270`.

Le constat `notMet` conserve les faits nécessaires à la reconvocation existante,
sans créer un épisode ni inventer un envoi. Un nouvel appel doit préserver cet
échec. Les scénarios attendus distinguent ouverture avec sept présents sur quinze
(constat conservé, aucun vote ni décision adoptée), quorum atteint et entrée
invalide (aucune écriture partielle).

S1 encadre la validité des délibérations, pas le champ technique `startedAt`.
J1 fixe néanmoins l'appréciation du quorum à la mise en discussion de chaque
délibération : l'autorisation produit d'échanger ne certifie pas une délibération
valide. Une consultation ou une question ouverte sans scrutin ne constitue pas
une dispense juridique automatique ; sans quorum, les notes d'échanges ne
produisent ni avis formel ni décision collective réputée adoptée. Un quorum
atteint plus tard au vote ne prouve pas rétroactivement le quorum initial.

Le contrat SQL retenu distingue donc `MTG-070`, qui conserve le constat à
l'ouverture, et `AGI-350`, qui conditionne l'entrée en examen formel d'un
projet de délibération ou d'une approbation de PV au quorum applicable.
Les points d'information peuvent entrer en échange avec leur observation,
sans produire une décision adoptée. Le contrôle du quorum courant au scrutin
reste distinct de ce contrôle à l'examen.

Le point d'approbation du PV précédent conserve sa portée propre (S3). Sans
approbation effective, il ne doit pas être marqué approuvé pour permettre la
clôture. Le traitement de son attente et de la clôture sans vote reste à
résoudre dans le cycle existant ; aucune approbation présumée ni perte de la
référence au PV n'est autorisée par cette décision.

**Décision produit du 7 septembre 2026 — `HALL-FR-AGI-410`
(`OPEN_QUESTIONS_CAN_BE_APPENDED_DURING_MEETING`)** :
une séance ouverte et non clôturée permet d'ajouter une `OpenQuestion`, selon
son comportement actuel de discussion, sans créer une délibération ni un
scrutin. « Question libre » désigne ici l'action demandée, pas une nouvelle
variante du domaine. L'exigence est `functional`, d'origine `product`.
La question est ajoutée en fin d'ordre du jour, avec une position SQL après
la plus grande position absolue et un numéro de présentation continu calculé
par le backend. L'ajout reste possible avec un constat `notMet` ou lorsque
tous les points précédents sont terminés, tant que la séance reste ouverte.
La convocation gelée et ses pièces restent inchangées. L'ajout intervenu en
séance conserve sa chronologie et sa trace dans le PV, sans être présenté
comme une question déjà annoncée dans la convocation. Aucun nouveau seuil de
quorum, délai de dépôt, vote d'autorisation ou formalité bloquante n'est ajouté
par cette décision. Les échanges ne produisent ni avis formel ni décision
collective réputée adoptée.
L'autorité de provenance est
[019b-agenda-additions.sql](../packages/postgres/sql/council/019b-agenda-additions.sql) :
elle conserve une trace immuable associant la séance d'origine, l'occurrence,
`introduced_at` et `recorded_by`. Le contrat `introducedAt` du point et du PV
rend identifiable l'introduction pendant la séance. Pour le PV, cette métadonnée
est projetée à la lecture depuis la relation d'ajout immuable liée à la séance
d'origine, sans réécriture des faits ni des PDF existants. L'action API
`addOpenQuestion` reçoit `path`, `name` et `content`.

Le backend rapporte les preuves suivantes le 7 septembre 2026, sans
réexécution par la curation documentaire :

- `27-open-question-addition.test.sql` : 16 contrôles réussis, quorum atteint
  puis `notMet`, ajout après traitement des points précédents, discussion et
  notes retrouvées dans le PV avec la date d'introduction, absence de scrutin,
  convocation gelée et PDF inchangés ; refus avant ouverture, après clôture,
  d'une discussion antidatée et d'une modification de la trace d'ajout.
- `26-meeting-conduct-blockers.test.sql` : sept contrôles réussis ; suite SQL
  complète rapportée : 20 fichiers et 631 contrôles réussis.
- `meetingNoticesPostgres.test.ts` : parcours HTTP réel réussi, ajout avec
  `notMet` renvoyant 201, tentative d'injection d'une nature renvoyant 400,
  faits de convocation inchangés.
- 107 tests Siren, audit et rendu unitaire du PV réussis ; contrôles de types
  et d'architecture rapportés sans erreur.

Le runtime est rapporté aligné et prêt, sans remise à zéro et avec conservation
des données utilisateur. Le test E2E frontend ciblé reste en cours ; ces preuves
ne constituent pas une validation finale de l'IHM.

Le contexte juridique, vérifié le 7 septembre 2026, est distinct du choix
d'implémentation. [L2121-19, alinéa 1, version depuis le 22 mars 2020](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000031038620)
reconnaît les questions orales des conseillers portant sur les affaires de
la commune ; à partir de 1 000 habitants, leur fréquence et leurs modalités
relèvent du règlement intérieur ou, à défaut, d'une délibération.
La [réponse ministérielle du 4 juin 2020 à la question Sénat n° 16423](https://www.senat.fr/questions/base/2020/qSEQ200516423.html)
précise qu'elles peuvent concerner un objet non inscrit à l'ordre du jour et,
en l'absence de précision locale, être posées le jour même. Cette réponse
est un éclairage institutionnel, pas une disposition législative ni une
autorisation générale de délibérer sur un objet non convoqué. Hall n'invente
pas les règles locales manquantes et ne certifie pas leur respect par le seul
ajout technique. S13 (`L2121-10`) demeure la référence pour le contenu de la
convocation ; S3 (`L2121-15`, alinéa 4) prévoit la teneur des discussions dans
le PV, sans imposer ce modèle de commande ou une transcription intégrale.

**Décision produit du 7 septembre 2026 — `HALL-FR-AGI-400`
(`AGENDA_PRESENTATION_NUMBERS_ARE_CONTINUOUS`)** : les points présentés
portent une numérotation logique continue à partir de 1, commune à l'IHM,
au mode séance, à la convocation et au PV. Cette exigence est `functional`,
d'origine `product`, issue de la décision utilisateur ; elle ne revendique
aucun fondement juridique. La propriété partagée `agendaNumber` est distincte
de `position`, clé d'ordonnancement SQL qui peut conserver des trous.
La projection de référence est
[059-meeting-snapshots.sql](../packages/postgres/sql/council/059-meeting-snapshots.sql) :
elle calcule le rang des éléments présentés ; après clôture, elle utilise
l'instantané de clôture. Les positions SQL et l'historique ne sont pas modifiés
pour combler les trous. Cette décision n'ajoute aucune garantie de stabilité
des numéros après modification de l'ordre du jour.

Le backend rapporte les résultats suivants le 7 septembre 2026 ; les scénarios
ont été relus dans les fichiers de tests, sans réexécution par la curation :

- `25-agenda-presentation-numbers.test.sql` : 10 contrôles réussis, couvrant
  le retrait (numéro nul), les trous conservés dans les positions SQL,
  la présentation continue de 1 à 5, le réordonnancement des identités,
  le gel des mêmes identités et numéros, l'ajournement et leur conservation
  dans le PV et l'API de séance clôturée après report des occurrences.
- Suite SQL complète rapportée : 18 fichiers, 608 contrôles réussis.
- `meetingNoticesPostgres.test.ts` : test HTTP réussi, mêmes numéros de 1 à 5
  dans l'API et la convocation gelée ; le texte du PDF produit par Chromium
  présente le point de position technique 6 sous le numéro 5. La pièce jointe
  de l'EML conserve les mêmes octets que le PDF.
- `minutesDocument.test.ts` : huit tests unitaires réussis, dont le cas
  `position: 6` avec `agendaNumber: 5`.

Le backend rapporte ensuite l'intégration dans le runtime partagé après
`demo:restart` : état de santé prêt, réponses HTTP 200 pour trois séances et
deux PV, avec numéros continus. Sa vérification CUA du mode séance et du PV
sur les données seed montre les numéros de 1 à 4, y compris un point ajourné
de position SQL `-4` présenté sous le numéro 4. Le cas comportant des trous
reste couvert par les preuves SQL et HTTP/PDF isolées ci-dessus ; sa recette
dans l'IHM et la recette desktop finale restent attendues côté frontend.
Ces résultats sont rapportés par le backend, sans nouvelle exécution par la
curation, et ne valent pas validation finale de l'affichage interactif.

**Progrès du 7 septembre 2026 — `HALL-FR-AGI-390`
(`CONDUCT_ACTIONS_EXPLAIN_UNAVAILABILITY`)** : cette exigence fonctionnelle
d'origine produit expose les motifs d'indisponibilité des actions de conduite
par le contrat typé `ConductBlocker`. PostgreSQL fournit les motifs métier
partagés avec les capacités Siren ; HTTP ajoute le refus de permission.
L'ajournement d'un point d'approbation de PV est désormais permis, en conservant
l'identité du PV et `completedAt` nul. Il ne vaut pas approbation.
`closureBlockers.previousMinutesPending` identifie le PV réellement en attente ;
la clôture reste refusée par `HV117`. La cardinalité, le report et le cycle de
clôture ne sont pas résolus par cette évolution. Le backend rapporte 22 contrôles
réussis dans `24-conduct-action-blockers.test.sql`, couvrant les quatre types
de points ; ce résultat n'a pas été réexécuté lors de la curation documentaire.

L'autorité de capture est [071-meeting-attendance-api.sql](../packages/postgres/sql/council/071-meeting-attendance-api.sql),
avec `MTG-270/nominal-membership-evidence` pour la conservation. `MTG-300`
est `functional`, d'origine `product`, sans source juridique artificielle.
Le parcours atomique est en cours de vérification côté backend ; la présente
mise à jour ne constitue pas son résultat de test.

Cette source automatique suppose que l'annuaire représente correctement les
mandats actifs. Elle n'est pas une prescription légale ni un moteur de prise
d'effet des mandats. Les dates de l'annuaire ne prouvent pas à elles seules
cette prise d'effet. Par exemple,
[L2121-4, al. 2, version depuis le 24 février 1996](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006389858)
fait produire effet à une démission ordinaire à sa réception par le maire ;
J4 distingue la situation des fonctions de maire ou d'adjoint. Il ne faut pas
inventer une convention légale d'intervalle de dates à partir du stockage SQL.

### Seconde convocation

[CE, 16 juin 1997, n° 142691, considérants sur l'article L121-11](https://www.legifrance.gouv.fr/ceta/id/CETATEXT000007970358/)
établit que le régime aujourd'hui codifié par S1 s'applique aussi à une perte
du quorum en cours de séance. Les trois jours sont francs et se comptent
depuis l'envoi de la nouvelle convocation, possible dès le constat d'échec.
Dans l'espèce jugée, un envoi le 28 décembre ne permettait pas la réunion le
31 décembre à 18 heures : le délai expirait le 1er janvier à zéro heure.
L'implémentation doit donc compter trois jours calendaires entiers intermédiaires,
dans le calendrier local applicable, et non 72 heures depuis la première réunion.

[CE, 13 octobre 1993, n° 141677, considérant sur l'envoi du 21 décembre](https://www.legifrance.gouv.fr/ceta/id/CETATEXT000007838872)
écarte la prorogation de procédure civile lorsque le délai comprend un samedi,
dimanche ou jour férié. Ces jours restent comptés. Ces deux décisions ont été
consultées le 6 septembre 2026.

Les scénarios doivent couvrir : première convocation régulière et échec
constaté, délai trop court refusé, délai franc satisfait, perte en cours après
des affaires déjà achevées, conservation des réunions et convocations
successives. Une même identité `CouncilMeeting` avec des épisodes distincts
est un choix de représentation, pas une identité prescrite par S1.

L'exemption ne doit pas être étendue automatiquement à des affaires nouvelles.
Une protection Hall peut rattacher les affaires reprises à celles restées à
traiter au constat d'échec et à la nouvelle convocation. L'identité intégrale
des IDs et de l'ordre de tous les points n'a pas été établie ici par une source
primaire de droit commun : ne pas présenter une comparaison informatique
d'ordre du jour comme une citation légale, ni imposer de revoter les affaires
déjà achevées au seul motif de leur présence dans l'ordre du jour initial.

### Présence et participation au scrutin

Un départ avant expression ne constitue pas une abstention volontaire ni un
bulletin blanc. Conserver distinctement le mouvement, une éventuelle
non-participation et le vote effectivement exprimé ; un départ ultérieur
n'efface pas ce vote. Un pouvoir ne crée pas de présence physique et exige un
porteur admissible au moment où il est exercé (S2 et règles de déport).
Le scrutin secret ne doit jamais rattacher un choix à une personne (S4).
Un journal de présence ne justifie ni ce rattachement ni un gel fictif des
mouvements pendant le scrutin.

the user a retenu la consignation distincte de la non-participation : c'est un
choix `product`, pas l'affirmation d'une rubrique séparée imposée par la loi.
La [réponse ministérielle à la question écrite n° 26978, publiée le 27 janvier 2004](https://questions.assemblee-nationale.fr/dyn/12/questions/QANR5L12QE26978)
confirme le même effet sur le résultat qu'une abstention, sans imposer
explicitement de fusionner les mentions. Cette réponse est un éclairage
ministériel daté, distinct d'une disposition législative ou d'une décision de
justice ; la règle des suffrages exprimés reste sourcée par S2.

Scénario : 15 membres en exercice, huit présents sans conflit, quatre pour,
trois contre et un refus de participer. Le quorum est huit, le nombre de
suffrages exprimés sept et la délibération ordinaire est adoptée. Une abstention
à la place du refus produit le même résultat, avec une consignation différente.
Le refus du membre resté présent n'est pas un déport et ne réduit pas le quorum.

Les règles ordinaires de majorité ne couvrent pas toutes les affaires.
[L1612-12, al. 2, version depuis le 1er janvier 2026, applicable à l'exercice budgétaire 2026](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000051731724)
prévoit l'approbation du CFU en l'absence de majorité contre son adoption.
Cette réserve, comme les élections à plusieurs tours de S4, interdit de
qualifier un simple calcul binaire générique de couverture complète des votes.

## Convocation : délai en jours francs et avertissement de séance

La demande explicite du propriétaire remplace le rappel calendaire J-3 par une
échéance calculée en **jours francs dans PostgreSQL**. Les données de séance
exposent l'échéance, son fondement et l'avertissement de date ; le serveur les
transporte et le frontend les présente. L'emplacement SQL et l'avertissement
interne sont des choix produit, distincts des règles réglementaires ci-dessous.
Ce mécanisme ne crée aucune notification externe et ne réalise aucun envoi.

Pour une réunion ordinaire, [L2121-11, al. 1, depuis le 24 février 1996](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006389867)
fixe trois jours francs dans les communes de moins de 3 500 habitants.
[L2121-12, al. 3, depuis le 19 août 2015](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000031069083)
fixe cinq jours francs pour celles de 3 500 habitants et plus ; son dernier
alinéa étend l'article aux communes plus petites pour une délibération portant
sur une installation visée par L511-1 du code de l'environnement.

Soit `D` la date civile de réunion dans le fuseau de la commune et `N` le délai
applicable : la dernière date d'envoi est `D - (N + 1)` jours calendaires.
Le jour d'envoi et le jour de réunion sont exclus ; les `N` dates intermédiaires
doivent être entières. Il s'agit du calcul inverse du délai réglementaire,
pas d'une soustraction d'heures à un instant. J6 confirme que samedis, dimanches
et jours fériés comptent, sans prorogation civile au prochain jour ouvrable.
Le fuseau utilisé doit être établi ; le préfixe d'un instant UTC ne constitue
pas nécessairement la date civile de la commune.

| Séance | Délai applicable | Dernière date d'envoi | Borne à vérifier |
| --- | --- | --- | --- |
| Vendredi 11 septembre 2026 | Trois jours francs | Lundi 7 septembre | Les 8, 9 et 10 sont entiers ; envoi le 8 trop tard. |
| Vendredi 11 septembre 2026 | Cinq jours francs | Samedi 5 septembre | Les 6 à 10 comptent ; pas de report au lundi. |
| Mardi 31 mars 2026, Europe/Paris | Trois jours francs | Vendredi 27 mars | Le changement d'heure ne modifie pas le calcul des dates. |

Une population inconnue n'est pas une population inférieure à 3 500 habitants.
Une date, un fuseau ou une qualification de régime insuffisamment établis
donnent une échéance indéterminée. Le calcul ordinaire ne doit pas se présenter
comme couvrant automatiquement les exceptions non modélisées. Une première
séance enregistrée dans Hall n'est pas, par ce seul fait, la première réunion
après renouvellement général ; un retard ne qualifie pas une urgence.
La seconde convocation conserve les conditions de `HALL-FR-MTG-290`, S1 et J5,
avec le calendrier de sa nouvelle réunion. Les dispositions d'urgence de
L2121-11/12 ne permettent pas d'inventer automatiquement un délai d'un jour.

L'avertissement compare la date locale courante à la date limite : à venir,
aujourd'hui ou dépassée. Au jour limite, il indique que la convocation doit être
transmise au plus tard aujourd'hui pour le délai retenu. En l'absence de preuve
d'envoi, la transmission reste **à vérifier** : la génération du PDF unique de
convocation contenant l'ordre du jour, son rattachement à la séance et l'export
du fichier mail `.eml` ne constituent pas cette preuve. Les pièces et notes
requises selon le cas demeurent distinctes de ce seul calcul.

Le rattachement convenu est `HALL-FR-NOT-110`
(`MEETING_NOTICE_USES_APPLICABLE_CLEAR_DAYS`) pour les clauses réglementaires de
délai et de décompte, avec leurs sources et scopes, et `HALL-TR-NOT-020`
(`NOTICE_DEADLINE_IS_PROJECTED_BY_POSTGRESQL`) pour l'autorité technique SQL et
la projection de l'avertissement, d'origine produit. Les clauses
`ordinary-period`, `calendar-count` et `sql-projection` sont présentes dans le
registre relu, avec S14/S15 et J6. La seconde convocation référence MTG-290
et conserve ses sources S1/J5.

L'autorité est [069-notice-deadline.sql](../packages/postgres/sql/council/069-notice-deadline.sql) :
`notice_clear_day_deadline` calcule la date civile ; `meeting_notice_deadline`
projette `noticeDeadline` dans les données de séance. La lecture du SQL confirme
la distinction entre `indeterminate`, `qualificationRequired` avec
`ordinaryReference`, et `determined` pour une seconde convocation qualifiée.
La population n'est pas nécessaire à ce dernier régime dont le délai est connu.

Le contrôle existant `npm run check:requirements` a été relancé par le référent :
**274 définitions, 85 références, 21 sources**, avec la seule clause
`MTG-280/general-presence` toujours explicitement `UNPROVEN`. Ce succès prouve
la structure du registre et ses références. Les tests de comportement des
dates et du changement d'heure restent à exécuter côté backend à ce stade.

Un éventuel calcul sur la seule base du régime ordinaire reste explicitement
indicatif si l'applicabilité n'est pas établie. Il ne doit pas être présenté
comme une échéance légale confirmée ou un délai respecté. L'état
`qualificationRequired` prime alors sur un avertissement qui laisserait croire
à tort qu'il reste du temps pour envoyer. Les paramètres existants de Hall
restent la source unique de population et de fuseau, sans seconde configuration.

## Lacunes et décisions à rendre visibles

- **Quorum** : un seuil positif hérité et un contrôle d'ouverture ne prouvent
  ni S1 ni J1. Seconde convocation, déports et composition effective doivent
  conserver leurs conditions. Le régime particulier d'Alsace-Moselle est exclu
  par la décision produit ci-dessus ; cette exclusion n'est pas une lacune à
  combler automatiquement.
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

## Faits des propositions confirmées

`HALL-FR-DEC-010` est une exigence produit : chaque confirmation de proposition
conserve une copie immuable du texte soumis, de la séance, des identités, du
quorum, des déports et du résultat. Le contrat sépare les votes publics nominatifs
des totaux secrets. Le test `28-council-decision-facts.test.sql` vérifie la capture
à la confirmation, le refus en l’absence du texte soumis, la stabilité après
changement de nom ou de présence et les protections contre l’effacement.

Les exigences produit `HALL-FR-DEC-020`, `040` et `050` couvrent désormais
le brouillon automatique pour adoption **ou rejet**, sa rédaction fidèle séparée
des faits, l’aperçu et le gel explicite du PDF. `HALL-TR-DEC-010` impose le contrôle
de version lors de l’édition et de la conservation du rendu. Le test
`29-council-decision-documents.test.sql` couvre ces transitions, les versions
périmées et les octets conservés ; la recette HTTP PostgreSQL dans
`ballotPreviewsPostgres.test.ts` vérifie les permissions Siren et un vrai PDF
contenant la rédaction, puis sa relecture immuable.

`HALL-FR-DEC-060` distingue l’ordre des délibérations dans la séance du rang de
l’ensemble des points et du numéro métier de publication. Sa clause réglementaire
renvoie à [R2121-9, version du 22 février 2026](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053561135),
revérifiée le 7 septembre 2026 ; compter les projets confirmés dans Hall est sa
mise en œuvre produit, sans prétendre couvrir à elle seule le registre officiel.

Le périmètre livré s’arrête au PDF figé. Le numéro métier au format
année-mois-index doit être fixé à la publication, chantier explicitement reporté.
Le PDF de cette tranche ne porte donc pas de numéro définitif et le gel n’en
attribue aucun. Il ne vaut ni signature, ni publication, ni transmission au
contrôle de légalité. Ces formalités nécessitent leurs propres preuves et ne
sont pas déduites du résultat adopté ou rejeté.

## Maintenance

Toute évolution d'une règle doit mettre à jour sa proposition, sa source ou sa
justification produit, sa portée, son invariant et ses scénarios. Une réforme
ne justifie pas de réécrire rétroactivement les faits des anciennes séances.
Une source remplacée doit être conservée avec son intervalle et ses usages.
Le référent distingue ce qui a été lu, ce qui a été interprété et ce qui reste
non prouvé. Aucun statut global « conforme » ne se déduit de la seule réussite
du vérificateur.


### Gabarit documentaire des délibérations — DEC-080

Le gabarit commun reprend l’enveloppe des modèles communaux fournis (demande
FEADER et vente de terrain du 26 juin 2026) : commune, titre complet, date
centrée, effectifs en lignes, deux colonnes avec filet, récit d’ouverture,
présences/pouvoirs/secrétaire, objet, corps riche et emplacements de signatures.
L’année en lettres dans le récit est une référence locale de présentation ;
aucun format typographique général obligatoire n’en est déduit.

Le contexte est lu dans les preuves historiques : commune/fuseau de la
convocation conservée avant confirmation, quorum et présence à l’ouverture,
qualité du président observée à la confirmation lorsqu’elle a été conservée.
Une qualité ancienne non observée reste inconnue. Le président est identifié
par les faits de séance (S8, L2121-14), sans lui attribuer le mandat du maire
actuel. Les présents à l’ouverture et les votants au scrutin sont distincts.
Le quorum est décrit selon son observation (S1, L2121-17), sans attester un
« nombre prescrit par la loi » à partir du seul décompte des votes.

Les règles de convocation et d’information des conseillers restent celles de
S13/S14/S15 (L2121-10 à L2121-12) et de
[L2121-13](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006389870),
consulté le 7 septembre 2026. Un PDF généré ne prouve pas sa transmission ni
l’accomplissement de ces obligations : sa date de génération n’est pas imprimée
comme date de convocation, et « légalement convoqué » n’est pas ajouté.
La date d’affichage figurant sur le modèle avant la séance n’est pas interprétée
comme publication de la délibération.

DEC-L2121-23 ([L2121-23, depuis le 1er juillet 2022](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044190494),
revérifié le 7 septembre 2026) fonde les qualités des emplacements secrétaire et
maire. Les emplacements restent vierges ; aucun paraphe, date de signature ou
« pour extrait conforme » n’est simulé. L’ordre de la délibération dans la
séance demeure distinct du numéro définitif (DEC-060 / R2121-9). Le gel ne
change pas de préconditions du seul fait de métadonnées absentes.

Les clauses, montants et modalités propres aux exemples restent du contenu
éditorial. Le moteur ne les ajoute pas aux autres délibérations et ne présume
pas l’unanimité. Le résultat est rendu depuis le scrutin confirmé, séparément
du corps éditable, sans modifier ce dernier. Les listes peuvent se poursuivre
entre clauses ; les petits tableaux de financement et les emplacements de
signature restent groupés lorsque leur taille le permet.
