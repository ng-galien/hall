# Backlog

## Recherche unifiée (spec : docs/spec-recherche-unifiee.md)

- Fait : moteur commun `src/lib/search.ts` (DSL facettes + termes, sans accents, classement proximité/qualité/alphabétique, tests unitaires) ; menu `@` branché dessus (alias directs, `dossier:`, `état:`, échantillon équilibré à vide, annonce « n autres résultats ») ; `matchesQuery` partage la normalisation.
- Fait aussi : sélecteur complet (« Tout parcourir », filtres avec compteurs, sections par dossier ordonnées par pertinence, aide en jetons) accessible depuis la barre de l'éditeur et le menu `@` ; `WorkspaceSearch` basculée sur le moteur commun (DSL tapable dans le champ, proximité du dossier ouvert, sections par dossier en liste).
- Reste : basculer les filtres des pages de listes (séances, délibérations, membres) sur le moteur ; passer le `searchContext` (dossier du sujet en cours) depuis les établis de l'éditeur.

## Éditeur — refonte Tiptap en cours

- Verrouiller en tests Playwright les comportements de table : fusion/scission, alignement de colonne (invariant colonnaire), ligne de total, boutons « + », bascule GFM ↔ HTML embarqué stable à l'aller-retour.
- Tester le collage d'une plage réelle Excel/Word (the user) : le moteur lit le HTML du presse-papier, à recetter sur pièce.
- Recetter le redimensionnement de colonnes à la souris (CSS des poignées posé, geste à valider).
- Fait au banc : références `:member`/`:resource` en puces (éditeur + rendu), recherche `@` typée (`@terme`, `@doc:terme`, alias fr/en), insertion de pièces en carte cliquable qui ouvre le document. Reste : brancher sujets/séances/délibérations comme sources de la recherche `@`, et un rendu cliquable des références dans les vues de l'application.
- Menu `/` (insertion rapide), poignée de déplacement des blocs, typographie française automatique (espaces insécables, guillemets), encadrés `:::note`, saut de page à l'impression.
- Fait : les cinq pages basculées sur le nouvel éditeur (mentionables via le hook commun `useMentionables`, contexte de dossier passé par les établis) ; @mdxeditor/editor désinstallé, ses styles et le vieux composant supprimés. Reste : réécrire les specs e2e de l'éditeur ; rebrancher l'insertion d'images (l'ancienne plomberie `uploadEditorImage` est partie avec l'ancien éditeur).
- Souligné : sérialise `++texte++`, syntaxe que remark-gfm ne connaît pas — soit le module commun l'ajoute, soit on retire le bouton (à trancher avec le back).

## Dossiers de classement — question d'architecture à trancher

- Aujourd'hui les chemins de dossiers sont virtuels : dérivés des `folderPath` des sujets et documents, plus des `pendingPaths` éphémères côté client. Un dossier vide n'existe pas durablement (il disparaît au rechargement) ; pas de renommage ni d'ordre propre.
- À trancher avec le back : faut-il une entité Dossier (dossiers vides durables, renommage, réordonnancement, arborescence préparée avant les documents) ou rester au modèle virtuel autonettoyant ?

## Contrat @hall/templating — à transmettre au back

- Le markdown peut contenir des tables HTML embarquées quand elles dépassent le GFM (fusion, largeurs, cellules multi-blocs, en-tête latérale) ; les tables simples restent en pipes GFM.
- Pipeline de rendu : activer rehype-raw ; étendre rehype-sanitize à `table, colgroup, col, tbody, thead, tr, th, td` avec `colspan`, `rowspan`, `style` (limité à `text-align`, `min-width`, `width`) ; rendre ces tables dans le PDF.
- Trancher le sort du souligné `++texte++` (cf. ci-dessus).

## Convocations — à revérifier avant une version alpha

- Revalider avec les textes et la pratique communale la date de référence d’une convocation, le calcul des jours francs et le fuseau horaire applicable.
- Revalider spécifiquement la seconde convocation après défaut de quorum : preuve de l’envoi, chronologie avec le constat du défaut de quorum et délai avant la nouvelle réunion.
- Modéliser, quand le parcours de préparation sera stabilisé, les preuves d’envoi et de publication ainsi que les variantes liées à la population de la commune et à l’urgence.

Ces points sont volontairement laissés au backlog. Le prototype conserve uniquement les invariants minimaux nécessaires pour empêcher une chronologie manifestement incohérente.

## Mode présentation — vidéoprojecteur

- Recetter tout le déroulé de séance sur un écran de vidéoprojection professionnel en affichage étendu, avec 1280 × 1024 comme résolution de référence pour le mode présentation.
- Vérifier à cette résolution la lisibilité à distance, le scroll de l’appel, de la timeline, du contenu et du scrutin, ainsi que l’accès permanent aux actions de conduite.

## Modèles documentaires

- Template de pouvoir imprimé.
- Template de la liste des délibérations.
- Template de convocation.
- Template de délibération.
- Template de sujet.
- Définir une nomenclature d’export configurable via un template de dossier.

## Sujets du conseil

- Permettre de définir une date limite sur un sujet du conseil.
