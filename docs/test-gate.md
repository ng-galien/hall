# Gate de tests Hall

`npm run test:all` est la gate locale et CI. Elle arrête à la première étape en
échec et exécute toutes les étapes **en série** : le SQL, le serveur et Playwright
réutilisent le même conteneur PostgreSQL de test, jamais la base de démonstration
ni la production locale. La CI lance la même commande dans
`.github/workflows/ci.yml`.

| Famille | Découverte | Étape de la gate |
| --- | --- | --- |
| Règles d'architecture, lint et typage | Contrôles du dépôt et Code Moniker | `quality` |
| Tests des outils du dépôt | Tous les `tests/meta/*.test.mjs`, notamment les exigences et l’architecture | `test:meta` |
| Tests des paquets | `vitest run` dans les workspaces, y compris `packages/client/tests/*.test.mjs` | `quality` |
| SQL pgTAP conseil et documents | Tous les `*.test.sql` de leurs deux dossiers, triés par nom | `quality` via le runner serveur |
| Intégration HTTP/PostgreSQL | Tous les `src/**/*.test.ts` et `tests/**/*.test.ts` du serveur, sans parallélisme de fichiers | `quality` |
| Couverture serveur et domaine | Les mêmes tests avec instrumentation et seuils de couverture | `test:backend` |
| Actualisation des traductions | Test Chromium dédié | `test:i18n-hmr` |
| Parcours navigateur | Tous les `*.spec.ts` du dossier E2E, sauf authentification | `test:e2e` |
| Authentification navigateur | `user-account.spec.ts` | `test:e2e:auth` |
| Résistance des règles au mutation testing | Scrutin, cycle de séance, autorisations | Les trois étapes `test:*:mutation` |

`check:test-inventory` vérifie que chaque spécification Playwright est effectivement
collectée par une et une seule des deux suites. La suite principale collecte
automatiquement tout nouveau fichier `*.spec.ts` ; le test d'authentification
reste isolé car il change le mode d'identification du serveur. Chaque scénario
repart d'un jeu de données propre dans la même base de test.

`check:public-artifacts` refuse tout dump, import local, journal d'exploitation
privé ou fichier d'environnement suivi par Git. Avant chaque commit, la revue
des fichiers modifiés et non suivis reste nécessaire : ce contrôle ne juge pas
le contenu des documents.

`test:ballot`, `test:lifecycle`,
`test:requirements:ui`, `test:postgres:council`, `test:postgres:document` et
`test:integration` sont des sélections ciblées des tests déjà inclus dans la
gate. Elles restent disponibles pour diagnostiquer rapidement un échec ; elles
n'ajoutent pas de scénario unique. Après un échec Playwright, relancer d'abord
le scénario concerné, puis la gate complète.
