# Hall public site

Static site that presents Hall on a 3D model of the real terrain around the Cornu plateau and
Chaux-des-Crotenay (Jura). The story follows the council of Alésia, the fictional demonstration
municipality, during the siege: the places of the story are those of the oppidum on the plateau and of
the plain of Syam, never present-day buildings.

## Commands

Run from this directory:

- `npm run build`: type check and build the static site into `dist/`.
- `npm run preview`: serve `dist/` on http://127.0.0.1:4791/.
- `npm run lint`, `npm run typecheck`.
- `npx playwright test e2e/site.spec.ts`: desktop (1280x800) and phone (390x844) journeys, including
  the version without 3D.

## Structure

- `src/scenes.ts`: the story, an opening followed by two axes, "Préparer" and "Siéger", five scenes
  each, named and numbered 1 to 5 within their axis. Each scene has its place in the oppidum or the plain,
  its text, its Hall captures and its motion: start and end viewpoints, duration, and the points, names
  and map traces lit on the terrain. Positions are given in WGS 84 and converted to metres around the
  centre of the extent. Each capture lists its numbered pins: a position in pixels of the original image
  and a short caption.
- `src/terrain.ts`: Three.js scene built from `public/terrain/` (relief mesh, land cover, roads,
  railway, rivers, buildings, municipal boundaries, place markers) and playback of each scene's motion;
  with reduced rendering, the camera goes straight to the final viewpoint. While a scenario panel is
  open, the optical centre is moved to the part of the scene that the panel, the menu and the header do
  not cover, and the final viewpoint moves back until the lit marks fit in that part; the stage exposes
  the projected target in `data-target-x` and `data-target-y`.
- `src/main.ts`: page wiring, discovery menu (opening, then "Préparer" and "Siéger" groups that unfold
  into their named scenes, current scene marked), scenario panel, automatic reading of the story, address
  fragment, version without 3D.
- `src/viewer.ts`: full-screen viewer of the Hall captures of a scenario, with pins and their legend,
  navigation between captures, closing by button, Escape or a click outside the image.
- `src/palette.ts`: scene colours, identical to the CSS variables of `src/styles.css`.
- `public/terrain/`: embedded geographic data, produced by `scripts/prepare-geodata.py`.
- `public/captures/`: Hall screenshots shown in each step, taken on a disposable Hall server loaded
  with the Alésia dataset (`npm run seed:dev -w @hall/server -- --dataset alesia`); the convocation
  comes from the `minutes` scenario, the other screens from the `default` scenario. The header and
  breadcrumb show the public name "Hall".

## Geographic data

Sources, licences and the regeneration command are listed in [`SOURCES`](SOURCES). The embedded files
must stay below 8 MB in total; the Playwright journey checks the size and that the page makes no
request to another host.
