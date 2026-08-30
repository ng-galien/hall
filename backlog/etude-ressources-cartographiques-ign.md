# Étude des ressources géographiques IGN

Conclusion : la carte est une `GeographicResource` durable et structurée dans l’arbre. Le PNG n’est qu’une représentation dérivée et figée destinée à l’aperçu, à l’éditeur ou au PDF.

### Recommandation

1. Créer une ressource géographique dans un dossier de l’espace de travail.
2. L’ouvrir dans une vue basée sur **OpenLayers core** affichant les couches IGN autorisées depuis le WMTS public Géoplateforme.
3. Conserver durablement son cadrage, son zoom, l’ordre, la visibilité et l’opacité de ses couches, ainsi que sa provenance.
4. Conserver `hallLayer` comme une `FeatureCollection` GeoJSON RFC 7946 en WGS84 contenant des repères, lignes et zones simples.
5. Permettre de modifier cette même ressource sans créer une nouvelle identité par défaut.
6. Traiter ultérieurement la production d’une image par **WMS GetMap** pour l’aperçu, l’éditeur ou le PDF.

C’est adapté à Hall : son Chromium PDF désactive JavaScript et bloque toutes les URL autres que `about:` et `data:` dans [documentRenderer.ts](/Users/user/dev/projects/mairie/packages/server/src/services/documentRenderer.ts:17). Une carte distante ou interactive ne peut donc pas constituer le rendu imprimable.

### Point backend nécessaire

Oui, il faut une opération propre à la cartographie en plus de l’upload générique d’images :

`GeographicResource -> vue durable + couches IGN + couche Hall GeoJSON`

Entrée minimale :

- fournisseur IGN et couches prises dans l’allowlist Hall : `GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2`, `ORTHOIMAGERY.ORTHOPHOTOS` et `CADASTRALPARCELS.PARCELLAIRE_EXPRESS`, sans URL libre ;
- ordre, visibilité et opacité bornée de chaque couche, avec au moins une couche visible ;
- emprise canonique, de préférence en WGS84, et niveau de zoom servant à réouvrir le sélecteur ;
- `hallLayer` strictement conforme à une `FeatureCollection` GeoJSON RFC 7946 en WGS84, limitée à `Point`, `LineString` ou `Polygon` ;
- identifiant UUID stable, ordre et propriétés Hall de style bornées pour chaque feature.

État durable à conserver avec la ressource :

- couches techniques autorisées avec leur ordre, visibilité et opacité ;
- date de révision obtenue dans la métadonnée CSW ;
- attribution, licence et URL de métadonnée ;
- paramètres de cadrage, sans URL libre ni clé ;
- `hallLayer` ordonnée avec identifiants stables ;
- dates de création et de modification de la ressource.

Le modèle actuel de [DocumentResource](/Users/user/dev/projects/mairie/packages/domain/src/model.ts:164) ne représente pas cette identité. Il faut un nouveau type `GeographicResource`. Une représentation PNG pourra être produite plus tard par une action explicite de l’utilisateur ou à la sortie de page, jamais à chaque modification. Chaque PNG dérivé conserve son instant de génération, son attribution et son empreinte, sans devenir la source de vérité de la carte.

La future représentation destinée au PDF devra être résolue en `data:` avant `page.setContent`, conformément au filtre actuel de [@hall/templating](/Users/user/dev/projects/mairie/packages/templating/src/document.ts:28).

### Comparaison

| Solution | Évaluation |
|---|---|
| OpenLayers core + services IGN | **Meilleur choix.** BSD-2, actif, support natif WMS/WMTS/GeoJSON et export canvas. C’est aussi la bibliothèque retenue par la nouvelle extension officielle IGN. |
| Nouvelle extension IGN OpenLayers | Maintenue, mais encore `1.0.0-beta.13`, AGPL-3.0 et beaucoup trop large pour un simple cadrage. À réserver à de futurs widgets IGN complexes après revue de licence. |
| SDK Géoportail 2D | CeCILL-B, simple d’apparence mais gros et construit sur l’ancien ensemble d’extensions désormais non maintenu. À écarter. |
| Leaflet core + IGN | Repli acceptable, BSD-2 et léger. Cependant l’extension IGN Leaflet a été abandonnée en janvier 2026 sans remplaçant ; il faudrait intégrer les flux directement. |
| iframe cartes.gouv.fr | Souverain mais mauvais contrat : `frame-src`, interface tierce, état par permalien, impression et hors-ligne non maîtrisés. |
| URL WMS directement dans le Markdown | À proscrire : image changeante, dépendance réseau à chaque lecture, PDF impossible et provenance fragile. |
| Capture canvas dans le navigateur | Repli technique possible grâce au CORS actuel de `data.geopf.fr`, mais moins déterministe : attente des tuiles, densité écran, attribution et canvas potentiellement contaminé. |
| Cache local de tuiles | Hors périmètre : volume, mises à jour et licences. Ne conserver que les snapshots produits. |

