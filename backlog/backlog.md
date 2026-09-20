# Feuille de route Hall

Cette feuille de route regroupe les comportements attendus par thème fonctionnel. Elle respecte le langage ubiquitaire de `AGENTS.md` et les capacités Siren exposées par le serveur.

## Mode de lecture

### État

- [x] Acquis présent et vérifié dans le checkout.
- [ ] Travail restant ou critère de sortie non encore satisfait.

### Exigences fonctionnelles

- Chaque comportement reçoit un identifiant stable `HALL-FR-<DOMAINE>-<NUMÉRO>`.
- La formulation décrit un comportement observable, sans mélanger sa réalisation technique ni son ordre de livraison.
- Une exigence est cochée seulement lorsque son comportement est réalisé, que le test de preuve porte le même identifiant et que ce test passe.
- Un test qui cite une exigence sans exercer le comportement ne permet pas de la cocher.
- Lorsqu'une exigence est réalisée, son autorité dans le code et ses métadonnées rejoignent le dispositif transversal décrit dans [`docs/requirements.md`](../docs/requirements.md).

### Périmètre technique

- `[BACK]` : domaine, API, serveur, SQL ou génération documentaire.
- `[FRONT]` : parcours, composants React, accessibilité ou présentation.
- `[FULL]` : contrat backend puis intégration frontend.
- `[OPS]` : environnement, qualité et outillage.

Un chantier sans exigences détaillées reste une story à décomposer. Un prototype, un audit ou un test isolé ne suffit pas pour déclarer un comportement satisfait.

## Règles de conduite du backlog

the user définit les règles fonctionnelles, le design et les évolutions du modèle. Les travaux techniques à comportement constant peuvent être menés en autonomie. Dès qu'un changement nécessite un choix fonctionnel, comportemental ou de modèle, le volet concerné s'arrête et la question précise est rapportée à the user.

Les travaux autorisés le 12 septembre utilisent le développement et la copie du dump du conseil, sans intervention en production. Ils préservent les invariants, l'enregistrement automatique et la page d'origine lors de l'ouverture et de la fermeture des modales. Les composants et autorités partagés doivent être enrichis sans créer de parcours ou de propriétaires concurrents.

Retour positif du conseil n° 6 du 11 septembre 2026 : l'enregistrement automatique en direct a évité toute perte d'information malgré les difficultés de navigation. Ce comportement est à préserver.

## 1. Séances du conseil municipal

### Fiabiliser la conduite complète d'une séance

Objectif : conserver le déroulement actuel et le rendre fiable de l'appel des membres à la clôture, sans redesign implicite.

- [ ] `[BACK]` Rejouer les invariants d'ouverture, de présence, de quorum, de pouvoir, de vote et de clôture sur la base de démonstration.
- [ ] `[FRONT]` Vérifier manuellement le parcours complet, de l'appel des membres à la clôture de la séance.
- [ ] `[FRONT]` Vérifier le scroll de l'appel, de la timeline, du contenu et du scrutin.
- [ ] `[FULL]` Corriger uniquement les blocages qui empêchent la démonstration de bout en bout.
- [ ] `[OPS]` Documenter une recette courte et reproductible de la démonstration, sans lancer une suite Playwright globale.

Critère de sortie : une séance peut être conduite de bout en bout sans erreur bloquante.

### Présences, quorum et procès-verbal

- [x] `[FRONT]` Unifier l’en-tête de la fiche du procès-verbal avec la séance. @tracks-requirement HALL-FR-MIN-220
- [x] `[FRONT]` Clarifier les titres des sections du procès-verbal et déplacer leurs consignes dans des infobulles. @tracks-requirement HALL-FR-MIN-230
- [x] `[FRONT]` Présenter l’ouverture, les présences et les pouvoirs du procès-verbal sous une forme rédactionnelle linéaire. @tracks-requirement HALL-FR-MIN-240
- [x] `[FULL]` Distinguer, pour chaque point du procès-verbal, les notes de séance figées, le vote et la rédaction finale modifiable. @tracks-requirement HALL-FR-MIN-250
- [ ] `[FULL]` **Arrivées en retard** : permettre de prendre en compte un conseiller qui rejoint la séance après l'appel initial dans les présences et le quorum. Le cas d'une personne déclarée présente avant son arrivée effective reste à préciser avec le propriétaire avant de modifier les règles.
- [ ] `[FULL]` **PV refusé et gestion du scrutin** : définir le parcours lorsque le PV précédent n'est pas approuvé. Distinguer l'ajournement du point, l'annulation éventuelle du vote, l'abstention de tous les votants et le vote contre. Aucune nouvelle règle ne doit être déduite sans arbitrage du propriétaire.

