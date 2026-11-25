import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { cues, type Shot } from "./cues";
import { Sound } from "./audio";
import { buildLens, type Lens } from "./lens";
import { makeMaterials, type Mats } from "./materials";
import { buildEnvironment } from "./studio";

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (t: number) => {
  t = clamp(t);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const SHOT_KEYS = ["frame", "az", "el", "offsetX", "at", "explode", "timeScale"] as const;

const GrainShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, amount: { value: 0.045 } },
  vertexShader:
    "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time; uniform float amount; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float g = hash(vUv * 1500.0) - 0.5;
      float v = smoothstep(1.15, 0.35, distance(vUv, vec2(0.5)));
      float l = dot(c.rgb, vec3(0.299,0.587,0.114)); c.rgb = c.rgb * mix(0.6, 1.0, v) + g * amount * smoothstep(0.0, 0.25, l);
      gl_FragColor = c;
    }`,
};

export interface EngineOpts {
  canvas: HTMLCanvasElement;
  labelsEl: HTMLElement;
  holdEl: HTMLElement;
}

export class Engine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 1, 3000);
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private grain: ShaderPass;
  private mats: Mats;
  private lens: Lens;
  private sound = new Sound();
  private raf = 0;
  private last = 0;

  // one clock drives every moving part
  private time = 0;
  private ringAngle = 0;
  private phase = 0;
  private lastBeat = 0;
  private lastTick = 0;

  private cur: Shot = { ...cues[0].shot };
  private pointer = new THREE.Vector2();
  private pointerT = new THREE.Vector2();
  private tilt = false;
  private holding = false;
  private holdP = 0;
  private locked = false;
  private pulse = 0;

  private pixelRatio: number;
  private fpsAcc = 0;
  private fpsN = 0;
  private fpsSince = 0;
  private slow = 0;
  private labels: { el: HTMLElement; line: SVGPolylineElement; idx: number }[] = [];
  private svg!: SVGSVGElement;
  private sectionEls: HTMLElement[];

  constructor(private o: EngineOpts) {
    const mobile = matchMedia("(pointer: coarse)").matches;
    this.pixelRatio = Math.min(devicePixelRatio, mobile ? 1.75 : 2);
    this.renderer = new THREE.WebGLRenderer({
      canvas: o.canvas,
      antialias: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.setClearColor("#000000");
    this.scene.background = new THREE.Color("#010101");

    this.scene.environment = buildEnvironment(this.renderer);
    this.mats = makeMaterials();
    this.lens = buildLens(this.mats);
    this.scene.add(this.lens.root);
    this.lens.parts.forEach((p) =>
      p.meshes.forEach((mesh) => {
        mesh.userData.mat = mesh.material;
        const lines = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 35), this.mats.line);
        lines.visible = false;
        mesh.add(lines);
      }),
    );

    // MSAA + HDR target → bloom → ACES → grain
    const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(2, 2), 0.1, 0.3, 2.0); // high threshold: glints only
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grain = new ShaderPass(GrainShader);
    this.composer.addPass(this.grain);

    this.sectionEls = cues.map((c) => document.getElementById(c.id)!);
    this.buildLabels();
    this.resize();
    addEventListener("resize", this.resize);
    addEventListener("pointermove", this.onPointer);
  }

  /** Compile every shader behind the loader so nothing hitches on first scroll. */
  async init() {
    this.frame(performance.now());
    await this.renderer.compileAsync(this.scene, this.camera);
  }
  start() {
    this.last = performance.now();
    this.fpsSince = this.last;
    this.raf = requestAnimationFrame(this.loop);
  }
  dispose() {
    cancelAnimationFrame(this.raf);
    removeEventListener("resize", this.resize);
    removeEventListener("pointermove", this.onPointer);
    removeEventListener("deviceorientation", this.onTilt);
    this.composer.dispose();
    this.renderer.dispose();
    this.o.labelsEl.replaceChildren();
  }

  /** Swap every surface for its edges. */
  setBlueprint(on: boolean) {
    this.lens.parts.forEach((p) =>
      p.meshes.forEach((mesh) => {
        const orig = mesh.userData.mat as THREE.Material | THREE.Material[];
        mesh.material = on ? (Array.isArray(orig) ? orig.map(() => this.mats.hidden) : this.mats.hidden) : orig;
        mesh.children.forEach((c) => (c.visible = on));
      }),
    );
  }

  hold(on: boolean) {
    if (on) {
      if (!this.holding) {
        this.sound.enable();
        this.sound.press();
      }
    } else this.locked = false;
    this.holding = on;
  }

  /** Same gesture as the hold: unlocks audio and phone tilt (browsers gate both behind a tap). */
  async enableSensors() {
    this.sound.enable();
    const D = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    try {
      if (D.requestPermission && (await D.requestPermission()) !== "granted") return;
      addEventListener("deviceorientation", this.onTilt);
    } catch {
      /* tilt unavailable */
    }
  }

  private onPointer = (e: PointerEvent) => {
    if (this.tilt) return;
    this.pointerT.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
  };
  private onTilt = (e: DeviceOrientationEvent) => {
    if (e.gamma == null || e.beta == null) return;
    this.tilt = true;
    this.pointerT.set(clamp(e.gamma / 30, -1, 1), clamp((e.beta - 45) / 30, -1, 1));
  };
  private resize = () => {
    const w = innerWidth,
      h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  // ---- scroll → shot ------------------------------------------------------
  private targetShot(): Shot {
    const y = scrollY + innerHeight * 0.35;
    const tops = this.sectionEls.map((e) => e.getBoundingClientRect().top + scrollY);
    let i = tops.length - 1;
    while (i > 0 && y < tops[i]) i--;
    const a = cues[i].shot;
    if (i === cues.length - 1) return a;
    const b = cues[i + 1].shot;
    // hold the shot for the first part of the section, blend over the rest
    const t = smooth(((y - tops[i]) / (tops[i + 1] - tops[i]) - 0.35) / 0.65);
    const out = {} as Shot;
    for (const k of SHOT_KEYS) out[k] = lerp(a[k], b[k], t);
    return out;
  }

  // ---- loop ---------------------------------------------------------------
  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    this.frame(now);
  };

  private frame(now: number) {
    const dt = Math.min(0.1, Math.max(0.001, (now - this.last) / 1000));
    this.last = now;
    this.quality(now, dt);

    const tgt = this.targetShot();
    const k = 1 - Math.exp(-dt * 4.5);
    for (const key of SHOT_KEYS) this.cur[key] += (tgt[key] - this.cur[key]) * k;
    const explode = this.cur.explode;

    // hold-to-focus
    this.holdP = clamp(this.holdP + (this.holding ? dt / 1.1 : -dt / 0.6));
    if (this.holdP >= 1 && !this.locked && this.holding) {
      this.locked = true;
      this.pulse = 1;
      this.sound.lock();
    }
    this.pulse = Math.max(0, this.pulse - dt * 1.6);
    this.o.holdEl.style.setProperty("--p", this.holdP.toFixed(3));

    // one clock: slow motion is one multiply
    const sdt = dt * this.cur.timeScale;
    this.time += sdt;
    this.ringAngle += sdt * (1.2 + 11 * this.holdP * this.holdP);
    this.phase += sdt * 1.3;
    this.lens.ring.rotation.y = this.ringAngle;
    const beat = Math.floor(this.ringAngle / (Math.PI / 6));
    if (beat !== this.lastBeat) {
      this.lastBeat = beat;
      if (now - this.lastTick > 28) {
        this.sound.tick();
        this.lastTick = now;
      }
    }
    const open = lerp(0.5 + 0.5 * Math.sin(this.phase), 1, this.holdP);
    const theta = lerp(0.0, 0.42, open);
    for (const b of this.lens.blades) b.g.rotation.z = b.phi + theta;

    // staggered explode: top parts leave first and come back last
    for (const p of this.lens.parts) {
      const delay = (1 - p.order) * 0.42;
      const t = smooth((explode - delay) / 0.58);
      p.group.position.copy(p.lift).multiplyScalar(t);
    }

    // the studio rotates with the cursor / phone tilt
    this.pointer.lerp(this.pointerT, 1 - Math.exp(-dt * 3));
    this.scene.environmentRotation.set(this.pointer.y * 0.45, -this.pointer.x * 0.8, 0);
    this.scene.environmentIntensity = 1 + this.pulse * 0.9;

    this.placeCamera();
    this.lens.root.updateMatrixWorld(true);
    this.updateLabels();

    this.grain.uniforms.time.value = (now % 1000) / 1000;
    this.composer.render();
  }

  private placeCamera() {
    const s = this.cur;
    const portrait = this.camera.aspect < 1;
    const w = s.frame * (portrait ? lerp(0.8, 0.64, s.explode) : 1); // frame by size, not distance
    const h = w / this.camera.aspect;
    const dist = h / 2 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const az = THREE.MathUtils.degToRad(s.az),
      el = THREE.MathUtils.degToRad(s.el);
    const target = new THREE.Vector3(0, 0, s.at);
    this.camera.position.set(
      target.x + dist * Math.sin(az) * Math.cos(el),
      target.y + dist * Math.sin(el),
      target.z + dist * Math.cos(az) * Math.cos(el),
    );
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    if (portrait) {
      // text sits below the object on phones: lift it instead of shifting sideways
      this.camera.position.addScaledVector(up, -(1 - s.explode) * 0.2 * h);
    } else this.camera.position.addScaledVector(right, -s.offsetX * w);
  }

  // ---- adaptive quality ---------------------------------------------------
  private quality(now: number, dt: number) {
    if (document.hidden) return;
    this.fpsAcc += dt;
    this.fpsN++;
    if (now - this.fpsSince < 2000) return;
    const fps = this.fpsN / this.fpsAcc;
    this.fpsAcc = 0;
    this.fpsN = 0;
    this.fpsSince = now;
    if (fps >= 40) {
      this.slow = 0;
      return;
    }
    if (++this.slow < 2) return;
    this.slow = 0;
    if (this.pixelRatio > 1) {
      this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.composer.setPixelRatio(this.pixelRatio);
    } else this.bloom.enabled = false;
  }

  // ---- callouts: two clean columns with leader lines ----------------------
  private buildLabels() {
    const ns = "http://www.w3.org/2000/svg";
    this.svg = document.createElementNS(ns, "svg");
    this.svg.setAttribute("class", "leaders");
    this.o.labelsEl.append(this.svg);
    this.lens.parts.forEach((p, idx) => {
      const el = document.createElement("div");
      el.className = "callout";
      el.innerHTML = `<b>${String(idx + 1).padStart(2, "0")} · ${p.name}</b><span>${p.spec}</span>`;
      const line = document.createElementNS(ns, "polyline");
      this.svg.append(line);
      this.o.labelsEl.append(el);
      this.labels.push({ el, line, idx });
    });
  }

  private updateLabels() {
    const w = innerWidth,
      h = innerHeight;
    const vis = smooth((this.cur.explode - 0.6) / 0.35) * (w >= 760 ? 1 : 0);
    this.o.labelsEl.style.opacity = String(vis);
    if (vis < 0.01) return;
    const v = new THREE.Vector3();
    const items = this.labels.map((l) => {
      const part = this.lens.parts[l.idx];
      part.group.localToWorld(v.copy(part.anchor));
      v.project(this.camera);
      return { l, x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
    });
    items.sort((a, b) => a.x - b.x);
    const half = Math.ceil(items.length / 2);
    const colW = 200,
      margin = 32,
      gap = Math.min(62, (h * 0.5) / half);
    [items.slice(0, half), items.slice(half)].forEach((col, ci) => {
      col.sort((a, b) => (ci === 0 ? a.x - b.x : b.x - a.x));
      const x = ci === 0 ? margin : w - margin - colW;
      col.forEach((it, i) => {
        const y = h * 0.14 + i * gap;
        it.l.el.style.transform = `translate(${x}px, ${y}px)`;
        const ex = ci === 0 ? x + colW : x;
        const bend = ci === 0 ? 14 : -14;
        it.l.line.setAttribute("points", `${it.x},${it.y} ${ex + bend},${y + 14} ${ex},${y + 14}`);
      });
    });
  }
}
