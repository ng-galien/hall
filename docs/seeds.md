# Jeux de données et scénarios de séance

Un **jeu de données** définit la commune, les contacts, les comptes, les affaires,
les pièces et les templates. Un **scénario de séance** applique ensuite un
parcours pour obtenir un état de travail. Choisir une autre étape de séance ne
change pas de commune.

## Inventaire actuel

| Jeu | Contenu | Scénarios acceptés |
| --- | --- | --- |
| `alesia` | Commune, 15 élus et 2 contacts externes, 2 commissions, 5 comptes, 8 affaires et 13 sujets ; ressources sous `seed`, 4 templates PDF/message | `preparation`, `default`, `minutes` |

Alésia est actuellement le seul jeu fourni. Son [guide](demo-alesia.md) décrit
les affaires, les sources, les comptes et les conventions de fiction. Aucun jeu
réel communal n'est fourni : aucune donnée réelle n'a été inventée ou collectée.

| Scénario | État obtenu après chargement du jeu |
| --- | --- |
| `preparation` | Une séance programmée à J+65, ordre du jour vide, aucun scrutin ni PV. Les affaires et les 13 sujets sont disponibles pour préparer la séance. |
| `default` | Deux séances closes avec PV générés, une troisième en cours ; 7 scrutins, dont 1 secret, et 5 délibérations. Une question ajournée est reprise ; une autre attend son examen. |
| `minutes` | Le même historique, puis clôture de la troisième séance ; son PV reste modifiable, sans PDF généré, avec une faute volontaire à corriger. La clôture provisionne la séance suivante. |

`default` est le nom du scénario de séance en cours déjà utilisé par les tests.
Il ne désigne pas un autre jeu de données. Le pouvoir d'exemple est créé par les
scénarios historiques ; `preparation` ne crée pas de faits de séance.

## Choisir et exécuter

```sh
# Catalogue lisible, sans connexion au serveur ni écriture.
npm run seed:dev -w @hall/server -- --list

# Charger un jeu et choisir l'état final des séances.
SEED_API=http://127.0.0.1:3100/api npm run seed:dev -w @hall/server -- --dataset alesia --scenario preparation
SEED_API=http://127.0.0.1:3100/api npm run seed:dev -w @hall/server -- --dataset alesia --scenario default
SEED_API=http://127.0.0.1:3100/api npm run seed:dev -w @hall/server -- --dataset alesia --scenario minutes
```

Exécuter **une seule** de ces commandes sur un serveur dédié déjà démarré et une
base vide. Le seed refuse une base contenant déjà des données ; il ne supprime
rien et ne démarre aucun serveur. Une erreur après le début du chargement peut
laisser des données partielles : repartir d'une base dédiée vide, sans relancer
sur les données partielles. Les appels restent les API publiques de Hall.

Sans arguments, la sélection est `alesia` + `default`. `SEED_DATASET` et
`SEED_MEETING_SCENARIO` permettent aussi la sélection ; les arguments explicites
priment sur ces variables. `SEED_DEMO_PASSWORD` configure le mot de passe des
comptes d'Alésia. Les noms inconnus et les combinaisons non acceptées
échouent avant tout appel API. `--help` explique les options.

Le setup E2E existant conserve son entrée `seed-dev.mjs` et sa variable
`SEED_MEETING_SCENARIO=preparation`. `npm run demo:restart` utilise également
cette entrée et hérite de la sélection par environnement. Cette dernière commande
réinitialise le runtime de démonstration : ne la lancer que depuis le checkout
qui le possède, jamais depuis un worktree pour remplacer le runtime partagé.

## Organisation du code

Les fichiers sont dans [packages/server/scripts](../packages/server/scripts/) :