### Navigation et actualisation pendant la séance

- [ ] `[FRONT]` Rendre les déplacements entre écrans et l'ouverture des liens cohérents, sans obliger l'utilisateur à reconstruire son contexte de séance.
- [ ] `[FULL]` Examiner le besoin d'actualisation partagée en direct. SSE a été évoqué, mais les usages attendus doivent être précisés avant de choisir une solution technique.

### Affichage de conduite et vidéoprojecteur

- [ ] `[FRONT]` Soigner l'occupation et la lisibilité de l'écran à la résolution dictée « 1 980 × 824 », dimensions à confirmer avant recette.
- [ ] `[FRONT]` Étudier des zones de dépôt des votes verticales plutôt qu'horizontales.
- [ ] `[FRONT]` Garantir l'accès permanent aux actions de conduite et la lisibilité à distance.
- [ ] `[FRONT]` Créer un thème adapté au vidéoprojecteur ; la présentation actuelle a été jugée illisible pendant le conseil.
- [ ] `[FRONT]` Recetter également le mode présentation en affichage étendu à 1280 × 1024.

### Convocations et règles juridiques avancées

- [ ] `[BACK]` Revalider la date de référence, les jours francs et le fuseau horaire d'une convocation.
- [ ] `[BACK]` Modéliser le régime de seconde convocation après défaut de quorum.
- [ ] `[BACK]` Modéliser les preuves d'envoi et de publication.
- [ ] `[BACK]` Prendre en compte les variantes liées à la population et à l'urgence uniquement après validation juridique.

Le serveur doit empêcher dès maintenant les chronologies manifestement incohérentes, sans prétendre automatiser toutes les variantes légales.

## 2. Calendrier et rendez-vous

### Story calendrier : rendez-vous, séances et invitations

Les comportements et leurs critères d'acceptation ont pour unique autorité le
[catalogue des exigences](../requirements/catalog.json). Cette section suit le
travail restant ; elle ne reformule pas les exigences.

#### Consultation et présentation

- [x] `CAL-TASK-010` — Couverture livrée. <!-- @tracks-requirement HALL-FR-CAL-010 -->
- [x] `CAL-TASK-020` — Couverture livrée. <!-- @tracks-requirement HALL-FR-CAL-020 -->
- [x] `CAL-TASK-030` — Couverture livrée. <!-- @tracks-requirement HALL-FR-CAL-030 -->
- [x] `CAL-TASK-040` — Couverture livrée. <!-- @tracks-requirement HALL-FR-CAL-040 -->

#### Cycle de vie d'un rendez-vous

- [x] `CAL-TASK-050` — Couverture livrée. <!-- @tracks-requirement HALL-FR-CAL-050 -->
- [x] `CAL-TASK-060` — Couverture livrée. <!-- @tracks-requirement HALL-FR-CAL-060 -->
- [x] `CAL-TASK-070` — Couverture livrée. <!-- @tracks-requirement HALL-FR-CAL-070 -->
- [x] `CAL-TASK-080` — Couverture livrée. <!-- @tracks-requirement HALL-FR-CAL-080 -->
- [x] `CAL-TASK-090` — Couverture livrée. <!-- @tracks-requirement HALL-FR-CAL-090 -->

#### Formulaire et planification

