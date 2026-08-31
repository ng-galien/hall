/* The documentation can be built as a self-contained site (one HTML file, `npm run build:docs`).
   In that build there is no server and no application behind the links: the pages hide what would lead nowhere. */
export const standalone = import.meta.env.VITE_HALL_DOCS_STANDALONE === "1";
