# Préparation des séances — cadre juridique retenu

Vérification effectuée le 29 août 2026, exclusivement à partir de sources officielles. Cette note sépare les obligations légales, les choix laissés à la commune et les automatismes internes retenus par Hall.

## Obligations légales prises en compte

- La convocation est faite par le maire, indique toutes les questions portées à l’ordre du jour, est mentionnée au registre des délibérations, affichée ou publiée, puis transmise par voie dématérialisée ou par écrit à l’adresse demandée par le conseiller ([CGCT, art. L2121-10](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000041410274)). La loi impose donc la publicité de la convocation qui contient l’ordre du jour ; elle ne crée pas, dans cet article, une formalité générale distincte de publication d’un second document « ordre du jour ».
- Le délai ordinaire est de trois jours francs dans les communes de moins de 3 500 habitants et de cinq jours francs à partir de 3 500 habitants. En urgence, le maire peut l’abréger sans descendre sous un jour franc ; le conseil se prononce sur l’urgence à l’ouverture et peut renvoyer tout ou partie des affaires ([CGCT, art. L2121-11 et L2121-12](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006070633/LEGISCTA000006180960/)). À partir de 3 500 habitants, une note explicative de synthèse accompagne les affaires soumises à délibération.
- Les élus ont droit à l’information sur les affaires faisant l’objet d’une délibération ; la commune choisit les moyens matériels appropriés pour diffuser cette information ([CGCT, art. L2121-13 et L2121-13-1](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006070633/LEGISCTA000006180960/)).
- Après un défaut de quorum consécutif à une première convocation régulière, le conseil est convoqué à nouveau et délibère sans condition de quorum. Trois jours francs doivent séparer l’envoi de cette seconde convocation et la seconde réunion ([CGCT, art. L2121-17](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006389875), [Conseil d’État, 16 juin 1997, n° 142691](https://www.legifrance.gouv.fr/ceta/id/CETATEXT000007970358/)).
- Le procès-verbal est rédigé par le ou les secrétaires, arrêté au commencement de la séance suivante, puis signé par le maire et le ou les secrétaires. Son contenu minimal et sa publication après son approbation sont définis par l’article L2121-15 ([CGCT, art. L2121-15](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044190488)).

## Choix communal et recommandations

- « Arrêter » le procès-verbal signifie le soumettre aux élus présents au commencement de la séance suivante après prise en compte de leurs remarques. Aucun formalisme particulier ni vote obligatoire n’est prévu par le CGCT.
- La DGCL recommande de transmettre le projet de procès-verbal avec la convocation de la séance où il sera arrêté ; cette transmission conjointe est une recommandation, pas une obligation légale autonome ([FAQ DGCL sur le procès-verbal](https://collectivites-locales.gouv.fr/files/Institution/FAQ%202%20-%20Ordonnance%20publicite%CC%81%20des%20actes_MAJ%2022092022.pdf)).
- Le support exact de la preuve d’envoi, de réception et de publication n’est pas fixé par les articles cités. Un horodatage déclaratif ne suffit donc pas, à lui seul, à prouver la régularité de toute la chaîne de convocation.

## Automatisation interne retenue

- `CouncilMeeting` porte la nature métier stable de séance du conseil. Chaque occurrence est identifiée par sa date et son numéro, sans titre métier redondant ; ses libellés de présentation relèvent des templates, de la configuration et de l’IHM.
- À la clôture, Hall génère un brouillon de procès-verbal à partir des présences, du quorum, de l’ordre du jour, des rapports, des discussions et des scrutins déjà consignés.
- Une finalisation explicite reste nécessaire. Le brouillon finalisé devient le contenu de l’approbation unique de cette séance et est provisionné en tête de la prochaine séance déjà datée et encore en brouillon.
- Les points reportés ou restés non examinés sont reproposés dans cette séance en brouillon par les mêmes commandes d’ordonnancement que les ajouts manuels. Hall ne modifie pas automatiquement une séance déjà programmée.
- Hall ne calcule pas encore la conformité des convocations ordinaires et ne transforme pas `meetingNoticeSentAt` en preuve juridique. Les variantes de population, d’urgence, de note explicative, de canal et de réception exigent un futur modèle probatoire dédié.

Sources de synthèse complémentaires : [DGCL, Le conseil municipal](https://www.collectivites-locales.gouv.fr/connaitre-les-acteurs-et-les-institutions/structures-territoriales/les-communes/le-conseil-municipal) et [DGCL, Guide des exécutifs locaux 2026](https://www.collectivites-locales.gouv.fr/files/files/1.%20Connaitre%20les%20acteurs%20et%20les%20institutions/D%C3%A9mocratie%20locale/Elections%20municipales/Guide%20des%20ex%C3%A9cutifs%20locaux.pdf).