- [x] `CAL-TASK-100` — Couverture livrée. <!-- @tracks-requirement HALL-FR-CAL-100 -->
- [x] `CAL-TASK-110` — Couverture livrée. <!-- @tracks-requirement HALL-FR-CAL-110 -->
- [x] `CAL-TASK-120` — Couverture livrée. <!-- @tracks-requirement HALL-FR-CAL-120 -->
- [x] `CAL-TASK-130` — Couverture livrée. <!-- @tracks-requirement HALL-FR-CAL-130 -->
- [x] `CAL-TASK-140` — Couverture livrée. <!-- @tracks-requirement HALL-FR-CAL-140 -->

#### Participants et invitations

- [x] `CAL-TASK-150` — Couverture livrée. <!-- @tracks-requirement HALL-FR-CAL-150 -->
- [x] `CAL-TASK-160` — Couverture livrée. <!-- @tracks-requirement HALL-FR-CAL-160 -->
- [x] `CAL-TASK-170` — Couverture livrée. <!-- @tracks-requirement HALL-FR-CAL-170 -->
- [x] `CAL-TASK-180` — Couverture livrée. <!-- @tracks-requirement HALL-FR-CAL-180 -->
- [x] `CAL-TASK-190` — Couverture livrée. <!-- @tracks-requirement HALL-FR-CAL-190 -->

#### Enregistrement et preuve

- [x] `CAL-TASK-200` — Couverture livrée. <!-- @tracks-requirement HALL-FR-CAL-200 -->

Une tâche est cochée après exécution réussie du test référencé sur la version
servie par la preview de développement. L'interface des exigences expose
séparément l'implémentation, la vérification et le suivi backlog.

## 3. Affaires du conseil et espace de travail

### Ergonomie du parcours de préparation

- [x] `[FULL]` Retirer le niveau technique de la démonstration Alésia et vérifier la conservation des données. @tracks-requirement HALL-FR-WSP-250
- [x] `[FRONT]` Rendre consultables les documents classés à la racine. @tracks-requirement HALL-FR-WSP-270
- [x] `[FRONT]` Nommer les dossiers parents des documents au lieu d’afficher « .. ». @tracks-requirement HALL-FR-WSP-260
- [x] `[FRONT]` Corriger l’identité et l’ouverture des affaires dans l’arbre latéral. @tracks-requirement HALL-FR-WSP-240
- [x] `[FULL]` Verrouiller temporairement le titre et le contenu des sujets inscrits pendant la séance, puis conserver le verrou des seuls sujets effectivement commencés. @tracks-requirement HALL-FR-WSP-280
- [x] `[BACK]` Structurer les actions Siren d’une affaire par contenu, sujets, ordre du jour et affaire. @tracks-requirement HALL-FR-WSP-290
- [ ] `[BACK]` Étudier la fusion de deux affaires, notamment le devenir de leurs ressources, sujets et occurrences d’ordre du jour, sans préjuger de la règle fonctionnelle ni du modèle.

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

### Commissions associées aux affaires

- @tracks-requirement HALL-FR-BUS-070
- [ ] `[FULL]` Permettre de rattacher plusieurs commissions à une `CouncilBusiness`, l'affaire suivie dans la durée, puis de consulter les affaires rattachées depuis chaque commission. Préciser avec le propriétaire les règles de rattachement avant de modifier le modèle ou l'interface.

### Cohérence des ressources documentaires

- [ ] `[FULL]` Auditer chaque type de ressource, son parcours d'édition et son accessibilité dans l'IHM ; relever les opérations disponibles, manquantes ou difficiles à trouver.
- [ ] `[FULL]` Reprendre l'ergonomie et le sens des parcours d'ajout et de suppression des ressources. Les évolutions fonctionnelles restent à préciser avec le propriétaire.
- [ ] `[FRONT]` Retravailler la présentation des textes et les dimensions des éditeurs, jugées trop brutes à l'usage.

### Historique des modifications

- [ ] `[FULL]` Vérifier la couverture réelle du journal d'activité : les ajouts de documents et les modifications de textes réussis ne figurent pas dans la liste d'audit exposée par l'application actuelle. Distinguer cet audit des versions de contenu.
- [ ] `[FULL]` Conserver les versions enregistrées des textes édités en Markdown et permettre de consulter les changements entre deux versions. Relier chaque version à son auteur et à sa date ; préciser la présentation des enregistrements automatiques avec le propriétaire.
- [ ] `[FULL]` Examiner l'historique des documents remplacés et la suppression des ressources, notamment l'option d'une suppression réversible. Définir les règles de conservation avant toute modification du modèle.

