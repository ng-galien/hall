# Carte d’architecture opérationnelle

Cette carte indique l’autorité qui doit recevoir chaque nature de changement. Elle complète les [principes de code](principes-code.md) : le type fermé décrit les cas, le module d’autorité porte la politique, et les adaptateurs restent aux frontières.

## Autorités et dépendances

| Responsabilité | Autorité canonique | Ce qui y entre | Ce qui n’y entre pas |
| --- | --- | --- | --- |
| Contrats de données partagés entre PostgreSQL et HTTP | `packages/contracts/src/` | Unions et schémas purs des convocations, échéances et candidats à l’ordre du jour ; une autorité commune sans dépendance à Hall | Siren, HTTP, SQL, politiques ou rendu ; imports vers domain ou les adaptateurs |
| Vocabulaire métier fermé | `packages/domain/src/model.ts` et `schemas.ts` | Unions discriminées, listes exhaustives, validation des données externes | HTTP, SQL, React, libellés français |
| Dispatch et politique métier | `packages/domain/src/match.ts` et les modules `*Policy.ts` proches du modèle | `matchDiscriminated`, `matchLiteral`, `matchVariant`, `defineExhaustiveLiterals`, invariants purs et projections communes | `switch` concurrents dans les routes, services ou composants |
| Cycles de vie PostgreSQL | `packages/postgres/sql/council/` | Invariants structurels, transitions transactionnelles, clôture de séance et brouillon de procès-verbal ; exigences numérotées et acceptance pgTAP | Second automate TypeScript pour les mêmes transitions, permissions HTTP, navigation client |
| Politiques historiques encore consommées | `packages/domain/src/state-machines/` | Politiques qui ne sont pas encore remplacées dans leur parcours appelant | Nouveau cycle du procès-verbal ou duplication des invariants PostgreSQL |
| Contrat HTTP partagé | `packages/api-contract/src/`, dont `security.ts` pour `apiPermissions` | Siren, Problem Details, noms d’action, rôles et permissions transportés | Règles d’autorisation selon l’état, implémentation serveur ou client |
| Commandes et autorisation | `packages/server/src/api/apiCommandPolicy.ts`, `apiCommandAuthorization.ts` et `apiCommandResolution.ts` | Politique exhaustive par `ApiActionName`, contrôle des permissions, identité d’audit d’une mutation | Catalogues partiels dans les routes ou le client |
| Capacités hypermédia | `packages/server/src/api/sirenActionPolicy.ts`, `sirenEntityIdentity.ts` et `sirenRepresentation.ts` | Actions permises par l’état courant, identité et représentation Siren | Déduction des capacités à partir du rôle dans le client |
| Cas d’usage | `packages/server/src/services/` | Orchestration transactionnelle des politiques, repositories et fournisseurs | SQL, détails Express, second catalogue de types |
| Contrats et décodage persistants | `packages/server/src/repositories/contracts.ts`, `row.ts`, `resourceRowMapping.ts`, `evidenceMapping.ts` et les repositories | Interfaces de persistance, validation des lignes et discriminants stockés | Données de base non validées dans les services ou routes |
| Ressources PostgreSQL | `packages/postgres/` et `packages/server/src/infrastructure/postgres/resourcesClient.ts` | Invariants SQL, opérations nommées, projections validées et client serveur fin | Express, politique d’autorisation, agrégats métier ou contrat client legacy |
| Préparation des séances | `packages/postgres/sql/workspace/040-meeting-notices.sql`, `045-prepared-council-subjects.sql`, `council/019a-agenda-freeze.sql` et `069-notice-deadline.sql` | Insertion atomique commune, gel et réouverture, versions de convocation, échéance calculée en SQL et PDF courant exigé au démarrage | Calcul de dates dans le client, second PDF d’ordre du jour, preuve d’envoi déduite d’un fichier |
| Texte propre des projets de délibération | `packages/postgres/sql/workspace/025-decision-proposal-workspace.sql`, `026-proposal-text-protection.sql` et `027-agenda-subject-text-editability.sql` | Propriété permanente dans l’affaire ; titre et contenu temporairement verrouillés pendant la conduite de la séance, puis durablement pour les seuls AgendaItems commencés, tandis que le chemin suit le reclassement du dossier parent (HALL-FR-WSP-280), capacités SQL | Mutation du rapport d’affaire pour éditer un projet, verrou déduit seulement du résultat positif |
| Procès-verbaux | `packages/postgres/sql/council/061-minutes.sql`, `073-minutes-api.sql`, `packages/server/src/services/minutesService.ts` et `minutesDocument.ts` | Brouillon automatique à la clôture, faits figés, texte corrigible avant génération, PDF immuable référencé par l’approbation ; rendu via `DocumentRenderer` | Ressource du workspace, rapport libre de `CouncilBusiness`, signatures ou publication simulées |
| Adaptateurs de base historiques | `packages/server/src/infrastructure/database/` et `postgres/` | Exécution PostgreSQL des domaines qui ne sont pas encore raccordés à `@hall/postgres` | Nouvelle persistance documentaire ou décisions d’autorisation |
| Composition | `packages/server/src/core/container.ts` et `core/localServer.ts` | Construction et injection des adaptateurs ; cycle du serveur local et de son moteur PGlite | Logique métier ou choix selon une variante |
| Signaux temps réel | `packages/server/src/realtime/` et le montage dans `packages/server/src/server.ts` | Transport WebSocket partagé, diffusion après commande réussie et recontrôle du droit de lecture à chaque émission | Nouvel état métier, autorisation décidée par le client ou signal annoncé avant le succès de la commande |
| Références et ressources | `packages/api-contract/src/resources.ts`, `packages/templating/src/grammar.ts`, `packages/templating/src/resourcePresentation.ts`, `packages/server/src/services/referenceEntityResolver.ts`, `documentaryResourceService.ts` et `packages/postgres/` | `ReferenceEntityKind`, `ResourceKind`, `ResourcePresentationKind`, compatibilité des présentations, résolution exhaustive, opérations nommées et propriété des actifs documentaires | Dispatch dupliqué dans le rendu, les routes ou l’interface |
| Grammaire riche | `packages/templating/src/` | Parsing, validation, collecte et sérialisation des directives | Parseur concurrent dans le client ou le serveur |
| Présentation et interaction | `packages/client/src/features/` et `pages/` | Présentation métier, appels HTTP et composition d’écran | Nouvelle règle métier ou reconstruction d’une permission |
| Intégration de l’éditeur | `packages/client/src/components/editor/` et les politiques associées dans `packages/client/src/features/` | Adaptation Tiptap, références Hall, ressources intégrées et interaction métier | Nouvelle grammaire riche, permission serveur ou second catalogue de types |
| Présentation des ressources | `packages/client/src/features/resources/resourceEditorPolicy.ts` et `packages/client/src/features/documents/DocumentaryResourceGlyph.tsx` | Politique d’édition, icône et tonalité par nature de ressource | Second catalogue local dans un écran, un overlay ou le rendu export |
| Primitives techniques | `packages/client/src/components/ui/` | Interaction générique pilotée par propriétés | Import du domaine, des stores, services, hooks ou pages |

