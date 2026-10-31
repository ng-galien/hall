import * as THREE from "three";

/** Crée le moteur WebGL, ou signale son absence et affiche directement l'état final. */
export function createRenderer(stage: HTMLElement): THREE.WebGLRenderer | null {
  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(stage.clientWidth, stage.clientHeight, false);
    renderer.domElement.dataset.testid = "launch-canvas";
    stage.append(renderer.domElement);
    return renderer;
  } catch {
    const note = document.querySelector<HTMLElement>("[data-testid='launch-note']");
    if (note) note.hidden = false;
    document.documentElement.style.setProperty("--brand-opacity", "1");
    document.documentElement.style.setProperty("--veil-opacity", "0");
    document.documentElement.dataset.state = "final";
    return null;
  }
}

/** Ajuste la taille du rendu et le cadrage à la fenêtre. */
export function fitToStage(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  stage: HTMLElement,
  onResize?: () => void,
): void {
  const apply = () => {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    onResize?.();
  };
  apply();
  new ResizeObserver(apply).observe(stage);
}

/** Formes Three.js d'un ensemble d'anneaux plans (extérieur puis trous). */
export function shapeFromRings(rings: [number, number][][]): THREE.Shape {
  const [outer, ...holes] = rings;
  const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
  return shape;
}

/** Segments de contour, à la hauteur `z`, pour un ensemble d'anneaux plans. */
export function outlineGeometry(ringSets: [number, number][][][], z: number): THREE.BufferGeometry {
  const positions: number[] = [];
  for (const rings of ringSets) {
    for (const ring of rings) {
      for (let i = 0; i < ring.length - 1; i += 1) {
        positions.push(ring[i][0], ring[i][1], z, ring[i + 1][0], ring[i + 1][1], z);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}
