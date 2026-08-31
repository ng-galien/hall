import { spreadsheetFormulaMetadata } from "./formulaMetadata.ts";

export const spreadsheetFormulaFunctions = [
  "ABS",
  "ACCRINT",
  "ACOS",
  "ACOSH",
  "ACOT",
  "ACOTH",
  "AGGREGATE",
  "AND",
  "ARABIC",
  "ASIN",
  "ASINH",
  "ATAN",
  "ATAN2",
  "ATANH",
  "AVEDEV",
  "AVERAGE",
  "AVERAGEA",
  "AVERAGEIF",
  "AVERAGEIFS",
  "BASE",
  "BESSELI",
  "BESSELJ",
  "BESSELK",
  "BESSELY",
  "BETA",
  "BETADIST",
  "BETAINV",
  "BIN2DEC",
  "BIN2HEX",
  "BIN2OCT",
  "BINOM",
  "BINOMDIST",
  "BITAND",
  "BITLSHIFT",
  "BITOR",
  "BITRSHIFT",
  "BITXOR",
  "CEILING",
  "CEILINGMATH",
  "CEILINGPRECISE",
  "CELL",
  "CHAR",
  "CHIDIST",
  "CHIDISTRT",
  "CHIINV",
  "CHIINVRT",
  "CHISQ",
  "CHITEST",
  "CHOOSE",
  "CLEAN",
  "CODE",
  "COL",
  "COLUMN",
  "COLUMNS",
  "COMBIN",
  "COMBINA",
  "COMPLEX",
  "CONCAT",
  "CONCATENATE",
  "CONFIDENCE",
  "CONVERT",
  "CORREL",
  "COS",
  "COSH",
  "COT",
  "COTH",
  "COUNT",
  "COUNTA",
  "COUNTBLANK",
  "COUNTIF",
  "COUNTIFS",
  "COVAR",
  "COVARIANCE",
  "COVARIANCEP",
  "COVARIANCES",
  "CRITBINOM",
  "CSC",
  "CSCH",
  "CUMIPMT",
  "CUMPRINC",
  "DATE",
  "DATEDIF",
  "DATEVALUE",
  "DAVERAGE",
  "DAY",
  "DAYS",
  "DAYS360",
  "DB",
  "DCOUNT",
  "DCOUNTA",
  "DDB",
  "DEC2BIN",
  "DEC2HEX",
  "DEC2OCT",
  "DECIMAL",
  "DEGREES",
  "DELTA",
  "DEVSQ",
  "DGET",
  "DISC",
  "DMAX",
  "DMIN",
  "DOLLAR",
  "DOLLARDE",
  "DOLLARFR",
  "DPRODUCT",
  "DSTDEV",
  "DSTDEVP",
  "DSUM",
  "DVAR",
  "DVARP",
  "EDATE",
  "EFFECT",
  "EOMONTH",
  "ERF",
  "ERFC",
  "ERROR",
  "EVEN",
  "EXACT",
  "EXP",
  "EXPON",
  "EXPONDIST",
  "F",
  "FACT",
  "FACTDOUBLE",
  "FALSE",
  "FDIST",
  "FDISTRT",
  "FIND",
  "FINV",
  "FINVRT",
  "FISHER",
  "FISHERINV",
  "FIXED",
  "FLOOR",
  "FLOORMATH",
  "FLOORPRECISE",
  "FORECAST",
  "FREQUENCY",
  "FTEST",
  "FV",
  "FVSCHEDULE",
  "GAMMA",
  "GAMMADIST",
  "GAMMAINV",
  "GAMMALN",
  "GAMMALNPRECISE",
  "GAUSS",
  "GCD",
  "GEOMEAN",
  "GESTEP",
  "GROWTH",
  "HARMEAN",
  "HEX2BIN",
  "HEX2DEC",
  "HEX2OCT",
  "HLOOKUP",
  "HOUR",
  "HYPGEOM",
  "HYPGEOMDIST",
  "IF",
  "IFERROR",
  "IFNA",
  "IFS",
  "IMABS",
  "IMAGINARY",
  "IMARGUMENT",
  "IMCONJUGATE",
  "IMCOS",
  "IMCOSH",
  "IMCOT",
  "IMCSC",
  "IMCSCH",
  "IMDIV",
  "IMEXP",
  "IMLN",
  "IMLOG10",
  "IMLOG2",
  "IMPOWER",
  "IMPRODUCT",
  "IMREAL",
  "IMSEC",
  "IMSECH",
  "IMSIN",
  "IMSINH",
  "IMSQRT",
  "IMSUB",
  "IMSUM",
  "IMTAN",
  "INDEX",
  "INT",
  "INTERCEPT",
  "IPMT",
  "IRR",
  "ISBLANK",
  "ISERR",
  "ISERROR",
  "ISEVEN",
  "ISLOGICAL",
  "ISNA",
  "ISNONTEXT",
  "ISNUMBER",
  "ISO",
  "ISODD",
  "ISOWEEKNUM",
  "ISPMT",
  "ISTEXT",
  "KURT",
  "LARGE",
  "LCM",
  "LEFT",
  "LEN",
  "LINEST",
  "LN",
  "LOG",
  "LOG10",
  "LOGEST",
  "LOGINV",
  "LOGNORM",
  "LOGNORMDIST",
  "LOGNORMINV",
  "LOOKUP",
  "LOWER",
  "MATCH",
  "MAX",
  "MAXA",
  "MEDIAN",
  "MID",
  "MIN",
  "MINA",
  "MINUTE",
  "MIRR",
  "MMULT",
  "MOD",
  "MODE",
  "MODEMULT",
  "MODESNGL",
  "MONTH",
  "MROUND",
  "MULTINOMIAL",
  "MUNIT",
  "N",
  "NA",
  "NEGBINOM",
  "NEGBINOMDIST",
  "NETWORKDAYS",
  "NETWORKDAYSINTL",
  "NOMINAL",
  "NORM",
  "NORMDIST",
  "NORMINV",
  "NORMSDIST",
  "NORMSINV",
  "NOT",
  "NOW",
  "NPER",
  "NPV",
  "NUMBERVALUE",
  "OCT2BIN",
  "OCT2DEC",
  "OCT2HEX",
  "ODD",
  "OR",
  "PDURATION",
  "PEARSON",
  "PERCENTILE",
  "PERCENTILEEXC",
  "PERCENTILEINC",
  "PERCENTRANK",
  "PERCENTRANKEXC",
  "PERCENTRANKINC",
  "PERMUT",
  "PERMUTATIONA",
  "PHI",
  "PI",
  "PMT",
  "POISSON",
  "POISSONDIST",
  "POWER",
  "PPMT",
  "PRICEDISC",
  "PROB",
  "PRODUCT",
  "PROPER",
  "PV",
  "QUARTILE",
  "QUARTILEEXC",
  "QUARTILEINC",
  "QUOTIENT",
  "RADIANS",
  "RAND",
  "RANDBETWEEN",
  "RANK",
  "RANKAVG",
  "RANKEQ",
  "RATE",
  "REPLACE",
  "REPT",
  "RIGHT",
  "ROMAN",
  "ROUND",
  "ROUNDDOWN",
  "ROUNDUP",
  "ROW",
  "ROWS",
  "RRI",
  "RSQ",
  "SEARCH",
  "SEC",
  "SECH",
  "SECOND",
  "SERIESSUM",
  "SIGN",
  "SIN",
  "SINH",
  "SKEW",
  "SKEWP",
  "SLN",
  "SLOPE",
  "SMALL",
  "SORT",
  "SQRT",
  "SQRTPI",
  "STANDARDIZE",
  "STDEV",
  "STDEVA",
  "STDEVP",
  "STDEVPA",
  "STDEVS",
  "STEYX",
  "SUBSTITUTE",
  "SUBTOTAL",
  "SUM",
  "SUMIF",
  "SUMIFS",
  "SUMPRODUCT",
  "SUMSQ",
  "SUMX2MY2",
  "SUMX2PY2",
  "SUMXMY2",
  "SWITCH",
  "SYD",
  "T",
  "TABLE",
  "TAN",
  "TANH",
  "TBILLEQ",
  "TBILLPRICE",
  "TBILLYIELD",
  "TDIST",
  "TDISTRT",
  "TEXT",
  "TEXTJOIN",
  "THISROWCELL",
  "TIME",
  "TIMEVALUE",
  "TINV",
  "TODAY",
  "TRANSPOSE",
  "TREND",
  "TRIM",
  "TRIMMEAN",
  "TRUE",
  "TRUNC",
  "TTEST",
  "TYPE",
  "UNICHAR",
  "UNICODE",
  "UNIQUE",
  "UPPER",
  "VALUE",
  "VAR",
  "VARA",
  "VARP",
  "VARPA",
  "VARS",
  "VLOOKUP",
  "WEEKDAY",
  "WEEKNUM",
  "WEIBULL",
  "WEIBULLDIST",
  "WORKDAY",
  "WORKDAYINTL",
  "XIRR",
  "XNPV",
  "XOR",
  "YEAR",
  "YEARFRAC",
  "Z",
  "ZTEST"
] as const;

