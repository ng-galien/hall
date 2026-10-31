# Prépare les données géographiques embarquées du site à partir des extractions IGN.
# Usage : python3 -I scripts/prepare-geodata.py <dossier des téléchargements> <dossier de sortie>
# Entrées : alti-fine.bil (RGE ALTI, WMS-R Géoplateforme, 1634 x 1962 points, EPSG:4326, moyenné 2 x 2 en 817 x 981),
# couches BD TOPO V3 en GeoJSON (WFS Géoplateforme) et contours communaux geo.api.gouv.fr (commune-<code>.json).
# Sorties : terrain.bin (altitudes Uint16 en décimètres au-dessus du minimum), landcover.bin (Uint8 :
# bit 1 forêt, bit 2 eau, bit 4 territoire de Chaux-des-Crotenay), terrain.json (métadonnées et vecteurs simplifiés en mètres locaux, x vers l'est, y vers le nord).

import json
import math
import sys
from pathlib import Path

import numpy as np

BBOX = {"west": 5.925, "south": 46.605, "east": 6.065, "north": 46.72}
COLS = 817
ROWS = 981
# Origine fixe du repère local, à laquelle se rapportent les lieux du site (scenes.ts) ; le centre de l'emprise en est
# décalé et figure dans terrain.json (grid.x, grid.y).
LAT0 = 46.6775
LON0 = 5.98
CENTRE = [0.0, 0.0]
EARTH = 6371008.8
MX = EARTH * math.cos(math.radians(LAT0)) * math.pi / 180
MY = EARTH * math.pi / 180
COMMUNES = [
    ("39129", "Chaux-des-Crotenay", True),
    ("39523", "Syam", False),
    ("39178", "Crans", False),
    ("39424", "Les Planches-en-Montagne", False),
    ("39227", "Foncine-le-Bas", False),
]
TOPONYMS = {
    "Cornu",
    "Chaux-des-Crotenay",
    "Syam",
    "Crans",
    "Les Planches-en-Montagne",
    "Foncine-le-Bas",
    "le Pont de la Chaux",
    "Gorges de la Langouette",
    "Bois derrière Cornu",
    "Belvédère du Rachet",
    "Belvédère des Prés Grillet",
    "Belvédère à Taiclet",
}
FORESTS = {
    "Bois",
    "Forêt fermée de feuillus",
    "Forêt fermée mixte",
    "Forêt fermée de conifères",
    "Forêt ouverte",
    "Lande ligneuse",
}


def local(lon: float, lat: float) -> tuple[float, float]:
    return ((lon - LON0) * MX, (lat - LAT0) * MY)


def load(folder: Path, name: str) -> list[dict]:
    return json.loads((folder / f"{name}.json").read_text()).get("features", [])


def rings(geometry: dict) -> list[list[list[float]]]:
    kind = geometry["type"]
    coords = geometry["coordinates"]
    if kind == "Polygon":
        return [coords[0]]
    if kind == "MultiPolygon":
        return [polygon[0] for polygon in coords]
    return []


def lines(geometry: dict) -> list[list[list[float]]]:
    kind = geometry["type"]
    if kind == "LineString":
        return [geometry["coordinates"]]
    if kind == "MultiLineString":
        return geometry["coordinates"]
    return []


def simplify(points: list[tuple[float, float]], tolerance: float) -> list[tuple[float, float]]:
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        first, last = stack.pop()
        ax, ay = points[first]
        bx, by = points[last]
        dx, dy = bx - ax, by - ay
        length = math.hypot(dx, dy) or 1e-9
        worst, index = 0.0, -1
        for i in range(first + 1, last):
            px, py = points[i]
            distance = abs(dy * (px - ax) - dx * (py - ay)) / length
            if distance > worst:
                worst, index = distance, i
        if index >= 0 and worst > tolerance:
            keep[index] = True
            stack.append((first, index))
            stack.append((index, last))
    return [p for p, k in zip(points, keep) if k]


def project(coords: list[list[float]], tolerance: float) -> list[tuple[float, float]]:
    return simplify([local(c[0], c[1]) for c in coords], tolerance)


