import * as THREE from "three";

/** A bevelled ribbon on the existing transfer arc. Its surface and travelling light share the story clock. */
export function createSharingLink(curve: THREE.Curve<THREE.Vector3>) {
  const segments = 192;
  const bevel = 0.004;
  const section = [
    [-1, -0.32],
    [-1, 0.32],
    [-0.78, 0.5],
    [-0.6, 0.5],
    [0, 0.5],
    [0.6, 0.5],
    [0.78, 0.5],
    [1, 0.32],
    [1, -0.32],
    [0.78, -0.5],
    [-0.78, -0.5],
  ];
  const tones = [
    0x12386b, 0x2a73bc, 0x78d7f6, 0x2683c6, 0x145aa7, 0x2683c6, 0x78d7f6, 0x2a73bc, 0x12386b, 0x102b51, 0x102b51,
  ].map((hex) => new THREE.Color(hex));
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= segments; i++) {
    const along = i / segments;
    section.forEach(([x, y], j) => {
      const u = i === 0 ? bevel * (y + 0.5) : i === segments ? 1 - bevel * (y + 0.5) : along;
      const point = curve.getPoint(u);
      const tangent = curve.getTangent(u).normalize();
      const side = new THREE.Vector3().crossVectors(up, tangent).normalize();
      const normal = new THREE.Vector3().crossVectors(tangent, side).normalize();
      const shape = Math.sin(Math.PI * u) ** 0.8;
      const halfWidth = 0.35 + 3.2 * shape;
      const thickness = 0.35 + 0.75 * shape;
      positions.push(
        ...point
          .addScaledVector(side, x * halfWidth)
          .addScaledVector(normal, y * thickness)
          .toArray(),
      );
      colors.push(...tones[j].toArray());
      uvs.push(u, (x + 1) / 2);
      if (i < segments) {
        const a = i * section.length + j;
        const b = i * section.length + ((j + 1) % section.length);
        indices.push(a, a + section.length, b, b, a + section.length, b + section.length);
      }
    });
  }
  const bodyCount = indices.length;
  const capColor = new THREE.Color(0x70bce6);
  const caps: number[][] = [];
  for (const end of [0, 1]) {
    const points = section.map((_, j) =>
      new THREE.Vector3().fromArray(positions, (end * segments * section.length + j) * 3),
    );
    const centrePoint = points.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / section.length);
    const centre = positions.length / 3;
    positions.push(...centrePoint.toArray());
    colors.push(...capColor.toArray());
    uvs.push(end, 0.5);
    const cap: number[] = [];
    points.forEach((point, j) => {
      positions.push(...point.toArray());
      colors.push(...capColor.toArray());
      uvs.push(end, (section[j][0] + 1) / 2);
      const a = centre + 1 + j;
      const b = centre + 1 + ((j + 1) % section.length);
      cap.push(centre, end ? a : b, end ? b : a);
    });
    caps.push(cap);
  }
  const allIndices = [...caps[0], ...indices, ...caps[1]];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(allIndices);
  geometry.computeVertexNormals();
  const travel = { value: 0 };
  const active = { value: 0 };
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.4,
    roughness: 0.32,
    emissive: 0x133968,
    emissiveIntensity: 0.25,
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.01,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uLinkTravel = travel;
    shader.uniforms.uLinkActive = active;
    shader.vertexShader = `varying vec2 vLinkUv;\nvarying float vLinkDepth;\n${shader.vertexShader}`
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLinkUv = uv;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvLinkDepth = -mvPosition.z;");
    shader.fragmentShader =
      `varying vec2 vLinkUv;\nvarying float vLinkDepth;\nuniform float uLinkTravel;\nuniform float uLinkActive;\n${shader.fragmentShader}`
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
      float edge = smoothstep(0.72, 0.96, abs(vLinkUv.y * 2.0 - 1.0));
      float inset = 1.0 - edge;
      float chevron = pow(max(0.0, cos(vLinkUv.x * 180.0 - uLinkTravel * 36.0 - abs(vLinkUv.y - 0.5) * 4.0)), 18.0);
      float head = exp(-pow((vLinkUv.x - uLinkTravel) / 0.038, 2.0));
      totalEmissiveRadiance += vec3(0.12, 0.48, 0.72) * (edge * 0.42 + inset * uLinkActive * (chevron * 0.55 + head * 1.6));`,
        )
        .replace(
          "#include <alphatest_fragment>",
          `// Keep the ribbon from covering the frame when the camera passes close to it.
        diffuseColor.a *= smoothstep(8.0, 20.0, vLinkDepth);
        #include <alphatest_fragment>`,
        );
  };
  material.customProgramCacheKey = () => "sharing-ribbon";
  const object = new THREE.Mesh(geometry, material);
  object.visible = false;
  return {
    object,
    update(drawn: number, progress: number) {
      object.visible = drawn > 0;
      geometry.setDrawRange(
        0,
        drawn >= 1 ? allIndices.length : caps[0].length + Math.floor(drawn * segments) * (bodyCount / segments),
      );
      travel.value = progress;
      active.value = progress > 0 && progress < 1 ? 1 : 0;
    },
  };
}
