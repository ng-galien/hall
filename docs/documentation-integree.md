# Documentation intégrée (MDX)

L'application embarque sa propre documentation, écrite en MDX et servie de trois manières :

1. **Intégrée à l'application** : route `/docs` (entrée « Documentation » en bas de la barre de
   navigation, à côté des Paramètres). Arbre des pages, article, sommaire « Sur cette page »,
   recherche plein texte, fil d'Ariane.
2. **Site autonome** : `npm run build:docs -w @hall/client` produit `dist-docs/index.html`, un
   fichier HTML unique auto-suffisant (scripts, styles et polices inclus, routage par hash).
   Il s'ouvre depuis `file://`, sans serveur.
3. **Exportable** : `npm run zip:docs -w @hall/client` produit `mairie-docs.zip` prêt à envoyer.

## Ajouter une page

Une page = un fichier MDX sous `packages/client/src/docs/content/<langue>/…`. Le chemin sous la
langue est l'URL sous `/docs` ; `index.mdx` est la page du dossier. Ajouter une page, c'est ajouter
un fichier : l'arbre, les titres, l'ordre et la recherche se déduisent des fichiers eux-mêmes.

```mdx
---
title: Le vote en séance          # titre affiché (obligatoire)
summary: Une phrase de résumé.    # sous-titre et texte des cartes
order: 4                          # position dans la section (999 par défaut)
draft: true                       # marque « brouillon » (pastille + badge)
screen: /meetings                 # écran documenté : bouton « Ouvrir l'écran »
---

Du markdown normal (GFM : tableaux, listes de tâches…), plus des blocs dédiés :

<Callout kind="rule">Une garantie du produit.</Callout>
```

Le **français est la langue de référence** : une page sans traduction anglaise est affichée en
français avec la mention « traduction à venir ». La traduction est le même chemin sous
`content/en/`.

## Blocs disponibles dans les pages

| Bloc | Usage |
| --- | --- |
| `<Callout kind="note\|tip\|warning\|rule">` | Aparté ; `rule` = règle garantie par le produit |
| `<Steps>` / `<Step title="…">` | Étapes numérotées d'un guide |
| `<PageCards />` | Cartes des sous-pages (pages « hub ») |
| `<Compare leftTitle right… />` | Comparaison en deux colonnes |
| `<Details title="…">` | Section repliable |
| `<Figure caption="…">` / `<Legend items={[…]}>` | Illustration légendée |

## Architecture

- `packages/client/mdx.mjs` : pipeline MDX (frontmatter, GFM, ancres de titres, extraction du
  texte de recherche), branché dans `vite.config.ts` et `vite.docs.config.ts`.
- `packages/client/src/docs/pages.ts` : chargement des pages (`import.meta.glob`), arbre, ordre,
  recherche.
- `packages/client/src/docs/DocsArea.tsx` : la zone de documentation (partagée entre l'app et le
  site autonome) ; `blocks.tsx` : les blocs MDX ; `src/styles/docs.css` : le style (tokens
  `--hall-*`, thèmes clair et sombre).
- `packages/client/src/docs/DocsSite.tsx` + `docs-site.html` + `vite.docs.config.ts` : le site
  autonome mono-fichier (`vite-plugin-singlefile`).

La route `/docs` est chargée en `lazy` : les pages MDX ne pèsent pas sur le bundle principal.

## À venir

- Captures d'écran automatisées (projet Playwright dédié qui photographie l'application seedée,
  clair/sombre et fr/en, comme le projet Trust) et composant `<Screenshot>`.
- Traductions anglaises des pages.
