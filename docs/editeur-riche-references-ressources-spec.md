# Éditeur riche, références et inclusions de ressources

## Statut

Ce document fixe la cible fonctionnelle de l’éditeur Markdown riche de Hall. Il décrit les comportements attendus en édition, en lecture et à l’impression. L’état actuel est recensé pour mesurer les écarts, mais il ne constitue pas la norme.

La frontière d’architecture reste définie dans [`references-internes-et-presentations-de-ressources.md`](references-internes-et-presentations-de-ressources.md). La présente spec est centrée sur l’expérience utilisateur.

## Décision du 11 septembre 2026

Le bouton d’insertion et le menu `@` utilisent le même parcours en mode compact et enrichi. Une ressource sélectionnée est insérée directement avec sa présentation ; seul le choix de feuille et de plage d’un tableur nécessite une étape supplémentaire. Les documents de l’affaire courante sont proposés avant les autres ressources, sans exclure celles-ci. Le Lab consomme cet éditeur commun.

## Objectifs

- écrire vite sans quitter le document pour chercher une information déjà présente dans Hall ;
- conserver des références internes stables plutôt que recopier des contenus ;
- insérer une ressource par un seul parcours, avec la même présentation dans tous les éditeurs ;
- garder la même intention entre édition, lecture et impression, sans reproduire les contrôles d’édition dans le document imprimé ;
- permettre une impression fiable, lisible et reproductible ;
- préserver l’autosave et la simplicité de l’éditeur compact.

Le terme « snippet » reste un terme de conversation. Le produit distingue trois objets :

1. le contenu local, directement écrit dans le Markdown ;
2. la référence inline, qui cite une entité Hall ;
3. l’inclusion en bloc, qui présente une ressource Hall.

Une image déposée peut être un actif local appartenant au contenu. Elle n’est pas automatiquement promue en ressource documentaire autonome.

## Synthèse normative

Une ressource insérée dans un contenu riche n’est jamais modifiable inline. L’éditeur ne fait qu’afficher une représentation adaptée et conserver le lien interne vers la ressource source.

L’activation par clic ou `Entrée` ouvre une modal de ressource au-dessus du document. Cette modal est la même surface de ressource que celle du Workspace, placée dans une autre enveloppe : Hall ne développe pas un second petit viewer pour l’éditeur riche.

La modal s’ouvre en lecture. Si la ressource possède une action de modification et si l’utilisateur y est autorisé, `Modifier` la fait passer en édition dans la même modal. Sa fermeture restitue le scroll, la sélection et le focus du document. Elle ne change donc ni la route ni l’historique de navigation.

`DocumentResource` est le type technique des fichiers téléversés. « Autre fichier » ne constitue pas un type de ressource supplémentaire : il désigne seulement un `DocumentResource` qui n’est ni une image ni un PDF, par exemple un DOCX, ODT ou PPTX.

| Type exact | Représentation dans le document | Modal à l’activation | Modification dans la modal | Impression |
| --- | --- | --- | --- | --- |
| `TextResource` | contenu Markdown rendu depuis la ressource, sans copie dans le document | texte complet rendu | oui, avec l’éditeur texte existant | contenu rendu |
| `DocumentResource` image | image inline, avec texte alternatif et légende éventuelle | image agrandie | non pour le fichier ; seules les métadonnées autorisées peuvent évoluer | image embarquée |
| `DocumentResource` PDF | lien inline avec icône et titre | viewer PDF existant | non pour le fichier ; téléchargement disponible | lien vers sa première page en annexe ; pages jointes automatiquement en fin de document |
| `DocumentResource` DOCX, ODT, PPTX ou autre | simple lien avec icône, titre et format | aperçu technique lorsqu’il existe, sinon fiche de téléchargement | non pour le fichier | titre et format |
| `RemoteResource` | lien avec icône, titre et domaine | fiche du lien et action d’ouverture externe | oui pour le titre et l’URL | lien externe actif, ouvert séparément du PDF |
| `LegalReferenceResource` | zone de citation : libellé, extrait court et source | référence complète, version et historique | pas de réécriture libre ; action de rafraîchissement lorsqu’elle est disponible | bloc avec libellé lié et texte de l’article, sans métadonnées techniques |
| `GeographicResource` | carte inline non modifiable, avec titre et légende | carte complète | oui, par `Modifier`, avec l’éditeur cartographique existant | image statique de la carte |
| `SpreadsheetResource` | feuille et plage converties en tableau HTML non modifiable | tableur complet positionné sur la plage | oui, par `Modifier`, avec l’éditeur de tableur existant | tableau HTML paginable |

