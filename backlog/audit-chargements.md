# Audit borné des chargements et requêtes sélectives

12 septembre 2026 — checkout `69c0b87`, lecture seule du code ; aucun changement applicatif, accès production ou redémarrage. Périmètre : item « Chargement à la demande et requêtes sélectives » du débrief. Les autres volets restent distincts.

## Résultats établis par lecture

| Parcours | Preuve | Conclusion bornée |
| --- | --- | --- |
| Initialisation de l'application | `packages/client/src/App.tsx:88`, `hooks/useApplicationData.ts:18-28` | Six stores sont chargés, puis l'activité de toutes les affaires. Ce chargement est global, indépendant de la page sélectionnée. |
| Affaires | `packages/client/src/stores/councilBusinessStore.ts:154-161` | La liste des affaires est suivie du chargement des rattachements de ressources pour tous les identifiants retournés. Ce n'est pas une lecture du seul dossier visible. Cela ne démontre pas un téléchargement des binaires PDF. |
| Historique des affaires | `packages/client/src/stores/workspaceCouncilActivityStore.ts:40-69` | Les occurrences sont récupérées pour toutes les affaires par lots de 100, en parallèle. Il existe déjà une mutualisation des appels en cours ; ce n'est pas un appel par affaire. Le volume reste proportionnel à l'ensemble des occurrences. |
| Séance | `packages/client/src/hooks/useCouncilMeeting.ts:105-160` | Lecture de la séance, puis agenda, scrutins et conduite ; ensuite votes et participations de chaque scrutin, plus son aperçu lorsqu'il existe. Le détail de tous les scrutins est sollicité, pas seulement celui du point sélectionné. |
| Mutation de séance | `packages/client/src/hooks/useCouncilMeeting.ts:169-176` | Le helper générique recharge la séance et la liste des séances après l'action. Les commentaires ne passent pas par ce helper : `saveAgendaItemNotes`, lignes 75-103, met à jour le point localement après sauvegarde. Préserver cet autosave. |
| Documents | `packages/client/src/stores/workspaceResourcesStore.ts:219-289` | L'existant distingue catalogue, dossiers et ouverture de détail. Les dossiers déjà chargés ne sont pas relus sauf demande forcée, et les requêtes simultanées d'un même dossier sont mutualisées. Il ne faut pas repartir du principe que tout est déjà chargé en détail. |
| Représentation Siren | `packages/client/src/services/apiClient.ts:245-278` | La représentation d'une lecture est conservée. `sirenRepresentation` retourne son cache avant de relancer HTTP. L'appel suivant `listCouncilMeetings` dans le store ne constitue donc pas à lui seul un deuxième GET. |

## Quantification statique, pas mesure réseau

Pour une exécution réussie de `useCouncilMeeting.load`, le code déclenche **4 + 2B + P appels aux services HTTP**, où B est le nombre de scrutins et P le nombre de scrutins possédant un aperçu. Pour six scrutins avec aperçu : 22 appels. Cette formule décrit le code, pas une capture de la séance réelle ; elle exclut initialisation globale, effets de montage, authentification, cache navigateur et mutations.

L'activité des affaires utilise `ceil(A / 100)` appels pour A affaires non vides. Le lot limite la taille de la liste d'identifiants, pas le nombre total d'occurrences renvoyées, et tous les lots partent ensemble.

Aucune durée, taille transférée, consommation mémoire ni plan SQL n'a été mesuré dans cette tranche. Aucun ralentissement ne peut donc être attribué quantitativement à ces mécanismes.

## Agrégat serveur : attention au faux positif

`packages/server/src/services/councilMeetingService.ts:93-128` récupère toutes les décisions avant filtrage aux décisions de l'agenda et toute la liste des séances pour la readiness. C'est un candidat statique à sélection SQL plus précise. Toutefois la recherche des usages de `getMeeting` dans le serveur ne montre que sa déclaration et sa définition : **le chemin HTTP actuel n'est pas établi comme consommateur**. Ne pas annoncer que cet agrégat explique la lenteur en production, ni optimiser cette branche avant d'établir qu'elle est appelée.

Code Moniker CLI a confirmé la racine du workspace ; les requêtes symboliques ont répondu `workspace_loading` pendant l'indexation. Aucun fait d'usage issu de l'index n'est revendiqué. Les preuves ci-dessus proviennent des fichiers lus directement.

## Prochaine tranche possible sans choix produit

