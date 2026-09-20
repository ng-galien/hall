# Carte opérationnelle TRUST de Hall

État relevé le 20 septembre 2026. Relire les Plans par le MCP TRUST avant
d'agir : leur état live reste l'autorité.

## Points d'entrée

1. [`AGENTS.md`](../AGENTS.md) : autorités et limites du projet.
2. [Méthodes de production logicielle](http://127.0.0.1:4176/docs/guides/software-methods) :
   méthode progressive de TRUST.
3. [Méthodes TRUST de Hall](trust-adoption.md) : adaptation au projet et aux
   phases du travail.
4. [Carte des contrôles](trust-verification-map.md) : commandes, facettes et
   objet de chaque vérification.
5. [Catalogue des scripts](script-catalogue.md) : scripts exécutables, appelants
   et effets.
6. [Livraison d'une feature](trust-workflow.md) : réalisation après approbation
   du périmètre.
7. [Document vivant](living-feature-document.md) : suivi Maket.

Dans le MCP TRUST, lire `agents/SKILL`, `agents/execute-and-coordinate`,
`reference/procedures/delegation`, `reference/plans/agent` et
`reference/principles/intent-and-escalation`. Ne pas recopier ces références
dans la documentation Hall.

## Phase actuelle

Hall est dans la phase initiale d'adoption progressive. Les méthodes exactes de
réalisation et de vérification ne sont pas encore toutes consolidées dans TRUST.

Le fonctionnement retenu est le suivant :

- le bootstrap est obligatoire au démarrage d'une coordination ;
- la clarification réserve les inconnues dans des collections de missions ;
- les contextes découverts sont traités par des sous-Procedures inline et, si
  nécessaire, des Operations inline ;
- TRUST crée les Plans enfants et conserve les missions acceptées ;
- les Results enfants alimentent le parent uniquement par les correspondances
  déclarées ;
- après clarification, la réalisation est découpée selon les exigences, les
  propriétaires, les invariants, les contrats et les vérifications réels de Hall.

La liberté des missions inline reste limitée par leur portée. Elle n'autorise
pas une décision produit, un changement de modèle ou une action externe non
déclarée.

## Procedures et Plans

| Objet | État vérifié | Suite |
| --- | --- | --- |
| `hall-work-bootstrap@0.1.3` | Procedure publiée. | Prépare la coordination ; n'engage pas une feature. |
| `hall-coordination-bootstrap-2026-09-20-v4` | `IN_PROGRESS`, révision 14, 12 Checks sur 13. | Relire le Plan et le document Maket `Hall — Commune — premier cadrage`. Le Check courant lit la décision du propriétaire. |
| `hall-municipality-clarification@0.1.0` | Procedure publiée pour `HALL-FR-COM-010`. | Coordonne les missions de clarification ; n'implémente rien. |
| `hall-municipality-clarification-2026-09-20` | `COMPLETE`, révision 7. Quatre missions satisfaites : base, Siren/droits, IHM, projection Maket. | Les rapports restent `needs-decision`. `COMPLETE` ne vaut pas approbation produit. |

Les rapports sont dans [`clarification-commune/`](clarification-commune/).

## Décisions ouvertes pour la commune

the user doit encore décider :

- les champs existants de `HallSettings` visibles et modifiables ;
- les profils autorisés à lire et à modifier ;
- si une évolution de `settings.manage` doit aussi donner la capacité actuelle
  de configuration de la mandature.

Aucun changement de schéma, donnée, rôle ou permission n'est approuvé.

## Reprise par un agent

1. Lire `AGENTS.md` et cette carte.
2. Inspecter le statut Git et les diffs ; préserver le travail existant.
3. Vérifier l'environnement `hall-mairie-local` et les Procedures par le MCP.
4. Relire les deux Plans nommés ci-dessus avec `trust_plan_read`.
5. Utiliser uniquement l'URI de Check fournie et respecter sa portée et son
   intention courante.
6. Exécuter le Runner depuis la racine :

   ```sh
   npm run trust:run -- '<uri-de-check-fournie-par-trust>' --json
   ```

7. Lire `result` et `next`. Seul `COMPLETED` avec `VALIDATED` satisfait un
   Check.
8. Pour ajouter une mission progressive, conserver toutes les missions acceptées
   et utiliser la révision courante du parent. La déclaration crée le Plan enfant ;
   elle ne lance pas un agent.
9. Arrêter le travail qui dépend d'une décision du propriétaire.

Mettre cette carte à jour avec les identifiants et états Hall. Laisser la
grammaire, le Runner, la délégation et l'intention chaînée dans la documentation
TRUST.