Les contacts, membres, sujets, séances et délibérations ne sont pas des ressources documentaires. Ils restent des références inline ; leur activation ouvre un aperçu métier selon la même règle de modal et de retour au document. Un contact désigne une personne de l’annuaire ; un membre désigne son éventuel mandat au conseil et reste la seule référence utilisable pour le quorum, les présences et les votes.

Le « plein écran » désigne ici cette vue modale étendue : une modalité confortable de consultation ou d’édition, pas un second modèle de données ni une nouvelle navigation autonome.

### Unité de présentation et navigation

- chaque type fournit un seul corps de présentation réutilisable ;
- le Workspace et la modal ne fournissent que l’enveloppe, le titre, les actions et la disposition ;
- le corps reçoit explicitement le mode `lecture` ou `édition` et les capacités Siren disponibles ;
- la modal s’ouvre en lecture afin qu’un clic de consultation ne modifie rien ;
- `Modifier` reste dans la modal et utilise l’éditeur normal de la ressource ;
- `Échap`, la croix ou l’action `Fermer` rendent le focus au snippet d’origine ;
- une fermeture pendant un autosave attend sa fin ; un échec maintient la modal ouverte avec une erreur réparable ;
- aucune modal de second niveau n’est ouverte pour le plein écran d’un viewer déjà placé dans la modal.

## Surfaces concernées

| Propriétaire du contenu | Édition actuelle | Lecture actuelle | Destination documentaire |
| --- | --- | --- | --- |
| `TextResource.content` | éditeur compact et édition étendue | ressource en lecture seule ou aperçu | future impression de la ressource |
| `CouncilBusiness.report` | Workbench et préparation de séance | Workbench, préparation, séance, compte rendu | procès-verbal et documents préparatoires |
| `CouncilDecision.draftText` | Workbench et préparation de séance | préparation, séance, compte rendu | délibération et procès-verbal |
| `AgendaItem.discussionSummary` | conduite de séance | conduite et compte rendu | procès-verbal |
| `ContentTemplate.bodyMarkdown` et `subject` | grammaire partagée | aperçu serveur | PDF ou message généré |

Un comportement de référence ou d’inclusion doit être cohérent sur toutes ces surfaces. Une amélioration limitée à `TextResource` n’est pas une fonctionnalité complète.

## Carte de l’existant au 31 août 2026

### Capacités déjà utiles

- le même Markdown alimente l’éditeur compact, l’édition étendue et le rendu de lecture ;
- le mode compact propose les marques courantes, une liste, la recherche de références et l’accès au mode étendu ;
- le mode étendu ajoute annulation, rétablissement, styles de bloc, lien, listes et petit tableau éditorial ;
- le petit tableau sait être créé, redimensionné, aligné, fusionné, défusionné et alimenté par collage depuis Excel ou Word ;
- `@` et la recherche complète insèrent six références typées : contact, membre, ressource, sujet, séance et délibération ;
- les références conservent l’UUID interne et non une URL de navigation ;
- une image archivée ou déposée devient un bloc image avec alignement, largeur et aperçu ;
- le serveur sait rendre le Markdown, les petits tableaux et les images dans un PDF sans réseau ni JavaScript.

### Limites observées

