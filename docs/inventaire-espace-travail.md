# Espace de travail — inventaire et rationalisation

Préalable demandé avant tout chantier d'établis : qu'ont en commun les objets qu'on
navigue, et où chaque information doit-elle vivre. À valider, puis on exécute.

## 1. Ce qui est déjà tranché (fait)

- **Un seul fil d'Ariane** : la barre d'en-tête de l'application s'arrête à
  « Espace de travail » ; la navigation fine (chemins, sélecteurs de sous-dossiers,
  document ouvert) appartient à l'écran de l'espace de travail.
- **Un seul éditeur** : les cinq écrans écrivent avec le même composant (Tiptap),
  l'ancien MDXEditor est supprimé du projet.
- **Une seule recherche** : moteur commun (DSL, accents ignorés, proximité de dossier),
  dans le `@` de l'éditeur, la recherche complète et la barre de l'espace de travail.
- **Une seule nomenclature de types** : texte, PDF, image, fichier (`ResourceGlyph`,
  composant commun) — icônes et libellés identiques partout.

## 2. Les traits communs des objets navigués

| Trait | Sujet | Pièce (texte/PDF/image/fichier) | Séance | Délibération |
| --- | --- | --- | --- | --- |
| Titre | oui | oui | oui | oui |
| Slug (adresse) | oui | oui | oui | oui |
| Chemin de dossier | oui | oui | non | non |
| Tags | **non** | oui | non | non |
| État / statut | oui | figé ou non | oui | oui |
| Type visuel | sujet (± délibération) | texte/PDF/image/fichier | — | — |
| Dates | mise à jour | dépôt/mise à jour | tenue | adoption |

Constats :

- **Les tags n'existent que sur les pièces.** Si le tag est un mécanisme de navigation,
  il doit exister aussi sur les sujets (décision back : champ `tags` sur Topic) — sinon
  l'expérience « je tague pour retrouver » est bancale.
- **Les tags sont invisibles** hors de l'établi d'une pièce : ni dans les listes de
  dossiers, ni dans les résultats de recherche, ni en facette de la recherche. Le moteur
  commun les cherche déjà (champs secondaires) mais rien ne les montre ni ne les propose.

## 3. Propositions (ordre de valeur)

1. **Tags visibles et actionnables** : puces de tags sur les lignes (listes et résultats),
   clic sur un tag = recherche `tag:x` ; facette `tag:` ajoutée au DSL et au panneau
   Filtres. Prérequis léger côté moteur (facette nouvelle), aucun côté back.
2. **Champ « chemin de classement » retiré des établis** : le chemin se voit dans le fil
   d'Ariane et se change par glisser-déposer ou « Déplacer vers » (existant). L'établi
   garde uniquement les tags. Moins de formulaire, zéro perte de capacité.
3. **En-tête d'établi commun** : pour sujet comme pour pièce — pastille de type, titre,
   état, tags, actions (épingler, ouvrir/télécharger, supprimer) — même gabarit, mêmes
   emplacements. Aujourd'hui les deux établis se ressemblent sans s'aligner.
4. **Tags sur les sujets** (avec le back) : même champ, même facette, même affichage.

## 4. Hors de ce périmètre

- L'entité Dossier durable (question posée au back, cf. TODO).
- La refonte des vues de listes (séances, délibérations) — autre chantier.