| Emplacement | Responsabilité |
| --- | --- |
| `seed-dev.mjs` | Lire la sélection, vérifier le catalogue et la base vide, appeler le jeu puis le scénario |
| `seeds/catalog.mjs` | Catalogue unique des jeux, descriptions et scénarios acceptés ; catalogue des scénarios |
| `seeds/common/api.mjs` | Client HTTP injecté, décodage Siren, créations et imports de ressources |
| `seeds/common/empty-database.mjs` | Vérification préalable des collections existantes, sans suppression |
| `seeds/common/files.mjs` | Fabrication des fichiers d'exemple PDF, PNG, DOCX et XLSX |
| `seeds/common/dates.mjs` | Dates relatives utilisées pour les donnéess |
| `seeds/datasets/alesia/index.mjs` | Orchestration du contenu d'Alésia et correspondance entre ses sujets et les rôles du scénario |
| `seeds/datasets/alesia/directory.mjs` | Paramètres, élus, contacts externes, commissions, comptes |
| `seeds/datasets/alesia/resources.mjs` | Catalogue documentaire, exemples de formats, imports et calendrier |
| `seeds/datasets/alesia/businesses.mjs` | Affaires, projets/questions et associations explicites aux pièces |
| `seeds/datasets/alesia/templates.mjs` | Templates du jeu, dont les en-têtes Alésia |
| `seeds/scenarios/preparation.mjs` | Création de la séance future vide |
| `seeds/scenarios/history.mjs` | Parcours historique partagé par `default` et `minutes`, via les API |

Les helpers communs ne choisissent pas de jeu. Les scénarios ne connaissent pas
les noms des élus ou des affaires d'Alésia : le jeu leur fournit les rôles des
participants et les sujets nécessaires. Les services et le modèle de Hall ne
sont pas importés dans ce dispositif.

## Ajouter un jeu communal ultérieurement

Ajouter un répertoire `seeds/datasets/<nom>/` qui expose une fonction asynchrone
`run(api, options)`, puis une entrée dans `datasets` de `catalog.mjs` avec sa
description et ses scénarios acceptés. Réutiliser les opérations de `api` ; les
contenus, les identités et les templates appartiennent au jeu, pas aux helpers.
Documenter précisément ce qui est chargé, la provenance et les prérequis.

Un jeu de données réelles ne doit pas copier les personnes, comptes ou décisions
fictifs d'Alésia. Il ne doit pas non plus générer des votes ou des PV comme s'ils
étaient réels. Les données, leur autorisation d'utilisation et le résultat voulu
restent à fournir par le propriétaire. La structure est prête à recevoir ce module,
mais aucun module communal factice n'a été ajouté. Le chemin `seed` reste celui
des exemples de démonstration ; le classement d'un futur import réel reste à
définir avec ses données.

Les scénarios historiques sont des parcours de démonstration avec un effectif
et des résultats déterminés : leur entrée attend 15 membres (dont président,
secrétaire, mandant, mandataire, excusé et absent), un document de pouvoir et
8 sujets affectés aux rôles `firstDecision`, `rejectedDecision`, `information`,
`secondDecision`, `secretDecision`, `deferredQuestion`, `currentDecision` et
`pendingQuestion`. Un nouveau jeu ne déclare ces scénarios que s'il fournit
volontairement cette préparation. Il peut déclarer seulement
`preparation`, qui ignore cette entrée et crée une séance future vide. Un autre
état final ne devra être ajouté au catalogue que lorsqu'un besoin concret sera
fourni ; il n'y a ni moteur de configuration ni chargement dynamique de fichiers
externes.

## Vérifier

Les tests [seedCli.test.ts](../packages/server/tests/seedCli.test.ts) vérifient
le catalogue hors ligne et les sélections invalides. Le test
[seedPostgres.test.ts](../packages/server/tests/seedPostgres.test.ts) charge
Alésia dans ses trois scénarios via un serveur éphémère et une base PostgreSQL
**de test**. Il vérifie les relations, les votes, les PV, les types et le
classement des ressources, ainsi que la priorité des arguments sur l'environnement.
Le scénario `preparation` y utilise encore la sélection par environnement.

La référence juridique d'exemple dépend du fournisseur Légifrance. Son
indisponibilité reste signalée explicitement ; elle ne vaut pas validation de
la résolution. La génération des PDF historiques nécessite Chromium, qui peut
exiger une exécution hors sandbox macOS.
