# Catalogue des exigences Hall

`catalog.json` est l'unique source des formulations, classifications, clauses
et critères d'acceptation des exigences Hall.

Toutes les exigences utilisent la même structure : nom technique stable,
nature, cycle de vie, formulation synthétique, critères d'acceptation et
clauses justificatives. `npm run check:requirements` refuse une fiche à
laquelle l'un de ces éléments manque.

- Le code déclare une réalisation avec
  `@implements-requirement HALL-FR-DOM-000`.
- Un test déclare la vérification du comportement avec
  `@verifies-requirement HALL-FR-DOM-000`.
- Le backlog suit une tâche avec
  `@tracks-requirement HALL-FR-DOM-000`.

Ces emplacements référencent l'exigence ; ils ne recopient pas sa formulation.
Le contrôle `npm run check:requirements` rapproche les trois preuves et refuse
les IDs inconnus, les annotations mal formées et les exigences sans thème.

## Interface locale

Lancer :

```sh
npm run requirements:ui
```

Puis ouvrir [http://localhost:4317](http://localhost:4317). L'interface affiche
toutes les exigences, leur répartition et leur couverture. Le sélecteur
« Thème » d'une exigence écrit un override explicite dans
`taxonomy.requirementThemes`. Revenir au thème déterminé par son préfixe
supprime l'override devenu redondant.

Les thèmes et leurs libellés vivent dans `taxonomy.themes`. La table
`prefixThemes` classe le socle existant ; `requirementThemes` conserve les
reclassements au cas par cas. L'identifiant de l'exigence ne change jamais lors
d'un reclassement.