L’ancien dépôt officiel d’extensions annonce explicitement son abandon et son remplacement par l’extension OpenLayers : [IGNF/geoportal-extensions](https://github.com/IGNF/geoportal-extensions). La nouvelle extension est décrite dans [IGNF/geopf-extensions-openlayers](https://github.com/IGNF/geopf-extensions-openlayers). OpenLayers est sous [BSD-2-Clause](https://github.com/openlayers/openlayers/blob/main/LICENSE.md).

### IGN : accès, quotas et licence

- Le WMTS public sert rapidement les tuiles et n’est actuellement pas soumis au rate limiting : [documentation WMTS](https://cartes.gouv.fr/aide/fr/guides-utilisateur/utiliser-les-services-de-la-geoplateforme/diffusion/wmts/).
- WMS GetMap accepte directement couche, emprise, projection et dimensions ; limite de **40 requêtes/s/IP** : [documentation WMS-Raster](https://cartes.gouv.fr/aide/fr/guides-utilisateur/utiliser-les-services-de-la-geoplateforme/diffusion/wms-raster/).
- Le géocodage IGN, facultatif pour rechercher une adresse, est limité à **50 requêtes/s/IP** : [documentation géocodage](https://cartes.gouv.fr/aide/fr/guides-utilisateur/utiliser-les-services-de-la-geoplateforme/geocodage/).
- Plan IGN V2 est accessible publiquement sans clé. Sa métadonnée officielle indique la **Licence Ouverte 2.0** ; celle-ci impose notamment la mention de la source et de sa date de mise à jour : [texte de la licence](https://www.data.gouv.fr/pages/legal/licences/etalab-2.0).
- Les SCAN 25/100 ne doivent pas être proposés par défaut : clé spécifique, SIRET et conditions particulières, notamment pour la reproduction imprimée ou téléchargeable : [conditions des services SCAN](https://geoservices.ign.fr/services-web-issus-des-scans-ign).

Une requête réelle WMS Plan IGN V2 a été vérifiée : elle renvoie actuellement un PNG 800 × 600 sans clé. Les réponses WMTS exposent aussi `Access-Control-Allow-Origin: *`.

### CSP, réseau et sécurité

Pendant le seul dialogue de cadrage :

- scripts et CSS OpenLayers servis localement ;
- `img-src` et éventuellement `connect-src` limités à `https://data.geopf.fr` ;
- aucune iframe ni CDN ;
- `blob:` seulement si une prévisualisation locale l’exige.

La vue interactive de la ressource contacte l’IGN. Les représentations déjà insérées, la lecture documentaire et le PDF ne contactent plus l’IGN.

Si le réseau est indisponible, la ressource reste classée et ses dernières représentations dérivées restent visibles et imprimables. La création ou le recadrage affiche une erreur avec réessai et ne remplace jamais le dernier état valide. La solution de repli fonctionnel est l’insertion d’un plan déjà disponible comme image locale.

Le backend doit impérativement interdire toute URL, couche ou CRS arbitraire : fournisseur et couches en allowlist, emprise et taille bornées, géométrie validée. Cela évite SSRF, images excessives et fuite future de clés privées. Utiliser `EPSG:3857` pour la requête WMS évite aussi les ambiguïtés d’ordre des axes de WMS 1.3.

## État livré au 30 août 2026

La ressource durable, son cadrage et son zoom propres, les couches IGN autorisées, leur ordre, visibilité et opacité, ainsi que la couche Hall GeoJSON sont implémentés. La vue permet le zoom et le déplacement à la souris, la composition de points, lignes et zones, leur renommage, leur couleur, leur visibilité et le recentrage sur la composition.

Restent au backlog la génération explicite d’un PNG figé et son insertion dans l’éditeur ou le PDF.
