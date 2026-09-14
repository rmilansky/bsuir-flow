import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export type LogoPalette = 'blue' | 'peach' | 'lavender';
export type LogoScene = {
  setPalette: (palette: LogoPalette) => void;
  setMotion: (enabled: boolean) => void;
  reset: () => void;
  dispose: () => void;
};

const palettes = {
  blue: { body: '#5474d5', side: '#3452ac', detail: '#fff3db', accent: '#eab078' },
  peach: { body: '#e6a382', side: '#bf7359', detail: '#fff4df', accent: '#768fc7' },
  lavender: { body: '#a38bca', side: '#785ca0', detail: '#fff4e4', accent: '#e7b771' },
};

function polygon(points: number[][]) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y));
  shape.closePath();
  return shape;
}

function letterShape(letter: string) {
  let shape: THREE.Shape;
  const hole = (points: number[][]) => {
    const path = new THREE.Path();
    points.forEach(([x, y], i) => i === 0 ? path.moveTo(x, y) : path.lineTo(x, y));
    path.closePath(); shape.holes.push(path);
  };
  if (letter === 'B') {
    shape = polygon([[0, 0], [0, 1], [.65, 1], [.86, .83], [.86, .61], [.7, .51], [.9, .37], [.9, .18], [.68, 0]]);
    hole([[.23, .6], [.57, .6], [.63, .66], [.63, .76], [.56, .8], [.23, .8]]);
    hole([[.23, .21], [.59, .21], [.66, .27], [.66, .36], [.58, .4], [.23, .4]]);
  } else if (letter === 'S') {
    shape = polygon([[0, .17], [.16, 0], [.69, 0], [.9, .2], [.9, .43], [.73, .56], [.25, .67], [.25, .78], [.65, .78], [.67, .67], [.9, .67], [.9, .83], [.73, 1], [.2, 1], [0, .83], [0, .6], [.18, .45], [.65, .34], [.65, .22], [.25, .22], [.23, .33], [0, .33]]);
  } else if (letter === 'U') {
    shape = polygon([[0, 1], [0, .2], [.2, 0], [.7, 0], [.9, .2], [.9, 1], [.65, 1], [.65, .3], [.57, .23], [.33, .23], [.25, .3], [.25, 1]]);
  } else if (letter === 'I') {
    shape = polygon([[0, 0], [0, .21], [.22, .21], [.22, .79], [0, .79], [0, 1], [.7, 1], [.7, .79], [.48, .79], [.48, .21], [.7, .21], [.7, 0]]);
  } else {
    shape = polygon([[0, 0], [0, 1], [.65, 1], [.87, .83], [.87, .58], [.66, .42], [.95, 0], [.66, 0], [.4, .4], [.25, .4], [.25, 0]]);
    hole([[.25, .6], [.57, .6], [.64, .66], [.64, .74], [.57, .8], [.25, .8]]);
  }
  return shape;
}

