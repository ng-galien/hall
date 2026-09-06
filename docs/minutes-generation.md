# Génération du procès-verbal

À la clôture d’une séance, PostgreSQL crée le brouillon : les faits de séance sont figés, tandis que la rédaction initialisée depuis les notes peut être corrigée.

Le brouillon expose une section rédactionnelle par point à l’ordre du jour. Chaque correction cible ce point et transmet la version globale du PV ; elle ne modifie ni les faits ni les autres sections.

Le template PDF de type `minutes`, enregistré et modifiable via l’API de templates existante, pilote le titre, la composition et le style. Il doit être unique et contenir exactement une fois chacune des directives `::minutes{section=facts}` et `::minutes{section=proceedings}`. Le premier bloc présente les faits de séance et les présences ; le second réunit, sous le titre unique de chaque point, le rapport, le projet éventuel, les échanges et le résultat. Les contenus saisis restent conservés intégralement. [minutesDocument.ts](../packages/server/src/services/minutesDocument.ts) assemble ces sections. Le moteur de templates existant et [DocumentRenderer](../packages/server/src/services/documentRenderer.ts) produisent le PDF A4 avec Chromium.

L’aperçu PDF utilise le même template sans conserver de document ni figer le brouillon. Après génération, l’aperçu restitue le document conservé : une modification ultérieure du template ne change pas le PV généré.

Le serveur transmet le PDF avec la version de brouillon utilisée. PostgreSQL vérifie cette version, conserve les octets et fige la rédaction. Les signatures et la publication ne sont pas simulées par cette génération.

## Démonstration de la génération

Depuis la racine du dépôt :

```sh
SEED_MEETING_SCENARIO=minutes npm run demo:restart
```

Cette commande remplace les données locales de démonstration. Elle conserve deux PV historiques générés et clôture une troisième séance **sans générer son PV**. Le lien du brouillon est affiché à la fin du seed ; il est aussi accessible dans l’entrée racine « Procès-verbaux ».

Le brouillon contient les présences, les résultats des scrutins et des notes fictives, dont une faute volontaire à corriger. Corriger la rédaction, attendre l’autosave, puis utiliser « Générer » permet de vérifier le parcours. Après génération, le PDF est consultable et le brouillon n’est plus modifiable.

Sans cette variable, `npm run demo:restart` conserve le scénario habituel avec une séance en cours. Le scénario `preparation` utilisé par les tests reste inchangé.
