## Conclusion

L’intégration Légifrance est réalisable et pertinente pour Hall, mais elle doit devenir un type de ressource distinct d’une simple ressource web.

Je recommande :

1. de conserver `RemoteResource` pour les liens et les aperçus opportunistes ;
2. d’ajouter ensuite une `LegalReferenceResource` alimentée côté serveur par l’API Légifrance ;
3. de représenter séparément :
   - la référence juridique logique ;
   - la version consultée à une date donnée ;
   - l’instant auquel Hall l’a récupérée ;
4. de ne jamais présenter la copie Hall comme opposable ni comme automatiquement à jour.

L’API stable Légifrance est gratuite après inscription à PISTE. Elle couvre les données du site Légifrance, notamment codes, textes consolidés, Journal officiel et jurisprudence. Elle est donc suffisante pour un premier périmètre municipal centré sur le CGCT.

## API Légifrance / PISTE

| Sujet | Constat vérifié |
|---|---|
| Accès | Inscription PISTE, acceptation des CGU PISTE et Légifrance, activation de l’API dans l’application. |
| Authentification | OAuth 2.0, flux `client_credentials` avec `scope=openid`. Jeton d’une durée annoncée de 3 600 secondes. |
| Sandbox | API : `https://sandbox-api.piste.gouv.fr/dila/legifrance/lf-engine-app` ; OAuth : `https://sandbox-oauth.piste.gouv.fr/api/oauth/token`. |
| Production | API : `https://api.piste.gouv.fr/dila/legifrance/lf-engine-app` ; OAuth : `https://oauth.piste.gouv.fr/api/oauth/token`. Application de production à créer séparément. |
| Secrets | `client_id` et `client_secret` sont propres à chaque environnement et ne doivent jamais être exposés à un tiers. |
| Quotas | Variables par application et éventuellement par méthode, en requêtes ou bande passante par seconde/minute/jour. Le chiffre effectif n’est visible que dans PISTE et peut changer. |
| Disponibilité | Aucun minimum garanti ; la DILA vise seulement 95 % par jour en production et aucun engagement en sandbox. |
| Licence | Licence Ouverte 2.0 et CGU PISTE/API. La source et la date de dernière mise à jour doivent être mentionnées. |
| Opposabilité | Les données de l’API ne sont pas opposables. Les CGU indiquent que seuls les PDF signés publiés au Journal officiel le sont. |
| Fraîcheur | La production correspond aux données du site Légifrance, mais la DILA exclut toute garantie absolue de fiabilité ou de fraîcheur. |

