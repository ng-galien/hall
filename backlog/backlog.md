# Feuille de route Hall

Cette feuille de route ordonne les travaux par valeur produit et par dépendance. Elle respecte le langage ubiquitaire de `AGENTS.md` et les capacités Siren exposées par le serveur.

## Lecture

- [x] Acquis présent et vérifié dans le checkout
- [ ] Travail restant
- `[BACK]` : domaine, API, serveur, SQL ou génération documentaire
- `[FRONT]` : parcours, composants React, accessibilité ou présentation
- `[FULL]` : contrat backend puis intégration frontend
- `[OPS]` : environnement, qualité et outillage

Un chantier n'est coché que lorsque son critère de sortie est satisfait. Un simple prototype ou un test isolé ne suffit pas.

## P0 : consolider l'alpha démontrable

### Stabiliser le lot éditeur et documents

Objectif : figer le travail actuellement non committé avant d'ajouter une nouvelle fonction.

- [x] `[BACK]` Distinguer les documents durables des `editorAsset` appartenant à un contenu.
- [x] `[BACK]` Créer, rechercher, promouvoir et purger les `editorAsset` par les commandes serveur.
- [x] `[BACK]` Produire l'aperçu PDF autoritaire avec Chromium sans persistance parasite.
- [x] `[BACK]` Accepter les tables riches Tiptap dans le rendu sécurisé et le PDF.
- [x] `[FRONT]` Insérer une image archivée ou importée, conserver son identifiant, son ratio, son alignement et sa largeur.
- [x] `[FRONT]` Conserver le bouton Code et retirer le souligné non pris en charge par la grammaire commune.
- [x] `[FRONT]` Couvrir l'Editor Lab avec sa recette Playwright ciblée. Ne pas élargir cette recette aux autres parcours.
- [ ] `[FRONT]` Rendre l'action d'ouverture d'une image clairement visible et accessible dans l'éditeur compact.
- [ ] `[FULL]` Vérifier que l'image, le tableau et les retours à la ligne sont identiques dans l'éditeur, l'aperçu HTML et le PDF.
- [ ] `[FULL]` Valider la pagination, les sauts de page, les en-têtes et les pieds de page sur un document de démonstration réaliste.
- [x] `[OPS]` Faire une revue finale du diff éditeur et documents, puis isoler ce lot dans un commit cohérent.

Critère de sortie : un document comprenant texte, références, image et tableau est sauvegardé, rechargé, prévisualisé et exporté en PDF sans perte.

### Corriger la cohérence visuelle et linguistique

- [ ] `[FRONT]` Traduire complètement l'écran d'authentification et ne plus afficher les codes d'erreur techniques.
- [ ] `[FRONT]` Restaurer une hiérarchie typographique stable pour les titres de page.
- [ ] `[FRONT]` Remplacer les chaînes visibles en dur et supprimer les clés de traduction mortes.
- [ ] `[FRONT]` Exposer la locale et les outils `Intl` depuis un seul contexte i18n.
- [ ] `[FRONT]` Rationaliser les séparateurs, nombres, pluriels et formats de date sans logique locale dispersée.
- [ ] `[FRONT]` Aligner les écrans sur les tokens CSS et supprimer les intentions visuelles sans règle associée.
- [ ] `[FRONT]` Garder les contrôles d'image et de table petits, discrets, accessibles et cohérents avec les autres contrôles Hall.
- [ ] `[FRONT]` Retirer les quadratins des chaînes et commentaires couverts par la règle Code Moniker.
- [ ] `[OPS]` Conserver les tests statiques de parité i18n et de résolution des tokens.

Critère de sortie : les principaux écrans utilisent la même hiérarchie, les mêmes tokens et la même infrastructure de traduction, sans code d'erreur brut ni quadratin.

### Garantir la démonstration complète d'une séance

Le déroulement de séance est conservé. Ce lot vise sa fiabilité, pas son redesign.

- [ ] `[BACK]` Rejouer les invariants d'ouverture, de présence, de quorum, de pouvoir, de vote et de clôture sur la base de démonstration.
- [ ] `[FRONT]` Vérifier manuellement le parcours complet, de l'appel des membres à la clôture de la séance.
- [ ] `[FRONT]` Vérifier le scroll de l'appel, de la timeline, du contenu et du scrutin.
- [ ] `[FRONT]` Recetter le mode présentation en affichage étendu à 1280 x 1024.
- [ ] `[FRONT]` Garantir la lisibilité à distance et l'accès permanent aux actions de conduite.
- [ ] `[FULL]` Corriger uniquement les blocages qui empêchent la démonstration de bout en bout.
- [ ] `[OPS]` Documenter une recette courte et reproductible de la démonstration, sans lancer une suite Playwright globale.

