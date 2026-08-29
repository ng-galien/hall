# Recherche unifiée — mini-DSL de requête

Spécification préalable, à valider avant implémentation. Elle unifie deux systèmes qui
vivent aujourd'hui côte à côte sans se connaître.

## 1. L'existant

**L'espace de travail** (`WorkspaceSearch`) : un champ unique qui mêle texte libre et
facettes (type, dossier, état). Les facettes actives sont des puces dans le champ, un
panneau liste les groupes avec compteurs. Les sources sont les stores (sujets, pièces,
séances, délibérations). La correspondance passe par `matchesQuery` : normalisée (casse
et accents ignorés), par inclusion, sur plusieurs champs (titre, numéro, texte…).

**Le sélecteur de références de l'éditeur** (`@`) : une grammaire `catégorie:terme`
(`@doc:budget`, `@membre:dup`, alias français et anglais), normalisée sans accents,
mais qui ne cherche que sur le libellé, coupe à 12 résultats sans le dire, et ignore
tout contexte. Les listes des pages (membres, délibérations…) utilisent encore
`matchesQuery` chacune à leur façon.

Trois vocabulaires de requête, deux normalisations, aucun classement partagé.

## 2. Le principe

**Une seule grammaire, un seul moteur de correspondance et de classement**, dans un
module client unique (`src/lib/search.ts`), consommé par :

- le champ de recherche de l'espace de travail ;
- le menu `@` de l'éditeur ;
- le sélecteur complet (« Rechercher… ») décrit au §6 ;
- à terme, les champs de filtre des pages de listes.

Si le serveur expose un jour une recherche (`{type, query}` du contrat), la requête
s'y transmet telle quelle : le DSL est une chaîne, pas une structure propriétaire.

## 3. La grammaire

```
requête   := (facette | terme)*
facette   := clé ":" valeur
terme     := mot libre
```

| Clé | Alias acceptés | Effet |
| --- | --- | --- |
| `type:` | les alias directs `membre:` `m:` `pièce:` `doc:` `p:` `sujet:` `s:` `séance:` `délib:` `d:` (+ anglais) | restreint au type d'entité |
| `dossier:` | `chemin:`, `folder:` | restreint au sous-arbre de dossiers (`dossier:finances`) |
| `état:` | `state:` | restreint à l'état d'un sujet (`état:planifié`) |

- Les clés et valeurs de facette sont normalisées comme les termes : casse et accents
  ignorés (`@séance:` ≡ `@seance:`, `délib` ≡ `delib`).
- Plusieurs termes = ET : chaque mot doit correspondre quelque part.
- Une facette inconnue n'est pas une erreur : elle est traitée comme un terme.
- Dans l'éditeur, `@` introduit la requête ; le raccourci historique `@doc:budget`
  est un cas particulier de la grammaire générale (une facette + des termes).

## 4. Champs de correspondance par type

| Entité | Champs cherchés |
| --- | --- |
| membre | prénom + nom, rôle |
| pièce | titre, nom de fichier, dossier |
| sujet | titre, dossier |
| séance | titre, numéro |
| délibération | titre, numéro |

La normalisation est celle de `matchesQuery` aujourd'hui : minuscules, décomposition
NFD, suppression des diacritiques. Elle devient LA fonction partagée.

## 5. Le classement (le cœur de l'unification)

À corpus égal, les deux surfaces classent pareil :

1. **Proximité contextuelle** : les entités du même dossier que le contexte courant
   d'abord (en écrivant dans un sujet de `finances/subventions`, les pièces de ce
   dossier remontent), puis le sous-arbre parent, puis le reste. Le contexte est un
   `folderPath` optionnel passé au moteur — l'espace de travail passe le dossier
   ouvert, l'éditeur le dossier du sujet en cours d'édition.
2. **Qualité de correspondance** : préfixe du libellé > début de mot > inclusion.
3. **Ordre alphabétique** (localisé fr) en dernier départage.

## 6. Les deux surfaces

**Le menu `@` (rapide)** : inchangé dans son geste — groupé par type, huit à douze
résultats. Deux ajouts : la mention explicite « n autres résultats — affiner ou
ouvrir la recherche », et une dernière ligne « Rechercher “…” » qui ouvre le
sélecteur complet pré-rempli avec la requête.

**Le sélecteur complet** : une surimpression de recherche (même patron visuel que la
recherche de l'espace de travail : champ + puces de facettes + compteurs par groupe),
liste défilante complète, aperçu d'une pièce au survol ou à la sélection, Entrée ou
clic insère la référence. C'est la réponse aux corpus de cent documents et plus.

**L'espace de travail** : garde son interface ; son moteur interne est remplacé par
le module partagé — mêmes facettes exprimables au clavier (`doc:budget dossier:travaux`),
même classement.

## 7. Hors périmètre (pour l'instant)

- Recherche plein-texte dans le contenu des documents (PDF) — affaire du serveur.
- Facettes de dates (`avant:`, `après:`) — la grammaire les accepte plus tard sans rupture.
- Historique / entités récentes en tête de liste vide.

## 8. Ordre d'implémentation proposé

1. `src/lib/search.ts` : parseur du DSL + correspondance + classement, avec tests unitaires.
2. Bascule du menu `@` sur ce moteur (+ compteur « n autres », + contexte de dossier).
3. Sélecteur complet ouvert depuis le menu `@`.
4. Bascule de `WorkspaceSearch` et des filtres de pages sur le même moteur.