/** Catalogue introspected from the callable, non-stub globals installed by Formula Basic 2.0.2. */
export const spreadsheetFormulaCatalogVersion = "@jspreadsheet/formula@2.0.2";
export const spreadsheetFormulaFunctionCount = spreadsheetFormulaFunctions.length;
export const spreadsheetFormulaFrenchAliasSource = "https://fr.excel-translator.de/fonctions/";

/**
 * French Excel names cross-checked against Excel-Translator's current fr-FR table.
 * Source snapshot: https://fr.excel-translator.de/fonctions/ (2026-08-30).
 * Formula Basic-only/legacy globals with no exact Excel entry intentionally remain English-only.
 */
export const spreadsheetFormulaAliasesFrench: Readonly<Record<string, SpreadsheetFormulaFunction>> = {
  "AGREGAT": "AGGREGATE",
  "ALEA": "RAND",
  "ALEA.ENTRE.BORNES": "RANDBETWEEN",
  "AMORLIN": "SLN",
  "ANNEE": "YEAR",
  "ARRONDI": "ROUND",
  "ARRONDI.AU.MULTIPLE": "MROUND",
  "ARRONDI.INF": "ROUNDDOWN",
  "ARRONDI.SUP": "ROUNDUP",
  "AUJOURDHUI": "TODAY",
  "BDECARTYPE": "DSTDEV",
  "BDECARTYPEP": "DSTDEVP",
  "BDLIRE": "DGET",
  "BDMAX": "DMAX",
  "BDMIN": "DMIN",
  "BDMOYENNE": "DAVERAGE",
  "BDNB": "DCOUNT",
  "BDNBVAL": "DCOUNTA",
  "BDPRODUIT": "DPRODUCT",
  "BDSOMME": "DSUM",
  "BDVAR": "DVAR",
  "BDVARP": "DVARP",
  "BETA.INVERSE": "BETAINV",
  "BINDEC": "BIN2DEC",
  "BINHEX": "BIN2HEX",
  "BINOCT": "BIN2OCT",
  "BITDECALD": "BITRSHIFT",
  "BITDECALG": "BITLSHIFT",
  "BITET": "BITAND",
  "BITOU": "BITOR",
  "BITOUEXCLUSIF": "BITXOR",
  "CAR": "CHAR",
  "CELLULE": "CELL",
  "CENTILE": "PERCENTILE",
  "CENTREE.REDUITE": "STANDARDIZE",
  "CHERCHE": "SEARCH",
  "CHIFFRE.ARABE": "ARABIC",
  "CHOISIR": "CHOOSE",
  "CNUM": "VALUE",
  "COEFFICIENT.ASYMETRIE": "SKEW",
  "COEFFICIENT.CORRELATION": "CORREL",
  "COEFFICIENT.DETERMINATION": "RSQ",
  "COLONNE": "COLUMN",
  "COLONNES": "COLUMNS",
  "COMPLEXE": "COMPLEX",
  "COMPLEXE.ARGUMENT": "IMARGUMENT",
  "COMPLEXE.CONJUGUE": "IMCONJUGATE",
  "COMPLEXE.COS": "IMCOS",
  "COMPLEXE.COSH": "IMCOSH",
  "COMPLEXE.COT": "IMCOT",
  "COMPLEXE.CSC": "IMCSC",
  "COMPLEXE.CSCH": "IMCSCH",
  "COMPLEXE.DIFFERENCE": "IMSUB",
  "COMPLEXE.DIV": "IMDIV",
  "COMPLEXE.EXP": "IMEXP",
  "COMPLEXE.IMAGINAIRE": "IMAGINARY",
  "COMPLEXE.LN": "IMLN",
  "COMPLEXE.LOG10": "IMLOG10",
  "COMPLEXE.LOG2": "IMLOG2",
  "COMPLEXE.MODULE": "IMABS",
  "COMPLEXE.PRODUIT": "IMPRODUCT",
  "COMPLEXE.PUISSANCE": "IMPOWER",
  "COMPLEXE.RACINE": "IMSQRT",
  "COMPLEXE.REEL": "IMREAL",
  "COMPLEXE.SEC": "IMSEC",
  "COMPLEXE.SECH": "IMSECH",
  "COMPLEXE.SIN": "IMSIN",
  "COMPLEXE.SINH": "IMSINH",
  "COMPLEXE.SOMME": "IMSUM",
  "COMPLEXE.TAN": "IMTAN",
  "CONCATENER": "CONCATENATE",
  "CRITERE.LOI.BINOMIALE": "CRITBINOM",
  "CROISSANCE": "GROWTH",
  "CTXT": "FIXED",
  "CUMUL.INTER": "CUMIPMT",
  "CUMUL.PRINCPER": "CUMPRINC",
  "DATEVAL": "DATEVALUE",
  "DECBIN": "DEC2BIN",
  "DECHEX": "DEC2HEX",
  "DECOCT": "DEC2OCT",
  "DEGRES": "DEGREES",
  "DEVISE": "DOLLAR",
  "DROITE": "RIGHT",
  "DROITEREG": "LINEST",
  "ECART.MOYEN": "AVEDEV",
  "ECARTYPE": "STDEV",
  "ECARTYPEP": "STDEVP",
  "ENT": "INT",
  "EPURAGE": "CLEAN",
  "EQUIV": "MATCH",
  "ERREUR.TYPE.XY": "STEYX",
  "EST.IMPAIR": "ISODD",
  "EST.PAIR": "ISEVEN",
  "ESTERR": "ISERR",
  "ESTERREUR": "ISERROR",
  "ESTLOGIQUE": "ISLOGICAL",
  "ESTNA": "ISNA",
  "ESTNONTEXTE": "ISNONTEXT",
  "ESTNUM": "ISNUMBER",
  "ESTTEXTE": "ISTEXT",
  "ESTVIDE": "ISBLANK",
  "ET": "AND",
  "FAUX": "FALSE",
  "FIN.MOIS": "EOMONTH",
  "FISHER.INVERSE": "FISHERINV",
  "FRACTION.ANNEE": "YEARFRAC",
  "FREQUENCE": "FREQUENCY",
  "GAUCHE": "LEFT",
  "GRANDE.VALEUR": "LARGE",
  "HEURE": "HOUR",
  "HEXBIN": "HEX2BIN",
  "HEXDEC": "HEX2DEC",
  "HEXOCT": "HEX2OCT",
  "IMPAIR": "ODD",
  "INTERET.ACC": "ACCRINT",
  "INTERVALLE.CONFIANCE": "CONFIDENCE",
  "INTPER": "IPMT",
  "INVERSE.LOI.F": "FINV",
  "JOINDRE.TEXTE": "TEXTJOIN",
  "JOUR": "DAY",
  "JOURS": "DAYS",
  "JOURS360": "DAYS360",
  "JOURSEM": "WEEKDAY",
  "KHIDEUX.INVERSE": "CHIINV",
  "KURTOSIS": "KURT",
  "LIGNE": "ROW",
  "LIGNES": "ROWS",
  "LNGAMMA": "GAMMALN",
  "LOGREG": "LOGEST",
  "LOI.BETA": "BETADIST",
  "LOI.BINOMIALE": "BINOMDIST",
  "LOI.BINOMIALE.NEG": "NEGBINOMDIST",
  "LOI.EXPONENTIELLE": "EXPONDIST",
  "LOI.F": "FDIST",
  "LOI.GAMMA": "GAMMADIST",
  "LOI.GAMMA.INVERSE": "GAMMAINV",
  "LOI.HYPERGEOMETRIQUE": "HYPGEOMDIST",
  "LOI.KHIDEUX": "CHIDIST",
  "LOI.LOGNORMALE": "LOGNORMDIST",
  "LOI.LOGNORMALE.INVERSE": "LOGINV",
  "LOI.NORMALE": "NORMDIST",
  "LOI.NORMALE.INVERSE": "NORMINV",
  "LOI.NORMALE.STANDARD": "NORMSDIST",
  "LOI.NORMALE.STANDARD.INVERSE": "NORMSINV",
  "LOI.POISSON": "POISSON",
  "LOI.STUDENT": "TDIST",
  "LOI.STUDENT.INVERSE": "TINV",
  "LOI.WEIBULL": "WEIBULL",
  "MAINTENANT": "NOW",
  "MAJUSCULE": "UPPER",
  "MATRICE.UNITAIRE": "MUNIT",
  "MEDIANE": "MEDIAN",
  "MINUSCULE": "LOWER",
  "MOIS": "MONTH",
  "MOIS.DECALER": "EDATE",
  "MOYENNE": "AVERAGE",
  "MOYENNE.GEOMETRIQUE": "GEOMEAN",
  "MOYENNE.HARMONIQUE": "HARMEAN",
  "MOYENNE.REDUITE": "TRIMMEAN",
  "MOYENNE.SI": "AVERAGEIF",
  "MOYENNE.SI.ENS": "AVERAGEIFS",
  "MULTINOMIALE": "MULTINOMIAL",
  "NB": "COUNT",
  "NB.JOURS.OUVRES": "NETWORKDAYS",
  "NB.SI": "COUNTIF",
  "NB.SI.ENS": "COUNTIFS",
  "NB.VIDE": "COUNTBLANK",
  "NBCAR": "LEN",
  "NBVAL": "COUNTA",
  "NO.SEMAINE": "WEEKNUM",
  "NO.SEMAINE.ISO": "ISOWEEKNUM",
  "NOMPROPRE": "PROPER",
  "NON": "NOT",
  "NPM": "NPER",
  "OCTBIN": "OCT2BIN",
  "OCTDEC": "OCT2DEC",
  "OCTHEX": "OCT2HEX",
  "ORDONNEE.ORIGINE": "INTERCEPT",
  "OU": "OR",
  "OUX": "XOR",
  "PAIR": "EVEN",
  "PDUREE": "PDURATION",
  "PENTE": "SLOPE",
  "PERMUTATION": "PERMUT",
  "PETITE.VALEUR": "SMALL",
  "PGCD": "GCD",
  "PLAFOND": "CEILING",
  "PLANCHER": "FLOOR",
  "PPCM": "LCM",
  "PREVISION": "FORECAST",
  "PRINCPER": "PPMT",
  "PRIX.BON.TRESOR": "TBILLPRICE",
  "PRIX.DEC": "DOLLARDE",
  "PRIX.FRAC": "DOLLARFR",
  "PROBABILITE": "PROB",
  "PRODUIT": "PRODUCT",
  "PRODUITMAT": "MMULT",
  "PUISSANCE": "POWER",
  "RACINE": "SQRT",
  "RACINE.PI": "SQRTPI",
  "RANG": "RANK",
  "RANG.POURCENTAGE": "PERCENTRANK",
  "RECHERCHE": "LOOKUP",
  "RECHERCHEH": "HLOOKUP",
  "RECHERCHEV": "VLOOKUP",
  "REMPLACER": "REPLACE",
  "RENDEMENT.BON.TRESOR": "TBILLYIELD",
  "ROMAIN": "ROMAN",
  "SECONDE": "SECOND",
  "SERIE.JOUR.OUVRE": "WORKDAY",
  "SI": "IF",
  "SI.CONDITIONS": "IFS",
  "SI.MULTIPLE": "SWITCH",
  "SI.NON.DISP": "IFNA",
  "SIERREUR": "IFERROR",
  "SIGNE": "SIGN",
  "SOMME": "SUM",
  "SOMME.CARRES": "SUMSQ",
  "SOMME.CARRES.ECARTS": "DEVSQ",
  "SOMME.SERIES": "SERIESSUM",
  "SOMME.SI": "SUMIF",
  "SOMME.SI.ENS": "SUMIFS",
  "SOMME.X2MY2": "SUMX2MY2",
  "SOMME.X2PY2": "SUMX2PY2",
  "SOMME.XMY2": "SUMXMY2",
  "SOMMEPROD": "SUMPRODUCT",
  "SOUS.TOTAL": "SUBTOTAL",
  "STXT": "MID",
  "SUBSTITUE": "SUBSTITUTE",
  "SUP.SEUIL": "GESTEP",
  "SUPPRESPACE": "TRIM",
  "TAUX": "RATE",
  "TAUX.EFFECTIF": "EFFECT",
  "TAUX.ESCOMPTE": "DISC",
  "TAUX.ESCOMPTE.R": "TBILLEQ",
  "TAUX.INT.EQUIV": "RRI",
  "TAUX.NOMINAL": "NOMINAL",
  "TEMPS": "TIME",
  "TEMPSVAL": "TIMEVALUE",
  "TENDANCE": "TREND",
  "TEST.F": "FTEST",
  "TEST.KHIDEUX": "CHITEST",
  "TEST.STUDENT": "TTEST",
  "TEST.Z": "ZTEST",
  "TEXTE": "TEXT",
  "TRI": "IRR",
  "TRI.PAIEMENTS": "XIRR",
  "TRONQUE": "TRUNC",
  "TROUVE": "FIND",
  "UNICAR": "UNICHAR",
  "VA": "PV",
  "VALEUR.ENCAISSEMENT": "PRICEDISC",
  "VALEURNOMBRE": "NUMBERVALUE",
  "VAN": "NPV",
  "VAN.PAIEMENTS": "XNPV",
  "VAR.P": "VARP",
  "VC": "FV",
  "VC.PAIEMENTS": "FVSCHEDULE",
  "VPM": "PMT",
  "VRAI": "TRUE",
};

