# Sécurité des scrutins

Ce document est la carte opérationnelle des invariants critiques du vote. Chaque invariant doit être défendu à plusieurs frontières sans dupliquer la règle métier : schéma d’entrée, noyau pur, service transactionnel et persistance.

## Invariants

| Invariant | Autorité | Preuves principales |
| --- | --- | --- |
| La feuille de présence couvre exactement le conseil actif, sans doublon ni identité étrangère | `participationPolicy.ts` | énumération bornée et propriétés génératives |
| Le quorum ordinaire dépend uniquement des membres physiquement présents ; la seconde convocation reste identifiable | `participationPolicy.ts` | toutes les frontières de 1 à 80 membres |
| Une procuration écrite vise un membre représenté, son porteur est présent et ne porte qu’une procuration | `ballotMachine.ts` | matrices valides et invalides générées |
| Une récusation est unique, concerne un participant et retire également les suffrages portés pour lui | `ballotMachine.ts` | scénarios de récusation et procuration |
| Chaque électeur éligible possède exactement un suffrage public, attribué au bon porteur | `ballotMachine.ts` | absence, doublon, usurpation, renommage bijectif |
| Les totaux secrets sont des entiers naturels et leur somme égale exactement le nombre d’électeurs éligibles | `ballotMachine.ts` | propriétés génératives et valeurs hostiles |
| La majorité ne compte que les voix pour et contre ; la voix du président ne départage qu’un scrutin public | `ballotMachine.ts` | oracle mathématique indépendant, exhaustif jusqu’à sept électeurs |
| Un scrutin secret ne persiste ni ne restitue de choix nominatif | service et repository | tests d’intégration API et persistance |
| Une clé d’idempotence désigne une commande complète et stable | `ballotService.ts` et index SQL | replay et conflit concurrents |
| Une cible ne possède qu’un scrutin final actif | repository et index SQL | rafales concurrentes multi-connexions |
| Le scrutin, ses voix et le statut de la décision sont atomiques | unité de travail | injection de panne avant commit sur SQLite et PostgreSQL |
| Une annulation réouvre la décision dans la même transaction | `ballotService.ts` | injection de panne à la réouverture |

Les règles juridiques de référence restent celles indiquées dans `AGENTS.md`, notamment les articles L2121-17 et L2121-20 du CGCT. Toute automatisation nouvelle impose une nouvelle vérification de leur version en vigueur.

## Portes exécutables

- `npm run test:ballot` : noyau génératif, parcours XState, rollback et concurrence SQLite.
- `npm run test:postgres` : même atomicité sur PostgreSQL réel, plus le parcours de persistance complet.
- `npm run test:ballot:mutation` : mutation ciblée de `participationPolicy.ts` et `ballotMachine.ts`. La campagne casse sous 90 %, signale sous 95 % et ne doit jamais être abaissée pour faire disparaître un survivant non analysé.
- `npm run test:ballot:model` : exploration TLC bornée de la spécification abstraite déjà linéarisée des opérations record/replay/conflit/annulation. Ce modèle vérifie les invariants du résultat observable ; les interleavings internes, le commit et le rollback sont éprouvés séparément par les contrats de persistance SQLite/PostgreSQL. L’outil officiel TLA+ est épinglé par version et somme de contrôle, puis conservé uniquement dans le répertoire temporaire du système.
- `npm run test:backend` : couverture complète des packages serveur et domaine.

La couverture de lignes n’est pas une preuve suffisante. Un changement du vote doit au minimum conserver vertes les quatre premières portes, puis la suite backend complète.

## Lecture des échecs

1. Un contre-exemple `fast-check` doit être conservé comme régression, puis généralisé dans l’invariant.
2. Un mutant survivant doit être classé : manque de test, code redondant à simplifier, ou mutation réellement équivalente. Le seuil ne se baisse pas pendant cette analyse.
3. Un échec de concurrence doit être lu comme un historique : une seule linéarisation gagnante, les replays renvoient le même identifiant et les commandes incompatibles échouent sans état partiel.
4. Un échec TLC fournit une trace minimale. Il faut corriger le modèle si la trace contredit le contrat, ou le code et ses tests si elle décrit un interleaving réellement possible.
