# Séances stale temporaires

<!-- TODO REMOVE_STALE: central removal inventory. -->

Décision du propriétaire : une séance historique incomplète peut rester `stale` pour permettre la création de la suivante. Plusieurs séances stale sont possibles, mais une seule séance non clôturée et non stale est active. Ce marqueur ne valide ni ne clôture une séance. Il ne fabrique aucun scrutin, procès-verbal ou point d’approbation, et n’est pas retiré automatiquement. L’import doit privilégier la clôture normale lorsque les données attestées permettent tous les contrôles existants.

Le marqueur `TODO REMOVE_STALE` identifie chaque point temporaire. L’action `meeting.mark-stale`, POST `/api/council-meetings/:id/stale` avec un objet vide, retourne `{staleMeeting, nextMeeting}`. Sa répétition réutilise le successeur. Les droits sont ceux de conduite de séance et la mutation est auditée.

La contrainte différée d’unicité sur `active_slot`, colonne technique générée, contrôle l’état final de transaction et préserve la clôture normale qui crée son successeur avant de poser `closed_at`. L’exception de succession concerne uniquement un prédécesseur stale. Les règles de votes, d’approbation des PV et de clôture restent inchangées. Aucun mécanisme de clôture tardive, validation ou retrait de stale n’est ajouté.

## Retrait

Le retrait nécessite la décision explicite du propriétaire sur le devenir des séances encore stale et la résolution de leurs données manquantes. Ne pas supprimer le marqueur d’une base existante sans cette décision.

- SQL : `council/005-council-meetings.sql` (champ, colonne générée, unicité), `060-council-meeting-closure.sql` (exception de succession), `070-council-meeting-api.sql` (projection et action), `900-grants.sql`.
- Contrats : `api-contract/src/councilMeeting.ts`, `api-contract/src/siren.ts`, projection et méthode de `postgres/src/council.ts`.
- Serveur : interface/adaptateur CouncilClient, route et autorités de commande, d’audit et Siren.
- Tests : `16-stale-meetings.test.sql`, adaptations de fixtures dans `15-council-meeting-closure.test.sql`, `staleMeetings.test.ts` et double CouncilClient.
- IHM : `client/src/models/councilMeeting.ts` (sélection active), `CouncilMeetingsPage.tsx` (historique accessible), `DashboardPage.tsx` (prochaine séance), `DomainStatusBadge.tsx` (badge warning), consommateurs de ce badge dans les pages de préparation/séance/décisions et la recherche, clés `meetings.needsReview` de fr/en, et test ciblé dans `navigation-and-settings.spec.ts`. Aucun bouton de passage stale.

Le modèle historique `@hall/domain.CouncilMeeting` n’est pas le contrat consommé par le parcours PostgreSQL actuel ; aucun second cycle stale n’y est introduit.
