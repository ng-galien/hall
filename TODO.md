# Backlog

## Convocations — à revérifier avant une version alpha

- Revalider avec les textes et la pratique communale la date de référence d’une convocation, le calcul des jours francs et le fuseau horaire applicable.
- Revalider spécifiquement la seconde convocation après défaut de quorum : preuve de l’envoi, chronologie avec le constat du défaut de quorum et délai avant la nouvelle réunion.
- Modéliser, quand le parcours de préparation sera stabilisé, les preuves d’envoi et de publication ainsi que les variantes liées à la population de la commune et à l’urgence.

Ces points sont volontairement laissés au backlog. Le prototype conserve uniquement les invariants minimaux nécessaires pour empêcher une chronologie manifestement incohérente.

## Mode présentation — vidéoprojecteur

- Recetter tout le déroulé de séance sur un écran de vidéoprojection professionnel en affichage étendu, notamment en 1024 × 768 au format 4:3 (référence observée : Optoma EP719).
- Vérifier à cette résolution la lisibilité à distance, le scroll de l’appel, de la timeline, du contenu et du scrutin, ainsi que l’accès permanent aux actions de conduite.

## Déroulé de séance — erreurs à diagnostiquer

- Reproduire l’erreur générique « La requête n’a pas pu aboutir » observée pendant le déroulé après l’enregistrement d’un scrutin, alors que le résultat apparaît bien enregistré.
- Identifier la commande réellement en échec et éviter l’état contradictoire entre le résultat affiché et la bannière d’erreur.
