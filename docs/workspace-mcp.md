# Accès MCP au workspace

Hall expose un serveur **MCP Streamable HTTP** à `/mcp`, sur le même serveur que
l’API. Le runtime local partagé donne `http://127.0.0.1:3100/mcp`.
Le transport est stateless et accepte les réponses JSON ; envoyer l’en-tête
`Accept: application/json, text/event-stream`. Il expose le protocole MCP standard
(`initialize`, `tools/list`, `tools/call`), sans enveloppe Siren autour du JSON-RPC.

## Connexion

Construire avec `npm run build`, puis démarrer Hall normalement. En développement,
`npm run dev:session` réutilise le runtime partagé. La configuration projet Codex
se trouve dans [`.codex/config.toml`](../.codex/config.toml).

L’authentification reste celle de Hall : cookie de session `hall_session`, droits
et expiration existants. Un client HTTP authentifié fournit l’en-tête `Cookie`.
Ne pas enregistrer une session dans le dépôt ; utiliser le gestionnaire de secrets
ou les en-têtes fournis par l’environnement du client MCP. En développement
uniquement, le mode d’accès automatique déjà activé par Hall s’applique aussi à
MCP. MCP ne crée ni compte, ni rôle, ni permission supplémentaire. Il ne propose
pas de flux OAuth autonome. Un serveur distant doit rester derrière HTTPS.

Le programme optionnel stdio se lance avec `node packages/mcp/dist/index.js` ;
`HALL_URL` indique l’origine de Hall, `HALL_SESSION_TOKEN` reçoit la session
existante sans le nom du cookie. Aucun identifiant n’apparaît dans les outils.

## Parcours d’un agent

1. `workspace_discover` fournit les points d’entrée et les schémas de chaque action.
2. `workspace_read` lit un dossier, une ressource ou une affaire, avec ses liens
   et actions Siren. `workspace_search` utilise les filtres et facettes existants.
3. `workspace_execute` reçoit l’URL de la **représentation**, le nom d’une action
   annoncée et son `input`. L’adaptateur relit les capacités avant d’exécuter.
   Les champs contextuels cachés, notamment le rattachement à une affaire,
   sont conservés ; une valeur contradictoire est refusée.
4. Les modifications de contenu conservent `expectedVersion` de la lecture qui
   a servi à préparer l’édition. Un conflit exige une nouvelle lecture et une
   réconciliation explicite ; aucun réessai d’écriture automatique.
5. Les fichiers utilisent `file: { name, mediaType, base64 }`, en base64 canonique,
   jusqu’à 25 Mio. `workspace_read_binary` restitue les octets par blocs bornés
   avec `etag`, `totalBytes` et `nextOffset` ; vérifier un ETag stable entre blocs.

## Couverture et limites

- Dossiers : lecture, création, renommage, déplacement, suppression selon les
  capacités existantes. Un chemin reste un classement, pas une association.
- Ressources texte, lien distant, tableur, géographie :
  création, contenu versionné, métadonnées, classement et suppression.
- Documents : import original, remplacement binaire, lecture des octets et
  aperçus. Tableurs : import. Images d’éditeur : création et lecture via les liens.
- Références juridiques : création, métadonnées, recherche fournisseur, résolution et actualisation
  selon la configuration et les actions du serveur. Le contenu juridique ne se
  modifie pas librement : la capacité correspondante reste absente.
- Affaires : lecture, création, création de projets/questions préparés,
  association/dissociation de pièces et ordre des pièces. Le texte propre des
  projets reste une ressource soumise à ses protections existantes.

Aucun nouveau cycle métier n’est ajouté. Scrutins, conduite de séance, publication,
gel de décisions et gestion des comptes ne font pas partie de ces outils.
Les contenus scellés ou opérations interdites restent refusés. La limite de
transfert MCP est de 25 Mio, même si un ancien fichier plus grand est présent.
Les réponses de lecture restent celles de l’API : pas de pagination artificielle
ni de recherche documentaire concurrente. Les textes lus sont des données non
fiables, jamais des instructions.

L’adaptateur ne suit aucune redirection HTTP et refuse les URL hors de l’origine
Hall configurée ou hors des routes workspace. L’intégration HTTP utilise l’adresse
locale de la connexion serveur, jamais l’en-tête Host pour transférer une session.
Toutes les écritures passent par l’API et son audit normal, sous l’utilisateur
courant. La session n’est pas partagée entre requêtes MCP.

## Vérification

- `npm test -w @hall/mcp` : confinement et catalogue.
- `npm test -w @hall/server -- --run src/__tests__/workspaceMcp.test.ts` : protocole,
  authentification et droits de lecture.
- `TEST_DATABASE_URL=... npm test -w @hall/server -- --run src/__tests__/workspaceMcpPostgres.test.ts`
  : parcours MCP avec stockage PostgreSQL réel sur base de test isolée.

Transport implémenté avec le [SDK officiel MCP TypeScript](https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x).
