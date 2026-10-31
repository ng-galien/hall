import type { AreaGeometry } from "./geo";

export type PlanarRings = [number, number][][];

/** Polygones projetés d'un territoire : un tableau d'anneaux par polygone. */
export function projectArea(
  area: { geometry: AreaGeometry },
  project: (position: [number, number]) => [number, number],
): PlanarRings[] {
  const polygons = area.geometry.type === "Polygon" ? [area.geometry.coordinates] : area.geometry.coordinates;
  return polygons.map((rings) => rings.map((ring) => ring.map((position) => project([position[0], position[1]]))));
}