1. Instrumenter sur serveur et navigateur isolés les GET d'ouverture de l'application, d'une affaire, d'une séance et d'une mutation ordinaire : nombre d'appels, octets reçus, durée, nombre de lignes SQL. Jeux synthétiques croissants, sans les données de production.
2. Relever les doublons réellement simultanés à paramètres identiques. Étendre la mutualisation des promesses, déjà présente dans les dossiers, seulement avec vérification des mutations intervenant pendant une lecture : ne pas réutiliser un résultat antérieur à une écriture.
3. Pour un chemin serveur réellement exercé, remplacer une lecture générale suivie d'un filtre par une projection sélective équivalente, si elle conserve intégralement les données, l'ordre et les capacités du contrat. Comparer les réponses normalisées avant/après et les plans SQL ; aucune modification d'invariant.
4. Mesurer le rechargement après mutation et préparer une suppression des lectures redondantes uniquement lorsque la réponse autoritaire contient déjà les mêmes informations. Conserver erreurs, capacités Siren et fraîcheur des données.

## Choix qui empêchent une correction automatique

Différer un historique, un aperçu de scrutin ou un store global peut modifier le moment où une information ou une erreur devient visible. Ajouter pagination, recherche limitée, cache durable ou politique de fraîcheur décide également d'un comportement. Cette tranche ne choisit aucun de ces comportements.

Question à remonter avant ce type de modification : **quelles informations peuvent attendre l'ouverture de leur section, et quelle indication faut-il conserver pendant leur chargement ou en cas d'échec ?** Tant que ce point n'est pas décidé, l'audit et les optimisations strictement équivalentes restent possibles, mais pas le changement de parcours.

## Limites et vérification du livrable

Audit volontairement centré sur initialisation, affaires, séance et documents. Pas d'audit exhaustif de chaque écran, pas de profil mémoire (autre item), ni de recette sur le runtime de l'utilisateur. Fichier relu ; seules des références locales existantes sont citées. L'item du backlog n'est pas marqué terminé : les mesures dynamiques et optimisations restent à faire.

## Seconde tranche : copie isolée et première optimisation

La copie du dump sur PostgreSQL développement a un manifest strictement identique au checkout. Serveur source isolé sur 3128 et Vite sur 5188, sans bascule de production ni du runtime partagé. Navigateur Chromium séparé ; lancement hors sandbox nécessaire à cause de la permission MachPort de macOS.

Une ouverture de la séance terminée sur cette copie a reçu uniquement des réponses API 200. Mesures de corps JSON décodés, sans compression réseau ni en-têtes :

- rattachements des ressources : 514 219 octets par réponse ;
- liste des affaires : 250 974 octets ;
- occurrences d'agenda des affaires : 357 684 octets ;
- catalogue documentaire : 138 461 octets.

La capture Vite contient les doubles montages de React StrictMode ; ses doublons ne prouvent **pas** les mêmes doublons dans le build de production. Le cumul ne constitue donc pas une mesure production. Capture temporaire privée : `/tmp/hall-load-audit.json`.

### Correctif effectué, comportement constant

La projection du store des affaires filtrait les R rattachements pour chacune des A affaires. `councilBusinessViews` dans l'autorité existante `models/councilBusiness.ts` les regroupe une fois par identifiant d'affaire puis réutilise **la même** fonction `councilBusinessView`. Le store appelle cette projection groupée. Aucun nouveau propriétaire de la règle : exclusion du rapport et des dossiers, tri, doublons et conversion restent dans la fonction existante.

Les appels HTTP, validations de réponse, bloc `try/catch`, fraîcheur, autosave et navigation sont inchangés. Aucune limite, pagination, éviction ou attente conditionnelle n'est ajoutée. Les modales et leur page d'origine ne sont pas touchées.

Sur les projections réelles de la copie (58 affaires, 129 rattachements), les objets produits avant/après sont profondément égaux. Micro-mesure Node après 100 échauffements, médiane de 9 lots de 1 000 projections : **0,0772 ms avant ; 0,0477 ms après**. Gain CPU local modeste : environ 0,03 ms pour ce jeu. Cela n'explique pas à lui seul la latence de navigation ; aucun gain réseau n'est annoncé.

Trois tests ciblés passent : ordre des affaires et égalités de position, associations dupliquées, exclusion dossiers/rapport/affaires absentes, ensembles vides, entrées non mutées ; nombre d'inspections largement réduit sur 100 affaires et 1 000 rattachements. Le chemin d'erreur de chargement reste le même bloc du store, sans nouveau mécanisme réseau.

Contrôle AST exhaustif réussi. Code Moniker racine : violation préexistante sur le commentaire `liveMeeting.ts:181`, sans violation dans les fichiers modifiés. Les tentatives de contrôle fichier seul ne sont pas compatibles avec la configuration workspace ; le contrôle racine est celui retenu.
