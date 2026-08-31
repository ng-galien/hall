# Acceptance de l’intégration tableur

Univer OSS porte les interactions internes du tableur. Hall ne maintient plus une matrice d’équivalence détaillée avec Excel : l’acceptance porte uniquement sur la frontière que Hall possède, c’est-à-dire le document durable et son autosauvegarde.

## Scénarios pseudo-Gherkin

### SPR-PERSIST-001 — Autosauvegarder une modification

```gherkin
Étant donné une ressource tableur ouverte et modifiable
Quand l’utilisateur modifie une cellule
Alors Hall indique qu’une sauvegarde est en cours
Et transmet le snapshot Univer complet après la période d’inactivité
Et indique que le document est enregistré
```

### SPR-PERSIST-002 — Recharger le classeur enregistré

```gherkin
Étant donné une modification enregistrée
Quand l’utilisateur recharge la ressource
Alors la cellule contient encore la valeur enregistrée
Et le classeur conserve ses formules et ses formats
```

### SPR-PERSIST-003 — Conserver toutes les feuilles

```gherkin
Étant donné un classeur contenant plusieurs feuilles
Quand une cellule est modifiée puis autosauvegardée
Alors le snapshot transmis contient toutes les feuilles dans leur ordre
Et les feuilles non actives conservent leurs données
Et le même classeur multi-feuilles est restauré après rechargement
```

### SPR-PERSIST-004 — Sérialiser les sauvegardes rapprochées

```gherkin
Étant donné une première sauvegarde encore en cours
Quand une nouvelle modification intervient
Alors Hall ne lance pas deux sauvegardes concurrentes
Et transmet la dernière version après la fin de la première sauvegarde
Et aucune modification n’est perdue lors d’une navigation
```

## Couverture Playwright

Un parcours Playwright ciblé couvre ensemble la modification, l’autosauvegarde, le rechargement et la conservation du snapshot multi-feuilles. Il ne prétend pas tester les fonctions internes, les menus ou les interactions déjà fournis par Univer.
