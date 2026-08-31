export interface SpreadsheetFormulaMetadata {
  syntax: string;
  description: string;
  category: string;
  sourceName: string;
}

/** Snapshot from https://jspreadsheet.com/jspreadsheet/formulas/g on 2026-08-30. */
export const spreadsheetFormulaMetadata = {
  "ABS": {
    "syntax": "ABS(x)",
    "description": "Returns the absolute value of a number.",
    "category": "Math and trigonometry",
    "sourceName": "ABS"
  },
  "ACCRINT": {
    "syntax": "ACCRINT(issue, first_interest, settlement, rate, par, frequency, [basis], [calc_method])",
    "description": "Returns the accrued interest for a security that pays periodic interest.",
    "category": "Financial",
    "sourceName": "ACCRINT"
  },
  "ACOS": {
    "syntax": "ACOS(x)",
    "description": "Returns the arccosine of a number, in radians.",
    "category": "Math and trigonometry",
    "sourceName": "ACOS"
  },
  "ACOSH": {
    "syntax": "ACOSH(x)",
    "description": "Returns the inverse hyperbolic cosine of a number.",
    "category": "Math and trigonometry",
    "sourceName": "ACOSH"
  },
  "ACOT": {
    "syntax": "ACOT(x)",
    "description": "Returns the arccotangent of a number, in radians.",
    "category": "Math and trigonometry",
    "sourceName": "ACOT"
  },
  "ACOTH": {
    "syntax": "ACOTH(number)",
    "description": "Returns the inverse hyperbolic cotangent of a number.",
    "category": "Math and trigonometry",
    "sourceName": "ACOTH"
  },
  "AGGREGATE": {
    "syntax": "AGGREGATE(function_num, options, ref1, [ref2], ...)",
    "description": "Returns an aggregate calculation on a range of cells, such as AVERAGE, COUNT, MAX, MIN, etc. with the option to ignore hidden rows and error values.",
    "category": "Math and trigonometry",
    "sourceName": "AGGREGATE"
  },
  "AND": {
    "syntax": "AND(logical1, [logical2], ...)",
    "description": "Returns TRUE if all its arguments evaluate to TRUE; returns FALSE if one or more arguments evaluates to FALSE.",
    "category": "Logical",
    "sourceName": "AND"
  },
  "ARABIC": {
    "syntax": "ARABIC(text)",
    "description": "Converts a Roman numeral to an Arabic numeral.",
    "category": "Math and trigonometry",
    "sourceName": "ARABIC"
  },
  "ASIN": {
    "syntax": "ASIN(x)",
    "description": "Returns the inverse sine of a number, in radians.",
    "category": "Math and trigonometry",
    "sourceName": "ASIN"
  },
  "ASINH": {
    "syntax": "ASINH(x)",
    "description": "Returns the inverse hyperbolic sine of a number.",
    "category": "Math and trigonometry",
    "sourceName": "ASINH"
  },
  "ATAN": {
    "syntax": "ATAN(number)",
    "description": "Returns the arctangent of a number, in radians.",
    "category": "Math and trigonometry",
    "sourceName": "ATAN"
  },
  "ATAN2": {
    "syntax": "ATAN2(x_num, y_num)",
    "description": "Returns the arctangent of the specified x- and y-coordinates, in radians.",
    "category": "Math and trigonometry",
    "sourceName": "ATAN2"
  },
  "ATANH": {
    "syntax": "ATANH(x)",
    "description": "Returns the inverse hyperbolic tangent of a number.",
    "category": "Math and trigonometry",
    "sourceName": "ATANH"
  },
  "AVEDEV": {
    "syntax": "AVEDEV(number1, [number2], ...)",
    "description": "Returns the average of the absolute deviations of data points from their mean.",
    "category": "Statistical",
    "sourceName": "AVEDEV"
  },
  "AVERAGE": {
    "syntax": "AVERAGE(number1, [number2], ...)",
    "description": "Returns the average (arithmetic mean) of the arguments.",
    "category": "Statistical",
    "sourceName": "AVERAGE"
  },
  "AVERAGEA": {
    "syntax": "AVERAGEA(value1, [value2], ...)",
    "description": "Returns the average (arithmetic mean) of the arguments, including numbers, text, and logical values.",
    "category": "Statistical",
    "sourceName": "AVERAGEA"
  },
  "AVERAGEIF": {
    "syntax": "AVERAGEIF(range, criteria, [average_range])",
    "description": "Returns the average (arithmetic mean) of all cells in a range that meet a specified criteria.",
    "category": "Statistical",
    "sourceName": "AVERAGEIF"
  },
  "AVERAGEIFS": {
    "syntax": "AVERAGEIFS(average_range, criteria_range1, criteria1, [criteria_range2, criteria2], ...)",
    "description": "Returns the average (arithmetic mean) of all cells in a range that meet multiple specified criteria.",
    "category": "Statistical",
    "sourceName": "AVERAGEIFS"
  },
  "BASE": {
    "syntax": "BASE(number, radix, [min_length])",
    "description": "Converts a number from decimal to binary, octal, or hexadecimal numbering systems.",
    "category": "Math and trigonometry",
    "sourceName": "BASE"
  },
  "BESSELI": {
    "syntax": "BESSELI(x, n)",
    "description": "Returns the modified Bessel function of the first kind, I(x), for a given number x.",
    "category": "Engineering",
    "sourceName": "BESSELI"
  },
  "BESSELJ": {
    "syntax": "BESSELJ(x, n)",
    "description": "Returns the Bessel function of the first kind, J(x), for a given real or complex number x.",
    "category": "Engineering",
    "sourceName": "BESSELJ"
  },
  "BESSELK": {
    "syntax": "BESSELK(x, n)",
    "description": "Returns the modified Bessel function of the second kind, K(x), for a given real or complex number x.",
    "category": "Engineering",
    "sourceName": "BESSELK"
  },
  "BESSELY": {
    "syntax": "BESSELY(x, n)",
    "description": "Returns the Bessel function of the second kind, Y(x), for a given positive real number x.",
    "category": "Engineering",
    "sourceName": "BESSELY"
  },
  "BETADIST": {
    "syntax": "BETA.DIST(x, alpha, beta, [cumulative], [A], [B])",
    "description": "Returns the cumulative beta probability density function.",
    "category": "Compatibility",
    "sourceName": "BETA.DIST"
  },
  "BETAINV": {
    "syntax": "BETA.INV(probability, alpha, beta, [A], [B])",
    "description": "Returns the inverse of the cumulative beta probability density function.",
    "category": "Compatibility",
    "sourceName": "BETA.INV"
  },
  "BIN2DEC": {
    "syntax": "BIN2DEC(number)",
    "description": "Converts a binary number to decimal.",
    "category": "Engineering",
    "sourceName": "BIN2DEC"
  },
  "BIN2HEX": {
    "syntax": "BIN2HEX(number, [places])",
    "description": "Converts a binary number to hexadecimal.",
    "category": "Engineering",
    "sourceName": "BIN2HEX"
  },
  "BIN2OCT": {
    "syntax": "BIN2OCT(number, [places])",
    "description": "Converts a binary number to octal.",
    "category": "Engineering",
    "sourceName": "BIN2OCT"
  },
  "BINOMDIST": {
    "syntax": "BINOM.DIST(number_s, trials, probability_s, [cumulative])",
    "description": "Returns the individual term binomial distribution probability.",
    "category": "Compatibility",
    "sourceName": "BINOM.DIST"
  },
  "BITAND": {
    "syntax": "BITAND(number1, number2)",
    "description": "Returns a bitwise 'AND' of two numbers.",
    "category": "Engineering",
    "sourceName": "BITAND"
  },
  "BITLSHIFT": {
    "syntax": "BITLSHIFT(number, shift_amount)",
    "description": "Shifts bits to the left, padding with zeroes on the right.",
    "category": "Engineering",
    "sourceName": "BITLSHIFT"
  },
  "BITOR": {
    "syntax": "BITOR(number1, number2)",
    "description": "Returns a bitwise 'OR' of two numbers.",
    "category": "Engineering",
    "sourceName": "BITOR"
  },
  "BITRSHIFT": {
    "syntax": "BITRSHIFT(num, shift_amount)",
    "description": "Shifts bits to the right, padding with zeroes on the left.",
    "category": "Engineering",
    "sourceName": "BITRSHIFT"
  },
  "BITXOR": {
    "syntax": "BITXOR(number1, number2)",
    "description": "Returns a bitwise 'XOR' of two numbers.",
    "category": "Engineering",
    "sourceName": "BITXOR"
  },
  "CEILING": {
    "syntax": "CEILING(num, significance)",
    "description": "Rounds a number up to the nearest multiple of a specified value.",
    "category": "Compatibility",
    "sourceName": "CEILING"
  },
  "CEILINGMATH": {
    "syntax": "CEILING.MATH(number, [significance], [mode])",
    "description": "Rounds a number up to the nearest multiple of a specified significance, regardless of the sign of the number.",
    "category": "Math and trigonometry",
    "sourceName": "CEILING.MATH"
  },
  "CEILINGPRECISE": {
    "syntax": "CEILING.PRECISE(number, [significance])",
    "description": "Rounds a number up to the nearest multiple of a specified significance, using bankers' rounding (round half up).",
    "category": "Math and trigonometry",
    "sourceName": "CEILING.PRECISE"
  },
  "CELL": {
    "syntax": "CELL(info_type, [reference])",
    "description": "Returns information about the formatting, location, or contents of a cell.",
    "category": "Information",
    "sourceName": "CELL"
  },
  "CHAR": {
    "syntax": "CHAR(num)",
    "description": "Returns the character specified by a number.",
    "category": "Text",
    "sourceName": "CHAR"
  },
  "CHIDIST": {
    "syntax": "CHIDIST(x, degrees_freedom)",
    "description": "Returns the one-tailed probability of the chi-squared distribution.",
    "category": "Compatibility",
    "sourceName": "CHIDIST"
  },
  "CHIINV": {
    "syntax": "CHIINV(probability, degrees_freedom)",
    "description": "Returns the inverse of the one-tailed probability of the chi-squared distribution.",
    "category": "Compatibility",
    "sourceName": "CHIINV"
  },
  "CHITEST": {
    "syntax": "CHITEST(actual_range, expected_range)",
    "description": "Compares the observed and expected frequencies of categories in a contingency table to determine whether there is a significant association between the variables.",
    "category": "Compatibility",
    "sourceName": "CHITEST"
  },
  "CHOOSE": {
    "syntax": "CHOOSE(index_num, value1, [value2], ...)",
    "description": "Returns a value from a list of values based on its position in the list.",
    "category": "Lookup and reference",
    "sourceName": "CHOOSE"
  },
  "CLEAN": {
    "syntax": "CLEAN(text)",
    "description": "Removes all nonprintable characters from a text string.",
    "category": "Text",
    "sourceName": "CLEAN"
  },
  "CODE": {
    "syntax": "CODE(text)",
    "description": "Returns a numeric code for the first character in a text string.",
    "category": "Text",
    "sourceName": "CODE"
  },
  "COLUMN": {
    "syntax": "COLUMN([reference])",
    "description": "Returns the column number of a reference.",
    "category": "Lookup and reference",
    "sourceName": "COLUMN"
  },
  "COLUMNS": {
    "syntax": "COLUMNS(array)",
    "description": "Returns the number of columns in a range or array.",
    "category": "Lookup and reference",
    "sourceName": "COLUMNS"
  },
  "COMBIN": {
    "syntax": "COMBIN(number, number_chosen)",
    "description": "Returns the number of combinations for a given number of items.",
    "category": "Math and trigonometry",
    "sourceName": "COMBIN"
  },
  "COMBINA": {
    "syntax": "COMBINA(number, number_chosen)",
    "description": "Returns the number of combinations with repetitions for a given number of items.",
    "category": "Math and trigonometry",
    "sourceName": "COMBINA"
  },
  "COMPLEX": {
    "syntax": "COMPLEX(real_num, [i_num], [suffix])",
    "description": "Converts real and imaginary coefficients into a complex number in x + yi or x + yj text format.",
    "category": "Engineering",
    "sourceName": "COMPLEX"
  },
  "CONCAT": {
    "syntax": "CONCAT(text1, [text2], ...)",
    "description": "Joins two or more text strings into one string.",
    "category": "Text",
    "sourceName": "CONCAT"
  },
  "CONCATENATE": {
    "syntax": "CONCATENATE(text1, [text2], ...)",
    "description": "Joins two or more text strings into one string.",
    "category": "Text",
    "sourceName": "CONCATENATE"
  },
  "CONFIDENCE": {
    "syntax": "CONFIDENCE(alpha, standard_dev, size)",
    "description": "Returns the confidence interval for a population mean.",
    "category": "Compatibility",
    "sourceName": "CONFIDENCE"
  },
  "CONVERT": {
    "syntax": "CONVERT(number, from_unit, to_unit)",
    "description": "Converts a number from one measurement system to another.",
    "category": "Engineering",
    "sourceName": "CONVERT"
  },
  "CORREL": {
    "syntax": "CORREL(array1, array2)",
    "description": "Returns the correlation coefficient between two data sets.",
    "category": "Statistical",
    "sourceName": "CORREL"
  },
  "COS": {
    "syntax": "COS(number)",
    "description": "Returns the cosine of an angle provided in radians.",
    "category": "Math and trigonometry",
    "sourceName": "COS"
  },
  "COSH": {
    "syntax": "COSH(x)",
    "description": "Returns the hyperbolic cosine of a number.",
    "category": "Math and trigonometry",
    "sourceName": "COSH"
  },
  "COT": {
    "syntax": "COT(x)",
    "description": "Returns the cotangent of an angle provided in radians.",
    "category": "Math and trigonometry",
    "sourceName": "COT"
  },
  "COTH": {
    "syntax": "COTH(x)",
    "description": "Returns the hyperbolic cotangent of a number.",
    "category": "Math and trigonometry",
    "sourceName": "COTH"
  },
  "COUNT": {
    "syntax": "COUNT(value1, [value2], ...)",
    "description": "Counts the number of cells in a range that contain numbers.",
    "category": "Statistical",
    "sourceName": "COUNT"
  },
  "COUNTA": {
    "syntax": "COUNTA(value1, [value2], ...)",
    "description": "Counts the number of cells in a range that are not empty.",
    "category": "Statistical",
    "sourceName": "COUNTA"
  },
  "COUNTBLANK": {
    "syntax": "COUNTBLANK(range)",
    "description": "Counts the number of empty cells in a range.",
    "category": "Statistical",
    "sourceName": "COUNTBLANK"
  },
  "COUNTIF": {
    "syntax": "COUNTIF(range, criteria)",
    "description": "Counts the number of cells in a range that meet a specified criterion.",
    "category": "Statistical",
    "sourceName": "COUNTIF"
  },
  "COUNTIFS": {
    "syntax": "COUNTIFS(range1, criteria1, [range2], [criteria2], ...)",
    "description": "Counts the number of cells in a range that meet multiple specified criteria.",
    "category": "Statistical",
    "sourceName": "COUNTIFS"
  },
  "COVAR": {
    "syntax": "COVAR(array1, array2)",
    "description": "Calculates the covariance, which is a measure of how much two random variables change together, between two specified sets of data.",
    "category": "Compatibility",
    "sourceName": "COVAR"
  },
  "COVARIANCEP": {
    "syntax": "COVARIANCE.P(array1, array2)",
    "description": "Calculates the population covariance, which is a measure of how much two random variables change together, between two specified sets of data.",
    "category": "Statistical",
    "sourceName": "COVARIANCE.P"
  },
  "COVARIANCES": {
    "syntax": "COVARIANCE.S(array1, array2)",
    "description": "Calculates the sample covariance, which is an estimate of how much two random variables change together, between two specified sets of data.",
    "category": "Statistical",
    "sourceName": "COVARIANCE.S"
  },
  "CRITBINOM": {
    "syntax": "CRITBINOM(trials, probability_s, alpha)",
    "description": "Calculates the smallest value for which the cumulative binomial distribution is less than or equal to a criterion value.",
    "category": "Compatibility",
    "sourceName": "CRITBINOM"
  },
  "CSC": {
    "syntax": "CSC(angle)",
    "description": "Calculates the cosecant of an angle given in radians.",
    "category": "Math and trigonometry",
    "sourceName": "CSC"
  },
  "CSCH": {
    "syntax": "CSCH(angle)",
    "description": "Calculates the hyperbolic cosecant of an angle given in radians.",
    "category": "Math and trigonometry",
    "sourceName": "CSCH"
  },
  "CUMIPMT": {
    "syntax": "CUMIPMT(rate, nper, pv, start_period, end_period, type)",
    "description": "Returns the cumulative interest paid on a loan between two periods.",
    "category": "Financial",
    "sourceName": "CUMIPMT"
  },
  "CUMPRINC": {
    "syntax": "CUMPRINC(rate, nper, pv, start_period, end_period, type)",
    "description": "Returns the cumulative principal paid on a loan between two periods.",
    "category": "Financial",
    "sourceName": "CUMPRINC"
  },
  "DATE": {
    "syntax": "DATE(year, month, day)",
    "description": "Returns the date based on a year, month, and day.",
    "category": "Date and time",
    "sourceName": "DATE"
  },
  "DATEDIF": {
    "syntax": "DATEDIF(start_date, end_date, interval)",
    "description": "Calculates the difference between two dates based on the specified interval.",
    "category": "Date and time",
    "sourceName": "DATEDIF"
  },
  "DATEVALUE": {
    "syntax": "DATEVALUE(date_text)",
    "description": "Converts a text string that represents a date to a serial number that Excel recognizes as a date.",
    "category": "Date and time",
    "sourceName": "DATEVALUE"
  },
  "DAVERAGE": {
    "syntax": "DAVERAGE(database, field, criteria)",
    "description": "Returns the average of selected database entries based on specified criteria.",
    "category": "Database",
    "sourceName": "DAVERAGE"
  },
  "DAY": {
    "syntax": "DAY(date)",
    "description": "Returns the day of the month as a number (1-31) for a given date.",
    "category": "Date and time",
    "sourceName": "DAY"
  },
  "DAYS": {
    "syntax": "DAYS(end_date, start_date)",
    "description": "Calculates the number of days between two dates.",
    "category": "Date and time",
    "sourceName": "DAYS"
  },
  "DAYS360": {
    "syntax": "DAYS360(start_date, end_date, [method])",
    "description": "Calculates the number of days between two dates using a 360-day year.",
    "category": "Date and time",
    "sourceName": "DAYS360"
  },
  "DB": {
    "syntax": "DB(cost, salvage, life, period, [month])",
    "description": "Calculates the depreciation of an asset for a specified period using the fixed-declining balance method.",
    "category": "Financial",
    "sourceName": "DB"
  },
  "DCOUNT": {
    "syntax": "DCOUNT(database, field, criteria)",
    "description": "Counts the number of cells in a database that meet specified criteria.",
    "category": "Database",
    "sourceName": "DCOUNT"
  },
  "DCOUNTA": {
    "syntax": "DCOUNTA(database, field, criteria)",
    "description": "Counts the number of non-blank cells in a database that meet specified criteria.",
    "category": "Database",
    "sourceName": "DCOUNTA"
  },
  "DDB": {
    "syntax": "DDB(cost, salvage, life, period, [factor])",
    "description": "Calculates the depreciation of an asset for a specified period using the double-declining balance method.",
    "category": "Financial",
    "sourceName": "DDB"
  },
  "DEC2BIN": {
    "syntax": "DEC2BIN(number, [places])",
    "description": "Converts a decimal number to binary format.",
    "category": "Engineering",
    "sourceName": "DEC2BIN"
  },
  "DEC2HEX": {
    "syntax": "DEC2HEX(number, [places])",
    "description": "Converts a decimal number to hexadecimal format.",
    "category": "Engineering",
    "sourceName": "DEC2HEX"
  },
  "DEC2OCT": {
    "syntax": "DEC2OCT(number, [places])",
    "description": "Converts a decimal number to octal format.",
    "category": "Engineering",
    "sourceName": "DEC2OCT"
  },
  "DECIMAL": {
    "syntax": "DECIMAL(text, radix)",
    "description": "Converts a text representation of a number in a given base into a decimal number.",
    "category": "Math and trigonometry",
    "sourceName": "DECIMAL"
  },
  "DEGREES": {
    "syntax": "DEGREES(angle)",
    "description": "Converts radians to degrees.",
    "category": "Math and trigonometry",
    "sourceName": "DEGREES"
  },
  "DELTA": {
    "syntax": "DELTA(number1, [number2])",
    "description": "Tests whether two values are equal. Returns 1 if the values are equal, or 0 otherwise.",
    "category": "Engineering",
    "sourceName": "DELTA"
  },
  "DEVSQ": {
    "syntax": "DEVSQ(number1, [number2], ...)",
    "description": "Calculates the sum of squares of deviations from the mean of a dataset.",
    "category": "Statistical",
    "sourceName": "DEVSQ"
  },
  "DGET": {
    "syntax": "DGET(database, field, criteria)",
    "description": "Extracts a single value from a database table-like array based on specified criteria.",
    "category": "Database",
    "sourceName": "DGET"
  },
  "DISC": {
    "syntax": "DISC(settlement, maturity, price, redemption, [basis])",
    "description": "Calculates the discount rate for a security based on its price, face value, and coupon rate.",
    "category": "Financial",
    "sourceName": "DISC"
  },
  "DMAX": {
    "syntax": "DMAX(database, field, criteria)",
    "description": "Returns the maximum value from a database table-like array based on specified criteria.",
    "category": "Database",
    "sourceName": "DMAX"
  },
  "DMIN": {
    "syntax": "DMIN(database, field, criteria)",
    "description": "Returns the minimum value from a database table-like array based on specified criteria.",
    "category": "Database",
    "sourceName": "DMIN"
  },
  "DOLLAR": {
    "syntax": "DOLLAR(num, [decimals])",
    "description": "Converts a number to text using currency format with the specified number of decimal places.",
    "category": "Text",
    "sourceName": "DOLLAR"
  },
  "DOLLARDE": {
    "syntax": "DOLLARDE(decimal_dollar, fraction)",
    "description": "Converts a fractional dollar price expressed as a decimal to a fraction using the specified denominator.",
    "category": "Financial",
    "sourceName": "DOLLARDE"
  },
  "DOLLARFR": {
    "syntax": "DOLLARFR(decimal_dollar, fraction)",
    "description": "Converts a fraction to a decimal dollar value using the specified denominator.",
    "category": "Financial",
    "sourceName": "DOLLARFR"
  },
  "DPRODUCT": {
    "syntax": "DPRODUCT(database, field, criteria)",
    "description": "Returns the product of values selected from a database table-like array based on specified criteria.",
    "category": "Database",
    "sourceName": "DPRODUCT"
  },
  "DSTDEV": {
    "syntax": "DSTDEV(database, field, criteria)",
    "description": "The DSTDEV function calculates the standard deviation of a population based on a sample of that population.",
    "category": "Database",
    "sourceName": "DSTDEV"
  },
  "DSTDEVP": {
    "syntax": "DSTDEVP(database, field, criteria)",
    "description": "The DSTDEVP function calculates the standard deviation of a population.",
    "category": "Database",
    "sourceName": "DSTDEVP"
  },
  "DSUM": {
    "syntax": "DSUM(database, field, criteria)",
    "description": "The DSUM function adds the numbers in a column or database that meet specified criteria.",
    "category": "Database",
    "sourceName": "DSUM"
  },
  "DVAR": {
    "syntax": "DVAR(database, field, criteria)",
    "description": "The DVAR function estimates variance based on a sample from selected database entries.",
    "category": "Database",
    "sourceName": "DVAR"
  },
  "DVARP": {
    "syntax": "DVARP(database, field, criteria)",
    "description": "The DVARP function calculates the variance of a population.",
    "category": "Database",
    "sourceName": "DVARP"
  },
  "EDATE": {
    "syntax": "EDATE(start_date, months)",
    "description": "The EDATE function returns the date that is the specified number of months before or after the start date.",
    "category": "Date and time",
    "sourceName": "EDATE"
  },
  "EFFECT": {
    "syntax": "EFFECT(nominal_rate, npery)",
    "description": "The EFFECT function calculates the effective annual interest rate given the nominal annual interest rate and the number of compounding periods per year.",
    "category": "Financial",
    "sourceName": "EFFECT"
  },
  "EOMONTH": {
    "syntax": "EOMONTH(start_date, months)",
    "description": "The EOMONTH function returns the last day of the month that is a specified number of months before or after a given date.",
    "category": "Date and time",
    "sourceName": "EOMONTH"
  },
  "ERF": {
    "syntax": "ERF(x)",
    "description": "The ERF function returns the error function of a number.",
    "category": "Engineering",
    "sourceName": "ERF"
  },
  "ERFC": {
    "syntax": "ERFC(x)",
    "description": "The ERFC function returns the complementary error function of a number, which is equal to 1 minus the error function of the same number.",
    "category": "Engineering",
    "sourceName": "ERFC"
  },
  "EVEN": {
    "syntax": "EVEN(x)",
    "description": "The EVEN function rounds a number up to the nearest even integer.",
    "category": "Math and trigonometry",
    "sourceName": "EVEN"
  },
  "EXACT": {
    "syntax": "EXACT(text1, text2)",
    "description": "The EXACT function compares two text strings and returns TRUE if they are exactly the same, FALSE otherwise. The comparison is case-sensitive.",
    "category": "Text",
    "sourceName": "EXACT"
  },
  "EXP": {
    "syntax": "EXP(number)",
    "description": "The EXP function returns the value of e raised to a given power.",
    "category": "Math and trigonometry",
    "sourceName": "EXP"
  },
  "EXPONDIST": {
    "syntax": "EXPON.DIST(x, lambda, cumulative)",
    "description": "Returns the exponential distribution for a specified set of parameters.",
    "category": "Statistical",
    "sourceName": "EXPON.DIST"
  },
  "FACT": {
    "syntax": "FACT(x)",
    "description": "Returns the factorial of a number.",
    "category": "Math and trigonometry",
    "sourceName": "FACT"
  },
  "FACTDOUBLE": {
    "syntax": "FACTDOUBLE(number)",
    "description": "Returns the factorial of a number, multiplied by the factorial of number-2.",
    "category": "Math and trigonometry",
    "sourceName": "FACTDOUBLE"
  },
  "FALSE": {
    "syntax": "FALSE()",
    "description": "Returns the logical value 'FALSE'.",
    "category": "Logical",
    "sourceName": "FALSE"
  },
  "FDIST": {
    "syntax": "F.DIST(x, degrees_freedom1, degrees_freedom2, cumulative)",
    "description": "Returns the cumulative distribution function of the F-distribution.",
    "category": "Statistical",
    "sourceName": "F.DIST"
  },
  "FDISTRT": {
    "syntax": "F.DIST.RT(x, degrees_freedom1, degrees_freedom2)",
    "description": "Returns the right-tailed F probability distribution.",
    "category": "Statistical",
    "sourceName": "F.DIST.RT"
  },
  "FIND": {
    "syntax": "FIND(find_text, within_text, start_num)",
    "description": "Returns the position of a string within another, but allowing for case sensitivity. Search starts from the left hand side of the string.",
    "category": "Text",
    "sourceName": "FIND"
  },
  "FINV": {
    "syntax": "F.INV(probability, degrees_freedom1, degrees_freedom2)",
    "description": "Returns the inverse of the F probability distribution.",
    "category": "Statistical",
    "sourceName": "F.INV"
  },
  "FINVRT": {
    "syntax": "F.INV.RT(probability, degrees_freedom1, degrees_freedom2)",
    "description": "Returns the inverse of the right-tailed F probability distribution.",
    "category": "Statistical",
    "sourceName": "F.INV.RT"
  },
  "FISHER": {
    "syntax": "FISHER(x)",
    "description": "Returns the Fisher transformation of a specified value.",
    "category": "Statistical",
    "sourceName": "FISHER"
  },
  "FISHERINV": {
    "syntax": "FISHERINV(y)",
    "description": "Returns the inverse of the Fisher transformation on a specified value.",
    "category": "Statistical",
    "sourceName": "FISHERINV"
  },
  "FIXED": {
    "syntax": "FIXED(number, [decimals], [no_commas])",
    "description": "Rounds a number to the specified number of digits and formats the result with a fixed number of decimal places.",
    "category": "Text",
    "sourceName": "FIXED"
  },
  "FLOOR": {
    "syntax": "FLOOR(num, significance)",
    "description": "Rounds a number down to the nearest multiple of a specified factor.",
    "category": "Compatibility",
    "sourceName": "FLOOR"
  },
  "FLOORMATH": {
    "syntax": "FLOOR.MATH(number, [significance], [mode])",
    "description": "Rounds a number down to the nearest integer or to the nearest multiple of a specified factor.",
    "category": "Math and trigonometry",
    "sourceName": "FLOOR.MATH"
  },
  "FLOORPRECISE": {
    "syntax": "FLOOR.PRECISE(number, [significance])",
    "description": "Rounds a number down to the nearest integer or to the nearest multiple of a specified factor, based on a specified significance.",
    "category": "Math and trigonometry",
    "sourceName": "FLOOR.PRECISE"
  },
  "FORECAST": {
    "syntax": "FORECAST(x, known_y's, known_x's)",
    "description": "Calculates or predicts a future value by using linear regression.",
    "category": "Statistical",
    "sourceName": "FORECAST"
  },
  "FREQUENCY": {
    "syntax": "FREQUENCY(data_array, bins_array)",
    "description": "Calculates how often values occur within a range of values, and then returns a vertical array of numbers.",
    "category": "Statistical",
    "sourceName": "FREQUENCY"
  },
  "FTEST": {
    "syntax": "FTEST(array1, array2)",
    "description": "Returns the result of an F-test, which returns the two-tailed probability that the variances in two data sets are equal.",
    "category": "Statistical",
    "sourceName": "FTEST"
  },
  "FV": {
    "syntax": "FV(rate, nper, pmt, [pv], [type])",
    "description": "Calculates the future value of an investment based on a constant interest rate and periodic, constant payments.",
    "category": "Financial",
    "sourceName": "FV"
  },
  "FVSCHEDULE": {
    "syntax": "FVSCHEDULE(principal, schedule)",
    "description": "Calculates the future value of an initial principal after applying a series of compound interest rates.",
    "category": "Financial",
    "sourceName": "FVSCHEDULE"
  },
  "GAMMA": {
    "syntax": "GAMMA(number)",
    "description": "Calculates the gamma function, which is a generalization of the factorial function to real and complex numbers.",
    "category": "Statistical",
    "sourceName": "GAMMA"
  },
  "GAMMADIST": {
    "syntax": "GAMMA.DIST(x, alpha, beta, cumulative)",
    "description": "Calculates the gamma distribution, which is a continuous probability distribution that describes the shape of data that has positive skewness and a long right tail.",
    "category": "Statistical",
    "sourceName": "GAMMA.DIST"
  },
  "GAMMAINV": {
    "syntax": "GAMMAINV(probability, alpha, beta)",
    "description": "Calculates the inverse of the gamma cumulative distribution function for a specified probability and parameter values.",
    "category": "Statistical",
    "sourceName": "GAMMAINV"
  },
  "GAMMALN": {
    "syntax": "GAMMALN(number)",
    "description": "Calculates the natural logarithm of the gamma function, which is a generalization of the factorial function to real and complex numbers.",
    "category": "Statistical",
    "sourceName": "GAMMALN"
  },
  "GAMMALNPRECISE": {
    "syntax": "GAMMALN.PRECISE(x)",
    "description": "Calculates the natural logarithm of the gamma function, which is a generalization of the factorial function to real and complex numbers, using a more precise algorithm than GAMMALN.",
    "category": "Statistical",
    "sourceName": "GAMMALN.PRECISE"
  },
  "GAUSS": {
    "syntax": "GAUSS(z)",
    "description": "Returns the probability that a random variable follows a standard normal distribution.",
    "category": "Statistical",
    "sourceName": "GAUSS"
  },
  "GCD": {
    "syntax": "GCD(number1, number2,...)",
    "description": "Returns the greatest common divisor of two or more integers.",
    "category": "Math and trigonometry",
    "sourceName": "GCD"
  },
  "GEOMEAN": {
    "syntax": "GEOMEAN(number1,[number2],...)",
    "description": "Returns the geometric mean of an array or range of positive numeric data.",
    "category": "Statistical",
    "sourceName": "GEOMEAN"
  },
  "GESTEP": {
    "syntax": "GESTEP(number, step)",
    "description": "Returns a numeric value indicating whether a number is greater than a threshold value, 1 for TRUE, 0 for FALSE.",
    "category": "Engineering",
    "sourceName": "GESTEP"
  },
  "GROWTH": {
    "syntax": "GROWTH(known_y's,[known_x's],[new_x's],[const])",
    "description": "Returns an array of y-values generated by evaluating an exponential curve that fits the data points.",
    "category": "Statistical",
    "sourceName": "GROWTH"
  },
  "HARMEAN": {
    "syntax": "HARMEAN(number1, [number2],...)",
    "description": "Returns the harmonic mean of a data set.",
    "category": "Statistical",
    "sourceName": "HARMEAN"
  },
  "HEX2BIN": {
    "syntax": "HEX2BIN(number,[places])",
    "description": "Converts a hexadecimal number to binary.",
    "category": "Engineering",
    "sourceName": "HEX2BIN"
  },
  "HEX2DEC": {
    "syntax": "HEX2DEC(x)",
    "description": "Converts a hexadecimal number to decimal.",
    "category": "Engineering",
    "sourceName": "HEX2DEC"
  },
  "HEX2OCT": {
    "syntax": "HEX2OCT(number,[places])",
    "description": "Converts a hexadecimal number to octal.",
    "category": "Engineering",
    "sourceName": "HEX2OCT"
  },
  "HLOOKUP": {
    "syntax": "HLOOKUP(lookup_value,table_array,row_index_num,[range_lookup])",
    "description": "Searches for a value in the top row of a table or an array of values, and then returns a value in the same column from a row you specify.",
    "category": "Lookup and reference",
    "sourceName": "HLOOKUP"
  },
  "HOUR": {
    "syntax": "HOUR(serial_number)",
    "description": "Returns the hour component of a specific time, in numeric format.",
    "category": "Date and time",
    "sourceName": "HOUR"
  },
  "HYPGEOMDIST": {
    "syntax": "HYPGEOMDIST(sample_s, number_sample, population_s, number_pop)",
    "description": "The HYPGEOMDIST function is used to calculate the probability of a specified number of successes in a population sample, given the population size, number of successes in the population, and sample size.",
    "category": "Statistical",
    "sourceName": "HYPGEOMDIST"
  },
  "IF": {
    "syntax": "IF(logical_test, [value_if_true], [value_if_false])",
    "description": "The IF function is used to perform a logical test and return one value if the condition is true, and another value if the condition is false.",
    "category": "Logical",
    "sourceName": "IF"
  },
  "IFERROR": {
    "syntax": "IFERROR(value, value_if_error)",
    "description": "The IFERROR function is used to return a value if a formula results in error, and another value if it does not.",
    "category": "Logical",
    "sourceName": "IFERROR"
  },
  "IFNA": {
    "syntax": "IFNA(value, value_if_na)",
    "description": "The IFNA function is used to return a value if a formula returns the #N/A error, and another value if it does not.",
    "category": "Logical",
    "sourceName": "IFNA"
  },
  "IFS": {
    "syntax": "IFS(logical_test1, value_if_true1, [logical_test2, value_if_true2], ...)",
    "description": "The IFS function is used to evaluate multiple conditions and return a value that corresponds to the first true condition.",
    "category": "Logical",
    "sourceName": "IFS"
  },
  "IMABS": {
    "syntax": "IMABS(inumber)",
    "description": "The IMABS function is used to return the absolute value (magnitude) of a complex number.",
    "category": "Engineering",
    "sourceName": "IMABS"
  },
  "IMAGINARY": {
    "syntax": "IMAGINARY(inumber)",
    "description": "The IMAGINARY function is used to return the imaginary coefficient of a complex number.",
    "category": "Engineering",
    "sourceName": "IMAGINARY"
  },
  "IMARGUMENT": {
    "syntax": "IMARGUMENT(inumber)",
    "description": "The IMARGUMENT function is used to return the argument (phase angle) of a complex number in radians.",
    "category": "Engineering",
    "sourceName": "IMARGUMENT"
  },
  "IMCONJUGATE": {
    "syntax": "IMCONJUGATE(inumber)",
    "description": "The IMCONJUGATE function is used to return the complex conjugate of a complex number.",
    "category": "Engineering",
    "sourceName": "IMCONJUGATE"
  },
  "IMCOS": {
    "syntax": "IMCOS(inumber)",
    "description": "The IMCOS function is used to return the cosine of a complex number.",
    "category": "Engineering",
    "sourceName": "IMCOS"
  },
  "IMCOSH": {
    "syntax": "IMCOSH(inumber)",
    "description": "The IMCOSH function is used to return the hyperbolic cosine of a complex number.",
    "category": "Engineering",
    "sourceName": "IMCOSH"
  },
  "IMCOT": {
    "syntax": "IMCOT(inumber)",
    "description": "Returns the cotangent of a complex number in x + yi or x + yj text format.",
    "category": "Engineering",
    "sourceName": "IMCOT"
  },
  "IMCSC": {
    "syntax": "IMCSC(x)",
    "description": "Calculates the cosecant of a complex number.",
    "category": "Engineering",
    "sourceName": "IMCSC"
  },
  "IMCSCH": {
    "syntax": "IMCSCH(inumber)",
    "description": "Calculates the inverse hyperbolic cosecant of a complex number.",
    "category": "Engineering",
    "sourceName": "IMCSCH"
  },
  "IMDIV": {
    "syntax": "IMDIV(inumber1, inumber2)",
    "description": "Returns the quotient of two complex numbers.",
    "category": "Engineering",
    "sourceName": "IMDIV"
  },
  "IMEXP": {
    "syntax": "IMEXP(inumber)",
    "description": "Returns the exponential of a complex number.",
    "category": "Engineering",
    "sourceName": "IMEXP"
  },
  "IMLN": {
    "syntax": "IMLN(inumber)",
    "description": "Returns the natural logarithm of a complex number.",
    "category": "Engineering",
    "sourceName": "IMLN"
  },
  "IMLOG10": {
    "syntax": "IMLOG10(inumber)",
    "description": "Returns the base-10 logarithm of a complex number.",
    "category": "Engineering",
    "sourceName": "IMLOG10"
  },
  "IMLOG2": {
    "syntax": "IMLOG2(inumber)",
    "description": "Returns the base-2 logarithm of a complex number.",
    "category": "Engineering",
    "sourceName": "IMLOG2"
  },
  "IMPOWER": {
    "syntax": "IMPOWER(inumber, number)",
    "description": "Returns a complex number raised to a power.",
    "category": "Engineering",
    "sourceName": "IMPOWER"
  },
  "IMPRODUCT": {
    "syntax": "IMPRODUCT(inumber1, [inumber2], ...)",
    "description": "Returns the product of complex numbers.",
    "category": "Engineering",
    "sourceName": "IMPRODUCT"
  },
  "IMREAL": {
    "syntax": "IMREAL(inumber)",
    "description": "Returns the real coefficient of a complex number.",
    "category": "Engineering",
    "sourceName": "IMREAL"
  },
  "IMSEC": {
    "syntax": "IMSEC(inumber)",
    "description": "Returns the secant of a complex number.",
    "category": "Engineering",
    "sourceName": "IMSEC"
  },
  "IMSECH": {
    "syntax": "IMSECH(inumber)",
    "description": "Returns the hyperbolic secant of a complex number.",
    "category": "Engineering",
    "sourceName": "IMSECH"
  },
  "IMSIN": {
    "syntax": "IMSIN(inumber)",
    "description": "Returns the sine of a complex number.",
    "category": "Engineering",
    "sourceName": "IMSIN"
  },
  "IMSINH": {
    "syntax": "IMSINH(inumber)",
    "description": "Returns the hyperbolic sine of a complex number.",
    "category": "Engineering",
    "sourceName": "IMSINH"
  },
  "IMSQRT": {
    "syntax": "IMSQRT(inumber)",
    "description": "Returns the square root of a complex number.",
    "category": "Engineering",
    "sourceName": "IMSQRT"
  },
  "IMSUB": {
    "syntax": "IMSUB(inumber1, inumber2)",
    "description": "Returns the difference between two complex numbers.",
    "category": "Engineering",
    "sourceName": "IMSUB"
  },
  "IMSUM": {
    "syntax": "IMSUM(inumber1, [inumber2], ...)",
    "description": "Returns the sum of complex numbers.",
    "category": "Engineering",
    "sourceName": "IMSUM"
  },
  "IMTAN": {
    "syntax": "IMTAN(inumber)",
    "description": "Returns the tangent of a complex number.",
    "category": "Engineering",
    "sourceName": "IMTAN"
  },
  "INDEX": {
    "syntax": "INDEX(array, row_num, [column_num])",
    "description": "Returns a value or reference of the cell at the intersection of a particular row and column, in a given range.",
    "category": "Lookup and reference",
    "sourceName": "INDEX"
  },
  "INT": {
    "syntax": "INT(x)",
    "description": "Returns the integer part of a number by rounding down to the nearest integer.",
    "category": "Math and trigonometry",
    "sourceName": "INT"
  },
  "INTERCEPT": {
    "syntax": "INTERCEPT(known_y's, known_x's)",
    "description": "Returns the y-axis intercept of a line defined by a set of x- and y-values.",
    "category": "Statistical",
    "sourceName": "INTERCEPT"
  },
  "IPMT": {
    "syntax": "IPMT(rate, per, nper, pv, [fv], [type])",
    "description": "Returns the interest payment for a given period for an investment based on periodic, constant payments and a constant interest rate.",
    "category": "Financial",
    "sourceName": "IPMT"
  },
  "IRR": {
    "syntax": "IRR(values, [guess])",
    "description": "Calculates the internal rate of return for a series of cash flows that occur at regular intervals.",
    "category": "Financial",
    "sourceName": "IRR"
  },
  "ISBLANK": {
    "syntax": "ISBLANK(value)",
    "description": "Returns TRUE if a specified cell is empty, and FALSE otherwise.",
    "category": "Information",
    "sourceName": "ISBLANK"
  },
  "ISERR": {
    "syntax": "ISERR(value)",
    "description": "Returns TRUE if a value is any error value except #N/A, and FALSE otherwise.",
    "category": "Information",
    "sourceName": "ISERR"
  },
  "ISERROR": {
    "syntax": "ISERROR(value)",
    "description": "Returns TRUE if a value is any error value, and FALSE otherwise.",
    "category": "Information",
    "sourceName": "ISERROR"
  },
  "ISEVEN": {
    "syntax": "ISEVEN(num)",
    "description": "Checks if a given number is even and returns TRUE if the number is even, and FALSE otherwise.",
    "category": "Information",
    "sourceName": "ISEVEN"
  },
  "ISLOGICAL": {
    "syntax": "ISLOGICAL(value)",
    "description": "Checks if a given value is a logical value (TRUE or FALSE) and returns TRUE if the value is a logical value, and FALSE otherwise.",
    "category": "Information",
    "sourceName": "ISLOGICAL"
  },
  "ISNA": {
    "syntax": "ISNA(value)",
    "description": "Checks if a given value is the error value #N/A and returns TRUE if the value is #N/A, and FALSE otherwise.",
    "category": "Information",
    "sourceName": "ISNA"
  },
  "ISNONTEXT": {
    "syntax": "ISNONTEXT(value)",
    "description": "Checks if a given value is not text (any non-textual value) and returns TRUE if the value is not text, and FALSE otherwise.",
    "category": "Information",
    "sourceName": "ISNONTEXT"
  },
  "ISNUMBER": {
    "syntax": "ISNUMBER(value)",
    "description": "Checks if a given value is a number and returns TRUE if the value is a number, and FALSE otherwise.",
    "category": "Information",
    "sourceName": "ISNUMBER"
  },
  "ISODD": {
    "syntax": "ISODD(x)",
    "description": "Checks if a given number is odd and returns TRUE if the number is odd, and FALSE otherwise.",
    "category": "Information",
    "sourceName": "ISODD"
  },
  "ISOWEEKNUM": {
    "syntax": "ISOWEEKNUM(date)",
    "description": "Returns the ISO week number for a given date as an integer between 1 and 53, where week 1 is the week containing January 4.",
    "category": "Date and time",
    "sourceName": "ISOWEEKNUM"
  },
  "ISPMT": {
    "syntax": "ISPMT(rate, period, periods, principal)",
    "description": "Calculates the interest payment for a given period of an investment based on a constant interest rate.",
    "category": "Financial",
    "sourceName": "ISPMT"
  },
  "ISTEXT": {
    "syntax": "ISTEXT(value)",
    "description": "Checks if a given value is text and returns TRUE if the value is text, and FALSE otherwise.",
    "category": "Information",
    "sourceName": "ISTEXT"
  },
  "KURT": {
    "syntax": "KURT(number1, [number2], ...)",
    "description": "Returns the kurtosis of a data set, which is a measure of the peakedness or flatness of the distribution, relative to the normal distribution.",
    "category": "Statistical",
    "sourceName": "KURT"
  },
  "LARGE": {
    "syntax": "LARGE(array, k)",
    "description": "Returns the k-th largest value in a range or array of numbers.",
    "category": "Statistical",
    "sourceName": "LARGE"
  },
  "LCM": {
    "syntax": "LCM(number1, [number2], ...)",
    "description": "Returns the least common multiple of one or more integers. The least common multiple is the smallest positive integer that is a multiple of each integer in a given set.",
    "category": "Math and trigonometry",
    "sourceName": "LCM"
  },
  "LEFT": {
    "syntax": "LEFT(text, [num_chars])",
    "description": "Returns a specified number of characters from the beginning (left side) of a text string.",
    "category": "Text",
    "sourceName": "LEFT"
  },
  "LEN": {
    "syntax": "LEN(text)",
    "description": "Returns the number of characters in a text string.",
    "category": "Text",
    "sourceName": "LEN"
  },
  "LINEST": {
    "syntax": "LINEST(known_y's, [known_x's], [const], [stats])",
    "description": "Calculates the statistics for a line by fitting a straight line to a set of known data points using the least squares method.",
    "category": "Statistical",
    "sourceName": "LINEST"
  },
  "LN": {
    "syntax": "LN(x)",
    "description": "Returns the natural logarithm of a number.",
    "category": "Math and trigonometry",
    "sourceName": "LN"
  },
  "LOG": {
    "syntax": "LOG(number, [base])",
    "description": "Returns the logarithm of a number to a specified base.",
    "category": "Math and trigonometry",
    "sourceName": "LOG"
  },
  "LOG10": {
    "syntax": "LOG10(number)",
    "description": "Returns the base-10 logarithm of a number.",
    "category": "Math and trigonometry",
    "sourceName": "LOG10"
  },
  "LOGEST": {
    "syntax": "LOGEST(known_y's, [known_x's], [const], [stats])",
    "description": "Calculates an exponential curve that fits a set of data and returns an array of values that describes the curve.",
    "category": "Statistical",
    "sourceName": "LOGEST"
  },
  "LOGINV": {
    "syntax": "LOGINV(probability, mean, standard_dev)",
    "description": "Returns the inverse of the lognormal cumulative distribution function with a specified mean and standard deviation.",
    "category": "Compatibility",
    "sourceName": "LOGINV"
  },
  "LOGNORMDIST": {
    "syntax": "LOGNORM.DIST(x, mean, standard_dev, [cumulative])",
    "description": "Returns the cumulative log-normal distribution for a specified value, mean, and standard deviation.",
    "category": "Statistical",
    "sourceName": "LOGNORM.DIST"
  },
  "LOGNORMINV": {
    "syntax": "LOGNORM.INV(probability, mean, standard_dev)",
    "description": "Returns the inverse of the cumulative log-normal distribution for a specified probability, mean, and standard deviation.",
    "category": "Statistical",
    "sourceName": "LOGNORM.INV"
  },
  "LOOKUP": {
    "syntax": "LOOKUP(lookup_value, lookup_array, [result_array])",
    "description": "Searches for a value in a range or array and returns a value in the same position from a second range or array.",
    "category": "Lookup and reference",
    "sourceName": "LOOKUP"
  },
  "LOWER": {
    "syntax": "LOWER(text)",
    "description": "Converts all uppercase letters in a text string to lowercase.",
    "category": "Text",
    "sourceName": "LOWER"
  },
  "MATCH": {
    "syntax": "MATCH(lookup_value, lookup_array, [match_type])",
    "description": "Searches for a specified value in a range of cells, and returns the relative position of that value within the range.",
    "category": "Lookup and reference",
    "sourceName": "MATCH"
  },
  "MAX": {
    "syntax": "MAX(number1, [number2], ...)",
    "description": "Returns the largest value in a range of cells.",
    "category": "Statistical",
    "sourceName": "MAX"
  },
  "MAXA": {
    "syntax": "MAXA(number1, [number2], ...)",
    "description": "Returns the largest value in a range of cells or an array.",
    "category": "Statistical",
    "sourceName": "MAXA"
  },
  "MEDIAN": {
    "syntax": "MEDIAN(number1, [number2], ...)",
    "description": "Returns the median value in a range of numbers.",
    "category": "Statistical",
    "sourceName": "MEDIAN"
  },
  "MID": {
    "syntax": "MID(text, start_num, num_chars)",
    "description": "Returns a specific number of characters from a text string starting at the position you specify.",
    "category": "Text",
    "sourceName": "MID"
  },
  "MIN": {
    "syntax": "MIN(number1,[number2],...)",
    "description": "Returns the smallest number in a set of values, including numbers, arrays, and references.",
    "category": "Statistical",
    "sourceName": "MIN"
  },
  "MINA": {
    "syntax": "MINA(value1,[value2],...)",
    "description": "Returns the smallest value in a list of supplied arguments, including numbers, arrays, and references.",
    "category": "Statistical",
    "sourceName": "MINA"
  },
  "MINUTE": {
    "syntax": "MINUTE(serial_number)",
    "description": "Returns the minute of a time value. The minute is given as an integer, ranging from 0 to 59.",
    "category": "Date and time",
    "sourceName": "MINUTE"
  },
  "MIRR": {
    "syntax": "MIRR(values, finance_rate, reinvest_rate)",
    "description": "Returns the modified internal rate of return for a series of periodic cash flows, considering both cost of investment and interest on reinvestment of cash.",
    "category": "Financial",
    "sourceName": "MIRR"
  },
  "MMULT": {
    "syntax": "MMULT(array1, array2)",
    "description": "Returns the matrix product of two arrays.",
    "category": "Math and trigonometry",
    "sourceName": "MMULT"
  },
  "MOD": {
    "syntax": "MOD(num, divisor)",
    "description": "Returns the remainder after a number is divided by a divisor.",
    "category": "Math and trigonometry",
    "sourceName": "MOD"
  },
  "MODE": {
    "syntax": "MODE(number1, [number2],...)",
    "description": "Returns the most frequently occurring value in a range of data.",
    "category": "Compatibility",
    "sourceName": "MODE"
  },
  "MODEMULT": {
    "syntax": "MODE.MULT(number1,[number2],...)",
    "description": "Returns an array of the most frequently occurring values in a range of data.",
    "category": "Statistical",
    "sourceName": "MODE.MULT"
  },
  "MODESNGL": {
    "syntax": "MODE.SNGL(number1,[numberN],...)",
    "description": "Returns the most frequently occurring value in a range of data. If multiple values occur equally frequently, the function returns the first one found.",
    "category": "Statistical",
    "sourceName": "MODE.SNGL"
  },
  "MONTH": {
    "syntax": "MONTH(serial_number)",
    "description": "Returns the month of a date represented by a serial number. The month is given as an integer, ranging from 1 (January) to 12 (December).",
    "category": "Date and time",
    "sourceName": "MONTH"
  },
  "MROUND": {
    "syntax": "MROUND(num, multiple)",
    "description": "Rounds a number to the nearest multiple of another number.",
    "category": "Math and trigonometry",
    "sourceName": "MROUND"
  },
  "MULTINOMIAL": {
    "syntax": "MULTINOMIAL(number1, [number2],...)",
    "description": "Returns the multivariate factorial, which is the product of factorials of a series of numbers.",
    "category": "Math and trigonometry",
    "sourceName": "MULTINOMIAL"
  },
  "MUNIT": {
    "syntax": "MUNIT(size)",
    "description": "Returns the Unit matrix for a given size.",
    "category": "Math and trigonometry",
    "sourceName": "MUNIT"
  },
  "N": {
    "syntax": "N(value)",
    "description": "Returns a value converted to a number.",
    "category": "Information",
    "sourceName": "N"
  },
  "NA": {
    "syntax": "NA()",
    "description": "Returns the error value #N/A which means \"value not available\" or \"no value exists\".",
    "category": "Information",
    "sourceName": "NA"
  },
  "NEGBINOMDIST": {
    "syntax": "NEGBINOM.DIST(number_f, number_s, probability_s, [cumulative])",
    "description": "Returns the negative binomial distribution, which is the probability that there will be Number_f failures before the Number_s-th success, with Probability_s probability of a success.",
    "category": "Statistical",
    "sourceName": "NEGBINOM.DIST"
  },
  "NETWORKDAYS": {
    "syntax": "NETWORKDAYS(start_date, end_date, [holidays])",
    "description": "Returns the number of whole workdays between start_date and end_date using parameters to indicate which and how many days are weekend days.",
    "category": "Date and time",
    "sourceName": "NETWORKDAYS"
  },
  "NETWORKDAYSINTL": {
    "syntax": "NETWORKDAYS.INTL(start_date, end_date, [weekend], [holidays])",
    "description": "Returns the number of whole workdays between start_date and end_date using parameters to indicate which and how many days are weekend days, and a given set of holidays.",
    "category": "Date and time",
    "sourceName": "NETWORKDAYS.INTL"
  },
  "NOMINAL": {
    "syntax": "NOMINAL(effective_rate, npery)",
    "description": "Returns the nominal annual interest rate, given the effective rate and the number of compounding periods per year.",
    "category": "Financial",
    "sourceName": "NOMINAL"
  },
  "NORMDIST": {
    "syntax": "NORMDIST(x, mean, standard_dev, cumulative)",
    "description": "Returns the normal distribution for the specified mean and standard deviation.",
    "category": "Statistical",
    "sourceName": "NORMDIST"
  },
  "NORMINV": {
    "syntax": "NORMINV(probability, mean, standard_dev)",
    "description": "Returns the inverse of the normal cumulative distribution for a specified mean and standard deviation.",
    "category": "Statistical",
    "sourceName": "NORMINV"
  },
  "NORMSDIST": {
    "syntax": "NORM.S.DIST(z, [cumulative])",
    "description": "Returns the standard normal cumulative distribution function.",
    "category": "Statistical",
    "sourceName": "NORM.S.DIST"
  },
  "NORMSINV": {
    "syntax": "NORM.S.INV(probability)",
    "description": "Returns the inverse of the standard normal cumulative distribution.",
    "category": "Statistical",
    "sourceName": "NORM.S.INV"
  },
  "NOT": {
    "syntax": "NOT(logical)",
    "description": "Returns the opposite of a logical value, i.e., returns true if the value is false, and false if the value is true.",
    "category": "Logical",
    "sourceName": "NOT"
  },
  "NOW": {
    "syntax": "NOW()",
    "description": "Returns the current date and time as a date/time value.",
    "category": "Date and time",
    "sourceName": "NOW"
  },
  "NPER": {
    "syntax": "NPER(rate, payment, present_value, [future_value], [type])",
    "description": "Calculates the number of payment periods for an investment based on a constant interest rate and periodic payments.",
    "category": "Financial",
    "sourceName": "NPER"
  },
  "NPV": {
    "syntax": "NPV(rate, value1, [value2], ...)",
    "description": "Calculates the net present value of an investment based on a series of future cash flows and a discount rate.",
    "category": "Financial",
    "sourceName": "NPV"
  },
  "NUMBERVALUE": {
    "syntax": "NUMBERVALUE(text, [decimal_separator], [group_separator])",
    "description": "Converts text to a number in a locale-independent way.",
    "category": "Text",
    "sourceName": "NUMBERVALUE"
  },
  "OCT2BIN": {
    "syntax": "OCT2BIN(num, [places])",
    "description": "Converts a octal number to binary.",
    "category": "Engineering",
    "sourceName": "OCT2BIN"
  },
  "OCT2DEC": {
    "syntax": "OCT2DEC(number)",
    "description": "Converts a octal number to decimal.",
    "category": "Engineering",
    "sourceName": "OCT2DEC"
  },
  "OCT2HEX": {
    "syntax": "OCT2HEX(num, [places])",
    "description": "Converts a octal number to hexadecimal.",
    "category": "Engineering",
    "sourceName": "OCT2HEX"
  },
  "ODD": {
    "syntax": "ODD(x)",
    "description": "Rounds a number up to the nearest odd integer.",
    "category": "Math and trigonometry",
    "sourceName": "ODD"
  },
  "OR": {
    "syntax": "OR(logical1, [logical2], ...)",
    "description": "Returns true if any argument is true, and false otherwise.",
    "category": "Logical",
    "sourceName": "OR"
  },
  "PDURATION": {
    "syntax": "PDURATION(rate, pv, fv)",
    "description": "Calculates the duration of a security with periodic interest payments.",
    "category": "Financial",
    "sourceName": "PDURATION"
  },
  "PEARSON": {
    "syntax": "PEARSON(array1, array2)",
    "description": "Returns the Pearson product moment correlation coefficient between two data sets.",
    "category": "Statistical",
    "sourceName": "PEARSON"
  },
  "PERCENTILE": {
    "syntax": "PERCENTILE(array, k)",
    "description": "Returns the k-th percentile of values in a range, where k is in the range 0..1, inclusive. If the data set has a small sample size or if k = 0 or k = 1, use PERCENTILE.INC instead.",
    "category": "Compatibility",
    "sourceName": "PERCENTILE"
  },
  "PERCENTILEEXC": {
    "syntax": "PERCENTILE.EXC(array, k)",
    "description": "Returns the k-th percentile of values in a range, where k is in the range 0..1, exclusive.",
    "category": "Statistical",
    "sourceName": "PERCENTILE.EXC"
  },
  "PERCENTILEINC": {
    "syntax": "PERCENTILE.INC(array, k)",
    "description": "Returns the k-th percentile of values in a range, where k is in the range 0..1, inclusive.",
    "category": "Statistical",
    "sourceName": "PERCENTILE.INC"
  },
  "PERCENTRANK": {
    "syntax": "PERCENTRANK(array, x, [significance])",
    "description": "Returns the rank of a value in a data set as a percentage (0..1, inclusive) of the data set. If the data set has a small sample size, use PERCENTRANK.INC instead.",
    "category": "Compatibility",
    "sourceName": "PERCENTRANK"
  },
  "PERCENTRANKEXC": {
    "syntax": "PERCENTRANK.EXC(array, x, [significance])",
    "description": "Returns the rank of a value in a data set as a percentage (0..1, exclusive) of the data set.",
    "category": "Statistical",
    "sourceName": "PERCENTRANK.EXC"
  },
  "PERCENTRANKINC": {
    "syntax": "PERCENTRANK.INC(array, x, [significance])",
    "description": "Returns the rank of a value in a data set as a percentage (0..1, inclusive) of the data set.",
    "category": "Statistical",
    "sourceName": "PERCENTRANK.INC"
  },
  "PERMUT": {
    "syntax": "PERMUT(number, number_chosen)",
    "description": "Returns the number of permutations for a given number of objects that can be selected from a set.",
    "category": "Statistical",
    "sourceName": "PERMUT"
  },
  "PERMUTATIONA": {
    "syntax": "PERMUTATIONA(number, number_chosen)",
    "description": "Returns the number of permutations for a given number of objects that can be selected from a set with repetition.",
    "category": "Statistical",
    "sourceName": "PERMUTATIONA"
  },
  "PHI": {
    "syntax": "PHI(z)",
    "description": "Returns the value of the standard normal cumulative distribution function (CDF) for a specified value.",
    "category": "Statistical",
    "sourceName": "PHI"
  },
  "PI": {
    "syntax": "PI()",
    "description": "Returns the mathematical constant pi, accurate to 15 digits.",
    "category": "Math and trigonometry",
    "sourceName": "PI"
  },
  "PMT": {
    "syntax": "PMT(rate, nper, pv, [fv], [type])",
    "description": "Calculates the payment for a loan based on constant payments and a constant interest rate.",
    "category": "Financial",
    "sourceName": "PMT"
  },
  "POISSON": {
    "syntax": "POISSON(x, mean, [cumulative])",
    "description": "Calculates the Poisson distribution probability mass function.",
    "category": "Compatibility",
    "sourceName": "POISSON"
  },
  "POISSONDIST": {
    "syntax": "POISSON.DIST(x, mean, cumulative)",
    "description": "Returns the Poisson distribution, which is a statistical measure that shows how many times an event is likely to occur within a specified period of time.",
    "category": "Statistical",
    "sourceName": "POISSON.DIST"
  },
  "POWER": {
    "syntax": "POWER(number, power)",
    "description": "Returns the result of a number raised to a power.",
    "category": "Math and trigonometry",
    "sourceName": "POWER"
  },
  "PPMT": {
    "syntax": "PPMT(rate, per, nper, pv, [fv], [type])",
    "description": "Calculates the payment on the principal for a given investment based on constant-amount periodic payments and a constant interest rate.",
    "category": "Financial",
    "sourceName": "PPMT"
  },
  "PRICEDISC": {
    "syntax": "PRICEDISC(settlement, maturity, discount, redemption, [basis])",
    "description": "Returns the price per $100 face value of a discounted security.",
    "category": "Financial",
    "sourceName": "PRICEDISC"
  },
  "PROB": {
    "syntax": "PROB(range, probability, [lower], [upper])",
    "description": "Returns the probability of an outcome occurring given a range of values and associated probabilities.",
    "category": "Statistical",
    "sourceName": "PROB"
  },
  "PRODUCT": {
    "syntax": "PRODUCT(number1, [number2], ...)",
    "description": "Returns the product of all values in a given range of cells.",
    "category": "Math and trigonometry",
    "sourceName": "PRODUCT"
  },
  "PROPER": {
    "syntax": "PROPER(text)",
    "description": "Capitalizes the first letter of each word in a text string and sets all other letters to lowercase.",
    "category": "Text",
    "sourceName": "PROPER"
  },
  "PV": {
    "syntax": "PV(rate, nper, pmt, [fv], [type])",
    "description": "Calculates the present value of an investment or loan based on a constant interest rate and future payments or receipts.",
    "category": "Financial",
    "sourceName": "PV"
  },
  "QUARTILE": {
    "syntax": "QUARTILE(array, quart)",
    "description": "Calculates the quartile of a dataset, which is a value that separates the lowest 25% from the highest 75% of values.",
    "category": "Compatibility",
    "sourceName": "QUARTILE"
  },
  "QUARTILEEXC": {
    "syntax": "QUARTILE.EXC(array, quart)",
    "description": "Calculates the exclusive quartile of a dataset, which is a value that separates the lowest 25% from the highest 75% of values. This function uses a slightly different calculation than the QUARTILE function.",
    "category": "Statistical",
    "sourceName": "QUARTILE.EXC"
  },
  "QUARTILEINC": {
    "syntax": "QUARTILE.INC(array, quart)",
    "description": "Calculates the inclusive quartile of a dataset, which is a value that separates the lowest 25% from the highest 75% of values. This function uses a slightly different calculation than the QUARTILE function.",
    "category": "Statistical",
    "sourceName": "QUARTILE.INC"
  },
  "QUOTIENT": {
    "syntax": "QUOTIENT(numerator, denominator)",
    "description": "Returns the integer portion of a division operation. It discards the remainder and returns only the whole number that divides evenly into the dividend.",
    "category": "Math and trigonometry",
    "sourceName": "QUOTIENT"
  },
  "RADIANS": {
    "syntax": "RADIANS(angle)",
    "description": "Converts degrees into radians. One radian is equal to the angle made at the center of a circle by an arc whose length is equal to the radius of the circle.",
    "category": "Math and trigonometry",
    "sourceName": "RADIANS"
  },
  "RAND": {
    "syntax": "RAND()",
    "description": "Generates a random decimal number between 0 and 1. The value of the number changes each time the worksheet is calculated or when the function is recalculated by pressing F9.",
    "category": "Math and trigonometry",
    "sourceName": "RAND"
  },
  "RANDBETWEEN": {
    "syntax": "RANDBETWEEN(bottom, top)",
    "description": "Generates a random integer between two specified numbers (inclusive). The value of the number changes each time the worksheet is calculated or when the function is recalculated by pressing F9.",
    "category": "Math and trigonometry",
    "sourceName": "RANDBETWEEN"
  },
  "RANK": {
    "syntax": "RANK(number,ref,[order])",
    "description": "Returns the rank of a number in a list of numbers. The rank of a number is its size relative to other values in a list. If two or more values have the same rank, the highest rank is assigned to all of them and the next rank(s) is skipped.",
    "category": "Compatibility",
    "sourceName": "RANK"
  },
  "RANKAVG": {
    "syntax": "RANK.AVG(number, ref, [order])",
    "description": "Returns the rank of a specified value in a dataset, with ties receiving an average rank. The returned rank is based on the order of values in the array or range, with the largest value receiving a rank of 1.",
    "category": "Statistical",
    "sourceName": "RANK.AVG"
  },
  "RANKEQ": {
    "syntax": "RANK.EQ(number,ref,[order])",
    "description": "Returns the rank of a number in a list of numbers. The rank of a number is its size relative to other values in a list. If more than one value has the same rank, the average rank is returned.",
    "category": "Statistical",
    "sourceName": "RANK.EQ"
  },
  "RATE": {
    "syntax": "RATE(nper, pmt, pv, [fv], [type], [guess])",
    "description": "Returns the interest rate per period of an annuity.",
    "category": "Financial",
    "sourceName": "RATE"
  },
  "REPLACE": {
    "syntax": "REPLACE(old_text, start_num, num_chars, new_text)",
    "description": "Replaces a sequence of characters in a string with another set of characters.",
    "category": "Text",
    "sourceName": "REPLACE"
  },
  "REPT": {
    "syntax": "REPT(text, number_times)",
    "description": "Repeats a text string a specified number of times.",
    "category": "Text",
    "sourceName": "REPT"
  },
  "RIGHT": {
    "syntax": "RIGHT(text, number_of_characters)",
    "description": "Returns a specified number of characters from the end of a text string.",
    "category": "Text",
    "sourceName": "RIGHT"
  },
  "ROMAN": {
    "syntax": "ROMAN(number, [style])",
    "description": "Converts an Arabic numeral to a Roman numeral.",
    "category": "Math and trigonometry",
    "sourceName": "ROMAN"
  },
  "ROUND": {
    "syntax": "ROUND(number, num_digits)",
    "description": "Rounds a number to a specified number of digits.",
    "category": "Math and trigonometry",
    "sourceName": "ROUND"
  },
  "ROUNDDOWN": {
    "syntax": "ROUNDDOWN(number, num_digits)",
    "description": "Rounds a number down to a specified number of digits.",
    "category": "Math and trigonometry",
    "sourceName": "ROUNDDOWN"
  },
  "ROUNDUP": {
    "syntax": "ROUNDUP(number, num_digits)",
    "description": "Rounds a number up to a specified number of digits.",
    "category": "Math and trigonometry",
    "sourceName": "ROUNDUP"
  },
  "ROW": {
    "syntax": "ROW(reference)",
    "description": "Returns the row number of a reference.",
    "category": "Lookup and reference",
    "sourceName": "ROW"
  },
  "ROWS": {
    "syntax": "ROWS(array)",
    "description": "Returns the number of rows in a range or array.",
    "category": "Lookup and reference",
    "sourceName": "ROWS"
  },
  "RRI": {
    "syntax": "RRI(nper, pv, fv)",
    "description": "Calculates the interest rate of a fully invested security.",
    "category": "Financial",
    "sourceName": "RRI"
  },
  "RSQ": {
    "syntax": "RSQ(known_y's, known_x's)",
    "description": "Returns the square of the Pearson product moment correlation coefficient through data points in known_y's and known_x's.",
    "category": "Statistical",
    "sourceName": "RSQ"
  },
  "SEARCH": {
    "syntax": "SEARCH(find_text, within_text,[start_num])",
    "description": "Returns the starting position of a text string within another text string, starting from the leftmost character. If the text is not found, returns #VALUE!",
    "category": "Text",
    "sourceName": "SEARCH"
  },
  "SEC": {
    "syntax": "SEC(x)",
    "description": "Returns the secant of an angle specified in radians.",
    "category": "Math and trigonometry",
    "sourceName": "SEC"
  },
  "SECH": {
    "syntax": "SECH(number)",
    "description": "Returns the hyperbolic secant of a number.",
    "category": "Math and trigonometry",
    "sourceName": "SECH"
  },
  "SECOND": {
    "syntax": "SECOND(serial_number)",
    "description": "Returns the seconds of a time value.",
    "category": "Date and time",
    "sourceName": "SECOND"
  },
  "SERIESSUM": {
    "syntax": "SERIESSUM(x, n, m, coefficients)",
    "description": "Returns the sum of a power series based on the formula",
    "category": "Math and trigonometry",
    "sourceName": "SERIESSUM"
  },
  "SIGN": {
    "syntax": "SIGN(number)",
    "description": "Returns the sign of a number: 1 if the number is positive, -1 if negative, and 0 if zero.",
    "category": "Math and trigonometry",
    "sourceName": "SIGN"
  },
  "SIN": {
    "syntax": "SIN(x)",
    "description": "Returns the sine of an angle in radians.",
    "category": "Math and trigonometry",
    "sourceName": "SIN"
  },
  "SINH": {
    "syntax": "SINH(x)",
    "description": "Returns the hyperbolic sine of a number.",
    "category": "Math and trigonometry",
    "sourceName": "SINH"
  },
  "SKEW": {
    "syntax": "SKEW(number1, [number2], ...)",
    "description": "Returns the skewness of a distribution, which is a measure of asymmetry.",
    "category": "Statistical",
    "sourceName": "SKEW"
  },
  "SKEWP": {
    "syntax": "SKEW.P(number1, [number2], ...)",
    "description": "Returns the population skewness of a distribution, which is a measure of asymmetry.",
    "category": "Statistical",
    "sourceName": "SKEW.P"
  },
  "SLN": {
    "syntax": "SLN(cost, salvage, life)",
    "description": "Returns the straight-line depreciation of an asset for a single period.",
    "category": "Financial",
    "sourceName": "SLN"
  },
  "SLOPE": {
    "syntax": "SLOPE(known_y's, known_x's)",
    "description": "Returns the slope of a linear regression line that best fits a data set.",
    "category": "Statistical",
    "sourceName": "SLOPE"
  },
  "SMALL": {
    "syntax": "SMALL(arr, k)",
    "description": "Returns the k-th smallest value in a data set.",
    "category": "Statistical",
    "sourceName": "SMALL"
  },
  "SORT": {
    "syntax": "SORT(array, [sort_index], [sort_order], [by_col])",
    "description": "Returns a sorted range or array.",
    "category": "Lookup and reference",
    "sourceName": "SORT"
  },
  "SQRT": {
    "syntax": "SQRT(x)",
    "description": "Returns the positive square root of a number.",
    "category": "Math and trigonometry",
    "sourceName": "SQRT"
  },
  "SQRTPI": {
    "syntax": "SQRTPI(x)",
    "description": "Returns the positive square root of a number multiplied by pi (π).",
    "category": "Math and trigonometry",
    "sourceName": "SQRTPI"
  },
  "STANDARDIZE": {
    "syntax": "STANDARDIZE(x, mean, standard_dev)",
    "description": "Returns a normalized value (z-score) given a value, a population mean, and a standard deviation.",
    "category": "Statistical",
    "sourceName": "STANDARDIZE"
  },
  "STDEV": {
    "syntax": "STDEV(number1, [number2], ...)",
    "description": "Estimates the standard deviation of a population based on a sample of numbers.",
    "category": "Compatibility",
    "sourceName": "STDEV"
  },
  "STDEVA": {
    "syntax": "STDEVA(value1, [value2], ...)",
    "description": "Estimates the standard deviation of a population based on a sample of numbers, including text and logical values.",
    "category": "Statistical",
    "sourceName": "STDEVA"
  },
  "STDEVP": {
    "syntax": "STDEV.P(number1, [number2], ...)",
    "description": "Calculates the standard deviation of an entire population.",
    "category": "Statistical",
    "sourceName": "STDEV.P"
  },
  "STDEVPA": {
    "syntax": "STDEVPA(value1, [value2], ...)",
    "description": "Estimates the standard deviation of an entire population, including text and logical values.",
    "category": "Statistical",
    "sourceName": "STDEVPA"
  },
  "STDEVS": {
    "syntax": "STDEV.S(number1, [number2], ...)",
    "description": "Estimates the standard deviation of a population based on a sample of numbers.",
    "category": "Statistical",
    "sourceName": "STDEV.S"
  },
  "STEYX": {
    "syntax": "STEYX(known_y's, known_x's)",
    "description": "Calculates the standard error of the predicted y-value for each x in a regression.",
    "category": "Statistical",
    "sourceName": "STEYX"
  },
  "SUBSTITUTE": {
    "syntax": "SUBSTITUTE(text, old_text, new_text, [instance_num])",
    "description": "Replaces a specified occurrence of text in a string with another text.",
    "category": "Text",
    "sourceName": "SUBSTITUTE"
  },
  "SUBTOTAL": {
    "syntax": "SUBTOTAL(function_num, ref1, [ref2], ...)",
    "description": "Returns a subtotal for a range using a specified aggregation function.",
    "category": "Math and trigonometry",
    "sourceName": "SUBTOTAL"
  },
  "SUM": {
    "syntax": "SUM(number1, [number2], ...)",
    "description": "Returns the sum of a range of numbers or cells.",
    "category": "Math and trigonometry",
    "sourceName": "SUM"
  },
  "SUMIF": {
    "syntax": "SUMIF(range, criteria, [sum_range])",
    "description": "Returns the sum of a range of cells that meet a specified criteria.",
    "category": "Math and trigonometry",
    "sourceName": "SUMIF"
  },
  "SUMIFS": {
    "syntax": "SUMIFS(sum_range, criteria_range1, criteria1, [criteria_range2], [criteria2], ...)",
    "description": "Returns the sum of a range of cells that meet multiple specified criteria.",
    "category": "Math and trigonometry",
    "sourceName": "SUMIFS"
  },
  "SUMPRODUCT": {
    "syntax": "SUMPRODUCT(array1, [array2], ...)",
    "description": "Returns the sum of the products of corresponding ranges or arrays.",
    "category": "Math and trigonometry",
    "sourceName": "SUMPRODUCT"
  },
  "SUMSQ": {
    "syntax": "SUMSQ(number1, [number2], ...)",
    "description": "Returns the sum of the squares of a range of numbers or cells.",
    "category": "Math and trigonometry",
    "sourceName": "SUMSQ"
  },
  "SUMX2MY2": {
    "syntax": "SUMX2MY2(array_x, array_y)",
    "description": "Returns the sum of the difference of squares of corresponding values in two arrays or ranges.",
    "category": "Math and trigonometry",
    "sourceName": "SUMX2MY2"
  },
  "SUMX2PY2": {
    "syntax": "SUMX2PY2(array_x, array_y)",
    "description": "Returns the sum of the sum of squares of corresponding values in two arrays or ranges.",
    "category": "Math and trigonometry",
    "sourceName": "SUMX2PY2"
  },
  "SUMXMY2": {
    "syntax": "SUMXMY2(array_x, array_y)",
    "description": "Returns the sum of the squares of differences of corresponding values in two arrays or ranges.",
    "category": "Math and trigonometry",
    "sourceName": "SUMXMY2"
  },
  "SWITCH": {
    "syntax": "SWITCH(expression, value1, result1, [value2], [result2], ... [default])",
    "description": "Evaluates an expression against a list of cases and returns the result corresponding to the first matching case.",
    "category": "Logical",
    "sourceName": "SWITCH"
  },
  "SYD": {
    "syntax": "SYD(cost, salvage, life, period)",
    "description": "Returns the straight-line depreciation of an asset for a specific period using the sum-of-years digits method.",
    "category": "Financial",
    "sourceName": "SYD"
  },
  "T": {
    "syntax": "T(value)",
    "description": "Returns the one-tailed probability of a Student's t-distribution where the probability density function (pdf) is defined by the degrees of freedom.",
    "category": "Text",
    "sourceName": "T"
  },
  "TABLE": {
    "syntax": "TABLE()",
    "description": "The TABLE function is exclusive to jspreadsheet and returns the jspreadsheet object instance.",
    "category": "Jspreadsheet",
    "sourceName": "TABLE"
  },
  "TAN": {
    "syntax": "TAN(x)",
    "description": "Returns the tangent of an angle specified in radians.",
    "category": "Math and trigonometry",
    "sourceName": "TAN"
  },
  "TANH": {
    "syntax": "TANH(x)",
    "description": "Returns the hyperbolic tangent of a number.",
    "category": "Math and trigonometry",
    "sourceName": "TANH"
  },
  "TBILLEQ": {
    "syntax": "TBILLEQ(settlement, maturity, discount)",
    "description": "Calculates the bond-equivalent yield for a Treasury bill based on a discount from face value.",
    "category": "Financial",
    "sourceName": "TBILLEQ"
  },
  "TBILLPRICE": {
    "syntax": "TBILLPRICE(settlement, maturity, discount)",
    "description": "Calculates the price per $100 face value for a Treasury bill.",
    "category": "Financial",
    "sourceName": "TBILLPRICE"
  },
  "TBILLYIELD": {
    "syntax": "TBILLYIELD(settlement, maturity, price)",
    "description": "Calculates the yield of a Treasury bill based on its price.",
    "category": "Financial",
    "sourceName": "TBILLYIELD"
  },
  "TDIST": {
    "syntax": "TDIST(x, degrees_freedom, tails)",
    "description": "Calculates the probability of a Student's t-distribution with a given input value.",
    "category": "Statistical",
    "sourceName": "TDIST"
  },
  "TDISTRT": {
    "syntax": "T.DIST.RT(x, degrees_freedom)",
    "description": "Returns the right-tailed Student's t-distribution.",
    "category": "Statistical",
    "sourceName": "T.DIST.RT"
  },
  "TEXT": {
    "syntax": "TEXT(value, format_text)",
    "description": "Converts a value to text in a specified number format.",
    "category": "Text",
    "sourceName": "TEXT"
  },
  "TEXTJOIN": {
    "syntax": "TEXTJOIN(delimiter, ignore_empty, text1, [text2], ...)",
    "description": "Joins together text strings with a specified delimiter.",
    "category": "Text",
    "sourceName": "TEXTJOIN"
  },
  "THISROWCELL": {
    "syntax": "THISROWCELL(column_index)",
    "description": "The THISROWCELL function retrieves the value of a cell located in the same row as the calling cell, specified by the column index.",
    "category": "Jspreadsheet",
    "sourceName": "THISROWCELL"
  },
  "TIME": {
    "syntax": "TIME(hour, minute, second)",
    "description": "Returns a decimal value representing a specific time.",
    "category": "Date and time",
    "sourceName": "TIME"
  },
  "TIMEVALUE": {
    "syntax": "TIMEVALUE(time_text)",
    "description": "Converts a text string representing a time into a decimal value.",
    "category": "Date and time",
    "sourceName": "TIMEVALUE"
  },
  "TINV": {
    "syntax": "T.INV(probability, degrees_freedom)",
    "description": "Returns the inverse of the one-tailed probability of a Student's t-distribution.",
    "category": "Statistical",
    "sourceName": "T.INV"
  },
  "TODAY": {
    "syntax": "TODAY()",
    "description": "Returns the current date as a serial number.",
    "category": "Date and time",
    "sourceName": "TODAY"
  },
  "TRANSPOSE": {
    "syntax": "TRANSPOSE(array)",
    "description": "Returns a transposed range of cells.",
    "category": "Lookup and reference",
    "sourceName": "TRANSPOSE"
  },
  "TREND": {
    "syntax": "TREND(known_y's, [known_x's], [new_x's], [const])",
    "description": "Returns values along a linear trend.",
    "category": "Statistical",
    "sourceName": "TREND"
  },
  "TRIM": {
    "syntax": "TRIM(text)",
    "description": "Removes all spaces from text except for single spaces between words.",
    "category": "Text",
    "sourceName": "TRIM"
  },
  "TRIMMEAN": {
    "syntax": "TRIMMEAN(array, percent)",
    "description": "Returns the mean of the interior of a data set, based on a percentage you specify.",
    "category": "Statistical",
    "sourceName": "TRIMMEAN"
  },
  "TRUE": {
    "syntax": "TRUE()",
    "description": "Returns the logical value TRUE.",
    "category": "Logical",
    "sourceName": "TRUE"
  },
  "TRUNC": {
    "syntax": "TRUNC(number, [num_digits])",
    "description": "Truncates a number to a specified number of decimal places by removing the fractional part of the number.",
    "category": "Math and trigonometry",
    "sourceName": "TRUNC"
  },
  "TTEST": {
    "syntax": "TTEST(array1, array2, tails, type)",
    "description": "Returns the probability associated with a Student's t-test.",
    "category": "Statistical",
    "sourceName": "TTEST"
  },
  "TYPE": {
    "syntax": "TYPE(value)",
    "description": "Returns a number representing the data type of a value.",
    "category": "Information",
    "sourceName": "TYPE"
  },
  "UNICHAR": {
    "syntax": "UNICHAR(num)",
    "description": "Returns the Unicode character that is referenced by the given numeric value.",
    "category": "Text",
    "sourceName": "UNICHAR"
  },
  "UNICODE": {
    "syntax": "UNICODE(text)",
    "description": "Returns the Unicode value of the first character in a text string.",
    "category": "Text",
    "sourceName": "UNICODE"
  },
  "UNIQUE": {
    "syntax": "UNIQUE(array, [by_col], [exactly_once])",
    "description": "Returns a list of unique values in a range or array.",
    "category": "Lookup and reference",
    "sourceName": "UNIQUE"
  },
  "UPPER": {
    "syntax": "UPPER(text)",
    "description": "Converts all lowercase letters in a text string to uppercase.",
    "category": "Text",
    "sourceName": "UPPER"
  },
  "VALUE": {
    "syntax": "VALUE(text)",
    "description": "Converts a text string that represents a number to a number.",
    "category": "Text",
    "sourceName": "VALUE"
  },
  "VAR": {
    "syntax": "VAR(number1, [number2], ...)",
    "description": "Estimates the variance based on a sample.",
    "category": "Compatibility",
    "sourceName": "VAR"
  },
  "VARA": {
    "syntax": "VARA(value1, [value2], ...)",
    "description": "Estimates the variance based on a sample, including numbers, text, and logical values.",
    "category": "Statistical",
    "sourceName": "VARA"
  },
  "VARP": {
    "syntax": "VARP(number1, [number2], ...)",
    "description": "Calculates the variance based on an entire population. Provides a precise measure of how far the values in a population vary from the population mean.",
    "category": "Statistical",
    "sourceName": "VARP"
  },
  "VARPA": {
    "syntax": "VARPA(value1, [value2], ...)",
    "description": "Calculates the variance based on an entire population, including numbers, and logical values.",
    "category": "Statistical",
    "sourceName": "VARPA"
  },
  "VARS": {
    "syntax": "VAR.S(number1, [number2], ...)",
    "description": "Calculates the variance based on a sample. Provides an unbiased estimate of the population variance.",
    "category": "Statistical",
    "sourceName": "VAR.S"
  },
  "VLOOKUP": {
    "syntax": "VLOOKUP(lookup_value, table_array, col_index_num, [range_lookup])",
    "description": "Searches for a value in the first column of a table or range of cells, and then returns a value in the same row from a column you specify.",
    "category": "Lookup and reference",
    "sourceName": "VLOOKUP"
  },
  "WEEKDAY": {
    "syntax": "WEEKDAY(serial_number, [return_type])",
    "description": "Returns the day of the week corresponding to a given date.",
    "category": "Date and time",
    "sourceName": "WEEKDAY"
  },
  "WEEKNUM": {
    "syntax": "WEEKNUM(serial_number, [return_type])",
    "description": "Returns the week number of a given date.",
    "category": "Date and time",
    "sourceName": "WEEKNUM"
  },
  "WEIBULL": {
    "syntax": "WEIBULL(x, alpha, beta, cumulative)",
    "description": "Returns the Weibull distribution, which is often used in reliability analysis.",
    "category": "Compatibility",
    "sourceName": "WEIBULL"
  },
  "WEIBULLDIST": {
    "syntax": "WEIBULL.DIST(x, alpha, beta, cumulative)",
    "description": "Returns the Weibull distribution, which is often used in reliability analysis.",
    "category": "Statistical",
    "sourceName": "WEIBULL.DIST"
  },
  "WORKDAY": {
    "syntax": "WORKDAY(start_date, days, [holidays])",
    "description": "Returns the date that is the indicated number of working days before or after a date (the starting date).",
    "category": "Date and time",
    "sourceName": "WORKDAY"
  },
  "WORKDAYINTL": {
    "syntax": "WORKDAY.INTL(start_date, days, [weekend], [holidays])",
    "description": "Returns the date that is the indicated number of working days before or after a date (the starting date), excluding weekends and holidays.",
    "category": "Date and time",
    "sourceName": "WORKDAY.INTL"
  },
  "XIRR": {
    "syntax": "XIRR(values, dates, [guess])",
    "description": "Returns the internal rate of return for a series of cash flows, taking into account both the time value of money and the irregular intervals between cash flows.",
    "category": "Financial",
    "sourceName": "XIRR"
  },
  "XNPV": {
    "syntax": "XNPV(rate, values, dates)",
    "description": "Calculates the net present value of an investment based on a series of periodic cash flows and a discount rate.",
    "category": "Financial",
    "sourceName": "XNPV"
  },
  "XOR": {
    "syntax": "XOR(logical1, [logical2], ...)",
    "description": "Returns a logical exclusive OR of all arguments.",
    "category": "Logical",
    "sourceName": "XOR"
  },
  "YEAR": {
    "syntax": "YEAR(serial_number)",
    "description": "Returns the year corresponding to a given date.",
    "category": "Date and time",
    "sourceName": "YEAR"
  },
  "YEARFRAC": {
    "syntax": "YEARFRAC(start_date, end_date, [basis])",
    "description": "Returns the fraction of a year between two dates, represented as a decimal value.",
    "category": "Date and time",
    "sourceName": "YEARFRAC"
  },
  "ZTEST": {
    "syntax": "ZTEST(array, [x], [sigma])",
    "description": "Returns the probability of a one-tailed, one-sample z-test.",
    "category": "Statistical",
    "sourceName": "ZTEST"
  }
} as const satisfies Readonly<Record<string, SpreadsheetFormulaMetadata>>;
