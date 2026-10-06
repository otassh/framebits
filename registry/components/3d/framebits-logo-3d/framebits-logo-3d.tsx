"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Component,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import {
  ACESFilmicToneMapping,
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  EquirectangularReflectionMapping,
  FloatType,
  Group,
  LinearSRGBColorSpace,
  MathUtils,
  Mesh,
  MeshPhysicalMaterial,
  PMREMGenerator,
  PointLight,
  RectAreaLight,
  RGBAFormat,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
} from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

export interface FrameBitsLogo3DProps {
  className?: string;
  style?: CSSProperties;
  /** Mount-time intro flag. Change the React key to replay the reveal. */
  intro?: boolean;
  interactive?: boolean;
  quality?: "auto" | "high" | "low";
  /** Glow strength, clamped to 0-2. */
  intensity?: number;
  /** Opt into subtle scroll depth relative to this component. */
  scroll?: boolean;
  onIntroComplete?: () => void;
}

interface MotionInput {
  x: number;
  y: number;
  scroll: number;
}

interface SceneProps {
  low: boolean;
  active: boolean;
  reduced: boolean;
  intro: boolean;
  intensity: number;
  input: RefObject<MotionInput>;
  glow: RefObject<HTMLDivElement | null>;
  onIntroComplete?: () => void;
}

const clamp = (value: number): number => MathUtils.clamp(value, 0, 1);
const smooth = (value: number): number => {
  const progress = clamp(value);
  return progress * progress * progress * (progress * (progress * 6 - 15) + 10);
};
const phase = (time: number, start: number, duration: number): number =>
  smooth((time - start) / duration);
const degrees = Math.PI / 180;
const projectX = (value: number): number => (value - 642) / 100;
const projectY = (value: number): number => (610 - value) / 100;

function createOutline(kind: "upper" | "lower" | "tail"): Shape {
  const shape = new Shape();
  const move = (x: number, y: number): void => {
    shape.moveTo(projectX(x), projectY(y));
  };
  const curve = (
    firstX: number,
    firstY: number,
    secondX: number,
    secondY: number,
    endX: number,
    endY: number,
  ): void => {
    shape.bezierCurveTo(
      projectX(firstX),
      projectY(firstY),
      projectX(secondX),
      projectY(secondY),
      projectX(endX),
      projectY(endY),
    );
  };
  const line = (x: number, y: number): void => {
    shape.lineTo(projectX(x), projectY(y));
  };

  if (kind === "upper") {
    move(413, 468);
    line(518, 468);
    curve(575, 468, 597, 440, 614, 392);
    curve(637, 326, 674, 296, 732, 296);
    line(946, 296);
    curve(994, 296, 1031, 332, 1031, 379);
    curve(1031, 427, 994, 465, 945, 465);
    line(705, 465);
    curve(651, 465, 621, 483, 596, 526);
    curve(577, 560, 559, 577, 518, 577);
    line(413, 577);
    curve(382, 577, 358, 553, 358, 523);
    curve(358, 493, 382, 468, 413, 468);
  } else if (kind === "lower") {
    move(418, 670);
    line(516, 670);
    curve(565, 670, 585, 646, 601, 603);
    curve(623, 542, 656, 513, 706, 513);
    line(842, 513);
    curve(886, 513, 918, 546, 918, 590);
    curve(918, 633, 885, 666, 842, 666);
    line(706, 666);
    curve(648, 666, 621, 689, 598, 729);
    curve(578, 764, 558, 783, 518, 783);
    line(418, 783);
    curve(386, 783, 360, 758, 360, 726);
    curve(360, 695, 386, 670, 418, 670);
  } else {
    move(422, 816);
    curve(471, 815, 508, 807, 530, 775);
    curve(552, 743, 570, 699, 613, 689);
    curve(607, 725, 610, 759, 606, 791);
    curve(599, 866, 551, 923, 478, 924);
    line(423, 924);
    curve(391, 924, 365, 901, 365, 871);
    curve(365, 841, 389, 817, 422, 816);
  }
  shape.closePath();
  return shape;
}

