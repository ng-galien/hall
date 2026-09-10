# Alésia

Fiction alternative du siège de César sur le plateau de Cornu, près de
Chaux-des-Crotenay et Alésia. Les acteurs de la guerre des Gaules et Merlin l’Enchanteur portent
un conseil qui organise les réserves, les défenses, les abris et des pourparlers
avec César. Les événements et les décisions du scénario sont inventés.
La localisation archéologique reconnue du siège reste Alise-Sainte-Reine.

Les noms uniques sont placés dans `firstName`, leur désignation de peuple dans
`lastName` : « Vercingétorix l’Arverne ». Aucun champ ni invariant n’est modifié.
Les dates actuelles relatives et les procédures Hall restent celles du produit.
Les codes administratifs et adresses `alesia.example` sont des valeurs techniques.

## Repères de contenu

- 15 membres, Jules César et Titus Labienus comme contacts extérieurs.
- Rendez-vous à J+1 : pourparlers entre Vercingétorix et César.
- Grenier : 120 sacs ; projet de partage 80/40 soumis au vote.
- Défense : 96 poutres à 2 quinaires, 60 hottes de pierre à 1 quinaire,
  30 journées de transport à 1 quinaire ; total **282 quinaires**.
- Soutien : 24/16/9 journées et allocations de 48/32/18 quinaires ;
  total **49 journées et 98 quinaires**.
- Abris : 142 habitants, 20 places supplémentaires à étudier.

La monnaie retenue est le quinaire d’argent séquane. Les prix servent le récit,
sans conversion contemporaine ni prétention à restituer des prix antiques.
Les tableaux, rapports et PDF utilisent les mêmes quantités et montants.

## Sources de travail

Repères consultés le 10 septembre 2026, sans notices ajoutées dans les dossiers :

- [César, Guerre des Gaules, livre VII](https://www.perseus.tufts.edu/hopper/text?doc=Perseus%3Atext%3A1999.02.0001%3Abook%3D7)
  et [livre VIII, continuation d’Hirtius](https://bcs.fltr.ucl.ac.be/CAES/BGVIII.html) : acteurs et contexte.
- [MuséoParc Alésia](https://alesia.com/archeologie/) : site archéologique.
- [Quinaire d’argent, musée archéologique de Dijon, POP](https://pop.culture.gouv.fr/notice/joconde/01380001052) : émission antérieure à 52 av. J.-C., attribuée aux Séquanes avec réserve dans la notice.
- [Plateau de Cornu, archives ArchéoJuraSites](https://berthier.archeojurasites.org/content/le-plateau-de-cornu-chaux-des-crotenay-contexte-historique-et-toponymique) : repérage du décor jurassien.

## Exécution

Voir le [guide des seeds](seeds.md). Le jeu `alesia` conserve les scénarios
`preparation`, `default` et `minutes`, les 8 affaires, 13 sujets et tous les
formats couverts. Le scénario `default` produit 7 scrutins, 5 délibérations,
deux séances closes et une séance en cours. `minutes` laisse le troisième PV
modifiable avec « ses conclusion » à corriger.

Les cinq comptes utilisent `@alesia.example` : `vercingetorix` (administration),
`secretariat` (secrétariat), `eporedorix` (contribution), `vercassivellaunos`
(conduite), `viridomaros` (lecture). Mot de passe : `Hall-demo-2026!`,
remplaçable par `SEED_DEMO_PASSWORD`.

Toutes les ressources restent sous `seed`. Les références juridiques modernes
sont dans `seed/guide/references-techniques` ; leur résolution exige Légifrance.
Les scénarios se testent exclusivement sur la base PostgreSQL isolée de test.
