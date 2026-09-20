# Méthodes TRUST de Hall

Référence générale : [Méthodes de production logicielle](http://127.0.0.1:4176/docs/guides/software-methods).
État courant : [carte opérationnelle](trust-operations.md).

Hall est dans la phase initiale d'adoption de TRUST. Les Procedures de
réalisation ne sont pas encore stabilisées. Les missions utilisent donc la
construction progressive et des Procedures inline jusqu'à ce qu'une méthode
réutilisable soit démontrée.

## Enchaînement actuel

1. **Bootstrap obligatoire.** Charger les règles, exigences, architecture et
   principes d'interface; relever l'état Git et identifier le runtime visé.
2. **Clarification progressive.** Réserver chaque inconnue dans une mission
   bornée. Les Plans enfants traitent les contextes découverts et rendent leur
   Result au parent.
3. **Décision produit.** the user décide le périmètre, le comportement, le
   modèle, les droits et l'ergonomie. Le catalogue enregistre la décision.
4. **Réalisation adaptée.** Composer les missions et Checks à partir des
   propriétaires, invariants, contrats et contrôles réellement concernés.
5. **Consolidation.** Publier une méthode commune uniquement après l'avoir
   éprouvée sur le projet.

## Carte d'une réalisation

| Élément | Autorité ou point d'entrée |
| --- | --- |
| Exigence et critères | [`requirements/catalog.json`](../requirements/catalog.json) |
| Propriétaire du comportement | [Architecture](architecture.md) |
| Contrats traversés | Domaine, PostgreSQL, serveur, Siren, client, templating ou Maket selon le périmètre |
| Contrôles disponibles | [Carte des contrôles](trust-verification-map.md) |
| Scripts exécutables | [Catalogue des scripts](script-catalogue.md) |
| Livraison approuvée | [Workflow de livraison](trust-workflow.md) |

Une mission ne se nomme pas seulement « backend », « frontend » ou « test ».
Elle précise l'exigence, le propriétaire, le contrat et la preuve attendue.

Une Operation TRUST porte son exécution. Hall ne crée pas de script propre à une
mission TRUST. L'Operation peut appeler une commande Hall durable répertoriée
dans la carte des contrôles.

Les migrations, la CI, le déploiement et la production gardent leurs propres
environnements et autorisations. Une Procedure ne crée aucune décision produit
et n'autorise ni commit, publication ni déploiement.
