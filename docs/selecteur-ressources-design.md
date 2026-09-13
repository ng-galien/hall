> Réalisation en cours. Les comportements acceptés sont désormais définis exclusivement par [le catalogue](../requirements/catalog.json), exigences `HALL-FR-SRC-010`, `HALL-FR-SRC-020` et `HALL-FR-SRC-030`. La [carte d’architecture](architecture.md#recherche-et-sélection-de-ressources) décrit les autorités réalisées. Les sections ci-dessous conservent la proposition initiale et ne sont pas une seconde source d’exigences.

# Sélecteur commun de ressources et d’entités

## Objet

Ce document clarifie le comportement attendu des recherches utilisées pour
sélectionner une ressource ou une entité Hall. Il s’agit d’un audit et d’une
proposition d’architecture. Il ne décrit aucune modification déjà réalisée.

Le mot « ressource » est employé ici au sens de l’expérience utilisateur : il
recouvre les ressources documentaires ainsi que les entités que Hall permet de
rechercher et de référencer, notamment les contacts, membres du conseil,
affaires, séances et délibérations. Le modèle conserve ses distinctions
existantes entre ces natures.

## Décisions de conception

the user a fixé les règles suivantes le 12 septembre 2026 :

- Hall doit avoir un seul comportement de sélection, qu’il soit déclenché par
  un champ de formulaire, un bouton, une commande de l’éditeur ou la saisie
  `@` ;
- un écran ne reconstruit ni sa recherche, ni sa liste de résultats, ni sa
  navigation clavier, ni la présentation des types ;
- l’appelant fournit le périmètre de sélection : types admis, éléments déjà
  sélectionnés ou exclus, contexte à privilégier et action à effectuer après
  le choix ;
- le sélecteur reste responsable de la recherche, du classement, des états
  vide/chargement/erreur, de la sélection active, du clavier et du rendu des
  résultats ;
- une enveloppe adaptée à la place disponible peut présenter le même
  sélecteur dans un champ, un popover ou une modal. Cette enveloppe ne crée pas
  un autre moteur ni un autre comportement de choix.

## Briques existantes à conserver

L’application possède déjà la majeure partie du socle nécessaire :

| Brique | Responsabilité utile |
| --- | --- |
| [`lib/search.ts`](../packages/client/src/lib/search.ts) | Normalisation, filtrage, score textuel, proximité du dossier, priorité et limite des résultats. |
| [`components/search/SearchBox.tsx`](../packages/client/src/components/search/SearchBox.tsx) | Champ de recherche commun, facettes, saisie clavier et critères structurés. |
| [`components/search/facetSuggestions.ts`](../packages/client/src/components/search/facetSuggestions.ts) | Construction des facettes à partir du corpus. |
| [`components/search/folderSections.ts`](../packages/client/src/components/search/folderSections.ts) | Regroupement des résultats et ordre de navigation. |
| [`components/search/FolderSectionsList.tsx`](../packages/client/src/components/search/FolderSectionsList.tsx) | Présentation arborescente commune des groupes. |
| [`features/search/searchCorpus.tsx`](../packages/client/src/features/search/searchCorpus.tsx) | Corpus typé des ressources, affaires, séances, délibérations, membres et contacts. |
| [`features/search/SearchHitRow.tsx`](../packages/client/src/features/search/SearchHitRow.tsx) | Présentation commune d’un résultat avec son icône, son type et ses métadonnées. |

Cette chaîne est la base du futur sélecteur. La proposition ne consiste donc
pas à créer un nouveau système de recherche, mais à rendre sélectionnable ce
socle existant et à y raccorder les consommateurs divergents.

## Mécanismes concurrents observés

### Recherche générale et Workspace

[`GlobalSearchPalette`](../packages/client/src/features/search/GlobalSearchPalette.tsx)
et [`WorkspaceSearch`](../packages/client/src/pages/workspace/WorkspaceSearch.tsx)
utilisent déjà `SearchBox`, `searchEntities`, les sections et les lignes de
résultat partagées. Ils dupliquent encore une partie du pilotage : état actif,
index clavier, construction des sections et traitement du choix.

### Éditeur riche

[`ReferenceSearchDialog`](../packages/client/src/components/editor/ReferenceSearchDialog.tsx)
réutilise `SearchBox` et `searchEntities`, mais possède sa propre construction
de lignes et son propre pilotage clavier. Le menu `@` de
[`references.tsx`](../packages/client/src/components/editor/references.tsx)
possède une seconde liste de résultats et une seconde navigation clavier.

Le catalogue de l’éditeur est produit par
[`useReferenceMentionables`](../packages/client/src/hooks/useReferenceMentionables.ts),
alors que la recherche générale utilise `useSearchCorpus`. Ces deux producteurs
parcourent les mêmes stores et reconstruisent séparément les mêmes contacts,
membres, ressources, affaires, séances et délibérations.

Le choix n’est pas uniforme : dans le menu `@`, une ressource documentaire
ouvre actuellement la recherche complète, tandis qu’un contact, un membre, une
affaire, une séance ou une délibération est inséré directement. Le type choisi
modifie donc le parcours avant même qu’une éventuelle option propre à la
ressource soit nécessaire.

### Association de documents à une affaire

[`ResourcePicker`](../packages/client/src/pages/workspace/ResourcePicker.tsx)
est une implémentation autonome. Elle possède son champ, son filtrage, ses deux
groupes « dans ce dossier » et « autres dossiers », ses lignes et ses états.
Elle ne réutilise ni `SearchBox`, ni `searchEntities`, ni `SearchHitRow`.

### Calendrier

[`EventFields`](../packages/client/src/features/calendar/EventFields.tsx)
cumule trois comportements :

- l’affaire du conseil est choisie dans un `Select` plat ;
- un contact est ajouté avec le composant `Autocomplete`, qui possède son
  propre filtrage et sa propre navigation clavier ;
- le `MarkdownEditor` du contexte ne reçoit aucun corpus de références. Sa
  commande de recherche existe visuellement mais n’a aucun élément à proposer.

Ce dernier point explique directement le défaut constaté dans l’éditeur d’un
rendez-vous. Les autres consommateurs qui fournissent
`useReferenceMentionables` au même `MarkdownEditor` disposent, eux, des
références.

### Autres sélections d’entités Hall

Les sélections suivantes reconstruisent également une liste locale :

| Parcours | Entité choisie | Mécanisme actuel |
| --- | --- | --- |
| Création d’un mandat | Contact admissible | `Select` alimenté localement |
| Création et modification d’un utilisateur | Contact facultatif | deux `Select` distincts |
| Composition d’une commission | Contacts disponibles | palette de cartes spécifique |
| Déport sur un point | Membre admissible | `Select` alimenté localement |
| Président et secrétaire de séance | Membre du conseil | deux `Select` alimentés localement |
| Inscription d’une affaire | Séance disponible | `Select` alimenté localement |

Ces écrans ne doivent pas définir la présentation ou la mécanique de recherche.
Ils doivent seulement fournir leurs règles d’admissibilité et appliquer le
résultat choisi.

La recherche d’une référence Légifrance dans
[`LegalReferenceResolver`](../packages/client/src/features/legal/LegalReferenceResolver.tsx)
porte sur un fournisseur extérieur et non sur le corpus Hall. Son chargement
reste spécifique, mais son champ, ses états, son clavier et ses lignes de
résultat peuvent consommer la même mécanique de sélection.

Les listes fermées de valeurs ne sont pas des sélecteurs de ressources : rôle,
catégorie documentaire, langue, thème ou lieu configuré restent des `Select`.
Cette frontière évite de transformer chaque liste de constantes en recherche
d’entités.

## Diagnostic d’architecture

Le problème ne vient pas d’une absence totale de composant commun. Le noyau de
recherche partagé existe, mais il s’arrête avant le comportement de sélection.
Chaque écran reprend alors une partie des responsabilités suivantes :

1. produire ou reconstruire le corpus ;
2. filtrer et ordonner les candidats ;
3. présenter le champ et les résultats ;
4. maintenir l’élément actif et traiter le clavier ;
5. décider si un choix ferme, navigue, insère ou ouvre une seconde étape.

Cette coupure explique les divergences visuelles et fonctionnelles. Elle permet
aussi qu’un `MarkdownEditor` reste silencieusement vide lorsque son appelant
omet la propriété `mentionables`.

L’index Code Moniker du workspace n’était pas actif pendant cet audit. Les
constats ci-dessus proviennent donc des imports, consommateurs et historiques
Git du checkout, et non d’une preuve d’exhaustivité fournie par son graphe.

## Architecture proposée à partir de l’existant

### 1. Un corpus canonique

`useSearchCorpus` devient l’unique producteur des entités Hall recherchables.
Le type corrélé `SearchHit` conserve l’identité, la nature et l’objet source.
Les informations aujourd’hui propres à `Mentionable`, notamment la
présentation documentaire recommandée et la priorité liée à l’affaire, sont
produites par un adaptateur commun à partir de ce même `SearchHit`.

`useReferenceMentionables` ne reste pas un second catalogue. Il devient, si
Tiptap exige encore cette forme, une projection sans store ni reconstruction
du corpus.

### 2. Un contrôleur de sélection commun

Le pilotage actuellement répété dans `ReferenceSearchDialog`, le menu `@`,
`GlobalSearchPalette`, `WorkspaceSearch`, `ResourcePicker` et `Autocomplete`
est extrait dans une seule autorité de sélection. Elle compose les briques
existantes :

- `SearchBoxState` pour la requête et les facettes ;
- `searchEntities` pour le filtrage et le classement local ;
- un fournisseur asynchrone compatible avec la recherche serveur des gros
  catalogues documentaires ;
- `folderSections` et `sectionItems` pour l’ordre visible et l’ordre clavier ;
- un index actif unique avec `Flèche haut`, `Flèche bas`, `Entrée` et `Échap` ;
- les états chargement, vide et erreur ;
- la fermeture et la restitution du focus après le choix.

### 3. Un contrat fourni par l’appelant

L’appelant configure le sélecteur sans en redéfinir le comportement. Le contrat
cible porte les éléments suivants :

| Entrée | Rôle |
| --- | --- |
| `source` | Corpus Hall existant ou fonction de recherche asynchrone pour une source distante. |
| `accepts(item)` | Prédicat typé qui limite les natures admissibles. |
| `excludes(item)` | Prédicat typé pour les éléments déjà sélectionnés ou interdits dans ce contexte. |
| `context` | Dossier ou affaire servant uniquement à prioriser les résultats proches. |
| `selectionMode` | Choix unique ou multiple. |
| `selectedIds` | Sélection courante, détenue par l’appelant. |
| `onPick(item)` | Effet métier après sélection : associer, ajouter, insérer ou ouvrir. |

L’appelant ne fournit pas un `renderItem` libre. Le type, l’icône, le titre, les
métadonnées, l’état actif et les identifiants de test restent produits par le
sélecteur commun. Une personnalisation libre des lignes recréerait précisément
les implémentations concurrentes que cette architecture doit retirer.

Les filtres et fonctions de contexte restent dans les composants métier parce
qu’eux seuls connaissent l’admissibilité locale. Ils ne doivent pas recalculer
la recherche ni copier un catalogue de types.

### 4. Une présentation commune, plusieurs enveloppes minces

Le même corps de sélecteur peut être placé :

- sous un champ dans un formulaire ;
- dans un popover déclenché par un bouton compact ;
- dans une modal lorsque le volume ou les facettes exigent plus d’espace ;
- près du curseur pour la commande `@`.

Ces enveloppes ne possèdent ni corpus, ni filtre, ni résultat, ni index clavier.
Elles gèrent uniquement l’ancrage, la taille et le retour du focus. Le
placement près du curseur choisit automatiquement le dessus ou le dessous
selon l’espace disponible, sans créer un menu d’insertion différent.

### 5. Un choix produit, puis une éventuelle configuration

Sélectionner un résultat termine toujours la phase de recherche. L’action
`onPick` est appelée une seule fois avec l’entité typée.

Si une ressource exige une configuration supplémentaire, par exemple la feuille
et la plage d’un tableur, cette configuration intervient après le choix sans
relancer un second sélecteur de ressources. Le bouton de l’éditeur et `@`
partagent le même appel et le même résultat.

## Application de la proposition aux parcours constatés

| Parcours | Configuration de l’appelant | Effet du choix |
| --- | --- | --- |
| Affaire d’un rendez-vous | `accepts: councilBusiness`, choix unique facultatif | rattacher ou détacher le rendez-vous |
| Participants d’un rendez-vous | `accepts: contact`, exclusion des participants existants, choix multiple | ajouter les contacts |
| Texte d’un rendez-vous | tous les types de référence admis par l’éditeur | insérer la référence ou la présentation prévue |
| Pièces d’une affaire | `accepts: resource`, exclusion des pièces déjà liées, priorité au dossier courant | associer la pièce sans la déplacer |
| Création d’un mandat ou compte | `accepts: contact`, prédicat d’admissibilité propre au formulaire | renseigner le contact |
| Commission | `accepts: contact`, exclusion des appartenances actives, choix multiple | préparer les appartenances |
| Déport, président ou secrétaire | `accepts: member`, admissibilité fournie par le parcours de séance | renseigner le membre |
| Inscription d’une affaire | `accepts: meeting`, admissibilité fournie par les capacités disponibles | choisir la séance |
| Recherche globale | tous les types | ouvrir l’entité choisie |

## Ordre de consolidation proposé

1. Extraire et tester le contrôleur commun à partir de `SearchBox`,
   `searchEntities`, `folderSections` et `SearchHitRow` sans changer les
   résultats actuels.
2. Faire consommer ce contrôleur par `ReferenceSearchDialog` et le menu `@`,
   puis supprimer leur pilotage clavier et leurs lignes concurrentes.
3. Raccorder le `MarkdownEditor` du calendrier au corpus canonique et vérifier
   que bouton et `@` proposent les mêmes résultats.
4. Remplacer le `Select` d’affaire et l’`Autocomplete` de contact du calendrier
   par le sélecteur commun configuré par leurs prédicats.
5. Migrer `ResourcePicker`, puis les autres sélections d’entités Hall.
6. Raccorder la recherche Légifrance au même contrôleur avec son fournisseur
   asynchrone, sans l’ajouter au corpus local Hall.
7. Supprimer `Autocomplete` et les implémentations locales devenues sans
   consommateur. Conserver `Select` pour les valeurs fermées.

Chaque étape doit retirer l’ancien propriétaire du comportement qu’elle
remplace. Une migration qui ajoute le sélecteur commun tout en conservant le
filtrage, le clavier ou le rendu local ne termine pas l’étape.

## Vérification attendue après une future réalisation

Les tests unitaires du contrôleur devront couvrir une seule fois le classement,
les exclusions, le contexte, le choix simple et multiple, le clavier, les états
et la recherche asynchrone.

Les tests Playwright devront ensuite vérifier les contrats visibles, avec les
mêmes identifiants fonctionnels sur chaque enveloppe :

- un champ de formulaire, le bouton de l’éditeur et `@` retournent les mêmes
  éléments pour un même corpus et un même filtre ;
- le calendrier propose ses affaires, ses contacts et toutes les références
  admises par l’éditeur ;
- une pièce de l’affaire courante est prioritaire sans exclure les autres ;
- le choix par clic ou par `Entrée` produit une seule action ;
- une éventuelle configuration intervient après le choix sans rouvrir la
  recherche ;
- `Échap` ferme le sélecteur et restitue le focus à l’appelant ;
- les résultats se placent au-dessus lorsque l’espace manque sous le champ ou
  le curseur.

Cette recette doit être reliée à une exigence fonctionnelle canonique avant le
début de la consolidation. Le catalogue, le backlog et les tests porteront le
même identifiant ; ils ne recopieront pas des formulations divergentes.
