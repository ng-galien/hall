# Hall — Démarrage de la coordination

Brouillon de prise de rôle : le coordinateur est l’interface entre the user et
les agents. Il recueille fidèlement ses propos, conserve les inconnues, pose les
questions utiles au premier cadrage, contrôle les délégations et rapporte des
faits vérifiés. Une hypothèse d’agent ne devient pas une décision du propriétaire.

## Treize petits Checks, dans cet ordre

1. Charger les consignes Hall.
2. Relever la version déclarée dans package.json, sans montée de version.
3. Observer la baseline Git : index, fichiers suivis et non suivis non ignorés.
   Un état sale ne passe pas : présenter les changements en attente et demander
   à the user ce qu’on fait. Aucune poursuite dépendante avant résolution ;
   aucun commit, stash, suppression ou nettoyage automatique, aucune exception
   pour les brouillons ou les fichiers d’agent.
4. Charger le backlog.
5. Charger catalogue et convention de traçabilité.
6. Charger architecture et principes de code.
7. Charger principes IHM.
8. Charger l’expérience TRUST/Maket, dont l’exemple des commissions et le
   HANDOFF qui conserve la proposition et le refus des vues.
9. Identifier ensemble session partagée, processus API, checkout, connexion
   PostgreSQL de développement et base hall. Alésia et production sont exclus.
10. Observer la disponibilité réelle avec npm run dev:status, après réidentification.
11. Charger la transcription sourcée et le premier cadrage : décisions, propositions
    séparées, inconnues et quatre grands domaines avec conséquences.
12. Créer le support Maket, l’alimenter par Operation puis relire les valeurs
    et la révision enregistrées. Afficher le sélecteur humain en attente.
13. Lire le choix du propriétaire sur le cadrage inchangé. Seul oui, avec la cible
    de développement toujours identifiée et prête, produit le feu vert de passage.

[Procedure canonique](bootstrap.procedure.feature), avec @intent-chaining.
Lire l’intention courante avant chaque Check, la fournir exactement au Runner
Hall et déclarer la suivante tant qu’il reste du travail.

## Sources et exécution prévue

Les sept lectures utilisent une [Operation commune](sources-read.operation.feature).
Elles chargent du contexte ; elles ne prouvent pas sa compréhension.
Les autres points utilisent l’[Operation bornée](coordination.operation.feature)
et [son script](coordinate.mjs). Les modes sont distincts, les Checks aussi.

Le script d’identité ne lit ni environnement de processus, ni configuration
privée, ni contenu métier. Il corrèle le PID de l’API avec le tmux partagé,
son checkout, son socket vers 127.0.0.1:54329 et les métadonnées
pg_stat_activity de la base hall du service Docker postgres. Une identité
inconnue, un autre runtime ou une corrélation impossible refuse le passage.
Le socket peut ne pas être corrélable selon la traduction réseau Docker :
cela reste un refus, jamais une identité supposée. Le contrôle est limité au
runtime partagé macOS décrit ici. Il ne certifie pas tous les services externes
ou Chromium. npm run dev:session reste la commande de session connue ; ce
bootstrap ne la lance pas, car elle peut démarrer ou remplacer une session.
Si la cible n’est pas prête, le coordinateur rapporte le blocage sans agir sur
le runtime. HTTP seul ne permet pas d’identifier la base.

Le fichier de discussion est une déclaration de contexte autorisée à l’agent,
renseignée après les lectures. Aucun document préexistant ni reçu ancien requis.
Format JSON minimal :
- documentName : nom unique du support de ce cadrage ;
- request et initialScope : objets text/sourceRef, fidèles à la discussion ;
- decisions : liste text/sourceRef/author, author valant the user ;
- proposals : liste text/sourceRef, séparée des décisions ;
- unknowns : liste des inconnues conservées ;
- domains : ui, sirenRights, postgresql, schemaChange ; chacun porte assessment
  (concerned, uncertain ou outside) et consequences, même si celles-ci sont
  encore à préciser. Aucun domaine incertain n’est forcé à être résolu.

Les références et auteurs viennent du contexte discuté : leur présence ne
prouve pas automatiquement la fidélité de la transcription. Le coordinateur
doit les relire et questionner the user. Le document présente demande,
premier périmètre, décisions, propositions, inconnues et conséquences.
Son [template](framing.html) rappelle qu’un go initial n’approuve aucun modèle
encore indéfini ni migration. Le Check contrôle la présence structurelle,
l’égalité après relecture et la mise en page ; la décision humaine porte sur
la suffisance de ce premier cadrage, pas une définition exhaustive de feature.

L’Operation ne peut écrire que pending comme nouvelle décision. Elle conserve
un choix existant pour un cadrage identique et le remet en attente si le
cadrage change. Le gate relit le choix avec l’empreinte et les données exactes
présentées ; pending, non ou cadrage modifié ne donnent pas de feu vert.
Le contrôle humain repose sur le sélecteur Maket et l’interdiction explicite
faite à l’agent d’écrire oui/non ; Maket ne fournit pas ici d’attestation
indépendante de l’identité de l’auteur du clic. Aucun fait humain n’est inventé.

## Limites de la rédaction

Le résultat retourné est une autorisation bornée de démarrer une procédure
de feature après la revue. Le bootstrap n’engage aucune feature, ne définit
aucun enfant et ne réalise aucune fonctionnalité. Les autorisations précises
de modèle, migration, implémentation et publication restent distinctes.

[Compilation réelle](compilation.json) contre les deux Operations brouillon,
avec les compilateurs canoniques locaux, sans publication au catalogue.
Les sources des Operations sont aussi compilées via MCP. Syntaxe du script,
liens et diff relus. Les chemins runtime, projection et décision ne sont pas
exécutés pendant cette rédaction : disponibilité actuelle, rendu sur un vrai
cadrage et saisie humaine ne sont pas déclarés vérifiés.
Aucun nouveau Plan, aucune publication, aucune mutation Maket ou métier.
Le Plan commune terminé reste inchangé.
