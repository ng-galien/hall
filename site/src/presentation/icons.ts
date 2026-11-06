/**
 * Icônes et couleurs des types de pièces, reprises de l'arborescence de l'application
 * (packages/client : components/icons.tsx, features/documents/ResourceGlyph.tsx, styles/components.css,
 * styles/tokens.css, thème clair). Tracés Phosphor « regular », grille 256.
 */
export type PieceKind =
  | "pdf"
  | "document"
  | "image"
  | "layer"
  | "geographic"
  | "draft"
  | "decision"
  | "agenda"
  | "business"
  | "mail"
  | "folder"
  | "folderOpen"
  | "matter"
  | "question"
  | "event"
  | "committee"
  | "adopted"
  | "minutes"
  | "share"
  | "rule"
  | "check"
  | "legal"
  | "sheet"
  | "send";

interface Glyph {
  path: string;
  color: string;
  surface: string;
}

const briefcase =
  "M216,56H176V48a24,24,0,0,0-24-24H104A24,24,0,0,0,80,48v8H40A16,16,0,0,0,24,72V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V72A16,16,0,0,0,216,56ZM96,48a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96ZM216,72v41.61A184,184,0,0,1,128,136a184.07,184.07,0,0,1-88-22.38V72Zm0,128H40V131.64A200.19,200.19,0,0,0,128,152a200.25,200.25,0,0,0,88-20.37V200ZM104,112a8,8,0,0,1,8-8h32a8,8,0,0,1,0,16H112A8,8,0,0,1,104,112Z";