/** Names for which the traced fr-FR Excel table uses the canonical English spelling. */
export const spreadsheetFormulaNamesIdenticalFrench = [
  "ABS", "ACOS", "ACOSH", "ACOT", "ACOTH", "ASIN", "ASINH", "ATAN", "ATAN2", "ATANH", "AVERAGEA",
  "BASE", "BESSELI", "BESSELJ", "BESSELK", "BESSELY", "CODE", "COMBIN", "COMBINA", "CONCAT", "CONVERT",
  "COS", "COSH", "COT", "COTH", "CSC", "CSCH", "DATE", "DATEDIF", "DB", "DDB", "DECIMAL", "DELTA", "ERF",
  "ERFC", "EXACT", "EXP", "FACT", "FACTDOUBLE", "FISHER", "GAMMA", "GAUSS", "INDEX", "ISPMT", "LN", "LOG",
  "LOG10", "MAX", "MAXA", "MIN", "MINA", "MINUTE", "MOD", "MODE", "N", "NA", "PEARSON", "PERMUTATIONA",
  "PHI", "PI", "QUARTILE", "QUOTIENT", "RADIANS", "REPT", "SEC", "SECH", "SIN", "SINH", "STDEVA",
  "STDEVPA", "SYD", "T", "TAN", "TANH", "TRANSPOSE", "TYPE", "UNICODE", "VAR", "VARA", "VARPA",
] as const satisfies readonly SpreadsheetFormulaFunction[];

