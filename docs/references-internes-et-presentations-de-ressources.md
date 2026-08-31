# Références internes et présentations de ressources

## Statut du document

Cette note fixe la direction fonctionnelle et les frontières d'architecture retenues pour intégrer les ressources Hall dans les contenus riches. Elle prépare un chantier ultérieur ; elle ne décrit pas une fonction déjà complètement implémentée.

La spec comportementale normative est [`editeur-riche-references-ressources-spec.md`](editeur-riche-references-ressources-spec.md). Elle décrit l’ergonomie cible en édition, en lecture et à l’impression.

Le mot « snippet » est employé dans les échanges pour parler d'un élément inséré dans une note. Dans le code, il faut distinguer une référence, une présentation de ressource et un actif appartenant au contenu. Ne pas introduire un type métier générique `Snippet` qui confondrait ces responsabilités.

## Contenus concernés

La grammaire riche est utilisée dans plusieurs propriétaires :

- le contenu d'une `TextResource` ;
- le rapport d'un `CouncilBusiness` ;
- le projet de texte d'une `CouncilDecision` ;
- la synthèse de discussion d'un `AgendaItem` ;
- les modèles documentaires qui utilisent la même autorité de grammaire et le rendu serveur.

Une évolution doit rester commune à ces contenus. Elle ne doit pas être implémentée uniquement dans l'écran d'une ressource texte.

## Vocabulaire retenu

### Contenu local

Le contenu est porté directement par le Markdown : paragraphes, listes, mise en forme et petits tableaux éditoriaux. Le tableau rapide de Tiptap reste disponible pour présenter quelques données. Il ne crée pas une `SpreadsheetResource` et ne dépend pas du tableur.

### Actif d'éditeur

Une image déposée dans l'éditeur peut rester un document temporaire de type `editorAsset`, rattaché à son propriétaire. Ce rattachement est légitime : toute image insérée n'a pas vocation à devenir une ressource documentaire durable et autonome.

L'actif peut être promu explicitement en document durable lorsque le besoin existe. Cette promotion ne doit pas être automatique.

### Référence interne

Une référence interne désigne une entité Hall par son identifiant immuable. Pour une ressource, la syntaxe existante est :

```markdown
:resource[Rapport préparatoire]{#resource-id}
```

La référence reste inline, légère et cliquable. Elle ne contient pas une copie de la ressource et ne change pas de nature selon le type de celle-ci.

### Présentation de ressource

Une présentation est un bloc visible construit à partir d'une ressource interne. Elle conserve l'identifiant de la ressource et ajoute seulement l'intention de présentation nécessaire : plage d'un tableur, cadrage d'une carte, extrait juridique ou carte documentaire.

Le nom technique provisoire est `ResourceEmbed` et la directive proposée est `resource-embed` :

```markdown
::resource-embed[Budget primitif]{#resource-id presentation="table" range="A1:F20"}
```

Le nom et les attributs devront être validés dans `@hall/templating` avant implémentation. Les options doivent former un contrat fermé et validé ; ne pas stocker du JSON libre ou la configuration interne d'un composant React dans le Markdown.

### Représentation figée

Une représentation figée est l'artefact produit pour un export ou un document formel. Elle conserve la ressource source, sa version ou son empreinte, les paramètres de présentation et le résultat rendu. Elle ne remplace pas la référence interne présente dans la note.

## Décisions fonctionnelles

1. Hall conserve au maximum les références internes. Une inclusion visuelle reste une référence à une ressource Hall.
2. La référence inline et l'inclusion en bloc sont deux choix explicites et convertibles. `@` cite rapidement ; la commande d’inclusion crée un bloc riche.
3. Le contenu d'une ressource durable n'est pas recopié dans le Markdown de la note.
4. Une présentation en cours de rédaction suit la version courante de la ressource.
5. Un export formel ou une occurrence figée doit être reproductible à partir d'une version, d'une empreinte ou d'une représentation immuable.
6. Toute présentation fournit une action pour ouvrir la ressource source dans Hall.
7. Le tableau éditorial rapide et la ressource tableur restent deux fonctions distinctes.
8. Les images temporaires appartenant à un contenu restent autorisées.

## État actuel à connaître