export const glyphs: Record<PieceKind, Glyph> = {
  pdf: {
    path: "M224,152a8,8,0,0,1-8,8H192v16h16a8,8,0,0,1,0,16H192v16a8,8,0,0,1-16,0V152a8,8,0,0,1,8-8h32A8,8,0,0,1,224,152ZM92,172a28,28,0,0,1-28,28H56v8a8,8,0,0,1-16,0V152a8,8,0,0,1,8-8H64A28,28,0,0,1,92,172Zm-16,0a12,12,0,0,0-12-12H56v24h8A12,12,0,0,0,76,172Zm88,8a36,36,0,0,1-36,36H112a8,8,0,0,1-8-8V152a8,8,0,0,1,8-8h16A36,36,0,0,1,164,180Zm-16,0a20,20,0,0,0-20-20h-8v40h8A20,20,0,0,0,148,180ZM40,112V40A16,16,0,0,1,56,24h96a8,8,0,0,1,5.66,2.34l56,56A8,8,0,0,1,216,88v24a8,8,0,0,1-16,0V96H152a8,8,0,0,1-8-8V40H56v72a8,8,0,0,1-16,0ZM160,80h28.69L160,51.31Z",
    color: "#b42323",
    surface: "#fdf0f0",
  },
  document: {
    path: "M52,144H36a8,8,0,0,0-8,8v56a8,8,0,0,0,8,8H52a36,36,0,0,0,0-72Zm0,56H44V160h8a20,20,0,0,1,0,40Zm169.53-4.91a8,8,0,0,1,.25,11.31A30.06,30.06,0,0,1,200,216c-17.65,0-32-16.15-32-36s14.35-36,32-36a30.06,30.06,0,0,1,21.78,9.6,8,8,0,0,1-11.56,11.06A14.24,14.24,0,0,0,200,160c-8.82,0-16,9-16,20s7.18,20,16,20a14.24,14.24,0,0,0,10.22-4.66A8,8,0,0,1,221.53,195.09ZM128,144c-17.65,0-32,16.15-32,36s14.35,36,32,36,32-16.15,32-36S145.65,144,128,144Zm0,56c-8.82,0-16-9-16-20s7.18-20,16-20,16,9,16,20S136.82,200,128,200ZM48,120a8,8,0,0,0,8-8V40h88V88a8,8,0,0,0,8,8h48v16a8,8,0,0,0,16,0V88a8,8,0,0,0-2.34-5.66l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40v72A8,8,0,0,0,48,120ZM160,51.31,188.69,80H160Z",
    color: "#1b2a78",
    surface: "#eceefa",
  },
  image: {
    path: "M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,16V158.75l-26.07-26.06a16,16,0,0,0-22.63,0l-20,20-44-44a16,16,0,0,0-22.62,0L40,149.37V56ZM40,172l52-52,80,80H40Zm176,28H194.63l-36-36,20-20L216,181.38V200ZM144,100a12,12,0,1,1,12,12A12,12,0,0,1,144,100Z",
    color: "#1f7a4a",
    surface: "#edf7f1",
  },
  layer: {
    path: "M230.91,172A8,8,0,0,1,228,182.91l-96,56a8,8,0,0,1-8.06,0l-96-56A8,8,0,0,1,36,169.09l92,53.65,92-53.65A8,8,0,0,1,230.91,172ZM220,121.09l-92,53.65L36,121.09A8,8,0,0,0,28,134.91l96,56a8,8,0,0,0,8.06,0l96-56A8,8,0,1,0,220,121.09ZM24,80a8,8,0,0,1,4-6.91l96-56a8,8,0,0,1,8.06,0l96,56a8,8,0,0,1,0,13.82l-96,56a8,8,0,0,1-8.06,0l-96-56A8,8,0,0,1,24,80Zm23.88,0L128,126.74,208.12,80,128,33.26Z",
    color: "#1b2a78",
    surface: "#eceefa",
  },
  draft: {
    path: "M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Zm-32-80a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,136Zm0,32a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,168Z",
    color: "#1b2a78",
    surface: "#eceefa",
  },
  decision: {
    path: "M80,64a8,8,0,0,1,8-8H216a8,8,0,0,1,0,16H88A8,8,0,0,1,80,64Zm136,56H88a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Zm0,64H88a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16ZM44,52A12,12,0,1,0,56,64,12,12,0,0,0,44,52Zm0,64a12,12,0,1,0,12,12A12,12,0,0,0,44,116Zm0,64a12,12,0,1,0,12,12A12,12,0,0,0,44,180Z",
    color: "#7b2d3b",
    surface: "#f7ebed",
  },
  agenda: {
    path: "M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Zm-68-76a12,12,0,1,1-12-12A12,12,0,0,1,140,132Zm44,0a12,12,0,1,1-12-12A12,12,0,0,1,184,132ZM96,172a12,12,0,1,1-12-12A12,12,0,0,1,96,172Zm44,0a12,12,0,1,1-12-12A12,12,0,0,1,140,172Zm44,0a12,12,0,1,1-12-12A12,12,0,0,1,184,172Z",
    color: "#1b2a78",
    surface: "#eceefa",
  },
  business: { path: briefcase, color: "#087e8b", surface: "#e6f3f4" },
  event: {
    path: "M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Z",
    color: "#1b2a78",
    surface: "#eceefa",
  },
  committee: {
    path: "M244.8,150.4a8,8,0,0,1-11.2-1.6A51.6,51.6,0,0,0,192,128a8,8,0,0,1-7.37-4.89,8,8,0,0,1,0-6.22A8,8,0,0,1,192,112a24,24,0,1,0-23.24-30,8,8,0,1,1-15.5-4A40,40,0,1,1,219,117.51a67.94,67.94,0,0,1,27.43,21.68A8,8,0,0,1,244.8,150.4ZM190.92,212a8,8,0,1,1-13.84,8,57,57,0,0,0-98.16,0,8,8,0,1,1-13.84-8,72.06,72.06,0,0,1,33.74-29.92,48,48,0,1,1,58.36,0A72.06,72.06,0,0,1,190.92,212ZM128,176a32,32,0,1,0-32-32A32,32,0,0,0,128,176ZM72,120a8,8,0,0,0-8-8A24,24,0,1,1,87.24,82a8,8,0,1,0,15.5-4A40,40,0,1,0,37,117.51,67.94,67.94,0,0,0,9.6,139.19a8,8,0,1,0,12.8,9.61A51.6,51.6,0,0,1,64,128,8,8,0,0,0,72,120Z",
    color: "#1b2a78",
    surface: "#eceefa",
  },
  adopted: {
    path: "M80,64a8,8,0,0,1,8-8H216a8,8,0,0,1,0,16H88A8,8,0,0,1,80,64Zm136,56H88a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Zm0,64H88a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16ZM44,52A12,12,0,1,0,56,64,12,12,0,0,0,44,52Zm0,64a12,12,0,1,0,12,12A12,12,0,0,0,44,116Zm0,64a12,12,0,1,0,12,12A12,12,0,0,0,44,180Z",
    color: "#15803d",
    surface: "#edf7f1",
  },
  minutes: {
    path: "M184,112a8,8,0,0,1-8,8H112a8,8,0,0,1,0-16h64A8,8,0,0,1,184,112Zm-8,24H112a8,8,0,0,0,0,16h64a8,8,0,0,0,0-16Zm48-88V208a16,16,0,0,1-16,16H48a16,16,0,0,1-16-16V48A16,16,0,0,1,48,32H208A16,16,0,0,1,224,48ZM48,208H72V48H48Zm160,0V48H88V208H208Z",
    color: "#1b2a78",
    surface: "#eceefa",
  },
  rule: {
    path: "M239.43,133l-32-80h0a8,8,0,0,0-9.16-4.84L136,62V40a8,8,0,0,0-16,0V65.58L54.26,80.19A8,8,0,0,0,48.57,85h0v.06L16.57,165a7.920,7.920,0,0,0-.57,3c0,23.31,24.54,32,40,32s40-8.690,40-32a7.920,7.920,0,0,0-.57-3L66.92,93.77,120,82V208H104a8,8,0,0,0,0,16h48a8,8,0,0,0,0-16H136V78.42L187,67.1,160.57,133a7.920,7.920,0,0,0-.57,3c0,23.31,24.54,32,40,32s40-8.690,40-32A7.920,7.920,0,0,0,239.43,133ZM56,184c-7.53,0-22.76-3.61-23.93-14.64L56,109.54l23.93,59.82C78.76,180.39,63.53,184,56,184Zm144-32c-7.53,0-22.76-3.61-23.93-14.64L200,77.54l23.93,59.82C222.76,148.39,207.53,152,200,152Z",
    color: "#475569",
    surface: "#eef2f6",
  },
  sheet: {
    path: "M224,48H32a8,8,0,0,0-8,8V192a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A8,8,0,0,0,224,48ZM40,112H80v32H40Zm56,0H216v32H96ZM216,64V96H40V64ZM40,160H80v32H40Zm176,32H96V160H216v32Z",
    color: "#1f7a4a",
    surface: "#edf7f1",
  },
  legal: {
    path: "M232,48H160a40,40,0,0,0-32,16A40,40,0,0,0,96,48H24a8,8,0,0,0-8,8V200a8,8,0,0,0,8,8H96a24,24,0,0,1,24,24,8,8,0,0,0,16,0,24,24,0,0,1,24-24h72a8,8,0,0,0,8-8V56A8,8,0,0,0,232,48ZM96,192H32V64H96a24,24,0,0,1,24,24V200A39.810,39.810,0,0,0,96,192Zm128,0H160a39.810,39.810,0,0,0-24,8V88a24,24,0,0,1,24-24h64ZM160,88h40a8,8,0,0,1,0,16H160a8,8,0,0,1,0-16Zm48,40a8,8,0,0,1-8,8H160a8,8,0,0,1,0-16h40A8,8,0,0,1,208,128Zm0,32a8,8,0,0,1-8,8H160a8,8,0,0,1,0-16h40A8,8,0,0,1,208,160Z",
    color: "#7b2d3b",
    surface: "#f7ebed",
  },
  check: {
    path: "M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z",
    color: "#1f5fbf",
    surface: "transparent",
  },
  share: {
    path: "M176,160a39.89,39.89,0,0,0-28.62,12.09l-46.1-29.63a39.8,39.8,0,0,0,0-28.92l46.1-29.63a40,40,0,1,0-8.66-13.45l-46.1,29.63a40,40,0,1,0,0,55.82l46.1,29.63A40,40,0,1,0,176,160Zm0-128a24,24,0,1,1-24,24A24,24,0,0,1,176,32ZM64,152a24,24,0,1,1,24-24A24,24,0,0,1,64,152Zm112,72a24,24,0,1,1,24-24A24,24,0,0,1,176,224Z",
    color: "#1b2a78",
    surface: "#eceefa",
  },
  question: {
    path: "M100,56H40A16,16,0,0,0,24,72v64a16,16,0,0,0,16,16h60v8a32,32,0,0,1-32,32,8,8,0,0,0,0,16,48.05,48.05,0,0,0,48-48V72A16,16,0,0,0,100,56Zm0,80H40V72h60ZM216,56H156a16,16,0,0,0-16,16v64a16,16,0,0,0,16,16h60v8a32,32,0,0,1-32,32,8,8,0,0,0,0,16,48.05,48.05,0,0,0,48-48V72A16,16,0,0,0,216,56Zm0,80H156V72h60Z",
    color: "#1b2a78",
    surface: "#eceefa",
  },
  geographic: {
    path: "M228.92,49.69a8,8,0,0,0-6.86-1.45L160.93,63.52,99.58,32.84a8,8,0,0,0-5.52-.6l-64,16A8,8,0,0,0,24,56V200a8,8,0,0,0,9.94,7.76l61.13-15.28,61.35,30.68A8.150,8.150,0,0,0,160,224a8,8,0,0,0,1.94-.24l64-16A8,8,0,0,0,232,200V56A8,8,0,0,0,228.92,49.69ZM104,52.94l48,24V203.06l-48-24ZM40,62.25l48-12v127.5l-48,12Zm176,131.5-48,12V78.25l48-12Z",
    color: "#1b2a78",
    surface: "#eceefa",
  },
  folder: {
    path: "M216,72H131.31L104,44.69A15.86,15.86,0,0,0,92.69,40H40A16,16,0,0,0,24,56V200.62A15.4,15.4,0,0,0,39.38,216H216.89A15.13,15.13,0,0,0,232,200.89V88A16,16,0,0,0,216,72ZM40,56H92.69l16,16H40ZM216,200H40V88H216Z",
    color: "#5b6472",
    surface: "transparent",
  },
  folderOpen: {
    path: "M245,110.64A16,16,0,0,0,232,104H216V88a16,16,0,0,0-16-16H130.67L102.94,51.2a16.14,16.14,0,0,0-9.6-3.2H40A16,16,0,0,0,24,64V208h0a8,8,0,0,0,8,8H211.1a8,8,0,0,0,7.590-5.47l28.49-85.47A16.050,16.050,0,0,0,245,110.64ZM93.34,64,123.2,86.4A8,8,0,0,0,128,88h72v16H69.77a16,16,0,0,0-15.18,10.94L40,158.7V64Zm112,136H43.1l26.67-80H232Z",
    color: "#1f5fbf",
    surface: "transparent",
  },
  matter: {
    path: "M243.32,116.69l-16-16a16,16,0,0,0-20.84-1.53L156.84,49.52a16,16,0,0,0-1.52-20.84l-16-16a16,16,0,0,0-22.630,0l-64,64a16,16,0,0,0,0,22.630l16,16a16,16,0,0,0,20.830,1.52L96.69,124,31.31,189.38A25,25,0,0,0,66.63,224.7L132,159.32l7.17,7.16a16,16,0,0,0,1.52,20.84l16,16a16,16,0,0,0,22.630,0l64-64A16,16,0,0,0,243.32,116.69ZM80,104,64,88l64-64,16,16ZM55.32,213.38a9,9,0,0,1-12.69,0,9,9,0,0,1,0-12.68L108,135.32,120.69,148ZM101,105.66,145.66,61,195,110.34,150.35,155ZM168,192l-16-16,4-4h0l56-56h0l4-4,16,16Z",
    color: "#1b2a78",
    surface: "#eceefa",
  },
  send: {
    path: "M227.32,28.68a16,16,0,0,0-15.66-4.08l-.15,0L19.57,82.84a16,16,0,0,0-2.49,29.8L102,154l41.3,84.87A15.86,15.86,0,0,0,157.74,248q.69,0,1.38-.06a15.88,15.88,0,0,0,14-11.51l58.2-191.94c0-.05,0-.1,0-.15A16,16,0,0,0,227.32,28.68ZM157.83,231.85l-.05.14,0-.07-40.06-82.3,48-48a8,8,0,0,0-11.31-11.31l-48,48L24.08,98.25l-.07,0,.14,0L216,40Z",
    color: "#1b2a78",
    surface: "#eceefa",
  },
  mail: {
    path: "M224,48H32a8,8,0,0,0-8,8V192a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A8,8,0,0,0,224,48Zm-96,85.15L52.57,64H203.43ZM98.71,128,40,181.81V74.19Zm11.84,10.85,12,11.05a8,8,0,0,0,10.82,0l12-11.05,58,53.15H52.57ZM157.29,128,216,74.18V181.82Z",
    color: "#475569",
    surface: "#eef2f6",
  },
};

