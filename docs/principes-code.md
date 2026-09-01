# Principes de code de Hall

Ce document fixe les règles structurelles à appliquer avant toute modification de code.

La [`carte d’architecture opérationnelle`](architecture.md) indique ensuite où placer un nouveau contrat, une politique, une commande, un décodage persistant ou une présentation. Elle fait partie du parcours obligatoire avant d’introduire un nouveau module.

## Les types fermés sont des cartes du logiciel

Une famille finie de cas métier ou techniques se modélise par une union discriminée, définie dans son module d’autorité partagé. L’union, son discriminant et son matcher constituent le point d’entrée pour découvrir les variantes prises en charge et retrouver leurs comportements.

- Définir une seule autorité pour les variantes. Une liste nécessaire à l’exécution est dérivée de l’union ou déclarée avec `defineExhaustiveLiterals` ; elle n’est pas recopiée librement dans le front et le serveur.
- Faire passer tout **dispatch de comportement** par `matchDiscriminated`, `matchLiteral` ou `matchVariant`, définis dans `packages/domain/src/match.ts`. Un matcher métier spécialisé peut nommer un profil imbriqué, mais délègue sa corrélation à cette bibliothèque.
- Fournir tous les handlers. L’ajout d’une variante doit casser à la compilation chaque comportement qui ne la traite pas encore.
- Placer les tables de handlers réutilisées près de l’union ou dans un module de politique nommé. Un composant React, une route ou un service ne redéfinit pas localement une politique déjà partagée.
- Ne pas remplacer l’exhaustivité par un `default`, une branche implicite, une chaîne de `if/else` ou un matcher partiel. Un traitement volontairement partiel doit être nommé comme tel et posséder un fallback métier explicite.
- Le cast de corrélation `as never` est confiné à l’implémentation générique des matchers de `match.ts`. Il ne doit pas apparaître dans un matcher métier spécialisé ni dans ses consommateurs.

Une garde qui valide une précondition ou filtre une collection n’est pas un dispatch et peut rester un `if`. La question de review est simple : **ce code choisit-il un comportement selon la variante ?** Si oui, il doit être exhaustif et centralisé.

Le contrôle `npm run check:architecture` analyse l’AST de tous les fichiers TypeScript des packages et refuse les `switch`. Code Moniker ne représente pas actuellement ces nœuds de contrôle, ce contrôle syntaxique complète donc ses règles de dépendance et d’autorité. Une exception ne doit pas être contournée localement : elle exige de revoir le modèle fermé ou l’autorité de dispatch.

## Frontières et données externes

L’exhaustivité TypeScript ne valide pas les données d’exécution. Les valeurs venant de HTTP, de la base, d’un fichier ou du stockage navigateur sont validées à leur frontière, puis manipulées comme unions fermées à l’intérieur du système.

## Parcours d’exploration

Pour comprendre une famille de comportements :

1. partir de l’union discriminée et de son module d’autorité ;
2. repérer sa liste canonique éventuelle et les appels aux matchers de `packages/domain/src/match.ts` ;
3. identifier les tables de handlers nommées qui portent les politiques partagées ;
4. vérifier qu’aucun second catalogue ou dispatch concurrent ne s’est formé dans le front, le serveur ou les tests.

Cette lecture donne à la fois la liste exacte des cas supportés, les frontières de responsabilité et les endroits que l’ajout d’une variante doit faire évoluer.

## Témoignage architectural exécutable

`.code-moniker.toml` et les fragments `code-moniker.fragment.toml` protègent les frontières durables décrites dans la carte d’architecture. La taxonomie nomme des autorités stables, pas chaque répertoire du dépôt. Une nouvelle règle doit porter un invariant non évident, sélectionner des relations réellement présentes dans l’index et expliquer le risque de régression qu’elle interdit.

Après une évolution structurelle, exécuter `code-moniker rules show . --details`, puis `code-moniker check --report .`. Une implication sans antécédent observé n’est pas une protection et ne doit pas être ajoutée uniquement pour obtenir un diagnostic vert.
