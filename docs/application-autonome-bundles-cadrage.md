# Application autonome et échanges de bundles d’affaires

État du cadrage au 10 septembre 2026, sur la base du commit `a86f4f5`.
Ce document consigne la demande et les décisions encore ouvertes ; il ne
constitue pas une approbation de changement du modèle.

**Décision finale sur le moteur : the user retient PGlite pour le desktop
autonome.** Il accepte que les opérations attendent leur tour pour cet usage
individuel. L’intégration du moteur est autorisée ; les décisions métier des
bundles ci-dessous restent ouvertes. Voir le [guide desktop](desktop.md).

## Intentions confirmées

- Hall est installé sur l’ordinateur de chaque conseiller, avec des données locales.
- Les plateformes cibles confirmées sont Windows et macOS. Les architectures
  et versions minimales restent à préciser ; Linux est hors périmètre cible.
- Deux modes sont conservés : desktop autonome avec moteur PostgreSQL embarqué,
  et accès au Hall hébergé sur le serveur. Pour ce dernier, the user décrit
  une petite coquille WebView donnant une expérience d’application desktop,
  sans moteur ni base locale ; le navigateur web existant reste utilisable.
  Aucune PWA ni nouvelle interface d’installation n’est décidée.
- Le prototype PostgreSQL natif isolé est autorisé. Le choix final du moteur
  reste motivé par les preuves et la comparaison ; la dictée « PG-like » ne
  constitue pas une sélection de PGlite.
- the user a ensuite autorisé le prototype PGlite et précisé que ces
  applications individuelles ne sont pas des applications de production.
  La simplicité de distribution et les limitations concrètes guident l’arbitrage.
- Des affaires sont exportées en bundles puis importées dans le workspace.
- Le classement initial utilise un répertoire virtuel associé au conseiller
  expéditeur du bundle, avec un slug de son nom et prénom. Cette association
  à l’expéditeur est une décision explicite du propriétaire.
- Les éléments peuvent ensuite être déplacés ou reclassés dans le workspace général.
- Le répertoire d’import est transitoire. Le vider supprime seulement ce qui
  y reste ; les éléments déjà déplacés ou reclassés ailleurs sont conservés.
- La suppression du répertoire et le devenir du suivi d’import restent à préciser.
- Réimporter un élément identique ne crée pas de doublon.
- Lorsque deux éléments en conflit diffèrent, l’utilisateur choisit lequel conserver :
  aucun écrasement automatique.

Le slug et le choix explicite en cas de conflit ne définissent pas encore
l’identité des éléments ni une règle de rapprochement entre homonymes.

## Constat dans le code

L’[entrée Electron](../packages/desktop/src/main.ts) existe. Sans connexion
distante configurée, elle démarre le serveur HTTP sur une adresse de boucle
locale et un port disponible, avec `hall.sqlite` dans le répertoire utilisateur
de l’application. Elle sait également ouvrir un serveur partagé. Ce constat
provient d’une lecture du code, pas d’un essai d’installation.

La [configuration Forge](../packages/desktop/forge.config.mjs) déclare des
formats Windows, macOS et Linux. Leur présence ne prouve pas qu’un installateur
actuel fonctionne sur les ordinateurs des conseillers.

Le [conteneur serveur](../packages/server/src/core/container.ts) ne fournit les
clients des ressources, de l’annuaire et du conseil que dans sa branche
PostgreSQL. Le [service documentaire](../packages/server/src/services/documentaryResourceService.ts)
consomme ce client des ressources. Le démarrage SQLite déclaré par Electron
ne constitue donc pas une implémentation autonome du workspace actuel.
La stratégie de stockage local doit être arrêtée avant de présenter le
packaging comme une solution utilisable.

Le [modèle SQL des affaires](../packages/postgres/sql/workspace/010-council-business-workspace.sql)
relie une affaire à son dossier et à son rapport, et porte des associations vers
des ressources de travail. L’identité de l’affaire ne dépend pas uniquement de
son chemin. Le déplacement de ressources existe dans le service documentaire.
Un export d’affaire doit donc préciser quelles relations et quelles dépendances
il transporte ; copier les fichiers d’un dossier ne définit pas ce contrat.

Aucune commande de bundle d’affaires n’a été trouvée dans le
[contrat Siren](../packages/api-contract/src/siren.ts).

## Décisions nécessaires avant implémentation

1. **Postes et stockage local.** Windows et macOS sont confirmés. Quelles
   architectures et versions minimales faut-il prendre en charge ? Faut-il embarquer un moteur compatible avec les autorités SQL
   PostgreSQL existantes, ou approuver un autre chantier de persistance locale ?
   L’[étude technique du stockage embarqué](stockage-embarque-windows-macos.md)
   compare les preuves natives et PGlite. PGlite est désormais retenu par
   the user et intégré au desktop autonome.
2. **Contenu du bundle.** Quelles données constituent l’affaire échangée : rapport,
   pièces associées, projets, références et images incorporées, autres objets liés ?
   Quels éléments doivent rester consultables et lesquels doivent être éditables ?
3. **Rapprochement.** Le conseiller associé est l’expéditeur, décision confirmée.
   Qu’est-ce qui désigne
   deux versions du même élément, notamment entre deux installations ? Le slug
   demandé reste acquis, sans suffixe d’homonyme ajouté par défaut.
4. **Réimport après reclassement.** Le réimport doit-il retrouver l’élément
   déplacé et préserver son classement ? Comment traiter un élément modifié
   localement ? Le choix explicite entre versions différentes reste acquis,
   mais la détection de leur identité reste à définir.
5. **Supprimer et conserver le suivi.** Vider concerne uniquement ce qui reste
   dans le répertoire, sans supprimer les éléments déplacés ailleurs, décision
   confirmée. Supprimer retire-t-il aussi le répertoire ou le suivi de l’import ?
   Un suivi persiste-t-il après vidage ? Cette décision sur le vidage ne définit
   pas comment un réimport retrouve un élément déplacé.

## Autorités à conserver

Après décision du propriétaire sur les points concernés, le contrat du bundle et
ses données externes devront être validés à leur frontière ; l’import devra
passer par le serveur et ses opérations transactionnelles. Les actions HTTP
devront compléter Siren et sa politique d’autorisation. L’interface devra
composer la TreeView et les primitives existantes. Ces responsabilités suivent
la [carte d’architecture](architecture.md).

Aucun schéma, contrainte, comportement d’import ou choix d’interface n’est
introduit par ce cadrage. Le seed de démonstration Alésia est hors périmètre.