export function createLogoScene(canvas: HTMLCanvasElement, onFailure: () => void): LogoScene {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .95;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-4.5, 4.5, 3.1, -3.1, .1, 100);
  camera.position.set(0, 0, 14);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .04);
  scene.environment = environment.texture;
  scene.environmentIntensity = .75;
  room.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight('#fff8e9', '#8b87ba', 1.2));
  const key = new THREE.DirectionalLight('#fff2d5', 2.8);
  key.position.set(-3, 5, 8); scene.add(key);
  const rim = new THREE.DirectionalLight('#c1d5ff', 1.3);
  rim.position.set(4, -2, 5); scene.add(rim);

  const bodyMaterial = new THREE.MeshPhysicalMaterial({ color: palettes.blue.body, metalness: .12, roughness: .26, clearcoat: .85, clearcoatRoughness: .22 });
  const sideMaterial = new THREE.MeshPhysicalMaterial({ color: palettes.blue.side, metalness: .1, roughness: .3, clearcoat: .65 });
  const detailMaterial = new THREE.MeshPhysicalMaterial({ color: palettes.blue.detail, roughness: .27, clearcoat: .9, metalness: .08 });
  const accentMaterial = new THREE.MeshPhysicalMaterial({ color: palettes.blue.accent, roughness: .27, clearcoat: 1, metalness: .12 });
  const lilacMaterial = new THREE.MeshPhysicalMaterial({ color: '#b9a4d7', roughness: .3, clearcoat: .8 });
  const mintMaterial = new THREE.MeshPhysicalMaterial({ color: '#9ab7a6', roughness: .3, clearcoat: .9 });
  const creamMaterial = new THREE.MeshPhysicalMaterial({ color: '#f5e8d3', roughness: .3, clearcoat: .7 });
  const model = new THREE.Group(); scene.add(model);
  const medallion = new THREE.Group(); model.add(medallion);
  const back = new THREE.Mesh(new RoundedBoxGeometry(3.25, 3.35, .48, 5, .34), sideMaterial);
  back.position.z = -.11; medallion.add(back);
  const body = new THREE.Mesh(new RoundedBoxGeometry(3.2, 3.3, .36, 5, .33), bodyMaterial);
  body.position.z = .09; medallion.add(body);

  const relief = (shape: THREE.Shape, material: THREE.Material, depth = .11, bevel = .025) => {
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: bevel, bevelThickness: bevel, curveSegments: 20 });
    return new THREE.Mesh(geometry, material);
  };
  const word = new THREE.Group();
  let x = 0;
  for (const letter of 'BSUIR') {
    const glyph = relief(letterShape(letter), detailMaterial, .1, .015);
    glyph.scale.setScalar(.53); glyph.position.set(x, 0, 0); word.add(glyph);
    x += (letter === 'I' ? .7 : .9) * .53 + .085;
  }
  word.position.set(-(x - .085) / 2, -.05, .33); medallion.add(word);

  // Three ascending radio traces and an eight-point spark echo BSUIR's identity.
  for (let i = 0; i < 3; i++) {
    const wave = new THREE.Shape();
    const y = .74 + i * .19;
    wave.moveTo(-1.05, y - .22);
    wave.bezierCurveTo(-.65, y + .03, -.25, y - .14, .2, y + .09);
    wave.lineTo(.26, y + .19);
    wave.bezierCurveTo(-.25, y - .01, -.67, y + .14, -1.05, y - .11);
    wave.closePath();
    const strip = relief(wave, detailMaterial, .075, .018); strip.position.z = .34; medallion.add(strip);
  }
  const star = polygon(Array.from({ length: 16 }, (_, i) => {
    const angle = i * Math.PI / 8;
    const radius = i % 2 ? .11 : i % 4 ? .23 : .36;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius];
  }));
  const spark = relief(star, accentMaterial, .12, .018);
  spark.position.set(.87, 1.01, .35); spark.rotation.z = .12; medallion.add(spark);

  const tube = (points: THREE.Vector3[], radius: number, material: THREE.Material, closed = false) => {
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, closed), 48, radius, 6, closed), material);
    return mesh;
  };
  const globe = new THREE.Group(); globe.position.set(0, -.66, .35);
  const globeRadius = .7;
  globe.add(tube(Array.from({ length: 65 }, (_, i) => { const a = Math.PI * 2 * i / 64; return new THREE.Vector3(Math.cos(a) * globeRadius, Math.sin(a) * .48, 0); }), .024, detailMaterial));
  for (const scale of [.42, .78]) {
    globe.add(tube(Array.from({ length: 65 }, (_, i) => { const a = Math.PI * 2 * i / 64; return new THREE.Vector3(Math.cos(a) * globeRadius * scale, Math.sin(a) * .48, .006); }), .016, detailMaterial));
  }
  for (const y of [-.24, 0, .24]) {
    const extent = globeRadius * Math.sqrt(1 - (y / .48) ** 2);
    globe.add(tube([new THREE.Vector3(-extent, y, .012), new THREE.Vector3(0, y - .035, .012), new THREE.Vector3(extent, y, .012)], .019, detailMaterial));
  }
  medallion.add(globe);

  const satellite = (geometry: THREE.BufferGeometry, material: THREE.Material, position: number[]) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position[0], position[1], position[2]); model.add(mesh); return mesh;
  };
  const codeTile = satellite(new RoundedBoxGeometry(.91, .9, .3, 4, .18), lilacMaterial, [-2.25, .75, .18]);
  codeTile.rotation.set(.2, .3, -.26);
  const bracket = polygon([[-.12, .21], [-.24, .21], [-.24, .09], [-.32, 0], [-.24, -.09], [-.24, -.21], [-.12, -.21], [-.12, -.1], [-.19, 0], [-.12, .1]]);
  for (const sign of [-1, 1]) {
    const mark = relief(bracket, detailMaterial, .025, .008); mark.position.z = .18; mark.scale.x = sign; codeTile.add(mark);
  }
  const diamond = satellite(new RoundedBoxGeometry(.67, .67, .26, 3, .1), mintMaterial, [2.14, -.63, .52]);
  diamond.rotation.set(.22, -.28, Math.PI / 4);
  const holeRing = satellite(new THREE.TorusGeometry(.33, .115, 16, 48), accentMaterial, [2, 1.28, -.26]);
  holeRing.rotation.set(.5, -.5, -.3);
  const bead = satellite(new THREE.SphereGeometry(.16, 24, 16), accentMaterial, [-1.98, -1.06, .2]);
  const smallBead = satellite(new THREE.SphereGeometry(.09, 20, 12), creamMaterial, [1.42, 1.93, .15]);
  const tinyBead = satellite(new THREE.SphereGeometry(.065, 20, 12), lilacMaterial, [-1.35, 1.96, -.1]);
  model.rotation.set(-.14, -.3, -.09);

  let targetX = -.14, targetY = -.3, hoverX = 0, hoverY = 0;
  let motion = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let visible = true, disposed = false, frame = 0;
  let lastTime = 0, time = 0;
  let pointer: { id: number; x: number; y: number } | null = null;
  const render = () => { if (!disposed) renderer.render(scene, camera); };
  const animate = (now: number) => {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
    if (!visible || document.hidden) { lastTime = now; return; }
    const delta = Math.min((now - lastTime) / 1000 || 0, .04); lastTime = now;
    const moving = Math.abs(model.rotation.x - (targetX + hoverY)) + Math.abs(model.rotation.y - (targetY + hoverX)) > .0005;
    if (!motion && !moving) return;
    if (motion) time += delta;
    model.rotation.x += (targetX + hoverY - model.rotation.x) * .1;
    model.rotation.y += (targetY + hoverX - model.rotation.y) * .1;
    model.position.y = motion ? Math.sin(time * .85) * .055 : 0;
    if (motion) {
      codeTile.position.y = .75 + Math.sin(time * 1.1) * .1;
      diamond.position.y = -.63 + Math.sin(time + 1) * .1;
      holeRing.rotation.z = -.3 + Math.sin(time * .6) * .2;
      bead.position.y = -1.06 + Math.sin(time * 1.3) * .07;
      smallBead.position.x = 1.42 + Math.sin(time) * .05;
      tinyBead.position.y = 1.96 + Math.sin(time * 1.2) * .06;
    }
    render();
  };
  const resize = () => {
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    const aspect = width / height;
    const vertical = aspect < 1.3 ? 3.35 / aspect : 2.65;
    camera.left = -vertical * aspect; camera.right = vertical * aspect; camera.top = vertical; camera.bottom = -vertical;
    camera.updateProjectionMatrix(); renderer.setSize(width, height, false); render();
  };
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(canvas);
  const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) render(); }); intersection.observe(canvas);
  const down = (event: PointerEvent) => {
    if (event.button !== 0) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId); canvas.classList.add('dragging');
  };
  const move = (event: PointerEvent) => {
    if (pointer?.id === event.pointerId) {
      targetY += (event.clientX - pointer.x) * .009;
      targetX = THREE.MathUtils.clamp(targetX + (event.clientY - pointer.y) * .007, -.9, .9);
      pointer.x = event.clientX; pointer.y = event.clientY; hoverX = 0; hoverY = 0;
    } else if (motion && event.pointerType === 'mouse') {
      const bounds = canvas.getBoundingClientRect();
      hoverX = ((event.clientX - bounds.left) / bounds.width - .5) * .16;
      hoverY = ((event.clientY - bounds.top) / bounds.height - .5) * .12;
    }
  };
  const up = (event: PointerEvent) => {
    if (pointer?.id !== event.pointerId) return;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    pointer = null; canvas.classList.remove('dragging');
  };
  const leave = () => { hoverX = 0; hoverY = 0; };
  const keyboard = (event: KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowLeft') targetY -= .3;
    if (event.key === 'ArrowRight') targetY += .3;
    if (event.key === 'ArrowUp') targetX = Math.max(-.9, targetX - .2);
    if (event.key === 'ArrowDown') targetX = Math.min(.9, targetX + .2);
    if (event.key === 'Home') { targetX = -.14; targetY = -.3; hoverX = 0; hoverY = 0; }
  };
  const contextLost = (event: Event) => { event.preventDefault(); onFailure(); };
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('pointerleave', leave);
  canvas.addEventListener('keydown', keyboard); canvas.addEventListener('webglcontextlost', contextLost);
  resize(); frame = requestAnimationFrame(animate);
  return {
    setPalette(palette) {
      bodyMaterial.color.set(palettes[palette].body); sideMaterial.color.set(palettes[palette].side);
      detailMaterial.color.set(palettes[palette].detail); accentMaterial.color.set(palettes[palette].accent); render();
    },
    setMotion(enabled) { motion = enabled; if (!enabled) { hoverX = 0; hoverY = 0; model.position.y = 0; } render(); },
    reset() { targetX = -.14; targetY = -.3; hoverX = 0; hoverY = 0; },
    dispose() {
      disposed = true; cancelAnimationFrame(frame); resizeObserver.disconnect(); intersection.disconnect();
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('keydown', keyboard); canvas.removeEventListener('webglcontextlost', contextLost);
      const materials = new Set<THREE.Material>();
      scene.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material)); } });
      materials.forEach(material => material.dispose()); environment.dispose(); renderer.dispose(); renderer.forceContextLoss();
    },
  };
}