### Notifications des ressources

- [ ] `[FULL]` Informer les utilisateurs concernés lorsqu'une ressource change. Définir avec le propriétaire les événements, les destinataires, le canal et le regroupement des enregistrements automatiques avant de choisir le modèle ou le mécanisme de diffusion.

### Recherche, insertion et création inline

Audit et proposition d’architecture : [sélecteur commun de ressources et
d’entités](../docs/selecteur-ressources-design.md).

- [ ] `[FRONT]` Retravailler le parcours depuis le bouton de recherche comme depuis la saisie inline.
- [ ] `[FRONT]` Positionner les suggestions selon l'éditeur, le curseur et l'espace disponible, notamment au-dessus lorsque l'espace inférieur est insuffisant.
- [ ] `[FULL]` Inventorier toutes les ressources insérables dans un éditeur, sans limiter l'audit aux exemples cités pendant le débrief.
- [ ] `[FULL]` Étudier pour chaque ressource la pertinence d'une commande de création inline ouvrant un formulaire adapté et ajoutant la ressource à l'éditeur.
- [ ] `[FULL]` Examiner l'import de fichiers depuis l'éditeur, notamment une action ouvrant directement une zone de dépôt.

Critère de sortie : l'inventaire couvre tous les types de ressources et débouche sur des parcours proposés ; aucun type n'est omis faute d'avoir été cité oralement.

## 4. Éditeur, rendus et ressources spécialisées

### Stabiliser l'éditeur et les documents

Objectif : figer le lot actuel avant d'ajouter une nouvelle fonction.

- [x] `[BACK]` Distinguer les documents durables des `editorAsset` appartenant à un contenu.
- [x] `[BACK]` Créer, rechercher, promouvoir et purger les `editorAsset` par les commandes serveur.
- [x] `[BACK]` Produire l'aperçu PDF autoritaire avec Chromium sans persistance parasite.
- [x] `[BACK]` Accepter les tables riches Tiptap dans le rendu sécurisé et le PDF.
- [x] `[FRONT]` Insérer une image archivée ou importée et conserver son identifiant, son ratio, son alignement et sa largeur.
- [x] `[FULL]` Conserver le texte encadré et prendre en charge le souligné dans l’éditeur, l’aperçu HTML et le document produit.
- [x] `[FRONT]` Couvrir l'Editor Lab avec sa recette Playwright ciblée.
- [ ] `[FRONT]` Rendre l'ouverture d'une image clairement visible et accessible dans l'éditeur compact.
- [ ] `[FRONT]` Adapter la densité et la hauteur de l’éditeur Markdown. @tracks-requirement HALL-FR-DOC-270
- [ ] `[FULL]` Vérifier que l'image, le tableau et les retours à la ligne sont identiques dans l'éditeur, l'aperçu HTML et le PDF.
- [ ] `[FULL]` Valider la pagination, les sauts de page, les en-têtes et les pieds de page sur un document réaliste.
- [x] `[OPS]` Faire une revue finale du diff éditeur et documents, puis isoler ce lot dans un commit cohérent.

Critère de sortie : un document comprenant texte, références, image et tableau est sauvegardé, rechargé, prévisualisé et exporté en PDF sans perte.

### Ressources tableur

Choix d'intégration : Univer OSS, chargé à la demande derrière l'adaptateur Hall. Le document durable est le snapshot JSON complet du classeur, enveloppé par `schemaVersion: 2`.

