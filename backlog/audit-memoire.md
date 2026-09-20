# Audit mémoire et durée de vie des données

Date : 12 septembre 2026. Périmètre : catégorie 1 du [backlog](backlog.md), « Consommation mémoire et durée de vie des données ». Première phase technique, sans modification du code, des données ou des runtimes partagés.

## Résultat

La rétention de représentations HTTP et de détails documentaires pendant la session est confirmée. Il ne s'agit pas encore d'une fuite mesurée dans une utilisation réelle de Hall : certains objets sont délibérément mis en cache. Une fuite de PDF n'est pas démontrée.

## Preuves dans le code actuel

| Zone | Observation vérifiée | Portée |
| --- | --- | --- |
| [Cache Siren](../packages/client/src/services/apiClient.ts) : `representations`, `cacheRepresentation`, `sirenRepresentation` | Map de portée module. Chaque chemin de lecture et lien self est mémorisé ; relire le même chemin remplace sa valeur. Pas de borne, TTL ou libération sur navigation. La réponse 204 supprime le chemin demandé ; une erreur `authentication_required` vide le cache. | Croissance selon les chemins distincts consultés et la taille des représentations. Deux clés peuvent partager la même référence : ne pas les compter comme deux copies de payload. |
| [Store documentaire](../packages/client/src/stores/workspaceResourcesStore.ts) : `adopt`, `open`, `hydrate`, `search` | Les détails ouverts sont conservés par ID avec résumés et représentations. Les recherches/hydratations fusionnent leurs résultats. `remove`, `invalidate`, et le rechargement du catalogue peuvent purger des entrées ; aucune commande release à la fermeture n'est exposée. | Rétention confirmée, pas une multiplication à chaque réouverture du même ID. La Map des chargements de dossiers supprime bien les promesses terminées. |
| [Session de ressource](../packages/client/src/features/resources/useResourceSession.ts) | Le changement de ressource remet à zéro l'état local ; la lecture passe par le store documentaire et conserve donc aussi le détail global. | Le démontage du composant ne suffit pas à libérer ce que le store garde. |
| [Aperçu](../packages/client/src/hooks/useDocumentPreview.ts), [API documentaire](../packages/client/src/services/resourcesApi.ts) | Les aperçus texte/Markdown utilisent un blob ; celui-ci est révoqué au nettoyage et également lorsqu'une réponse arrive après désactivation de l'effet. Les autres aperçus, dont PDF, utilisent directement le lien fourni. | Pas de fuite de blob identifiée sur ce parcours. La mémoire du lecteur PDF du navigateur reste à mesurer ; elle ne se déduit pas du heap JavaScript. |
| [Tableur](../packages/client/src/features/spreadsheet/UniverSpreadsheetAdapter.tsx), [carte](../packages/client/src/features/geographic/useGeographicMapRuntime.ts) | Dispose des abonnements et du runtime tableur au nettoyage ; détachement de la cible de carte. | Nettoyages présents, efficacité réelle après répétitions non mesurée. |

Extraction Code Moniker bornée sur `apiClient.ts`, noms `cacheRepresentation`, `sirenRepresentation`, `representations` : les symboles sont retrouvés. Les observations de durée de vie ci-dessus proviennent de la lecture du code, pas d'une prétendue analyse de heap par Code Moniker.

## Mesure isolée exécutée

Le module réel `apiClient.ts` a été compilé avec esbuild dans `/tmp/hall-memory-api-audit.mjs`. Un processus Node 26.7.0 avec GC explicite a remplacé fetch par des réponses Siren synthétiques : une chaîne ASCII de 65 536 caractères par représentation, chemins distincts. Aucun réseau, aucun accès à une base, aucune page utilisateur.

| Représentations distinctes lues | Heap utilisé après GC (octets) |
| --- | ---: |
| 100 | 17 260 864 |
| 200 | 23 831 728 |
| 300 | 30 444 928 |
| 400 | 37 048 600 |

Puis 400 relectures via `sirenRepresentation` : **zéro fetch supplémentaire**. La croissance d'environ 19,8 Mo entre 100 et 400 confirme la conservation des payloads dans ce scénario. Ce n'est ni un chiffre de production, ni une mesure Chromium, ni une démonstration que 400 documents de Hall ont cette taille. La première tentative du harnais a échoué faute de `window.location.origin` simulé ; l'environnement a été corrigé, pas le code de Hall.