Critère de sortie : la séance de démonstration peut être conduite de bout en bout sans erreur bloquante, avec un affichage exploitable sur vidéoprojecteur.

### Finaliser les garde-fous Code Moniker

- [x] `[OPS]` Déclarer une règle de niveau erreur interdisant les quadratins dans les commentaires et portées de code indexées.
- [x] `[OPS]` Déclarer une règle de niveau erreur interdisant les commentaires dans les fonctions et méthodes.
- [x] `[OPS]` Générer les hooks projet pour Claude et Codex.
- [ ] `[OPS]` Approuver le hook projet dans les réglages de l'application Codex.
- [x] `[OPS]` Aligner le MCP Codex installé sur la version 0.9.2 du binaire.
- [x] `[OPS]` Corriger les violations existantes sans modifier le sens des textes métier.
- [x] `[OPS]` Rejouer `code-moniker check . --report` et conserver le rapport final.

Critère de sortie : les hooks Claude et Codex exécutent le même corpus et la règle ne remonte plus aucune violation.

## P1 : prochains chantiers produit

### Annuaire des contacts

- [x] `[BACK]` Introduire `Contact` comme identité indépendante avec coordonnées, organisme, fonction libre, notes et archivage.
- [x] `[BACK]` Faire de `CouncilMember` un mandat daté rattaché à un contact, sans dupliquer l'identité ni conserver l'ancien schéma.
- [x] `[FULL]` Exposer les capacités Siren, permissions, audit, persistance SQLite/PostgreSQL et données de démonstration.
- [x] `[FRONT]` Ajouter les écrans d'annuaire et de fiche contact, puis sélectionner un contact lors de la création d'un mandat.
- [x] `[FULL]` Distinguer `:contact[...]` de `:member[...]` dans l'éditeur, la recherche, la navigation et le rendu des modèles.

Critère de sortie : un contact sans mandat peut être géré et référencé ; un membre du conseil réutilise cette identité tout en conservant une référence de mandat distincte.

### Ressources tableur

Choix d'intégration : Univer OSS, chargé à la demande derrière l'adaptateur Hall. Le document durable est le snapshot JSON complet du classeur, enveloppé par `schemaVersion: 2`.

- [x] `[BACK]` Introduire une `SpreadsheetResource` durable, classée dans l'arbre et soumise aux mêmes opérations de renommage, déplacement, tags, rattachement et audit que les autres ressources.
- [x] `[BACK]` Persister le snapshot Univer complet avec toutes ses feuilles, leur ordre, les cellules, formules, formats et dimensions.
- [x] `[BACK]` Valider le squelette du classeur et conserver les propriétés Univer supplémentaires sans transformation.
- [x] `[FRONT]` Créer et ouvrir une ressource « Tableur » dans l'établi avec le moteur de formules et les outils natifs Univer.
- [x] `[FRONT]` Appliquer le contrat d'enregistrement automatique commun et sérialiser les sauvegardes rapprochées sans perte.
- [x] `[FULL]` Exposer dans Siren les capacités de consultation et de modification avec concurrence optimiste et snapshots.
- [ ] `[FULL]` Recetter la création, l'édition de données comptables simples, le recalcul, le rechargement et le classement de la ressource sur SQLite et PostgreSQL.
- [x] `[FULL]` Importer les fichiers CSV et XLSX comme ressources tableur éditables ; un classeur XLSX conserve toutes ses feuilles. L’export XLSX ne constitue pas un critère de sortie.

Critère de sortie : l'utilisateur crée une ressource tableur, saisit et formate des données, utilise les formules minimales, puis retrouve sans perte le même document après enregistrement automatique et rechargement.

### Ressources géographiques IGN

Ordre de réalisation : ressource durable, couche Hall GeoJSON, couches IGN, vue cartographique, manipulation dans l'arbre.

- [x] `[BACK]` Introduire une `GeographicResource` durable et visible dans l'arbre avec fournisseur, couches IGN ordonnées, cadrage, zoom et provenance.
- [x] `[BACK]` Garantir les mêmes opérations de classement, renommage, tags et rattachement que pour les autres ressources.
- [x] `[BACK]` Restreindre les couches IGN à l'allowlist Hall, sans URL libre, et persister leur ordre, visibilité et opacité avec au moins une couche visible.
- [x] `[BACK]` Persister `hallLayer` comme une `FeatureCollection` GeoJSON RFC 7946 en WGS84 avec repères, lignes et zones simples, identifiants UUID stables et styles bornés.
- [x] `[FRONT]` Ouvrir la ressource dans une vue OpenLayers, permettre de modifier son cadrage et de choisir les couches IGN proposées par le contrat.
- [x] `[FRONT]` Permettre d'ajouter, modifier et retirer les features de `hallLayer`.
- [x] `[FRONT]` Représenter clairement la ressource géographique dans l'arbre et dans son en-tête commun.
- [ ] `[FULL]` Vérifier création, déplacement, renommage, rechargement, recadrage et rattachement de la ressource.

