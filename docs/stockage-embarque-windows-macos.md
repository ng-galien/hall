# Stockage embarqué pour Windows et macOS

**Décision finale : PGlite retenu par le propriétaire et intégré au desktop.**
Le [guide actuel](desktop.md) décrit le fonctionnement et les vérifications.
Le reste de cette étude conserve la comparaison et les preuves successives.
Les anciennes recommandations ne constituent plus une question ouverte.

## Correction révélée par l’intégration réelle

La première sonde PGlite utilisait plusieurs connexions clientes sur le pont.
Le workspace Electron a ensuite déclenché des lectures paramétrées simultanées
hors transaction : erreur de protocole `08P01`, puis réponses 500/401. Ce cas a
été reproduit par six lectures simultanées dans le test `localServer.test.ts`.

L’intégration utilise donc **un pool `pg` d’une connexion, partagé par les deux
adaptateurs du serveur local**. Le prêt d’une connexion sérialise la requête
complète, y compris Parse/Bind, et toute la transaction lorsque nécessaire.
Le runtime possède ce pool et le ferme après HTTP. Le manifeste, les rôles,
les contraintes et les transactions SQL sont inchangés. Les pools du serveur
connecté restent inchangés. Le test qui échouait et les parcours Electron
développement/empaqueté passent après cette adaptation.

Cette limite concrète complète et corrige la conclusion de la sonde initiale :
le pont à lui seul ne suffisait pas pour toutes les lectures du workspace.

Étude du 10 septembre 2026, en lecture seule du produit sur `a86f4f5`.
Les deux OS sont confirmés. Les architectures et versions minimales ne le sont
pas. L’étude initiale était statique ; le prototype isolé ensuite autorisé a
été exécuté sur macOS Apple Silicon. Voir les preuves et limites ci-dessous.

## Comparaison et recommandation après les deux prototypes

Pour l’application individuelle décrite par le propriétaire, **PGlite est retenu** :
le manifeste Hall et les parcours locaux vérifiés fonctionnent sans serveur
natif à distribuer. La recommandation initiale native reposait
sur une étude puis une preuve native seule ; le test PGlite change cet arbitrage.

| Critère pour l’usage individuel | PGlite WASM | PostgreSQL natif |
| --- | --- | --- |
| Distribution du moteur | JS/WASM, sans exécutables PostgreSQL par OS | Exécutables et bibliothèques par cible, processus à gérer |
| SQL Hall et API vérifiés | Manifeste complet, affaire et ressources fonctionnels | Même manifeste et parcours fonctionnels |
| Opérations qui se chevauchent | Sérialisées par le pont ; écritures et audits conservés dans le test | Sessions réellement distinctes dans le test |
| Persistance vérifiée | Fermeture/réouverture, données et octets conservés | Redémarrage et récupération après arrêt immédiat vérifiés |
| Adaptation démontrée | Pont socket local, réglé à 20 connexions clientes ; SQL et pools Hall inchangés | Lanceur du cluster et URL locale ; SQL Hall inchangé |
| Ce qui reste à faire | Cycle de vie Electron, packaging WASM, essai Windows | Packaging des binaires, arrêt Windows, essai Windows |

La connexion unique de PGlite n’a pas empêché les parcours testés. Elle implique
qu’une longue transaction retarde les autres commandes ; aucun besoin de
transactions réellement parallèles n’a été établi pour cet usage personnel.
Le serveur Hall connecté continue d’utiliser son PostgreSQL existant.

## Exigences observées dans Hall

