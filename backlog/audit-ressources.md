# Audit des ressources : inventaire initial du 12 septembre 2026

Périmètre : catégorie autonome du débrief dans [le backlog](backlog.md). Audit des ressources existantes, édition et accès dans l'IHM. Aucun changement de modèle, de comportement ou de présentation effectué. Les constats ci-dessous proviennent du code ; ils ne remplacent pas une recette visuelle de chaque parcours.

## Autorités observées

Le [contrat documentaire HTTP](../packages/api-contract/src/resources.ts) contient huit variantes, dont le dossier. Le [modèle historique du domaine](../packages/domain/src/model.ts) n'en expose que six pour `ResourceKind` : il ne faut pas utiliser cette seule liste pour l'inventaire actuel et omettre les événements.

Le composant [ResourcePresentationBody](../packages/client/src/features/resources/ResourcePresentationBody.tsx) assure le rendu commun du workbench et de la vue étendue. La [politique d'édition](../packages/client/src/features/resources/resourceEditorPolicy.ts) couvre les huit variantes. Les [capacités](../packages/client/src/features/resources/resourceCapabilities.ts) proviennent des actions Siren ; la présence d'un éditeur ne garantit donc pas le droit de modifier chaque occurrence.

Code Moniker, recherche ciblée `resourceKindEditorPolicies` : un symbole trouvé dans la politique partagée. Ce résultat confirme sa localisation ; il ne constitue pas une preuve de couverture interactive ou d'absence de consommateurs concurrents.

## Inventaire exhaustif du contrat documentaire

| Type | Création ou entrée observée | Consultation et édition observées | Limite de vérification |
| --- | --- | --- | --- |
| Dossier | Menu créer un sous-dossier de l'arbre | Navigation et classement ; pas de corps documentaire dans le composant partagé | Ce n'est pas une pièce éditable ; ne pas assimiler navigation et insertion |
| Texte | Menu créer un texte | MarkdownEditor compact ou enrichi, rendu Markdown en lecture, autosave selon capacités | Parcours visuel et insertion à recetter |
| Ressource web | Menu créer une ressource distante | Formulaire de cible URL, consultation du lien, autosave selon capacités | Ce n'est pas l'édition du contenu du site distant |
| Tableur | Création dans l'arbre ou import dédié | Éditeur tableur chargé à la demande ; édition et flush partagés | Mémoire et cycles prolongés relèvent de l'audit mémoire |
| Géographique | Création dans l'arbre | Carte partagée avec mise à jour autorisée par capacité | Pas de défaut de rendu démontré dans cette tranche |
| Événement | Parcours calendrier ; création aussi reconnue par les capacités du workbench d'affaire | EventResourceEditor et autosave | Le menu créer examiné dans PathContents ne présente pas d'entrée événement ; ne pas l'ajouter sans décision UX |
| Document | Import de fichier | DocumentEmbed, téléchargement ; pas d'édition du contenu binaire par cette politique | Métadonnées et suppression distinctes du contenu |
| Référence juridique | Création dédiée dans l'arbre | Résolution du brouillon puis vue de référence et actualisation selon capacités | Pas d'édition libre du texte juridique dans ce corps |

Sources des entrées : [PathContents](../packages/client/src/pages/workspace/PathContents.tsx), [CalendarPage](../packages/client/src/features/calendar/CalendarPage.tsx), [CouncilBusinessWorkbench](../packages/client/src/pages/workspace/CouncilBusinessWorkbench.tsx), [resourcesApi](../packages/client/src/services/resourcesApi.ts).

## Références non documentaires à conserver dans l'examen

Le catalogue de références du domaine contient également membres, contacts, affaires, décisions et séances. Ils ne sont pas des variantes documentaires. Les oublier serait une erreur dans une future étude de création inline : ils doivent être examinés séparément lorsqu'ils sont insérables, sans déduire que leur création depuis l'éditeur est pertinente ou autorisée.

## Accès et enregistrement

[ResourceWorkbench](../packages/client/src/pages/workspace/ResourceWorkbench.tsx) utilise la session partagée, attend son flush avant ouverture étendue, puis recharge. La suppression n'est présentée que si la capacité serveur l'autorise. [ReferenceSearchDialog](../packages/client/src/components/editor/ReferenceSearchDialog.tsx) distingue les résultats préférés avant le regroupement du reste par dossier.

Ces branches existent dans le code. Leur découvrabilité, le placement du sélecteur et la commande de création inline sont des sujets de la catégorie à travailler ensemble, et ne sont pas décidés par cet audit.

## Suite et décisions

- Recetter les huit variantes sur une copie de développement compatible : création/import, réouverture, édition lorsqu'autorisée et accès aux actions. L'inventaire est complet au niveau du contrat ; la recette IHM ne l'est pas encore.
- Utiliser les incidents reproduits pour corriger uniquement les écarts techniques au comportement établi.
- Présenter ensemble les choix de parcours, notamment les points d'entrée des événements et la création inline. Aucun type ne doit être exclu sur la seule base des exemples oraux.
