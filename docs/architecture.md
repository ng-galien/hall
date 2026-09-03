# Carte d’architecture opérationnelle

Cette carte indique l’autorité qui doit recevoir chaque nature de changement. Elle complète les [principes de code](principes-code.md) : le type fermé décrit les cas, le module d’autorité porte la politique, et les adaptateurs restent aux frontières.

## Autorités et dépendances

| Responsabilité | Autorité canonique | Ce qui y entre | Ce qui n’y entre pas |
| --- | --- | --- | --- |
| Vocabulaire métier fermé | `packages/domain/src/model.ts` et `schemas.ts` | Unions discriminées, listes exhaustives, validation des données externes | HTTP, SQL, React, libellés français |
| Dispatch et politique métier | `packages/domain/src/match.ts` et les modules `*Policy.ts` proches du modèle | `matchDiscriminated`, `matchLiteral`, `matchVariant`, `defineExhaustiveLiterals`, invariants purs et projections communes | `switch` concurrents dans les routes, services ou composants |
| Cycles de vie | `packages/domain/src/state-machines/` | États, événements et transitions des agrégats audités | Persistance, permissions, navigation client |
| Contrat HTTP partagé | `packages/api-contract/src/`, dont `security.ts` pour `apiPermissions` | Siren, Problem Details, noms d’action, rôles et permissions transportés | Règles d’autorisation selon l’état, implémentation serveur ou client |
| Commandes et autorisation | `packages/server/src/api/apiCommandPolicy.ts`, `apiCommandAuthorization.ts` et `apiCommandResolution.ts` | Politique exhaustive par `ApiActionName`, contrôle des permissions, identité d’audit d’une mutation | Catalogues partiels dans les routes ou le client |
| Capacités hypermédia | `packages/server/src/api/sirenActionPolicy.ts`, `sirenEntityIdentity.ts` et `sirenRepresentation.ts` | Actions permises par l’état courant, identité et représentation Siren | Déduction des capacités à partir du rôle dans le client |
| Cas d’usage | `packages/server/src/services/` | Orchestration transactionnelle des politiques, repositories et fournisseurs | SQL, détails Express, second catalogue de types |
| Contrats et décodage persistants | `packages/server/src/repositories/contracts.ts`, `row.ts`, `resourceRowMapping.ts`, `evidenceMapping.ts` et les repositories | Interfaces de persistance, validation des lignes et discriminants stockés | Données de base non validées dans les services ou routes |
| Ressources PostgreSQL | `packages/postgres/` et `packages/server/src/infrastructure/postgres/resourcesClient.ts` | Invariants SQL, opérations nommées, projections validées et client serveur fin | Express, politique d’autorisation, agrégats métier ou contrat client legacy |
| Adaptateurs de base historiques | `packages/server/src/infrastructure/database/`, `sqlite/` et `postgres/` | Exécution SQL des domaines qui ne sont pas encore raccordés à `@hall/postgres` | Nouvelle persistance documentaire ou décisions d’autorisation |
| Composition | `packages/server/src/core/container.ts` | Construction et injection des adaptateurs | Logique métier ou choix selon une variante |
| Références et ressources | `packages/domain/src/model.ts`, `packages/templating/src/grammar.ts`, `packages/templating/src/resourcePresentation.ts`, `packages/server/src/services/referenceEntityResolver.ts`, `legalReferenceResourceOperations.ts`, `workspaceFolderOperations.ts` et `editorAssetService.ts` | `ReferenceEntityKind`, `ResourceKind`, `ResourcePresentationKind`, compatibilité des présentations, résolution exhaustive, opérations spécialisées et propriété des actifs | Dispatch dupliqué dans le rendu, les routes ou l’interface |
| Grammaire riche | `packages/templating/src/` | Parsing, validation, collecte et sérialisation des directives | Parseur concurrent dans le client ou le serveur |
| Présentation et interaction | `packages/client/src/features/` et `pages/` | Présentation métier, appels HTTP et composition d’écran | Nouvelle règle métier ou reconstruction d’une permission |
| Intégration de l’éditeur | `packages/client/src/components/editor/` et les politiques associées dans `packages/client/src/features/` | Adaptation Tiptap, références Hall, ressources intégrées et interaction métier | Nouvelle grammaire riche, permission serveur ou second catalogue de types |
| Présentation des ressources | `packages/client/src/features/resources/resourceEditorPolicy.ts` et `packages/client/src/features/documents/ResourceGlyph.tsx` | Politique d’édition, icône et tonalité par nature de ressource | Second catalogue local dans un écran, un overlay ou le rendu export |
| Primitives techniques | `packages/client/src/components/ui/` | Interaction générique pilotée par propriétés | Import du domaine, des stores, services, hooks ou pages |

