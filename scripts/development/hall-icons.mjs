import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Draws every icon of Hall from one drawing: the town hall with blue, white and red pillars on a bordered square, in a
 * light and a dark version. Run `node scripts/development/hall-icons.mjs [board directory]`; it needs rsvg-convert, and
 * iconutil for the macOS icon. The client tokens (--hall-color-logo-*) and the site theme (--logo-*) carry the same two
 * palettes; a test keeps them equal to LOGO_PALETTES.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const LOGO_PALETTES = {
  light: {
    surface: "#ffffff",
    border: "#cbd5e1",
    structure: "#2457d6",
    "left-pillar": "#6f9bf2",
    "middle-pillar": "#ffffff",
    "middle-pillar-line": "#94a3b8",
    "right-pillar": "#dc2626",
  },
  dark: {
    surface: "#1f2a3a",
    border: "#334155",
    structure: "#e2e8f0",
    "left-pillar": "#4c7fe8",
    "middle-pillar": "#e2e8f0",
    "middle-pillar-line": "transparent",
    "right-pillar": "#e5484d",
  },
};

const SHAPES = [
  ["frame", '<rect x="1" y="1" width="62" height="62" rx="8" stroke-width="2"/>', "surface", "border"],
  ["structure", '<path d="M32 11 53 23H11Z"/>', "structure"],
  ["structure", '<path d="M13 25h38v4H13zM11 49h42v5H11z"/>', "structure"],
  ["left-pillar", '<rect x="16" y="31" width="6" height="16"/>', "left-pillar"],
  [
    "middle-pillar",
    '<rect x="29" y="31" width="6" height="16" stroke-width="1"/>',
    "middle-pillar",
    "middle-pillar-line",
  ],
  ["right-pillar", '<rect x="42" y="31" width="6" height="16"/>', "right-pillar"],
];

const paint = (palette, fill, stroke) =>
  stroke ? `fill="${palette[fill]}" stroke="${palette[stroke]}"` : `fill="${palette[fill]}"`;

const literalShapes = (palette, shapes = SHAPES) =>
  shapes.map(([, element, fill, stroke]) => element.replace(/^<(\w+)/, `<$1 ${paint(palette, fill, stroke)}`));

const classedShapes = () =>
  SHAPES.map(([name, element]) => element.replace(/^<(\w+)/, `<$1 class="hall-logo-${name}"`));

const ruleSet = (palette) =>
  [...new Map(SHAPES.map(([name, , fill, stroke]) => [name, [fill, stroke]])).entries()]
    .map(
      ([name, [fill, stroke]]) =>
        `.hall-logo-${name}{fill:${palette[fill]}${stroke ? `;stroke:${palette[stroke]}` : ""}}`,
    )
    .join("");

const svg = (viewBox, lines) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">\n${lines.map((line) => `  ${line}`).join("\n")}\n</svg>\n`;

export const logoSvg = () =>
  svg("0 0 64 64", [
    `<style>${ruleSet(LOGO_PALETTES.light)}@media (prefers-color-scheme: dark){${ruleSet(LOGO_PALETTES.dark)}}</style>`,
    ...classedShapes(),
  ]);

export const inlineLogoShapes = () => classedShapes().join("");

const flatSvg = (palette) => svg("0 0 64 64", literalShapes(palette));

const desktopSvg = () =>
  svg("0 0 1024 1024", [
    '<g transform="translate(100 100) scale(12.875)">',
    ...literalShapes(LOGO_PALETTES.light).map((line) => `  ${line}`),
    "</g>",
  ]);

const maskableSvg = () =>
  svg("0 0 512 512", [
    `<rect width="512" height="512" fill="${LOGO_PALETTES.light.surface}"/>`,
    '<g transform="translate(51.2 51.2) scale(6.4)">',
    ...literalShapes(LOGO_PALETTES.light, SHAPES.slice(1)).map((line) => `  ${line}`),
    "</g>",
  ]);

const pixelSvg = (size, { radius, roof, entablature, pillars, base, left, middle, right }) => {
  const color = LOGO_PALETTES.light;
  const crisp = 'shape-rendering="crispEdges"';
  return svg(`0 0 ${size} ${size}`, [
    `<rect x="0.5" y="0.5" width="${size - 1}" height="${size - 1}" rx="${radius}" fill="${color.surface}" stroke="${color.border}" stroke-width="1"/>`,
    `<path d="${roof}" fill="${color.structure}"/>`,
    `<rect ${entablature} fill="${color.structure}" ${crisp}/>`,
    `<rect ${base} fill="${color.structure}" ${crisp}/>`,
    `<rect x="${left[0]}" ${pillars} width="${left[1]}" fill="${color["left-pillar"]}" ${crisp}/>`,
    `<rect x="${middle[0]}" ${pillars} width="${middle[1]}" fill="${color["middle-pillar-line"]}" ${crisp}/>`,
    `<rect x="${middle[0] + 1}" ${middle[2]} width="${middle[1] - 2}" fill="${color["middle-pillar"]}" ${crisp}/>`,
    `<rect x="${right[0]}" ${pillars} width="${right[1]}" fill="${color["right-pillar"]}" ${crisp}/>`,
  ]);
};

