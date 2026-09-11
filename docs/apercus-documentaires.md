# Aperçus documentaires

Hall conserve les fichiers importés. Le téléchargement restitue leur contenu original ; l’aperçu est une représentation de lecture, sans modification du document stocké.

| Format | Lecture dans Hall |
| --- | --- |
| PDF, JPEG, PNG | Affichage natif |
| TXT | Texte brut, sans conversion PDF |
| DOCX | Conversion locale en Markdown, affichée avec le lecteur Markdown partagé |
| ODT, PPTX | Téléchargement du fichier ; aucun aperçu |
| XLSX, CSV | Import tableur dédié |

Le DOCX passe par [Mammoth](https://github.com/mwilliamson/mammoth.js) pour extraire le contenu structuré, puis [Turndown](https://github.com/mixmark-io/turndown) pour obtenir le Markdown. La lecture privilégie titres, paragraphes, listes et tableaux ; elle ne reproduit pas la pagination Word. Les images raster incorporées sont prises en charge dans le lecteur. Les tableaux peuvent conserver une représentation HTML au sein du Markdown pour préserver leur structure.

La conversion ne nécessite ni Gotenberg, ni LibreOffice, ni serveur bureautique. Les aperçus sont calculés à la lecture ; aucun changement de schéma ni migration des documents existants n’est nécessaire.

La génération des convocations, procès-verbaux et autres PDF de Hall reste assurée par son moteur de rendu Chromium. Elle est indépendante de la lecture des documents importés.

Les anciens DOC ne sont pas ajoutés à l’import direct. Pour le seed Alésia, les cinq fichiers concernés ont été convertis séparément en DOCX ; leurs originaux et la traçabilité des conversions restent dans le corpus privé.