| Élément | Dans l’éditeur | Hors édition | Impression actuelle |
| --- | --- | --- | --- |
| Contact, membre, sujet, séance, délibération | badge inline | badge inline | libellé résolu en texte |
| `TextResource` | contenu Markdown rendu | contenu rendu et ouverture au clic | contenu rendu |
| Image `DocumentResource` | bloc image | image et aperçu plein écran | image embarquée |
| PDF `DocumentResource` | lien inline | viewer au clic | lien interne et pages annexées dans l’ordre d’apparition |
| Autre `DocumentResource` | badge `resource` | viewer ou téléchargement au clic | titre et format |
| `RemoteResource` | lien inline | fiche de lien dans l’aperçu | lien externe actif |
| `LegalReferenceResource` | citation en bloc | référence complète au clic | libellé lié et texte de l’article, sans statut, licence ni attribution |
| `GeographicResource` | carte inline | carte complète au clic | image 16:9 avec fond, géométries et libellés |
| `SpreadsheetResource` | présenté comme « Fichier », puis badge `resource` | aperçu vide | titre seulement |

Le parcours commun insère désormais les présentations de ressources en bloc. La recherche ne demande pas si l’utilisateur veut citer ou inclure. Le libellé conservé dans le Markdown est affiché tel quel dans l’éditeur et peut donc devenir obsolète après un renommage. Les erreurs de résolution ne disposent pas encore d’un état visuel commun.

L’impression autoritaire existe pour les modèles et pour l’aperçu PDF du banc d’essai. Les autres contenus riches n’ont pas encore un pipeline d’impression unifié. Le brouillon de procès-verbal recopie actuellement leurs Markdown dans un document plus grand.

## Modèle fonctionnel cible

### Référence inline

Une référence cite une entité sans interrompre la lecture. Elle tient dans une phrase ou une cellule d’un petit tableau.

- elle affiche l’icône du type et le libellé courant résolu par Hall ;
- le libellé enregistré dans le Markdown sert de repli si la résolution devient impossible ;
- un clic ou `Entrée` ouvre un aperçu compact ;
- l’aperçu permet d’ouvrir l’entité source sans perdre le contexte d’édition ;
- sa sélection expose `Aperçu`, `Ouvrir`, `Inclure`, `Remplacer` et `Supprimer` lorsque ces actions sont pertinentes ;
- elle ne donne pas implicitement accès à une ressource que le lecteur n’a pas le droit de consulter.

Pour un contact, un membre, un sujet, une séance ou une délibération, la référence inline est la présentation normale. Une inclusion en bloc n’est proposée que lorsqu’une future présentation métier apporte une information réellement utile.

### Inclusion en bloc

Une inclusion montre une représentation de la ressource tout en conservant son identifiant interne.

- elle occupe une ligne ou un bloc autonome ;
- elle affiche une en-tête discrète avec le type et le titre courant ;
- son contenu est toujours en lecture seule ;
- un clic ouvre la vue étendue adaptée au type de ressource ;
- cette vue propose `Modifier la ressource` lorsque l’utilisateur possède la capacité correspondante ;
- sa sélection en édition permet seulement de remplacer la source, convertir la présentation ou supprimer le bloc ;
- une modification d’option rejoint l’autosave du contenu, sans bouton `Enregistrer` ;
- un squelette de même taille que le rendu final évite les déplacements de page pendant le chargement ;
- les options persistées forment un contrat fermé, jamais un JSON libre de composant.

### Actif image local

- le dépôt ou le collage d’un PNG/JPEG crée un actif appartenant au contenu ;
- l’image est insérée immédiatement à la position du curseur ;
- alignement, largeur, texte alternatif, ouverture et suppression sont accessibles au clavier ;
- retirer l’image du contenu supprime l’actif orphelin après sauvegarde ;
- une action explicite peut promouvoir l’actif en document durable, sans le faire automatiquement.

## Parcours d’insertion

### Citer rapidement