- `@hall/templating` est l'autorité partagée de la grammaire Markdown.
- `:resource[...]` porte actuellement seulement un identifiant et un libellé.
- `::image[...]` est déjà un précédent de présentation en bloc adossée à une ressource.
- La recherche de l'éditeur propose les ressources sous un type de référence commun.
- Le badge de référence ouvre un `ResourcePreview` fourni au composant technique par un provider.
- L'aperçu ne couvre pas encore uniformément tous les types de ressources.
- Le rendu serveur des modèles remplace actuellement une référence de ressource par son titre ; il ne produit pas une inclusion riche.
- `rich_text_resource_references` conserve la relation entre le propriétaire du contenu et la ressource. Cette relation protège notamment la suppression, mais ne porte ni présentation ni version.
- Le snapshot actuel d'un point à l'ordre du jour conserve l'association aux ressources, pas une copie versionnée de tous leurs contenus.
- La ressource tableur est éditable et persistée dans le workspace ; son aperçu et son inclusion dans un contenu riche restent à construire.

## Frontières des packages partagés

### `@hall/domain`

Ce package porte le vocabulaire anglais commun au client et au serveur : `Resource`, ses variantes, leurs données versionnées et les contrats de présentation qui ont un sens produit.

Il peut à terme exposer un contrat fermé comparable à :

```ts
type ResourcePresentation =
  | { kind: "resourceCard" }
  | { kind: "textExcerpt" }
  | { kind: "legalExcerpt" }
  | { kind: "mapImage" }
  | { kind: "tableRange"; range: string };
```

Cet exemple fixe la forme générale, pas les noms définitifs. Le domaine ne doit importer ni React, ni Univer, ni OpenLayers, ni Chromium.

### `@hall/templating`

Ce package reste l'unique autorité pour :

- la syntaxe de la directive ;
- la validation structurelle de ses attributs ;
- la collecte des références ;
- la sérialisation canonique ;
- les diagnostics communs au client et au serveur.

Le client ne doit pas développer un second parseur de directive. Le serveur ne doit pas accepter des options que la grammaire partagée refuse.

### `@hall/api-contract`

Le contrat Siren indique les actions autorisées et les présentations disponibles. Le client ne déduit pas les capacités à partir du rôle ou du seul `resource.kind`.

Une ressource peut annoncer, selon son état et les permissions :

- la consultation de sa référence ;
- les présentations qu'elle permet ;
- la lecture de ses données de présentation ;
- la modification de son contenu dans son éditeur propre ;
- l'accès à une représentation statique ou imprimable.

### Serveur

Le serveur reste autoritaire pour :

- charger la ressource et contrôler les permissions ;
- valider les options propres à son type ;
- calculer les valeurs d'un tableur sans exécution dynamique ;
- produire les représentations statiques et imprimables ;
- empêcher les inclusions récursives ou cycliques ;
- figer les versions et empreintes utilisées par un export ;
- produire les diagnostics lorsqu'une référence est absente ou incompatible.

Le serveur ne doit pas charger une page web distante pour fabriquer un aperçu. Le rendu PDF existant désactive JavaScript et bloque le réseau ; cette propriété doit être conservée.

### Client

Le client reste responsable de l'interaction :

- rechercher et sélectionner une ressource ;
- appliquer l’intention choisie par le point d’entrée et permettre ensuite de convertir « Référencer » en « Inclure » selon les capacités Siren ;
- recueillir une plage, un cadrage ou une autre option bornée ;
- afficher la ressource dans une modal commune, d’abord en lecture ;
- activer son éditeur propre dans cette même modal lorsque l’action Siren de modification existe ;
- restituer le scroll, la sélection et le focus du contenu à la fermeture, sans changer de route.

Les composants techniques de `packages/client/src/components/editor` restent agnostiques du domaine. Ils reçoivent les présentations et actions par propriétés ou providers. Les composants propres aux cartes, références juridiques et tableurs restent dans leurs features.

Le corps de présentation de chaque ressource est partagé entre le Workspace et la modal. Ces deux surfaces ne sont que des enveloppes ; elles ne doivent pas maintenir deux viewers ou deux éditeurs divergents pour une même ressource.

## Présentation attendue par type de ressource

