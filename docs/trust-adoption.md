# Adopter TRUST comme histoire procédurale de Hall

Hall est le premier projet choisi pour une adoption suivie de TRUST. Le but est de
retrouver, pour une mission bornée, l'intention autorisée, la procédure suivie,
les observations acceptées, les refus, les reprises et le résultat qualifié.
Cette histoire commence à la première exécution réelle sous TRUST : on ne
reconstitue pas le passé en inventant des Facts ou des verdicts.

Ce guide décrit une méthode d'adoption. Il n'autorise à lui seul ni publication
de Procedure, ni engagement de Plan, ni action sur les données Hall. Le
[workflow de livraison](trust-workflow.md) détaille le cas d'une fonctionnalité
avec document Maket ; ses Operations et sa Procedure restent à écrire et vérifier.

## Quatre autorités, quatre questions

| Autorité | Question | Limite |
| --- | --- | --- |
| [Catalogue Hall](../requirements/catalog.json) | Quel comportement est exigé, avec quels critères et quelles sources ? | Il ne prouve pas que ce comportement est livré. |
| Git et tests Hall | Quel code a changé et quels scénarios ont été exécutés ? | Un test vert ne qualifie pas toute une mission. |
| Document Maket | Qu'a-t-on présenté à the user et que montre la livraison ? | Sa complétude ne constitue ni un accord implicite ni un verdict TRUST. |
| TRUST | Quelle Procedure/version a été engagée, quels Checks ont reçu des Facts, quels verdicts et quelles réouvertures ou escalades ont suivi ? | Il ne décide pas de la règle métier ou du droit applicable. |

La décision produit reste celle du propriétaire. VALIDATED signifie que les Facts
acceptés satisfont la Procedure publiée, non qu'une proposition non approuvée
est devenue une règle Hall. Le catalogue reste l'unique autorité de formulation
des exigences ; TRUST ne crée pas un second registre de comportements.

## L'unité de l'histoire : une mission bornée

Une livraison ou investigation autorisée peut devenir un Plan lorsque son
périmètre, sa Procedure et ses entrées sont connus. Éviter un Plan permanent
pour tout Hall : son historique serait difficile à relier à une décision
précise. À l'engagement, choisir un identifiant stable, un titre et, si utiles,
des labels ou annotations renvoyant aux IDs d'exigences, à la tâche et au
document de revue. Ces métadonnées sont immuables et ne simulent aucun
résultat ; seules les entrées compilées de la Procedure vont dans le contexte.

Une Procedure versionnée décrit la portée autorisée et interdite, les
préconditions, les Checks, les observations attendues et leurs raisons de
succès ou d'échec. Une Operation décrit l'action réutilisable et son schéma
Produced, sans décider si le Check est satisfait. L'engagement épingle les
versions de toute la composition : une publication ultérieure ne réécrit pas
les Plans existants.

L'histoire utile suit cette séquence :

1. Décision et périmètre : exigences Hall sélectionnées, exclusions et accord
   explicite avant les modifications qui en dépendent.
2. Procedure publiée et Plan engagé : versions, environnement, entrées et
   Checks bloqués ou actionnables.
3. Tentatives : admission, action du Runner, Facts acceptés, verdict et delta
   de checklist. Un refus ou une interruption sans Facts acceptés ne fabrique
   pas un NOT_VALIDATED.
4. Écart et reprise : correction dans la portée, ou escalade avec raison du
   blocage et action interdite ; reprise opérateur avec sa propre raison.
5. Livraison : état courant du Plan, références Git/tests et document Maket
   actualisé. COMPLETE décrit la checklist de cette Procedure, pas une
   certification générale de Hall.

Ne pas importer d'anciens tests verts comme Facts live. Les livraisons
antérieures restent documentées par Git, le catalogue et leurs rapports
d'origine. Une nouvelle observation datée ne doit pas prétendre avoir été
effectuée dans le passé.

## Premier parcours : petit, observable, réversible

Le premier candidat est un Check de lecture, lié à une exigence et à une
vérification Hall existantes, sur un environnement de test ou un checkout sans
données de production. Son Operation produit des valeurs structurées utiles à
la qualification, pas seulement un code de sortie. L'exigence et son critère
exact sont choisis dans le catalogue avant la Procedure ; ce guide ne choisit
pas une règle métier à la place du propriétaire.

