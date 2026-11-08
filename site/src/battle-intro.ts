import * as THREE from "three";
import type { LabelBox } from "./label-layout";
import { type Ground, SCALE } from "./relief";
import { siegeSites } from "./siege-layout";
import { publicFileUrl } from "./site-root";
import type { Frame } from "./terrain";
import { dark } from "./theme";

/** Arrival-only battle diagram; not a surveyed historical boundary. */
export function buildBattleIntro(stage: HTMLElement, material: THREE.ShaderMaterial, reduced: boolean, ground: Ground) {
  const roman = new THREE.Vector3(siegeSites.plain.x * SCALE, 0, -siegeSites.plain.y * SCALE);
  const gaul = new THREE.Vector3(siegeSites.granary.x * SCALE, 0, -siegeSites.granary.y * SCALE);
  const centre = roman.clone().lerp(gaul, 0.5);
  const right = gaul.clone().sub(roman).normalize();
  const along = new THREE.Vector3(right.z, 0, -right.x);
  const front: THREE.Vector3[] = [];
  let previous = 0;
  for (let i = 0; i < 33; i++) {
    const y = 600 - i * 37.5;
    let chosen = previous;
    let best = Infinity;
    const corridor = 110 + Math.min(100, Math.abs(y) * 0.45);
    for (let x = -corridor; x <= corridor; x += 5) {
      const at = centre.clone().addScaledVector(along, y).addScaledVector(right, x);
      const h = ground.height(at.x / SCALE, -at.z / SCALE);
      const cost = h + Math.abs(x - previous) * 0.18 + Math.abs(x) * 0.025;
      if (cost < best) {
        best = cost;
        chosen = x;
      }
    }
    previous = previous * 0.25 + chosen * 0.75;
    const at = centre.clone().addScaledVector(along, y).addScaledVector(right, previous);
    at.y = ground.height(at.x / SCALE, -at.z / SCALE) + 1;
    front.push(at);
  }
  const frontCurve = new THREE.CatmullRomCurve3(front);
  const camera = new THREE.OrthographicCamera(-400, 400, 400, -400, 5, 7000);
  camera.up.set(right.z, 0, -right.x);
  camera.position.copy(centre).add(new THREE.Vector3(0, 2200, 0));
  camera.lookAt(centre);
  camera.updateMatrixWorld();
  const host = document.querySelector<HTMLElement>(".intro")!;
  const copy = document.createElement("div");
  copy.className = "battle-intro-copy";
  copy.dataset.testid = "battle-intro-copy";
  const date = document.createElement("p");
  date.className = "battle-intro-date";
  date.textContent = "52 av. J.-C.";
  const title = document.createElement("p");
  title.className = "battle-intro-title";
  title.textContent = "Bataille d’Alésia";
  copy.append(date, title);
  host.prepend(copy);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("battle-intro-map");
  svg.dataset.testid = "battle-intro-map";
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "52 avant Jésus-Christ. Camp de César à gauche, Alésia de Vercingétorix à droite.");
  svg.innerHTML = `<defs><clipPath id="battle-line-reveal"><rect /></clipPath></defs>
    <path class="battle-intro-line" clip-path="url(#battle-line-reveal)" />`;
  const ns = "http://www.w3.org/2000/svg";
  const tones = { roman: dark ? 0xc59c79 : 0x9d734c, gaul: dark ? 0x88ace5 : 0x3c72bb };
  const names = [
    { file: "caesar", side: "roman", lines: ["Camp de", "César"] },
    { file: "vercingetorix", side: "gaul", lines: ["Alésia de", "Vercingétorix"] },
  ].map(({ file, side, lines }) => {
    const group = document.createElementNS(ns, "g");
    group.classList.add("battle-intro-camp");
    group.dataset.testid = `battle-intro-${side}`;
    group.style.setProperty("--camp-tone", `#${tones[side as keyof typeof tones].toString(16).padStart(6, "0")}`);
    const medallion = document.createElementNS(ns, "g");
    medallion.classList.add("battle-intro-medallion");
    const cutout = document.createElementNS(ns, "clipPath");
    cutout.id = `battle-portrait-${side}`;
    const circle = document.createElementNS(ns, "circle");
    circle.setAttribute("cx", "0");
    circle.setAttribute("cy", "0");
    circle.setAttribute("r", "36");
    cutout.append(circle);
    medallion.append(cutout);
    const background = circle.cloneNode(true) as SVGCircleElement;
    background.classList.add("battle-intro-portrait-bg");
    const image = document.createElementNS(ns, "image");
    image.setAttribute("href", publicFileUrl(`figures/${file}.webp`));
    image.setAttribute("x", "-82");
    image.setAttribute("y", "-39");
    image.setAttribute("width", "164");
    image.setAttribute("height", "246");
    image.setAttribute("clip-path", `url(#${cutout.id})`);
    const name = document.createElementNS(ns, "text");
    name.classList.add("battle-intro-name", `is-${side}`);
    name.setAttribute("text-anchor", "middle");
    lines.forEach((line, index) => {
      const span = document.createElementNS(ns, "tspan");
      span.setAttribute("x", "0");
      span.setAttribute("y", String(index * 19));
      span.textContent = line;
      name.append(span);
    });
    const ring = circle.cloneNode(true) as SVGCircleElement;
    ring.classList.add("battle-intro-ring");
    ring.setAttribute("r", "40");
    ring.setAttribute("pathLength", "1");
    ring.setAttribute("transform", "rotate(-90)");
    ring.setAttribute("stroke-dasharray", "1");
    ring.setAttribute("stroke-dashoffset", "1");
    medallion.append(background, image, ring);
    group.append(medallion, name);
    svg.append(group);
    return group;
  });
  stage.append(svg);
  const line = svg.querySelector("path")!;
  const clip = svg.querySelector("rect")!;
  material.uniforms.uBattleIntro = { value: 0 };
  material.uniforms.uBattleCentre = { value: new THREE.Vector2(centre.x, centre.z) };
  material.uniforms.uBattleRight = { value: new THREE.Vector2(right.x, right.z) };
  material.uniforms.uBattleFront = {
    value: front.map((p) => new THREE.Vector2(p.clone().sub(centre).dot(along), p.clone().sub(centre).dot(right))),
  };
  material.uniforms.uBattleRoman = { value: new THREE.Color(tones.roman) };
  material.uniforms.uBattleGaul = { value: new THREE.Color(tones.gaul) };
  material.fragmentShader =
    `uniform float uBattleIntro; uniform vec2 uBattleCentre; uniform vec2 uBattleRight;
    uniform vec3 uBattleRoman; uniform vec3 uBattleGaul; uniform vec2 uBattleFront[33];\n` +
    material.fragmentShader.replace(
      "float reveal =",
      `
    float alongFront = dot(vWorld.xz - uBattleCentre, vec2(uBattleRight.y, -uBattleRight.x));
    float boundary = uBattleFront[32].y;
    for (int i = 0; i < 32; i++) {
      if (alongFront >= uBattleFront[i + 1].x) {
        float t = clamp((alongFront - uBattleFront[i + 1].x) / (uBattleFront[i].x - uBattleFront[i + 1].x), 0.0, 1.0);
        boundary = mix(uBattleFront[i + 1].y, uBattleFront[i].y, t);
        break;
      }
    }
    float side = dot(vWorld.xz - uBattleCentre, uBattleRight) - boundary;
    float ink = exp(-pow(length(vWorld.xz - uBattleCentre) / 340.0, 4.0)) * uBattleIntro * 0.19;
    color = mix(color, mix(uBattleRoman, uBattleGaul, smoothstep(-3.0, 3.0, side)), ink);
    float reveal =`,
    );
  material.needsUpdate = true;
  const occupied: LabelBox[] = [];
  let active = false;
  let seconds = 0;
  const duration = 7;
  let exitSeconds: number | null = null;
  let exitInk = 0;
  const exitDuration = 0.7;
  function finishExit() {
    exitSeconds = null;
    document.body.classList.remove("has-battle-intro");
    svg.style.display = "none";
    copy.hidden = true;
    material.uniforms.uBattleIntro.value = 0;
    host.style.removeProperty("--battle-exit-opacity");
  }
  let area: Frame = { left: 0, top: 0, width: 1, height: 1 };
  let portraitScale = 1;
  function update() {
    const fade = (start: number, duration = 1) => Math.max(0, Math.min(1, (seconds - start) / duration));
    date.style.opacity = title.style.opacity = String(fade(3, 1.5));
    const drawing = fade(3, 4);
    names.forEach((name, i) => {
      const progress = Math.max(0, Math.min(1, (drawing - 0.06 - i * 0.3) / 0.62));
      const eased = progress * progress * (3 - 2 * progress);
      name.style.opacity = String(eased);
      if (i === 1) host.style.setProperty("--battle-link-opacity", String(eased));
      name.querySelector(".battle-intro-ring")!.setAttribute("stroke-dashoffset", String(1 - eased));
      name
        .querySelector(".battle-intro-medallion")!
        .setAttribute("transform", `translate(0 -50) scale(${portraitScale * (0.94 + 0.06 * eased)})`);
    });
    clip.setAttribute("height", String(stage.clientHeight * drawing));
    material.uniforms.uBattleIntro.value = active ? fade(3, 4) : 0;
    stage.dataset.introProgress = String(Math.min(1, seconds / duration));
  }
  return {
    camera,
    centre,
    occupied,
    get active() {
      return active;
    },
    get elapsed() {
      return seconds;
    },
    get ready() {
      return active && seconds >= duration;
    },
    start() {
      exitSeconds = null;
      svg.style.opacity = "1";
      host.style.removeProperty("--battle-exit-opacity");
      active = true;
      seconds = reduced ? duration : 0;
      document.body.classList.add("has-battle-intro");
      document.documentElement.classList.remove("intro-pending");
      svg.style.display = "";
      copy.hidden = false;
      stage.dataset.intro = reduced ? "ready" : "running";
      update();
    },
    stop(animate = false) {
      active = false;
      stage.dataset.intro = "off";
      if (animate && !reduced) {
        exitInk = material.uniforms.uBattleIntro.value;
        exitSeconds = 0;
      } else finishExit();
    },
    layout(width: number, height: number, free: Frame) {
      const head = host.getBoundingClientRect();
      const frame = stage.getBoundingClientRect();
      const top = Math.max(free.top, head.bottom - frame.top + 20);
      area = {
        left: free.left + 12,
        top,
        width: free.width - 24,
        height: Math.max(100, free.top + free.height - top - 34),
      };
      const span = roman.distanceTo(gaul) * 1.95;
      const worldWidth = (span * width) / area.width;
      camera.left = -worldWidth / 2;
      camera.right = worldWidth / 2;
      camera.top = (worldWidth * height) / width / 2;
      camera.bottom = -camera.top;
      camera.setViewOffset(
        width,
        height,
        width / 2 - area.left - area.width / 2,
        height / 2 - area.top - area.height / 2,
        width,
        height,
      );
      camera.updateProjectionMatrix();
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      const points = frontCurve.getPoints(100).map((at) => {
        const p = at.project(camera);
        return [((p.x + 1) / 2) * width, ((1 - p.y) / 2) * height];
      });
      const first = points[0];
      const last = points[points.length - 1];
      if (first[1] > 0) points.unshift([first[0], 0]);
      if (last[1] < height) points.push([last[0], height]);
      line.setAttribute("d", points.map(([x, y], i) => `${i ? "L" : "M"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" "));
      clip.setAttribute("x", "0");
      clip.setAttribute("y", "0");
      clip.setAttribute("width", String(width));
      portraitScale = width < 620 ? 8 / 9 : 1;
      occupied.length = 0;
      names.forEach((name, i) => {
        const at = (i ? gaul : roman).clone().project(camera);
        const nx = ((at.x + 1) / 2) * width;
        const clearance = Math.max(40, Math.min(130, area.width * 0.075));
        const ny = ((1 - at.y) / 2) * height - clearance - 28;
        name.setAttribute("transform", `translate(${nx.toFixed(2)} ${ny.toFixed(2)})`);
        occupied.push({ x: nx - 68, y: ny - 96, width: 136, height: 124 });
      });
      update();
    },
    tick(delta: number) {
      if (exitSeconds !== null) {
        exitSeconds = Math.min(exitDuration, exitSeconds + delta);
        const progress = exitSeconds / exitDuration;
        const opacity = 1 - progress * progress * (3 - 2 * progress);
        svg.style.opacity = String(opacity);
        host.style.setProperty("--battle-exit-opacity", String(opacity));
        material.uniforms.uBattleIntro.value = exitInk * opacity;
        if (exitSeconds >= exitDuration) finishExit();
        return true;
      }
      if (!active || seconds >= duration) return false;
      seconds = Math.min(duration, seconds + delta);
      update();
      stage.dataset.intro = seconds >= duration ? "ready" : "running";
      return true;
    },
    dispose() {
      this.stop();
      copy.remove();
      svg.remove();
      host.style.removeProperty("--battle-link-opacity");
    },
  };
}
