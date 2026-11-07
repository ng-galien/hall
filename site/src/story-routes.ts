import type { Spot } from "./scenes";
import { oppidumNorthStreet, oppidumStreet, romanCampAccess, siegeSites as sites } from "./siege-layout";

export const near = (centre: Spot, x: number, y: number): Spot => ({ x: centre.x + x, y: centre.y + y });
const reverse = (points: Spot[]) => [...points].reverse();
const join = (...links: Spot[][]) =>
  links
    .flat()
    .filter((point, index, all) => index === 0 || point.x !== all[index - 1].x || point.y !== all[index - 1].y);
const eastStreet = oppidumStreet.map(({ x, y }) => near(sites.cornu, x, y));
const northStreet = oppidumNorthStreet.map(({ x, y }) => near(sites.cornu, x, y));
const eastGate = eastStreet[eastStreet.length - 1];
const northGate = northStreet[northStreet.length - 1];
const assemblyForecourt = near(sites.square, 0, -250);
const councilForecourt = near(sites.hall, 0, -260);
const towerEntrance = near(sites.tower, 13, -75);

/** Shared scenic corridors checked against the relief and the modelled openings.
 * These illustrate movement through the landscape; they are not attested ancient roads.
 * The northern crossing uses the river crossing visible in the embedded road/water data.
 */
const links = {
  eastAssembly: [eastGate, near(sites.cornu, 620, 0), assemblyForecourt],
  eastCouncil: [eastGate, near(sites.cornu, 620, -160), near(sites.hall, -180, -260), councilForecourt],
  northRidge: [northGate, { x: -1830, y: -480 }, { x: -1990, y: -190 }, sites.northCurtain],
  ridgeWatch: [sites.northCurtain, { x: -2100, y: 130 }, { x: -2140, y: 220 }, towerEntrance],
  ridgeCrossing: [
    sites.northCurtain,
    { x: -2230, y: 150 },
    { x: -2300, y: 400 },
    { x: -2350, y: 700 },
    { x: -2440, y: 1000 },
    { x: -2591, y: 1299 },
    { x: -2540, y: 1303 },
    { x: -2512, y: 1338 },
    { x: -2505, y: 1351 },
    { x: -2489, y: 1379 },
  ],
  crossingCamp: [{ x: -2489, y: 1379 }, { x: -2476, y: 1410 }, { x: -2390, y: 1435 }, near(sites.plain, 0, -500)],
  councilAssembly: [
    councilForecourt,
    near(sites.hall, -160, -260),
    near(sites.hall, -160, 150),
    near(sites.square, 140, -260),
    assemblyForecourt,
  ],
  alliedNorth: [eastGate, near(sites.cornu, 620, 0), near(sites.cornu, 1100, 100), near(sites.cornu, 1200, 600)],
  alliedSouth: [eastGate, near(sites.cornu, 620, 0), near(sites.cornu, 800, -500), near(sites.cornu, 1000, -550)],
};

const villageAssembly = join(eastStreet, links.eastAssembly, [near(sites.square, 0, -165)]);
const villageWatch = join(northStreet, links.northRidge, links.ridgeWatch);

export const storyRoutes = {
  watchRelief: links.ridgeWatch,
  suppliesToAssembly: villageAssembly,
  suppliesToGranary: reverse(villageAssembly),
  villageCouncil: join(eastStreet, links.eastCouncil, [near(sites.hall, -30, -180)]),
  watchCouncil: join(reverse(villageWatch), eastStreet, links.eastCouncil, [near(sites.hall, 30, -180)]),
  nearbyCouncil: [near(sites.hall, -220, -260), councilForecourt, near(sites.hall, 0, -180)],
  villageGathering: join(eastStreet, links.eastAssembly, [near(sites.square, -55, -165)]),
  councilGathering: join(links.councilAssembly, [near(sites.square, 55, -165)]),
  messengersNorth: join(eastStreet, links.alliedNorth),
  messengersSouth: join(eastStreet, links.alliedSouth),
  missiveToCamp: join(
    northStreet,
    links.northRidge,
    links.ridgeCrossing,
    links.crossingCamp,
    romanCampAccess.street.map(({ x, y }) => near(sites.plain, x, y)),
  ),
};
