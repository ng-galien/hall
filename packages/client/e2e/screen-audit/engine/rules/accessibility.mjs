/*
 * Accessibility family, reserved for the results of an accessibility engine such as axe-core run on each captured
 * screen. The capture would store its violations in the record (`record.accessibility`), and one rule of kind
 * "element" per violation type would map them to findings, so that they appear in the same report and baseline.
 * No engine is connected yet: the family declares no rule.
 */
export const accessibilityRules = [];
