# Le document vivant de suivi d’une fonctionnalité Hall

Statut : principes de suivi. La proposition temporaire de schéma et de vues
refusée par le propriétaire a été retirée le 20 septembre 2026 à sa demande.
Les documents et résultats historiques des procédures sont conservés.

Le document Maket accompagne la réalisation d’une fonctionnalité, depuis son
cadrage jusqu’à ses vérifications. Il doit permettre de savoir ce qui a été
demandé, décidé, délégué, construit et réellement vérifié. C’est un document de
suivi partagé, alimenté par les opérations, conservé pendant toute la procédure.

## Ce que les deux premières expériences nous apprennent

| | Commissions et affaires | Modifications en temps réel |
| --- | --- | --- |
| Données | Exigences, revue, architecture, revues spécialisées, livraison par couche. | Exigences et revue structurées, mais suivi surtout dans des listes de textes par page. |
| Résultats | `delivery.layers[].testRuns` contient commande, résultat et provenance ; les opérations de vérification les projettent. | Le journal rassemble des états TRUST et des rapports, tandis que les pages de contrats conservent des formulations du cadrage. |
| Défaut observé | Structure propre à cette fonctionnalité, références et provenance encore perfectibles. | Une page annonce des Checks validés, une autre indique toujours « à construire ». |
| Enseignement | Conserver la séparation des objets métier du suivi. | Ne pas remplacer cette structure par des paragraphes indépendants pour chaque page. |

La seconde structure est une régression du suivi, même si la délégation TRUST
a progressé. Le correctif de synchronisation a actualisé les pages de contrats
et de bilan ; cela ne constitue pas encore une migration vers un modèle commun.

Sources locales de cette comparaison :
[projection des résultats par couche](../scripts/trust/verify-and-project-committee-layer.mjs),
[projection PostgreSQL](../scripts/trust/verify-and-project-committee-sql-v3.mjs),
[synchronisation du temps réel](../scripts/trust/sync-realtime-progress.mjs).

## Autorités et responsabilités

| Information | Autorité | Rôle du document |
| --- | --- | --- |
| Exigence et critères | [Catalogue Hall](../requirements/catalog.json) | Référencer et afficher la version observée ; ne pas créer un second catalogue. |
| Accord produit et arbitrage | the user | Conserver décision, commentaire, auteur et référence au périmètre examiné. |
| Mission et délégation | Plan TRUST | Afficher périmètre, responsable, dépendances, contrats amont et skills requis. |
| Constat de revue | Rapport sourcé de l’agent | Afficher le constat et sa résolution ; ce n’est pas un test réussi. |
| Résultat d’exécution | Operation et sortie enregistrée | Afficher les observations et leur provenance. |
| Qualification d’un Check | TRUST | Afficher le verdict réellement accepté et sa tentative. |
| Présentation | Maket | Rendre les mêmes données sous plusieurs vues, sans inventer de statut. |

TRUST n’a pas besoin d’une intégration native spécifique à Maket. Une Operation
peut lire ses sources et utiliser l’interface MCP de Maket pour projeter les
données. Les contrats restent propres à Hall ; le runtime TRUST garde son rôle
générique. Un agent coordonne et explique, mais sa prose ne remplace pas les
résultats d’exécution ni une décision humaine.

## Alimentation par opérations

1. Lire le Plan, les verdicts acceptés et les sorties disponibles, ainsi que
   les décisions Maket et les exigences du catalogue pertinentes.
2. Normaliser les données dans le schéma commun en conservant leur origine.
   Un résultat lu dans un rapport d’agent reste `agent_report`, même si une
   Operation a exécuté la lecture du fichier.
3. Vérifier les références et distinguer absence d’information, échec, réussite
   et résultat historique. Ne pas inventer de date, de tentative ou de version.
4. Écrire une révision Maket avec contrôle de concurrence, puis relire le
   contenu enregistré. Préserver les commentaires et décisions humains.
5. Produire la référence et la révision écrites, les sources observées et les
   éventuelles données manquantes. Le Check qualifie ces observations.
6. Afficher l’état de synchronisation. En cas d’échec, conserver le dernier
   instantané et indiquer son ancienneté ; ne pas annoncer une mise à jour.

La projection doit être idempotente pour des sources identiques. Elle ne relance
pas les tests pour simplement afficher leurs résultats. Les résultats doivent
rester rattachés à l’exécution et au code contrôlés ; un changement de code ne
rend pas un ancien résultat vert automatiquement valable.

Une Operation peut être exercée indépendamment du Plan via le mécanisme Trial
documenté par TRUST. Son résultat reste un résultat d’Operation : cela ne valide
aucun Check du Plan. De même, exécuter directement un script de projection
n’est pas une nouvelle tentative TRUST. Pour un Check, utiliser le Runner et
l’URI réellement fournie par le Plan, avec l’intention courante.

## Présentation Maket

- Contexte et exigences : données d’entrée, avec références cliquables lorsque
  la cible est disponible.
- Décisions et revues : auteur, périmètre, constats et résolutions identifiables.
- Livraison par couche : élément réalisé, exigence, Check et preuve associés.
- Bilan : mêmes données agrégées, limites et reste à faire.
- Wireframe : conception approuvée, distincte d’une capture du logiciel livré.

Utiliser un code visuel commun pour les entrées, les sorties TRUST et les
rapports d’agents. Conserver aussi un libellé explicite : la couleur ne suffit
pas. Le nombre de pages s’adapte à la lisibilité ; le schéma ne change pas.
Une revue initiale peut conserver « à construire » dans son historique, mais
elle doit être datée et identifiée comme telle, pas affichée comme état actuel.

## Conditions de fin

Un Plan complet atteste ses obligations déclarées. Pour annoncer la livraison
Hall, il faut aussi que le périmètre convenu soit couvert : exigences reliées au
code et aux vérifications, revues résolues, preuves pertinentes disponibles,
architecture/taxonomie contrôlées et document synchronisé. Une lecture de
rapport ou des marqueurs présents dans le code ne suffisent pas à prouver le
comportement de l’application.

La suppression du schéma temporaire n’installe aucun contrat de remplacement
et ne modifie pas les documents historiques. Chaque travail conserve son
périmètre autorisé, ses sources et les décisions explicites du propriétaire.
