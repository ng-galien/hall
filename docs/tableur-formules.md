# Formules du tableur

Hall délègue le calcul à `@jspreadsheet/formula@2.0.2`. Le module frontend
`packages/client/src/features/spreadsheet/formulaEditor.ts` ne calcule aucune formule : il fournit le catalogue,
la tokenisation, l’autocomplétion, la localisation et les opérations d’édition.

## Catalogue exécutable

L’introspection du moteur installé donne **390 fonctions appelables et non stubées**. La constante
`spreadsheetFormulaFunctions` est la liste exhaustive, versionnée par
`spreadsheetFormulaCatalogVersion`. Le chiffre public de 403 fonctions annoncé pour Formula Basic n’est pas
repris artificiellement : 13 entrées annoncées ne sont pas exposées comme fonctions exécutables non stubées par
la version 2.0.2 installée.

Le test `npm run test:formula-editor:coverage -w @hall/client` vérifie la cardinalité, l’unicité, le tri, tous les
alias et un seuil de 100 % pour les lignes, branches et fonctions du module.

L’aide embarquée est un snapshot versionné de l’endpoint officiel JSpreadsheet
<https://jspreadsheet.com/jspreadsheet/formulas/g> pris le 30 août 2026. Après rapprochement des noms à points
avec les noms exécutables de Formula Basic 2.0.2, elle fournit syntaxe, description anglaise et catégorie pour
374 des 390 fonctions. Les 16 absences exactes sont : BETA, BINOM, CHIDISTRT, CHIINVRT, CHISQ, COL,
COVARIANCE, ERROR, EXPON, F, HYPGEOM, ISO, LOGNORM, NEGBINOM, NORM et Z. L’interface affiche pour elles un
fallback explicite et n’invente pas de description. En français, les cinq commandes usuelles de Somme
automatique disposent d’une signature et d’une description sourcées sur Microsoft Support ; les autres
signatures sont localisées mais la description anglaise n’est pas traduite artificiellement.

## Noms anglais et français

La source de traduction figée au 30 août 2026 est la table fr-FR d’Excel-Translator :
<https://fr.excel-translator.de/fonctions/>. Elle est compatible avec les noms localisés d’Excel et permet de
croiser les noms français et anglais sur une même ligne.

- 260 alias français non ambigus sont exposés par `spreadsheetFormulaAliasesFrench` ;
- 80 fonctions gardent le même nom en Excel français, listées par `spreadsheetFormulaNamesIdenticalFrench` ;
- 50 noms restent volontairement anglais, listés par `spreadsheetFormulaEnglishOnly`.

Les deux collisions `COVARIANCE` (alias français historique de `COVAR`, mais fonction propre du moteur) et
`TRIM` (alias français financier de `MIRR`, mais fonction texte propre du moteur) donnent priorité au nom
canonique anglais pour ne pas rendre une fonction du moteur inaccessible.

Les noms laissés en anglais sont : BETA, BINOM, CEILINGMATH, CEILINGPRECISE, CHIDISTRT, CHIINVRT, CHISQ,
COL, COVAR, COVARIANCE, COVARIANCEP, COVARIANCES, ERROR, EXPON, F, FDISTRT, FINVRT, FLOORMATH,
FLOORPRECISE, GAMMALNPRECISE, HYPGEOM, ISO, LOGNORM, LOGNORMINV, MIRR, MODEMULT, MODESNGL, NEGBINOM,
NETWORKDAYSINTL, NORM, PERCENTILEEXC, PERCENTILEINC, PERCENTRANKEXC, PERCENTRANKINC, POISSONDIST,
QUARTILEEXC, QUARTILEINC, RANKAVG, RANKEQ, SKEWP, SORT, STDEVS, TABLE, TDISTRT, THISROWCELL, UNIQUE,
VARS, WEIBULLDIST, WORKDAYINTL et Z. Il s’agit de noms historiques sans points, de raccourcis Formula Basic ou
d’aides spécifiques au moteur sans correspondance exacte dans la table Excel fr-FR courante.

## Syntaxe locale

L’utilisateur peut conserver le texte saisi dans la barre de formule. Juste avant l’évaluation,
`normalizeSpreadsheetFormulaForEngine` remplace les alias français par le nom canonique anglais, transforme
le séparateur français `;` en `,` et la virgule décimale française en point moteur, sans modifier les chaînes. Les références relatives,
absolues et mixtes restent inchangées.

La Somme automatique propose Somme, Moyenne, Nombre, Maximum et Minimum. Elle ignore les en-têtes texte,
détecte les valeurs numériques et formules contiguës, et génère un résultat par colonne quand plusieurs cellules
de total vides sont sélectionnées.

## Contrat Excel reproduit

L’intégration reprend les interactions effectivement documentées par Microsoft et couvertes par le parcours
Playwright du tableur :

