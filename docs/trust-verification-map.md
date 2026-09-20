# Carte des contrôles de Hall

Cette carte indique quel contrôle existant utiliser selon la facette examinée.
Elle ne définit pas les Procedures TRUST.

Les facettes fonctionnelles du catalogue sont : séances et ordre du jour,
scrutins et votes, affaires et délibérations, calendrier et rendez-vous,
annuaire et mandats, documents et ressources, lieux, procès-verbaux, espace de
travail, convocations et commune.

| Script ou commande | Facette concernée | Ce que le contrôle vérifie |
| --- | --- | --- |
| [`scripts/checks/check-requirements.mjs`](../scripts/checks/check-requirements.mjs) — `npm run check:requirements` | Toutes les facettes fonctionnelles | Structure du catalogue, identifiants et présence des références `implements`, `verifies` et `tracks`. Ne prouve pas le comportement. |
| Tests `packages/domain/src/**/*.test.ts` — `npm test -w @hall/domain -- --run <test>` | Règles métier, cycles de vie, scrutin, ordre du jour | Politique pure et transitions du domaine ciblé. |
| [`tests/postgres/run.mjs`](../tests/postgres/run.mjs) — `npm run test:postgres:council` | Séances, ordre du jour, scrutins, votes, affaires, délibérations et procès-verbaux | Invariants SQL et cycles du conseil avec pgTAP. |
| [`tests/postgres/run.mjs`](../tests/postgres/run.mjs) — `npm run test:postgres:document` | Documents, ressources, espace de travail et liens avec les affaires | Structure, API SQL, cycles documentaires et protection des contenus avec pgTAP. |
| [`tests/postgres/run.mjs`](../tests/postgres/run.mjs) — `npm run test:postgres` | Persistance et HTTP sur toutes les facettes concernées | Suites pgTAP, reconstruction de la base jetable, puis intégration serveur/PostgreSQL. |
| Tests `packages/api-contract/src/**/*.test.ts` — `npm test -w @hall/api-contract` | Contrats HTTP et Siren | Formes partagées, décodage et compatibilité du contrat public. |
| `authorizationMatrix.test.ts`, `sirenEntityPolicy.test.ts`, `apiCommandPolicy.test.ts`, `securityHypermedia.test.ts` — `npm run test:vitest -w @hall/server -- <tests>` | Droits, commandes et actions Siren | Cohérence entre permission, exécution serveur et capacité annoncée. |
| Tests ciblés `packages/server/src/**/*.test.ts` — `npm run test:vitest -w @hall/server -- <test>` | Cas d'usage et représentations HTTP de la facette | Orchestration serveur, erreurs et représentation Siren ciblées. |
| Tests `packages/client/tests/*.test.mjs` — `npx vitest run <test>` | Contrats de composants, navigation, édition et présentation | Règles de composition du client sans parcours navigateur complet. |
| Spécifications `packages/client/e2e/specs/*.spec.ts` — `npm run test:e2e -- <spec>` | Parcours utilisateur de la facette | Comportement dans l'application réelle avec base de test isolée. |
| Tests `packages/templating/src/**/*.test.ts` — `npm test -w @hall/templating` | Documents, convocations, procès-verbaux et délibérations | Grammaire documentaire et rendu partagé. |
| [`tests/meta/exhaustive-dispatch.test.mjs`](../tests/meta/exhaustive-dispatch.test.mjs) — `npm run check:architecture` | Qualité et architecture, transverse aux facettes | Dispatch exhaustif, types du domaine et frontières Code Moniker. |
| [`scripts/checks/check-public-artifacts.mjs`](../scripts/checks/check-public-artifacts.mjs) — `npm run check:public-artifacts` | Dépôt et données locales | Absence de dumps, imports privés, journaux d'exploitation et environnements suivis. |
| [`package.json`](../package.json) — `npm run test:all` | Ensemble du produit | Composition séquentielle des contrôles d'architecture, types, tests, SQL, HTTP, navigateur et mutation. |

Pour un changement donné, choisir le contrôle ciblé de la ligne concernée puis
les contrôles plus larges imposés par [`AGENTS.md`](../AGENTS.md). L'Operation
TRUST porte l'orchestration et la projection propres à la mission ; elle appelle
uniquement les commandes Hall durables nécessaires.
