# Déports par affaire et quorum

État du 6 septembre 2026. Le [registre global des exigences](requirements.md)
sépare les règles réglementaires, leurs interprétations et les choix produit.
Les métadonnées versionnées figurent dans
[requirements.json](../packages/postgres/requirements.json).

## Tranche implémentée : déclarations nominales de déport

Une déclaration rattache un membre du conseil à une occurrence de point à
l’ordre du jour. Elle conserve la qualification explicite, la date déclarée,
l’instant et l’auteur de l’enregistrement et le nom du membre à cet instant.
Elle est distincte d’une abstention, d’un vote et d’une absence. Le choix de cette
trace et de son immutabilité relève du produit.

| Qualification | Effet appliqué par Hall | Fondement et limite |
| --- | --- | --- |
| `personalInterest` | Exclusion des participants et des présences déclarées éligibles ; aucune réduction du dénominateur. | Première phrase de L2131-11 pour la participation ; articulation de CE 19 janvier 1983, n° 33241 avec la réforme de 2025 pour la présence, explicitement `unproven` dans le registre. |
| `designatedRepresentativeConflict` | Même exclusion ; réduction du dénominateur d’une unité par membre déclaré. | Dernière phrase de L2131-11, pour le cas explicitement qualifié de L1111-6 II, sous réserve de I et III. Aucun lien institutionnel ne suffit à lui seul à établir ce régime. |

L’autorité SQL partage le même prédicat d’éligibilité entre la projection des
participants et le refus d’une participation au scrutin. Un membre déporté ne
vote ni personnellement ni comme porteur d’un pouvoir. Son mandant représenté
ne devient donc pas automatiquement éligible par un autre porteur. Hall ne
réattribue aucun pouvoir et ne remplace pas automatiquement le président.
Le scrutin secret conserve des participants et des totaux, sans choix individuel.

L’enregistrement exige une déclaration de présence dans la séance et demeure
possible avant le premier scrutin du point. Dès qu’un scrutin existe, ou lorsque
le point est déprogrammé, achevé, ajourné ou la séance clôturée, il est refusé.
La date déclarée ne certifie pas rétroactivement l’absence de participation aux
débats. La correction ou révocation d’une déclaration n’est pas implémentée.

Les déclarations sont copiées dans les instantanés et les faits du procès-verbal.
Le rendu les présente séparément des votes pour les points du procès-verbal.
Un point non commencé portant un déport conserve son occurrence historique à la
clôture ; son report crée une nouvelle occurrence sans recopier les déports.
Un point déjà déprogrammé n’est pas reporté automatiquement.

## Contrat API et autorités

`GET` et `POST /api/council-meetings/:meetingReference/agenda-items/:agendaItemId/recusals`
exposent l’espace de déclaration. Le corps POST contient `councilMemberId`,
`legalBasis` et `declaredAt`. La réponse contient `agendaItem`, `recusals`,
`eligibleParticipantAttendanceIds`, `quorumImpact` et `canRecordRecusal`.
L’action Siren `agenda-item.record-recusal` suit cette capacité calculée en SQL.

`quorumImpact` expose les membres exclus, la réduction spéciale du dénominateur
et les présences déclarées éligibles. Il ne constitue ni un effectif en exercice,
ni un seuil recalculé, ni un verdict de quorum courant.

Les conflits HTTP 409 portent des codes stables : `recusal_already_recorded`,
`recusal_recording_closed`, `recusal_member_not_declared`,
`recused_member_cannot_participate`, `recusal_immutable` et
`recusal_occurrence_locked`.

| Exigence attribuée | Autorité | Nature de la garantie |
| --- | --- | --- |
| `HALL-FR-AGI-370` | [026-agenda-item-recusals.sql](../packages/postgres/sql/council/026-agenda-item-recusals.sql) | Identité nominale, unicité, contexte et conservation ; choix produit. |
| `HALL-FR-MTG-280` | Même fichier | Effets distincts selon la qualification, avec limite juridique explicite sur la présence générale. |
| `HALL-FR-BAL-310` | [035-ballot-participation-lifecycle.sql](../packages/postgres/sql/council/035-ballot-participation-lifecycle.sql) | Refus SQL de participation directe ou par pouvoir, public et secret. |
| `HALL-FR-MIN-210` | [061-minutes.sql](../packages/postgres/sql/council/061-minutes.sql) | Conservation séparée dans les faits du PV ; choix produit de preuve. |

## Quorum par affaire : consolidation en cours