export function svgIcon(kind: PieceKind): string {
  return `<svg viewBox="0 0 256 256" aria-hidden="true"><path d="${glyphs[kind].path}"/></svg>`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawGlyph(ctx: CanvasRenderingContext2D, kind: PieceKind, x: number, y: number, size: number) {
  const glyph = glyphs[kind];
  ctx.fillStyle = glyph.surface;
  roundRect(ctx, x, y, size, size, size * 0.2);
  ctx.fill();
  ctx.save();
  ctx.translate(x + size * 0.17, y + size * 0.17);
  ctx.scale((size * 0.66) / 256, (size * 0.66) / 256);
  ctx.fillStyle = glyph.color;
  ctx.fill(new Path2D(glyph.path));
  ctx.restore();
}

export function glowCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.25, "rgba(220,232,255,0.8)");
  gradient.addColorStop(1, "rgba(160,190,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return canvas;
}

export function discCanvas(fill: string, ring: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(32, 32, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = ring;
  ctx.lineWidth = 5;
  ctx.stroke();
  return canvas;
}

/** Fiche d'une pièce, format intercalaire : bandeau de tête avec icône et titre, corps avec type, mention et lignes. 16:10. */
export function indexCanvas(kind: PieceKind, title: string, detail: string, mark?: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 400;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const glyph = glyphs[kind];
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, 4, 4, 632, 392, 26);
  ctx.fill();
  ctx.save();
  roundRect(ctx, 4, 4, 632, 392, 26);
  ctx.clip();
  ctx.fillStyle = glyph.surface;
  ctx.fillRect(4, 4, 632, 84);
  ctx.fillStyle = glyph.color;
  ctx.fillRect(4, 84, 632, 4);
  ctx.restore();
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 3;
  roundRect(ctx, 4, 4, 632, 392, 26);
  ctx.stroke();
  drawGlyph(ctx, kind, 18, 14, 60);
  ctx.fillStyle = "#0f1723";
  ctx.font = "700 36px 'Public Sans', system-ui, sans-serif";
  let line = title;
  while (ctx.measureText(line).width > 530 && line.length > 4) line = `${line.slice(0, -2)}…`;
  ctx.fillText(line, 92, 58);
  ctx.fillStyle = "#475569";
  ctx.font = "700 26px 'Public Sans', system-ui, sans-serif";
  ctx.fillText(detail.toUpperCase(), 32, 140);
  ctx.fillStyle = "#e2e8f0";
  for (let i = 0; i < 4; i++) {
    roundRect(ctx, 32, 170 + i * 34, i === 3 ? 300 : 560 - (i % 2) * 60, 14, 7);
    ctx.fill();
  }
  if (mark) {
    ctx.fillStyle = glyph.color;
    ctx.font = "800 38px 'Public Sans', system-ui, sans-serif";
    ctx.fillText(mark, 32, 370);
  }
  return canvas;
}