- [x] `[BACK]` Introduire une `SpreadsheetResource` durable avec les opérations communes de renommage, déplacement, tags, rattachement et audit.
- [x] `[BACK]` Persister toutes les feuilles, leur ordre, les cellules, formules, formats et dimensions dans le snapshot Univer.
- [x] `[BACK]` Valider le squelette du classeur et conserver les propriétés Univer supplémentaires sans transformation.
- [x] `[FRONT]` Créer et ouvrir une ressource « Tableur » avec le moteur de formules et les outils natifs Univer.
- [x] `[FRONT]` Appliquer l'enregistrement automatique commun et sérialiser les sauvegardes rapprochées sans perte.
- [x] `[FULL]` Exposer dans Siren les capacités de consultation et de modification avec concurrence optimiste et snapshots.
- [x] `[FULL]` Importer les fichiers CSV et XLSX comme ressources éditables ; un classeur XLSX conserve toutes ses feuilles. L'export XLSX ne constitue pas un critère de sortie.
- [ ] `[FULL]` Recetter la création, l'édition de données comptables simples, le recalcul, le rechargement et le classement sur PostgreSQL.

Critère de sortie : l'utilisateur crée, édite et formate un tableur, utilise les formules minimales et retrouve sans perte le même document après rechargement.

### Ressources géographiques IGN

- [x] `[BACK]` Introduire une `GeographicResource` durable et visible dans l'arbre avec fournisseur, couches IGN ordonnées, cadrage, zoom et provenance.
- [x] `[BACK]` Garantir les opérations communes de classement, renommage, tags et rattachement.
- [x] `[BACK]` Restreindre les couches IGN à l'allowlist Hall et persister leur ordre, visibilité et opacité avec au moins une couche visible.
- [x] `[BACK]` Persister `hallLayer` comme une `FeatureCollection` GeoJSON RFC 7946 en WGS84 avec identifiants stables et styles bornés.
- [x] `[FRONT]` Ouvrir la ressource dans OpenLayers, modifier son cadrage et choisir les couches IGN proposées par le contrat.
- [x] `[FRONT]` Ajouter, modifier et retirer les features de `hallLayer`.
- [x] `[FRONT]` Représenter clairement la ressource dans l'arbre et son en-tête commun.
- [ ] `[FULL]` Vérifier création, déplacement, renommage, rechargement, recadrage et rattachement.

Critère de sortie : l'utilisateur crée et manipule une ressource géographique, retrouve son cadrage et enrichit sa couche Hall GeoJSON sans nouvelle recherche.

Étude de cadrage : [ressources cartographiques IGN](etude-ressources-cartographiques-ign.md).

### Ressources juridiques officielles

- [x] `[BACK]` Intégrer l'authentification PISTE côté serveur, la recherche CGCT et la consultation d'un article par CID.
- [x] `[BACK]` Persister la référence, son snapshot courant et son historique sans révision lorsque le contenu est inchangé.
- [x] `[BACK]` Protéger l'actualisation par concurrence optimiste et conserver l'état courant en cas d'échec tardif.
- [x] `[FRONT]` Créer une référence Légifrance vide, rechercher un article puis la résoudre avec un nom proposé.
- [x] `[FRONT]` Afficher l'état de l'actualisation, le contenu structuré et un lien direct vers Légifrance.
- [ ] `[FULL]` Recetter le parcours complet sur une application PISTE de production et préciser la politique de péremption.

Étude de cadrage : [ressources juridiques officielles](etude-ressources-juridiques-officielles.md).

### Extensions de l'éditeur

- [ ] `[FRONT]` Ajouter un menu `/`.
- [ ] `[FRONT]` Ajouter une poignée de déplacement des blocs.
- [ ] `[FULL]` Ajouter les encadrés `:::note` dans la grammaire commune et dans les trois rendus.
- [ ] `[FRONT]` Consolider la typographie française sans réintroduire de ponctuation interdite.
- [ ] `[FRONT]` Ajouter les lignes de total de table avec un contrat compatible avec les locales prises en charge.
- [ ] `[BACK]` Produire une représentation PNG figée d'une ressource géographique avec attribution et empreinte.
- [ ] `[FULL]` Insérer cette représentation dans l'éditeur et le PDF sans appel réseau à l'IGN au rendu.

Ces fonctions ne doivent pas retarder la consolidation de l'éditeur actuel.

## 5. Modèles, documents réglementaires et exports