Le serveur est l’unique autorité d’écriture. Le client consomme le contrat Siren sur HTTP. Ni le client ni Electron n’importent l’implémentation serveur ou n’ouvrent la base directement.

Le bus de signaux temps réel actuel vit dans un seul processus serveur. Les clients relisent les projections HTTP et Siren après un signal ou une reconnexion ; les signaux ne sont pas un historique durable. Une topologie Hall à plusieurs processus nécessitera un relais partagé avant de garantir la diffusion entre instances.

Le desktop autonome appelle l’entrée publique `startLocalHttpServer` de
`@hall/server`. `core/localServer.ts` compose le moteur persistant de
`infrastructure/database/pgliteRuntime.ts`, son pont PostgreSQL local et le
serveur HTTP existant. Le manifeste SQL reste identique. Le runtime local
possède un pool `pg` partagé d’une connexion, prêté aux deux adaptateurs ; ils
ne le ferment pas eux-mêmes. Cette réservation sérialise les transactions et
les lectures paramétrées avant le pont, évitant leur entrelacement au niveau
du protocole. Les pools du serveur PostgreSQL connecté restent inchangés.
L’arrêt ferme HTTP, puis le pool partagé, le pont et PGlite. Le mode connecté
ouvre directement le serveur distant sans moteur
local. Electron ne manipule ni SQL ni objets PGlite.