| Point du code | Conséquence pour le moteur |
| --- | --- |
| [Pool PostgreSQL](../packages/postgres/src/pool.ts), dix connexions par défaut | Le serveur utilise des sessions PostgreSQL, pas une simple API SQL en mémoire. |
| [Transactions](../packages/postgres/src/transaction.ts) | Isolation SERIALIZABLE, reprise de conflits et deadlocks, rôle et contexte locaux à la transaction. |
| [Rôles SQL](../packages/postgres/sql/000-cluster-roles.sql) | Installation des rôles, privilèges et changements de rôle à conserver. |
| [Bootstrap](../packages/postgres/src/bootstrap.ts) | Installation transactionnelle, verrou advisory et vérification stricte d’empreinte. |
| [API documentaire](../packages/postgres/sql/document/040-api.sql) | Verrou advisory transactionnel sur l’espace de noms des ressources. |
| [Modèle des affaires](../packages/postgres/sql/workspace/010-council-business-workspace.sql) | Contraintes et triggers différés portant les relations dossier/rapport. |
| [Ancien adaptateur PostgreSQL](../packages/server/src/infrastructure/postgres/executor.ts) | Un autre pool et une initialisation historique coexistent ; les deux chemins doivent être exercés. |

Le corpus emploie SQL et PL/pgSQL. La recherche des `CREATE EXTENSION` dans les
SQL hors tests n’en a trouvé aucun ; ce constat ne remplace pas l’exécution du
manifeste complet. Les tests pgTAP restent des dépendances de validation, pas
une raison d’embarquer pgTAP chez les conseillers.

## Options comparées

| Option | Intérêt pour Hall | Limite et conclusion |
| --- | --- | --- |
| PostgreSQL natif et gestion directe de `initdb`/`pg_ctl` | Même moteur, sessions et SQL ; maîtrise des binaires livrés. | Gestion des processus, ports et arrêt à construire. Option fonctionnelle démontrée. |
| PostgreSQL natif via `embedded-postgres` pour Node | API de démarrage/arrêt ; matrice annoncée Windows x64, macOS x64 et arm64. | Dépendance supplémentaire, scripts post-install et liens symboliques à préserver dans Forge ; à qualifier, pas encore retenue. |
| PGlite WASM avec persistance Node | Pas de distribution de serveur natif par architecture ; persistance testée. | Pont socket et transactions sérialisées ; parcours Hall testés avec succès. Option privilégiée pour la simplicité locale. |
| SQLite | Déjà choisi dans le lanceur Electron historique. | Ne consomme pas directement les autorités PostgreSQL. Nécessiterait une réécriture des adaptateurs et de la logique SQL ; ne répond pas à l’objectif de conservation des autorités. |

