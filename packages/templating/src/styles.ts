/**
 * Minimum commun à l'aperçu et au PDF. Les styles propres à une commune ou à un type de
 * document restent dans le template en base et sont ajoutés après cette feuille.
 */
export const baseRenderStylesheet = `
:root {
  color: #171a1f;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 11pt;
  line-height: 1.45;
}
* { box-sizing: border-box; }
body { margin: 0; }
h1, h2, h3 { break-after: avoid; }
p, li { orphans: 3; widows: 3; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 0.35rem 0.5rem; border: 1px solid #73777f; vertical-align: top; }
img { max-width: 100%; }
`;