| Type de ressource | Dans Hall | Dans un export PDF |
| --- | --- | --- |
| `TextResource` | Référence ; lecture ou édition du texte dans la modal commune | Titre de la ressource |
| `DocumentResource` image | Image inline et aperçu agrandi | Image embarquée |
| `DocumentResource` PDF | Lien ou carte et viewer PDF | Titre ; ajout des pages en annexe seulement sur choix explicite |
| Autre `DocumentResource` | Lien titré et téléchargement ; ce n’est pas une nouvelle nature de ressource | Titre et format |
| `RemoteResource` | Carte et ouverture de l'URL | Titre, domaine et URL ; aucun iframe et aucun chargement distant |
| `LegalReferenceResource` | Citation, état, extrait officiel et ouverture | Snapshot juridique, source, date et attribution |
| `GeographicResource` | Carte liée à la ressource | PNG figé avec cadrage, empreinte et attribution, sans réseau au rendu final |
| `SpreadsheetResource` | Plage sélectionnée et ouverture du tableur | Tableau HTML paginable avec valeurs calculées et formats |
| Image `editorAsset` | Image intégrée avec contrôles de taille et alignement | Image embarquée, liée à son propriétaire |

## Versionnement et reproductibilité

Une version optimiste sert à détecter les conflits d'édition ; elle ne suffit pas à reproduire un ancien document si le contenu précédent n'est plus disponible.

Le chantier doit donc choisir une stratégie explicite pour chaque ressource mutable :

- conserver des révisions de la donnée source ;
- ou conserver, lors de la formalisation, une représentation immuable accompagnée de son empreinte ;
- ou combiner les deux lorsque la valeur probatoire le justifie.

Le manifeste d'un rendu formel doit au minimum identifier :

- le propriétaire du contenu rendu ;
- la ressource référencée ;
- sa version ou son empreinte ;
- le type et les options de présentation ;
- l'empreinte de la représentation produite ;
- la date de génération.

Une ressource juridique doit pointer le snapshot juridique utilisé. Une carte doit employer une image avec attribution déjà disponible lors du rendu final. Un tableur doit rendre une représentation figée de son snapshot et ne pas recalculer ses formules pendant la production d’un document formel.

## Parcours IHM cible

1. Pour citer, l’utilisateur tape `@` ou ouvre la recherche de références, puis sélectionne une entité. Hall insère immédiatement une référence inline.
2. Pour présenter une ressource, il active `Inclure une ressource`, puis utilise la même recherche filtrée sur les présentations disponibles.
3. Pour une inclusion, Hall demande uniquement les options utiles au type de ressource.
4. L'éditeur insère un bloc portant l'identifiant interne et les options validées.
5. Une référence et une inclusion restent convertibles sans rechercher à nouveau la source.
6. Le bloc affiche le titre, le type, son état et une action d'ouverture sans dupliquer les informations déjà propriétaires ailleurs.
7. En cas d'échec de résolution, le contenu Markdown reste conservé et le bloc affiche une erreur exploitable.

Tous les contrôles fonctionnels introduits dans ce parcours doivent posséder un `data-testid` stable conformément à `docs/principes-interface.md`.

## Ordre de réalisation recommandé

1. Extraire de chaque Workbench un corps de ressource réutilisable en lecture ou en édition.
2. Faire de `ResourcePreview` la modal commune qui héberge ces mêmes corps sans changer de route.
3. Stabiliser dans `@hall/templating` le contrat d'une présentation en bloc.
4. Étendre la collecte des références et la protection contre la suppression aux nouvelles directives.
5. Créer côté serveur un registre de renderers par type de ressource.
6. Ajouter le node Tiptap technique et son provider de présentation.
7. Ajouter la représentation PNG des cartes et le tableau HTML des plages de tableur.
8. Construire l'export PDF autoritaire des notes avec son manifeste de versions et d'empreintes.

## Hors périmètre initial

- convertir automatiquement un petit tableau Markdown en ressource tableur ;
- exporter ou réimporter une inclusion au format XLSX ;
- embarquer une page web distante dans un PDF ;
- exécuter du JavaScript de ressource pendant un rendu ;
- promouvoir automatiquement toutes les images temporaires ;
- autoriser des inclusions récursives sans limite ;
- recopier le contenu complet d'une ressource dans le Markdown.

## Fichiers de départ pour le prochain agent

- `packages/templating/src/grammar.ts`
- `packages/templating/src/document.ts`
- `packages/client/src/components/editor/references.tsx`
- `packages/client/src/components/MarkdownView.tsx`
- `packages/client/src/features/documents/ResourcePreview.tsx`
- `packages/client/src/hooks/useReferenceMentionables.ts`
- `packages/server/src/services/templateRendering.ts`
- `packages/server/src/services/editorAssetService.ts`
- `packages/server/src/infrastructure/database/queries.ts`
- `docs/principes-interface.md`

Avant toute modification, le prochain agent doit vérifier le diff en cours : l'implémentation de la ressource tableur est actuellement partielle et partage plusieurs de ces contrats.