1. L’utilisateur tape `@` ou active `Insérer une référence`.
2. La recherche privilégie le dossier courant, les éléments récents et le texte déjà saisi.
3. Les résultats indiquent le vrai type : `Tableur`, `Carte`, `Référence juridique`, `PDF`, `Texte`, etc.
4. Flèches, `Entrée` et `Échap` suffisent à terminer le parcours.
5. Le choix insère immédiatement une référence inline et replace le curseur après elle.

### Inclure une ressource

1. Dans l’édition étendue, l’utilisateur active `Inclure une ressource` depuis le menu d’insertion.
2. La même recherche est utilisée, filtrée sur les ressources qui annoncent au moins une présentation disponible.
3. La présentation recommandée est présélectionnée selon le type.
4. Si aucune option n’est nécessaire, `Entrée` insère immédiatement le bloc.
5. Si une plage, un cadrage ou un extrait est nécessaire, Hall demande uniquement cette option avant l’insertion.
6. Le focus revient au document juste après le bloc.

### Transformer sans recommencer

- une référence de ressource peut devenir une inclusion sans relancer la recherche ;
- une inclusion peut redevenir une référence ;
- une inclusion peut changer de présentation sans perdre sa source ;
- `Remplacer` conserve les options compatibles et demande seulement celles qui ne le sont plus ;
- coller une URL interne Hall propose `Conserver l’URL`, `Référencer` ou `Inclure` ; `Annuler` restaure le texte collé.