/** Robot de l'assistant IA, au trait des icônes de Hall (même dessin que la section « Assistant IA »). */
export function robotCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.scale(1.6, 1.6);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath();
  ctx.roundRect(40, 46, 80, 58, 18);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(52, 114, 56, 26, 10);
  ctx.fill();
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(80, 30);
  ctx.lineTo(80, 46);
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(40, 46, 80, 58, 18);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(40, 72);
  ctx.lineTo(32, 72);
  ctx.moveTo(120, 72);
  ctx.lineTo(128, 72);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(62, 104);
  ctx.lineTo(62, 114);
  ctx.moveTo(98, 104);
  ctx.lineTo(98, 114);
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(52, 114, 56, 26, 10);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(68, 90);
  ctx.quadraticCurveTo(80, 98, 92, 90);
  ctx.stroke();
  ctx.fillStyle = "#1f5fbf";
  ctx.beginPath();
  ctx.arc(80, 24, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(58, 64, 12, 14, 6);
  ctx.roundRect(90, 64, 12, 14, 6);
  ctx.fill();
  return canvas;
}

/** Carte d'un tableur : bandeau de tête, aperçu de grille, ligne de total. Mêmes proportions que les autres cartes. */
export function sheetCanvas(title: string, rows: [string, string][], total: [string, string]): HTMLCanvasElement {
  const canvas = indexCanvas("sheet", title, "Tableur");
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(20, 100, 600, 286);
  const x0 = 32;
  const x1 = 400;
  const x2 = 608;
  let y = 118;
  const rowH = 48;
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 2;
  ctx.font = "600 26px 'Public Sans', system-ui, sans-serif";
  for (const [label, value] of rows) {
    ctx.fillStyle = "#0f1723";
    ctx.fillText(label, x0 + 12, y + 33);
    ctx.textAlign = "right";
    ctx.fillText(value, x2 - 12, y + 33);
    ctx.textAlign = "left";
    ctx.strokeRect(x0, y, x2 - x0, rowH);
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x1, y + rowH);
    ctx.stroke();
    y += rowH;
  }
  ctx.fillStyle = "#edf7f1";
  ctx.fillRect(x0, y, x2 - x0, rowH);
  ctx.strokeRect(x0, y, x2 - x0, rowH);
  ctx.fillStyle = "#1f7a4a";
  ctx.font = "800 28px 'Public Sans', system-ui, sans-serif";
  ctx.fillText(total[0], x0 + 12, y + 34);
  ctx.textAlign = "right";
  ctx.fillText(total[1], x2 - 12, y + 34);
  ctx.textAlign = "left";
  return canvas;
}
