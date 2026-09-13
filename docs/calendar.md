# Calendrier et rendez-vous

La vue `/app/calendar` réunit les rendez-vous documentaires et les séances du
conseil. Elle emploie FullCalendar Standard (MIT), en vues mois, semaine et jour.
Les séances conservent leur modèle et leur fiche : le calendrier les affiche à
leur date prévue et ouvre leur fiche dans une modale sans quitter le calendrier.
Il ne modifie pas leur cycle de préparation. Les séances sans date apparaissent
sous la grille et ouvrent la même modale.

Un rendez-vous est une ressource `event` classée dans un dossier, avec un nom,
un texte, un lieu, un intervalle et des participants. Les participants désignent
soit un contact existant, soit un nom saisi librement. Le contrat partagé est
`packages/contracts/src/calendarEvent.ts`. Une référence technique de contact
maintenue transactionnellement garantit l'intégrité avec l'annuaire.

Les intervalles horaires conservent des instants avec décalage horaire ; les
journées entières conservent des dates civiles. La fin est exclusive dans le
contrat, comme dans FullCalendar. L'interface présente une date de fin incluse
pour les journées entières. Les heures sont présentées dans le fuseau local du
navigateur.

La sélection d'une plage ouvre la création d'un rendez-vous. Le déplacement et
le redimensionnement utilisent la mutation documentaire versionnée et reviennent
à la position précédente en cas d'échec. Un clic ouvre la ressource dans une
modale en préservant le calendrier, où sa fiche suit l'autosauvegarde commune. Les capacités Siren
déterminent les écritures disponibles ; le MCP réutilise les mêmes commandes et
schémas. Un rendez-vous n'est pas automatiquement inscrit à l'ordre du jour.

Référence bibliothèque : [intégration React de FullCalendar](https://fullcalendar.io/docs/react).