Critère de sortie : l'utilisateur crée une ressource géographique IGN, choisit ses couches, la manipule dans l'arbre, retrouve son cadrage et enrichit sa couche Hall GeoJSON sans nouvelle recherche.

Étude de cadrage des ressources cartographiques IGN : [rapport complet](etude-ressources-cartographiques-ign.md).

### Ressources juridiques officielles

- [x] `[BACK]` Intégrer l'authentification PISTE côté serveur, la recherche CGCT et la consultation d'un article par CID.
- [x] `[BACK]` Persister la référence, son snapshot courant et son historique sans ajouter de révision lorsque le contenu juridique est inchangé.
- [x] `[BACK]` Protéger l'actualisation par concurrence optimiste et conserver l'état courant en cas d'échec tardif.
- [x] `[FRONT]` Créer une référence Légifrance vide dans l'arbre, rechercher un article puis la résoudre avec un nom proposé.
- [x] `[FRONT]` Afficher l'état de l'actualisation, le contenu structuré et un lien direct vers Légifrance.
- [ ] `[FULL]` Recetter le parcours complet sur une application PISTE de production et préciser la politique de péremption.

Étude de cadrage des ressources juridiques officielles : [rapport complet](etude-ressources-juridiques-officielles.md).

### Ergonomie de l'espace de travail

- [x] `[BACK]` Conserver le classement simple par `folderPath` sans créer une entité dossier artificielle.
- [ ] `[BACK]` Ajouter une date limite facultative à `CouncilMatter` et l'exposer dans Siren.
- [ ] `[FRONT]` Fluidifier la navigation entre chemin, ressource, sujet, délibération et occurrence en séance.
- [ ] `[FRONT]` Conserver le contexte de travail dans l'établi et réduire les changements de page.
- [ ] `[FRONT]` Proposer d'abord les pièces du même chemin lors de leur association à un sujet, sans imposer cette proximité.
- [ ] `[FRONT]` Rendre tags, filtres, épingles et badges de rattachement réellement actionnables.
- [ ] `[FULL]` Passer le contexte du dossier courant aux recherches de références.
- [ ] `[FRONT]` Rendre les références métier cliquables de manière homogène.
- [ ] `[FRONT]` Basculer les listes de séances, délibérations et membres sur le moteur de recherche partagé lorsque cela améliore réellement le parcours.

Critère de sortie : depuis un chemin de travail, l'utilisateur constitue un sujet, lui associe ses pièces et comprend immédiatement son devenir au conseil.

### Modèles de documents et exports de séance

Ordre de réalisation : moteur et stockage, premier modèle vertical, arborescence disque, autres modèles.

- [x] `[BACK]` Stocker les modèles en base et partager la grammaire avec `@hall/templating`.
- [x] `[BACK]` Disposer d'un rendu HTML et PDF Chromium autoritaire.
- [ ] `[BACK]` Choisir le premier modèle vertical de référence, recommandé : la convocation.
- [ ] `[BACK]` Gérer en-tête, pied de page, styles et données de commune sans les coder dans le modèle.
- [ ] `[BACK]` Définir une nomenclature d'export et un template de chemin de dossier.
- [ ] `[BACK]` Construire l'arborescence miroir par séance à partir de sa date, son numéro et son slug.
- [ ] `[BACK]` Écrire les exports de manière atomique, traçable et régénérable.
- [ ] `[BACK]` Relier chaque fichier produit à sa séance, son modèle et son événement de génération.
- [ ] `[BACK]` Assembler au PDF les pièces jointes nécessaires.
- [ ] `[BACK]` Préparer un scénario de message Outlook sans rendre Microsoft Graph obligatoire.
- [ ] `[FRONT]` Fournir une prévisualisation et une action de génération guidée par les capacités Siren.
- [ ] `[FULL]` Ajouter ensuite les modèles de pouvoir, liste des délibérations, délibération, rapport de sujet et procès-verbal.

Critère de sortie : un document réglementaire de séance est généré depuis son modèle, retrouvé dans l'arborescence disque et régénéré sans copie ambiguë.

### Documentation intégrée

Stack MDX calqué sur le projet adjacent Trust : pages MDX par langue dans le client, zone `/docs` dans l'application, site autonome mono-fichier exportable. Le français est la langue de référence ; une page sans traduction retombe dessus. Fonctionnement détaillé : `docs/documentation-integree.md`.

