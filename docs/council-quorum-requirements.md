# Exigences de quorum et preuves PostgreSQL

État du 6 septembre 2026. Cette spécification prépare l'intégration dans le
[dispositif d'exigences SQL](../packages/postgres/sql/council/000-requirements.sql)
et sa [couverture pgTAP](../packages/postgres/sql/council/test/README.md).
Les exigences proposées ci-dessous ne sont pas encore garanties par le runtime.
Aucune annotation de production ni couverture fictive ne leur est attribuée.

## Règles normatives à intégrer

En régime ordinaire, lors de la mise en discussion de chaque affaire donnant
lieu à délibération, Hall doit vérifier que le nombre de membres en exercice
physiquement présents est strictement supérieur à la moitié de l'effectif en
exercice applicable à la séance. Pour un effectif `N`, le seuil est
`floor(N / 2) + 1`. Un pouvoir ne constitue pas une présence physique.
Le dénominateur n'est ni l'effectif théorique du conseil, ni le nombre de
déclarations de présence, ni le nombre de votants.
Source : [CGCT L2121-17](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006389875).

Un contrôle réussi à l'ouverture de séance ne dispense pas de contrôler les
affaires suivantes. Un départ intervenu avant la mise en discussion d'une
affaire doit affecter ce contrôle. Source :
[CE, 18 octobre 1989, n° 63984](https://www.legifrance.gouv.fr/ceta/id/CETATEXT000007761919).

Une présence moindre au moment du vote ne doit pas, à elle seule, invalider
automatiquement le contrôle réussi lors de la mise en discussion de cette même
affaire. Les autres règles de participation au vote continuent de s'appliquer.
Source : [CAA Nancy, 1er avril 2010, n° 09NC01131](https://www.legifrance.gouv.fr/ceta/id/CETATEXT000022155054).

L'effectif pertinent est celui applicable au jour de la séance, pas une liste
figée à la convocation. Ce point a été confirmé par l'analyse réglementaire
coordonnée, à partir de la
[fiche de la préfecture du Rhône](https://www.rhone.gouv.fr/Services-de-l-Etat/Presentation-des-services/L-Etat-a-vos-cotes/1.4-Conseil-municipal-Quorum-DAJAL)
(lecture directe indisponible lors de cet audit : HTTP 502).
L'arrêt [CE, 6 février 2025, n° 494627](https://www.conseil-etat.fr/fr/arianeweb/CE/decision/2025-02-06/494627)
confirme qu'une démission devenue effective impose de tenir compte du
remplacement pour la séance ; il ne tranche pas une formule de quorum en cas
de vacance sans remplacement. Il distingue aussi la prise d'effet de certaines
démissions. Une simple date de fin de mandat dans Hall ne doit donc pas être
transformée implicitement en règle juridique de prise d'effet.

Deux régimes restent distincts du cas ordinaire : la seconde convocation
valablement constituée relève de l'exception de L2121-17 ; l'application du II
de [L1111-6](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053153012)
entraîne l'exclusion du dénominateur prévue par
[L2131-11](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053153029).
Une abstention ou un départ ne prouve pas l'application de ce régime spécial.
Cette tranche n'automatise ni la qualification de ces régimes ni le délai de
seconde convocation.

## Garanties existantes et limites de leur preuve

Les chemins SQL suivants sont relatifs à `packages/postgres/sql/council/`.

| ID existant | Autorité et preuve existantes | Limite |
| --- | --- | --- |
| `HALL-FR-MTG-010` | `005-council-meetings.sql`, `10-meeting-attendance.test.sql` : quorum positif, `23514` | Ne prouve pas la majorité des membres en exercice. |
| `HALL-FR-MTG-020` | `013-council-meeting-rules.sql`, test `10` : seuls les deux présents physiques du scénario sont comptés | Compte les déclarations d'ouverture, sans état courant des mouvements ni validation de l'effectif. |
| `HALL-FR-MTG-050` | `014-council-meeting-lifecycle.sql`, test `10` : quorum immuable, `HV113` | Le seuil est fourni à la création puis hérité par le successeur (`060` et test `15`). |
| `HALL-FR-MTG-070` | `014`, test `10` : ouverture sous le seuil refusée avec `HV115`, ouverture au seuil acceptée | Contrôle à l'ouverture seulement, à partir du seuil stocké. |
| `HALL-FR-ATT-080`, `HALL-FR-ATT-090` | `012-meeting-attendance-lifecycle.sql`, test `10` : déclarations verrouillées après ouverture, `HV102` | Aucun départ ni retour en séance n'est représenté par ces lignes. |
| `HALL-FR-AGI-120` | `018-council-agenda-lifecycle.sql`, test `20` : point programmé, séance démarrée, `HV215`/`HV216` | La transition de mise en discussion ne vérifie pas de quorum. |

Le modèle du scrutin (`040-ballot-lifecycle.sql`) vérifie son rattachement au
point actif et la cardinalité des votes, sans nouveau contrôle de quorum.
Cela ne suffit pas à prouver le scénario départ-après-discussion, puisque le
départ lui-même ne peut actuellement pas être enregistré.

## Identifiants proposés et scénarios d'acceptation

Inventaire courant : `MTG` atteint `260`, `AGI` atteint `340`, `ATT` atteint
`110`. Les identifiants suivants sont des **candidats non attribués** : vérifier
à nouveau leur disponibilité lors de l'implémentation et ne pas réutiliser les
anciens trous de numérotation. Les noms proposés sont en anglais conformément
au vocabulaire du code.

| ID candidat et nom | Exigence Hall | Preuve pgTAP attendue |
| --- | --- | --- |
| `HALL-FR-MTG-270` `ORDINARY_QUORUM_USES_MEMBERS_IN_OFFICE` | Calculer le seuil ordinaire depuis l'effectif applicable à la séance, avec une provenance persistée. | `N=15` : 7 présents refusés, 8 acceptés ; `N=14` : 7 refusés, 8 acceptés ; `N=13` : 6 refusés, 7 acceptés. Un effectif théorique de 15 ne remplace pas les 13 membres en exercice. |
| `HALL-FR-AGI-350` `CONSIDERATION_REQUIRES_CURRENT_QUORUM` | Refuser atomiquement la mise en discussion si le quorum applicable à cette affaire manque ; conserver les éléments du contrôle réussi. | Avec 13 membres et 7 présents : A commence ; un départ est constaté ; B est refusée, sans `started_at` ni observation de contrôle réussi ; un retour permet B. Six présents et un représenté restent insuffisants. |
| `HALL-FR-AGI-360` `CONSIDERATION_QUORUM_IS_NOT_RECHECKED_AT_VOTE` | Conserver le contrôle à la mise en discussion sans le remplacer par un contrôle de quorum au vote de cette affaire. | A commence avec 7 présents sur 13 ; un départ est constaté ; le scrutin A peut aboutir si ses autres invariants sont satisfaits ; B reste bloquée à 6 présents. |
| `HALL-FR-ATT-120` `PHYSICAL_PRESENCE_CHANGES_PRESERVE_HISTORY` | Conserver les constats de départ/retour sans réécrire les déclarations initiales ni les contrôles déjà effectués. | Départ puis retour modifient l'état utilisé par les affaires suivantes ; l'ouverture et le contrôle A restent inchangés ; update/delete de faits historiques refusés. |

Compléter ces scénarios par un changement de mandat effectif entre convocation
et séance : le membre remplacé ne contribue plus, le remplaçant admissible peut
contribuer, et les séances antérieures conservent leur observation. Les tests
doivent utiliser une prise d'effet explicitement représentée, pas supposer une
interprétation inclusive ou exclusive de `term_ended_on`.

## Autorités à faire évoluer

Le contrôle doit appartenir à la transition `NULL -> started_at` de
`enforce_council_agenda_item_lifecycle` (`018`), appelée par l'action nommée
`start_council_agenda_item` (`019`). Le placer seulement dans l'action laisserait
un `UPDATE` direct contourner l'invariant. Le calcul partagé relève de `013` ;
les constats de présence relèvent du domaine SQL `ATT`. Le serveur reste un
adaptateur des actions PostgreSQL, sans second automate TypeScript.

La déclaration d'ouverture peut rester immuable. Une observation distincte des
mouvements ou un constat complet par affaire doit fournir les présences à
l'instant du contrôle. La mise en discussion, son contrôle et sa preuve doivent
être atomiques et sérialisés avec l'enregistrement des mouvements. Les seules
annotations de verrous et les tests pgTAP à une session ne prouvent pas une
course réelle : ajouter une preuve à deux transactions avec barrières, selon
le contrat de la suite PostgreSQL.

Tout nouveau refus doit disposer d'un SQLSTATE disponible, catalogué dans
`002-error-codes.sql`, asserté par `throws_ok` dans pgTAP et propagé par le
contrat d'erreur serveur. Ne pas détourner `HV115`, qui désigne actuellement
l'échec d'ouverture, sans examiner ses consommateurs. Le SQLSTATE du refus de
mise en discussion sera attribué avec l'invariant, pas réservé par une entrée
de catalogue inutilisée.

Les annotations exécutables seront ajoutées uniquement avec leurs invariants
et tests. `verify-traceability.sh` contrôle l'égalité des ensembles d'IDs et
SQLSTATE ; il ne juge pas la pertinence des assertions. Un test qui cite un ID
sans exercer son invariant n'est pas une preuve.

## Données et décisions d'encodage encore nécessaires

1. **Effectif faisant foi.** Le principe du jour de la séance est établi. Il
   reste à encoder la prise d'effet des mandats et sa provenance. Le modèle
   possède des `DATE` de début/fin ; `active` est dérivé de l'absence de date de
   fin. Ni ce booléen ni l'effectif attendu de la mandature ne constituent à eux
   seuls une observation juridique de l'effectif applicable à la séance.
2. **Présences pendant la conduite.** Définir le constat que l'utilisateur
   enregistre : mouvements horodatés ou déclaration complète avant chaque
   affaire, ainsi que la correction d'une saisie tardive. Proposition technique :
   conserver des constats successifs, et copier l'état utilisé lors de chaque
   mise en discussion. Ne pas réécrire `meeting_attendance`, déjà référencée par
   les participations aux scrutins et les pouvoirs.
3. **Qualification par affaire.** Représenter explicitement le régime applicable
   et les déports qualifiés avant de calculer un dénominateur spécial. Le modèle
   courant ne permet pas cette distinction. Déterminer aussi si Hall veut
   imposer le contrôle aux questions sans délibération : la jurisprudence citée
   porte sur les délibérations, et ne justifie pas seule ce choix plus large.

Ajouter aujourd'hui un simple appel à `council_meeting_present_member_count`
au démarrage du point répéterait un contrôle figé depuis l'ouverture. Une
fonction arithmétique non raccordée n'établirait pas davantage l'exigence.
L'implémentation de ces nouvelles garanties attend donc ces données ; les
garanties existantes ne sont pas renommées en garanties réglementaires complètes.

## Proposition de contrat pour les déports par affaire

Statut : proposition à soumettre, sans modification de `vote_choice` ni création
de table dans cette tranche. Le lien `CouncilMember` vers une occurrence
`AgendaItem` a été confirmé dans la discussion de modèle avec le propriétaire.

### Comparaison des représentations

| Représentation | Conséquence dans le modèle actuel |
| --- | --- |
| Quatrième valeur de `vote_choice` | Exige une participation et une ligne `votes`, alors que le déport exclut la participation. Entre dans `ballot_vote_count` et la cardinalité de clôture. En secret, une ligne agrégée ne permet pas de conserver le membre déporté ; la rendre nominative contredirait la forme des bulletins secrets. |
| `notVoting` actuel | Le client omet la participation, sans motif persistant. Ne prouve ni conflit signalé, ni exclusion de discussion, ni régime de quorum. |
| Fait séparé par membre et point | Identifie le membre et l'affaire, permet l'exclusion SQL de la participation et conserve la preuve indépendamment des bulletins. Le quorum consomme une qualification explicite, pas une valeur de suffrage. Proposition retenue pour le contrat. |

Constat client : `useCouncilMeeting.ts` élimine les choix publics `notVoting`
avant création des participations. Pour le secret, il sélectionne actuellement
les premières présences éligibles selon le nombre de suffrages
(`eligibleAttendance.slice(0, participantCount)`). Cette sélection ne constitue
pas une déclaration nominative fiable des personnes prenant part au scrutin.
L'intégration du déport devra séparer cet ensemble de participants des totaux
anonymes ; aucun choix individuel secret ne doit être reconstitué.

### Fait et action proposés

Nom proposé : `AgendaItemRecusal`, table `hall.agenda_item_recusal`.
Le contrat minimal comprend :

- `id`, `agenda_item` et `council_member`, avec clés étrangères et unicité du
  déport effectif par couple membre/point ; un autre point n'hérite pas
  automatiquement de ce fait ;
- `declared_at` pour le moment du signalement et `recorded_at` pour celui de
  l'enregistrement, avec l'auteur issu du contexte d'audit ;
- `legal_basis`, qualification fermée proposée `personalInterest` ou
  `designatedRepresentativeConflict`, cette dernière désignant uniquement le
  cas qualifié du II de L1111-6. Cette liste et son mode de qualification restent
  à valider ; un clic « Conflit d'intérêts » ne suffit pas à choisir ce régime ;
- références de preuve éventuelles, sans imposer la saisie de détails personnels
  qui ne sont pas nécessaires à la justification.

Le fait déclare une exclusion de discussion et de vote pour cette occurrence.
Il ne certifie pas rétroactivement que le membre n'a jamais participé au débat.
Les constats de participation antérieure, de départ et de retour restent
distincts ; le simple déport ne doit pas fabriquer une sortie physique de salle.

L'entrée du menu « Conflit d'intérêts » appelle une action proposée
`agenda-item.record-recusal`, avec `councilMemberId`, `declaredAt` et la
qualification retenue. La réponse expose le fait et l'éligibilité résultante.
Le client retire alors le membre des choix de vote, affiche le motif, et
conserve `approve/reject/abstain` pour les seuls suffrages. L'action doit aussi
être accessible avant la mise en discussion : un menu uniquement disponible au
vote ne suffit pas au signalement préalable.

Le trigger de participation (`035-ballot-participation-lifecycle.sql`) doit
refuser l'insertion d'un membre déporté pour le point du scrutin, même s'il est
présent ou représenté. La création du déport doit réciproquement traiter une
participation déjà persistée. Proposition conservatoire : refuser cette
transition contradictoire sans effacer de participation ni de vote ; le parcours
de constat tardif/correction doit être décidé séparément. La sérialisation des
deux écritures doit empêcher leur coexistence par concurrence.

Un déport `personalInterest` ne retranche pas automatiquement le membre de
l'effectif en exercice. La qualification spéciale du II de L1111-6 entraîne
seule la modification du dénominateur prévue par L2131-11. Le traitement de la
présence d'un membre déporté restant dans la salle doit être explicité avec la
politique de quorum ; il ne se déduit ni d'un vote d'abstention ni d'un booléen
« conflit ». Aucun contrôle réussi passé n'est réécrit par un signalement tardif.

### Exigences et preuves proposées

Identifiants candidats supplémentaires, non attribués :

| ID candidat | Invariant proposé et preuve pgTAP |
| --- | --- |
| `HALL-FR-AGI-370` `RECUSAL_IDENTIFIES_MEMBER_AND_AGENDA_ITEM` | FK et unicité membre/point ; cible inconnue refusée ; déport A sans effet automatique sur B ; constat conservé dans l'observation de l'affaire. |
| `HALL-FR-BAL-300` `RECUSED_MEMBER_CANNOT_PARTICIPATE` | Déport puis participation refusée, publique comme secrète ; participation puis déport contradictoire refusé selon le contrat à valider ; aucun vote/participation supprimé ; membre représenté déporté ne vote pas par pouvoir. |
| `HALL-FR-MTG-280` `RECUSAL_QUORUM_EFFECT_REQUIRES_LEGAL_BASIS` | À effectif 15, le déport général ne réduit pas automatiquement N ; deux exclusions spécialement qualifiées donnent N=13 et seuil 7, sans compter les exclus comme présents admissibles ; une abstention ne déclenche pas cette réduction. |
| `HALL-FR-MIN-210` `MINUTES_PRESERVE_RECUSAL_EVIDENCE` | Le PV copie identité, affaire, signalement et faits de non-participation documentés ; une modification ultérieure de l'annuaire ne les change pas ; en secret, aucun lien membre/choix n'apparaît. |

`BAL` atteint actuellement `290` et `MIN` `200` ; vérifier de nouveau les IDs à
l'implémentation. `HALL-FR-VOT-030` protège déjà les formes public/secret. Les
nouveaux scénarios doivent vérifier que le déport ne crée aucune ligne de vote,
que la cardinalité du scrutin utilise les seuls participants admis, et qu'une
abstention reste un vote distinct. Compléter par une course contrôlée entre
enregistrement du déport et création de participation.

### Fondement légal et choix produit

[L1111-13](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053147122)
prévoit le signalement des intérêts personnels avant débat et vote.
[L2131-11](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053153029)
distingue la participation à une délibération de la seule présence à la réunion.
Le modèle ne doit donc pas imposer automatiquement une sortie de salle.

[L2121-15](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044190488)
fixe le contenu du procès-verbal, mais ne prescrit pas explicitement une rubrique
nominative autonome des déports. La conservation structurée proposée ci-dessus
est une exigence de preuve du produit Hall, à valider comme telle. La
compatibilité d'un déport nominatif séparé avec les bulletins secrets est une
déduction de conception : elle ne rattache aucun choix à la personne exclue,
et ne doit pas être présentée comme une disposition textuelle dédiée.

L'article 4 du [décret 2014-90](https://www.legifrance.gouv.fr/loda/id/LEGITEXT000028544967/)
ne doit pas servir à inventer une obligation générale de rubrique communale :
il vise les autorités administratives ou publiques indépendantes. Les articles
5 et 6 concernent certaines autorités locales et délégataires, avec des
formalités spécifiques qu'un clic dans Hall ne réalise pas à lui seul.

Décisions encore nécessaires : qualification du régime et preuve attendue,
constat tardif après début de discussion ou participation persistée, correction
d'un déport erroné, et traitement du président ou d'un détenteur de pouvoir qui
se déporte. Le modèle actuel exige un président participant au scrutin et ne
doit pas choisir silencieusement son remplaçant ni transférer un pouvoir.

## Vérification de cette tranche

Modification documentaire uniquement. Le contrôle de traçabilité existant a
été exécuté avec succès : 165 exigences, 108 levées métier, 74 SQLSTATE Hall et
4 codes natifs. Les liens locaux ont été vérifiés. Aucun pgTAP n'a été exécuté
dans cette tranche ; aucune nouvelle conformité runtime n'est déclarée.
