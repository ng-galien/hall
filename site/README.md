# Hall public site

Static site that presents Hall on a 3D model of the real terrain around the Cornu plateau and
Chaux-des-Crotenay (Jura), where the fictional Alésia demonstration municipality is placed.

## Commands

Run from this directory:

- `npm run build`: type check and build the static site into `dist/`.
- `npm run preview`: serve `dist/` on http://127.0.0.1:4791/.
- `npm run lint`, `npm run typecheck`.
- `npx playwright test e2e/site.spec.ts`: desktop (1280x800) and phone (390x844) journeys, including
  the version without 3D.

## Structure

- `src/scenes.ts`: the five steps of the story (identifier, real place, text, Hall captures, position in
  the terrain in metres around the centre of the extent).
- `src/terrain.ts`: Three.js scene built from `public/terrain/` (relief mesh, land cover, roads,
  railway, rivers, buildings, municipal boundaries, place markers).
- `src/main.ts`: page wiring, scenario panel, address fragment, version without 3D.
- `src/palette.ts`: scene colours, identical to the CSS variables of `src/styles.css`.
- `public/terrain/`: embedded geographic data, produced by `scripts/prepare-geodata.py`.
- `public/captures/`: Hall screenshots shown in each step.

## Geographic data

Sources, licences and the regeneration command are listed in [`SOURCES`](SOURCES). The embedded files
must stay below 8 MB in total; the Playwright journey checks the size and that the page makes no
request to another host.