/**
 * Installed Formula Basic globals without an exact entry in the traced current Excel fr-FR table.
 * They are legacy dotless aliases (for example CEILINGMATH), Formula Basic shorthands, or JS-specific helpers;
 * accepting an invented French spelling would be less Excel-compatible than keeping their engine name.
 */
export const spreadsheetFormulaEnglishOnly = [
  "BETA", "BINOM", "CEILINGMATH", "CEILINGPRECISE", "CHIDISTRT", "CHIINVRT", "CHISQ", "COL", "COVAR", "COVARIANCE",
  "COVARIANCEP", "COVARIANCES", "ERROR", "EXPON", "F", "FDISTRT", "FINVRT", "FLOORMATH", "FLOORPRECISE",
  "GAMMALNPRECISE", "HYPGEOM", "ISO", "LOGNORM", "LOGNORMINV", "MODEMULT", "MODESNGL", "NEGBINOM",
  "MIRR", "NETWORKDAYSINTL", "NORM", "PERCENTILEEXC", "PERCENTILEINC", "PERCENTRANKEXC", "PERCENTRANKINC",
  "POISSONDIST", "QUARTILEEXC", "QUARTILEINC", "RANKAVG", "RANKEQ", "SKEWP", "SORT", "STDEVS", "TABLE",
  "TDISTRT", "THISROWCELL", "UNIQUE", "VARS", "WEIBULLDIST", "WORKDAYINTL", "Z",
] as const satisfies readonly SpreadsheetFormulaFunction[];

