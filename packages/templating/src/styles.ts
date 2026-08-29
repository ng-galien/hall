/** Base stylesheet shared by the preview and the PDF renderer. */
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
img { max-width: 100%; height: auto; }
.hall-template-image { display: block; }
.hall-template-image-left { margin-inline: 0 auto; }
.hall-template-image-center { margin-inline: auto; }
`;
