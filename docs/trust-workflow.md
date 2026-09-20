# Livraison d'une fonctionnalité Hall avec TRUST

Ce workflow commence après approbation du périmètre. Lire d'abord la
[carte opérationnelle](trust-operations.md) et les
[méthodes TRUST de Hall](trust-adoption.md).

## Parcours

1. Lire les exigences concernées dans le
   [catalogue](../requirements/catalog.json), leurs critères, leur cycle de vie
   et leurs sources. Enregistrer toute clarification approuvée avant de coder.
2. Créer ou réutiliser un seul document Maket selon le
   [contrat du document vivant](living-feature-document.md). Il présente le
   périmètre, les décisions, les inconnues et le comportement attendu.
3. Définir la Procedure de livraison et ses missions inline à partir des
   propriétaires et contrats réels. Utiliser `@intent-chaining` et reprendre
   l'intention exacte du Plan à chaque Check.
4. Faire approuver le périmètre présenté. La complétude du document et l'accord
   du propriétaire sont deux conditions distinctes.
5. Implémenter par propriétaire. Choisir les contrôles ciblés dans la
   [carte des contrôles](trust-verification-map.md), puis appliquer les contrôles
   plus larges imposés par [`AGENTS.md`](../AGENTS.md).
6. Alimenter le même document Maket avec les résultats réellement observés,
   leur provenance, les échecs et le reste à faire. L'Operation porte cette
   exécution; Hall ne crée pas de script propre à la mission.
7. Livrer le Plan, le document, les exigences couvertes, les contrôles exécutés
   et les décisions encore ouvertes. Commit, publication et déploiement gardent
   chacun leur autorisation.

## Conditions de livraison

| Contrôle | Résultat attendu |
| --- | --- |
| Exigences | Chaque comportement accepté existe dans le catalogue. |
| Implémentation | Chaque exigence possède une référence vers le code de production. |
| Vérification | Chaque exigence possède une référence vers un test pertinent. |
| Exécution | Les contrôles adaptés ont réellement réussi sur le candidat livré. |
| Document | Maket reflète le même périmètre et les résultats actuels. |

`npm run check:requirements` contrôle les références; il ne prouve pas à lui
seul le comportement. Un Check TRUST n'est satisfait que par les observations
acceptées selon sa Procedure.

## Runner installé

Depuis la racine de Hall, exécuter uniquement l'URI fournie par TRUST :

```sh
npm run trust:run -- '<uri-du-check>' --json
```

Le Runner lit `.trust/runner.env`. Le MCP du projet est configuré dans
`.codex/config.toml`. Ne reconstituer ni l'URI ni les endpoints.
