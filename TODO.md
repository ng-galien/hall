# Backlog Hall

Ce document ordonne les prochains chantiers. Les détails d’implémentation doivent rester cohérents avec le langage ubiquitaire défini dans `AGENTS.md` et avec les capacités Siren exposées par le serveur.

## Acquis récents

- Le domaine distingue désormais le sujet durable (`CouncilMatter`), le point inscrit à une séance (`AgendaItem`), l’approbation d’un procès-verbal et la question diverse.
- Le cycle de vie appartient au point d’ordre du jour, à la délibération et à la séance ; le sujet reste un contenu de travail durable.
- L’ordre du jour est verrouillé côté serveur : procès-verbal précédent unique, sujets soumis au vote, sujets sans vote, puis questions diverses.
- Les commissions, leurs appartenances datées et leurs rôles existent dans le backend.
- Les permissions, l’audit et les actions hypermédia Siren constituent la source des capacités du frontend.
- Les ressources documentaires distinguent les textes et les fichiers, avec chemins de classement, tags, formats et pipeline d’aperçu.
- Le moteur de recherche partagé, l’éditeur Tiptap et le paquet isomorphe `@hall/templating` fournissent les fondations communes.
- Les règles Code Moniker sont réparties entre le socle et les fragments propres aux packages.

## 1 — Administration du conseil — terminé

Réaligner le frontend sur les capacités déjà disponibles dans le backend.

- Créer une liste et une fiche éditable pour chaque membre du conseil.
- Créer une liste et une fiche éditable pour chaque commission.
- Ajouter, modifier et terminer une appartenance à une commission avec son rôle et ses dates.
- Naviguer facilement entre une commission et ses membres grâce à des liens, badges et compteurs.
- Afficher les commissions auxquelles appartient un membre depuis sa fiche.
- N’exposer une action d’édition que lorsque la représentation Siren l’autorise.
- Compléter les données de démonstration et les tests d’intégration de ce parcours.
- Conserver `CouncilMember` comme notion métier ; ne créer une entité générique `Contact` que si des contacts non élus deviennent réellement nécessaires.

Critère de sortie : l’administration peut gérer les membres, les commissions et leurs appartenances sans appel manuel à l’API.

## 2 — Préparation automatique des séances — terminé

- Identifier automatiquement la séance précédente dans la chronologie du conseil.
- Générer l’approbation de son procès-verbal à la clôture et la provisionner pour la séance suivante.
- Étudier la création automatique d’une prochaine séance en brouillon, sans la programmer prématurément.
- Reporter automatiquement les points ajournés ou non examinés lorsque la règle métier le permet.
- Présenter clairement les éléments manquants avant la programmation : procès-verbal, ordre du jour, convocation et autres pièces nécessaires.
- Garantir que les automatismes passent par les mêmes commandes et invariants serveur que les actions manuelles.

Critère de sortie : après la clôture d’une séance, la préparation de la suivante est amorcée sans créer de doublon ni contourner les règles d’ordre du jour.

## 3 — Éditeur et fidélité documentaire

- Réintroduire l’insertion d’images dans Tiptap à partir d’une ressource existante ou d’un import autorisé.
- Conserver un lien stable entre l’image insérée et la ressource documentaire.
- Stabiliser les tables : création, collage Excel ou Word, fusion et scission, alignement, largeur des colonnes et lignes de total.
- Garantir un aller-retour stable entre le contenu édité et sa forme sérialisée.
- Partager la feuille de style entre l’éditeur, l’aperçu HTML et le PDF Chromium.
- Tester la pagination, les sauts de page, les images, les tableaux, les en-têtes et les pieds de page.
- Rebrancher sujets, séances et délibérations comme sources de références dans l’éditeur.
- Trancher le souligné `++texte++` : prise en charge par la grammaire commune ou retrait du bouton.
- Ajouter progressivement le menu `/`, la poignée de déplacement des blocs, la typographie française et les encadrés `:::note`.

Critère de sortie : un document comportant texte, références, image et tableau produit un aperçu et un PDF fidèles.

## 4 — Modèles, exports et synchronisation disque

