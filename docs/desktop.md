# Hall desktop autonome et connecté

the user a retenu PGlite pour l’application individuelle locale. Les opérations
attendent leur tour ; aucun besoin particulier de performances n’est demandé.
Les plateformes cibles sont Windows et macOS.

## Deux modes

Sans serveur distant configuré, Electron appelle `startLocalHttpServer` de
`@hall/server`. Le serveur conserve les données PGlite dans le sous-répertoire
`pglite` du répertoire utilisateur Electron. Le renderer utilise le même HTTP,
les mêmes services et le même SQL que Hall. Aucun SQLite ni serveur PostgreSQL
natif n’est démarré pour ce mode.

Avec `HALL_SERVER_URL=https://adresse-du-serveur`, la fenêtre ouvre `/app/` sur
ce serveur. Cette adresse est conservée dans `connection.json` pour les
lancements suivants. Aucun moteur local n’est démarré dans ce mode. La
configuration est fournie par variable ou fichier ; aucun nouvel écran de
configuration ni PWA n’est introduit.

`HALL_USER_DATA_PATH` permet de désigner un répertoire utilisateur distinct,
notamment pour une recette isolée. Créer ce répertoire avant le lancement.
La fermeture de la dernière fenêtre quitte l’application sous Windows ; sous
macOS, la commande Quitter ferme le serveur local puis son moteur persistant.

## Cycle technique

Le moteur, son pont local et le pool sont possédés par
[`pgliteRuntime.ts`](../packages/server/src/infrastructure/database/pgliteRuntime.ts).
Le pool partagé contient une connexion, prêtée aux deux adaptateurs Hall.
Cela empêche l’entrelacement des lectures paramétrées dans le pont et conserve
les transactions et contextes locaux. Le mode serveur PostgreSQL conserve ses
pools habituels.

[`localServer.ts`](../packages/server/src/core/localServer.ts) compose le
serveur existant avec ce runtime. Son arrêt est idempotent : HTTP et les
adaptateurs finissent, puis le pool, le pont et PGlite sont fermés. Un échec de
démarrage ferme aussi le runtime. Electron attend l’initialisation et la
fermeture avant de quitter.

Le manifeste SQL n’est pas modifié. Une base dont l’empreinte ne correspond plus
au manifeste est refusée, sans effacement automatique. Aucune migration de
schéma ou reprise de l’ancien fichier SQLite n’est ajoutée par cette tranche.
Les règles encore ouvertes des [bundles](application-autonome-bundles-cadrage.md)
ne sont pas implémentées.

## Construction et vérification

- `npm run desktop:dev` : client Vite et enveloppe Electron existante.
- `npm run desktop:package` : compilation et application empaquetée.
- `npm run desktop:make` : fabrication des formats configurés dans Forge.
- `npm test -w @hall/server -- --run src/__tests__/localServer.test.ts` : données
  jetables, concurrence des lectures, persistance, fermeture et échec de démarrage.
- `node docs/prototypes/desktop-smoke.mjs` : recette Electron avec répertoires
  jetables. Un chemin d’exécutable en argument teste une application empaquetée.

La recette de fenêtre crée une ressource par API, vérifie sa présence dans le
workspace par `data-testid`, quitte et relance pour vérifier sa persistance.
Elle ouvre ensuite un serveur HTTP témoin dans le mode connecté et vérifie
l’absence de répertoire PGlite. Elle conserve screenshot et résultat dans le
répertoire temporaire annoncé. Les anciens prototypes comparatifs sont
séparés sous `docs/prototypes/` et ne font pas partie du runtime produit.

## Résultats du 10 septembre 2026

- Compilation serveur/client/desktop et typecheck desktop réussis.
- Tests locaux réussis : les six lectures simultanées qui reproduisaient
  l’erreur du pont retournent toutes 200 ; ressources et octets sont conservés
  après redémarrage ; fermeture répétée et échec de schéma sont couverts.
- Contrôles d’architecture : zéro violation.
- macOS Apple Silicon : parcours Electron autonome, relance avec persistance,
  et coquille connectée sans moteur local réussis.
- Package `Hall-darwin-arm64/Hall.app` construit ; les mêmes trois parcours
  passent avec son exécutable, y compris le chargement des fichiers WASM.

Le packaging inclut désormais `@hall/mcp`, dépendance du serveur absente de
l’ancienne liste de copie. Le rechargement d’une route SPA utilise une racine
de fichiers explicite, y compris sous un chemin caché tel que `.codex`.

Windows et Mac Intel ne sont pas vérifiés. Aucun installateur signé, aucune
publication, aucun test de tous les parcours métier ou d’arrêt brutal PGlite
n’est annoncé. La conversion documentaire externe et les sources distantes
gardent leurs dépendances habituelles.