`packages/domain/src/match.ts` est la petite bibliothèque type-safe commune. Ses handlers sont exhaustifs : ajouter une variante à une union ou à un littéral fermé doit rendre chaque dispatch incomplet invalide à la compilation. Le cast interne nécessaire à la corrélation TypeScript reste confiné à cette bibliothèque et ne se propage ni dans les matchers métier spécialisés, ni dans leurs consommateurs.

## Recherche et sélection de ressources

`HALL-FR-SRC-010`, `HALL-FR-SRC-020` et `HALL-FR-SRC-030` définissent les comportements dans le catalogue canonique.

- `features/search/useResourceSearch.ts` possède la session de recherche : scope de l’appelant, critères, pagination, résultats et réponses périmées. Le scope précise les types et les identifiants admissibles/exclus ; le contexte ne restreint pas le corpus.
- `components/search/ResourceSearch.tsx` et `SearchBox.tsx` possèdent les résultats, le clavier et le choix des filtres par catégorie. Ils composent `ui/search-result-row.tsx` et `ui/disclosure.tsx` avec les styles Hall existants.
- `ResourceSearchField` et `EntitySelect` adaptent les champs ; `ReferenceSearchDialog` et l’adaptateur Tiptap adaptent la modale et le curseur. L’appelant conserve ses critères d’admissibilité et l’effet métier du choix, sans fournir de rendu de résultat ni refaire le classement.
- `@hall/templating` (`preferredResourcePresentation`) possède le choix de présentation à l’insertion. La projection de recherche lui transmet uniquement la nature de la ressource et son type de fichier ; elle ne redéfinit pas cette politique. Une absence de présentation en bloc utilise le nœud de référence existant.
- Le fragment Code Moniker du client impose cet appel dans `resourceMentionable` et limite les imports de cette projection depuis templating à cette décision publique. `scripts/check-search-architecture.test.mjs`, exécuté par `npm run check:architecture`, vérifie un appel conforme et deux contre-exemples : une politique locale remplaçant cet appel, et le retour de l'ancienne politique typée même en conservant l'appel. Ces contrôles protègent cette frontière précise ; ils ne détectent pas toute duplication sémantique possible dans le logiciel.
- `components/ui/loading-indicator.tsx` porte l’indicateur de chargement commun et réutilise la classe `spinner` de `styles/components.css`. Les appelants fournissent le libellé et l’état de chargement ; ils ne redéfinissent pas son animation ou son style.
- `lib/search.ts` classe les noms des entités déjà chargées. `hall_api.search_resources` applique le même principe aux titres documentaires, avec scope et exclusions avant comptage/pagination. Aucun contenu documentaire n’est indexé ou extrait pour cette recherche.


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

`@hall/contracts` contient uniquement les nouvelles formes de données partagées entre stockage et HTTP. Ses consommateurs importent cette autorité directement ; `api-contract` les expose sur sa frontière publique sans importer le domaine. La compilation racine construit ce package avant ses consommateurs. La directive `::meeting-notice` appartient à la grammaire de templating ; `meetingNoticeService` orchestre le modèle existant, le rendu PDF persisté et la préparation EML avec sa pièce jointe, sans envoi.