Le serveur est l’unique autorité d’écriture. Le client consomme le contrat Siren sur HTTP. Ni le client ni Electron n’importent l’implémentation serveur ou n’ouvrent la base directement.

`packages/domain/src/match.ts` est la petite bibliothèque type-safe commune. Ses handlers sont exhaustifs : ajouter une variante à une union ou à un littéral fermé doit rendre chaque dispatch incomplet invalide à la compilation. Le cast interne nécessaire à la corrélation TypeScript reste confiné à cette bibliothèque et ne se propage ni dans les matchers métier spécialisés, ni dans leurs consommateurs.

## Où placer un changement

1. Une nouvelle variante métier commence dans l’union du domaine, son schéma de frontière et ses politiques exhaustives.
2. Une nouvelle mutation HTTP commence par `ApiActionName`, puis complète `apiCommandPolicies`, la résolution d’audit, la route et la projection Siren concernée.
3. Une règle qui dépend de l’état courant mais pas du transport appartient à une politique du domaine. Une capacité HTTP issue de cet état appartient à `sirenActionPolicy.ts`.
4. Une nouvelle représentation stockée est décodée dans un mapper de repository. Le service ne reçoit jamais une ligne SQL brute ou un discriminant non validé.
5. Un nouvel enchaînement transactionnel appartient à un service. Le repository expose les primitives atomiques nécessaires sans décider du cas d’usage.
6. Une nouvelle référence interne étend `ReferenceEntityKind` et `referenceEntityKinds` dans `packages/domain/src/model.ts`, puis `referenceEntityResolver.ts` et les consommateurs exhaustifs. Elle ne crée pas un alias local dans un écran ou un rendu.
7. Une nouvelle présentation de ressource complète `ResourceKind`, `ResourcePresentationKind`, la compatibilité de `packages/templating/src/resourcePresentation.ts`, la politique de `resourceEditorPolicy.ts` et `ResourceGlyph.tsx`. Le serveur fournit données, actions et rendu exportable, sans choisir un composant React.
8. Une nouvelle directive riche appartient d’abord à `@hall/templating`, puis ses adaptateurs client et serveur consomment cette même grammaire.

## Parcours de vérification

Avant de créer un module, rechercher l’union, la politique ou le catalogue qui possède déjà le concept. Après le changement :

1. vérifier que l’ajout d’une variante casse bien tous les handlers incomplets à la compilation ;
2. vérifier que chaque donnée HTTP ou persistée est validée une seule fois à sa frontière ;
3. vérifier que les routes et composants délèguent à l’autorité au lieu de reconstruire une politique ;
4. lancer les tests ciblés de l’invariant ;
5. lancer `npm run check:architecture`, `code-moniker rules show . --details` et `code-moniker check --report .` ;
6. réviser le témoignage Code Moniker seulement si l’autorité ou la frontière durable a changé.

La taxonomie Code Moniker utilise `dependency`, `ownership` et `hygiene` pour relier ces décisions au graphe réel. Une règle locale vit dans le fragment du package qu’elle protège ; une frontière transverse à plusieurs packages vit dans la configuration racine. Une implication dont l’antécédent ne correspond à aucune relation observée doit être corrigée ou retirée, jamais conservée comme preuve théorique. Chaque alias cible doit aussi être prouvé séparément par au moins une relation représentative ou par un témoin positif et négatif : un antécédent actif ne prouve pas que sa cible reconnaît le concept attendu.

La configuration racine relie les répertoires `src` des packages npm dans un même `workspace.source_group` et leur attribue le source set `main`. Une référence `@hall/*` possède un bind key `external_pkg` lors de l’extraction locale, puis doit se résoudre vers le symbole `srcset:main` du package Hall correspondant dans le graphe workspace. Les règles locales d’import et les règles liées du workspace ne prouvent donc pas la même chose et ne doivent pas être confondues.
