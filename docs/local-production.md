# Production locale Alésia

La production utilise PostgreSQL local, une base dédiée `hall_private_prod` et
un serveur HTTP sur `http://localhost:3200/app/`. Le runtime de développement
reste indépendant. Aucun lancement ne charge le seed et aucune commande ne
réinitialise la production.

La configuration privée est `local-imports/production/private/config.json` :
`databaseUrl`, `port` (3200 par défaut), `backupDirectory` (facultatif).
Elle reste exclue de Git, comme les versions compilées et les sauvegardes.

```sh
npm run prod:prepare
npm run prod:start
```

La préparation compile l'application et copie ses fichiers et dépendances dans
une version séparée. Les modifications ultérieures du développement ne changent
pas cette copie. Le lancement vérifie Chromium et le rendu PDF, puis sert le
client compilé et l'API depuis le même processus, en mode production, sans
connexion automatique de développement. Laisser le terminal ouvert ; Ctrl+C
arrête le serveur proprement. Sous macOS, lancer hors sandbox d'agent.

La préparation d'une nouvelle version est explicite ; ne pas la relancer pendant
le gel de production. Le seed et la mise en service attendent le go du propriétaire.
La connexion réelle nécessite un compte administrateur ; aucun identifiant de
développement n'est utilisé pour contourner cette authentification.

## Mise à niveau du schéma

Au démarrage d'une nouvelle version, Hall compare l'empreinte du manifeste avec
la base installée. Si elles diffèrent, il réinitialise une base auxiliaire
réutilisable nommée d'après la base installée avec le suffixe
`__hall_schema_target`, y exécute le manifeste livré, puis relit les deux bases
avec PostgreSQL Workbench. Code Moniker contrôle que les fichiers SQL et la
cible matérialisée décrivent la même structure.

Hall produit ensuite le DDL entre la base installée et la cible. Il l'applique
dans une transaction protégée par un verrou, relit la base et exige un dernier
diff vide avant d'enregistrer la nouvelle empreinte. Les données métier ne sont
pas copiées dans la base auxiliaire. Celle-ci reste sur l'instance pour la mise à
niveau suivante ; elle ne contient que le schéma cible.

L'utilisateur PostgreSQL d'installation doit pouvoir créer cette base
auxiliaire et gérer les rôles Hall. Les anciennes fonctions, vues, triggers et
index sont supprimés sans `CASCADE`. Une table, une colonne ou un type absent de
la cible bloque la mise à niveau au lieu d'être supprimé. Un renommage de colonne
se déclare sur la colonne cible :

```sql
COMMENT ON COLUMN hall.contact.contact_id
  IS '@hall renamed-from council_member_id';
```

Les rôles sont réconciliés avant le DDL. Les révocations et droits d'exécution
du fichier `sql/900-grants.sql` sont rejoués après convergence.

## Sauvegardes

```sh
npm run prod:backup
npm run prod:verify-backup
```

Le dump PostgreSQL inclut données, modèles et contenu binaire des documents.
Chaque sauvegarde terminée possède une empreinte SHA-256 et la référence de
la version compilée. Un fichier `.partial` n'est pas une sauvegarde terminée.
Le contrôle restaure le dump dans une base temporaire distincte, puis supprime
uniquement cette base de contrôle. Il ne restaure jamais par-dessus la production.

Ce dump logique complète l'archivage WAL de PostgreSQL ; il ne le remplace pas.
L'archivage WAL et les sauvegardes physiques pgBackRest sont gérés au niveau de
l'instance PostgreSQL, avec sa configuration existante. Une restauration à un
instant donné doit se faire sur une instance isolée avant toute bascule.
Les copies sur le même disque ne protègent pas contre sa perte ; l'emplacement
d'une copie extérieure reste à définir avant de compter sur cette protection.