Le numéro présenté d’un point est `agendaNumber`, validé par `@hall/contracts` ;
`position` reste une clé d’ordre technique et peut contenir des trous. L’autorité
`hall.council_agenda_presentation_numbers` dans `council/059-meeting-snapshots.sql`
numérote continûment les points présentés, depuis l’instantané de clôture lorsque
la séance est close. Les projections AgendaItem, le gel de convocation et les faits
du PV consomment cette autorité ; les interfaces et les rendus documentaires lisent
`agendaNumber` sans recalculer le rang. Une occurrence déprogrammée hors de la liste
présentée expose `null`, un point ajourné reste dans la liste présentée.

L’ajout en séance passe par `meeting.add-open-question` et
`hall_api.add_open_question`, distincts de l’inscription préparatoire. La commande
ajoute une `OpenQuestion` en dernière position sous verrou de séance, sans toucher
au gel de convocation. `council_agenda_addition` conserve la séance d’origine,
l’occurrence, l’heure et l’acteur ; cette preuve est immuable et reste attachée à
l’origine en cas de report. `introducedAt` est projeté sur le point et sur le PV
depuis cette relation, sans modifier les faits ou PDF précédemment conservés.

La copie des faits d’une proposition confirmée appartient à
`workspace/050-council-decision-facts.sql`. Le trigger du scrutin conserve le
texte soumis, les identités, les présences, le quorum et les déports à cet instant,
avec les votes nominatifs publics ou les seuls totaux secrets. Le contrat partagé
`contracts/src/councilDecisionDocument.ts` distingue ces faits de la rédaction
documentaire. `workspace/051-council-decisions.sql` crée un brouillon pour chaque
proposition confirmée, adoptée ou rejetée, et protège la rédaction versionnée puis
le PDF figé. L’approbation du PV reste indépendante. `CouncilDecisionClient` et
`PostgresCouncilDecisions` remplacent le repository historique sur les routes et
les références documentaires des délibérations. `councilDecisionService` compose
les sections `facts`, `content` et `result` de `::council-decision` via le moteur
commun de templates et de PDF. Le gel ne publie pas et n’attribue pas de numéro
métier définitif ; `publicationNumber` reste nul dans cette tranche. Le
`decisionNumber` des faits exprime uniquement l’ordre des délibérations de la
séance, distinct du rang de tous les points à l’ordre du jour.

`workspace/052-council-decision-recovery.sql` porte la reprise contrôlée des
scrutins antérieurs à cette copie : elle exige le snapshot de clôture, le texte
scellé et la prévisualisation confirmée, puis réutilise la création du brouillon
de `051`. Elle conserve la provenance, refuse les preuves manquantes et retourne
la décision existante sans écraser sa rédaction. Cette autorité interne ne
modifie ni les snapshots ni le procès-verbal et n’expose aucune route HTTP.

`workspace/053-decision-documentary-context.sql` complète la lecture documentaire
avec la commune et le fuseau retenus dans la convocation antérieure à la
confirmation, et l’observation de quorum/présences correspondant à l’ouverture.
Cette projection ne réécrit aucune preuve. La qualité du président est copiée
lors des nouvelles confirmations ; une qualité historique non observée reste
nulle. Le rendu ne consulte pas l’annuaire ou les paramètres actuels pour
reconstituer ces faits, et distingue les présents à l’ouverture des votants.