PostgreSQL documente le contrôle du processus par
[`pg_ctl`](https://www.postgresql.org/docs/17/app-pg-ctl.html). Pour Windows,
la [page officielle de téléchargement](https://www.postgresql.org/download/windows/)
propose explicitement une archive binaire destinée à l’intégration dans un
installateur applicatif. Cela établit une voie de distribution, pas une preuve
de fonctionnement de Hall.

Le projet [embedded-postgres Node](https://github.com/leinelissen/embedded-postgres)
annonce les trois couples OS/architecture ci-dessus, la persistance et des
options d’authentification. Il dépend des binaires Zonky et requiert un script
post-install pour recréer des liens symboliques. Sa matrice publiée n’annonce
pas Windows arm64 natif. Les binaires
[Zonky](https://github.com/zonkyio/embedded-postgres-binaries) sont présentés
comme destinés aux tests : leur usage distribué doit donc être qualifié
explicitement, sans déduire une garantie de production de leur disponibilité.

PGlite documente une [persistance sur disque sous Node](https://pglite.dev/docs/filesystems).
Son [pont PostgreSQL](https://pglite.dev/docs/pglite-socket) peut multiplexer
plusieurs connexions mais indique que ce fonctionnement diffère d’un PostgreSQL
normal et ne garantit pas tous les usages. Pour Hall, la coexistence de pools,
transactions, rôles et contextes de session rend cette différence déterminante.
Le prototype décrit plus bas vérifie la séparation des contextes et les commits
de deux opérations qui se chevauchent. Les pools Hall n’ont pas été modifiés ;
le pont sérialise les transactions des différentes connexions.

## Dépendances de l’option native

- Livrer les exécutables et bibliothèques requis hors ASAR, avec versions
  figées, empreintes et notices, sans téléchargement au premier lancement.
  La provenance exacte et les dépendances natives doivent être qualifiées pour
  chaque cible ; aucun poids d’installateur n’a été mesuré.
- Conserver le cluster dans le répertoire de données utilisateur, séparé des
  binaires remplaçables. Piloter démarrage, disponibilité, collisions de port,
  instance unique, arrêt et reprise après crash. Utiliser uniquement la boucle
  locale et des identifiants propres à l’installation.
- Faire consommer l’URL PostgreSQL au serveur existant. Le renderer continue
  d’utiliser HTTP ; Electron gère le processus sans écrire directement les
  données métier. La création du cluster et du schéma doit respecter les
  responsabilités d’installation et d’exécution déjà présentes.
- Étendre le [packaging existant](../packages/desktop/scripts/package-runtime.mjs),
  qui impose déjà un build sur l’OS et l’architecture cibles. Qualifier les
  exécutables et bibliothèques dans les installateurs Windows et macOS signés,
  avec leurs prérequis réels. Aucun nouveau format d’installateur n’est décidé.
- Traiter séparément les fonctionnalités qui dépendent d’un service externe :
  embarquer PostgreSQL ne rend pas à lui seul toute l’application hors ligne,
  notamment la conversion via Gotenberg ou les sources juridiques distantes.

## Mise à jour des données : obstacle distinct

Le bootstrap actuel refuse une empreinte de manifeste différente et réclame
une base neuve. L’adaptateur historique refuse aussi certaines structures
anciennes. Ce comportement de développement ne fournit pas une stratégie de
mise à jour d’installations contenant le travail personnel des conseillers.

Deux sujets sont distincts : évolution du schéma Hall et changement de majeure
PostgreSQL. PostgreSQL décrit les voies de
[mise à niveau du cluster](https://www.postgresql.org/docs/current/upgrading.html),
notamment export/restauration et `pg_upgrade`. Une sauvegarde physique du cluster
n’est pas le bundle métier d’échange. Aucune migration, réinitialisation ou
politique de conservation n’est autorisée par cette étude.

## Décisions et prochaine preuve à demander

1. Le prototype natif isolé est désormais autorisé et exécuté sur macOS.
   La recommandation de moteur reste motivée par les preuves ; le choix d’une
   dépendance de distribution n’est pas arrêté.
2. Préciser Windows x64 ou également ARM, macOS Apple Silicon ou également
   Intel, et les versions minimales. Les OS Windows/macOS sont déjà décidés.
3. Avant livraison, arrêter les attentes de conservation, sauvegarde,
   restauration et mise à jour des données locales. Les changements précis de
   modèle éventuels devront être soumis séparément.

La preuve technique proposée utiliserait une base jetable et le manifeste
inchangé : installation complète, API documentaire, binaires, rôles, deux
transactions concurrentes et leurs contextes, persistance après redémarrage,
arrêt interrompu puis reprise. Elle serait suivie d’un essai d’installateur
sur chaque cible retenue. La partie macOS a été exécutée ci-dessous ; les
installateurs et Windows restent à qualifier, ainsi que la source de binaires,
leur version corrective et
l’intérêt réel d’un wrapper npm face à un petit superviseur natif.

Les décisions métier du [bundle](application-autonome-bundles-cadrage.md)
restent ouvertes et indépendantes de cette recommandation.

## Preuve exécutée sur macOS

Le 10 septembre 2026, le prototype a installé `embedded-postgres@17.10.0-beta.17`
dans `/tmp/hall-native-pg-proof-20260910`, sans l’ajouter aux dépendances Hall.
Les dépendances du checkout ont été installées avec `npm ci --ignore-scripts`,
puis les packages nécessaires au serveur ont été compilés avec succès. Le
script de reconstruction des liens symboliques du paquet natif a été inspecté
et autorisé dans ce seul projet temporaire.

Le premier `initdb` a échoué dans la sandbox sur `shmget: Operation not permitted`.
La relance hors sandbox, autorisée, a réussi. Cela distingue une restriction
d’exécution du comportement du moteur.

La [source exacte du prototype](prototypes/native-postgres/proof.mjs), le
[résultat final](prototypes/native-postgres/macos-result.json) et le
[journal PostgreSQL](prototypes/native-postgres/macos-postgres.log) sont conservés.
La source est un artefact de preuve lié à ce checkout et au runtime temporaire,
pas un lanceur de production ni un script Windows. Pour rejouer exactement,
utiliser la copie `/tmp/hall-native-pg-proof-20260910/proof.mjs` avec ses
dépendances installées ; chaque exécution crée un nouveau cluster jetable.

Résultats observés :

- PostgreSQL 17.10 téléchargé via le paquet natif, sans utiliser Homebrew.
- Installation et vérification des 76 fichiers du manifeste inchangé.
  Empreinte : `eff3a859e5d1d94e9bd841ccecb197197810d89b2db4d1455f470c0de462ffde`.
- Deux sessions distinctes exécutent simultanément des transactions SERIALIZABLE
  avec rôles et contextes séparés. Après commit, les contextes sont effacés et
  les rôles restaurés ; l’accès direct aux tables privées est refusé (`42501`).
- Un verrou advisory détenu dans une transaction empêche son acquisition dans
  l’autre, puis est libéré au commit.
- Le serveur Hall réel démarre sur un port temporaire. Son API crée une affaire
  et lui associe une pièce binaire, dans `seed`, avec réponses HTTP 201.
- Après arrêt normal et redémarrage, la ressource et les octets binaires sont
  identiques ; l’affaire reste lisible par HTTP avec la session existante.
- Après un arrêt immédiat `SIGQUIT` pendant une écriture non commitée, PostgreSQL
  effectue sa récupération WAL. La modification non commitée est annulée ;
  la ressource, les octets et l’empreinte du schéma sont conservés.
- Le serveur HTTP et le cluster de preuve sont arrêtés en fin de parcours.
  Le journal confirme la fin de l’arrêt PostgreSQL. Le runtime partagé est intact.

La machine et Node sont `darwin/arm64`. `file` identifie l’exécutable livré comme
Mach-O universel avec sections x86_64 et arm64. `version()` affiche néanmoins
une chaîne de compilation x86_64 : elle ne prouve pas l’architecture exécutée.
La preuve porte sur ce Mac Apple Silicon ; elle ne valide ni un Mac Intel, ni
Windows, ni l’absence de dépendance à Rosetta. La résolution complète des
bibliothèques natives et les versions minimales d’OS restent à qualifier.

Le wrapper inspecté utilise `SIGINT` sur macOS et `taskkill /f /t` sur Windows.
Ce dernier arrêt forcé justifie de préférer une orchestration explicite de
`pg_ctl` pour une intégration distribuée, ou de qualifier/corriger le wrapper
dans un chantier séparé. La réussite du moteur ne valide pas ce wrapper sur Windows.

## Modes autonome et connecté

Le [lanceur Electron existant](../packages/desktop/src/main.ts) consulte
`HALL_SERVER_URL` puis `connection.json` avant de créer le serveur embarqué.
En mode connecté, il ouvre donc directement `/app/` sur le serveur indiqué,
sans démarrer PostgreSQL ni SQLite localement. Cela correspond à la petite
coquille WebView demandée, selon la lecture du code. Aucun test de fenêtre
Electron ni d’installateur connecté n’a été effectué ici.

L’écart principal de ce mode est la fourniture initiale de l’URL du serveur
aux collègues : variable d’environnement ou fichier actuellement, sans écran
de configuration observé dans ce lanceur. Aucune nouvelle UI, PWA ou framework
n’est proposé dans cette tranche.

## État après le prototype natif seul

Cette première preuve valide des parcours sur le moteur natif. Elle ne
disqualifie pas PGlite et ne constitue pas un choix définitif ; le prototype
comparatif ci-dessous complète maintenant les preuves.

L’intégration desktop dépend encore de l’arbitrage. Le schéma Hall, les migrations,
les bundles et leurs décisions métier restent inchangés. Aucun installateur,
commit, push ou publication n’a été produit.

## Preuve PGlite exécutée

Versions installées exclusivement dans `/tmp/hall-pglite-proof-20260910` :
`@electric-sql/pglite@0.5.8` et `@electric-sql/pglite-socket@0.2.11`, avec
`--ignore-scripts`. Aucun paquet natif supplémentaire. Le moteur se présente
comme PostgreSQL 18.3, WASM 32 bits. Il diffère donc de la majeure 17 de l’essai
natif ; le même manifeste Hall a néanmoins été exécuté intégralement.

Le [prototype exact](prototypes/pglite/proof.mjs) et son
[résultat final](prototypes/pglite/macos-result.json) sont conservés. Comme la
preuve native, le script est un artefact local lié à ce checkout ; sa copie
exécutable avec dépendances est `/tmp/hall-pglite-proof-20260910/proof.mjs`.
Le serveur HTTP, les pools, le pont et la base sont fermés en fin de parcours.

### Ce qui fonctionne réellement

- Les 76 fichiers du manifeste s’installent et se vérifient sans modification,
  avec la même empreinte que dans le test natif.
- Le pont accepte les clients `pg` existants. Il est configuré explicitement
  avec `maxConnections: 20` au lieu de son défaut de 1 ; aucun pool Hall n’est
  réécrit. La valeur 20 sert au prototype, pas de règle produit proposée.
- Deux demandes de transaction lancées ensemble conservent chacune leur rôle,
  contexte, commit et audit. Elles partagent le backend 42 de PGlite et sont
  sérialisées ; ce n’est pas une prétention à deux sessions physiques.
- Les rôles et contextes locaux sont restaurés en sortie. L’accès direct à la
  table privée d’audit est refusé avec `42501`.
- Le vrai serveur Hall initialise ses deux chemins de persistance. Son API
  crée une affaire, une pièce binaire et deux textes créés simultanément ;
  les trois ressources sont bien associées à l’affaire.
- La tentative de modification d’un binaire est refusée par le trigger Hall
  existant (`HV605`, objet binaire immuable). Les octets restent identiques.
- Après fermeture puis réouverture de PGlite depuis son dossier disque,
  ressource, octets et accès HTTP avec la session existante sont conservés.
- Un audit inséré dans une transaction explicitement annulée ne persiste pas.

### Échecs et limites constatés

Aucun échec fonctionnel inattendu n’a été rencontré dans ces scénarios.
Une assertion initiale de la sonde attendait à tort une violation de CHECK
`23514` lors de la corruption d’un binaire : le trigger d’immutabilité la refuse
plus tôt avec `HV605`. Seule l’assertion de la sonde a été corrigée ; aucun
contrôle SQL n’a été changé.

La sérialisation est concrète : une transaction conserve le moteur jusqu’à sa
fin. Le code installé du pont choisit les messages du même client tant que la
transaction est ouverte. Une opération lente peut donc retarder une autre
opération locale. Ce n’est pas une perte d’intégrité constatée.

### Contraintes documentées, adaptations et non-vérifié

Le pont documente l’absence de SSL et un multiplexage différent de sessions
PostgreSQL ordinaires. Il s’agit ici d’une boucle locale, sans exposition
réseau à ajouter. Son code ignore aussi la demande d’annulation du protocole ;
aucun scénario Hall demandant cette annulation n’a été reproduit. Ces limites
ne sont pas des échecs des parcours ci-dessus.

L’adaptation minimale démontrée est de créer PGlite sur disque, lancer le pont
local, passer son URL au serveur Hall puis fermer les trois à la sortie.
Il n’a pas fallu porter les repositories ni retirer les transactions ou rôles.
Une intégration directe sans socket est une autre possibilité technique,
mais n’est ni nécessaire à cette preuve ni évaluée ici.

Non vérifiés : Windows, Mac Intel, lancement Electron empaqueté, arrêt brutal
du processus PGlite, gros dossiers, tous les cycles de séance et toutes les
opérations du produit. Aucune promesse de production ou de haute disponibilité
n’est recherchée pour ces applications individuelles. L’absence de migration
du schéma reste un sujet commun aux deux moteurs, indépendant des bundles.

the user a ensuite approuvé l’intégration de PGlite pour cette simplicité.
Le prototype natif reste un résultat comparatif, sans dépendance native ajoutée
au produit.
