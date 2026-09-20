# Revue SQL — rattachement des commissions aux affaires

État : proposition en lecture seule, non appliquée. La première variante `ON DELETE CASCADE` côté affaire a été écartée après contrôle du contrat de suppression existant.
Exigence : `HALL-FR-BUS-070`.

## Schéma constaté

- `hall.council_business` a une clé primaire `id UUID` dans `packages/postgres/sql/council/015-council-business.sql`.
- `hall.council_committee` a une clé primaire `id UUID` et un champ `archived_at` dans `packages/postgres/sql/directory/010-model.sql` ; sa création précède celle des affaires dans le manifeste.
- `hall.council_business_resource` utilise déjà une clé primaire composée et `ON DELETE CASCADE` côté affaire.

## DDL proposé, non exécuté

```sql
CREATE TABLE hall.council_business_committee (
  council_business UUID NOT NULL
    REFERENCES hall.council_business (id) ON DELETE RESTRICT,
  committee UUID NOT NULL
    REFERENCES hall.council_committee (id) ON DELETE RESTRICT,
  PRIMARY KEY (council_business, committee)
);

CREATE INDEX council_business_committee_by_committee
  ON hall.council_business_committee (committee, council_business);
```

La clé primaire empêche les doublons et sert la lecture par affaire. L’index sert la lecture inverse par commission. Retirer un rattachement supprimerait seulement sa ligne.

## Contrats existants à respecter pendant l’implémentation

- L’archivage d’une commission est une mise à jour de `archived_at` : les liens existants restent visibles. Les commandes actuelles refusent la modification d’une commission archivée ; la nouvelle association doit suivre cette convention et refuser les nouvelles liaisons vers une commission archivée.
- `docs/application-autonome-bundles-cadrage.md` et `hall_api.delete_council_business` imposent une dissociation explicite des dépendances avant suppression d’une affaire. Les deux clés étrangères utilisent donc `ON DELETE RESTRICT` ; la suppression de l’affaire est refusée tant qu’un lien à une commission existe.
- Les commandes d’association et de retrait devront passer par `hall_api` avec autorisation explicite. Aucun droit direct sur cette table n’est proposé.

Cette revue ne prouve aucune migration, aucun test SQL ni aucun comportement d’interface.
