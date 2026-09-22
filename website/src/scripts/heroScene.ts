// heroScene.ts — THE ONLY file that imports `three`.
// Keeping all three usage here guarantees Vite emits three into a single async
// chunk that is fetched only when HeroAssemble.astro dynamically import()s this
// module (i.e. only on eligible desktops when the hero scrolls into view).
//
// Scene: 5 "module" cards (POS / Kitchen / Inventory / Delivery / Accounting)
// that start exploded in space and lerp into a tight, unified stack — the
// "5 tools → one platform" story — as setProgress() is driven by scroll.

import * as THREE from 'three';

export interface HeroModuleSpec {
  key: string;
  label: string;
  color: string;          // edge-glow + accent
  offset: [number, number, number]; // exploded position (world units)
}

export interface HeroSceneOpts {
  modules: HeroModuleSpec[];
}

export interface HeroSceneHandle {
  setProgress: (t: number) => void;
  start: () => void;
  stop: () => void;
  dispose: () => void;
}

const CARD_W = 1.7;
const CARD_H = 1.06;
const CARD_D = 0.12;

// Docked (assembled) transforms — a tight fanned stack near the origin so the
// five cards read as one solid unit. Index-matched to opts.modules order.
const DOCKED: { pos: [number, number, number]; rotZ: number }[] = [
  { pos: [ 0.00,  0.00,  0.00], rotZ:  0.00 },
  { pos: [ 0.34,  0.17, -0.34], rotZ:  0.04 },
  { pos: [-0.34, -0.17, -0.68], rotZ: -0.05 },
  { pos: [ 0.20, -0.34, -1.02], rotZ:  0.06 },
  { pos: [-0.22,  0.33, -1.36], rotZ: -0.04 },
];

/** Draw a module label onto a 2D canvas → CanvasTexture (no font assets shipped). */
function makeLabelTexture(label: string, color: string): THREE.CanvasTexture {
  const w = 512, h = 320;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  // Card body (dark slate, matches app UI)
  ctx.fillStyle = '#0f172a';
  roundRect(ctx, 0, 0, w, h, 28); ctx.fill();
  // Accent top bar
  ctx.fillStyle = color;
  roundRect(ctx, 0, 0, w, 54, 28); ctx.fill();
  ctx.fillRect(0, 30, w, 24);
  // Three faux "window dots"
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  [40, 74, 108].forEach((x) => { ctx.beginPath(); ctx.arc(x, 27, 7, 0, Math.PI * 2); ctx.fill(); });
  // Label text
  ctx.fillStyle = '#f1f5f9';
  ctx.font = '700 62px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 40, h / 2 + 26);
  // Faux UI rows
  ctx.fillStyle = 'rgba(148,163,184,.5)';
  roundRect(ctx, 40, h - 78, w - 80, 16, 8); ctx.fill();
  roundRect(ctx, 40, h - 48, (w - 80) * 0.62, 16, 8); ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function init(canvas: HTMLCanvasElement, opts: HeroSceneOpts): HeroSceneHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);

  // Lights: soft key + cool fill (no shadows — cheap + clean).
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(3, 4, 6);
  const fill = new THREE.DirectionalLight(0xbfdbfe, 0.8);
  fill.position.set(-4, -2, 2);
  scene.add(key, fill, new THREE.AmbientLight(0xffffff, 0.55));

  const bodyGeo = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_D);
  const edgeGeo = new THREE.EdgesGeometry(bodyGeo);
  const labelGeo = new THREE.PlaneGeometry(CARD_W * 0.92, CARD_H * 0.86);

  interface Mod {
    group: THREE.Group;
    exploded: THREE.Vector3;
    docked: THREE.Vector3;
    explodedRot: THREE.Euler;
    dockedRotZ: number;
    edgeMat: THREE.LineBasicMaterial;
    labelMat: THREE.MeshBasicMaterial;
    bodyMat: THREE.MeshStandardMaterial;
    labelTex: THREE.CanvasTexture;
  }

  const mods: Mod[] = opts.modules.slice(0, 5).map((spec, i) => {
    const group = new THREE.Group();
    const col = new THREE.Color(spec.color);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b, roughness: 0.42, metalness: 0.12,
      emissive: col, emissiveIntensity: 0.0,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);

    const edgeMat = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.55 });
    const edges = new THREE.LineSegments(edgeGeo, edgeMat);

    const labelTex = makeLabelTexture(spec.label, spec.color);
    const labelMat = new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, opacity: 0.0 });
    const label = new THREE.Mesh(labelGeo, labelMat);
    label.position.z = CARD_D / 2 + 0.002;

    group.add(body, edges, label);

    const exploded = new THREE.Vector3(...spec.offset);
    const docked = new THREE.Vector3(...DOCKED[i].pos);
    // Exploded: each card tumbled at a distinct angle for a "scattered" look.
    const explodedRot = new THREE.Euler(
      (i - 2) * 0.28, (i % 2 ? 1 : -1) * (0.5 + i * 0.12), (i - 2) * 0.16,
    );
    group.position.copy(exploded);
    group.rotation.copy(explodedRot);
    scene.add(group);

    return { group, exploded, docked, explodedRot, dockedRotZ: DOCKED[i].rotZ, edgeMat, labelMat, bodyMat, labelTex };
  });

  // Camera path: pulls in + levels out as the stack assembles.
  const camFar = new THREE.Vector3(0.2, 0.4, 9.2);
  const camNear = new THREE.Vector3(0.0, 0.15, 6.1);

  let progress = 0;
  let raf = 0;
  let running = false;

  function resize() {
    const w = canvas.clientWidth || canvas.offsetWidth || 1;
    const h = canvas.clientHeight || canvas.offsetHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function apply(t: number) {
    const e = t; // already eased by the caller
    for (let i = 0; i < mods.length; i++) {
      const m = mods[i];
      m.group.position.lerpVectors(m.exploded, m.docked, e);
      m.group.rotation.set(
        lerp(m.explodedRot.x, 0, e),
        lerp(m.explodedRot.y, 0, e),
        lerp(m.explodedRot.z, m.dockedRotZ, e),
      );
      m.edgeMat.opacity = lerp(0.4, 0.95, e);
      m.bodyMat.emissiveIntensity = lerp(0.0, 0.35, e);
      // Labels fade in over the back half of the assembly.
      m.labelMat.opacity = Math.max(0, (e - 0.35) / 0.65);
    }
    camera.position.lerpVectors(camFar, camNear, e);
    camera.lookAt(0, 0, -0.6);
  }

  function renderOnce() { resize(); apply(progress); renderer.render(scene, camera); }

  function loop() {
    if (!running) return;
    apply(progress);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  }

  const onResize = () => { resize(); if (!running) renderer.render(scene, camera); };
  window.addEventListener('resize', onResize, { passive: true });

  // Initial frame so the crossfade has something to reveal.
  renderOnce();

  return {
    setProgress(t: number) {
      progress = Math.min(1, Math.max(0, t));
      if (!running) { apply(progress); renderer.render(scene, camera); }
    },
    start() { if (!running) { running = true; raf = requestAnimationFrame(loop); } },
    stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; },
    dispose() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      bodyGeo.dispose(); edgeGeo.dispose(); labelGeo.dispose();
      mods.forEach((m) => { m.edgeMat.dispose(); m.labelMat.dispose(); m.bodyMat.dispose(); m.labelTex.dispose(); });
      renderer.dispose();
    },
  };
}
