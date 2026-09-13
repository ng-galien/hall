# Préparation technique de la distribution locale

12 septembre 2026. Périmètre du backlog : distribution locale Windows/macOS. Aucun nouveau parcours de restauration, modification d'invariant, publication ni incorporation des données privées dans un package.

## Autorités existantes

- `packages/desktop/src/main.ts` : Electron démarre `startLocalHttpServer` avec un répertoire utilisateur PGlite ; mode connecté distinct via configuration serveur.
- `packages/server/src/core/localServer.ts` et `infrastructure/database/pgliteRuntime.ts` : même serveur Hall, pont PostgreSQL local et moteur PGlite ; pas de serveur PostgreSQL natif dans l'application individuelle.
- `packages/desktop/forge.config.mjs` : copie client compilé, runtime serveur et Chromium ; makers Squirrel Windows, ZIP macOS, DEB/RPM Linux.
- `packages/desktop/scripts/package-runtime.mjs` : résolution récursive des dépendances de production ; manifeste du runtime copié ; dépendances natives et Chromium de l'OS et architecture de construction.

## Vérifications réalisées

### Compatibilité de plateforme

La garde `prepareBrowserRuntime('win32', 'x64')` appelée sur ce Mac Apple Silicon refuse avant installation : la construction doit se faire sur l'OS et l'architecture cibles. Ce n'est pas un échec de Hall sous Windows ; aucun test Windows n'a été exécuté. Un environnement Windows de construction et recette reste nécessaire. Même réserve pour Mac Intel.

### Snapshot et dump : deux formats distincts

Le dump du conseil possède 1 094 entrées TOC, format PostgreSQL CUSTOM 1.16, créé avec pg_dump 18.6 depuis PostgreSQL 17.11. Lecture du catalogue réussie, sans restauration ni accès à la base de production.

L'API PGlite installée propose `dumpDataDir` et `loadDataDir`. Une preuve isolée sur une table synthétique a exporté un snapshot de 4 493 672 octets, fermé le moteur et rechargé le snapshot dans un nouveau moteur : ligne et valeur conservées. **Ce test ne prouve pas la reprise du dump municipal complet**, ni son chargement dans Hall.

Hall ne consomme actuellement pas `loadDataDir` dans son runtime ni dans son enveloppe desktop. L'option existante est un répertoire PGlite. Fournir le fichier CUSTOM à la place n'est donc pas un parcours implémenté. La conversion/restauration complète, les rôles et permissions ainsi que la concordance du manifest doivent être vérifiés séparément ; aucune suppression de contraintes ou réécriture du manifest ne doit les contourner.

### Confidentialité de l'artefact

La recette de copie ne prend que les packages de runtime, leur compilation, les SQL hors tests, le client compilé et Chromium. Les imports privés se trouvent hors de ce périmètre. Toute incorporation ultérieure d'un snapshot municipal exige de vérifier exactement son contenu et sa destination ; aucun fichier privé n'est ajouté à Git dans cette tranche.

## Construction macOS

L'artefact macOS déjà présent avant cette tranche fait environ 604 Mo et n'est pas considéré comme une construction fraîche du checkout. La construction et recette courantes seront notées ci-dessous après exécution ; ne pas confondre l'existence de cet ancien artefact avec un résultat validé.

## Points qui restent à décider ensemble

Le parcours utilisateur pour sélectionner/recharger une sauvegarde et le comportement en présence d'une base locale existante appartiennent à la catégorie produit. Cette préparation ne choisit ni écrasement ni fusion. Les échecs de compatibilité technique peuvent être caractérisés en autonomie sans prendre ces décisions.

La configuration Forge ne renseigne pas de signature macOS ni de notarisation. Une construction locale éventuelle reste donc une recette de package, pas un installateur publiable validé par Gatekeeper. Aucun workflow CI de construction Windows n'est présent dans `.github/workflows` dans ce checkout.

### Résultat de construction et recette du 12 septembre

Après confirmation de fin des tests calendrier : build client, build desktop et `npm run package -w @hall/desktop` réussis. Artefact natif courant : `packages/desktop/out/Hall-darwin-arm64/Hall.app`, environ 660 Mo. Le build client signale des chunks volumineux ; ce packaging ne constitue pas une optimisation de ces volumes.

Inventaire ASAR : 15 416 entrées, aucune entrée correspondant à `local-imports`, un dump ou `credentials.json`. Le package est construit sans le snapshot municipal.

La recette standard a échoué lors du premier lancement : fenêtre détruite pendant que le serveur local achevait son démarrage. Une reprise de la même recette dans un profil temporaire neuf avec délai Electron de 90 secondes au lieu de 30 a réussi :

1. fenêtre autonome, création de ressource synthétique par API et présence dans l'espace de travail ;
2. fermeture et relance avec conservation de cette ressource ;
3. mode connecté sur serveur témoin, sans moteur local créé.

Résultat privé de recette : `/tmp/hall-desktop-qa-KYikuh/result.json`. Aucun délai ni comportement produit n'a été modifié. La différence de délai permet une recette réussie mais ne suffit pas à attribuer définitivement l'échec initial à sa seule durée. Le parcours complet d'un conseil et la génération PDF ne sont pas couverts par cette recette.

Conclusion : **package macOS Apple Silicon construit et smoke autonome/persistance/connecté réussie**. Windows, Mac Intel, signature, import du dump complet dans PGlite et parcours de restauration restent non validés. Aucun changement de production ou redémarrage de la preview n'a été effectué par cette préparation.
