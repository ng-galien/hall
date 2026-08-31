# Formules du tableur

Hall utilise le moteur de formules inclus dans Univer OSS. Le client n’implémente ni parseur, ni catalogue, ni moteur parallèle : la barre de formule, le calcul, la recopie et les fonctions disponibles sont ceux du preset `@univerjs/preset-sheets-core` installé.

## Contrat actuel

- Les formules sont saisies avec leurs noms anglais, par exemple `SUM`, `ROUND`, `AVERAGE`, `MIN` et `MAX`.
- Les références A1, les références relatives ou absolues et la recopie sont gérées par Univer.
- Hall persiste le snapshot JSON complet du classeur après une mutation : feuilles, ordre, cellules, formules, formats et dimensions.
- Le document durable est enveloppé par `schemaVersion: 2` et soumis à la version optimiste de la ressource.
- Le serveur conserve le JSON Univer opaque tout en validant le squelette nécessaire pour pouvoir rouvrir le classeur.

La liste des fonctions n’est pas recopiée dans le code ou la documentation Hall. Elle suit exactement la version Univer résolue dans `package-lock.json`.

## Couverture maintenue par Hall

Hall teste sa frontière d’intégration : modification d’un classeur, autosauvegarde, rechargement et conservation de plusieurs feuilles. Les comportements internes du tableur, déjà fournis par Univer, ne sont pas réimplémentés ni couverts par une matrice d’équivalence avec Excel.
