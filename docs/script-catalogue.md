# Catalogue des scripts de Hall

Le dépôt contient **7 scripts Hall exécutables suivis**, tous rangés sous
`scripts/`, pour **854 lignes**. Les tests, les hooks, le Runner TRUST installé
et les modules importés ne sont pas comptés. `npm run test:all` compose les
commandes directement dans `package.json`.

| Catégorie | Scripts | Lignes |
| --- | ---: | ---: |
| Contrôles | 3 | 262 |
| Développement | 2 | 442 |
| Production locale | 1 | 103 |
| Données de démonstration | 1 | 47 |
| **Total** | **7** | **854** |

## Contrôles

| Fichier | Lignes | Appel | Fonction |
| --- | ---: | --- | --- |
| `scripts/checks/check-public-artifacts.mjs` | 20 | `npm run check:public-artifacts` | Refuse les artefacts privés interdits dans les fichiers suivis. |
| `scripts/checks/check-requirements.mjs` | 210 | `npm run check:requirements` | Contrôle le catalogue et ses références vers le code, les tests et le backlog. |
| `scripts/checks/check-test-inventory.mjs` | 32 | `npm run check:test-inventory` | Vérifie la répartition des scénarios Playwright entre les suites. |

## Développement

| Fichier | Lignes | Appel | Fonction |
| --- | ---: | --- | --- |
| `scripts/development/dev-session.mjs` | 338 | Commandes `dev:*` et `demo:restart` | Gère la session locale complète : processus, ports, PostgreSQL, tmux, configuration privée, contrôle PDF et reset explicite de la démonstration. |
| `scripts/development/requirements-ui.mjs` | 104 | `npm run requirements:ui` | Sert l'interface locale du catalogue des exigences. |

## Production et démonstration

| Fichier | Lignes | Appel | Fonction |
| --- | ---: | --- | --- |
| `scripts/production/local-production.mjs` | 103 | Commandes `prod:*` | Prépare et exploite la production locale Alésia, ses sauvegardes et leur restauration de contrôle. |
| `scripts/seed/seed-dev.mjs` | 47 | `npm run seed:dev` | Charge le jeu Alésia et le scénario demandé par l'API publique dans une base vide. |

Les douze fichiers de `scripts/seed/data/` décrivent les données et scénarios
Alésia. Ils ne sont pas des entrées exécutables et ne sont pas comptés.
L'infrastructure Playwright est regroupée sous `packages/client/e2e/`. Les
outils de test PostgreSQL sont regroupés sous `tests/postgres/`.

Le build desktop est une commande npm dans `packages/desktop/package.json`. La
copie du runtime de distribution est définie dans `packages/desktop/forge.config.mjs`.