export const spreadsheetFormulaNames = [
  ...spreadsheetFormulaFunctions,
  ...Object.keys(spreadsheetFormulaAliasesFrench),
].sort();

export type SpreadsheetFormulaFunction = (typeof spreadsheetFormulaFunctions)[number];

export type SpreadsheetFormulaLocale = "fr" | "en";

const supportedFunctions = new Set<string>(spreadsheetFormulaFunctions);
const frenchNameByCanonical = new Map(
  Object.entries(spreadsheetFormulaAliasesFrench).map(([french, canonical]) => [canonical, french]),
);
export const spreadsheetFormulaNamesByLocale: Readonly<Record<SpreadsheetFormulaLocale, readonly string[]>> = {
  en: spreadsheetFormulaFunctions,
  fr: spreadsheetFormulaFunctions.map((canonical) => frenchNameByCanonical.get(canonical) ?? canonical).sort(),
};

export interface SpreadsheetFormulaHelp {
  name: string;
  signature: string;
  description: string | null;
  source: string | null;
}

const commonFormulaHelp: Partial<Record<SpreadsheetFormulaFunction, Record<SpreadsheetFormulaLocale, Omit<SpreadsheetFormulaHelp, "name">>>> = {
  SUM: {
    en: { signature: "SUM(number1, [number2], …)", description: "Adds values, cell references or ranges.", source: "https://support.microsoft.com/en-us/excel/functions/sum-function" },
    fr: { signature: "SOMME(nombre1; [nombre2]; …)", description: "Additionne des valeurs, des références de cellule ou des plages.", source: "https://support.microsoft.com/fr-fr/excel/functions/sum-function" },
  },
  AVERAGE: {
    en: { signature: "AVERAGE(number1, [number2], …)", description: "Returns the arithmetic mean of its arguments.", source: "https://support.microsoft.com/en-us/office/average-function-047bac88-d466-426c-a32b-8f33eb960cf6" },
    fr: { signature: "MOYENNE(nombre1; [nombre2]; …)", description: "Renvoie la moyenne arithmétique de ses arguments.", source: "https://support.microsoft.com/fr-fr/office/moyenne-moyenne-fonction-047bac88-d466-426c-a32b-8f33eb960cf6" },
  },
  COUNT: {
    en: { signature: "COUNT(value1, [value2], …)", description: "Counts cells that contain numbers.", source: "https://support.microsoft.com/en-us/office/count-function-a59cd7fc-b623-4d93-87a4-d23bf411294c" },
    fr: { signature: "NB(valeur1; [valeur2]; …)", description: "Compte les cellules qui contiennent des nombres.", source: "https://support.microsoft.com/fr-fr/office/nb-nb-fonction-a59cd7fc-b623-4d93-87a4-d23bf411294c" },
  },
  MAX: {
    en: { signature: "MAX(number1, [number2], …)", description: "Returns the largest value in a set of values.", source: "https://support.microsoft.com/en-us/office/max-function-e0012414-9ac8-4b34-9a47-73e662c08098" },
    fr: { signature: "MAX(nombre1; [nombre2]; …)", description: "Renvoie la plus grande valeur d’un ensemble de valeurs.", source: "https://support.microsoft.com/fr-fr/office/max-max-fonction-e0012414-9ac8-4b34-9a47-73e662c08098" },
  },
  MIN: {
    en: { signature: "MIN(number1, [number2], …)", description: "Returns the smallest value in a set of values.", source: "https://support.microsoft.com/en-us/office/min-function-61635d12-920f-4ce2-a70f-96f202dcc152" },
    fr: { signature: "MIN(nombre1; [nombre2]; …)", description: "Renvoie la plus petite valeur d’un ensemble de valeurs.", source: "https://support.microsoft.com/fr-fr/office/min-min-fonction-61635d12-920f-4ce2-a70f-96f202dcc152" },
  },
};

