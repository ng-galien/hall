# Principes de code de Hall

Ce document fixe les règles structurelles à appliquer avant toute modification de code.

## Les types fermés sont des cartes du logiciel

Une famille finie de cas métier ou techniques se modélise par une union discriminée, définie dans son module d’autorité partagé. L’union, son discriminant et son matcher constituent le point d’entrée pour découvrir les variantes prises en charge et retrouver leurs comportements.

- Définir une seule autorité pour les variantes. Une liste nécessaire à l’exécution est dérivée de l’union ou déclarée avec `defineExhaustiveLiterals` ; elle n’est pas recopiée librement dans le front et le serveur.
- Faire passer tout **dispatch de comportement** par `matchDiscriminated` ou `matchLiteral`, définis dans `packages/domain/src/match.ts`.
- Fournir tous les handlers. L’ajout d’une variante doit casser à la compilation chaque comportement qui ne la traite pas encore.
- Placer les tables de handlers réutilisées près de l’union ou dans un module de politique nommé. Un composant React, une route ou un service ne redéfinit pas localement une politique déjà partagée.
- Ne pas remplacer l’exhaustivité par un `default`, une branche implicite, une chaîne de `if/else` ou un matcher partiel. Un traitement volontairement partiel doit être nommé comme tel et posséder un fallback métier explicite.
- Le cast de corrélation `as never` est confiné à l’implémentation générique du matcher. Il ne doit pas apparaître dans les consommateurs.

Une garde qui valide une précondition ou filtre une collection n’est pas un dispatch et peut rester un `if`. La question de review est simple : **ce code choisit-il un comportement selon la variante ?** Si oui, il doit être exhaustif et centralisé.

## Frontières et données externes

L’exhaustivité TypeScript ne valide pas les données d’exécution. Les valeurs venant de HTTP, de la base, d’un fichier ou du stockage navigateur sont validées à leur frontière, puis manipulées comme unions fermées à l’intérieur du système.

## Parcours d’exploration

Pour comprendre une famille de comportements :

1. partir de l’union discriminée et de son module d’autorité ;
2. repérer sa liste canonique éventuelle et les appels à `matchDiscriminated` ou `matchLiteral` ;
3. identifier les tables de handlers nommées qui portent les politiques partagées ;
4. vérifier qu’aucun second catalogue ou dispatch concurrent ne s’est formé dans le front, le serveur ou les tests.

Cette lecture donne à la fois la liste exacte des cas supportés, les frontières de responsabilité et les endroits que l’ajout d’une variante doit faire évoluer.
