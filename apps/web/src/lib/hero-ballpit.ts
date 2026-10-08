/**
 * Adapted from the user's supplied Ballpit: instanced physical spheres,
 * environment reflections, sphere collisions, and a pointer collider.
 * Scoped to the hero; pointer events never prevent scrolling or link clicks.
 */
import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  MeshPhysicalMaterial,
  Object3D,
  PerspectiveCamera,
  Plane,
  PMREMGenerator,
  PointLight,
  Raycaster,
  Scene,
  ShaderChunk,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export function createHeroBallpit(
  canvas: HTMLCanvasElement,
  hero: HTMLElement,
): { dispose: () => void } {
  const compact = hero.clientWidth < 760;
  const count = compact ? 38 : 76;
  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, compact ? 1 : 1.5));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  const camera = new PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 20);
  const environment = new RoomEnvironment();
  const pmrem = new PMREMGenerator(renderer);
  const environmentTarget = pmrem.fromScene(environment, 0.04);
  environment.dispose();
  pmrem.dispose();

  const css = getComputedStyle(hero);
  const palette = ["--violet", "--accent", "--cyan"].map(
    (token) => new Color(css.getPropertyValue(token).trim()),
  );
  const material = new MeshPhysicalMaterial({
    envMap: environmentTarget.texture,
    envMapIntensity: 0.8,
    metalness: 0.35,
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
  });
  material.envMapRotation.x = -Math.PI / 2;
  // Preserve the soft scattering of the supplied sphere material.
  material.defines = { ...material.defines, USE_UV: "" };
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "void main() {",
      `
      void RE_HeroScattering(const in IncidentLight directLight, const in vec3 geometryNormal,
        const in vec3 geometryViewDir, inout ReflectedLight reflectedLight) {
        vec3 halfVector = normalize(directLight.direction + geometryNormal * 0.1);
        float scattering = pow(saturate(dot(geometryViewDir, -halfVector)), 2.0);
        reflectedLight.directDiffuse += scattering * diffuse * directLight.color * 0.3;
      }
      void main() {
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_fragment_begin>",
      ShaderChunk.lights_fragment_begin.replaceAll(
        "RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );",
        `RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
         RE_HeroScattering(directLight, geometryNormal, geometryViewDir, reflectedLight);`,
      ),
    );
  };
  const geometry = new SphereGeometry(1, 24, 16);
  const spheres = new InstancedMesh(geometry, material, count);
  spheres.instanceMatrix.setUsage(DynamicDrawUsage);
  // The geometry moves every frame; use the hero's bounds rather than a stale bounding sphere.
  spheres.frustumCulled = false;
  scene.add(spheres, new AmbientLight(0xc8c3ff, 1.25));
  const orangeLight = new PointLight(palette[1], 110);
  orangeLight.position.set(4, 6, 8);
  const violetLight = new PointLight(palette[0], 85);
  violetLight.position.set(-5, 3, 6);
  scene.add(orangeLight, violetLight);

  const positions: Vector3[] = [];
  const velocities: Vector3[] = [];
  const radii: number[] = [];
  const transform = new Object3D();
  const offset = new Vector3();
  const pointer = new Vector2();
  const pointerPosition = new Vector3();
  const plane = new Plane(new Vector3(0, 0, 1), 0);
  const raycaster = new Raycaster();
  let pointerActive = false;
  let maxX = 5;
  let maxY = 5;
  const maxZ = 2;

  const resize = (): void => {
    const width = Math.max(hero.clientWidth, 1);
    const height = Math.max(hero.clientHeight, 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    maxY = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
    maxX = maxY * camera.aspect;
  };
  resize();
  for (let index = 0; index < count; index++) {
    const radius = (0.35 + Math.random() * 0.55) * (compact ? 0.6 : 1);
    radii.push(radius);
    positions.push(
      new Vector3(
        (Math.random() * 2 - 1) * (maxX - radius),
        (Math.random() * 2 - 1) * (maxY - radius),
        (Math.random() * 2 - 1) * (maxZ - radius),
      ),
    );
    velocities.push(
      new Vector3(
        (Math.random() - 0.5) * 0.035,
        (Math.random() - 0.5) * 0.025,
        (Math.random() - 0.5) * 0.02,
      ),
    );
    // Violet leads, orange carries the brand accent, cyan is a restrained highlight.
    const color = palette[index % 10 < 5 ? 0 : index % 10 < 9 ? 1 : 2];
    if (color !== undefined) spheres.setColorAt(index, color);
  }
  if (spheres.instanceColor !== null) spheres.instanceColor.needsUpdate = true;

  let simulationTime = 0;
  const update = (): void => {
    simulationTime += 1 / 60;
    for (let index = 0; index < count; index++) {
      const position = positions[index];
      const velocity = velocities[index];
      const radius = radii[index];
      if (position === undefined || velocity === undefined || radius === undefined) continue;
      // A zero-gravity variation keeps the background in motion across the hero
      // instead of letting every sphere settle below the first screen.
      velocity.x += Math.sin(simulationTime * 0.4 + index) * 0.00008;
      velocity.y += Math.cos(simulationTime * 0.35 + index * 2) * 0.00008;
      velocity.multiplyScalar(0.999).clampLength(0, 0.09);
      position.add(velocity);
      for (let other = index + 1; other < count; other++) {
        const otherPosition = positions[other];
        const otherVelocity = velocities[other];
        const otherRadius = radii[other];
        if (otherPosition === undefined || otherVelocity === undefined || otherRadius === undefined)
          continue;
        offset.copy(otherPosition).sub(position);
        const distance = offset.length();
        const combinedRadius = radius + otherRadius;
        if (distance < combinedRadius) {
          if (distance < 0.0001) offset.set(1, 0, 0);
          offset.normalize().multiplyScalar((combinedRadius - distance) * 0.5);
          position.sub(offset);
          otherPosition.add(offset);
          velocity.addScaledVector(offset, -0.16);
          otherVelocity.addScaledVector(offset, 0.16);
        }
      }
      if (pointerActive) {
        offset.copy(position).sub(pointerPosition);
        const distance = offset.length();
        if (distance < radius + 1.15) {
          if (distance < 0.0001) offset.set(1, 0, 0);
          offset.normalize().multiplyScalar((radius + 1.15 - distance) * 0.2);
          position.add(offset);
          velocity.addScaledVector(offset, 0.18);
        }
      }
      const xBoundary = Math.max(radius, maxX - radius);
      if (Math.abs(position.x) > xBoundary) {
        position.x = Math.sign(position.x) * xBoundary;
        velocity.x *= -0.92;
      }
      if (position.y < -maxY + radius) {
        position.y = -maxY + radius;
        velocity.y = Math.abs(velocity.y) * 0.95;
      } else if (position.y > maxY - radius) {
        position.y = maxY - radius;
        velocity.y = -Math.abs(velocity.y) * 0.95;
      }
      if (Math.abs(position.z) > maxZ - radius) {
        position.z = Math.sign(position.z) * (maxZ - radius);
        velocity.z *= -0.92;
      }
    }
  };

  const draw = (): void => {
    for (let index = 0; index < count; index++) {
      const position = positions[index];
      const radius = radii[index];
      if (position === undefined || radius === undefined) continue;
      transform.position.copy(position);
      transform.scale.setScalar(radius);
      transform.updateMatrix();
      spheres.setMatrixAt(index, transform.matrix);
    }
    spheres.instanceMatrix.needsUpdate = true;
    renderer.render(scene, camera);
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType !== "mouse") return;
    const rect = hero.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    pointerActive = raycaster.ray.intersectPlane(plane, pointerPosition) !== null;
  };
  const onPointerLeave = (): void => {
    pointerActive = false;
  };
  hero.addEventListener("pointermove", onPointerMove, { passive: true });
  hero.addEventListener("pointerleave", onPointerLeave);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(hero);

  let frame = 0;
  let visible = false;
  let running = false;
  let disposed = false;
  let contextLost = false;
  let previousTime = 0;
  let accumulator = 0;
  const animate = (time: number): void => {
    if (!running || disposed) return;
    frame = requestAnimationFrame(animate);
    const elapsed = Math.min((time - previousTime) / 1000, 0.05);
    if (elapsed < 1 / 30) return;
    previousTime = time;
    accumulator += elapsed;
    while (accumulator >= 1 / 60) {
      update();
      accumulator -= 1 / 60;
    }
    draw();
  };
  const syncAnimation = (): void => {
    const next = visible && !document.hidden && !disposed && !contextLost;
    if (next === running) return;
    running = next;
    if (running) {
      previousTime = performance.now();
      accumulator = 0;
      frame = requestAnimationFrame(animate);
    } else cancelAnimationFrame(frame);
  };
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false;
    syncAnimation();
  });
  intersectionObserver.observe(hero);
  document.addEventListener("visibilitychange", syncAnimation);
  const onContextLost = (event: Event): void => {
    event.preventDefault();
    contextLost = true;
    running = false;
    cancelAnimationFrame(frame);
    canvas.dataset.ready = "false";
  };
  canvas.addEventListener("webglcontextlost", onContextLost);
  draw();

  return {
    dispose: (): void => {
      disposed = true;
      running = false;
      cancelAnimationFrame(frame);
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", syncAnimation);
      hero.removeEventListener("pointermove", onPointerMove);
      hero.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      scene.clear();
      spheres.dispose();
      geometry.dispose();
      material.dispose();
      environmentTarget.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