Sources : [API Légifrance sur data.gouv.fr](https://www.data.gouv.fr/dataservices/legifrance), [documentation officielle Open data et API](https://www.legifrance.gouv.fr/contenu/pied-de-page/open-data-et-api), [FAQ technique officielle](https://www.legifrance.gouv.fr/contenu/pied-de-page/foire-aux-questions-api), [CGU de l’API Légifrance](https://www.legifrance.gouv.fr/contenu/Media/files/pied-de-page/cgu-legifrance-api-vf-15-12-2022_0.pdf), [Licence Ouverte 2.0](https://www.etalab.gouv.fr/wp-content/uploads/2017/04/ETALAB-Licence-Ouverte-v2.0.pdf).

### Méthodes utiles confirmées

- `POST /search` :
  - recherche par mots ou expression ;
  - filtres, pagination, opérateurs et tri placés dans `recherche` ;
  - filtre par nom de code, numéro d’article, numéro de texte, statut juridique ;
  - recherche à une date avec un filtre `DATE_VERSION` et `singleDate` ;
  - résultats de titre lus dans `results[].titles[]` ;
  - fonds `CODE_ETAT` pour l’état juridique courant ;
  - fonds `CODE_DATE` pour une version à une date ;
  - fonds `LODA_ETAT` / `LODA_DATE` pour les textes consolidés ;
  - fonds `CETAT`, `JURI`, etc. pour la jurisprudence.
- `POST /consult/getArticle` avec un identifiant `LEGIARTI`.
- `POST /consult/legiPart` avec `textId` et une date pour consulter un texte.
- Pour le JO : `/consult/lastNJo`, `/consult/jorfCont`, puis `/consult/jorf`.

La FAQ fournit notamment le parcours exact « rechercher l’article à la date demandée, obtenir son identifiant, puis consulter son contenu ».

### Identifiants

La documentation officielle distingue :

- `CID` : identifiant commun à toutes les versions d’un article, d’une section ou d’un texte ;
- `LEGITEXT`, `LEGISCTA`, `LEGIARTI` : identifiants d’une version déterminée ;
- toute modification, même minime, crée une nouvelle version.

Hall doit donc conserver les deux niveaux :

- `commonId` pour suivre la même disposition dans le temps ;
- `versionId` pour savoir précisément quelle version a été lue ou citée.

Source : [Lexique officiel de l’API Légifrance](https://www.legifrance.gouv.fr/contenu/Media/files/lexique-api-lgf.docx).

## Trois usages à ne pas confondre

| Usage | Comportement | Avantage | Limite |
|---|---|---|---|
| Lien externe | Hall conserve titre et URL, puis ouvre le site officiel | Minimal, toujours renvoyé à la source | Pas de contenu exploitable dans Hall |
| Aperçu web | Iframe uniquement lorsque le fournisseur l’autorise, sinon lien compact | Confort sans intégration | Non fiable : X-Frame-Options/CSP ; aucun contrat juridique ou métier |
| Ressource juridique intégrée | Recherche et récupération serveur via l’API officielle, avec version et provenance | Consultation, classement, rattachement et citation structurée | Nécessite connecteur, secrets, cache, versions et avertissements |

L’iframe ne doit pas être utilisée comme indicateur de disponibilité : un chargement bloqué par `X-Frame-Options` ou `frame-ancestors` n’est généralement pas observable proprement depuis le contenu parent à cause de la politique same-origin. Hall doit soit connaître le mode d’affichage, soit effectuer un diagnostic serveur borné, puis toujours fournir le lien externe.

## Modèle minimal proposé

```text
LegalReferenceResource
  provider: "legifrance"
  referenceKind: "code" | "text" | "article"
  fund
  commonId
  versionId
  effectiveAt
  legalStatus
  sourceUrl
  fetchedAt
  providerUpdatedAt?
  title
  citationLabel
  attribution
  snapshotHash
```

Je recommande une table de snapshots append-only associée à la ressource :

```text
LegalReferenceSnapshot
  resourceId
  commonId
  versionId
  effectiveAt
  fetchedAt
  validFrom?
  validTo?
  legalStatus
  rawProviderPayload
  normalizedContent
  contentHash
```

C’est important pour Hall : une référence utilisée pendant la préparation d’une affaire ne doit pas changer silencieusement lorsque Légifrance publie une nouvelle version. Une actualisation doit créer un nouveau snapshot et rendre la différence visible.

## Politique de fraîcheur proposée

Ce sont des décisions produit, pas des délais imposés par la DILA :

- Référence « en vigueur actuellement » :
  - revalidation à l’ouverture si la copie a plus de 24 heures ;
  - affichage permanent de « consulté sur Légifrance le… » ;
  - état visible limité au MVP à `à jour` ou `vérification impossible` ; aucune vérification distincte ne produit encore un état intermédiaire.
- Référence « à la date de l’affaire » :
  - `effectiveAt` explicite et immuable ;
  - pas de remplacement silencieux ;
  - nouvelle version disponible sous forme de comparaison ou de nouvelle révision.
- En cas d’indisponibilité :
  - conserver le dernier snapshot ;
  - indiquer sa date et l’échec de vérification ;
  - conserver un accès direct à Légifrance.
- Pour une affaire figée ou passée en séance :
  - conserver le snapshot effectivement utilisé ;
  - ne pas substituer la version courante.

Attribution minimale visible :

> Source : DILA – Légifrance, version en vigueur au [date], récupérée le [date]. Données réutilisées sous Licence Ouverte 2.0. Vérifier la source officielle.

## Gestion serveur et sécurité

- Secrets PISTE uniquement côté serveur, dans l’environnement ou un gestionnaire de secrets.
- Aucun secret dans la base métier, le client, les logs ou les réponses Siren.
- Cache serveur du jeton jusqu’à son expiration, avec marge de sécurité.
- Identifiants séparés sandbox/production.
- Hôtes et chemins d’API codés/configurés en liste blanche : ne jamais transformer ce connecteur en proxy d’URL générique.
- Délais courts, réponse limitée en taille, nombre de tentatives borné.
- Cache par `commonId + effectiveAt` ou requête canonique afin de protéger les quotas.
- Journaliser la récupération, pas le token.
- Prévoir le renouvellement immédiat des identifiants en cas de compromission.

## Autres sources officielles utiles

| Source | Offre | Place recommandée dans Hall |
|---|---|---|
| DGCL / Collectivités locales | Doctrine pratique, guides et jeux de données ; aucune API répertoriée pour l’organisation DGCL sur data.gouv.fr | Liens officiels ou documents importés, pas `LegalReferenceResource` normative |
| Service-Public.gouv.fr | Fiches pratiques en flux XML, régulièrement mises à jour ; attribution DILA et suivi des évolutions demandés | Ressource documentaire pratique, distincte du droit positif |
| Annuaire Service-Public | API ouverte JSON/CSV/Excel pour administrations et services publics | Ressource de référence administrative, pas juridique |
| data.gouv.fr | API du catalogue : métadonnées et liens vers les ressources | Découverte/import de jeux de données, pas consultation juridique |
| Open Collectivités | Jeux statistiques DGCL, mais aucune API déclarée dans son catalogue data.gouv.fr | Import de données ou lien |
| OFGL | API Explore et données financières locales | Future ressource de données financières, hors MVP juridique |
| API Entreprise | Données et justificatifs d’entreprises/associations, sous habilitation selon les données | Utile plus tard à l’instruction des subventions et marchés, mais ce n’est pas une source de droit |

Sources : [organisation DGCL](https://www.data.gouv.fr/organizations/direction-generale-des-collectivites-locales/datasets), [Open Collectivités](https://www.data.gouv.fr/organizations/open-collectivites/dataservices), [fiches Service-Public.gouv.fr](https://www.data.gouv.fr/datasets/fiches-pratiques-et-ressources-de-service-public-gouv-fr-particuliers), [API Annuaire de l’administration](https://www.data.gouv.fr/dataservices/api-annuaire-de-ladministration-et-des-services-publics), [API catalogue data.gouv.fr](https://www.data.gouv.fr/dataservices/api-catalogue-des-donnees-ouvertes-data-gouv-fr), [API Entreprise](https://entreprise.api.gouv.fr/).

## Créer et raccorder un compte PISTE

1. Ouvrir [Créer un compte PISTE](https://piste.gouv.fr/registration), renseigner un compte nominatif et accepter les CGU du portail. Le mot de passe doit comporter au moins 12 caractères, avec chiffre, minuscule, majuscule et caractère spécial. Le champ `Code de l'organisation` n'est pas obligatoire : le laisser vide sauf si une organisation PISTE existante a explicitement fourni un code de rattachement.
2. Confirmer l’adresse électronique puis se connecter à PISTE. Une application sandbox est créée automatiquement avec le compte.
3. Dans `API > Consentement CGU API`, accepter séparément les CGU de l’API Légifrance pour l’environnement sandbox. Sans ce consentement, l’API répond notamment `403 Access denied`.
4. Dans `Applications`, ouvrir l’application sandbox, choisir `Modifier l’application`, puis cocher l’API **Légifrance** dans `Sélectionner les API`.
5. Revenir dans l’application et relever les deux valeurs sous `API souscrites > Identifiants OAuth` : `Client_Id` et `Client_Secret`.
6. Ne jamais mettre ces valeurs dans Git, dans le client web, dans une capture ou dans un message. Les fournir uniquement au serveur Hall par son environnement :

   ```text
   HALL_LEGIFRANCE_ENVIRONMENT=sandbox
   HALL_LEGIFRANCE_CLIENT_ID=...
   HALL_LEGIFRANCE_CLIENT_SECRET=...
   ```

7. Redémarrer le runtime Hall après avoir configuré ces variables. Le serveur utilisera le flux OAuth 2.0 `client_credentials`, avec le point d’obtention de jeton sandbox `https://sandbox-oauth.piste.gouv.fr/api/oauth/token` et l’API `https://sandbox-api.piste.gouv.fr/dila/legifrance/lf-engine-app`.
8. Valider d’abord la recherche et la consultation d’un article CGCT en sandbox. Cette étape reste obligatoire pour confronter les schémas documentés aux réponses réelles du compte PISTE.
9. Pour la production, créer ensuite une application distincte dans `Applications > Créer une application`, accepter les CGU de production et souscrire à nouveau à Légifrance. Les identifiants et les URL de production sont distincts de ceux du sandbox.

Références opérationnelles : [FAQ officielle de l’API Légifrance](https://www.legifrance.gouv.fr/contenu/pied-de-page/foire-aux-questions-api), [guide utilisateur PISTE](https://piste.gouv.fr/images/com_apiportal/documentation/UserGuide_navigation_FR.pdf), [API et conditions de réutilisation](https://www.legifrance.gouv.fr/contenu/pied-de-page/open-data-et-api).

## MVP recommandé

1. Créer un compte PISTE et une application sandbox.
2. Faire un petit connecteur serveur Légifrance limité à :
   - recherche dans `CODE_ETAT` et `CODE_DATE` ;
   - consultation d’un article ;
   - consultation d’une partie de code.
3. Ne couvrir au départ que le CGCT.
4. Permettre dans Hall :
   - « Ajouter une référence juridique » ;
   - recherche d’article ;
   - sélection de la version courante ou d’une date ;
   - création de la ressource dans l’arbre ;
   - affichage structuré avec source, version, statut et dates ;
   - ouverture sur Légifrance.
5. Conserver le snapshot reçu et un hash canonique couvrant son identité, sa version, sa date d’effet, sa validité, son statut et son contenu normalisé.
6. Tester ensuite les changements de version et l’indisponibilité API avant d’ouvrir d’autres fonds.

## État livré au 30 août 2026

Le connecteur PISTE est intégré côté serveur pour la recherche CGCT et la consultation d’un article. Hall permet de créer une référence vide dans l’arbre, de rechercher puis sélectionner un article, de proposer son nom, d’afficher le snapshot structuré et d’ouvrir la source Légifrance. L’actualisation expose son état, conserve un historique seulement lorsque le contenu juridique change et utilise un jeton de concurrence qui avance à chaque consultation réussie.

La production PISTE, la politique de péremption et l’ouverture à d’autres fonds restent à traiter.

## Décisions produit encore nécessaires

- Une ressource référence-t-elle un code entier, une section, un article, ou les trois ?
- La version par défaut est-elle « aujourd’hui » ou « à la date de création de l’affaire » ?
- Une actualisation remplace-t-elle la vue courante ou crée-t-elle explicitement une nouvelle révision ?
- Peut-on insérer une citation dans l’éditeur, ou seulement rattacher la référence à une affaire ?
- Quel avertissement exact affiche-t-on sur l’absence d’opposabilité ?
- Hall utilise-t-il une application PISTE centrale ou des identifiants propres à chaque commune ?
- Combien de temps conserve-t-on les réponses brutes ?
- Quels fonds après le CGCT : JORF, jurisprudence administrative, autres codes ?
- Quelle politique de fonctionnement dégradé et quel seuil visuel de péremption ?