def project_ring(coords: list[list[float]], tolerance: float) -> list[tuple[float, float]]:
    points = [local(c[0], c[1]) for c in coords]
    if len(points) > 1 and points[0] == points[-1]:
        points = points[:-1]
    if len(points) < 3:
        return points
    far = max(range(len(points)), key=lambda i: (points[i][0] - points[0][0]) ** 2 + (points[i][1] - points[0][1]) ** 2)
    first = simplify(points[: far + 1], tolerance)
    second = simplify(points[far:] + [points[0]], tolerance)
    return first[:-1] + second[:-1]


def flat(points: list[tuple[float, float]]) -> list[float]:
    return [round(v, 1) for p in points for v in p]


def inside_extent(points: list[tuple[float, float]], half_w: float, half_h: float) -> bool:
    return any(abs(x - CENTRE[0]) <= half_w and abs(y - CENTRE[1]) <= half_h for x, y in points)


def fill(mask: np.ndarray, ring: list[tuple[float, float]], value: int, half_w: float, half_h: float) -> None:
    cols, rows = mask.shape[1], mask.shape[0]
    px = np.array([(x - CENTRE[0] + half_w) / (2 * half_w) * cols - 0.5 for x, _ in ring])
    py = np.array([(half_h - (y - CENTRE[1])) / (2 * half_h) * rows - 0.5 for _, y in ring])
    row_min = max(int(math.floor(py.min())), 0)
    row_max = min(int(math.ceil(py.max())), rows - 1)
    x0, y0 = px, py
    x1, y1 = np.roll(px, -1), np.roll(py, -1)
    for row in range(row_min, row_max + 1):
        crossing = ((y0 <= row) & (y1 > row)) | ((y1 <= row) & (y0 > row))
        if not crossing.any():
            continue
        xs = np.sort(x0[crossing] + (row - y0[crossing]) * (x1[crossing] - x0[crossing]) / (y1[crossing] - y0[crossing]))
        for start, end in zip(xs[0::2], xs[1::2]):
            a = max(int(math.ceil(start)), 0)
            b = min(int(math.floor(end)), cols - 1)
            if b >= a:
                mask[row, a : b + 1] |= value


def label_point(feature: dict) -> tuple[float, float]:
    geometry = feature["geometry"]
    coords = geometry["coordinates"]
    if geometry["type"] == "Point":
        return local(coords[0], coords[1])
    ring = rings(geometry) or lines(geometry)
    points = ring[0]
    return local(sum(p[0] for p in points) / len(points), sum(p[1] for p in points) / len(points))


