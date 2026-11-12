import { sweepWidths } from "../engine/sweep.mjs";

/* Hall settings of the width sweep: widths, inputs and the areas the generic rules do not measure. */

/** Widths named by a media query or a container query of the client: 600, 760, 1000 and 1280 pixels. */
export const thresholds = [600, 760, 1000, 1280];
/** At and below this width Hall uses its phone layout, where the menu and the module pane do not exist. */
const phoneWidth = 760;

const pointerWidths = sweepWidths({ from: 320, to: 1600, step: 80, thresholds });
const touchWidths = sweepWidths({ from: 320, to: phoneWidth, step: 80, thresholds: [600, 760] }).concat([375, 390]);

/** Formats of `screens.mjs` mapped to the width ranges where a screen exists. */
const ranges = {
  telephone: (width) => width <= phoneWidth,
  tablette: (width) => width > phoneWidth && width < 1000,
  ordinateur: (width) => width >= 1000,
};
const widthsOf = (widths) => (screen) =>
  widths.filter((width) => screen.formats.some((format) => ranges[format](width)));

/** The map canvas and the spreadsheet grid draw their own content; the sync status is a transient indicator. */
const ignoreSelectors = [".ol-viewport", ".univer-spreadsheet", "[data-testid=application-sync-status]"];

export const sweepPlan = {
  pointer: {
    height: 900,
    phoneWidth,
    chunk: 4,
    ignoreSelectors,
    screens: () => true,
    widths: widthsOf(pointerWidths),
  },
  touch: {
    height: 800,
    phoneWidth,
    chunk: 8,
    ignoreSelectors,
    screens: (screen) => screen.formats.includes("telephone"),
    widths: widthsOf([...new Set(touchWidths)].sort((a, b) => a - b)),
  },
};
