# Fiabilité des machines d’état

Les cycles de vie simples de Hall sont des automates finis déterministes. Leur contrat est vérifié contre une matrice indépendante qui couvre chaque couple `état × événement`, y compris toutes les transitions refusées.

| Machine | État initial | États terminaux | Invariants principaux |
| --- | --- | --- | --- |
| Séance | `draft` | `closed`, `cancelled` | ouverture après programmation ; clôture ordinaire uniquement pendant la séance ; clôture pour défaut de quorum avant ouverture |
| Point d’ordre du jour | `scheduled` | `examined`, `postponed`, `withdrawn` | examen après démarrage ; report ou retrait avant la fin ; aucun retour depuis un état terminal |
| Délibération | `draft` | `enforceable` | décision uniquement après programmation ; réouverture d’un vote adopté ou rejeté ; caractère exécutoire uniquement après adoption |
| Procès-verbal | `notStarted` | `published` | génération, finalisation, approbation, signature et publication dans cet ordre strict |

Les listes d’événements vivent à côté de chaque union et sont exhaustives à la compilation. Les tests ajoutent trois preuves complémentaires :

- matrice complète de toutes les transitions acceptées et refusées ;
- 2 000 séquences arbitraires par machine comparées à la matrice indépendante ;
- parcours courts XState atteignant chaque état déclaré.

Commandes :

- `npm run test:lifecycle` : matrices, séquences, atteignabilité et politiques associées ;
- `npm run test:lifecycle:mutation` : mutation ciblée des quatre machines ;
- `npm run test:ballot` et `npm run test:ballot:mutation` : protections distinctes du scrutin, dont les gardes dépendent des données de participation.