### Modèles et exports de séance

Ordre de réalisation : moteur et stockage, premier modèle vertical, arborescence disque, puis autres modèles.

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

Critère de sortie : un document réglementaire est généré depuis son modèle, retrouvé dans l'arborescence disque et régénéré sans copie ambiguë.

### Finition des modèles

- [ ] `[FULL]` Reprendre proprement les modèles et leurs détails de présentation. Le modèle concerné et les ajustements attendus doivent être précisés avec le propriétaire.

## 6. Contacts, mandatures, commune et accès

### Annuaire des contacts

- [x] `[BACK]` Introduire `Contact` comme identité indépendante avec coordonnées, organisme, fonction libre, notes et archivage.
- [x] `[BACK]` Faire de `CouncilMember` un mandat daté rattaché à un contact sans dupliquer l'identité.
- [x] `[FULL]` Exposer les capacités Siren, permissions, audit, persistance PostgreSQL et données de démonstration.
- [x] `[FRONT]` Ajouter les écrans d'annuaire et de fiche contact, puis sélectionner un contact lors de la création d'un mandat.
- [x] `[FULL]` Distinguer `:contact[...]` de `:member[...]` dans l'éditeur, la recherche, la navigation et le rendu des modèles.

Critère de sortie : un contact sans mandat peut être géré et référencé ; un membre du conseil réutilise cette identité avec une référence de mandat distincte.

### Paramètres de la commune, salles, droits et authentification

- [ ] `[FULL]` Clarifier l’écran de configuration de la commune demandé le 20 septembre 2026 : accès par le menu principal, consultation et modification avec habilitations distinctes, cohérence avec l’IHM existante. Les champs et attributions précises restent à décider. @tracks-requirement HALL-FR-COM-010

- [ ] `[FULL]` Examiner les possibilités de configuration de la commune, notamment l'absence signalée de salles prédéfinies. Préciser le besoin avant toute évolution du modèle.
- [ ] `[FULL]` Auditer et rationaliser les RBAC, les permissions et les rôles. Étudier une granularité globale plus fine, notamment la distinction entre lecture, modification et suppression. Ne pas introduire de droits particuliers par affaire ; préciser avec le propriétaire la liste des actions à séparer avant de modifier le contrat.
- [ ] `[FULL]` Étudier les connexions avec un compte Microsoft et l'authentification via Active Directory. Présenter options, prérequis et implications avant le choix d'une solution ; aucun fournisseur n'est arrêté.
- [ ] `[FULL]` Examiner avec le propriétaire les habilitations issues de l'étude SSO.

### Accueil des conseillers et espace personnel

- [ ] `[FULL]` Exploiter le rattachement existant entre compte, contact et mandat de conseiller pour proposer un accueil adapté, notamment une vue « mes affaires ». Définir avec le propriétaire ce qui fait qu'une affaire appartient à cette vue ; distinguer personnalisation de l'accueil et droits d'accès.
- [ ] `[FULL]` Étudier un espace « mes documents » et des notes personnelles sans rattachement obligatoire à une affaire. Préciser la confidentialité, le partage éventuel et le cycle de vie avant de modifier le modèle.

### Mandatures et historique du conseil

- [x] `[BACK]` Introduire `CouncilTerm` avec une seule mandature active par commune ; l'affichage et le cycle de vie de l'historique restent à faire.
- [x] `[BACK]` Conserver l'effectif légal attendu et empêcher le dépassement des mandats actifs.
- [ ] `[BACK]` Distinguer la date de l'élection du conseil complet, la séance d'installation et la fin effective.
- [ ] `[BACK]` Rattacher membres, commissions et séances à leur mandature.
- [ ] `[BACK]` Garantir la cohérence entre commission, appartenances et mandature.
- [ ] `[FRONT]` Ajouter une vue de la mandature actuelle puis la navigation vers les mandatures précédentes.

Critère de lancement : le parcours de la mandature actuelle et la conduite complète d'une séance sont fiables.

## 7. Interface transversale et identité visuelle

### Cohérence visuelle et linguistique

