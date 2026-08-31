# Tableur — scénarios d’interaction de référence Excel

## Objet du document

Ce document décrit, en pseudo-Gherkin non exécutable, les comportements Excel retenus comme références pour
l’expérience du tableur Hall. Chaque scénario possède un identifiant stable qui doit apparaître dans le titre du
test Playwright correspondant.

Un scénario n’est **couvert** que si son parcours Playwright pilote l’interface réelle avec des `data-testid`,
vérifie le résultat fonctionnel et passe. Une fonction pure ou un test de module ne suffit pas à couvrir une
interaction. Une ligne marquée « à couvrir » ou « rouge » est un écart connu, pas une conformité revendiquée.

Le périmètre recherché est celui d’un usage courant de tableur municipal : saisie, formules, références,
recopie, Somme automatique, mise en forme, structure de la feuille et persistance. Les fonctions avancées
d’Excel qui ne sont pas proposées par Hall (macros, Power Query, tableaux croisés, solveur, etc.) ne font pas
partie de ce contrat.

## Sources de référence

- **MS-FB** — [Modifier le contenu d’une cellule](https://support.microsoft.com/fr-fr/excel/edit-cell-contents) :
  édition directe ou dans la barre de formule, mode édition, `F2`, `Entrée` et `Échap`.
- **MS-KB** — [Raccourcis clavier dans Excel](https://support.microsoft.com/fr-fr/accessibility/excel/keyboard-shortcuts-in-excel) :
  barre de formule, `Ctrl+Maj+U`, `F2`, `F4`, validation, annulation et recopie.
- **MS-ML** — [Nouveautés de Microsoft 365 pour le web](https://support.microsoft.com/en-us/office/whats-new/what-s-new-in-microsoft-365-for-the-web) :
  barre de formule redimensionnable pour lire et parcourir un contenu multiligne.
- **MS-REF** — [Créer ou modifier une référence de cellule](https://support.microsoft.com/fr-fr/excel/create-or-change-a-cell-reference) :
  sélection dans la grille, couleurs, déplacement d’une bordure et redimensionnement par un coin.
- **MS-AC** — [Utiliser la saisie semi-automatique de formule](https://support.microsoft.com/en-us/excel/use-formula-autocomplete) :
  déclenchement, navigation, insertion au curseur et conservation du suffixe.
- **MS-FX** — [Insérer une fonction dans Excel](https://support.microsoft.com/en-us/excel/insert-function-in-excel) et
  [fonctions imbriquées](https://support.microsoft.com/en-us/excel/using-functions-and-nested-functions-in-excel-formulas) :
  catalogue, catégories, syntaxe, aide et arguments.
- **MS-SUM** — [Utiliser Somme automatique](https://support.microsoft.com/fr-fr/excel/use-autosum-to-sum-numbers-in-excel) et
  [en savoir plus sur SOMME](https://support.microsoft.com/fr-fr/excel/learn-more-about-sum) :
  détection verticale et horizontale, arrêt au premier blanc, plusieurs totaux et menu de fonctions.
- **MS-FILL** — [Recopier une formule avec la poignée de recopie](https://support.microsoft.com/en-us/excel/copy-a-formula-by-dragging-the-fill-handle-in-excel-for-mac) et
  [références relatives, absolues et mixtes](https://support.microsoft.com/en-us/excel/switch-between-relative-absolute-and-mixed-references) :
  translation des références lors de la recopie.
- **MS-ROW** — [Insérer ou supprimer des lignes et colonnes](https://support.microsoft.com/en-us/excel/get-started/insert-or-delete-rows-and-columns-in-excel).
- **MS-MERGE** — [Fusionner et défusionner des cellules](https://support.microsoft.com/en-us/excel/get-started/merge-and-unmerge-cells-in-excel).
- **MS-FMT** — [Mettre en forme le texte des cellules](https://support.microsoft.com/en-us/excel/format-text-in-cells) et
  [formats de nombre disponibles](https://support.microsoft.com/en-us/excel/get-started/available-number-formats-in-excel).
- **MS-UNDO** — [Annuler, rétablir ou répéter une action](https://support.microsoft.com/en-us/office/foundations-experiences/undo-redo-or-repeat-an-action).
- **MS-NAME** — [Sélectionner des cellules ou plages spécifiques](https://support.microsoft.com/fr-fr/excel/select-specific-cells-or-ranges-in-excel) :
  zone Nom située à gauche de la barre de formule.
- **MS-SEL** — [Sélectionner le contenu de cellules](https://support.microsoft.com/en-us/excel/get-started/select-cell-contents-in-excel) :
  sélection par glisser, clavier, en-têtes et sélections non adjacentes.
- **MS-STATUS** — [Afficher des données récapitulatives dans la barre d’état](https://support.microsoft.com/en-us/excel/view-summary-data-on-the-status-bar) :
  moyenne, nombre et somme de la sélection numérique.
- **MS-ERR** — [Détecter les erreurs dans les formules](https://support.microsoft.com/en-us/excel/detect-formula-errors-in-excel) :
  erreurs `#DIV/0!`, `#NAME?`, `#REF!`, `#VALUE!` et autres valeurs d’erreur Excel.
- **MS-SORT** — [Trier des données dans une plage ou un tableau](https://support.microsoft.com/en-us/excel/sort-data-in-a-range-or-table-in-excel) :
  tri croissant ou décroissant en conservant les lignes de données cohérentes.

## Fonctionnalité : sélectionner dans la feuille

### EXL-SEL-001 — Sélectionner une plage à la souris

```gherkin
Étant donné le tableur ouvert
Quand l’utilisateur glisse de B2 à D4 avec le bouton principal
Alors la plage B2:D4 devient la sélection active
Et la cellule active reste identifiable dans la plage
```

Source : MS-SEL.

### EXL-SEL-002 — Étendre la sélection au clavier

```gherkin
Étant donné la cellule B2 sélectionnée
Quand l’utilisateur maintient Maj et appuie sur Flèche bas puis Flèche droite
Alors la sélection s’étend jusqu’à C3
```

Source : MS-SEL.

### EXL-SEL-003 — Sélectionner une ligne entière

```gherkin
Étant donné le tableur ouvert
Quand l’utilisateur active le numéro de la ligne 3
Alors toute la ligne 3 devient sélectionnée
```

Source : MS-SEL.

### EXL-SEL-004 — Sélectionner une colonne entière

```gherkin
Étant donné le tableur ouvert
Quand l’utilisateur active la lettre de la colonne C
Alors toute la colonne C devient sélectionnée
```

Source : MS-SEL.

### EXL-SEL-005 — Ajouter une sélection non adjacente

```gherkin
Étant donné une première cellule ou plage sélectionnée
Quand l’utilisateur maintient Ctrl ou Cmd et sélectionne une autre cellule non adjacente
Alors les deux zones appartiennent à la sélection
```

Source : MS-SEL.

### EXL-SEL-006 — Sélectionner toute la feuille

```gherkin
Étant donné le focus dans la feuille
Quand l’utilisateur active le coin Tout sélectionner ou utilise le raccourci correspondant
Alors toutes les cellules de la feuille deviennent sélectionnées
```

Source : MS-SEL.

## Fonctionnalité : cellule active et barre de formule

### EXL-FB-001 — Afficher l’adresse et le contenu de la cellule active

```gherkin
Étant donné une cellule contenant une valeur ou une formule
Quand l’utilisateur sélectionne cette cellule
Alors la zone Nom affiche son adresse
Et la barre de formule affiche le contenu source de la cellule
Et la grille continue d’afficher le résultat calculé de la formule
```

Source : MS-FB, MS-NAME.

### EXL-FB-002 — Éditer directement dans la cellule

```gherkin
Étant donné une cellule sélectionnée
Quand l’utilisateur double-clique la cellule
Alors un éditeur apparaît dans la cellule
Et la barre de formule reflète le même contenu pendant la saisie
```

Source : MS-FB, MS-KB.

### EXL-FB-003 — Éditer depuis la barre de formule

```gherkin
Étant donné une cellule sélectionnée
Quand l’utilisateur place le curseur dans la barre de formule et modifie le texte
Alors la cellule active reste la cible de l’édition
Et le déplacement du curseur dans le texte ne déplace pas la sélection de grille
```

Source : MS-FB, MS-KB.

### EXL-FB-004 — Annuler l’édition

```gherkin
Étant donné une cellule en cours d’édition avec un contenu modifié non validé
Quand l’utilisateur active le bouton X
Alors l’édition se termine
Et la valeur ou formule antérieure est restaurée
Et aucune sauvegarde de la modification annulée n’est produite
```

Source : MS-FB, MS-KB.

### EXL-FB-005 — Valider l’édition

```gherkin
Étant donné une cellule en cours d’édition avec une saisie valide
Quand l’utilisateur active le bouton ✓
Alors la saisie devient le contenu de la cellule
Et la cellule affiche la valeur recalculée si la saisie est une formule
Et l’autosave persiste la modification
```

Source : MS-FB, MS-KB.

### EXL-FB-006 — Déplier la barre sur plusieurs lignes

```gherkin
Étant donné une formule plus longue que la largeur de la barre
Quand l’utilisateur active le contrôle de dépliage
Alors la barre de formule s’étend verticalement sur plusieurs lignes
Et la formule complète peut être parcourue et éditée
Et la feuille conserve son propre défilement sans déplacer le header du Workbench
```

Source : MS-ML, MS-KB. La dernière assertion est un invariant d’intégration Hall.

### EXL-FB-007 — Déplier ou replier au clavier

```gherkin
Étant donné que le focus se trouve dans le tableur
Quand l’utilisateur appuie sur Ctrl+Maj+U
Alors la barre de formule alterne entre l’état replié et l’état multiligne
Et le contenu et la position d’édition sont conservés
```

Source : MS-KB.

### EXL-FB-008 — Conserver une formule longue après repli et rechargement

```gherkin
Étant donné une formule longue validée depuis la barre dépliée
Quand l’utilisateur replie la barre puis recharge la ressource après autosave
Alors la formule source est inchangée
Et son résultat calculé est inchangé
```

Source : MS-ML. La persistance est un invariant Hall.

### EXL-FB-009 — Annuler l’édition avec Échap

```gherkin
Étant donné une cellule en cours d’édition avec un contenu modifié non validé
Quand l’utilisateur appuie sur Échap
Alors l’édition se termine
Et la valeur ou formule antérieure est restaurée
Et aucune sauvegarde de la modification annulée n’est produite
```

Source : MS-FB, MS-KB.

### EXL-FB-010 — Valider l’édition avec Entrée

```gherkin
Étant donné une cellule en cours d’édition avec une saisie valide
Quand l’utilisateur appuie sur Entrée
Alors la saisie devient le contenu de la cellule
Et la cellule affiche la valeur recalculée si la saisie est une formule
Et l’autosave persiste la modification
```

Source : MS-FB, MS-KB.

### EXL-FB-011 — Éditer directement avec F2

```gherkin
Étant donné une cellule sélectionnée
Quand l’utilisateur appuie sur F2
Alors l’éditeur direct de la cellule est actif
Et le curseur est placé à la fin du contenu
Et la barre de formule reflète le même contenu
```

Source : MS-FB, MS-KB.

### EXL-NAME-001 — Aller à une cellule par la zone Nom

```gherkin
Étant donné le tableur ouvert
Quand l’utilisateur saisit l’adresse D12 dans la zone Nom et valide
Alors la cellule D12 devient la sélection active
Et elle est amenée dans la zone visible de la grille
```

Source : MS-NAME.

### EXL-NAME-002 — Sélectionner une plage par la zone Nom

```gherkin
Étant donné le tableur ouvert
Quand l’utilisateur saisit la plage B2:C3 dans la zone Nom et valide
Alors B2:C3 devient la sélection active
Et la zone Nom affiche l’adresse de la cellule active B2
```

Source : MS-NAME.

## Fonctionnalité : fonctions et saisie semi-automatique

### EXL-FX-001 — Proposer les fonctions à partir du préfixe saisi

```gherkin
Étant donné une saisie de formule après le signe égal
Quand l’utilisateur saisit le début d’un nom de fonction
Alors une liste dynamique des fonctions correspondantes apparaît
Et la correspondance la plus proche est sélectionnée
```

Source : MS-AC.

### EXL-FX-002 — Naviguer et insérer une suggestion

```gherkin
Étant donné la liste de saisie semi-automatique ouverte
Quand l’utilisateur navigue avec Haut ou Bas puis appuie sur Tab
Alors la fonction sélectionnée est insérée à la position du curseur
Et le texte situé après le curseur est conservé
```

Source : MS-AC.

### EXL-FX-003 — Compléter au milieu d’une formule imbriquée

```gherkin
Étant donné une formule imbriquée dont le curseur est avant un suffixe existant
Quand l’utilisateur choisit une fonction proposée
Alors la fonction est insérée au curseur
Et le préfixe et le suffixe de la formule restent inchangés
```

Source : MS-AC, MS-FX.

### EXL-FX-004 — Afficher la signature et l’argument actif

```gherkin
Étant donné une fonction suivie d’une parenthèse ouvrante
Quand l’utilisateur saisit ses arguments
Alors une aide affiche la syntaxe de la fonction
```

Source : MS-FX.

### EXL-FX-005 — Ouvrir le catalogue complet avec fx

```gherkin
Étant donné le bouton fx de la barre de formule
Quand l’utilisateur l’active
Alors le catalogue présente toutes les fonctions prises en charge par le moteur Hall
```

Source : MS-FX. L’exhaustivité est définie par le moteur installé, pas par une sélection manuelle.

### EXL-FX-006 — Respecter la locale française et anglaise

```gherkin
Étant donné l’interface en français
Quand l’utilisateur saisit =SOMME(1,5;2,5)
Alors les noms et séparateurs présentés sont français
Et une virgule décimale n’est pas confondue avec un séparateur d’arguments
Et le résultat calculé est 4
```

Source : contrat local Hall, catalogue documenté dans `docs/tableur-formules.md`.

### EXL-FX-008 — Mettre en évidence l’argument actif

```gherkin
Étant donné une formule contenant une fonction avec plusieurs arguments
Quand le curseur passe d’un argument au suivant
Alors l’aide de signature met en évidence uniquement l’argument courant
```

Source : MS-FX.

### EXL-FX-009 — Rechercher une fonction dans le catalogue

```gherkin
Étant donné le catalogue fx ouvert
Quand l’utilisateur saisit un nom ou un mot de recherche
Alors la liste se réduit aux fonctions correspondantes
Et le catalogue reste navigable au clavier
```

Source : MS-FX.

### EXL-FX-010 — Filtrer le catalogue par catégorie

```gherkin
Étant donné le catalogue fx ouvert
Quand l’utilisateur choisit une catégorie
Alors seules les fonctions de cette catégorie sont présentées
```

Source : MS-FX.

### EXL-FX-011 — Afficher l’aide de la fonction sélectionnée

```gherkin
Étant donné le catalogue fx ouvert
Quand l’utilisateur sélectionne une fonction documentée
Alors sa syntaxe et sa description disponibles apparaissent
Et une absence de description est signalée explicitement sans texte inventé
```

Source : MS-FX et contrat documentaire Hall.

### EXL-FX-012 — Insérer une fonction choisie dans le catalogue

```gherkin
Étant donné le catalogue fx ouvert et une cellule en cours d’édition
Quand l’utilisateur insère la fonction sélectionnée
Alors son nom et sa parenthèse ouvrante sont placés à la position du curseur
Et la cellule active reste la cible de la formule
```

Source : MS-FX.

### EXL-FX-007 — Respecter la syntaxe anglaise

```gherkin
Étant donné l’interface en anglais
Quand l’utilisateur saisit =SUM(1.5,2.5)
Alors les noms et séparateurs présentés sont anglais
Et le résultat calculé est 4
```

Source : contrat local Hall, catalogue documenté dans `docs/tableur-formules.md`.

## Fonctionnalité : références de cellules dans une formule

### EXL-REF-001 — Insérer une référence depuis la grille

```gherkin
Étant donné une formule en cours d’édition à une position de curseur déterminée
Quand l’utilisateur sélectionne une cellule ou glisse sur une plage dans la grille
Alors la référence correspondante est insérée à la position du curseur
Et aucun texte n’est ajouté hors de la syntaxe de la formule
```

Source : MS-REF.

### EXL-REF-002 — Colorer toutes les références distinctes

```gherkin
Étant donné une formule contenant plusieurs références de cellules ou plages
Quand la formule est sélectionnée ou éditée
Alors chaque référence reçoit une couleur stable distincte
Et la même couleur relie le token de formule à la bordure de plage dans la grille
Et chaque plage possède des coins carrés actionnables
```

Source : MS-REF.

### EXL-REF-003 — Identifier la référence sous le curseur

```gherkin
Étant donné une formule contenant plusieurs références colorées
Quand le curseur entre dans le texte d’une référence
Alors cette référence et sa plage sont visuellement accentuées
Et les autres références restent visibles sans devenir actives
```

Source : déduction d’interaction à partir de MS-REF, retenue par Hall.

### EXL-REF-004 — Déplacer une plage référencée

```gherkin
Étant donné une formule qui référence une plage colorée
Quand l’utilisateur glisse la bordure de cette plage vers une autre plage de même taille
Alors seule cette référence est remplacée par la nouvelle plage
Et les autres références et le reste de la formule sont inchangés
```

Source : MS-REF.

### EXL-REF-005 — Redimensionner une plage référencée

```gherkin
Étant donné une formule qui référence une plage colorée
Quand l’utilisateur glisse le coin carré de la plage
Alors la borne correspondante de cette référence suit la cellule survolée
Et seule cette référence est modifiée
Et la valeur calculée est mise à jour après validation
```

Source : MS-REF.

### EXL-REF-006 — Ne jamais concaténer une plage hors de l’appel de fonction

```gherkin
Étant donné la formule =SOMME(E2) et le curseur placé à la fin
Quand l’utilisateur glisse dans la grille de E2 à E4 pour étendre la référence existante
Alors la formule devient exactement =SOMME(E2:E4)
Et elle ne devient jamais =SOMME(E2)E2:E4
Et la cellule affiche le total de E2 à E4
Et après autosave et rechargement la formule et le résultat sont conservés
```

Source : MS-REF. Régression constatée manuellement le 30 août 2026.

### EXL-REF-007 — Modifier une référence sans altérer les références voisines

```gherkin
Étant donné la formule =SUM(B2:B3)+SUM(C2:C3)
Quand l’utilisateur étend uniquement la première plage jusqu’à B4
Alors la formule devient =SUM(B2:B4)+SUM(C2:C3)
Et la seconde référence conserve son texte, sa couleur et sa plage
```

Source : MS-REF.

### EXL-REF-008 — Basculer une référence relative, absolue ou mixte

```gherkin
Étant donné le curseur dans une référence de formule
Quand l’utilisateur appuie successivement sur F4
Alors la référence alterne entre relative, absolue et les deux formes mixtes
Et la plage visuelle continue de désigner les mêmes cellules
```

Source : MS-KB, MS-FILL.

## Fonctionnalité : poignée de recopie

### EXL-FILL-001 — Recopier une valeur

```gherkin
Étant donné une cellule contenant une valeur
Quand l’utilisateur glisse sa poignée de recopie sur des cellules adjacentes
Alors la valeur est recopiée dans les cellules de destination
```

Source : MS-FILL.

### EXL-FILL-002 — Ajuster les références relatives verticalement

```gherkin
Étant donné D2 contenant =ROUND(B2*C2,2)
Quand l’utilisateur recopie D2 d’une ligne vers le bas
Alors D3 contient =ROUND(B3*C3,2)
Et son résultat est calculé avec les valeurs de la ligne 3
```

Source : MS-FILL.

### EXL-FILL-003 — Préserver les références absolues et mixtes

```gherkin
Étant donné H2 contenant =$B$2+B2
Quand l’utilisateur étend H2 jusqu’à H4 avec un seul glisser de la poignée de recopie
Alors H3 contient exactement =$B$2+B3
Et H4 contient exactement =$B$2+B4
```

Source : MS-FILL.

### EXL-FILL-004 — Ajuster les références horizontalement

```gherkin
Étant donné une formule contenant des références relatives
Quand l’utilisateur glisse la poignée de recopie sur deux cellules vers la droite
Alors les colonnes relatives sont translatées
Et les colonnes absolues restent fixes
Et chaque cellule de destination reçoit la translation correspondant à sa colonne
```

Source : MS-FILL.

### EXL-FILL-005 — Ajuster uniquement la partie relative d’une référence mixte

```gherkin
Étant donné H2 contenant =B$2+$B2
Quand l’utilisateur étend H2 jusqu’à H4 avec un seul glisser de la poignée de recopie
Alors H3 contient exactement =B$2+$B3
Et H4 contient exactement =B$2+$B4
```

Source : MS-FILL.

### EXL-FILL-006 — Recopier vers le bas au clavier

```gherkin
Étant donné une cellule source et les cellules situées dessous sélectionnées
Quand l’utilisateur appuie sur Ctrl+D ou Cmd+D selon la plateforme
Alors le contenu de la cellule source est recopié vers le bas
Et les références relatives sont ajustées pour chaque ligne
```

Source : MS-KB, MS-FILL.

### EXL-FILL-007 — Recopier vers la droite au clavier

```gherkin
Étant donné une cellule source et les cellules situées à droite sélectionnées
Quand l’utilisateur appuie sur Ctrl+R ou Cmd+R selon la plateforme
Alors le contenu de la cellule source est recopié vers la droite
Et les références relatives sont ajustées pour chaque colonne
```

Source : MS-KB, MS-FILL.

### EXL-FILL-008 — Étendre une série de formules sur des cellules déjà remplies

```gherkin
Étant donné D2 contenant =ROUND(B2*C2,2)
Et D3 et D4 contenant déjà des formules
Quand l’utilisateur étend D2 jusqu’à D4 avec un seul glisser de la poignée de recopie
Alors D3 contient =ROUND(B3*C3,2)
Et D4 contient =ROUND(B4*C4,2)
Et chaque résultat est calculé avec les valeurs de sa propre ligne
Et les deux formules et résultats sont identiques après autosave et rechargement
```

Source : MS-FILL. La persistance est un invariant Hall.

## Fonctionnalité : Somme automatique

### EXL-SUM-001 — Placer Somme automatique dans la barre d’outils

```gherkin
Étant donné le tableur ouvert
Alors la commande Σ se trouve dans la barre d’outils du tableur
Et elle n’occupe pas une ligne de la barre de formule
Et son action principale applique SOMME
Et sa flèche ouvre les fonctions alternatives
```

Source : MS-SUM.

### EXL-SUM-002 — Détecter une plage verticale contiguë

```gherkin
Étant donné une cellule vide immédiatement sous une colonne de nombres contigus
Quand l’utilisateur active Σ
Alors une formule SOMME couvrant les nombres au-dessus est proposée
Et la plage proposée est mise en évidence
Et l’utilisateur peut la corriger avant de valider avec Entrée
```

Source : MS-SUM.

### EXL-SUM-003 — Détecter une plage horizontale contiguë

```gherkin
Étant donné une cellule vide immédiatement à droite d’une ligne de nombres contigus
Quand l’utilisateur active Σ
Alors une formule SOMME couvrant les nombres à gauche est proposée
Et l’utilisateur peut la corriger avant validation
```

Source : MS-SUM.

### EXL-SUM-004 — S’arrêter au premier blanc

```gherkin
Étant donné deux blocs de nombres séparés par une cellule vide
Et une cellule de total immédiatement après le second bloc
Quand l’utilisateur active Σ
Alors la plage proposée contient uniquement le bloc contigu le plus proche
Et elle s’arrête au premier blanc
```

Source : MS-SUM.

### EXL-SUM-005 — Créer plusieurs totaux en une commande

```gherkin
Étant donné plusieurs cellules de total vides sélectionnées sous des colonnes de nombres
Quand l’utilisateur active Σ
Alors une formule SOMME adaptée est créée pour chaque colonne sélectionnée
Et chaque formule utilise la plage de sa propre colonne
```

Source : MS-SUM.

### EXL-SUM-006 — Totaliser une plage sélectionnée

```gherkin
Étant donné une plage rectangulaire de données sélectionnée
Quand l’utilisateur active Σ
Alors Hall place les totaux dans les cellules adjacentes attendues
Et les références de chaque total correspondent à la ligne ou colonne concernée
```

Source : MS-SUM. La direction retenue doit être explicitée par le test.

### EXL-SUM-007 — Choisir une fonction automatique alternative

```gherkin
Étant donné le menu associé à Σ
Quand l’utilisateur ouvre le menu
Alors il propose Somme, Moyenne, Nombre, Maximum, Minimum et Plus de fonctions
```

Source : MS-SUM.

### EXL-SUM-008 — Calculer une moyenne automatique

```gherkin
Étant donné une cellule vide sous une plage numérique contiguë
Quand l’utilisateur choisit Moyenne dans le menu Σ
Alors une formule MOYENNE couvrant cette plage est proposée
Et sa validation affiche la moyenne calculée
```

Source : MS-SUM.

### EXL-SUM-009 — Compter automatiquement les nombres

```gherkin
Étant donné une cellule vide sous une plage contiguë contenant nombres et textes
Quand l’utilisateur choisit Nombre dans le menu Σ
Alors une formule NB couvrant cette plage est proposée
Et sa validation affiche le nombre de cellules numériques
```

Source : MS-SUM.

### EXL-SUM-010 — Calculer automatiquement le maximum

```gherkin
Étant donné une cellule vide sous une plage numérique contiguë
Quand l’utilisateur choisit Maximum dans le menu Σ
Alors une formule MAX couvrant cette plage est proposée
Et sa validation affiche la plus grande valeur
```

Source : MS-SUM.

### EXL-SUM-011 — Calculer automatiquement le minimum

```gherkin
Étant donné une cellule vide sous une plage numérique contiguë
Quand l’utilisateur choisit Minimum dans le menu Σ
Alors une formule MIN couvrant cette plage est proposée
Et sa validation affiche la plus petite valeur
```

Source : MS-SUM.

### EXL-SUM-012 — Accéder au catalogue depuis Plus de fonctions

```gherkin
Étant donné le menu Σ ouvert
Quand l’utilisateur choisit Plus de fonctions
Alors le catalogue complet de fonctions s’ouvre
Et la cellule active reste la cible de la fonction qui sera insérée
```

Source : MS-SUM, MS-FX.

## Fonctionnalité : récapitulatif de sélection

### EXL-STATUS-001 — Afficher la somme de la sélection

```gherkin
Étant donné plusieurs cellules numériques sélectionnées
Alors une barre d’état du tableur affiche leur somme
Et la valeur se met à jour immédiatement lorsque la sélection change
```

Source : MS-STATUS.

### EXL-STATUS-002 — Afficher la moyenne de la sélection

```gherkin
Étant donné plusieurs cellules numériques sélectionnées
Alors une barre d’état du tableur affiche leur moyenne
Et la valeur se met à jour immédiatement lorsque la sélection change
```

Source : MS-STATUS.

### EXL-STATUS-003 — Afficher le nombre de valeurs de la sélection

```gherkin
Étant donné plusieurs cellules sélectionnées contenant nombres, textes et cellules vides
Alors une barre d’état du tableur affiche le nombre de cellules non vides attendu
Et la valeur se met à jour immédiatement lorsque la sélection change
```

Source : MS-STATUS.

## Fonctionnalité : erreurs de formule

### EXL-ERR-001 — Afficher une division par zéro

```gherkin
Étant donné une cellule contenant =1/0
Quand la formule est validée
Alors la cellule affiche l’erreur #DIV/0!
Et la barre de formule conserve le texte source =1/0
```

Source : MS-ERR.

### EXL-ERR-002 — Afficher un nom de fonction inconnu

```gherkin
Étant donné une cellule contenant =FONCTION_INCONNUE(1)
Quand la formule est validée
Alors la cellule affiche l’erreur #NAME?
Et la formule source reste modifiable
```

Source : MS-ERR.

### EXL-ERR-003 — Signaler une référence supprimée

```gherkin
Étant donné une formule qui référence une cellule d’une colonne existante
Quand cette colonne est supprimée
Alors la formule dépendante affiche l’erreur #REF!
Et elle ne produit pas silencieusement une valeur erronée
```

Source : MS-ERR.

### EXL-ERR-004 — Signaler des types incompatibles

```gherkin
Étant donné une formule arithmétique utilisant un texte incompatible avec l’opération
Quand la formule est validée
Alors la cellule affiche l’erreur #VALUE!
Et la formule source reste modifiable
```

Source : MS-ERR.

## Fonctionnalité : trier une plage de données

### EXL-SORT-001 — Trier en ordre croissant

```gherkin
Étant donné une plage tabulaire dont une colonne contient des valeurs désordonnées
Quand l’utilisateur choisit Trier en ordre croissant sur cette colonne
Alors les lignes complètes sont réordonnées de la plus petite valeur à la plus grande
Et les cellules d’une même ligne restent ensemble
Et l’ordre est conservé après autosave et rechargement
```

Source : MS-SORT.

### EXL-SORT-002 — Trier en ordre décroissant

```gherkin
Étant donné une plage tabulaire dont une colonne contient des valeurs désordonnées
Quand l’utilisateur choisit Trier en ordre décroissant sur cette colonne
Alors les lignes complètes sont réordonnées de la plus grande valeur à la plus petite
Et les cellules d’une même ligne restent ensemble
Et l’ordre est conservé après autosave et rechargement
```

Source : MS-SORT.

## Fonctionnalité : structure et mise en forme de la feuille

### EXL-GRID-001 — Ajouter une ligne par son en-tête

```gherkin
Étant donné une ligne sélectionnée par son numéro
Quand l’utilisateur ouvre le menu contextuel et choisit Insérer
Alors une ligne est insérée au-dessus de la ligne sélectionnée
Et les lignes existantes sont décalées sans perte de données
```

Source : MS-ROW.

### EXL-GRID-002 — Supprimer une ligne

```gherkin
Étant donné une ligne sélectionnée par son numéro
Quand l’utilisateur choisit Supprimer dans le menu contextuel
Alors la ligne disparaît
Et les lignes suivantes sont décalées
```

Source : MS-ROW.

### EXL-GRID-003 — Insérer plusieurs lignes

```gherkin
Étant donné plusieurs numéros de lignes sélectionnés
Quand l’utilisateur choisit Insérer
Alors le même nombre de lignes est ajouté
```

Source : MS-ROW.

### EXL-GRID-004 — Fusionner une sélection

```gherkin
Étant donné plusieurs cellules adjacentes sélectionnées
Quand l’utilisateur choisit Fusionner
Alors elles deviennent une cellule couvrant la sélection
Et seule la valeur de la cellule supérieure gauche est conservée
```

Source : MS-MERGE.

### EXL-GRID-005 — Ajouter une colonne par son en-tête

```gherkin
Étant donné une colonne sélectionnée par sa lettre
Quand l’utilisateur ouvre le menu contextuel et choisit Insérer
Alors une colonne est insérée à gauche de la colonne sélectionnée
Et les colonnes existantes sont décalées sans perte de données
```

Source : MS-ROW.

### EXL-GRID-006 — Supprimer une colonne

```gherkin
Étant donné une colonne sélectionnée par sa lettre
Quand l’utilisateur choisit Supprimer dans le menu contextuel
Alors la colonne disparaît
Et les colonnes suivantes sont décalées
```

Source : MS-ROW.

### EXL-GRID-007 — Insérer plusieurs colonnes

```gherkin
Étant donné plusieurs lettres de colonnes sélectionnées
Quand l’utilisateur choisit Insérer
Alors le même nombre de colonnes est ajouté
```

Source : MS-ROW.

### EXL-GRID-008 — Défusionner une cellule fusionnée

```gherkin
Étant donné une cellule précédemment fusionnée
Quand l’utilisateur choisit Défusionner
Alors les cellules individuelles sont restaurées
Et la valeur conservée reste dans la cellule supérieure gauche
```

Source : MS-MERGE.

### EXL-GRID-009 — Ajouter une ligne en dessous

```gherkin
Étant donné une ligne sélectionnée par son numéro
Quand l’utilisateur choisit Insérer une ligne en dessous
Alors une ligne est insérée sous la ligne sélectionnée
Et les lignes suivantes sont décalées sans perte de données
```

Source : MS-ROW.

### EXL-GRID-010 — Ajouter une colonne à droite

```gherkin
Étant donné une colonne sélectionnée par sa lettre
Quand l’utilisateur choisit Insérer une colonne après
Alors une colonne est insérée à droite de la colonne sélectionnée
Et les colonnes suivantes sont décalées sans perte de données
```

Source : MS-ROW.

### EXL-FMT-001 — Appliquer le gras à une plage

```gherkin
Étant donné une plage sélectionnée
Quand l’utilisateur active Gras
Alors la mise en forme s’applique à toutes les cellules sélectionnées
Et elle est conservée après autosave et rechargement
```

Source : MS-FMT. La persistance est un invariant Hall.

### EXL-FMT-002 — Appliquer un format de nombre sans changer la valeur

```gherkin
Étant donné une plage numérique sélectionnée
Quand l’utilisateur choisit le format Nombre avec deux décimales
Alors l’affichage présente deux décimales
Et la valeur sous-jacente utilisée par les formules ne change pas
Et le format est conservé après rechargement
```

Source : MS-FMT.

### EXL-FMT-004 — Appliquer l’italique à une plage

```gherkin
Étant donné une plage sélectionnée
Quand l’utilisateur active Italique
Alors toutes les cellules sélectionnées sont affichées en italique
Et la mise en forme est conservée après rechargement
```

Source : MS-FMT.

### EXL-FMT-005 — Souligner une plage

```gherkin
Étant donné une plage sélectionnée
Quand l’utilisateur active Souligné
Alors toutes les cellules sélectionnées sont soulignées
Et la mise en forme est conservée après rechargement
```

Source : MS-FMT.

### EXL-FMT-006 — Changer la couleur du texte

```gherkin
Étant donné une plage sélectionnée
Quand l’utilisateur choisit une couleur de texte
Alors le texte de toutes les cellules sélectionnées utilise cette couleur
Et la couleur est conservée après rechargement
```

Source : MS-FMT.

### EXL-FMT-007 — Changer la couleur de fond

```gherkin
Étant donné une plage sélectionnée
Quand l’utilisateur choisit une couleur de remplissage
Alors toutes les cellules sélectionnées utilisent cette couleur de fond
Et la couleur est conservée après rechargement
```

Source : MS-FMT.

### EXL-FMT-008 — Aligner horizontalement

```gherkin
Étant donné une plage sélectionnée
Quand l’utilisateur choisit l’alignement à gauche
Alors toutes les cellules sélectionnées sont alignées à gauche
Et l’alignement est conservé après rechargement
```

Source : MS-FMT.

### EXL-FMT-009 — Aligner verticalement

```gherkin
Étant donné une plage sélectionnée
Quand l’utilisateur choisit l’alignement en haut
Alors toutes les cellules sélectionnées sont alignées en haut
Et l’alignement est conservé après rechargement
```

Source : MS-FMT.

### EXL-FMT-010 — Changer la police

```gherkin
Étant donné une plage sélectionnée
Quand l’utilisateur choisit une famille de police
Alors toutes les cellules sélectionnées utilisent cette police
Et la police est conservée après rechargement
```

Source : MS-FMT.

### EXL-FMT-011 — Changer la taille du texte

```gherkin
Étant donné une plage sélectionnée
Quand l’utilisateur choisit une taille de texte
Alors toutes les cellules sélectionnées utilisent cette taille
Et la taille est conservée après rechargement
```

Source : MS-FMT.

### EXL-FMT-012 — Appliquer des bordures

```gherkin
Étant donné une plage sélectionnée
Quand l’utilisateur choisit Toutes les bordures
Alors une grille complète de bordures apparaît sur la sélection
Et elles sont conservées après rechargement
```

Source : MS-FMT.

### EXL-FMT-013 — Centrer horizontalement

```gherkin
Étant donné une plage sélectionnée
Quand l’utilisateur choisit l’alignement centré
Alors toutes les cellules sélectionnées sont centrées horizontalement
Et l’alignement est conservé après rechargement
```

Source : MS-FMT.

### EXL-FMT-014 — Aligner horizontalement à droite

```gherkin
Étant donné une plage sélectionnée
Quand l’utilisateur choisit l’alignement à droite
Alors toutes les cellules sélectionnées sont alignées à droite
Et l’alignement est conservé après rechargement
```

Source : MS-FMT.

### EXL-FMT-015 — Justifier horizontalement

```gherkin
Étant donné une plage sélectionnée
Quand l’utilisateur choisit l’alignement justifié
Alors toutes les cellules sélectionnées utilisent la justification
Et l’alignement est conservé après rechargement
```

Source : MS-FMT.

### EXL-FMT-016 — Centrer verticalement

```gherkin
Étant donné une plage sélectionnée
Quand l’utilisateur choisit l’alignement vertical au milieu
Alors toutes les cellules sélectionnées sont centrées verticalement
Et l’alignement est conservé après rechargement
```

Source : MS-FMT.

### EXL-FMT-017 — Aligner verticalement en bas

```gherkin
Étant donné une plage sélectionnée
Quand l’utilisateur choisit l’alignement vertical en bas
Alors toutes les cellules sélectionnées sont alignées en bas
Et l’alignement est conservé après rechargement
```

Source : MS-FMT.

### EXL-FMT-018 — Appliquer une bordure extérieure

```gherkin
Étant donné une plage sélectionnée
Quand l’utilisateur choisit Bordure extérieure
Alors seule la bordure autour de la plage apparaît
Et elle est conservée après rechargement
```

Source : MS-FMT.

### EXL-FMT-019 — Appliquer les bordures intérieures

```gherkin
Étant donné une plage sélectionnée
Quand l’utilisateur choisit Bordures intérieures
Alors les séparations internes de la plage apparaissent sans bordure extérieure ajoutée
Et elles sont conservées après rechargement
```

Source : MS-FMT.

### EXL-FMT-020 — Appliquer les bordures horizontales intérieures

```gherkin
Étant donné une plage sélectionnée
Quand l’utilisateur choisit Bordures horizontales
Alors les séparations horizontales intérieures apparaissent
Et elles sont conservées après rechargement
```

Source : MS-FMT.

### EXL-FMT-021 — Appliquer les bordures verticales intérieures

```gherkin
Étant donné une plage sélectionnée
Quand l’utilisateur choisit Bordures verticales
Alors les séparations verticales intérieures apparaissent
Et elles sont conservées après rechargement
```

Source : MS-FMT.

### EXL-FMT-022 — Appliquer une bordure gauche

```gherkin
Étant donné une plage sélectionnée
Quand l’utilisateur choisit Bordure gauche
Alors le bord gauche de la plage apparaît
Et il est conservé après rechargement
```

Source : MS-FMT.

### EXL-FMT-023 — Appliquer une bordure supérieure

```gherkin
Étant donné une plage sélectionnée
Quand l’utilisateur choisit Bordure supérieure
Alors le bord supérieur de la plage apparaît
Et il est conservé après rechargement
```

Source : MS-FMT.

### EXL-FMT-024 — Appliquer une bordure droite

```gherkin
Étant donné une plage sélectionnée
Quand l’utilisateur choisit Bordure droite
Alors le bord droit de la plage apparaît
Et il est conservé après rechargement
```

Source : MS-FMT.

### EXL-FMT-025 — Appliquer une bordure inférieure

```gherkin
Étant donné une plage sélectionnée
Quand l’utilisateur choisit Bordure inférieure
Alors le bord inférieur de la plage apparaît
Et il est conservé après rechargement
```

Source : MS-FMT.

### EXL-FMT-026 — Effacer les bordures

```gherkin
Étant donné une plage possédant des bordures
Quand l’utilisateur choisit Effacer les bordures
Alors les bordures appliquées à la plage sont supprimées
Et cette suppression est conservée après rechargement
```

Source : MS-FMT.

### EXL-FMT-027 — Appliquer un format monétaire

```gherkin
Étant donné une plage numérique sélectionnée
Quand l’utilisateur choisit le format Monnaie en euros
Alors l’affichage présente le symbole euro et les décimales attendues
Et la valeur sous-jacente utilisée par les formules ne change pas
Et le format est conservé après rechargement
```

Source : MS-FMT.

### EXL-FMT-028 — Appliquer un format pourcentage

```gherkin
Étant donné une plage numérique sélectionnée
Quand l’utilisateur choisit le format Pourcentage
Alors l’affichage présente un pourcentage avec les décimales attendues
Et la valeur sous-jacente utilisée par les formules ne change pas
Et le format est conservé après rechargement
```

Source : MS-FMT.

### EXL-FMT-029 — Appliquer un format de date

```gherkin
Étant donné une plage contenant des dates sélectionnée
Quand l’utilisateur choisit le format Date
Alors les dates sont affichées dans le format local attendu
Et leur valeur sous-jacente ne change pas
Et le format est conservé après rechargement
```

Source : MS-FMT.

### EXL-FMT-003 — Renvoyer un texte long à la ligne

```gherkin
Étant donné une cellule ou plage contenant un texte plus large que la colonne
Quand l’utilisateur active Renvoyer à la ligne automatiquement
Alors le texte est présenté sur plusieurs lignes dans la cellule
Et la hauteur de ligne permet de lire le contenu
Et le contenu source et les calculs éventuels restent inchangés
Et la présentation est conservée après rechargement
```

Source : MS-FMT.

### EXL-HIST-001 — Annuler une édition

```gherkin
Étant donné une modification validée dans la feuille
Quand l’utilisateur active le bouton Annuler
Alors l’état précédent est restauré
```

Source : MS-UNDO.

### EXL-HIST-002 — Copier et coller des valeurs

```gherkin
Étant donné une plage contenant des valeurs
Quand l’utilisateur la copie puis la colle vers une autre plage
Alors les mêmes valeurs apparaissent dans la plage de destination
```

Source : comportement de base Excel.

### EXL-HIST-003 — Rétablir une édition annulée

```gherkin
Étant donné une modification qui vient d’être annulée
Quand l’utilisateur active le bouton Rétablir
Alors la modification est réappliquée
```

Source : MS-UNDO.

### EXL-HIST-004 — Copier et coller une formule

```gherkin
Étant donné une cellule contenant une formule avec référence relative
Quand l’utilisateur la copie et la colle à une autre position
Alors la formule est copiée
Et sa référence relative est adaptée à la destination
```

Source : MS-FILL.

### EXL-HIST-005 — Copier et coller une mise en forme

```gherkin
Étant donné une cellule possédant une mise en forme visuelle
Quand l’utilisateur la copie et la colle vers une autre cellule
Alors la mise en forme est reproduite à la destination
```

Source : comportement de base Excel.

### EXL-HIST-006 — Annuler au clavier

```gherkin
Étant donné une modification validée dans la feuille
Quand l’utilisateur appuie sur Ctrl+Z ou Cmd+Z selon la plateforme
Alors l’état précédent est restauré
```

Source : MS-UNDO.

### EXL-HIST-007 — Rétablir au clavier

```gherkin
Étant donné une modification qui vient d’être annulée
Quand l’utilisateur utilise le raccourci Rétablir documenté pour sa plateforme
Alors la modification est réappliquée
```

Source : MS-UNDO.

### EXL-HIST-008 — Couper et coller une plage

```gherkin
Étant donné une plage contenant des valeurs
Quand l’utilisateur coupe la plage puis la colle vers une destination
Alors les valeurs disparaissent de la source
Et elles apparaissent à la destination
```

Source : comportement de base Excel.

### EXL-LAYOUT-001 — Faire défiler la feuille sans déplacer le Workbench

```gherkin
Étant donné une feuille plus grande que l’espace disponible
Quand l’utilisateur parcourt les lignes ou colonnes éloignées
Alors le défilement est porté par la zone tableur
Et le header de la ressource et celui du Workbench ne se déplacent pas
```

Source : invariant d’intégration Hall.

### EXL-LAYOUT-002 — Ouvrir la vue étendue Hall

```gherkin
Étant donné le tableur ouvert dans le Workbench
Quand l’utilisateur active la commande Plein écran
Alors le même éditeur apparaît dans la vue étendue standard de Hall
Et le titre et le bouton de fermeture restent fixes
Et seule la feuille porte ses défilements horizontal et vertical
```

Source : invariant d’intégration Hall ; « Plein écran » désigne ici une vue étendue offrant davantage de surface
d’édition, et non un second mode fonctionnel ou un fullscreen navigateur.

### EXL-LAYOUT-003 — Fermer la vue étendue sans perdre la sélection ni la donnée

```gherkin
Étant donné le tableur modifié dans la vue étendue
Quand l’utilisateur ferme le dialogue
Alors la ressource réapparaît dans le Workbench
Et les données validées et sauvegardées sont conservées
```

Source : invariant d’intégration Hall.

### EXL-LAYOUT-004 — Changer de modalité d’affichage sans interrompre l’édition

```gherkin
Étant donné une cellule sélectionnée et une formule en cours d’édition non encore validée
Quand l’utilisateur passe du tableur intégré à la vue étendue puis revient au tableur intégré
Alors la même cellule et la même plage restent sélectionnées
Et le brouillon de formule et la position du curseur sont conservés
Et ce changement d’affichage ne valide ni n’annule la formule
Et il ne déclenche aucune modification du document ni sauvegarde par lui-même
```

Source : invariant d’intégration Hall ; le plein écran est une modalité d’affichage du même éditeur.

## Équivalence IHM et menus Excel ↔ Hall

L’objectif n’est pas de reproduire tout le ruban Microsoft, mais de conserver les repères fonctionnels d’un
utilisateur d’Excel. La répartition normative est la suivante :

- la **barre de formule** contient la zone Nom, `X`, `✓`, `fx`, l’éditeur de contenu et son dépliage ;
- la **barre d’outils** contient l’historique, la mise en forme, la fusion, les bordures et Somme automatique ;
- les **menus contextuels des en-têtes** portent les opérations de lignes et colonnes ;
- les **menus contextuels de cellules** portent le presse-papiers et les opérations réellement persistées ;
- une commande qui modifie une donnée non stockée par le document Hall ne doit pas être affichée comme si elle
  était prise en charge.

Audit réalisé dans le navigateur intégré le 30 août 2026 sur la ressource `seed/Ressource tableur` :

| Repère Excel | Attendu dans Hall | Observation réelle | Décision / scénario |
| --- | --- | --- | --- |
| Zone Nom à gauche de la barre | Afficher l’adresse et accepter une adresse à atteindre | `A1` est affiché mais le contrôle est un `output`, donc non éditable | Partiel ; EXL-FB-001 puis EXL-NAME-001 |
| `X` et `✓` pendant l’édition | Annuler ou valider sans ambiguïté | Contrôles ajoutés et masqués hors édition ; acceptance complète à faire | EXL-FB-004, EXL-FB-005 |
| `fx` dans la barre de formule | Ouvrir le catalogue complet, recherchable et documenté | Bouton présent ; liste complète en place mais parcours recherche/catégorie/aide non accepté | EXL-FX-004, EXL-FX-005 |
| Dépliage de la barre | Bouton à droite et `Ctrl+Maj+U`, au moins quatre lignes visibles | Bouton présent ; test provisoire vert, acceptance visuelle à faire | EXL-FB-006 à EXL-FB-008 |
| Annuler / Rétablir | Boutons de toolbar et `Ctrl+Z` / `Ctrl+Y` | Boutons présents et libellés, absence de preuve Playwright ciblée | EXL-HIST-001 |
| Police et taille | Listes de toolbar agissant sur la sélection | Contrôles natifs présents sans `data-testid` ni libellé fonctionnel stable | EXL-FMT-001 |
| Alignement horizontal / vertical | Listes de toolbar agissant sur la sélection | Contrôles natifs présents sans contrat Playwright stable | EXL-FMT-001 |
| Gras / italique / souligné | Commandes visuelles usuelles | Gras présent ; italique et souligné absents | EXL-FMT-001 |
| Couleur de texte / remplissage | Palettes agissant sur la sélection | Contrôles présents ; seule leur présence possède un identifiant partiel, pas le choix de couleur | EXL-FMT-001 |
| Format de nombre | Général, nombre, monnaie, pourcentage, date sur la sélection | Aucun contrôle de toolbar ; le document ne sait actuellement formater que des colonnes entières | **Écart fonctionnel majeur** ; EXL-FMT-002 |
| Renvoyer à la ligne | Commande d’alignement et hauteur lisible | Commande absente | EXL-FMT-003 |
| Fusionner / Défusionner | Commande de toolbar explicite, état dépendant de la sélection | Icône native `web` présente avec tooltip Fusionner, sans libellé visible ni `data-testid`; défusion à accepter | EXL-GRID-004 |
| Bordures | Menu de styles de bordures | Contrôle présent sans `data-testid` stable sur le menu et les choix | EXL-FMT-001 |
| Somme automatique | Bouton principal Σ et flèche de menu dans la toolbar | Présent au bon niveau ; comportement complet à accepter | EXL-SUM-001 à EXL-SUM-007 |
| Plein écran | Commande Hall en fin de toolbar | Présente et libellée ; stabilité du layout à accepter | EXL-LAYOUT-001 |
| Barre d’état de sélection | Somme, moyenne et nombre pour une plage numérique | Absente de l’IHM auditée | **Écart fonctionnel** ; EXL-STATUS-001 à EXL-STATUS-003 |
| Lignes | Clic droit sur numéro : insérer au-dessus/en dessous, supprimer | Commandes présentes et traduites, sans identifiants stables | EXL-GRID-001 à EXL-GRID-003 |
| Colonnes | Clic droit sur lettre : insérer à gauche/droite, supprimer | Commandes présentes ; `Renommer cette colonne` est spécifique à JSpreadsheet et n’est pas persisté par Hall : à retirer | EXL-GRID-005 à EXL-GRID-007, EXL-GRID-010 |
| Tri | Ordre croissant/décroissant en gardant les lignes entières cohérentes | `Order ascending` et `Order descending` sont visibles en anglais ; persistance non prouvée | EXL-SORT-001, EXL-SORT-002 |
| Presse-papiers | Copier, couper, coller avec raccourcis | Copier et Coller visibles ; Couper n’apparaît pas dans le menu audité | EXL-HIST-002 |
| Commentaire | Afficher seulement si le modèle le persiste | `Add comments` est exposé en anglais mais les commentaires ne figurent pas dans le document sauvegardé | **À retirer du menu**, hors périmètre actuel |

### Contrat des contrôles testables

Avant d’écrire le test fonctionnel d’un menu natif JSpreadsheet, Hall doit lui attribuer un identifiant stable.
Les identifiants suivants constituent le contrat attendu :

| Fonction | `data-testid` attendu |
| --- | --- |
| Police / taille | `spreadsheet-font-family`, `spreadsheet-font-size` |
| Alignement horizontal / vertical | `spreadsheet-align`, `spreadsheet-vertical-align` |
| Gras | `spreadsheet-bold` |
| Italique / souligné | Non disponibles dans l’intégration actuelle ; EXL-FMT-004 et EXL-FMT-005 restent **Bloqué** |
| Couleur de texte / fond | `spreadsheet-text-color`, `spreadsheet-fill-color` |
| Format de nombre et choix | Non disponible dans l’intégration actuelle ; EXL-FMT-002, EXL-FMT-027, EXL-FMT-028 et EXL-FMT-029 restent **Bloqué** |
| Renvoi à la ligne | Non disponible dans l’intégration actuelle ; EXL-FMT-003 reste **Bloqué** |
| Fusion / défusion | `spreadsheet-merge-cells` — la même commande bascule entre les deux états |
| Bordures et choix | `spreadsheet-borders`, `spreadsheet-border-{kind}` |
| Ligne : insérer avant / après / supprimer | `spreadsheet-insert-row-before`, `spreadsheet-insert-row-after`, `spreadsheet-delete-rows` |
| Colonne : insérer avant / après / supprimer | `spreadsheet-insert-column-before`, `spreadsheet-insert-column-after`, `spreadsheet-delete-columns` |
| Copier / couper / coller | `spreadsheet-copy`, `spreadsheet-cut`, `spreadsheet-paste` |

Les tests fonctionnels ne doivent pas localiser ces contrôles par `title`, texte traduit, icône Material ou ordre
dans le DOM.

## Organisation de la couverture Playwright par familles

Les scénarios et leurs blocs `test.describe` sont regroupés par responsabilité fonctionnelle, sans constituer
un séquençage de livraison ou plusieurs lots d’implémentation :

- **Sélection et barre de formule** : EXL-SEL, EXL-FB et EXL-NAME ;
- **Références** : EXL-REF ;
- **Fonctions et Somme automatique** : EXL-FX et EXL-SUM ;
- **Recopie** : EXL-FILL ;
- **Structure, mise en forme et historique** : EXL-SORT, EXL-GRID, EXL-FMT et EXL-HIST ;
- **Intégration Hall** : EXL-LAYOUT et les invariants de persistance/autosave.

**Une acceptance correspond à un test Playwright distinct : un identifiant Gherkin, un test, un résultat.**
Les helpers, fixtures et opérations d’installation peuvent être
partagés, mais deux identifiants ne doivent pas être validés par le même bloc `test(...)`. Le titre commence par
l’identifiant, par exemple `EXL-FB-004 cancels an edit and restores the original formula`. Le grand parcours
historique `creates, calculates and reloads a spreadsheet resource` reste un smoke test ; il ne constitue la
preuve de conformité d’aucun scénario individuel.

## Matrice de couverture Playwright

Les titres de tests ci-dessous sont les contrats attendus. Le statut doit être mis à jour avec la commande ciblée
et son dernier résultat ; « existant à isoler » signifie que l’assertion se trouve aujourd’hui dans un parcours
global mais ne constitue pas encore une preuve ciblée suffisante.

| Scénario | Test Playwright attendu | Statut au 31 août 2026 |
| --- | --- | --- |
| EXL-SEL-001 | `EXL-SEL-001 selects a rectangular range by mouse drag` | **Couvert** |
| EXL-SEL-002 | `EXL-SEL-002 extends the active selection with Shift and arrow keys` | **Couvert** |
| EXL-SEL-003 | `EXL-SEL-003 selects a complete row from its header` | **Couvert** |
| EXL-SEL-004 | `EXL-SEL-004 selects a complete column from its header` | **Couvert** |
| EXL-SEL-005 | `EXL-SEL-005 adds a non-adjacent range with the platform modifier` | **Bloqué** — JSpreadsheet CE 5.0.4 ne conserve pas plusieurs zones non adjacentes dans son modèle de sélection |
| EXL-SEL-006 | `EXL-SEL-006 selects the complete sheet` | **Couvert** |
| EXL-FB-001 | `EXL-FB-001 displays the active address, source and calculated value` | **Couvert** |
| EXL-FB-002 | `EXL-FB-002 edits directly in the cell and synchronizes the formula bar` | **Couvert** |
| EXL-FB-003 | `EXL-FB-003 edits from the formula bar without moving the grid selection` | **Couvert** |
| EXL-FB-004 | `EXL-FB-004 cancels an edit and restores the original formula` | **Couvert** |
| EXL-FB-005 | `EXL-FB-005 commits an edit and persists the calculated result` | **Couvert** |
| EXL-FB-006 | `EXL-FB-006 expands the formula bar to multiple visible lines` | **Couvert** |
| EXL-FB-007 | `EXL-FB-007 toggles the formula bar with Control Shift U` | **Couvert** |
| EXL-FB-008 | `EXL-FB-008 preserves a long formula after collapse and reload` | **Couvert** |
| EXL-FB-009 | `EXL-FB-009 cancels an edit with Escape and restores the original formula` | **Couvert** |
| EXL-FB-010 | `EXL-FB-010 commits an edit with Enter and persists the result` | **Couvert** |
| EXL-FB-011 | `EXL-FB-011 enters direct cell edit mode with F2` | **Couvert** |
| EXL-NAME-001 | `EXL-NAME-001 navigates to a cell entered in the name box` | **Couvert** |
| EXL-NAME-002 | `EXL-NAME-002 selects a range entered in the name box` | **Couvert** |
| EXL-FX-001 | `EXL-FX-001 suggests functions from the typed prefix` | **Couvert** |
| EXL-FX-002 | `EXL-FX-002 navigates suggestions and inserts the selected function` | **Bloqué** — la liste de suggestions ne gère pas encore la navigation et la validation au clavier |
| EXL-FX-003 | `EXL-FX-003 inserts a nested function at the caret without losing the suffix` | **Couvert** |
| EXL-FX-004 | `EXL-FX-004 highlights the active argument in the function signature` | **Bloqué** — la signature affichée ne modélise pas encore l’argument actif |
| EXL-FX-005 | `EXL-FX-005 searches the complete catalog and inserts a documented function` | **Couvert** |
| EXL-FX-006 | `EXL-FX-006 accepts a French formula with French separators` | **Couvert** |
| EXL-FX-007 | `EXL-FX-007 accepts an English formula with English separators` | **Couvert** |
| EXL-FX-008 | `EXL-FX-008 highlights only the active function argument` | **Bloqué** — aucun état d’argument actif distinct n’est projeté entre fonctions imbriquées |
| EXL-FX-009 | `EXL-FX-009 searches functions in the complete catalog` | **Bloqué** — le catalogue actuel ne contient aucun champ de recherche |
| EXL-FX-010 | `EXL-FX-010 filters the complete catalog by category` | **Bloqué** — le catalogue actuel ne contient aucun filtre par catégorie |
| EXL-FX-011 | `EXL-FX-011 displays sourced help or an explicit unavailable state` | **Couvert** |
| EXL-FX-012 | `EXL-FX-012 inserts the selected catalog function at the caret` | **Couvert** |
| EXL-REF-001 | `EXL-REF-001 inserts a grid selection at the formula caret` | **Couvert** |
| EXL-REF-002 | `EXL-REF-002 gives every reference a matching distinct token and border color` | **Couvert** |
| EXL-REF-003 | `EXL-REF-003 emphasizes the reference under the formula caret` | **Couvert** |
| EXL-REF-004 | `EXL-REF-004 moves only the dragged referenced range` | **Bloqué** — la bordure de référence ne porte qu’une poignée de redimensionnement, sans geste de déplacement |
| EXL-REF-005 | `EXL-REF-005 resizes only the referenced range dragged by its corner` | **Couvert** |
| EXL-REF-006 | `EXL-REF-006 replaces the referenced range without corrupting the formula` | **Couvert** |
| EXL-REF-007 | `EXL-REF-007 preserves neighboring references when one range is resized` | **Couvert** |
| EXL-REF-008 | `EXL-REF-008 cycles relative absolute and mixed references with F4` | **Bloqué** — aucun gestionnaire F4 ne transforme les références relatives, absolues ou mixtes |
| EXL-FILL-001 | `EXL-FILL-001 copies a value with the fill handle` | **Couvert** |
| EXL-FILL-002 | `EXL-FILL-002 translates relative references vertically` | **Couvert** |
| EXL-FILL-003 | `EXL-FILL-003 preserves absolute and mixed references vertically` | **Couvert** |
| EXL-FILL-004 | `EXL-FILL-004 translates relative references horizontally` | **Couvert** |
| EXL-FILL-005 | `EXL-FILL-005 translates only the relative part of mixed references` | **Couvert** |
| EXL-FILL-006 | `EXL-FILL-006 fills formulas down with the platform shortcut` | **Bloqué** — aucun raccourci de recopie vers le bas n’est fourni par l’intégration actuelle |
| EXL-FILL-007 | `EXL-FILL-007 fills formulas right with the platform shortcut` | **Bloqué** — aucun raccourci de recopie vers la droite n’est fourni par l’intégration actuelle |
| EXL-FILL-008 | `EXL-FILL-008 extends a formula series across existing formula cells` | **Couvert** |
| EXL-SUM-001 | `EXL-SUM-001 places AutoSum in the toolbar and not in the formula bar` | **Couvert** |
| EXL-SUM-002 | `EXL-SUM-002 proposes the contiguous vertical range` | **Couvert** |
| EXL-SUM-003 | `EXL-SUM-003 proposes the contiguous horizontal range` | **Couvert** |
| EXL-SUM-004 | `EXL-SUM-004 stops the proposed range at the first blank` | **Couvert** |
| EXL-SUM-005 | `EXL-SUM-005 creates one total per selected empty total cell` | **Couvert** |
| EXL-SUM-006 | `EXL-SUM-006 totals a selected data range in the expected direction` | **Couvert** |
| EXL-SUM-007 | `EXL-SUM-007 offers Sum Average Count Max Min and More Functions` | **Couvert** |
| EXL-SUM-008 | `EXL-SUM-008 proposes and calculates Average` | **Couvert** |
| EXL-SUM-009 | `EXL-SUM-009 proposes and calculates Count Numbers` | **Bloqué** — la détection CE 5.0.4 exclut les cellules textuelles de la plage contiguë à compter |
| EXL-SUM-010 | `EXL-SUM-010 proposes and calculates Maximum` | **Couvert** |
| EXL-SUM-011 | `EXL-SUM-011 proposes and calculates Minimum` | **Couvert** |
| EXL-SUM-012 | `EXL-SUM-012 opens the complete catalog from More Functions` | **Couvert** |
| EXL-STATUS-001 | `EXL-STATUS-001 updates the selected range sum in the status bar` | **Bloqué** — la feuille ne possède pas de barre d’état de sélection |
| EXL-STATUS-002 | `EXL-STATUS-002 updates the selected range average in the status bar` | **Bloqué** — la feuille ne possède pas de barre d’état de sélection |
| EXL-STATUS-003 | `EXL-STATUS-003 updates the selected range count in the status bar` | **Bloqué** — la feuille ne possède pas de barre d’état de sélection |
| EXL-ERR-001 | `EXL-ERR-001 displays DIV zero while preserving the source formula` | **Bloqué** — CE 5.0.4 affiche `Infinity`, pas `#DIV/0!` |
| EXL-ERR-002 | `EXL-ERR-002 displays NAME for an unknown function` | **Bloqué** — CE 5.0.4 affiche `#ERROR`, pas `#NAME?` |
| EXL-ERR-003 | `EXL-ERR-003 displays REF after deleting a referenced column` | **Bloqué** — CE 5.0.4 ne fournit pas le contrat `#REF!` après suppression de la colonne référencée |
| EXL-ERR-004 | `EXL-ERR-004 displays VALUE for incompatible operand types` | **Bloqué** — CE 5.0.4 calcule `1text`, pas `#VALUE!` |
| EXL-SORT-001 | `EXL-SORT-001 sorts complete rows ascending and persists the order` | **Couvert** |
| EXL-SORT-002 | `EXL-SORT-002 sorts complete rows descending and persists the order` | **Couvert** |
| EXL-GRID-001 | `EXL-GRID-001 inserts one row from its header menu` | **Couvert** |
| EXL-GRID-002 | `EXL-GRID-002 deletes one row from its header menu` | **Couvert** |
| EXL-GRID-003 | `EXL-GRID-003 inserts as many rows as selected` | **Bloqué** — la commande CE 5.0.4 insère une seule ligne même quand plusieurs lignes sont sélectionnées |
| EXL-GRID-004 | `EXL-GRID-004 merges adjacent cells and retains the upper-left value` | **Couvert** |
| EXL-GRID-005 | `EXL-GRID-005 inserts one column from its header menu` | **Couvert** |
| EXL-GRID-006 | `EXL-GRID-006 deletes one column from its header menu` | **Couvert** |
| EXL-GRID-007 | `EXL-GRID-007 inserts as many columns as selected` | **Bloqué** — la commande CE 5.0.4 insère une seule colonne même quand plusieurs colonnes sont sélectionnées |
| EXL-GRID-008 | `EXL-GRID-008 unmerges a merged cell and retains its value` | **Couvert** |
| EXL-GRID-009 | `EXL-GRID-009 inserts one row below from its header menu` | **Couvert** |
| EXL-GRID-010 | `EXL-GRID-010 inserts one column to the right from its header menu` | **Couvert** |
| EXL-FMT-001 | `EXL-FMT-001 applies and persists bold` | **Couvert** |
| EXL-FMT-002 | `EXL-FMT-002 changes number display without changing the calculated value` | **Bloqué** — aucune commande ne formate les nombres sur une sélection de cellules |
| EXL-FMT-003 | `EXL-FMT-003 wraps long text and persists row layout` | **Bloqué** — aucune commande de renvoi automatique à la ligne n’est exposée |
| EXL-FMT-004 | `EXL-FMT-004 applies and persists italic` | **Bloqué** — la toolbar CE 5.0.4 fournie ne contient pas de commande italique |
| EXL-FMT-005 | `EXL-FMT-005 applies and persists underline` | **Bloqué** — la toolbar CE 5.0.4 fournie ne contient pas de commande soulignée |
| EXL-FMT-006 | `EXL-FMT-006 applies and persists text color` | **Couvert** |
| EXL-FMT-007 | `EXL-FMT-007 applies and persists fill color` | **Couvert** |
| EXL-FMT-008 | `EXL-FMT-008 applies and persists left alignment` | **Couvert** |
| EXL-FMT-009 | `EXL-FMT-009 applies and persists top alignment` | **Couvert** |
| EXL-FMT-010 | `EXL-FMT-010 applies and persists font family` | **Couvert** |
| EXL-FMT-011 | `EXL-FMT-011 applies and persists font size` | **Couvert** |
| EXL-FMT-012 | `EXL-FMT-012 applies and persists all borders` | **Couvert** |
| EXL-FMT-013 | `EXL-FMT-013 applies and persists center alignment` | **Couvert** |
| EXL-FMT-014 | `EXL-FMT-014 applies and persists right alignment` | **Couvert** |
| EXL-FMT-015 | `EXL-FMT-015 applies and persists justified alignment` | **Couvert** |
| EXL-FMT-016 | `EXL-FMT-016 applies and persists middle vertical alignment` | **Couvert** |
| EXL-FMT-017 | `EXL-FMT-017 applies and persists bottom alignment` | **Couvert** |
| EXL-FMT-018 | `EXL-FMT-018 applies and persists outer borders` | **Couvert** |
| EXL-FMT-019 | `EXL-FMT-019 applies and persists inner borders` | **Couvert** |
| EXL-FMT-020 | `EXL-FMT-020 applies and persists inner horizontal borders` | **Couvert** |
| EXL-FMT-021 | `EXL-FMT-021 applies and persists inner vertical borders` | **Couvert** |
| EXL-FMT-022 | `EXL-FMT-022 applies and persists a left border` | **Couvert** |
| EXL-FMT-023 | `EXL-FMT-023 applies and persists a top border` | **Couvert** |
| EXL-FMT-024 | `EXL-FMT-024 applies and persists a right border` | **Couvert** |
| EXL-FMT-025 | `EXL-FMT-025 applies and persists a bottom border` | **Couvert** |
| EXL-FMT-026 | `EXL-FMT-026 clears borders and persists their removal` | **Couvert** |
| EXL-FMT-027 | `EXL-FMT-027 applies currency display without changing the value` | **Bloqué** — aucune commande ne formate une sélection en monnaie |
| EXL-FMT-028 | `EXL-FMT-028 applies percentage display without changing the value` | **Bloqué** — aucune commande ne formate une sélection en pourcentage |
| EXL-FMT-029 | `EXL-FMT-029 applies local date display without changing the value` | **Bloqué** — aucune commande ne formate une sélection en date locale |
| EXL-HIST-001 | `EXL-HIST-001 undoes a validated edit` | **Couvert** |
| EXL-HIST-002 | `EXL-HIST-002 copies and pastes values` | **Couvert** |
| EXL-HIST-003 | `EXL-HIST-003 redoes an undone edit` | **Couvert** |
| EXL-HIST-004 | `EXL-HIST-004 copies a formula and translates relative references` | **Bloqué** — reproduction Playwright : CE 5.0.4 colle le résultat calculé `11`, pas la formule relative traduite `=B1+1` |
| EXL-HIST-005 | `EXL-HIST-005 copies and pastes visual formatting` | **Couvert** |
| EXL-HIST-006 | `EXL-HIST-006 undoes a validated edit with the platform shortcut` | **Couvert** |
| EXL-HIST-007 | `EXL-HIST-007 redoes an undone edit with the platform shortcut` | **Couvert** |
| EXL-HIST-008 | `EXL-HIST-008 cuts a range and pastes it to a destination` | **Couvert** |
| EXL-LAYOUT-001 | `EXL-LAYOUT-001 scrolls the sheet without moving Workbench chrome` | **Couvert** |
| EXL-LAYOUT-002 | `EXL-LAYOUT-002 opens a stable Hall fullscreen with internal sheet scrolling` | **Couvert** |
| EXL-LAYOUT-003 | `EXL-LAYOUT-003 closes fullscreen without losing saved data` | **Couvert** |
| EXL-LAYOUT-004 | `EXL-LAYOUT-004 changes display modality without interrupting the editing session` | **Couvert** |

## Règle de recette

Pour chaque ligne de la matrice :

1. le test est lancé seul avec `--grep` et doit annoncer le test concerné ;
2. les interactions utilisent uniquement les `data-testid` stables ;
3. les assertions portent sur le texte source de la formule, la valeur calculée et l’état visuel pertinent ;
4. tout scénario qui modifie une ressource attend l’état autosave `saved`, recharge la page et vérifie la donnée
   persistée lorsqu’il s’agit d’un invariant de persistance ;
5. une régression doit être démontrée rouge sur le comportement de production, puis verte avec le même test ;
6. la matrice n’est passée à « couvert » qu’après ce vert ciblé.