## Suite technique cadrée

1. Sur environnement isolé, mesurer les compteurs d'entrées, heap après GC, mémoire du processus navigateur et octets transférés lors de cycles ouverture/fermeture des mêmes documents, puis de documents distincts. Inclure les PDF et tableurs ; dissocier payloads, caches, DOM et processus de rendu.
2. Vérifier les références encore conservées après fermeture avant de proposer une libération. Une correction démontrée d'abonnement ou de blob sans propriétaire actif peut conserver strictement le comportement, mais aucun oubli de ce type n'est établi par cette première tranche.
3. Pour les caches Siren et workspace, inventorier les consommateurs actifs et les besoins d'autosave avant toute éviction. Préserver les brouillons et les capacités hypermédia, et vérifier les erreurs réseau et retours de navigation. La suppression arbitraire de clés n'est pas une correction déjà validée.

## Décisions non prises et limites

Aucune limite de cache, durée d'expiration, stratégie LRU, nouvelle pagination, ni politique de rechargement n'a été choisie. Une politique qui changerait la disponibilité d'un document lors d'un retour hors réseau, la conservation des brouillons ou le comportement d'erreur nécessite une décision explicite. Question à remonter seulement si ce besoin se confirme : quelle disponibilité attend-on des ressources déjà consultées lorsque leur rechargement réseau échoue ?

L'audit couvre le client documentaire et des nettoyages de rendu ; il ne prétend pas couvrir les caches du serveur, PostgreSQL ou toutes les variantes d'éditeur. Pas de comparaison avant/après optimisation puisqu'aucune optimisation n'a été appliquée. Aucun commit ni redémarrage.

## Deuxième tranche : correction ciblée et copie réelle

Après autorisation de poursuivre, une rétention inutile a été reproduite : ouvrir une ressource par son alias, puis la relire par son identifiant, puis supprimer l'identifiant avec succès laissait l'ancienne représentation de l'alias en cache. La relecture de cet alias retournait encore le document supprimé, sans fetch. Les deux lectures peuvent avoir des objets différents mais le même lien canonique `self`.

Correction dans l'autorité existante `apiClient.ts` : le traitement existant de la réponse 204 supprime désormais les entrées dont le lien canonique correspond à celui invalidé, ainsi que le chemin demandé. Pas de reset global, TTL, LRU, modification de store, brouillon, autosave, page ou modale. Aucun changement de règle d'intégrité. Les données détenues ailleurs par une page active ne sont pas altérées.

Le test [api-client-cache.test.mjs](../packages/client/tests/api-client-cache.test.mjs) exécute le module réel compilé, avec transport simulé. Il vérifie que le refus de suppression conserve l'alias, que le succès invalide l'alias devenu inutile, et qu'une autre ressource reste disponible dans le cache. Résultat : 1 test passé. La reproduction avant correction retournait le payload supprimé avec zéro fetch supplémentaire. Après correction, la relecture de l'alias provoque bien une lecture réseau. Ce changement ne mesure pas un gain global de mémoire ; il élimine une conservation précisément identifiée.

Sur la copie isolée du dump, via un Chromium distinct et le serveur de développement isolé, trois cycles d'ouverture API des mêmes 15 ressources réelles dans le store produisent à chaque cycle : **15 détails, 11 737 octets de JSON sérialisé**. Les réouvertures ne multiplient donc pas les entrées dans ce scénario. C'est une mesure des données du store, pas du heap Chromium ni du rendu PDF, et pas un parcours manuel de modales. Aucune écriture en base. La première tentative de Chromium a rencontré la restriction MachPort de la sandbox ; l'exécution isolée autorisée hors sandbox a fonctionné. Le chemin du module Vite a été corrigé dans le harnais uniquement.

Vérifications : test ciblé vert, `git diff --check` vert, liens locaux vérifiés. Les contrôles structurels ont été lancés : une violation préexistante dans `models/liveMeeting.ts` (commentaire dans une fonction, ligne 181) bloque le contrôle global. Aucun changement dans ce fichier. La vérification TypeScript finale est mutualisée par le coordinateur avec les autres changements client.

Restent ouverts : mémoire de rendu PDF, cycles UI complets avec retour à la page d'origine, poids et nombre des représentations distinctes en longue session. Une politique générale d'éviction reste non choisie, conformément à la limite fonctionnelle définie plus haut.