- [ ] `[FRONT]` Traduire complètement l'écran d'authentification et ne plus afficher les codes d'erreur techniques.
- [ ] `[FRONT]` Restaurer une hiérarchie typographique stable pour les titres de page.
- [ ] `[FRONT]` Remplacer les chaînes visibles en dur et supprimer les clés de traduction mortes.
- [ ] `[FRONT]` Exposer la locale et les outils `Intl` depuis un seul contexte i18n.
- [ ] `[FRONT]` Rationaliser séparateurs, nombres, pluriels et formats de date sans logique locale dispersée.
- [ ] `[FRONT]` Aligner les écrans sur les tokens CSS et supprimer les intentions visuelles sans règle associée.
- [ ] `[FRONT]` Garder les contrôles d'image et de table petits, discrets, accessibles et cohérents avec Hall.
- [ ] `[FRONT]` Retirer les quadratins des chaînes et commentaires couverts par la règle Code Moniker.
- [ ] `[OPS]` Conserver les tests statiques de parité i18n et de résolution des tokens.

Critère de sortie : les écrans principaux utilisent la même hiérarchie, les mêmes tokens et la même infrastructure de traduction, sans erreur brute ni quadratin.

### Clarté générale de l'IHM

- [ ] `[FRONT]` Clarifier la présentation des documents, les sections et la hiérarchie des informations.
- [ ] `[FRONT]` Distinguer visuellement la fonction et la temporalité des sections.
- [ ] `[FRONT]` Travailler les couleurs, le style et la différenciation des zones, jugés trop monotones et fouillis. Les choix de présentation restent à conduire avec le propriétaire.

## 8. Performance, exploitation et distribution locale

### Sauvegarde et restauration

- [x] `[OPS]` **Sauvegarde de production après le conseil n° 6** : dump complet du schéma et des données réalisé le 11 septembre 2026 à 23 h 11. Archive `hall-production-2026-09-11T21-11-14-838Z.dump` copiée dans le dossier OneDrive personnel `Alésia/Application mairie` ; une première copie reste dans `Hall/Sauvegardes`. Lecture intégrale par `pg_restore` et identité SHA-256 vérifiées. La synchronisation OneDrive distante n'est pas confirmée.
- [ ] `[FULL]` **Rechargement d'un dump en local** : prévoir un parcours pour la période sans accès distant. Les modalités restent à préciser ; aucune synchronisation ni fusion de bases n'est décidée.

### Chargements et mémoire

- [ ] `[FULL]` **Chargement à la demande et requêtes sélectives** : mesurer les volumes transférés et les agrégations, charger les données lorsqu'elles sont nécessaires et limiter les ensembles récupérés. Les causes des chargements trop larges restent à établir.
- [ ] `[FULL]` **Consommation mémoire et durée de vie des données** : mesurer la mémoire pendant un usage prolongé avec de nombreux documents et PDF ; examiner les stores, les caches et la libération après fermeture ou navigation. La croissance continue d'un store est une hypothèse, pas une fuite confirmée.

### Distribution locale Windows et macOS

- [ ] `[OPS]` Packager l'application avec un snapshot ou un dump pour son utilisation locale.
- [ ] `[FULL]` Définir avec le propriétaire le parcours utilisateur de chargement et de restauration associé.

### Garde-fous Code Moniker

- [x] `[OPS]` Déclarer une règle de niveau erreur interdisant les quadratins dans les commentaires et portées de code indexées.
- [x] `[OPS]` Déclarer une règle de niveau erreur interdisant les commentaires dans les fonctions et méthodes.
- [x] `[OPS]` Générer les hooks projet pour Claude et Codex.
- [ ] `[OPS]` Approuver le hook projet dans les réglages de l'application Codex.
- [x] `[OPS]` Aligner le MCP Codex installé sur la version 0.9.2 du binaire.
- [x] `[OPS]` Corriger les violations existantes sans modifier le sens des textes métier.
- [x] `[OPS]` Rejouer `code-moniker check . --report` et conserver le rapport final.

Critère de sortie : les hooks Claude et Codex exécutent le même corpus et la règle ne remonte plus aucune violation.