def main() -> None:
    source, target = Path(sys.argv[1]), Path(sys.argv[2])
    target.mkdir(parents=True, exist_ok=True)
    west_x, south_y = local(BBOX["west"], BBOX["south"])
    east_x, north_y = local(BBOX["east"], BBOX["north"])
    half_w, half_h = (east_x - west_x) / 2, (north_y - south_y) / 2
    CENTRE[:] = [(east_x + west_x) / 2, (north_y + south_y) / 2]

    fine = np.fromfile(source / "alti-fine.bil", dtype="<f4").reshape(2 * ROWS, 2 * COLS)
    altitudes = fine.reshape(ROWS, 2, COLS, 2).mean(axis=(1, 3))
    minimum = float(np.floor(altitudes.min()))
    heights = np.round((altitudes - minimum) * 10).astype("<u2")
    heights.tofile(target / "terrain.bin")

    cover = np.zeros((ROWS, COLS), dtype=np.uint8)
    for feature in load(source, "zone_de_vegetation"):
        if feature["properties"].get("nature") in FORESTS:
            for ring in rings(feature["geometry"]):
                fill(cover, [local(c[0], c[1]) for c in ring], 1, half_w, half_h)
    for name in ("surface_hydrographique", "plan_d_eau"):
        for feature in load(source, name):
            for ring in rings(feature["geometry"]):
                fill(cover, [local(c[0], c[1]) for c in ring], 2, half_w, half_h)
    main_code = next(code for code, _, main_commune in COMMUNES if main_commune)
    main_data = json.loads((source / f"commune-{main_code}.json").read_text())
    main_data = main_data[0] if isinstance(main_data, list) else main_data
    for ring in rings(main_data["contour"]):
        fill(cover, [local(c[0], c[1]) for c in ring], 4, half_w, half_h)
    cover.tofile(target / "landcover.bin")

    roads = []
    for feature in load(source, "troncon_de_route"):
        props = feature["properties"]
        if props.get("etat_de_l_objet") not in (None, "En service"):
            continue
        rank = int(props.get("importance") or 6)
        tolerance = 4.0 if rank <= 3 else 6.0
        for line in lines(feature["geometry"]):
            points = project(line, tolerance)
            if inside_extent(points, half_w, half_h):
                roads.append({"r": rank, "n": props.get("cpx_numero"), "p": flat(points)})

    railway = []
    for feature in load(source, "troncon_de_voie_ferree"):
        props = feature["properties"]
        level = str(props.get("position_par_rapport_au_sol") or "0")
        for line in lines(feature["geometry"]):
            points = project(line, 4.0)
            if inside_extent(points, half_w, half_h):
                railway.append({"t": level.startswith("-"), "p": flat(points)})

    rivers = []
    for feature in load(source, "troncon_hydrographique"):
        props = feature["properties"]
        if props.get("position_par_rapport_au_sol") not in ("0", 0, None):
            continue
        wide = props.get("classe_de_largeur") in ("Entre 5 et 15 m", "Entre 15 et 50 m")
        for line in lines(feature["geometry"]):
            points = project(line, 4.0)
            if inside_extent(points, half_w, half_h):
                rivers.append(
                    {
                        "w": 2 if wide else 1,
                        "i": props.get("persistance") == "Intermittent",
                        "n": props.get("cpx_toponyme_de_cours_d_eau"),
                        "p": flat(points),
                    }
                )

    lakes = []
    for name in ("surface_hydrographique", "plan_d_eau"):
        for feature in load(source, name):
            for ring in rings(feature["geometry"]):
                points = project_ring(ring, 3.0)
                if len(points) >= 3 and inside_extent(points, half_w, half_h):
                    lakes.append(flat(points))

    buildings = []
    for feature in load(source, "batiment"):
        props = feature["properties"]
        height = props.get("hauteur") or 6.0
        for ring in rings(feature["geometry"]):
            points = project_ring(ring, 0.8)
            if len(points) >= 3 and inside_extent(points, half_w, half_h):
                buildings.append({"h": round(float(height), 1), "p": flat(points)})

    communes = []
    for code, name, main_commune in COMMUNES:
        data = json.loads((source / f"commune-{code}.json").read_text())
        data = data[0] if isinstance(data, list) else data
        for ring in rings(data["contour"]):
            communes.append({"code": code, "name": name, "main": main_commune, "p": flat(project_ring(ring, 5.0))})

    toponyms = []
    for layer in ("zone_d_habitation", "lieu_dit_non_habite", "detail_orographique", "plan_d_eau", "zone_d_activite_ou_d_interet"):
        for feature in load(source, layer):
            props = feature["properties"]
            name = props.get("toponyme")
            if name not in TOPONYMS:
                continue
            x, y = label_point(feature)
            if abs(x - CENTRE[0]) <= half_w and abs(y - CENTRE[1]) <= half_h:
                toponyms.append({"t": name, "k": props.get("nature"), "x": round(x), "y": round(y)})

    meta = {
        "grid": {
            "cols": COLS,
            "rows": ROWS,
            "width": round(2 * half_w, 1),
            "height": round(2 * half_h, 1),
            "x": round(CENTRE[0], 1),
            "y": round(CENTRE[1], 1),
        },
        "altitude": {"minimum": minimum, "unit": 0.1, "maximum": round(float(altitudes.max()), 1)},
        "bbox": BBOX,
        "origin": {"lon": LON0, "lat": LAT0},
        "communes": communes,
        "roads": roads,
        "railway": railway,
        "rivers": rivers,
        "lakes": lakes,
        "buildings": buildings,
        "toponyms": toponyms,
    }
    (target / "terrain.json").write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")))
    total = sum(path.stat().st_size for path in target.iterdir())
    print(f"{len(roads)} routes, {len(rivers)} cours d'eau, {len(lakes)} surfaces en eau, {len(buildings)} bâtiments")
    print(f"altitudes {minimum} à {meta['altitude']['maximum']} m ; total {total} octets")


if __name__ == "__main__":
    main()
