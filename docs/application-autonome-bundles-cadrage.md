# Application autonome et échanges de bundles d’affaires

## Décisions retenues

the user retient PGlite pour le desktop autonome Windows et macOS : les
opérations attendent leur tour, ce qui convient à cet usage individuel local.
Le mode connecté continue à utiliser le serveur Hall. Voir le [guide desktop](desktop.md).

Les bundles servent exceptionnellement aux collègues travaillant hors ligne
pour transmettre une affaire complète au serveur. Les décisions finales
remplacent les anciens scénarios de synchronisation et de résolution de conflits :

- Export et import **par affaire**, avec rapport, dossiers, ressources et pièces.
- L’identité existante de l’affaire est conservée. Une affaire déjà présente
  provoque un refus d’import, même si son contenu ou son classement a changé.
- Aucune suppression ni mise à jour automatique au réimport. La suppression
  individuelle est une action distincte, possible partout si aucun lien ne
  bloque. Une nouvelle importation est possible après cette suppression.
- Aucun suivi source/destination persistant, aucune fusion ni synchronisation.
- Classement initial dans `Imports/<nom-prenom>` du conseiller **expéditeur**.
  Les éléments peuvent ensuite être reclassés dans le workspace.
- Le répertoire d’import est transitoire. Le vider ne doit pas supprimer les
  éléments déjà déplacés ailleurs.

## Transfert implémenté

Le [contrat du manifeste](../packages/api-contract/src/councilBusinessBundle.ts)
valide une archive `.hallbundle` (JSON compressé gzip), versionnée et contrôlée
par SHA-256. Ces empreintes contrôlent l’intégrité ; elles n’authentifient pas
l’expéditeur, dont le nom et le prénom accompagnent l’export.

L’export inclut le dossier de l’affaire, son rapport, les ressources descendantes,
les ressources explicitement associées et les images incorporées appartenant
aux textes inclus. Les documents conservent leurs octets originaux. Les liens
vers des ressources extérieures au lot sont signalés dans le manifeste ; aucun
contenu distant n’est téléchargé implicitement. Les séances et scrutins ne
font pas partie de cet échange documentaire.

L’import est une commande transactionnelle de l’autorité PostgreSQL. Il
réutilise les créations documentaires existantes, attribue de nouvelles identités
aux ressources et remappe les liens internes des textes et images. L’UUID de
l’affaire sert de garde contre les doublons ; aucune table de suivi n’est ajoutée.
Une erreur annule tout le lot. Les entrées binaires sont adressées par empreinte
et ne sont jamais interprétées comme des chemins d’extraction sur disque.

Les limites techniques sont de 64 Mio d’archive et de fichiers binaires,
128 Mio après décompression, 2 000 ressources et 4 000 fichiers.

- `GET /api/council-business/:id/bundle?firstName=…&lastName=…`
- `POST /api/council-business/import-bundle`, multipart, champ `file`

Les actions sont déclarées dans Siren et soumises aux permissions workspace
lecture pour l’export et écriture pour l’import. L’interface doit composer les
primitives existantes, conformément à la [carte d’architecture](architecture.md).

## Suppression individuelle et vérification

Le test [aller-retour isolé](../packages/server/src/__tests__/councilBusinessBundleImport.test.ts)
utilise deux installations PGlite temporaires et leur API HTTP authentifiée :
rapport, sous-dossier, texte, document original, image incorporée, liens internes,
refus du doublon et annulation d’un import partiellement invalide.
Les [tests d’archive](../packages/server/src/__tests__/councilBusinessBundleArchive.test.ts)
couvrent notamment les empreintes, entrées invalides, identités répétées et
associations manquantes. Aucun test ne remplace ou ne réinitialise la base réelle.

La commande `DELETE /api/council-business/:id` supprime une affaire sans
restriction de chemin. Elle refuse les associations documentaires existantes
et respecte toutes les contraintes de dépendance : projet de délibération,
ordre du jour, ressources partagées ou contenu restant dans le dossier.
Elle retire seulement l’affaire, son rapport obligatoire et son dossier
technique. Elle ne supprime pas les autres documents et n’utilise aucune
cascade supplémentaire. Un refus annule toute la transaction et renvoie
`council_business_has_dependencies` (HTTP 409).

Le test vérifie les refus, la conservation des pièces déplacées après leur
dissociation explicite, la suppression d’une affaire vide hors Imports et
la possibilité de réimporter après suppression. Le vidage collectif du
répertoire Imports reste distinct de cette commande individuelle.