## 9. Documentation et revue fonctionnelle

### Documentation intégrée

Stack MDX calqué sur le projet Trust : pages par langue dans le client, zone `/docs` et site autonome mono-fichier. Le français est la référence ; une page sans traduction retombe dessus. Fonctionnement détaillé : [`docs/documentation-integree.md`](../docs/documentation-integree.md).

- [x] `[OPS]` Brancher le pipeline MDX avec frontmatter, GFM, ancres et texte de recherche dans les deux configurations Vite.
- [x] `[FRONT]` Livrer la zone `/docs` avec arbre, article, sommaire, recherche, fil d'Ariane, navigation et chargement différé.
- [x] `[FRONT]` Fournir les blocs Callout, Steps, PageCards, Compare, Details, Figure et Legend avec les tokens clair et sombre.
- [x] `[OPS]` Produire le site autonome mono-fichier et son archive à envoyer.
- [x] `[FRONT]` Poser la structure de départ et marquer en brouillon les pages à compléter.
- [ ] `[FRONT]` Compléter les brouillons et valider leur contenu avec le propriétaire du produit.
- [ ] `[OPS]` Automatiser les captures de l'application seedée avec un projet Playwright dédié, en clair et sombre, français et anglais, puis livrer le composant `Screenshot`.
- [ ] `[FRONT]` Illustrer les pages de la section Écrans avec les captures légendées.
- [ ] `[FRONT]` Relier chaque écran à sa documentation par une aide contextuelle fondée sur le frontmatter `screen`.
- [ ] `[FRONT]` Traduire les pages en anglais après stabilisation du français.

Critère de sortie : chaque écran principal dispose d'une page à jour et illustrée, accessible dans l'application, et le site autonome se régénère fidèlement.

### Revue générale de l'application

- [ ] `[FULL]` Examiner les domaines, les fonctionnalités, ce que l'utilisateur doit pouvoir faire et ce qui est réellement accessible.
- [ ] `[FULL]` Confronter les parcours à la documentation et relever les incohérences, manques et décisions à prendre.

Ce volet est un audit factuel et documentaire. Il n'autorise pas à modifier toutes les règles fonctionnelles ; les évolutions produit sont examinées avec le propriétaire.

## 10. Acquis structurants

- [x] Le domaine distingue `CouncilMatter`, `AgendaItem`, l'approbation d'un procès-verbal et la question diverse.
- [x] Les cycles de vie appartiennent aux séances, points d'ordre du jour, délibérations et scrutins.
- [x] L'ordre du jour impose le procès-verbal précédent au début, les questions diverses à la fin et l'unicité des éléments obligatoires.
- [x] Les commissions, leurs appartenances datées et leurs rôles existent côté backend.
- [x] Les contacts, membres et commissions disposent de parcours d'administration côté frontend.
- [x] Les permissions, l'audit et les actions Siren constituent la source des capacités du frontend.
- [x] Les ressources documentaires distinguent textes, documents et actifs temporaires d'éditeur.
- [x] PostgreSQL est l'unique moteur de persistance du développement, des tests et de la production.
- [x] Le moteur de recherche partagé, Tiptap et `@hall/templating` fournissent les fondations communes.
- [x] La préparation de la séance suivante réutilise les commandes et invariants du serveur.
- [x] Garantir l’unicité de la séance active. @tracks-requirement HALL-FR-MTG-310

## 11. À planifier

- [ ] Établir le planning des chantiers à prioriser avec le propriétaire.

## Recherche commune — réalisation du cadrage accepté

- [ ] Recherche sur les titres et classement. @tracks-requirement HALL-FR-SRC-010
- [ ] Périmètre, recherche serveur et chargement progressif. @tracks-requirement HALL-FR-SRC-020
- [x] Aligner la consultation web de la fiche, de la modale et des contenus intégrés sur le corps de ressource commun. @tracks-requirement HALL-FR-SRC-030
- [ ] Contrôleur et interactions partagés, formulaires et éditeur. @tracks-requirement HALL-FR-SRC-030