- [x] `[OPS]` Brancher le pipeline MDX (frontmatter, GFM, ancres de titres, texte de recherche) dans les deux configurations Vite.
- [x] `[FRONT]` Livrer la zone `/docs` : arbre des pages, article, sommaire « Sur cette page », recherche plein texte, fil d'Ariane, entrée de navigation à côté des Paramètres, chargement différé.
- [x] `[FRONT]` Fournir les blocs de rédaction Callout, Steps, PageCards, Compare, Details, Figure et Legend, stylés par les tokens en clair et en sombre.
- [x] `[OPS]` Produire le site autonome mono-fichier (`build:docs`) et son archive à envoyer (`zip:docs`).
- [x] `[FRONT]` Poser la structure de départ (prise en main, concepts, écrans) avec les pages trois temps, sujets et délibérations, vote par zones ; marquer en brouillon celles à compléter.
- [ ] `[FRONT]` Compléter les pages marquées brouillon et valider le contenu avec le propriétaire du produit.
- [ ] `[OPS]` Automatiser les captures d'écran de l'application seedée (projet Playwright dédié, clair et sombre, français et anglais, comme `docs-capture` de Trust) et livrer le composant `Screenshot`.
- [ ] `[FRONT]` Illustrer les pages de la section Écrans avec ces captures légendées.
- [ ] `[FRONT]` Relier chaque écran à sa page de documentation par une aide contextuelle, en réutilisant le frontmatter `screen` déjà en place.
- [ ] `[FRONT]` Traduire les pages en anglais une fois le contenu français stabilisé.

Critère de sortie : chaque écran principal dispose d'une page à jour et illustrée, accessible depuis l'application, et le site autonome se régénère en un seul fichier fidèle au contenu courant.

## P2 : après l'alpha

### Mandatures et historique du conseil

- [x] `[BACK]` Introduire `CouncilTerm` avec une seule mandature active par commune ; l'affichage et le cycle de vie de l'historique restent à faire.
- [ ] `[BACK]` Distinguer la date de l'élection du conseil complet, la séance d'installation et la fin effective.
- [x] `[BACK]` Conserver l'effectif légal attendu et empêcher le dépassement des mandats actifs.
- [ ] `[BACK]` Rattacher membres, commissions et séances à leur mandature.
- [ ] `[BACK]` Garantir la cohérence entre commission, appartenances et mandature.
- [ ] `[FRONT]` Ajouter une vue de la mandature actuelle puis la navigation vers les mandatures précédentes.

Critère de lancement : le parcours de la mandature actuelle et la démonstration complète d'une séance sont fiables.

### Convocations et règles juridiques avancées

- [ ] `[BACK]` Revalider la date de référence, les jours francs et le fuseau horaire d'une convocation.
- [ ] `[BACK]` Modéliser le régime de seconde convocation après défaut de quorum.
- [ ] `[BACK]` Modéliser les preuves d'envoi et de publication.
- [ ] `[BACK]` Prendre en compte les variantes liées à la population et à l'urgence uniquement après validation juridique.

Le serveur doit dès maintenant empêcher les chronologies manifestement incohérentes, sans prétendre automatiser toutes les variantes légales.

### Extensions avancées de l'éditeur

- [ ] `[FRONT]` Ajouter un menu `/`.
- [ ] `[FRONT]` Ajouter une poignée de déplacement des blocs.
- [ ] `[FULL]` Ajouter les encadrés `:::note` dans la grammaire commune et dans les trois rendus.
- [ ] `[FRONT]` Consolider la typographie française sans réintroduire de ponctuation interdite.
- [ ] `[FRONT]` Ajouter les lignes de total de table avec un contrat compatible avec les locales prises en charge.
- [ ] `[BACK]` Produire une représentation PNG figée d'une ressource géographique avec attribution et empreinte.
- [ ] `[FULL]` Permettre d'insérer cette représentation dans l'éditeur et le PDF sans appel réseau à l'IGN au rendu.

Ces fonctions ne doivent pas retarder la consolidation de l'éditeur actuel.

## À préciser

- [ ] Planning.

## Acquis structurants

- [x] Le domaine distingue `CouncilMatter`, `AgendaItem`, l'approbation d'un procès-verbal et la question diverse.
- [x] Les cycles de vie appartiennent aux séances, points d'ordre du jour, délibérations et scrutins.
- [x] L'ordre du jour impose le procès-verbal précédent au début, les questions diverses à la fin et l'unicité des éléments obligatoires.
- [x] Les commissions, leurs appartenances datées et leurs rôles existent côté backend.
- [x] Les contacts, membres et commissions disposent de parcours d'administration côté frontend.
- [x] Les permissions, l'audit et les actions Siren constituent la source des capacités du frontend.
- [x] Les ressources documentaires distinguent textes, documents et actifs temporaires d'éditeur.
- [x] SQLite reste le moteur de développement et PostgreSQL le moteur de production, derrière la même frontière de persistance.
- [x] Le moteur de recherche partagé, Tiptap et `@hall/templating` fournissent les fondations communes.
- [x] La préparation de la séance suivante réutilise les commandes et invariants du serveur.