Ces principes reprennent des conventions éprouvées : insertion par `@` et aperçu au clic pour les smart chips dans [Google Docs](https://support.google.com/docs/answer/10710316), changement de présentation inline/carte/embed après insertion dans les [Smart Links Atlassian](https://support.atlassian.com/platform-experiences/docs/smart-link-view-options/), et distinction entre mention légère, bloc et accès à la source dans [Notion](https://www.notion.com/help/writing-and-editing-basics).

## Contrat par mode

| Comportement | Édition compacte | Édition étendue | Lecture hors édition | Aperçu d’impression | Export formel |
| --- | --- | --- | --- | --- | --- |
| Saisie du texte | oui | oui | non | non | non |
| Référence inline | insertion et aperçu | insertion, aperçu, conversion | aperçu et ouverture | texte résolu | texte résolu figé |
| Inclusion en bloc | affichée et sélectionnable | insertion et configuration | interactive sans édition de la source | statique | statique et figée |
| Petit tableau éditorial | édition simple | édition complète | tableau HTML | tableau paginé | tableau paginé |
| Image locale | dépôt, sélection, taille | mêmes contrôles | image et aperçu | image | image embarquée |
| Contrôles d’édition | strict minimum | barre complète et contextuelle | aucun | aucun | aucun |
| Données de ressource | version courante | version courante | version courante autorisée | version courante prévisualisée | version ou représentation figée |

Le passage compact/étendu ne crée pas deux documents. La sélection, le curseur et le Markdown restent synchronisés. Fermer l’édition étendue rend le focus au bloc ou au texte qui était actif.

## Présentations par type de ressource

### `TextResource`

- référence avec titre courant ; le contenu du texte n’est pas recopié dans la note ;
- le clic ouvre la vue texte étendue en lecture seule ;
- la vue étendue passe en édition dans la même modal via `Modifier`, selon les droits ;
- l’impression conserve le titre de la ressource sans développer automatiquement son contenu.

### `DocumentResource`

#### Image PNG/JPEG

- présentation recommandée : image ;
- options : alignement, largeur, texte alternatif et légende facultative ;
- lecture : ouverture plein écran ;
- impression : image embarquée, proportions conservées, légende solidaire de l’image.

#### PDF

- référence inline avec titre et action d’aperçu ;
- les pages ne sont jamais injectées au milieu du corps ;
- chaque PDF référencé est ajouté une seule fois en fin de document, dans l’ordre de sa première apparition ;
- la référence du corps est un lien interne vers la première page de son annexe.

#### DOCX, ODT, PPTX et autres fichiers

- simple lien portant le titre de la ressource ;
- l’aperçu technique existant peut être ouvert, mais aucun contenu n’est converti implicitement dans la note ;
- impression sous forme de référence documentaire, avec annexe uniquement sur choix explicite.

### `RemoteResource`

- référence inline ou carte contenant titre, domaine et URL ;
- l’aperçu peut afficher les métadonnées déjà conservées par Hall ;
- aucun iframe et aucun chargement distant automatique ;
- l’impression écrit le titre et l’URL complète afin de rester utile hors de Hall.

### `LegalReferenceResource`

- référence inline : libellé de citation officiel, état et date de version dans l’aperçu ;
- inclusion `Citation juridique` : libellé, extrait officiel conservé, statut, date d’effet, source et attribution ;
- une version abrogée, future ou dont la vérification a échoué reste visible avec un état explicite ;
- l’impression utilise le snapshot juridique figé et affiche la source et la date de consultation.

### `GeographicResource`

- référence inline ou bloc `Carte` ;
- dans le contenu, la carte est affichée mais n’est pas modifiable ;
- un clic ouvre une vue cartographique étendue en lecture seule ;
- l’action `Modifier` active l’éditeur cartographique dans la même modal ;
- l’impression utilise un PNG rendu par le serveur avec attribution et empreinte, sans accès réseau.

### `SpreadsheetResource`

- référence inline ou bloc `Plage de tableur` ;
- l’insertion demande la feuille puis la plage, avec une sélection visuelle dans le tableur ;
- les identifiants de feuille et la plage sont conservés, pas une copie des cellules dans le Markdown ;
- le bloc est un tableau HTML en lecture seule montrant les valeurs calculées et les formats, ainsi que le nom de la feuille et la plage ;
- un clic ouvre le tableur étendu en lecture seule à la bonne feuille et à la bonne plage ;
- les formules ne sont jamais éditables depuis la note ; `Modifier` active l’éditeur de tableur dans la même modal ;
- l’impression produit un tableau HTML paginable à partir d’un snapshot figé et ne recalcule pas les formules ;
- une plage trop large n’est pas réduite jusqu’à devenir illisible : l’aperçu demande de réduire la plage ou de choisir une page paysage.

## Lecture hors édition

- les références et inclusions résolvent le titre et l’état courants ;
- aucune barre d’outils, poignée, contour de sélection ou bouton de suppression n’est visible ;
- le clic ouvre la modal de ressource commune ;
- la modal affiche `Modifier` uniquement lorsque la ressource est modifiable et que l’accès est autorisé ;
- une seule surface d’aperçu est ouverte à la fois, sans empiler les dialogues ;
- les actions essentielles ne dépendent pas uniquement du survol ;
- la lecture reste stable pendant le chargement et sur écran étroit.

## Impression et export

### Contrat PDF synthétique

Le PDF ne reproduit ni la modal ni les éditeurs. Le serveur transforme chaque référence ou représentation en contenu statique, avec les mêmes choix pour l’aperçu et l’export final.

| Élément | Rendu PDF | Donnée figée à l’export formel |
| --- | --- | --- |
| Membre, sujet, séance ou délibération | libellé résolu | identifiant et libellé utilisés |
| `TextResource` | titre de la ressource | identifiant, version et titre |
| Image `DocumentResource` ou actif local | image embarquée, texte alternatif et légende | octets ou empreinte de l’image |
| PDF `DocumentResource` | lien interne vers la première page de l’annexe ; pages concaténées en fin de document dans l’ordre d’apparition | identifiant, empreinte et première page d’annexe |
| Autre `DocumentResource` | titre et format | identifiant et empreinte du fichier |
| `RemoteResource` | lien externe actif demandé dans une nouvelle fenêtre | titre et URL utilisés |
| `LegalReferenceResource` | bloc avec libellé lié à la source officielle et texte de l’article | snapshot juridique identifié |
| `GeographicResource` | image 16:9 produite par le serveur, avec fond, géométries et libellés | image, cadrage et empreinte |
| `SpreadsheetResource` | tableau HTML paginable, valeurs calculées et formats | feuille, plage et snapshot du tableur |

Règles communes :

- l’aperçu PDF et l’export formel utilisent le même renderer serveur ;
- l’export n’exécute ni JavaScript de ressource ni recalcul de formule ; le serveur peut récupérer le fond cartographique pendant la génération, puis l’embarque dans le PDF ;
- les routes internes, contrôles d’édition et boutons de modal ne sont jamais imprimés ;
- une inclusion absente, interdite ou incompatible bloque l’export formel avec un diagnostic relié au bloc ;
- l’aperçu peut afficher ce diagnostic sans créer de snapshot formel ;
- l’export enregistre un manifeste minimal des identifiants, versions ou empreintes effectivement utilisés.

### Prévisualisation

L’aperçu d’impression utilise le renderer serveur autoritaire. Il doit refléter le document qui sera produit, avec les mêmes diagnostics, pagination et ressources statiques. Il ne persiste pas une version formelle.

### Formalisation

Lors de la génération d’un document formel :

1. Hall résout toutes les références et inclusions avec les droits du générateur ;
2. il bloque la génération si une inclusion est absente, interdite, cyclique ou incompatible ;
3. il présente une liste d’erreurs reliées aux blocs concernés ;
4. il fige la version ou la représentation de chaque ressource incluse ;
5. il produit le document et son manifeste d’empreintes.

Une référence inline non résolue conserve son libellé de repli dans le brouillon, mais elle est signalée dans le préflight d’un document formel. Une inclusion non résolue n’est jamais remplacée silencieusement par une zone vide.

### Règles de mise en page

- une carte, une image, une carte géographique et leur légende évitent une coupure interne ;
- un tableau peut continuer sur plusieurs pages, répète ses en-têtes et ne coupe pas une ligne ;
- un extrait juridique garde son titre avec au moins les premières lignes de son texte ;
- le texte inclus suit la pagination normale du document ;
- les contrôles, badges de sélection et identifiants techniques ne sont jamais imprimés ;
- les URL externes utiles sont écrites ; les routes internes Hall ne le sont pas ;
- le rendu reste lisible en niveaux de gris.

## États dégradés

| État | En édition | En lecture | À la formalisation |
| --- | --- | --- | --- |
| Chargement | squelette stable | squelette stable | attente bornée puis erreur |
| Ressource absente | bloc conservé, libellé de repli, `Remplacer` | indisponibilité explicite | blocage |
| Accès refusé | type et libellé autorisés, contenu masqué | contenu masqué | blocage |
| Type devenu incompatible | options conservées, action de réparation | présentation indisponible | blocage |
| Ressource mise à jour | version courante et indicateur discret | version courante | nouvelle version annoncée avant gel |
| Échec d’aperçu technique | référence et ouverture source restent disponibles | action `Réessayer` | utilisation du renderer autoritaire ou blocage |

Le Markdown d’origine n’est jamais supprimé parce qu’une résolution échoue.

## Persistance et cycle de vie

- le Markdown conserve l’identifiant interne et l’intention de présentation ;
- le libellé enregistré est un repli, pas une copie autoritaire du titre ;
- toutes les directives qui référencent une ressource alimentent `rich_text_resource_references` ;
- une ressource encore référencée ne peut pas être supprimée sans résolution explicite de ses usages ;
- retirer une référence durable ne supprime pas la ressource ;
- retirer un actif image local peut supprimer cet actif après réconciliation et autosave ;
- copier-coller dans Hall conserve la référence interne ; copier comme texte simple restitue le libellé lisible ;
- l’export formel conserve les versions et empreintes nécessaires à sa reproduction.

## Accessibilité et clavier

- `@`, recherche, filtres, résultats, choix de présentation et options sont utilisables sans souris ;
- la recherche annonce le nombre de résultats et le type de l’élément actif ;
- `Entrée` insère, `Échap` annule et rend le focus au point de départ ;
- une référence ou inclusion atomique est sélectionnable avec les flèches et supprimable avec `Retour arrière` ou `Suppr` ;
- la barre contextuelle possède un nom accessible et ne déplace pas le contenu ;
- les images exigent un texte alternatif, modifiable après insertion ;
- couleur et icône ne sont jamais les seuls porteurs d’un état.

## Scénarios comportementaux

### EDR-REF-001 — Insérer une référence au clavier

```gherkin
Étant donné un curseur dans un paragraphe
Quand l’utilisateur tape @ puis recherche une ressource et valide avec Entrée
Alors une référence inline est insérée à la position du curseur
Et le curseur est placé juste après la référence
Et le Markdown conserve l’identifiant immuable de la ressource
```

### EDR-REF-002 — Afficher le libellé courant

```gherkin
Étant donné une référence dont la ressource a été renommée
Quand le contenu est rouvert
Alors la référence affiche le titre courant
Et conserve le libellé du Markdown comme repli uniquement
```

### EDR-REF-003 — Ouvrir sans perdre le contexte

```gherkin
Étant donné une référence résolue
Quand l’utilisateur l’active
Alors Hall ouvre la ressource dans une modal sans changer de route
Et la fermeture ramène au même contenu, au même scroll et à la même position de focus
```

### EDR-VIEW-001 — Modifier sans quitter le document

```gherkin
Étant donné une ressource modifiable ouverte dans sa modal en lecture
Quand l’utilisateur active Modifier
Alors le même corps de ressource passe en édition dans la même modal
Et la fermeture attend la fin de l’autosave
Et un échec de sauvegarde maintient la modal ouverte avec une action de reprise
```

### EDR-EMB-001 — Inclure avec la présentation recommandée

```gherkin
Étant donné l’édition étendue d’un contenu
Quand l’utilisateur choisit Inclure une ressource puis une ressource sans option obligatoire
Alors le bloc recommandé est inséré immédiatement
Et son en-tête indique le type et le titre de la source
Et aucune copie de la ressource n’est stockée dans le Markdown
```

### EDR-EMB-002 — Transformer une référence

```gherkin
Étant donné une référence de ressource sélectionnée
Quand l’utilisateur choisit Inclure
Alors la référence devient un bloc sans relancer la recherche
Et l’annulation restaure la référence précédente
```

### EDR-EMB-003 — Modifier ou remplacer

```gherkin
Étant donné une inclusion configurée
Quand l’utilisateur modifie sa présentation ou remplace sa source
Alors les options compatibles sont conservées
Et seules les options devenues nécessaires sont demandées
Et la modification suit l’autosave du contenu
```

### EDR-MODE-001 — Passer du mode compact au mode étendu

```gherkin
Étant donné un curseur ou un bloc sélectionné dans l’éditeur compact
Quand l’utilisateur ouvre puis ferme l’édition étendue
Alors il retrouve le même contenu et la même position logique
Et aucune sauvegarde concurrente ni perte de Markdown ne se produit
```

### EDR-READ-001 — Lire sans contrôles d’édition

```gherkin
Étant donné un contenu hors édition avec des références et inclusions
Quand il est affiché dans le Workbench, une séance ou un compte rendu
Alors aucune commande d’édition n’est visible
Et chaque ressource résolue peut être prévisualisée ou ouverte selon les droits
```

### EDR-STATE-001 — Conserver une inclusion non résolue

```gherkin
Étant donné une inclusion dont la source ne peut plus être résolue
Quand le contenu est édité
Alors le bloc reste présent avec son libellé de repli
Et il propose Remplacer ou Réessayer
Et le Markdown original est conservé
```

### EDR-TEXT-001 — Consulter une ressource texte sans l’inclure

```gherkin
Étant donné une référence vers une ressource texte
Quand l’utilisateur active cette référence
Alors Hall ouvre la vue texte étendue en lecture seule
Et le texte n’est pas recopié dans le contenu courant
Et l’action Modifier active son éditeur dans la même modal lorsque l’utilisateur y est autorisé
```

### EDR-DOC-001 — Relier la référence PDF à son annexe

```gherkin
Étant donné plusieurs références vers des PDF dans un contenu riche
Quand le document est imprimé
Alors chaque référence reste inline dans le corps
Et chaque PDF est ajouté une seule fois à la fin dans l’ordre de première apparition
Et chaque référence ouvre la première page de son PDF annexé
```

### EDR-LEGAL-001 — Imprimer l’article sans métadonnées techniques

```gherkin
Étant donné une inclusion de référence juridique résolue
Quand un document formel est généré
Alors le libellé de l’article est imprimé comme lien vers la source officielle
Et le texte de l’article est imprimé sous ce libellé
Et le statut, la licence et l’attribution ne sont pas imprimés
Et le manifeste identifie le snapshot juridique utilisé
```

### EDR-MAP-001 — Consulter puis modifier une carte

```gherkin
Étant donné une carte incluse dans un contenu
Quand l’utilisateur active la carte
Alors Hall ouvre une vue cartographique étendue en lecture seule
Et aucune modification ne se produit dans le contenu riche
Et l’action Modifier active l’éditeur cartographique dans la même modal
Quand ce document est imprimé
Alors la carte conserve son ratio 16:9, sa largeur et son alignement
Et le fond cartographique, les géométries et leurs libellés sont embarqués dans le PDF
```

### EDR-SHEET-001 — Consulter une plage de tableur

```gherkin
Étant donné un tableur à plusieurs feuilles
Quand l’utilisateur inclut une feuille et une plage
Alors le bloc affiche un tableau HTML non modifiable avec les valeurs calculées et les formats correspondants
Et un clic ouvre le tableur étendu en lecture seule à la bonne plage
Et l’action Modifier active l’éditeur de tableur dans la même modal
```

### EDR-SHEET-002 — Figer une plage à l’impression

```gherkin
Étant donné une plage de tableur incluse
Quand un document formel est généré
Alors les valeurs et formats proviennent d’un snapshot identifié
Et aucune formule n’est recalculée pendant le rendu
Et les en-têtes sont répétés si le tableau continue sur une autre page
```

### EDR-PRINT-001 — Prévisualiser le document autoritaire

```gherkin
Étant donné un contenu modifié mais non formalisé
Quand l’utilisateur ouvre l’aperçu d’impression
Alors le serveur rend le même document statique que l’export
Et les diagnostics pointent les références ou inclusions à corriger
Et aucun snapshot formel n’est créé
```

### EDR-PRINT-002 — Bloquer une formalisation incomplète

```gherkin
Étant donné une inclusion absente, interdite, cyclique ou incompatible
Quand l’utilisateur demande un export formel
Alors Hall ne produit pas silencieusement un document incomplet
Et présente la liste des blocs à réparer
```

### EDR-ASSET-001 — Nettoyer une image locale retirée

```gherkin
Étant donné une image locale appartenant au contenu
Quand l’utilisateur la retire et que l’autosave réussit
Alors la référence de contenu est réconciliée
Et l’actif orphelin est supprimé
Et aucune ressource documentaire durable n’est supprimée
```

## Critères d’alignement

L’implémentation sera alignée lorsque :

- chaque type de ressource porte le bon libellé et dispose d’un aperçu hors édition ;
- la référence inline et l’inclusion en bloc sont deux présentations convertibles d’une même source ;
- les inclusions texte, document, web, juridique, carte et tableur respectent la matrice ci-dessus ;
- la collecte des références couvre toutes les directives ;
- l’aperçu PDF et l’export formel utilisent les mêmes renderers serveur ;
- les états de chargement, absence, interdiction et incompatibilité sont explicites et stables ;
- les scénarios de cette spec sont couverts à la frontière adaptée, sans retester les moteurs internes des composants spécialisés.