Hall applique le droit commun du quorum et exclut le régime particulier
Alsace-Moselle par [décision produit](requirements.md#décision-produit--régime-du-quorum).
Le rattachement convenu est `HALL-FR-MTG-270/common-law-scope` dans le registre,
désormais présent dans le registre relu. Les deux fondements de déport restent
pris en charge ; cette exclusion territoriale ne les modifie pas.

Le chantier SQL remplace le seuil fourni à la création par un constat nominal
des membres en exercice, avec provenance. Il conserve les mouvements de présence
et les observations par affaire, et représente la seconde convocation avec
preuve d'échec, délai de trois jours francs et nouveaux constats de réunion.

| Exigence annotée | Autorité actuelle |
| --- | --- |
| `HALL-FR-MTG-270` | [011b-meeting-membership.sql](../packages/postgres/sql/council/011b-meeting-membership.sql) |
| `HALL-FR-ATT-120` et `ATT-130` | [011a-meeting-presence.sql](../packages/postgres/sql/council/011a-meeting-presence.sql) |
| `HALL-FR-AGI-350`, `AGI-360` et `MTG-290` | [027-quorum-observations.sql](../packages/postgres/sql/council/027-quorum-observations.sql) |

L2121-17 et CE 18 octobre 1989, n° 63984 motivent le contrôle au début réel de
la discussion de chaque affaire. Ce contrôle automatique n'exige pas d'écran
supplémentaire. CAA Nancy 1er avril 2010, n° 09NC01131 distingue cet instant du
vote ultérieur. Les [sources et scénarios détaillés](requirements.md#curation-du-contrôle-par-affaire--6-septembre-2026)
précisent les limites du calcul et de la preuve.

Le traitement supplémentaire d'un déport déclaré après discussion est suspendu
à la demande du propriétaire : aucune mécanique de régularisation ou d'ajournement
automatique n'est décidée ici. Les déclarations et les constats antérieurs ne
certifient pas l'absence de participation intéressée aux débats.
Le CFU, les cas de L1524-5 et les autres empêchements ne deviennent pas couverts
par la présence de ces deux qualifications de déport.

## Aperçu, correction et confirmation : contrat produit

La [décision transversale](requirements.md#décision-produit--aperçu-correction-et-confirmation-du-scrutin)
porte `HALL-FR-BAL-320` (`functional`, `product`). L'aperçu conserve un candidat
versionné et son résultat calculé côté SQL, sans créer de scrutin ni de votes
définitifs et sans terminer le point. Toute correction demande un nouvel aperçu.
Seule la confirmation explicite enregistre atomiquement le résultat présenté ;
une ancienne version, un contexte modifié ou une confirmation répétée sont refusés.
Le frontend présente le calcul du backend et n'en devient pas une seconde autorité.

Le quorum courant est également contrôlé avant l'aperçu, selon la demande produit
du propriétaire, en tenant compte d'une éventuelle dispense applicable. Ce contrôle
supplémentaire ne remplace pas le constat réglementaire de mise en discussion et
ne le réécrit pas. Un refus à cette étape n'établit pas rétroactivement que la
discussion s'est ouverte sans quorum.

Les clauses produit de `BAL-320` sont `candidate-review-confirmation` et
`current-quorum-before-preview` ; `HALL-TR-CON-200` porte la liaison technique du
candidat et du contexte. Leurs métadonnées sont présentes dans le registre
relu. Les autorités sont [039-ballot-result-preview.sql](../packages/postgres/sql/council/039-ballot-result-preview.sql)
et [076-ballot-result-preview-api.sql](../packages/postgres/sql/council/076-ballot-result-preview-api.sql).

Les tests [18-quorum-workflows.test.sql](../packages/postgres/sql/council/test/18-quorum-workflows.test.sql)
et [19-ballot-result-preview.test.sql](../packages/postgres/sql/council/test/19-ballot-result-preview.test.sql)
ont été relus. Après 51 assertions initiales sur ces deux fichiers, le backend
annonce 35 assertions réussies dans le fichier 18 enrichi. Les scénarios ajoutés
couvrent les observations avant la réunion ou futures, le déport futur et le
constat antérieur au déport, la reconvocation après clôture et le remplacement
nominal avec nouvelle présence après ouverture. Le référent a vérifié leur
présence et leur sens sans relancer de runtime concurrent. Les tests ciblés
ne prouvent pas encore le parcours intégré HTTP/IHM ni une conformité juridique
globale.

Le départ d'un porteur de pouvoir reste enregistrable : il rend le porteur et
son mandant inéligibles tant que les conditions de participation ne sont plus
satisfaites, sans inventer une révocation du pouvoir écrit.

## Preuves et normalisation de la traçabilité

Les scénarios SQL sont dans
[17-agenda-item-recusals.test.sql](../packages/postgres/sql/council/test/17-agenda-item-recusals.test.sql).
Les [tests PostgreSQL d’intégration](../packages/postgres/test/recusals.integration.test.ts)
couvrent la frontière des rôles runtime, l’audit, les faits du PV, le report et
une course réelle entre enregistrement du déport et création d’un scrutin.
Les [tests HTTP](../packages/server/src/__tests__/recusals.test.ts) couvrent
l’authentification, la qualification explicite, le rattachement et l’action Siren.

Le contrôle global collecte les annotations de production, y compris dans le
SQL intégré à TypeScript. Une définition possède un seul nom et une seule
nature ; ses autres occurrences utilisent `@requirement-reference`.
Les collisions préexistantes ont été levées en conservant les identités déjà
assertées : `WSP-180/190` restent les projections en lot, `WSP-200/210` désignent
la création avec programmation atomique ; `CTX-030` reste le contexte RBAC
minimal, `CTX-040` désigne l’accès runtime par API uniquement. Les trois anciens
`FR-HALL-LOCATION-*` deviennent `HALL-FR-LOC-010/020/030` sans changement de règle.

```sh
npm run check:requirements
npm run test:requirements
bash packages/postgres/sql/council/test/verify-traceability.sh
npm run test:council -w @hall/postgres -- 17-agenda-item-recusals.test.sql
```

Le vérificateur valide les métadonnées, les références et la cohérence de leurs
dates hors ligne. Il signale les clauses `unproven` sans les convertir en preuve.
Un succès structurel ne vérifie ni le contenu des liens à distance, ni la
justesse juridique des clauses, ni la couverture comportementale de tout le dépôt.
