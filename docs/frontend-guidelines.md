# Guide de conception du frontend

Ce document fixe les principes communs applicables au client Hall. Il complète le langage ubiquitaire et les règles métier d’[`AGENTS.md`](../AGENTS.md) sans les remplacer.

## 1. Autosave par défaut

Une donnée durable éditée dans une page est enregistrée automatiquement après une courte période d’inactivité. L’utilisateur ne doit pas avoir à chercher un bouton « Enregistrer » pour sécuriser son travail courant.

- Déclencher l’enregistrement après un debounce, sans requête à chaque frappe. La référence actuelle est de 1 seconde pour l’espace de travail et de 2 secondes pour les notes prises pendant une séance.
- Rendre visibles les états `dirty`, `saving`, `saved` et `error`, avec un libellé français adapté. Dans le Workbench, cet état appartient au fil d’Ariane spécialisé.
- Conserver la saisie locale si la requête échoue et permettre une nouvelle tentative.
- Avant une navigation ou un démontage de composant, terminer l’enregistrement en attente ou avertir clairement l’utilisateur.
- Réserver une validation explicite aux vraies transactions : création, action métier engageante, dialogue multi-champs ou étape dont la confirmation a un sens métier.

Un bouton « Enregistrer » sur une édition courante est donc un reliquat à résorber, pas un second modèle d’interaction à reproduire.

## 2. Deux régimes de fil d’Ariane

Hall possède deux fils d’Ariane complémentaires, avec un seul propriétaire pour chaque niveau de navigation.

- Le fil d’Ariane global, porté par `HeaderBreadcrumb`, situe les pages ordinaires dans l’application.
- Pour l’espace de travail, le fil global s’arrête à « Espace de travail ».
- `WorkspaceBreadcrumb` prend ensuite en charge le chemin du dossier, la ressource ou le sujet ouvert, la navigation locale et l’état d’autosave.
- Une information de chemin ne doit jamais être répétée simultanément dans les deux fils.

Une nouvelle zone de navigation spécialisée doit avoir une responsabilité comparable et explicite ; elle ne doit pas dupliquer le fil global.

## 3. Des formulaires cohérents, pas des micro-formulaires

Un formulaire correspond à une intention complète : créer une séance, éditer une fiche, configurer la commune ou confirmer une opération structurée.

- Les champs persistants édités au fil du travail restent intégrés à la page et suivent l’autosave.
- Une commande atomique est un bouton ou une action Siren, pas un formulaire isolé.
- Éviter un formulaire, une barre d’actions ou un bouton d’enregistrement par ligne, badge ou petite propriété.
- Regrouper les champs qui participent à la même décision utilisateur et afficher leurs erreurs au même endroit.
- Les dialogues servent aux actions ponctuelles ou engageantes, pas à masquer une page constituée de formulaires morcelés.

## 4. Une information, un propriétaire visuel

- Une page possède une seule source visible pour son titre, son chemin, son état et ses actions principales.
- Ne pas répéter une même métadonnée dans l’en-tête, un encart et le corps de page sans usage distinct.
- Réutiliser les composants, badges et fonctions de présentation existants au lieu de reformater localement la même information.
- Dans une vue maître-détail, la liste permet de choisir et le détail permet d’agir ; ils n’ont pas à raconter deux fois toute la même fiche.

## 5. Tokens CSS stables

`packages/client/src/styles/tokens.css` est la source canonique des valeurs visuelles.

- Le CSS applicatif consomme les variables `--hall-*` ; il n’introduit pas de couleurs littérales ou de valeurs de thème concurrentes.
- Les variables compatibles shadcn et le pont Tailwind restent des alias des tokens Hall.
- Une nouvelle valeur récurrente ou porteuse de sens est d’abord nommée dans les tokens, puis consommée par les composants.
- Ne pas renommer un token pour un besoin local. Faire évoluer sa sémantique ou introduire un token distinct lorsque les usages divergent réellement.

Les tests `theme-tokens.test.mjs` protègent cette frontière et doivent rester verts.

## 6. Front métier et primitives techniques

- Les pages et composants métier emploient le langage ubiquitaire défini dans `AGENTS.md` : `CouncilMatter`, `AgendaItem`, `CouncilMeeting`, `CouncilDecision`, etc.
- Les primitives techniques d’édition, de document, de table, de dialogue et de mise en page restent agnostiques du domaine. Elles reçoivent leurs données et comportements par propriétés ou providers.
- `@hall/templating` reste l’unique autorité de la grammaire de templating partagée.
- Le client consomme le serveur par ses services et contrats partagés ; il n’importe ni repository, ni SQL, ni implémentation serveur.
- Les rôles ne sont pas recodés dans le client. Les actions Siren exposées par le serveur déterminent les capacités disponibles.

## 7. Mutations et retour utilisateur

- Toute mutation empêche les doubles soumissions, montre sa progression et restitue une erreur exploitable.
- Une action absente du contrat Siren n’est pas simulée ou réinventée dans le client.
- Les contrôles restent accessibles au clavier, correctement nommés et associés à leurs champs.
- Le mode séance conserve son autonomie visuelle et fonctionnelle ; ses contraintes d’affichage ne justifient pas de dupliquer les règles métier dans le frontend.

## État actuel et points à aligner

Les fondations sont déjà présentes : autosave de `ResourceWorkbench`, autosave des notes de `ConductView`, séparation entre `HeaderBreadcrumb` et `WorkspaceBreadcrumb`, catalogue de tokens contrôlé et capacités Siren.

Deux écarts doivent guider les prochains changements : l’édition de `CouncilBusinessWorkbench` utilise encore une sauvegarde manuelle, et la protection d’une modification en attente lors d’une navigation n’est pas encore centralisée. Une nouvelle fonctionnalité ne doit pas étendre ces écarts.

Pour le chantier d’administration du conseil, les fiches de membres et de commissions suivent l’autosave. La création et les opérations structurées d’appartenance restent des actions explicites ; chaque membre ou badge ne reçoit pas son propre micro-formulaire.

## Contrôle avant livraison

- Vérifier quel composant possède déjà l’information, la navigation et l’action concernées.
- Vérifier les capacités Siren avant d’ajouter une commande.
- Vérifier l’autosave, y compris l’erreur et la navigation pendant un enregistrement en attente.
- Vérifier l’absence d’information et de formulaire dupliqués sur le même écran.
- Réutiliser les tokens et composants existants.
- Exécuter les tests du client, le typecheck et les contrôles d’architecture proportionnés aux fichiers touchés.