const PIXEL_LOGOS = {
  16: pixelSvg(16, {
    radius: 2,
    roof: "M8 2 14 5H2Z",
    entablature: 'x="3" y="6" width="10" height="1"',
    pillars: 'y="8" height="4"',
    base: 'x="2" y="12" width="12" height="2"',
    left: [3, 2],
    middle: [6, 4, 'y="9" height="2"'],
    right: [11, 2],
  }),
  32: pixelSvg(32, {
    radius: 4,
    roof: "M16 5 27 11H5Z",
    entablature: 'x="6" y="12" width="20" height="2"',
    pillars: 'y="15" height="9"',
    base: 'x="5" y="25" width="22" height="2"',
    left: [8, 3],
    middle: [14, 4, 'y="16" height="7"'],
    right: [21, 3],
  }),
};

const sourceFor = (size, regular) => PIXEL_LOGOS[size] ?? regular;

function render(work, source, size, name) {
  const input = join(work, `${name}.svg`);
  const output = join(work, `${name}-${size}.png`);
  writeFileSync(input, source);
  execFileSync("rsvg-convert", ["-w", String(size), "-h", String(size), "-o", output, input]);
  return readFileSync(output);
}

function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, index) => {
    const entry = 6 + 16 * index;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(({ png }) => png)]);
}

const write = (path, content) => writeFileSync(join(root, path), content);

const INLINE_LOGO = /(<svg viewBox="0 0 64 64" aria-hidden="true">)<rect [\s\S]*?(<\/svg>)/g;

function replaceInlineLogo(path) {
  const page = readFileSync(join(root, path), "utf8");
  write(
    path,
    page.replace(INLINE_LOGO, (_, open, close) => `${open}${inlineLogoShapes()}${close}`),
  );
}

function writeBoard(work, board) {
  mkdirSync(board, { recursive: true });
  for (const [name, palette] of Object.entries(LOGO_PALETTES)) {
    writeFileSync(join(board, `logo-${name}.svg`), flatSvg(palette));
    for (const size of [16, 32, 64, 180, 512])
      writeFileSync(join(board, `logo-${name}-${size}.png`), render(work, flatSvg(palette), size, name));
  }
}

function generate(board) {
  const work = mkdtempSync(join(tmpdir(), "hall-icons-"));
  const light = flatSvg(LOGO_PALETTES.light);
  const desktop = desktopSvg();
  const web = (size) => render(work, sourceFor(size, light), size, "logo");
  const app = (size) => render(work, sourceFor(size, desktop), size, "desktop");

  write("packages/client/public/icons/favicon.svg", logoSvg());
  write("site/public/icons/favicon.svg", logoSvg());
  write("packages/desktop/icons/hall.svg", desktop);
  replaceInlineLogo("site/index.html");
  replaceInlineLogo("site/demonstration/index.html");

  write("packages/client/public/icons/favicon.ico", ico([16, 32].map((size) => ({ size, png: web(size) }))));
  write("packages/client/public/icons/apple-touch-icon.png", web(180));
  write("packages/client/public/icons/icon-192.png", web(192));
  write("packages/client/public/icons/icon-512.png", web(512));
  write("packages/client/public/icons/icon-maskable-512.png", render(work, maskableSvg(), 512, "maskable"));
  write("packages/client/public/icons/icon-1024.png", web(1024));
  write("packages/client/public/icons/icon-maskable-1024.png", render(work, maskableSvg(), 1024, "maskable"));
  write("site/public/icons/favicon-32.png", web(32));
  write("site/public/icons/apple-touch-icon.png", web(180));

  write("packages/desktop/icons/hall.png", app(512));
  write(
    "packages/desktop/icons/hall.ico",
    ico([16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, png: app(size) }))),
  );
  const iconset = join(work, "hall.iconset");
  mkdirSync(iconset);
  for (const size of [16, 32, 128, 256, 512]) {
    writeFileSync(join(iconset, `icon_${size}x${size}.png`), app(size));
    writeFileSync(join(iconset, `icon_${size}x${size}@2x.png`), app(size * 2));
  }
  execFileSync("iconutil", ["-c", "icns", "-o", join(root, "packages/desktop/icons/hall.icns"), iconset]);
  if (board) writeBoard(work, resolve(board));
  rmSync(work, { recursive: true, force: true });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) generate(process.argv[2]);