function createRibbon(kind: "upper" | "lower" | "tail", low: boolean): BufferGeometry {
  const points = createOutline(kind).getPoints(90);
  const min = Math.min(...points.map((point) => point.x));
  const max = Math.max(...points.map((point) => point.x));
  const rings = low ? 108 : 196;
  const sides = low ? 32 : 56;
  const positions: number[] = [];
  const flow: number[] = [];
  const indices: number[] = [];

  for (let ring = 0; ring <= rings; ring += 1) {
    const progress = ring / rings;
    const x = min + (max - min) * (0.000002 + progress * 0.999996);
    const crossings: number[] = [];
    for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex += 1) {
      const current = points[pointIndex];
      const next = points[pointIndex + 1];
      if (current === undefined || next === undefined) continue;
      if ((current.x <= x && next.x > x) || (next.x <= x && current.x > x)) {
        crossings.push(current.y + ((next.y - current.y) * (x - current.x)) / (next.x - current.x));
      }
    }
    const lower = Math.min(...crossings);
    const upper = Math.max(...crossings);
    const centerY = (lower + upper) / 2;
    const radiusY = (upper - lower) / 2;
    const depth =
      (kind === "tail" ? 0.15 : 0.23) * Math.min(1, Math.sqrt(Math.max(0, radiusY) / 0.25));

    for (let side = 0; side <= sides; side += 1) {
      const angle = (side / sides) * Math.PI * 2;
      const cosine = Math.cos(angle);
      const z = depth * Math.sign(cosine) * Math.pow(Math.abs(cosine), 0.52);
      positions.push(x, centerY + radiusY * Math.sin(angle), z);
      flow.push(progress);
      if (ring < rings && side < sides) {
        const index = ring * (sides + 1) + side;
        const nextRing = index + sides + 1;
        indices.push(index, nextRing, index + 1, nextRing, nextRing + 1, index + 1);
      }
    }
  }

  for (let side = 1; side < sides - 1; side += 1) {
    indices.push(0, side + 1, side);
    const last = rings * (sides + 1);
    indices.push(last, last + side, last + side + 1);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("aFlow", new BufferAttribute(new Float32Array(flow), 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute("normal");
  for (let ring = 0; ring <= rings; ring += 1) {
    const first = ring * (sides + 1);
    const last = first + sides;
    const normalX = normals.getX(first) + normals.getX(last);
    const normalY = normals.getY(first) + normals.getY(last);
    const normalZ = normals.getZ(first) + normals.getZ(last);
    const length = Math.hypot(normalX, normalY, normalZ) || 1;
    normals.setXYZ(first, normalX / length, normalY / length, normalZ / length);
    normals.setXYZ(last, normalX / length, normalY / length, normalZ / length);
  }
  geometry.computeBoundingSphere();
  geometry.userData["startX"] = min;
  geometry.userData["startY"] =
    kind === "upper" ? projectY(523) : kind === "lower" ? projectY(726) : projectY(870);
  return geometry;
}

const dots = [
  { position: [projectX(506), projectY(379), 0.03] as const, radius: 0.49 },
  { position: [projectX(299), projectY(631), 0.01] as const, radius: 0.445 },
  { position: [projectX(423), projectY(871), 0.09] as const, radius: 0.54 },
];

function createMaterial(low: boolean, tail = false) {
  const uniforms = {
    uTime: { value: 0 },
    uForm: { value: 1 },
    uOrigin: { value: [0, 0] },
    uSweep: { value: -4 },
    uSignal: { value: -4 },
    uEnergy: { value: 1 },
    uIsRibbon: { value: 1 },
  };
  const material = new MeshPhysicalMaterial({
    color: "#ffffff",
    metalness: 0.08,
    roughness: 0.31,
    clearcoat: 1,
    clearcoatRoughness: 0.23,
    transmission: low ? 0 : 0.09,
    thickness: 0.45,
    ior: 1.46,
    attenuationColor: new Color("#ff6a26"),
    attenuationDistance: 1.4,
    emissive: "#ff4918",
    emissiveIntensity: 0.15,
    envMapIntensity: 0.5,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `
      attribute float aFlow;
      uniform float uForm;
      uniform vec2 uOrigin;
      uniform float uIsRibbon;
      varying vec3 vBrandPosition;
      varying float vBrandFlow;
      ${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `
      #include <begin_vertex>
      vBrandPosition=position;
      vBrandFlow=aFlow;
      if(uIsRibbon>0.5) {
        float growth=max(0.001,uForm);
        float squash=mix(0.035,1.0,pow(growth,0.72));
        transformed.x=uOrigin.x+(position.x-uOrigin.x)*growth;
        transformed.y=uOrigin.y+(position.y-uOrigin.y)*squash;
        transformed.z=position.z*mix(0.04,1.0,smoothstep(0.0,0.85,growth));
      }
    `,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <beginnormal_vertex>",
      `
      #include <beginnormal_vertex>
      if(uIsRibbon>0.5) {
        float growth=max(0.001,uForm);
        objectNormal/=vec3(growth,mix(0.035,1.0,pow(growth,0.72)),mix(0.04,1.0,smoothstep(0.0,0.85,growth)));
      }
    `,
    );
    shader.fragmentShader = `
      uniform float uTime,uSweep,uSignal,uEnergy;
      varying vec3 vBrandPosition;
      varying float vBrandFlow;
      ${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `
      #include <color_fragment>
      float warmth=clamp(0.42+vBrandPosition.y*0.085+vBrandPosition.x*0.075
        +0.045*sin(vBrandPosition.x*1.1-uTime*0.24+vBrandPosition.y*0.5),0.0,1.0);
      vec3 red=vec3(0.92,0.024,0.004);
      vec3 orange=vec3(1.0,0.135,0.009);
      vec3 amber=vec3(1.0,0.49,0.065);
      vec3 body=mix(red,orange,smoothstep(0.0,0.52,warmth));
      body=mix(body,amber,smoothstep(0.43,1.0,warmth));
      diffuseColor.rgb*=body*${tail ? "0.53" : "1.0"};
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `
      #include <emissivemap_fragment>
      float signal=exp(-pow((vBrandFlow-uSignal)*7.5,2.0));
      float sweep=exp(-pow((vBrandPosition.x-vBrandPosition.y*0.6-uSweep)*1.3,2.0));
      float edge=pow(1.0-max(dot(normal,normalize(vViewPosition)),0.0),2.5);
      totalEmissiveRadiance*=uEnergy*(0.8+0.2*sin(uTime*0.45+vBrandPosition.x));
      totalEmissiveRadiance+=vec3(1.0,0.38,0.045)*(signal*0.24+sweep*0.16)*(0.4+edge*0.6)*uEnergy;
    `,
    );
  };
  material.customProgramCacheKey = () => `framebits-physical-v1-${tail ? "tail" : "front"}`;
  return { material, uniforms };
}

function createStudioMap(): DataTexture {
  const width = 256;
  const height = 128;
  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const horizontal = x / width;
      const vertical = y / height;
      const softbox = (
        centerX: number,
        centerY: number,
        spreadX: number,
        spreadY: number,
      ): number =>
        Math.exp(
          -Math.pow((horizontal - centerX) / spreadX, 8) -
            Math.pow((vertical - centerY) / spreadY, 8),
        );
      const key = softbox(0.72, 0.31, 0.12, 0.08) * 2.2;
      const rim = softbox(0.22, 0.52, 0.045, 0.22) * 1.7;
      const fill = softbox(0.5, 0.65, 0.18, 0.12) * 0.13;
      const index = (y * width + x) * 4;
      data[index] = 0.025 + key + rim + fill;
      data[index + 1] = 0.018 + key * 0.8 + rim * 0.22 + fill * 0.55;
      data[index + 2] = 0.013 + key * 0.52 + rim * 0.025 + fill * 0.3;
      data[index + 3] = 1;
    }
  }
  const map = new DataTexture(data, width, height, RGBAFormat, FloatType);
  map.mapping = EquirectangularReflectionMapping;
  map.colorSpace = LinearSRGBColorSpace;
  map.needsUpdate = true;
  return map;
}

function PostProcessing({ low, intensity }: { low: boolean; intensity: number }) {
  const { gl, scene, camera, size, invalidate } = useThree();
  const state = useRef<{ composer: EffectComposer; bloom: UnrealBloomPass } | null>(null);

  useEffect(() => {
    if (low) return undefined;
    const composer = new EffectComposer(gl);
    composer.renderTarget1.samples = 4;
    composer.renderTarget2.samples = 4;
    const render = new RenderPass(scene, camera);
    const bloom = new UnrealBloomPass(new Vector2(512, 512), 0.18 * intensity, 0.55, 0.95);
    const output = new OutputPass();
    composer.addPass(render);
    composer.addPass(bloom);
    composer.addPass(output);
    state.current = { composer, bloom };
    invalidate();
    return () => {
      state.current = null;
      bloom.dispose();
      output.dispose();
      render.dispose();
      composer.dispose();
    };
  }, [camera, gl, intensity, invalidate, low, scene]);

  useEffect(() => {
    state.current?.composer.setPixelRatio(gl.getPixelRatio());
    state.current?.composer.setSize(size.width, size.height);
    if (state.current !== null) state.current.bloom.strength = 0.18 * intensity;
    invalidate();
  }, [gl, intensity, invalidate, size.height, size.width]);

  useFrame((_, delta) => {
    if (state.current !== null) state.current.composer.render(delta);
    else gl.render(scene, camera);
  }, 1);
  return null;
}

function FrameBitsScene({
  low,
  active,
  reduced,
  intro,
  intensity,
  input,
  glow,
  onIntroComplete,
}: SceneProps) {
  const root = useRef<Group>(null);
  const dotRefs = useRef<Array<Mesh | null>>([]);
  const key = useRef<RectAreaLight>(null);
  const accent = useRef<PointLight>(null);
  const elapsed = useRef(0);
  const done = useRef(false);
  const callback = useRef(onIntroComplete);
  const { gl, scene, viewport, invalidate } = useThree();
  const resources = useMemo(() => {
    const ribbons = (["upper", "lower", "tail"] as const).map((kind) => {
      const geometry = createRibbon(kind, low);
      const surface = createMaterial(low, kind === "tail");
      surface.uniforms.uOrigin.value = [
        Number(geometry.userData["startX"]),
        Number(geometry.userData["startY"]),
      ];
      surface.uniforms.uForm.value = intro ? 0 : 1;
      return { kind, geometry, ...surface };
    });
    const sphere = new SphereGeometry(1, low ? 32 : 56, low ? 24 : 40);
    sphere.setAttribute(
      "aFlow",
      new BufferAttribute(new Float32Array(sphere.getAttribute("position").count), 1),
    );
    const dotMaterials = dots.map(() => {
      const dotMaterial = createMaterial(low);
      dotMaterial.uniforms.uIsRibbon.value = 0;
      return dotMaterial;
    });
    return { ribbons, sphere, dotMaterials };
  }, [intro, low]);

  useEffect(() => {
    callback.current = onIntroComplete;
  }, [onIntroComplete]);
  useEffect(
    () => () => {
      for (const ribbon of resources.ribbons) {
        ribbon.geometry.dispose();
        ribbon.material.dispose();
      }
      resources.sphere.dispose();
      for (const dotMaterial of resources.dotMaterials) dotMaterial.material.dispose();
    },
    [resources],
  );
  useEffect(() => {
    RectAreaLightUniformsLib.init();
    const generator = new PMREMGenerator(gl);
    const source = createStudioMap();
    const result = generator.fromEquirectangular(source);
    const previous = scene.environment;
    scene.environment = result.texture;
    source.dispose();
    generator.dispose();
    invalidate();
    return () => {
      scene.environment = previous;
      result.dispose();
    };
  }, [gl, invalidate, scene]);

  const fit = Math.min((viewport.width * 0.8) / 7.85, (viewport.height * 0.76) / 6.35);
  useFrame((_, rawDelta) => {
    if (root.current === null) return;
    const delta = Math.min(rawDelta, 0.05);
    if (active && !reduced) elapsed.current += delta;
    const time = reduced || !intro ? Math.max(3.45, elapsed.current + 3.45) : elapsed.current;
    const idle = Math.max(0, time - 3.45);
    const settled = phase(time, 1.55, 1.85);
    const motion = reduced ? 0 : 1;
    const targetX = input.current.x * motion;
    const targetY = input.current.y * motion;
    const scroll = reduced ? 0 : input.current.scroll;
    root.current.scale.setScalar(fit);
    root.current.position.y = motion * 0.025 * Math.sin((idle * Math.PI * 2) / 6.8) * settled;
    root.current.position.z = MathUtils.damp(root.current.position.z, -0.32 * scroll, 3, delta);
    const rotationX = (1.3 + targetY * 3 + motion * 0.35 * Math.sin(idle * 0.35)) * degrees;
    const rotationY =
      (2.5 + targetX * 4 + motion * 0.55 * Math.sin(idle * 0.27) - 8 * (1 - settled)) * degrees;
    if (reduced) {
      root.current.rotation.set(1.3 * degrees, 2.5 * degrees, 0);
    } else {
      root.current.rotation.x = MathUtils.damp(root.current.rotation.x, rotationX, 3.4, delta);
      root.current.rotation.y = MathUtils.damp(root.current.rotation.y, rotationY, 3.4, delta);
      root.current.rotation.z = motion * 0.22 * degrees * Math.sin(idle * 0.31);
    }

    const cycle = (idle - 1.7) % 6.8;
    const signal = !reduced && idle > 1.7 && cycle < 2.2 ? -0.18 + (cycle / 2.2) * 1.48 : -4;
    const sweep = !reduced && time > 2.05 && time < 3.35 ? -6 + phase(time, 2.05, 1.3) * 12 : -20;
    resources.ribbons.forEach((ribbon, index) => {
      const form =
        reduced || !intro
          ? 1
          : phase(time, index === 0 ? 0.82 : index === 1 ? 1.02 : 1.28, index === 2 ? 1.48 : 1.55);
      ribbon.uniforms.uForm.value = form;
      ribbon.uniforms.uTime.value = reduced ? 0 : idle;
      ribbon.uniforms.uSignal.value = signal;
      ribbon.uniforms.uSweep.value = sweep;
      ribbon.uniforms.uEnergy.value = intensity * (0.9 + 0.22 * (1 - settled)) * form;
      ribbon.material.thickness = 0.45 + motion * 0.018 * Math.sin(idle * 0.62 + index * 0.4);
    });
    dots.forEach((dot, index) => {
      const mesh = dotRefs.current[index];
      if (mesh === null || mesh === undefined) return;
      const born = reduced || !intro ? 1 : phase(time, 0.34 + index * 0.11, 0.6);
      const overshoot = 1 + 0.022 * Math.sin(clamp((time - 0.34 - index * 0.11) / 0.82) * Math.PI);
      const signalResponse =
        signal > -0.3 && signal < 0.12
          ? Math.exp(-Math.pow((signal + 0.07 - index * 0.03) * 12, 2))
          : 0;
      const breathe =
        motion * (0.006 * Math.sin(idle * 0.82 - index * 0.65) + signalResponse * 0.01);
      const scale = Math.max(0.0001, born) * dot.radius * (overshoot + breathe);
      mesh.scale.set(scale, scale, scale * 0.55);
      const material = resources.dotMaterials[index];
      if (material === undefined) return;
      material.uniforms.uEnergy.value =
        intensity * (1 + signalResponse * 0.38 + motion * 0.05 * Math.sin(idle * 1.1 - index));
      material.uniforms.uTime.value = reduced ? 0 : idle + index * 0.3;
      material.uniforms.uSweep.value = sweep;
      material.uniforms.uSignal.value = -4;
      mesh.visible = born > 0.001;
    });
    if (key.current !== null) {
      key.current.position.x = MathUtils.damp(
        key.current.position.x,
        3.5 + targetX * 1.3,
        2.5,
        delta,
      );
      key.current.position.y = MathUtils.damp(
        key.current.position.y,
        5 + targetY * 0.8,
        2.5,
        delta,
      );
      key.current.lookAt(0, 0, 0);
      key.current.intensity = 7 * (reduced ? 1 : phase(time, 0.2, 1.2));
    }
    if (accent.current !== null) {
      const sweepProgress = phase(time, 2.05, 1.3);
      accent.current.position.set(-4 + sweepProgress * 8, 4 - sweepProgress * 6, 5);
      accent.current.intensity = reduced ? 0 : 28 * Math.sin(sweepProgress * Math.PI);
    }
    if (glow.current !== null) {
      glow.current.style.opacity = String(
        (0.48 + motion * 0.025 * Math.sin(idle * 0.5)) * (reduced ? 1 : phase(time, 0.12, 1.4)),
      );
      glow.current.style.transform = `translate(${String(targetX * 3)}px, ${String(-targetY * 2)}px) scale(${String(1 - scroll * 0.04)})`;
    }
    if (time >= 3.45 && !done.current) {
      done.current = true;
      callback.current?.();
    }
  });

  return (
    <>
      <ambientLight intensity={0.28} />
      <rectAreaLight
        ref={key}
        position={[3.5, 5, 6]}
        color="#ffdfad"
        intensity={7}
        width={6}
        height={3}
      />
      <pointLight position={[-5, 1, -2]} color="#ff491a" intensity={55} decay={2} />
      <pointLight position={[-1, -3, 5]} color="#ff6a36" intensity={13} decay={2} />
      <pointLight ref={accent} position={[-4, 4, 5]} color="#ffd166" intensity={0} decay={2} />
      <group ref={root}>
        {resources.ribbons.map((ribbon) => (
          <mesh
            key={ribbon.kind}
            geometry={ribbon.geometry}
            material={ribbon.material}
            position-z={ribbon.kind === "tail" ? -0.18 : 0}
            frustumCulled={false}
            dispose={null}
          />
        ))}
        {dots.map((dot, index) => (
          <mesh
            key={dot.position.join(":")}
            ref={(node) => {
              dotRefs.current[index] = node;
            }}
            position={[...dot.position]}
            scale={intro && !reduced ? 0.0001 : dot.radius}
            geometry={resources.sphere}
            material={resources.dotMaterials[index]?.material}
            dispose={null}
          />
        ))}
      </group>
      <PostProcessing low={low} intensity={intensity} />
    </>
  );
}

function StaticLogo() {
  const gradient = useId().replace(/:/g, "");
  return (
    <svg
      aria-hidden="true"
      viewBox="180 215 940 790"
      style={{ width: "80%", height: "76%", position: "absolute", inset: 0, margin: "auto" }}
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="1" x2="1" y2="0">
          <stop stopColor="#ff3b16" />
          <stop offset=".55" stopColor="#ff5a1f" />
          <stop offset="1" stopColor="#ffd166" />
        </linearGradient>
      </defs>
      <g fill={`url(#${gradient})`}>
        <path
          opacity=".65"
          d="M422 816C471 815 508 807 530 775C552 743 570 699 613 689C607 725 610 759 606 791C599 866 551 923 478 924H423C391 924 365 901 365 871C365 841 389 817 422 816Z"
        />
        <path d="M413 468H518C575 468 597 440 614 392C637 326 674 296 732 296H946C994 296 1031 332 1031 379C1031 427 994 465 945 465H705C651 465 621 483 596 526C577 560 559 577 518 577H413C382 577 358 553 358 523C358 493 382 468 413 468Z" />
        <path d="M418 670H516C565 670 585 646 601 603C623 542 656 513 706 513H842C886 513 918 546 918 590C918 633 885 666 842 666H706C648 666 621 689 598 729C578 764 558 783 518 783H418C386 783 360 758 360 726C360 695 386 670 418 670Z" />
        <circle cx="506" cy="379" r="49" />
        <circle cx="299" cy="631" r="44.5" />
        <circle cx="423" cy="871" r="54" />
      </g>
    </svg>
  );
}

class RenderBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render(): ReactNode {
    return this.state.failed ? <StaticLogo /> : this.props.children;
  }
}

function ContextLoss({ onLost }: { onLost: () => void }) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (event: Event): void => {
      event.preventDefault();
      onLost();
    };
    canvas.addEventListener("webglcontextlost", lost);
    return () => canvas.removeEventListener("webglcontextlost", lost);
  }, [gl, onLost]);
  return null;
}

/** A self-contained realtime 3D emblem with no external assets or global CSS. */
export function FrameBitsLogo3D({
  className,
  style,
  intro = true,
  interactive = true,
  quality = "auto",
  intensity = 1,
  scroll = false,
  onIntroComplete,
}: FrameBitsLogo3DProps) {
  const host = useRef<HTMLDivElement>(null);
  const glow = useRef<HTMLDivElement>(null);
  const input = useRef<MotionInput>({ x: 0, y: 0, scroll: 0 });
  const [mounted, setMounted] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [compact, setCompact] = useState(false);
  const [inView, setInView] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const [lost, setLost] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const small = window.matchMedia("(max-width: 767px), (pointer: coarse)");
    const update = (): void => {
      setReduced(motion.matches);
      setCompact(small.matches);
    };
    const visibility = (): void => setTabVisible(!document.hidden);
    update();
    visibility();
    setMounted(true);
    motion.addEventListener("change", update);
    small.addEventListener("change", update);
    document.addEventListener("visibilitychange", visibility);
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry?.isIntersecting === true),
      { threshold: 0 },
    );
    if (host.current !== null) observer.observe(host.current);
    return () => {
      observer.disconnect();
      motion.removeEventListener("change", update);
      small.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  useEffect(() => {
    if (!interactive || reduced) {
      input.current.x = 0;
      input.current.y = 0;
    }
  }, [interactive, reduced]);
  useEffect(() => {
    if (!scroll) {
      input.current.scroll = 0;
      return undefined;
    }
    const update = (): void => {
      if (host.current !== null) {
        const box = host.current.getBoundingClientRect();
        input.current.scroll = Math.min(1, Math.max(0, -box.top / Math.max(1, box.height)));
      }
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [scroll]);

  const low = quality === "low" || (quality === "auto" && compact);
  const strength = Number.isFinite(intensity) ? Math.min(2, Math.max(0, intensity)) : 1;
  const active = inView && tabVisible;
  return (
    <div
      ref={host}
      className={className}
      role="img"
      aria-label="FrameBits logo"
      style={{
        position: "relative",
        width: "100%",
        height: "clamp(320px, 65vw, 720px)",
        isolation: "isolate",
        overflow: "hidden",
        background: "#050505",
        ...style,
      }}
      onPointerMove={(event) => {
        if (!interactive || reduced || event.pointerType !== "mouse") return;
        const box = event.currentTarget.getBoundingClientRect();
        input.current.x = Math.max(
          -1,
          Math.min(1, ((event.clientX - box.left) / box.width) * 2 - 1),
        );
        input.current.y = Math.max(
          -1,
          Math.min(1, ((event.clientY - box.top) / box.height) * 2 - 1),
        );
      }}
      onPointerLeave={() => {
        input.current.x = 0;
        input.current.y = 0;
      }}
    >
      <div
        ref={glow}
        aria-hidden="true"
        style={{
          pointerEvents: "none",
          position: "absolute",
          inset: "3%",
          opacity: 0,
          background:
            "radial-gradient(ellipse at 53% 46%, rgba(139,39,4,.28) 0%, rgba(101,24,3,.13) 30%, transparent 65%)",
        }}
      />
      {!mounted || lost ? (
        <StaticLogo />
      ) : (
        <RenderBoundary>
          <Canvas
            aria-hidden="true"
            fallback={<StaticLogo />}
            frameloop={active && !reduced ? "always" : "demand"}
            dpr={[1, low ? 1.25 : 1.75]}
            camera={{ position: [0, 0, 18], fov: 32, near: 0.1, far: 60 }}
            gl={{
              alpha: true,
              antialias: true,
              powerPreference: low ? "low-power" : "high-performance",
              toneMapping: ACESFilmicToneMapping,
              outputColorSpace: SRGBColorSpace,
            }}
            onCreated={({ gl: renderer }) => {
              renderer.setClearColor("#050505", 0);
              renderer.toneMappingExposure = 1.08;
            }}
            onContextMenu={(event) => event.preventDefault()}
          >
            <ContextLoss onLost={() => setLost(true)} />
            <FrameBitsScene
              low={low}
              active={active}
              reduced={reduced}
              intro={intro}
              intensity={strength}
              input={input}
              glow={glow}
              onIntroComplete={onIntroComplete}
            />
          </Canvas>
        </RenderBoundary>
      )}
    </div>
  );
}

export default FrameBitsLogo3D;