Les préconditions d’entrée et d’ouverture sont projetées dans
`CouncilMeeting.entryBlockers` et `openingBlockers`, avec le vocabulaire fermé de
`contracts/src/meetingEntry.ts`. `council/019a-agenda-freeze.sql` énumère la
préparation manquante et partage cette autorité avec la garde du démarrage ;
`070-council-meeting-api.sql` complète les projections selon le cycle de séance
et l’heure programmée. Siren consomme `openingBlockers` pour annoncer
`meeting.record-opening`, puis applique les permissions HTTP. Le client traduit
les raisons reçues, sans recalculer la préparation. L’heure future bloque
l’ouverture formelle, pas l’entrée dans l’appel ; les déclarations et officiers
sont fournis et validés dans la commande atomique d’ouverture. Un quorum
insuffisant ne constitue pas un blocage de cette commande.

La création ou l’import d’une ressource de travail peut porter le contexte
optionnel `councilBusinessId` sur les commandes `resource.create`,
`resource.create-document` et `resource.import-spreadsheet`. Le client PostgreSQL
exécute la création et `hall_api.associate_council_business_resource` dans la
même transaction sérialisable, puis conserve l’affaire dans les détails de
l’audit de création. Un refus du rattachement annule aussi la ressource et ses
éventuels objets binaires. Siren expose ces commandes existantes sur l’affaire
avec son identifiant comme contexte. Le chemin reste une donnée de classement ;
il ne produit jamais une association implicite. Les dossiers ne sont pas des
ressources de travail rattachables. Les projets et questions autonomes utilisent
la commande existante `council-business.create-prepared-subject`, indépendamment
de toute inscription à l’ordre du jour.

La navigation documentaire d’une séance appartient à
`workspace/060-meeting-documents.sql` et au contrat pur
`contracts/src/meetingDocuments.ts`. Elle dérive ses groupes des relations
existantes, sans dossier persistant, déplacement, copie supplémentaire ou
commande documentaire générique. La dernière observation conservée (clôture,
sinon ouverture) fournit les relations et les contenus historiques ; en
préparation, la lecture annonce explicitement la source courante. Une pièce
référencée mais absente de l’observation reste indisponible, sans remplacement
par la ressource actuelle. Les fichiers et images sont lus dans les octets
conservés. `meetingDocumentsRepresentation.ts` expose les groupes et leurs liens
Siren, réutilise les destinations canoniques des convocations, délibérations et
procès-verbaux, et conserve les seules actions natives de la séance. Ces lectures
n’altèrent aucun cycle de vie ni aucune règle d’intégrité.

## Adaptateur MCP du workspace

`packages/mcp/src/` expose le protocole MCP et adapte ses outils au contrat HTTP
Siren de Hall. Il dépend uniquement du contrat API et du SDK de transport, jamais
des services ni de la base. `actions.ts` nomme le sous-ensemble documentaire
exposé et réutilise ses schémas existants ; les capacités restent fournies par le
serveur. `application.ts` monte `/mcp` hors de l’enveloppe Siren, après les mêmes
contrôles de session et d’origine. Chaque requête utilise sa propre session et
réexécute les commandes par l’API locale, conservant autorisation et audit.
Voir [la connexion et les limites MCP](workspace-mcp.md).

L’annuaire PostgreSQL porte aussi les représentations extérieures dans
`directory/030-contact-representations.sql`. `CouncilDelegation` décrit
l’organisme représenté ; `DelegationMembership` rattache un contact avec une
qualité `primary` ou `alternate` et des dates. Les contrats communs se trouvent
dans `contracts/src/delegation.ts`. Commissions et délégations ont des
appartenances de contacts indépendantes des mandats élus : terminer un mandat
ne termine pas ces appartenances. Les commissions conservent leurs qualités
propres, distinctes de celles des représentants extérieurs.

`CouncilMember.rank` exprime un rang global facultatif, entier non négatif,
distinct du rôle. PostgreSQL impose l’unicité de chaque rang renseigné dans
une même mandature, tous rôles et mandats terminés compris. Un rang inconnu
reste nul. Les schémas ne constituent pas une validation juridique de la
composition d’une commission ou d’un organisme extérieur. Cette évolution
vise une installation neuve ; aucune migration ni reprise des données
existantes n’est exécutée par ce changement.