- Fournir des modèles configurables pour :
  - le pouvoir imprimé ;
  - la liste des délibérations ;
  - la convocation ;
  - la délibération ;
  - le sujet ou rapport présenté au conseil ;
  - le procès-verbal et les autres documents de séance retenus.
- Configurer les modèles, leurs en-têtes, pieds de page et styles sans les coder dans l’application.
- Définir une nomenclature d’export et un template de chemin de dossier.
- Construire l’arborescence miroir par séance à partir de sa date, son numéro et son slug.
- Générer les PDF, assembler les pièces jointes nécessaires et préparer les scénarios de message Outlook.
- Écrire les exports de manière atomique, traçable et régénérable sans multiplier les copies ambiguës.
- Relier chaque fichier produit à sa séance, son modèle et son événement de génération.
- Stabiliser le test Chromium de génération PDF qui échoue encore de manière opérationnelle.

Critère de sortie : les documents obligatoires d’une séance peuvent être générés puis retrouvés sur le disque sans manipulation manuelle de fichiers.

## 5 — Ergonomie de l’espace de travail

- Conserver le classement simple par `folderPath` ; ne créer une entité dossier que si les dossiers vides, leur renommage ou leur ordre propre deviennent indispensables.
- Fluidifier la navigation entre chemin, ressources, sujet, délibération et occurrences en séance.
- Réduire les changements de page et conserver le contexte de travail dans l’établi.
- Améliorer la sélection des pièces associées à un sujet, en proposant d’abord celles du même chemin sans imposer cette proximité.
- Consolider les tags, les filtres, les épingles, les badges de rattachement et la recherche contextuelle.
- Basculer les listes de séances, délibérations et membres sur le moteur de recherche partagé.
- Permettre de définir une date limite sur un sujet du conseil.

Critère de sortie : depuis un dossier, l’utilisateur peut constituer un sujet, lui associer ses pièces et comprendre immédiatement son devenir au conseil.

## Backlog transversal conservé

### Mandatures et historique du conseil — différé

Le fonctionnement de la mandature actuellement en exercice reste prioritaire. Ne pas bloquer l’alpha sur la gestion de plusieurs conseils municipaux successifs.

- Introduire ultérieurement `CouncilTerm`, affiché « Mandature » dans l’IHM.
- Distinguer la date du tour ayant élu le conseil au complet, la date de la séance d’installation et la date de fin effective.
- Conserver l’effectif légal attendu de la mandature.
- Rattacher les membres, les commissions et les séances à leur mandature, sans confondre les dates collectives avec les dates individuelles d’exercice d’un membre.
- Garantir qu’une commission et ses appartenances relèvent de la même mandature.
- Ajouter une vue complémentaire de la mandature actuelle et, ensuite seulement, la navigation vers les mandatures précédentes.

Critère de lancement : le parcours membres/commissions et le déroulé complet d’une séance fonctionnent pour le conseil actuellement en exercice.

### Convocations et règles juridiques

- Revalider avec les textes et la pratique communale la date de référence d’une convocation, le calcul des jours francs et le fuseau horaire applicable.
- Revalider la seconde convocation après défaut de quorum : preuve d’envoi, chronologie et délai avant la nouvelle réunion.
- Modéliser les preuves d’envoi et de publication ainsi que les variantes liées à la population et à l’urgence lorsque le parcours sera stabilisé.

Ces points restent au backlog tant qu’ils ne sont pas nécessaires à l’alpha. Le serveur doit néanmoins empêcher les chronologies manifestement incohérentes.

### Mode présentation

- Recetter tout le déroulé de séance sur un vidéoprojecteur professionnel en affichage étendu, avec 1280 × 1024 comme résolution de référence.
- Vérifier la lisibilité à distance, le scroll de l’appel, de la timeline, du contenu et du scrutin, ainsi que l’accès permanent aux actions de conduite.
- Recenser puis corriger les erreurs fonctionnelles restantes du déroulé complet de démonstration.

### Recherche et références

- Passer le contexte du dossier courant à toutes les recherches de références.
- Rendre les références métier cliquables de manière homogène dans les vues de l’application.
- Préserver les directives inconnues et continuer d’utiliser `@hall/templating` comme grammaire unique.