- une formule peut être saisie directement dans une cellule et reste visible dans la barre de formule
  ([saisie d’une formule](https://support.microsoft.com/fr-fr/excel/enter-a-formula)) ;
- chaque référence de la formule reçoit une couleur stable et la plage correspondante une bordure assortie ;
  une plage peut être introduite par sélection et glisser dans la grille
  ([références de cellules dans une formule](https://support.microsoft.com/fr-fr/excel/use-cell-references-in-a-formula)) ;
- la poignée de recopie propage valeurs et formules, en ajustant les références relatives et mixtes tout en
  conservant les références absolues
  ([déplacer ou copier une formule](https://support.microsoft.com/fr-FR/Excel/move-or-copy-a-formula-in-excel),
  [vue d’ensemble des formules](https://support.microsoft.com/fr-fr/office/vue-d-ensemble-des-formules-dans-excel-ecfdc708-9162-49e8-b993-c311f47ca173)) ;
- Somme automatique détecte une plage contiguë et propose aussi Moyenne, Nombre, Maximum, Minimum et l’accès
  aux autres fonctions ([en savoir plus sur SOMME](https://support.microsoft.com/fr-fr/excel/learn-more-about-sum)).

Jspreadsheet CE 5 ne fournit pas nativement une barre de formule ni l’aide et l’autocomplétion utilisées ici :
Hall ajoute uniquement cette couche d’édition et délègue toujours le calcul à Formula Basic. L’intégration ne
prétend pas reproduire Excel au-delà des comportements énumérés ci-dessus ; notamment, les descriptions
françaises ne sont affichées que lorsqu’une fiche française sourcée est embarquée.

## Catalogue exhaustif

Le nom de fonction et le séparateur sont localisés pour l’affichage français. Les noms d’arguments restent ceux
du snapshot source JSpreadsheet, sauf pour les cinq fonctions usuelles documentées par Microsoft Support.

| Nom EN | Nom FR présenté | Syntaxe (nom/séparateurs FR, arguments source) | Aide |
| --- | --- | --- | --- |
| ABS | ABS | `ABS(x)` | JSpreadsheet |
| ACCRINT | INTERET.ACC | `INTERET.ACC(issue; first_interest; settlement; rate; par; frequency; [basis]; [calc_method])` | JSpreadsheet |
| ACOS | ACOS | `ACOS(x)` | JSpreadsheet |
| ACOSH | ACOSH | `ACOSH(x)` | JSpreadsheet |
| ACOT | ACOT | `ACOT(x)` | JSpreadsheet |
| ACOTH | ACOTH | `ACOTH(number)` | JSpreadsheet |
| AGGREGATE | AGREGAT | `AGREGAT(function_num; options; ref1; [ref2]; ...)` | JSpreadsheet |
| AND | ET | `ET(logical1; [logical2]; ...)` | JSpreadsheet |
| ARABIC | CHIFFRE.ARABE | `CHIFFRE.ARABE(text)` | JSpreadsheet |
| ASIN | ASIN | `ASIN(x)` | JSpreadsheet |
| ASINH | ASINH | `ASINH(x)` | JSpreadsheet |
| ATAN | ATAN | `ATAN(number)` | JSpreadsheet |
| ATAN2 | ATAN2 | `ATAN2(x_num; y_num)` | JSpreadsheet |
| ATANH | ATANH | `ATANH(x)` | JSpreadsheet |
| AVEDEV | ECART.MOYEN | `ECART.MOYEN(number1; [number2]; ...)` | JSpreadsheet |
| AVERAGE | MOYENNE | `MOYENNE(nombre1; [nombre2]; …)` | JSpreadsheet |
| AVERAGEA | AVERAGEA | `AVERAGEA(value1; [value2]; ...)` | JSpreadsheet |
| AVERAGEIF | MOYENNE.SI | `MOYENNE.SI(range; criteria; [average_range])` | JSpreadsheet |
| AVERAGEIFS | MOYENNE.SI.ENS | `MOYENNE.SI.ENS(average_range; criteria_range1; criteria1; [criteria_range2; criteria2]; ...)` | JSpreadsheet |
| BASE | BASE | `BASE(number; radix; [min_length])` | JSpreadsheet |
| BESSELI | BESSELI | `BESSELI(x; n)` | JSpreadsheet |
| BESSELJ | BESSELJ | `BESSELJ(x; n)` | JSpreadsheet |
| BESSELK | BESSELK | `BESSELK(x; n)` | JSpreadsheet |
| BESSELY | BESSELY | `BESSELY(x; n)` | JSpreadsheet |
| BETA | BETA | `BETA(…)` | Exception sans fiche |
| BETADIST | LOI.BETA | `LOI.BETA(x; alpha; beta; [cumulative]; [A]; [B])` | JSpreadsheet |
| BETAINV | BETA.INVERSE | `BETA.INVERSE(probability; alpha; beta; [A]; [B])` | JSpreadsheet |
| BIN2DEC | BINDEC | `BINDEC(number)` | JSpreadsheet |
| BIN2HEX | BINHEX | `BINHEX(number; [places])` | JSpreadsheet |
| BIN2OCT | BINOCT | `BINOCT(number; [places])` | JSpreadsheet |
| BINOM | BINOM | `BINOM(…)` | Exception sans fiche |
| BINOMDIST | LOI.BINOMIALE | `LOI.BINOMIALE(number_s; trials; probability_s; [cumulative])` | JSpreadsheet |
| BITAND | BITET | `BITET(number1; number2)` | JSpreadsheet |
| BITLSHIFT | BITDECALG | `BITDECALG(number; shift_amount)` | JSpreadsheet |
| BITOR | BITOU | `BITOU(number1; number2)` | JSpreadsheet |
| BITRSHIFT | BITDECALD | `BITDECALD(num; shift_amount)` | JSpreadsheet |
| BITXOR | BITOUEXCLUSIF | `BITOUEXCLUSIF(number1; number2)` | JSpreadsheet |
| CEILING | PLAFOND | `PLAFOND(num; significance)` | JSpreadsheet |
| CEILINGMATH | CEILINGMATH | `CEILINGMATH(number; [significance]; [mode])` | JSpreadsheet |
| CEILINGPRECISE | CEILINGPRECISE | `CEILINGPRECISE(number; [significance])` | JSpreadsheet |
| CELL | CELLULE | `CELLULE(info_type; [reference])` | JSpreadsheet |
| CHAR | CAR | `CAR(num)` | JSpreadsheet |
| CHIDIST | LOI.KHIDEUX | `LOI.KHIDEUX(x; degrees_freedom)` | JSpreadsheet |
| CHIDISTRT | CHIDISTRT | `CHIDISTRT(…)` | Exception sans fiche |
| CHIINV | KHIDEUX.INVERSE | `KHIDEUX.INVERSE(probability; degrees_freedom)` | JSpreadsheet |
| CHIINVRT | CHIINVRT | `CHIINVRT(…)` | Exception sans fiche |
| CHISQ | CHISQ | `CHISQ(…)` | Exception sans fiche |
| CHITEST | TEST.KHIDEUX | `TEST.KHIDEUX(actual_range; expected_range)` | JSpreadsheet |
| CHOOSE | CHOISIR | `CHOISIR(index_num; value1; [value2]; ...)` | JSpreadsheet |
| CLEAN | EPURAGE | `EPURAGE(text)` | JSpreadsheet |
| CODE | CODE | `CODE(text)` | JSpreadsheet |
| COL | COL | `COL(…)` | Exception sans fiche |
| COLUMN | COLONNE | `COLONNE([reference])` | JSpreadsheet |
| COLUMNS | COLONNES | `COLONNES(array)` | JSpreadsheet |
| COMBIN | COMBIN | `COMBIN(number; number_chosen)` | JSpreadsheet |
| COMBINA | COMBINA | `COMBINA(number; number_chosen)` | JSpreadsheet |
| COMPLEX | COMPLEXE | `COMPLEXE(real_num; [i_num]; [suffix])` | JSpreadsheet |
| CONCAT | CONCAT | `CONCAT(text1; [text2]; ...)` | JSpreadsheet |
| CONCATENATE | CONCATENER | `CONCATENER(text1; [text2]; ...)` | JSpreadsheet |
| CONFIDENCE | INTERVALLE.CONFIANCE | `INTERVALLE.CONFIANCE(alpha; standard_dev; size)` | JSpreadsheet |
| CONVERT | CONVERT | `CONVERT(number; from_unit; to_unit)` | JSpreadsheet |
| CORREL | COEFFICIENT.CORRELATION | `COEFFICIENT.CORRELATION(array1; array2)` | JSpreadsheet |
| COS | COS | `COS(number)` | JSpreadsheet |
| COSH | COSH | `COSH(x)` | JSpreadsheet |
| COT | COT | `COT(x)` | JSpreadsheet |
| COTH | COTH | `COTH(x)` | JSpreadsheet |
| COUNT | NB | `NB(valeur1; [valeur2]; …)` | JSpreadsheet |
| COUNTA | NBVAL | `NBVAL(value1; [value2]; ...)` | JSpreadsheet |
| COUNTBLANK | NB.VIDE | `NB.VIDE(range)` | JSpreadsheet |
| COUNTIF | NB.SI | `NB.SI(range; criteria)` | JSpreadsheet |
| COUNTIFS | NB.SI.ENS | `NB.SI.ENS(range1; criteria1; [range2]; [criteria2]; ...)` | JSpreadsheet |
| COVAR | COVAR | `COVAR(array1; array2)` | JSpreadsheet |
| COVARIANCE | COVARIANCE | `COVARIANCE(…)` | Exception sans fiche |
| COVARIANCEP | COVARIANCEP | `COVARIANCEP(array1; array2)` | JSpreadsheet |
| COVARIANCES | COVARIANCES | `COVARIANCES(array1; array2)` | JSpreadsheet |
| CRITBINOM | CRITERE.LOI.BINOMIALE | `CRITERE.LOI.BINOMIALE(trials; probability_s; alpha)` | JSpreadsheet |
| CSC | CSC | `CSC(angle)` | JSpreadsheet |
| CSCH | CSCH | `CSCH(angle)` | JSpreadsheet |
| CUMIPMT | CUMUL.INTER | `CUMUL.INTER(rate; nper; pv; start_period; end_period; type)` | JSpreadsheet |
| CUMPRINC | CUMUL.PRINCPER | `CUMUL.PRINCPER(rate; nper; pv; start_period; end_period; type)` | JSpreadsheet |
| DATE | DATE | `DATE(year; month; day)` | JSpreadsheet |
| DATEDIF | DATEDIF | `DATEDIF(start_date; end_date; interval)` | JSpreadsheet |
| DATEVALUE | DATEVAL | `DATEVAL(date_text)` | JSpreadsheet |
| DAVERAGE | BDMOYENNE | `BDMOYENNE(database; field; criteria)` | JSpreadsheet |
| DAY | JOUR | `JOUR(date)` | JSpreadsheet |
| DAYS | JOURS | `JOURS(end_date; start_date)` | JSpreadsheet |
| DAYS360 | JOURS360 | `JOURS360(start_date; end_date; [method])` | JSpreadsheet |
| DB | DB | `DB(cost; salvage; life; period; [month])` | JSpreadsheet |
| DCOUNT | BDNB | `BDNB(database; field; criteria)` | JSpreadsheet |
| DCOUNTA | BDNBVAL | `BDNBVAL(database; field; criteria)` | JSpreadsheet |
| DDB | DDB | `DDB(cost; salvage; life; period; [factor])` | JSpreadsheet |
| DEC2BIN | DECBIN | `DECBIN(number; [places])` | JSpreadsheet |
| DEC2HEX | DECHEX | `DECHEX(number; [places])` | JSpreadsheet |
| DEC2OCT | DECOCT | `DECOCT(number; [places])` | JSpreadsheet |
| DECIMAL | DECIMAL | `DECIMAL(text; radix)` | JSpreadsheet |
| DEGREES | DEGRES | `DEGRES(angle)` | JSpreadsheet |
| DELTA | DELTA | `DELTA(number1; [number2])` | JSpreadsheet |
| DEVSQ | SOMME.CARRES.ECARTS | `SOMME.CARRES.ECARTS(number1; [number2]; ...)` | JSpreadsheet |
| DGET | BDLIRE | `BDLIRE(database; field; criteria)` | JSpreadsheet |
| DISC | TAUX.ESCOMPTE | `TAUX.ESCOMPTE(settlement; maturity; price; redemption; [basis])` | JSpreadsheet |
| DMAX | BDMAX | `BDMAX(database; field; criteria)` | JSpreadsheet |
| DMIN | BDMIN | `BDMIN(database; field; criteria)` | JSpreadsheet |
| DOLLAR | DEVISE | `DEVISE(num; [decimals])` | JSpreadsheet |
| DOLLARDE | PRIX.DEC | `PRIX.DEC(decimal_dollar; fraction)` | JSpreadsheet |
| DOLLARFR | PRIX.FRAC | `PRIX.FRAC(decimal_dollar; fraction)` | JSpreadsheet |
| DPRODUCT | BDPRODUIT | `BDPRODUIT(database; field; criteria)` | JSpreadsheet |
| DSTDEV | BDECARTYPE | `BDECARTYPE(database; field; criteria)` | JSpreadsheet |
| DSTDEVP | BDECARTYPEP | `BDECARTYPEP(database; field; criteria)` | JSpreadsheet |
| DSUM | BDSOMME | `BDSOMME(database; field; criteria)` | JSpreadsheet |
| DVAR | BDVAR | `BDVAR(database; field; criteria)` | JSpreadsheet |
| DVARP | BDVARP | `BDVARP(database; field; criteria)` | JSpreadsheet |
| EDATE | MOIS.DECALER | `MOIS.DECALER(start_date; months)` | JSpreadsheet |
| EFFECT | TAUX.EFFECTIF | `TAUX.EFFECTIF(nominal_rate; npery)` | JSpreadsheet |
| EOMONTH | FIN.MOIS | `FIN.MOIS(start_date; months)` | JSpreadsheet |
| ERF | ERF | `ERF(x)` | JSpreadsheet |
| ERFC | ERFC | `ERFC(x)` | JSpreadsheet |
| ERROR | ERROR | `ERROR(…)` | Exception sans fiche |
| EVEN | PAIR | `PAIR(x)` | JSpreadsheet |
| EXACT | EXACT | `EXACT(text1; text2)` | JSpreadsheet |
| EXP | EXP | `EXP(number)` | JSpreadsheet |
| EXPON | EXPON | `EXPON(…)` | Exception sans fiche |
| EXPONDIST | LOI.EXPONENTIELLE | `LOI.EXPONENTIELLE(x; lambda; cumulative)` | JSpreadsheet |
| F | F | `F(…)` | Exception sans fiche |
| FACT | FACT | `FACT(x)` | JSpreadsheet |
| FACTDOUBLE | FACTDOUBLE | `FACTDOUBLE(number)` | JSpreadsheet |
| FALSE | FAUX | `FAUX()` | JSpreadsheet |
| FDIST | LOI.F | `LOI.F(x; degrees_freedom1; degrees_freedom2; cumulative)` | JSpreadsheet |
| FDISTRT | FDISTRT | `FDISTRT(x; degrees_freedom1; degrees_freedom2)` | JSpreadsheet |
| FIND | TROUVE | `TROUVE(find_text; within_text; start_num)` | JSpreadsheet |
| FINV | INVERSE.LOI.F | `INVERSE.LOI.F(probability; degrees_freedom1; degrees_freedom2)` | JSpreadsheet |
| FINVRT | FINVRT | `FINVRT(probability; degrees_freedom1; degrees_freedom2)` | JSpreadsheet |
| FISHER | FISHER | `FISHER(x)` | JSpreadsheet |
| FISHERINV | FISHER.INVERSE | `FISHER.INVERSE(y)` | JSpreadsheet |
| FIXED | CTXT | `CTXT(number; [decimals]; [no_commas])` | JSpreadsheet |
| FLOOR | PLANCHER | `PLANCHER(num; significance)` | JSpreadsheet |
| FLOORMATH | FLOORMATH | `FLOORMATH(number; [significance]; [mode])` | JSpreadsheet |
| FLOORPRECISE | FLOORPRECISE | `FLOORPRECISE(number; [significance])` | JSpreadsheet |
| FORECAST | PREVISION | `PREVISION(x; known_y's; known_x's)` | JSpreadsheet |
| FREQUENCY | FREQUENCE | `FREQUENCE(data_array; bins_array)` | JSpreadsheet |
| FTEST | TEST.F | `TEST.F(array1; array2)` | JSpreadsheet |
| FV | VC | `VC(rate; nper; pmt; [pv]; [type])` | JSpreadsheet |
| FVSCHEDULE | VC.PAIEMENTS | `VC.PAIEMENTS(principal; schedule)` | JSpreadsheet |
| GAMMA | GAMMA | `GAMMA(number)` | JSpreadsheet |
| GAMMADIST | LOI.GAMMA | `LOI.GAMMA(x; alpha; beta; cumulative)` | JSpreadsheet |
| GAMMAINV | LOI.GAMMA.INVERSE | `LOI.GAMMA.INVERSE(probability; alpha; beta)` | JSpreadsheet |
| GAMMALN | LNGAMMA | `LNGAMMA(number)` | JSpreadsheet |
| GAMMALNPRECISE | GAMMALNPRECISE | `GAMMALNPRECISE(x)` | JSpreadsheet |
| GAUSS | GAUSS | `GAUSS(z)` | JSpreadsheet |
| GCD | PGCD | `PGCD(number1; number2;...)` | JSpreadsheet |
| GEOMEAN | MOYENNE.GEOMETRIQUE | `MOYENNE.GEOMETRIQUE(number1;[number2];...)` | JSpreadsheet |
| GESTEP | SUP.SEUIL | `SUP.SEUIL(number; step)` | JSpreadsheet |
| GROWTH | CROISSANCE | `CROISSANCE(known_y's;[known_x's];[new_x's];[const])` | JSpreadsheet |
| HARMEAN | MOYENNE.HARMONIQUE | `MOYENNE.HARMONIQUE(number1; [number2];...)` | JSpreadsheet |
| HEX2BIN | HEXBIN | `HEXBIN(number;[places])` | JSpreadsheet |
| HEX2DEC | HEXDEC | `HEXDEC(x)` | JSpreadsheet |
| HEX2OCT | HEXOCT | `HEXOCT(number;[places])` | JSpreadsheet |
| HLOOKUP | RECHERCHEH | `RECHERCHEH(lookup_value;table_array;row_index_num;[range_lookup])` | JSpreadsheet |
| HOUR | HEURE | `HEURE(serial_number)` | JSpreadsheet |
| HYPGEOM | HYPGEOM | `HYPGEOM(…)` | Exception sans fiche |
| HYPGEOMDIST | LOI.HYPERGEOMETRIQUE | `LOI.HYPERGEOMETRIQUE(sample_s; number_sample; population_s; number_pop)` | JSpreadsheet |
| IF | SI | `SI(logical_test; [value_if_true]; [value_if_false])` | JSpreadsheet |
| IFERROR | SIERREUR | `SIERREUR(value; value_if_error)` | JSpreadsheet |
| IFNA | SI.NON.DISP | `SI.NON.DISP(value; value_if_na)` | JSpreadsheet |
| IFS | SI.CONDITIONS | `SI.CONDITIONS(logical_test1; value_if_true1; [logical_test2; value_if_true2]; ...)` | JSpreadsheet |
| IMABS | COMPLEXE.MODULE | `COMPLEXE.MODULE(inumber)` | JSpreadsheet |
| IMAGINARY | COMPLEXE.IMAGINAIRE | `COMPLEXE.IMAGINAIRE(inumber)` | JSpreadsheet |
| IMARGUMENT | COMPLEXE.ARGUMENT | `COMPLEXE.ARGUMENT(inumber)` | JSpreadsheet |
| IMCONJUGATE | COMPLEXE.CONJUGUE | `COMPLEXE.CONJUGUE(inumber)` | JSpreadsheet |
| IMCOS | COMPLEXE.COS | `COMPLEXE.COS(inumber)` | JSpreadsheet |
| IMCOSH | COMPLEXE.COSH | `COMPLEXE.COSH(inumber)` | JSpreadsheet |
| IMCOT | COMPLEXE.COT | `COMPLEXE.COT(inumber)` | JSpreadsheet |
| IMCSC | COMPLEXE.CSC | `COMPLEXE.CSC(x)` | JSpreadsheet |
| IMCSCH | COMPLEXE.CSCH | `COMPLEXE.CSCH(inumber)` | JSpreadsheet |
| IMDIV | COMPLEXE.DIV | `COMPLEXE.DIV(inumber1; inumber2)` | JSpreadsheet |
| IMEXP | COMPLEXE.EXP | `COMPLEXE.EXP(inumber)` | JSpreadsheet |
| IMLN | COMPLEXE.LN | `COMPLEXE.LN(inumber)` | JSpreadsheet |
| IMLOG10 | COMPLEXE.LOG10 | `COMPLEXE.LOG10(inumber)` | JSpreadsheet |
| IMLOG2 | COMPLEXE.LOG2 | `COMPLEXE.LOG2(inumber)` | JSpreadsheet |
| IMPOWER | COMPLEXE.PUISSANCE | `COMPLEXE.PUISSANCE(inumber; number)` | JSpreadsheet |
| IMPRODUCT | COMPLEXE.PRODUIT | `COMPLEXE.PRODUIT(inumber1; [inumber2]; ...)` | JSpreadsheet |
| IMREAL | COMPLEXE.REEL | `COMPLEXE.REEL(inumber)` | JSpreadsheet |
| IMSEC | COMPLEXE.SEC | `COMPLEXE.SEC(inumber)` | JSpreadsheet |
| IMSECH | COMPLEXE.SECH | `COMPLEXE.SECH(inumber)` | JSpreadsheet |
| IMSIN | COMPLEXE.SIN | `COMPLEXE.SIN(inumber)` | JSpreadsheet |
| IMSINH | COMPLEXE.SINH | `COMPLEXE.SINH(inumber)` | JSpreadsheet |
| IMSQRT | COMPLEXE.RACINE | `COMPLEXE.RACINE(inumber)` | JSpreadsheet |
| IMSUB | COMPLEXE.DIFFERENCE | `COMPLEXE.DIFFERENCE(inumber1; inumber2)` | JSpreadsheet |
| IMSUM | COMPLEXE.SOMME | `COMPLEXE.SOMME(inumber1; [inumber2]; ...)` | JSpreadsheet |
| IMTAN | COMPLEXE.TAN | `COMPLEXE.TAN(inumber)` | JSpreadsheet |
| INDEX | INDEX | `INDEX(array; row_num; [column_num])` | JSpreadsheet |
| INT | ENT | `ENT(x)` | JSpreadsheet |
| INTERCEPT | ORDONNEE.ORIGINE | `ORDONNEE.ORIGINE(known_y's; known_x's)` | JSpreadsheet |
| IPMT | INTPER | `INTPER(rate; per; nper; pv; [fv]; [type])` | JSpreadsheet |
| IRR | TRI | `TRI(values; [guess])` | JSpreadsheet |
| ISBLANK | ESTVIDE | `ESTVIDE(value)` | JSpreadsheet |
| ISERR | ESTERR | `ESTERR(value)` | JSpreadsheet |
| ISERROR | ESTERREUR | `ESTERREUR(value)` | JSpreadsheet |
| ISEVEN | EST.PAIR | `EST.PAIR(num)` | JSpreadsheet |
| ISLOGICAL | ESTLOGIQUE | `ESTLOGIQUE(value)` | JSpreadsheet |
| ISNA | ESTNA | `ESTNA(value)` | JSpreadsheet |
| ISNONTEXT | ESTNONTEXTE | `ESTNONTEXTE(value)` | JSpreadsheet |
| ISNUMBER | ESTNUM | `ESTNUM(value)` | JSpreadsheet |
| ISO | ISO | `ISO(…)` | Exception sans fiche |
| ISODD | EST.IMPAIR | `EST.IMPAIR(x)` | JSpreadsheet |
| ISOWEEKNUM | NO.SEMAINE.ISO | `NO.SEMAINE.ISO(date)` | JSpreadsheet |
| ISPMT | ISPMT | `ISPMT(rate; period; periods; principal)` | JSpreadsheet |
| ISTEXT | ESTTEXTE | `ESTTEXTE(value)` | JSpreadsheet |
| KURT | KURTOSIS | `KURTOSIS(number1; [number2]; ...)` | JSpreadsheet |
| LARGE | GRANDE.VALEUR | `GRANDE.VALEUR(array; k)` | JSpreadsheet |
| LCM | PPCM | `PPCM(number1; [number2]; ...)` | JSpreadsheet |
| LEFT | GAUCHE | `GAUCHE(text; [num_chars])` | JSpreadsheet |
| LEN | NBCAR | `NBCAR(text)` | JSpreadsheet |
| LINEST | DROITEREG | `DROITEREG(known_y's; [known_x's]; [const]; [stats])` | JSpreadsheet |
| LN | LN | `LN(x)` | JSpreadsheet |
| LOG | LOG | `LOG(number; [base])` | JSpreadsheet |
| LOG10 | LOG10 | `LOG10(number)` | JSpreadsheet |
| LOGEST | LOGREG | `LOGREG(known_y's; [known_x's]; [const]; [stats])` | JSpreadsheet |
| LOGINV | LOI.LOGNORMALE.INVERSE | `LOI.LOGNORMALE.INVERSE(probability; mean; standard_dev)` | JSpreadsheet |
| LOGNORM | LOGNORM | `LOGNORM(…)` | Exception sans fiche |
| LOGNORMDIST | LOI.LOGNORMALE | `LOI.LOGNORMALE(x; mean; standard_dev; [cumulative])` | JSpreadsheet |
| LOGNORMINV | LOGNORMINV | `LOGNORMINV(probability; mean; standard_dev)` | JSpreadsheet |
| LOOKUP | RECHERCHE | `RECHERCHE(lookup_value; lookup_array; [result_array])` | JSpreadsheet |
| LOWER | MINUSCULE | `MINUSCULE(text)` | JSpreadsheet |
| MATCH | EQUIV | `EQUIV(lookup_value; lookup_array; [match_type])` | JSpreadsheet |
| MAX | MAX | `MAX(nombre1; [nombre2]; …)` | JSpreadsheet |
| MAXA | MAXA | `MAXA(number1; [number2]; ...)` | JSpreadsheet |
| MEDIAN | MEDIANE | `MEDIANE(number1; [number2]; ...)` | JSpreadsheet |
| MID | STXT | `STXT(text; start_num; num_chars)` | JSpreadsheet |
| MIN | MIN | `MIN(nombre1; [nombre2]; …)` | JSpreadsheet |
| MINA | MINA | `MINA(value1;[value2];...)` | JSpreadsheet |
| MINUTE | MINUTE | `MINUTE(serial_number)` | JSpreadsheet |
| MIRR | MIRR | `MIRR(values; finance_rate; reinvest_rate)` | JSpreadsheet |
| MMULT | PRODUITMAT | `PRODUITMAT(array1; array2)` | JSpreadsheet |
| MOD | MOD | `MOD(num; divisor)` | JSpreadsheet |
| MODE | MODE | `MODE(number1; [number2];...)` | JSpreadsheet |
| MODEMULT | MODEMULT | `MODEMULT(number1;[number2];...)` | JSpreadsheet |
| MODESNGL | MODESNGL | `MODESNGL(number1;[numberN];...)` | JSpreadsheet |
| MONTH | MOIS | `MOIS(serial_number)` | JSpreadsheet |
| MROUND | ARRONDI.AU.MULTIPLE | `ARRONDI.AU.MULTIPLE(num; multiple)` | JSpreadsheet |
| MULTINOMIAL | MULTINOMIALE | `MULTINOMIALE(number1; [number2];...)` | JSpreadsheet |
| MUNIT | MATRICE.UNITAIRE | `MATRICE.UNITAIRE(size)` | JSpreadsheet |
| N | N | `N(value)` | JSpreadsheet |
| NA | NA | `NA()` | JSpreadsheet |
| NEGBINOM | NEGBINOM | `NEGBINOM(…)` | Exception sans fiche |
| NEGBINOMDIST | LOI.BINOMIALE.NEG | `LOI.BINOMIALE.NEG(number_f; number_s; probability_s; [cumulative])` | JSpreadsheet |
| NETWORKDAYS | NB.JOURS.OUVRES | `NB.JOURS.OUVRES(start_date; end_date; [holidays])` | JSpreadsheet |
| NETWORKDAYSINTL | NETWORKDAYSINTL | `NETWORKDAYSINTL(start_date; end_date; [weekend]; [holidays])` | JSpreadsheet |
| NOMINAL | TAUX.NOMINAL | `TAUX.NOMINAL(effective_rate; npery)` | JSpreadsheet |
| NORM | NORM | `NORM(…)` | Exception sans fiche |
| NORMDIST | LOI.NORMALE | `LOI.NORMALE(x; mean; standard_dev; cumulative)` | JSpreadsheet |
| NORMINV | LOI.NORMALE.INVERSE | `LOI.NORMALE.INVERSE(probability; mean; standard_dev)` | JSpreadsheet |
| NORMSDIST | LOI.NORMALE.STANDARD | `LOI.NORMALE.STANDARD(z; [cumulative])` | JSpreadsheet |
| NORMSINV | LOI.NORMALE.STANDARD.INVERSE | `LOI.NORMALE.STANDARD.INVERSE(probability)` | JSpreadsheet |
| NOT | NON | `NON(logical)` | JSpreadsheet |
| NOW | MAINTENANT | `MAINTENANT()` | JSpreadsheet |
| NPER | NPM | `NPM(rate; payment; present_value; [future_value]; [type])` | JSpreadsheet |
| NPV | VAN | `VAN(rate; value1; [value2]; ...)` | JSpreadsheet |
| NUMBERVALUE | VALEURNOMBRE | `VALEURNOMBRE(text; [decimal_separator]; [group_separator])` | JSpreadsheet |
| OCT2BIN | OCTBIN | `OCTBIN(num; [places])` | JSpreadsheet |
| OCT2DEC | OCTDEC | `OCTDEC(number)` | JSpreadsheet |
| OCT2HEX | OCTHEX | `OCTHEX(num; [places])` | JSpreadsheet |
| ODD | IMPAIR | `IMPAIR(x)` | JSpreadsheet |
| OR | OU | `OU(logical1; [logical2]; ...)` | JSpreadsheet |
| PDURATION | PDUREE | `PDUREE(rate; pv; fv)` | JSpreadsheet |
| PEARSON | PEARSON | `PEARSON(array1; array2)` | JSpreadsheet |
| PERCENTILE | CENTILE | `CENTILE(array; k)` | JSpreadsheet |
| PERCENTILEEXC | PERCENTILEEXC | `PERCENTILEEXC(array; k)` | JSpreadsheet |
| PERCENTILEINC | PERCENTILEINC | `PERCENTILEINC(array; k)` | JSpreadsheet |
| PERCENTRANK | RANG.POURCENTAGE | `RANG.POURCENTAGE(array; x; [significance])` | JSpreadsheet |
| PERCENTRANKEXC | PERCENTRANKEXC | `PERCENTRANKEXC(array; x; [significance])` | JSpreadsheet |
| PERCENTRANKINC | PERCENTRANKINC | `PERCENTRANKINC(array; x; [significance])` | JSpreadsheet |
| PERMUT | PERMUTATION | `PERMUTATION(number; number_chosen)` | JSpreadsheet |
| PERMUTATIONA | PERMUTATIONA | `PERMUTATIONA(number; number_chosen)` | JSpreadsheet |
| PHI | PHI | `PHI(z)` | JSpreadsheet |
| PI | PI | `PI()` | JSpreadsheet |
| PMT | VPM | `VPM(rate; nper; pv; [fv]; [type])` | JSpreadsheet |
| POISSON | LOI.POISSON | `LOI.POISSON(x; mean; [cumulative])` | JSpreadsheet |
| POISSONDIST | POISSONDIST | `POISSONDIST(x; mean; cumulative)` | JSpreadsheet |
| POWER | PUISSANCE | `PUISSANCE(number; power)` | JSpreadsheet |
| PPMT | PRINCPER | `PRINCPER(rate; per; nper; pv; [fv]; [type])` | JSpreadsheet |
| PRICEDISC | VALEUR.ENCAISSEMENT | `VALEUR.ENCAISSEMENT(settlement; maturity; discount; redemption; [basis])` | JSpreadsheet |
| PROB | PROBABILITE | `PROBABILITE(range; probability; [lower]; [upper])` | JSpreadsheet |
| PRODUCT | PRODUIT | `PRODUIT(number1; [number2]; ...)` | JSpreadsheet |
| PROPER | NOMPROPRE | `NOMPROPRE(text)` | JSpreadsheet |
| PV | VA | `VA(rate; nper; pmt; [fv]; [type])` | JSpreadsheet |
| QUARTILE | QUARTILE | `QUARTILE(array; quart)` | JSpreadsheet |
| QUARTILEEXC | QUARTILEEXC | `QUARTILEEXC(array; quart)` | JSpreadsheet |
| QUARTILEINC | QUARTILEINC | `QUARTILEINC(array; quart)` | JSpreadsheet |
| QUOTIENT | QUOTIENT | `QUOTIENT(numerator; denominator)` | JSpreadsheet |
| RADIANS | RADIANS | `RADIANS(angle)` | JSpreadsheet |
| RAND | ALEA | `ALEA()` | JSpreadsheet |
| RANDBETWEEN | ALEA.ENTRE.BORNES | `ALEA.ENTRE.BORNES(bottom; top)` | JSpreadsheet |
| RANK | RANG | `RANG(number;ref;[order])` | JSpreadsheet |
| RANKAVG | RANKAVG | `RANKAVG(number; ref; [order])` | JSpreadsheet |
| RANKEQ | RANKEQ | `RANKEQ(number;ref;[order])` | JSpreadsheet |
| RATE | TAUX | `TAUX(nper; pmt; pv; [fv]; [type]; [guess])` | JSpreadsheet |
| REPLACE | REMPLACER | `REMPLACER(old_text; start_num; num_chars; new_text)` | JSpreadsheet |
| REPT | REPT | `REPT(text; number_times)` | JSpreadsheet |
| RIGHT | DROITE | `DROITE(text; number_of_characters)` | JSpreadsheet |
| ROMAN | ROMAIN | `ROMAIN(number; [style])` | JSpreadsheet |
| ROUND | ARRONDI | `ARRONDI(number; num_digits)` | JSpreadsheet |
| ROUNDDOWN | ARRONDI.INF | `ARRONDI.INF(number; num_digits)` | JSpreadsheet |
| ROUNDUP | ARRONDI.SUP | `ARRONDI.SUP(number; num_digits)` | JSpreadsheet |
| ROW | LIGNE | `LIGNE(reference)` | JSpreadsheet |
| ROWS | LIGNES | `LIGNES(array)` | JSpreadsheet |
| RRI | TAUX.INT.EQUIV | `TAUX.INT.EQUIV(nper; pv; fv)` | JSpreadsheet |
| RSQ | COEFFICIENT.DETERMINATION | `COEFFICIENT.DETERMINATION(known_y's; known_x's)` | JSpreadsheet |
| SEARCH | CHERCHE | `CHERCHE(find_text; within_text;[start_num])` | JSpreadsheet |
| SEC | SEC | `SEC(x)` | JSpreadsheet |
| SECH | SECH | `SECH(number)` | JSpreadsheet |
| SECOND | SECONDE | `SECONDE(serial_number)` | JSpreadsheet |
| SERIESSUM | SOMME.SERIES | `SOMME.SERIES(x; n; m; coefficients)` | JSpreadsheet |
| SIGN | SIGNE | `SIGNE(number)` | JSpreadsheet |
| SIN | SIN | `SIN(x)` | JSpreadsheet |
| SINH | SINH | `SINH(x)` | JSpreadsheet |
| SKEW | COEFFICIENT.ASYMETRIE | `COEFFICIENT.ASYMETRIE(number1; [number2]; ...)` | JSpreadsheet |
| SKEWP | SKEWP | `SKEWP(number1; [number2]; ...)` | JSpreadsheet |
| SLN | AMORLIN | `AMORLIN(cost; salvage; life)` | JSpreadsheet |
| SLOPE | PENTE | `PENTE(known_y's; known_x's)` | JSpreadsheet |
| SMALL | PETITE.VALEUR | `PETITE.VALEUR(arr; k)` | JSpreadsheet |
| SORT | SORT | `SORT(array; [sort_index]; [sort_order]; [by_col])` | JSpreadsheet |
| SQRT | RACINE | `RACINE(x)` | JSpreadsheet |
| SQRTPI | RACINE.PI | `RACINE.PI(x)` | JSpreadsheet |
| STANDARDIZE | CENTREE.REDUITE | `CENTREE.REDUITE(x; mean; standard_dev)` | JSpreadsheet |
| STDEV | ECARTYPE | `ECARTYPE(number1; [number2]; ...)` | JSpreadsheet |
| STDEVA | STDEVA | `STDEVA(value1; [value2]; ...)` | JSpreadsheet |
| STDEVP | ECARTYPEP | `ECARTYPEP(number1; [number2]; ...)` | JSpreadsheet |
| STDEVPA | STDEVPA | `STDEVPA(value1; [value2]; ...)` | JSpreadsheet |
| STDEVS | STDEVS | `STDEVS(number1; [number2]; ...)` | JSpreadsheet |
| STEYX | ERREUR.TYPE.XY | `ERREUR.TYPE.XY(known_y's; known_x's)` | JSpreadsheet |
| SUBSTITUTE | SUBSTITUE | `SUBSTITUE(text; old_text; new_text; [instance_num])` | JSpreadsheet |
| SUBTOTAL | SOUS.TOTAL | `SOUS.TOTAL(function_num; ref1; [ref2]; ...)` | JSpreadsheet |
| SUM | SOMME | `SOMME(nombre1; [nombre2]; …)` | JSpreadsheet |
| SUMIF | SOMME.SI | `SOMME.SI(range; criteria; [sum_range])` | JSpreadsheet |
| SUMIFS | SOMME.SI.ENS | `SOMME.SI.ENS(sum_range; criteria_range1; criteria1; [criteria_range2]; [criteria2]; ...)` | JSpreadsheet |
| SUMPRODUCT | SOMMEPROD | `SOMMEPROD(array1; [array2]; ...)` | JSpreadsheet |
| SUMSQ | SOMME.CARRES | `SOMME.CARRES(number1; [number2]; ...)` | JSpreadsheet |
| SUMX2MY2 | SOMME.X2MY2 | `SOMME.X2MY2(array_x; array_y)` | JSpreadsheet |
| SUMX2PY2 | SOMME.X2PY2 | `SOMME.X2PY2(array_x; array_y)` | JSpreadsheet |
| SUMXMY2 | SOMME.XMY2 | `SOMME.XMY2(array_x; array_y)` | JSpreadsheet |
| SWITCH | SI.MULTIPLE | `SI.MULTIPLE(expression; value1; result1; [value2]; [result2]; ... [default])` | JSpreadsheet |
| SYD | SYD | `SYD(cost; salvage; life; period)` | JSpreadsheet |
| T | T | `T(value)` | JSpreadsheet |
| TABLE | TABLE | `TABLE()` | JSpreadsheet |
| TAN | TAN | `TAN(x)` | JSpreadsheet |
| TANH | TANH | `TANH(x)` | JSpreadsheet |
| TBILLEQ | TAUX.ESCOMPTE.R | `TAUX.ESCOMPTE.R(settlement; maturity; discount)` | JSpreadsheet |
| TBILLPRICE | PRIX.BON.TRESOR | `PRIX.BON.TRESOR(settlement; maturity; discount)` | JSpreadsheet |
| TBILLYIELD | RENDEMENT.BON.TRESOR | `RENDEMENT.BON.TRESOR(settlement; maturity; price)` | JSpreadsheet |
| TDIST | LOI.STUDENT | `LOI.STUDENT(x; degrees_freedom; tails)` | JSpreadsheet |
| TDISTRT | TDISTRT | `TDISTRT(x; degrees_freedom)` | JSpreadsheet |
| TEXT | TEXTE | `TEXTE(value; format_text)` | JSpreadsheet |
| TEXTJOIN | JOINDRE.TEXTE | `JOINDRE.TEXTE(delimiter; ignore_empty; text1; [text2]; ...)` | JSpreadsheet |
| THISROWCELL | THISROWCELL | `THISROWCELL(column_index)` | JSpreadsheet |
| TIME | TEMPS | `TEMPS(hour; minute; second)` | JSpreadsheet |
| TIMEVALUE | TEMPSVAL | `TEMPSVAL(time_text)` | JSpreadsheet |
| TINV | LOI.STUDENT.INVERSE | `LOI.STUDENT.INVERSE(probability; degrees_freedom)` | JSpreadsheet |
| TODAY | AUJOURDHUI | `AUJOURDHUI()` | JSpreadsheet |
| TRANSPOSE | TRANSPOSE | `TRANSPOSE(array)` | JSpreadsheet |
| TREND | TENDANCE | `TENDANCE(known_y's; [known_x's]; [new_x's]; [const])` | JSpreadsheet |
| TRIM | SUPPRESPACE | `SUPPRESPACE(text)` | JSpreadsheet |
| TRIMMEAN | MOYENNE.REDUITE | `MOYENNE.REDUITE(array; percent)` | JSpreadsheet |
| TRUE | VRAI | `VRAI()` | JSpreadsheet |
| TRUNC | TRONQUE | `TRONQUE(number; [num_digits])` | JSpreadsheet |
| TTEST | TEST.STUDENT | `TEST.STUDENT(array1; array2; tails; type)` | JSpreadsheet |
| TYPE | TYPE | `TYPE(value)` | JSpreadsheet |
| UNICHAR | UNICAR | `UNICAR(num)` | JSpreadsheet |
| UNICODE | UNICODE | `UNICODE(text)` | JSpreadsheet |
| UNIQUE | UNIQUE | `UNIQUE(array; [by_col]; [exactly_once])` | JSpreadsheet |
| UPPER | MAJUSCULE | `MAJUSCULE(text)` | JSpreadsheet |
| VALUE | CNUM | `CNUM(text)` | JSpreadsheet |
| VAR | VAR | `VAR(number1; [number2]; ...)` | JSpreadsheet |
| VARA | VARA | `VARA(value1; [value2]; ...)` | JSpreadsheet |
| VARP | VAR.P | `VAR.P(number1; [number2]; ...)` | JSpreadsheet |
| VARPA | VARPA | `VARPA(value1; [value2]; ...)` | JSpreadsheet |
| VARS | VARS | `VARS(number1; [number2]; ...)` | JSpreadsheet |
| VLOOKUP | RECHERCHEV | `RECHERCHEV(lookup_value; table_array; col_index_num; [range_lookup])` | JSpreadsheet |
| WEEKDAY | JOURSEM | `JOURSEM(serial_number; [return_type])` | JSpreadsheet |
| WEEKNUM | NO.SEMAINE | `NO.SEMAINE(serial_number; [return_type])` | JSpreadsheet |
| WEIBULL | LOI.WEIBULL | `LOI.WEIBULL(x; alpha; beta; cumulative)` | JSpreadsheet |
| WEIBULLDIST | WEIBULLDIST | `WEIBULLDIST(x; alpha; beta; cumulative)` | JSpreadsheet |
| WORKDAY | SERIE.JOUR.OUVRE | `SERIE.JOUR.OUVRE(start_date; days; [holidays])` | JSpreadsheet |
| WORKDAYINTL | WORKDAYINTL | `WORKDAYINTL(start_date; days; [weekend]; [holidays])` | JSpreadsheet |
| XIRR | TRI.PAIEMENTS | `TRI.PAIEMENTS(values; dates; [guess])` | JSpreadsheet |
| XNPV | VAN.PAIEMENTS | `VAN.PAIEMENTS(rate; values; dates)` | JSpreadsheet |
| XOR | OUX | `OUX(logical1; [logical2]; ...)` | JSpreadsheet |
| YEAR | ANNEE | `ANNEE(serial_number)` | JSpreadsheet |
| YEARFRAC | FRACTION.ANNEE | `FRACTION.ANNEE(start_date; end_date; [basis])` | JSpreadsheet |
| Z | Z | `Z(…)` | Exception sans fiche |
| ZTEST | TEST.Z | `TEST.Z(array; [x]; [sigma])` | JSpreadsheet |
