# Rendez-vous : mécanique de saisie et couverture Playwright

Audit et vérification du 12 septembre 2026, sur serveurs et PostgreSQL de test isolés.

## Défaut et décision

La saisie d'un début postérieur à la fin conservait auparavant cette fin. Le contrat
partagé refusait alors l'intervalle et le bouton de création restait désactivé ;
aucune requête n'était émise. Une fois les deux bornes valides, la création,
l'édition et la réouverture ont été reproduites avec succès avant correction.
Le défaut de disparition historique n'est donc pas établi comme une perte en base.

Décision explicite du propriétaire : lorsqu'un changement du début horaire rend la fin
invalide (fin inférieure ou égale au début), recaler la fin à une heure après le
début, plafonnée au prochain minuit local. Une fin déjà valide est conservée.
Les règles des événements sur toute la journée ne changent pas.

La correction est dans [EventFields](../packages/client/src/features/calendar/EventFields.tsx),
partagé par la création et l'édition. Elle ne modifie aucun contrat ni invariant de
base. Le contrat conserve une fin strictement postérieure au début.

## Matrice des modalités existantes

Tests dans [calendar.spec.ts](../packages/client/e2e/specs/calendar.spec.ts).

| Modalité | Couverture et résultat |
| --- | --- |
| Création par le bouton du calendrier | Création toute journée et horaire, HTTP 201, présence après rechargement : réussis |
| Titre requis et affaire du conseil facultative | Bouton désactivé sans titre ; création dans l'affaire choisie, changement d'affaire, fermeture, rechargement et réouverture : réussis |
| Dates toute journée et plusieurs jours | 17–18 septembre affichés ; fin exclusive du 19 persistée et réouverture : réussi |
| Passage toute journée → horaire | Initialisation 09 h–10 h ; modification au 17 septembre 19 h 30, recalage à 20 h 30 : réussi |
| Début après fin, création et édition | 19 h 30, 22 h 30, 23 h, 23 h 30 ; fins attendues 20 h 30, 23 h 30, minuit, minuit ; réouverture : réussi |
| Début modifié avec fin déjà valide | Fin explicitement conservée : réussi |
| Saisie native segmentée du début | Flèches clavier sur le segment heure 09 h → 12 h, focus sur Lieu, fin recalée à 13 h, création et réouverture : réussi |
| Édition directe de la fin | Modification, API, fermeture immédiate et réouverture : réussi |
| Passage horaire → toute journée | Retour au même jour, fin exclusive au lendemain : réussi |
| Lieu | Création, modification, API et réouverture : réussi |
| Contact participant | Recherche, sélection au clic et au clavier, suppression : réussi |
| Invité libre | Ajout, suppression, remplacement et persistance : réussi |
| Contexte textuel | Texte saisi, persisté, rouvert, modifié et enregistré : réussi |
| Autosave | Attente du stockage et fermeture avant debounce avec sauvegarde en attente : réussi |
| Enregistrement manuel | Désactivation autosave, enregistrement explicite, réactivation : réussi |
| Échec réseau en édition | Erreur visible, saisie conservée, base inchangée, réessai réussi : réussi |
| Annulation création | Bouton Annuler, croix et Échap ; aucune création envoyée, route calendrier conservée : réussi |
| Ouverture/fermeture de la ressource | Route calendrier conservée et contenu enregistré : réussi |
| Déplacement et redimensionnement toute journée | Contrôle API dans le parcours existant : réussi |
| Vues mois, semaine, jour et ouverture d'une séance | Parcours existant : réussi |
| Séances dans le calendrier | Titre court sans date répétée, menu contextuel limité à « Ouvrir », ouverture de la page de séance : réussis |
| Rendez-vous simultanés | Deux événements sur le même créneau restent distincts en vue semaine : réussi |
| Suppression d'un rendez-vous futur | Menu contextuel, deux confirmations, une seule requête de suppression : réussi |
| Quarts d'heure | Pas de 15 minutes exposé par les champs ; saisie hors pas refusée, saisie corrigée acceptée : réussi |
| Groupe des membres du conseil | Ajout de tous les membres actifs sans doublon : réussi |
| Destinataires incomplets | Un participant sans courriel est signalé avant la génération : réussi |
| Invitations | Brouillons EML de demande et d'annulation téléchargés ; même UID, organisateur, participants, horaires et contexte iCalendar : réussis |
| Création par sélection directe d'une plage dans la grille | Plage toute journée et plage horaire 10 h–11 h, création et persistance : réussi |
| Déplacement/redimensionnement d'un événement horaire dans la grille | Déplacement de 1 h, agrandissement de 30 min, API et réouverture : réussi |
| Tous les outils de l'éditeur riche intégré | Hors de cette matrice rendez-vous ; seul le contexte textuel est exercé ici |

La matrice couvre les modalités recensées du formulaire de rendez-vous et ses
interactions de calendrier. Elle ne revendique pas une couverture de toutes les
commandes de l'éditeur riche, qui est un composant partagé distinct. Aucun
comportement n'a été inventé pour compléter les tests.

## Exécutions

- Suite Playwright calendrier complète : 11 tests réussis sur 11, seed PostgreSQL
  isolé compris, avec trois workers.
- Parcours complet de formulaire isolé : 2 tests réussis sur 2, seed compris.
- Tests serveur ciblés sur l'invitation et les capacités HTTP : 98 tests réussis.
- Test pgTAP ciblé de la projection Siren documentaire : 72 assertions réussies.
- Typecheck client et contrôle de structure des exigences : réussis.

Le bandeau d'erreur est visible après l'échec réseau simulé, la saisie reste dans
le formulaire et le réessai l'enregistre. La fermeture attend aussi la mutation
de rattachement à l'affaire avant de rendre la main.