export function spreadsheetFormulaHelp(name: string, locale: SpreadsheetFormulaLocale): SpreadsheetFormulaHelp {
  const canonical = canonicalSpreadsheetFormulaFunction(name);
  const displayName = canonical
    ? spreadsheetFormulaNamesByLocale[locale].find((candidate) => canonicalSpreadsheetFormulaFunction(candidate) === canonical) as string
    : name.toUpperCase();
  const documented = canonical ? commonFormulaHelp[canonical as SpreadsheetFormulaFunction]?.[locale] : null;
  if (documented) return { name: displayName, ...documented };
  const metadata = canonical ? spreadsheetFormulaMetadata[canonical as keyof typeof spreadsheetFormulaMetadata] : null;
  if (metadata) return {
    name: displayName,
    signature: metadata.syntax.replace(/^[^(]+/, displayName).replaceAll(",", locale === "fr" ? ";" : ","),
    description: locale === "en" ? metadata.description : null,
    source: "https://jspreadsheet.com/jspreadsheet/formulas/g",
  };
  return { name: displayName, signature: `${displayName}(…)`, description: null, source: null };
}

export const spreadsheetFormulaMetadataMissing = [
  "BETA", "BINOM", "CHIDISTRT", "CHIINVRT", "CHISQ", "COL", "COVARIANCE", "ERROR",
  "EXPON", "F", "HYPGEOM", "ISO", "LOGNORM", "NEGBINOM", "NORM", "Z",
] as const satisfies readonly SpreadsheetFormulaFunction[];

export function canonicalSpreadsheetFormulaFunction(name: string): string | null {
  const normalized = name.toUpperCase();
  return spreadsheetFormulaAliasesFrench[normalized] ?? (supportedFunctions.has(normalized) ? normalized : null);
}

export type FormulaTokenKind =
  | "equals"
  | "function"
  | "cell"
  | "number"
  | "string"
  | "operator"
  | "punctuation"
  | "identifier"
  | "whitespace";

export interface FormulaToken {
  kind: FormulaTokenKind;
  text: string;
  supported?: boolean;
  start: number;
  end: number;
}

const cellReference = /^\$?[A-Z]{1,3}\$?\d+/i;
const numberLiteral = /^\d+(?:[.,]\d+)?/;
const identifier = /^[A-Z_][A-Z0-9_.]*/i;

export function tokenizeSpreadsheetFormula(value: string): FormulaToken[] {
  const tokens: Array<Omit<FormulaToken, "start" | "end">> = [];
  let cursor = 0;
  while (cursor < value.length) {
    const rest = value.slice(cursor);
    if (cursor === 0 && rest[0] === "=") {
      tokens.push({ kind: "equals", text: "=" });
      cursor += 1;
      continue;
    }
    const whitespace = /^\s+/.exec(rest);
    if (whitespace) {
      tokens.push({ kind: "whitespace", text: whitespace[0] });
      cursor += whitespace[0].length;
      continue;
    }
    if (rest[0] === '"') {
      let end = 1;
      while (end < rest.length) {
        if (rest[end] === '"' && rest[end + 1] === '"') end += 2;
        else if (rest[end] === '"') {
          end += 1;
          break;
        } else end += 1;
      }
      tokens.push({ kind: "string", text: rest.slice(0, end) });
      cursor += end;
      continue;
    }
    const cell = cellReference.exec(rest);
    if (cell) {
      tokens.push({ kind: "cell", text: cell[0] });
      cursor += cell[0].length;
      continue;
    }
    const numeric = numberLiteral.exec(rest);
    if (numeric) {
      tokens.push({ kind: "number", text: numeric[0] });
      cursor += numeric[0].length;
      continue;
    }
    const name = identifier.exec(rest);
    if (name) {
      const normalized = name[0].toUpperCase();
      const followedByCall = value.slice(cursor + name[0].length).trimStart().startsWith("(");
      tokens.push({
        kind: followedByCall ? "function" : "identifier",
        text: name[0],
        supported: followedByCall ? canonicalSpreadsheetFormulaFunction(normalized) !== null : undefined,
      });
      cursor += name[0].length;
      continue;
    }
    const operator = /^(?:<>|<=|>=|[+\-*/^&%=<>])/.exec(rest);
    if (operator) {
      tokens.push({ kind: "operator", text: operator[0] });
      cursor += operator[0].length;
      continue;
    }
    tokens.push({ kind: "punctuation", text: rest[0] });
    cursor += 1;
  }
  let offset = 0;
  return tokens.map((token) => {
    const start = offset;
    offset += token.text.length;
    return { ...token, start, end: offset };
  });
}

export function spreadsheetFormulaSuggestions(
  value: string,
  cursor: number,
  locale: SpreadsheetFormulaLocale,
  limit = 12,
): string[] {
  if (!value.startsWith("=")) return [];
  const prefix = /([A-Z][A-Z0-9_.]*)$/i.exec(value.slice(0, cursor))?.[1]?.toUpperCase() ?? "";
  if (!prefix) return [];
  return spreadsheetFormulaNamesByLocale[locale].filter((name) => name.startsWith(prefix)).slice(0, limit);
}

export function insertSpreadsheetFormulaFunction(
  value: string,
  cursor: number,
  name: string,
): { value: string; cursor: number } {
  const before = value.slice(0, cursor);
  const prefix = /([A-Z][A-Z0-9_.]*)$/i.exec(before)?.[1] ?? "";
  const start = cursor - prefix.length;
  const insertion = `${name}(`;
  return {
    value: value.slice(0, start) + insertion + value.slice(cursor),
    cursor: start + insertion.length,
  };
}

export function isSupportedSpreadsheetFormulaFunction(name: string): boolean {
  return canonicalSpreadsheetFormulaFunction(name) !== null;
}

export function normalizeSpreadsheetFormulaForEngine(value: string, locale: SpreadsheetFormulaLocale): string {
  const replacements = tokenizeSpreadsheetFormula(value)
    .map((token) => ({
      ...token,
      replacement:
        token.kind === "function"
          ? canonicalSpreadsheetFormulaFunction(token.text)
          : locale === "fr" && token.kind === "number" && token.text.includes(",")
            ? token.text.replace(",", ".")
          : token.kind === "punctuation" && token.text === ";"
            ? ","
            : null,
    }))
    .filter((token) => token.replacement && token.replacement !== token.text)
    .reverse();
  let normalized = value;
  for (const token of replacements)
    normalized = normalized.slice(0, token.start) + token.replacement + normalized.slice(token.end);
  return normalized;
}

/** Backward-compatible name kept inside the spreadsheet feature only. */
export const normalizeSpreadsheetFormulaFunctions = normalizeSpreadsheetFormulaForEngine;

export type SpreadsheetAutoFormulaKind = "sum" | "average" | "count" | "max" | "min";

export interface SpreadsheetSelection {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface SpreadsheetAutoFormula {
  kind: SpreadsheetAutoFormulaKind;
  target: { column: number; row: number };
  reference: string | null;
  formula: string;
}

const autoFormulaNames: Record<SpreadsheetAutoFormulaKind, Record<SpreadsheetFormulaLocale, string>> = {
  sum: { fr: "SOMME", en: "SUM" },
  average: { fr: "MOYENNE", en: "AVERAGE" },
  count: { fr: "NB", en: "COUNT" },
  max: { fr: "MAX", en: "MAX" },
  min: { fr: "MIN", en: "MIN" },
};

function formulaColumnName(column: number): string {
  let name = "";
  for (let cursor = column + 1; cursor > 0; cursor = Math.floor((cursor - 1) / 26))
    name = String.fromCharCode(65 + ((cursor - 1) % 26)) + name;
  return name;
}

function formulaCellName(column: number, row: number): string {
  return `${formulaColumnName(column)}${row + 1}`;
}

function normalizedSelection(selection: SpreadsheetSelection): SpreadsheetSelection {
  return {
    left: Math.min(selection.left, selection.right),
    top: Math.min(selection.top, selection.bottom),
    right: Math.max(selection.left, selection.right),
    bottom: Math.max(selection.top, selection.bottom),
  };
}

function formulaRange(selection: SpreadsheetSelection): string {
  const from = formulaCellName(selection.left, selection.top);
  const to = formulaCellName(selection.right, selection.bottom);
  return from === to ? from : `${from}:${to}`;
}

function hasFormulaValue(data: ReadonlyArray<ReadonlyArray<string | number | null>>, column: number, row: number): boolean {
  const value = data[row]?.[column];
  return typeof value === "number" || (typeof value === "string" && (value.startsWith("=") || value.trim() !== "" && Number.isFinite(Number(value.replace(",", ".")))));
}

export function detectAdjacentFormulaRange(
  data: ReadonlyArray<ReadonlyArray<string | number | null>>,
  column: number,
  row: number,
): SpreadsheetSelection | null {
  const directions = [
    { column: 0, row: -1 },
    { column: -1, row: 0 },
    { column: 0, row: 1 },
    { column: 1, row: 0 },
  ];
  for (const direction of directions) {
    let cursorColumn = column + direction.column;
    let cursorRow = row + direction.row;
    if (!hasFormulaValue(data, cursorColumn, cursorRow)) continue;
    const cells = [{ column: cursorColumn, row: cursorRow }];
    while (hasFormulaValue(data, cursorColumn + direction.column, cursorRow + direction.row)) {
      cursorColumn += direction.column;
      cursorRow += direction.row;
      cells.push({ column: cursorColumn, row: cursorRow });
    }
    const last = cells[cells.length - 1];
    return normalizedSelection({
      left: cells[0].column,
      top: cells[0].row,
      right: last.column,
      bottom: last.row,
    });
  }
  return null;
}

export function createSpreadsheetAutoFormula(
  data: ReadonlyArray<ReadonlyArray<string | number | null>>,
  selection: SpreadsheetSelection,
  kind: SpreadsheetAutoFormulaKind,
  locale: SpreadsheetFormulaLocale,
): SpreadsheetAutoFormula {
  const selected = normalizedSelection(selection);
  const multiple = selected.left !== selected.right || selected.top !== selected.bottom;
  const source = multiple ? selected : detectAdjacentFormulaRange(data, selected.left, selected.top);
  const target = multiple
    ? selected.bottom - selected.top >= selected.right - selected.left
      ? { column: selected.left, row: selected.bottom + 1 }
      : { column: selected.right + 1, row: selected.top }
    : { column: selected.left, row: selected.top };
  const reference = source ? formulaRange(source) : null;
  return {
    kind,
    target,
    reference,
    formula: `=${autoFormulaNames[kind][locale]}(${reference ?? ""})`,
  };
}

export function createSpreadsheetAutoFormulas(
  data: ReadonlyArray<ReadonlyArray<string | number | null>>,
  selection: SpreadsheetSelection,
  kind: SpreadsheetAutoFormulaKind,
  locale: SpreadsheetFormulaLocale,
): SpreadsheetAutoFormula[] {
  const selected = normalizedSelection(selection);
  const selectedCells: Array<{ column: number; row: number }> = [];
  for (let row = selected.top; row <= selected.bottom; row += 1)
    for (let column = selected.left; column <= selected.right; column += 1) selectedCells.push({ column, row });
  const emptyResultSelection = selectedCells.length > 1 && selectedCells.every(({ column, row }) => {
    const value = data[row]?.[column];
    return value === null || value === undefined || value === "";
  });
  if (emptyResultSelection)
    return selectedCells.map(({ column, row }) =>
      createSpreadsheetAutoFormula(data, { left: column, top: row, right: column, bottom: row }, kind, locale),
    );
  const width = selected.right - selected.left + 1;
  const height = selected.bottom - selected.top + 1;
  if (width > 1 && height > 1) {
    if (height >= width)
      return Array.from({ length: width }, (_, offset) => createSpreadsheetAutoFormula(data, {
        left: selected.left + offset, top: selected.top, right: selected.left + offset, bottom: selected.bottom,
      }, kind, locale));
    return Array.from({ length: height }, (_, offset) => createSpreadsheetAutoFormula(data, {
      left: selected.left, top: selected.top + offset, right: selected.right, bottom: selected.top + offset,
    }, kind, locale));
  }
  return [createSpreadsheetAutoFormula(data, selected, kind, locale)];
}

export interface SpreadsheetFormulaReference {
  text: string;
  start: number;
  end: number;
  kind: "cell" | "cellRange" | "columnRange" | "rowRange";
}
export interface SpreadsheetFormulaColoredReference extends SpreadsheetFormulaReference {
  colorIndex: number;
  active: boolean;
}

const formulaReferencePattern = /\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?|\$?[A-Z]{1,3}:\$?[A-Z]{1,3}|\$?\d+:\$?\d+/gi;

export function spreadsheetFormulaReferences(value: string): SpreadsheetFormulaReference[] {
  const references: SpreadsheetFormulaReference[] = [];
  for (const match of value.matchAll(formulaReferencePattern)) {
    const start = match.index;
    const text = match[0].toUpperCase();
    const previous = value.charAt(start - 1);
    const next = value.charAt(start + text.length);
    if (/[A-Z0-9_.]/i.test(previous) || /[A-Z0-9_.]/i.test(next)) continue;
    references.push({
      text,
      start,
      end: start + text.length,
      kind: /^\$?\d+:/.test(text)
        ? "rowRange"
        : /^\$?[A-Z]{1,3}:/.test(text)
          ? "columnRange"
          : text.includes(":")
            ? "cellRange"
            : "cell",
    });
  }
  return references;
}

export function activeReferenceAtCursor(value: string, cursor: number): SpreadsheetFormulaReference | null {
  return spreadsheetFormulaReferences(value).find((reference) => reference.start <= cursor && cursor <= reference.end) ?? null;
}

export function coloredSpreadsheetFormulaReferences(
  value: string,
  cursor: number,
): SpreadsheetFormulaColoredReference[] {
  return spreadsheetFormulaReferences(value).map((reference, index) => ({
    ...reference,
    colorIndex: index % 6,
    active: reference.start <= cursor && cursor <= reference.end,
  }));
}

export function replaceReferenceAtCursor(
  value: string,
  cursor: number,
  reference: string,
): { value: string; cursor: number } {
  const active = activeReferenceAtCursor(value, cursor);
  const start = active?.start ?? cursor;
  const end = active?.end ?? cursor;
  const normalized = reference.toUpperCase();
  return {
    value: value.slice(0, start) + normalized + value.slice(end),
    cursor: start + normalized.length,
  };
}

export function resizeSpreadsheetFormulaReference(
  value: string,
  referenceIndex: number,
  endCell: string,
): { value: string; cursor: number } {
  const reference = spreadsheetFormulaReferences(value)[referenceIndex];
  if (!reference) return { value, cursor: value.length };
  const normalizedEnd = endCell.toUpperCase();
  const [anchor] = reference.text.split(":");
  const endColumn = normalizedEnd.replace(/\d+$/, "");
  const endRow = normalizedEnd.replace(/^\$?[A-Z]{1,3}\$?/, "");
  const replacement = reference.kind === "columnRange"
    ? `${anchor}:${endColumn}`
    : reference.kind === "rowRange"
      ? `${anchor}:${endRow}`
      : anchor === normalizedEnd
        ? anchor
        : `${anchor}:${normalizedEnd}`;
  return {
    value: value.slice(0, reference.start) + replacement + value.slice(reference.end),
    cursor: reference.start + replacement.length,
  };
}

function spreadsheetCellCoordinates(cell: string): { column: number; row: number } | null {
  const match = /^\$?([A-Z]{1,3})\$?(\d+)$/i.exec(cell);
  if (!match) return null;
  const column = [...match[1].toUpperCase()].reduce(
    (value, character) => value * 26 + character.charCodeAt(0) - 64,
    0,
  ) - 1;
  return { column, row: Number(match[2]) - 1 };
}

export function spreadsheetFormulaReferenceIndexForCell(value: string, cell: string): number {
  const target = spreadsheetCellCoordinates(cell);
  if (!target) return -1;
  return spreadsheetFormulaReferences(value).findIndex((reference) => {
    if (reference.kind === "columnRange") {
      const [start, end] = reference.text.split(":").map((column) => spreadsheetCellCoordinates(`${column}1`)!.column);
      return Math.min(start, end) <= target.column && target.column <= Math.max(start, end);
    }
    if (reference.kind === "rowRange") {
      const [start, end] = reference.text.replaceAll("$", "").split(":").map((row) => Number(row) - 1);
      return Math.min(start, end) <= target.row && target.row <= Math.max(start, end);
    }
    const [startCell, endCell = startCell] = reference.text.split(":");
    const start = spreadsheetCellCoordinates(startCell)!;
    const end = spreadsheetCellCoordinates(endCell)!;
    return Math.min(start.column, end.column) <= target.column && target.column <= Math.max(start.column, end.column) &&
      Math.min(start.row, end.row) <= target.row && target.row <= Math.max(start.row, end.row);
  });
}

export function replaceSpreadsheetFormulaReferenceAtIndex(
  value: string,
  referenceIndex: number,
  replacement: string,
): { value: string; cursor: number } {
  const reference = spreadsheetFormulaReferences(value)[referenceIndex];
  if (!reference) return { value, cursor: value.length };
  const normalized = replacement.toUpperCase();
  return {
    value: value.slice(0, reference.start) + normalized + value.slice(reference.end),
    cursor: reference.start + normalized.length,
  };
}

export type SpreadsheetFormulaExpression =
  | { type: "literal"; value: string | number }
  | { type: "reference"; cell: string }
  | { type: "range"; from: string; to: string }
  | { type: "identifier"; name: string }
  | { type: "call"; name: string; supported: boolean; arguments: SpreadsheetFormulaExpression[] }
  | { type: "unary"; operator: string; operand: SpreadsheetFormulaExpression }
  | { type: "binary"; operator: string; left: SpreadsheetFormulaExpression; right: SpreadsheetFormulaExpression }
  | { type: "group"; expression: SpreadsheetFormulaExpression };

export interface ParsedSpreadsheetFormula {
  formula: boolean;
  expression: SpreadsheetFormulaExpression | null;
  errors: string[];
}

const binaryPrecedence: Record<string, number> = {
  "=": 1,
  "<>": 1,
  "<": 1,
  "<=": 1,
  ">": 1,
  ">=": 1,
  "&": 2,
  "+": 3,
  "-": 3,
  "*": 4,
  "/": 4,
  "%": 4,
  "^": 5,
};

export function parseSpreadsheetFormula(value: string): ParsedSpreadsheetFormula {
  const formula = value.startsWith("=");
  const tokens = tokenizeSpreadsheetFormula(value).filter((token) => token.kind !== "whitespace");
  if (tokens[0]?.kind === "equals") tokens.shift();
  const errors: string[] = [];
  let cursor = 0;
  const peek = () => tokens[cursor];
  const take = () => tokens[cursor++];
  const parsePrimary = (): SpreadsheetFormulaExpression | null => {
    const token = take();
    if (!token) return null;
    if (token.kind === "operator" && (token.text === "+" || token.text === "-")) {
      const operand = parsePrimary();
      if (!operand) {
        errors.push("Opérande manquant");
        return null;
      }
      return { type: "unary", operator: token.text, operand };
    }
    if (token.kind === "number") return { type: "literal", value: Number(token.text.replace(",", ".")) };
    if (token.kind === "string") return { type: "literal", value: token.text.slice(1, -1).replaceAll('""', '"') };
    if (token.kind === "cell") {
      if (peek()?.text === ":") {
        take();
        const end = take();
        if (end?.kind === "cell") return { type: "range", from: token.text.toUpperCase(), to: end.text.toUpperCase() };
        errors.push("Référence de fin de plage manquante");
      }
      return { type: "reference", cell: token.text.toUpperCase() };
    }
    if (token.kind === "function" || token.kind === "identifier") {
      const normalizedName = token.text.toUpperCase();
      if (peek()?.text !== "(") return { type: "identifier", name: normalizedName };
      take();
      const args: SpreadsheetFormulaExpression[] = [];
      while (peek() && peek()?.text !== ")") {
        const argument = parseBinary(0);
        if (argument) args.push(argument);
        if (peek()?.text === "," || peek()?.text === ";") take();
        else if (peek()?.text !== ")") {
          errors.push("Séparateur d’arguments attendu");
          take();
        }
      }
      if (peek()?.text === ")") take();
      else errors.push("Parenthèse fermante manquante");
      const canonical = canonicalSpreadsheetFormulaFunction(normalizedName);
      return { type: "call", name: canonical ?? normalizedName, supported: canonical !== null, arguments: args };
    }
    if (token.text === "(") {
      const expression = parseBinary(0);
      if (peek()?.text === ")") take();
      else errors.push("Parenthèse fermante manquante");
      return expression ? { type: "group", expression } : null;
    }
    errors.push(`Élément inattendu : ${token.text}`);
    return null;
  };
  const parseBinary = (minimumPrecedence: number): SpreadsheetFormulaExpression | null => {
    let left = parsePrimary();
    while (left && peek()?.kind === "operator") {
      const operator = peek()!.text;
      const precedence = binaryPrecedence[operator];
      if (precedence === undefined || precedence < minimumPrecedence) break;
      take();
      const right = parseBinary(precedence + (operator === "^" ? 0 : 1));
      if (!right) {
        errors.push("Opérande droit manquant");
        break;
      }
      left = { type: "binary", operator, left, right };
    }
    return left;
  };
  const expression = parseBinary(0);
  if (cursor < tokens.length) errors.push("Fin de formule inattendue");
  return { formula, expression, errors };
}