1. Inventorier l'exigence, ses références d'implémentation et de test, le
   scénario exécutable, ses données et ses effets éventuels. Une commande qui
   modifie l'état n'est pas une lecture.
2. Rédiger des brouillons d'Operation et de Procedure avec portée fermée,
   entrées minimales et observations positives, négatives et manquantes.
   Compiler contre le catalogue réellement disponible.
3. Répéter sans action Hall : simuler l'Operation pour son Produced, puis faire
   un dry-run de la Procedure avec Facts saisis par l'opérateur. Vérifier les
   refus, la qualification négative et les dépendances. Ce dry-run ne devient
   pas l'histoire live.
4. Essayer l'Operation seule, si elle est non destructive, par un Trial dans un
   environnement jetable. Lire son résultat terminal ; un Trial ne crée ni
   Fact de Plan ni verdict de Check.
5. Faire approuver la Procedure et sa portée. Compilation et Trial ne valent
   pas autorisation de publication ou d'engagement. Publier une version
   immuable seulement après autorisation, puis la relire.
6. Engager un Plan live autorisé, lire son état par MCP, donner au Runner l'URI
   exacte du Check, puis relire verdict et historique. Ne pas relancer
   directement la commande contenue dans l'Operation.
7. Comparer Fact accepté et raison du verdict, sortie de commande, test Hall,
   état Git et exigence ciblée. Relever toute lacune avant la mission suivante.

Ce pilote est réussi seulement si l'on peut retrouver la Procedure/version et
le Plan, distinguer résultat positif et négatif, et expliquer une erreur sans
inventer de Fact. Étendre ensuite aux livraisons avec revue Maket selon le
[workflow détaillé](trust-workflow.md), puis aux Operations de modification
uniquement après vérification de leur portée et de leurs permissions.

## Routine pour les livraisons suivantes

Avant de coder, identifier les exigences touchées, les décisions non résolues
et les exclusions. Si la mission utilise Maket, conserver le même document
avant et après réalisation. Un changement matériel de périmètre revient à
the user ; on n'assouplit pas une qualification pour obtenir un Check vert.

Les Checks de livraison observent séparément les exigences enregistrées, les
références d'implémentation et de tests, les tests réellement exécutés et
l'état du document. La commande npm run check:requirements contrôle la
cohérence des références, mais pas l'exécution des tests ni l'exhaustivité de
la mission choisie.

Pendant l'exécution, lire le Plan courant avant de choisir le travail.
Remplacer les déclarations d'agent avec la révision lue et le jeu complet
autorisé. Exécuter une seule URI de Check fournie par TRUST à la fois, puis
suivre la continuation du Runner. Après une erreur ou une réponse perdue,
relire Check et Plan avant tout réessai : l'effet externe peut être inconnu.
Une action non rejouable après résultat inconnu exige une intervention humaine.

Pour clore une mission, transmettre le lien du Plan, la version de Procedure,
les IDs d'exigences, le document de revue, les références Git et les résultats
de tests réellement obtenus, ainsi que les Checks ouverts et les décisions
restantes. Commit, publication et déploiement gardent chacun leur autorisation
propre, même si le Plan est COMPLETE.

## Connexion et précautions locales

La [configuration MCP du projet](../.codex/config.toml) pointe vers
[http://127.0.0.1:4498/mcp](http://127.0.0.1:4498/mcp). Avant de travailler, vérifier /health et
tools/list, puis découvrir les guides via trust_documentation_list et
trust_documentation_read. Une absence de connexion dans la session ne justifie
pas la création d'une seconde instance ou base TRUST.

Le Runner installé dans .agents/skills/trust lit
[.trust/runner.env](../.trust/runner.env), pas la configuration MCP. Depuis la
racine de mairie, lancer :

    npm run trust:run -- '<uri-du-check-fournie-par-trust>' --json

Ne jamais reconstituer cette URI soi-même.

Ne placer aucun secret dans les sources d'Operation, les entrées de Plan ou
les valeurs ordinaires d'Environment. Le Runner agit avec ses permissions
externes propres. Préférer des ressources jetables pour la vérification ; ne
pas réinitialiser la session Hall partagée ou la base locale de production pour
faire passer un premier Check. Lire les [règles du projet](../AGENTS.md).
