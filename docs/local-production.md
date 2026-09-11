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
