import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seededRandom } from './lunar-physics.js';

// Texture relief adds close-range detail without changing driving geometry.
export function regolithTextures(renderer) {
  const size = 512, heights = new Float32Array(size * size), random = seededRandom(72831);
  const grids = [8, 16, 32, 64, 128].map(n => ({ n, data: Float32Array.from({ length: n * n }, random) }));
  function noise(x, y, grid) {
    const px = x / size * grid.n, py = y / size * grid.n, ix = Math.floor(px), iy = Math.floor(py);
    const fx = px - ix, fy = py - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const at = (a, b) => grid.data[(b % grid.n) * grid.n + (a % grid.n)];
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(ix, iy), at(ix + 1, iy), u), THREE.MathUtils.lerp(at(ix, iy + 1), at(ix + 1, iy + 1), u), v);
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    heights[y * size + x] = grids.reduce((h, grid, i) => h + noise(x, y, grid) * [.46, .25, .15, .09, .05][i], 0) + (random() - .5) * .035;
  }
  // Shallow pits and rims in the normal texture; wrap at the seam.
  for (let i = 0; i < 190; i++) {
    const cx = Math.floor(random() * size), cy = Math.floor(random() * size), r = 2 + random() ** 2 * 17;
    for (let dy = -Math.ceil(r * 1.3); dy <= Math.ceil(r * 1.3); dy++) for (let dx = -Math.ceil(r * 1.3); dx <= Math.ceil(r * 1.3); dx++) {
      const d = Math.hypot(dx, dy) / r;
      if (d < 1.3) heights[((cy + dy + size) % size) * size + (cx + dx + size) % size] += -.24 * Math.exp(-Math.pow(d / .7, 4)) + .08 * Math.exp(-Math.pow((d - .96) / .17, 2));
    }
  }
  function texture(paint, srgb = false) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const context = c.getContext('2d'), data = context.createImageData(size, size);
    const h = (x, y) => heights[((y + size) % size) * size + (x + size) % size];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const rgb = paint(x, y, h), p = (y * size + x) * 4;
      data.data[p] = rgb[0]; data.data[p + 1] = rgb[1]; data.data[p + 2] = rgb[2]; data.data[p + 3] = 255;
    }
    context.putImageData(data, 0, 0); const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(36, 36);
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const map = texture((x, y, h) => { const value = 163 + h(x, y) * 63; return [value, value, value]; }, true);
  const normalMap = texture((x, y, h) => {
    const nx = (h(x - 1, y) - h(x + 1, y)) * 3.1, ny = (h(x, y + 1) - h(x, y - 1)) * 3.1;
    const length = Math.hypot(nx, ny, 1); return [(nx / length * .5 + .5) * 255, (ny / length * .5 + .5) * 255, (.5 / length + .5) * 255];
  });
  return { map, normalMap };
}

export function panelTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#84909b'; ctx.fillRect(0, 0, 512, 512);
  for (let x = 0; x < 6; x++) for (let y = 0; y < 7; y++) {
    const px = x * 85 + 3, py = y * 73 + 3;
    ctx.fillStyle = `hsl(${212 + (x + y) % 3 * 4}, 34%, ${19 + (x * 3 + y) % 4})`; ctx.fillRect(px, py, 79, 67);
    ctx.strokeStyle = '#91a6b329'; ctx.lineWidth = 1;
    for (let l = 1; l < 9; l++) { ctx.beginPath(); ctx.moveTo(px, py + l * 7); ctx.lineTo(px + 79, py + l * 7); ctx.stroke(); }
    ctx.fillStyle = '#b9c5ca77'; ctx.fillRect(px + 25, py, 1, 67); ctx.fillRect(px + 53, py, 1, 67);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function foilTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d'), rng = seededRandom(4991);
  ctx.fillStyle = '#888888'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 330; i++) {
    const x = rng() * 256, y = rng() * 256, endX = x + (rng() - .5) * 40, endY = y + (rng() - .5) * 40;
    ctx.strokeStyle = rng() > .5 ? '#a0a0a0' : '#707070'; ctx.lineWidth = 1 + rng() * 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(endX, endY); ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2); return t;
}

// Bake a sparse outdoor reflection map once. No live reflection rendering.
export function outdoorReflections(renderer) {
  const environment = new THREE.Scene(); environment.background = new THREE.Color(0x181c22);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ color: 0x888b8e }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -3; environment.add(ground);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(.65, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .95, .87).multiplyScalar(5) }));
  sun.position.set(-6, 4, -4); environment.add(sun);
  const pmrem = new THREE.PMREMGenerator(renderer), target = pmrem.fromScene(environment, .04, .1, 100);
  pmrem.dispose(); ground.geometry.dispose(); ground.material.dispose(); sun.geometry.dispose(); sun.material.dispose(); return target;
}

// Merge only immobile direct children; suspension and wheel transforms stay independent.
export function batchParts(group, excluded = new Set()) {
  const batches = new Map();
  for (const mesh of [...group.children]) {
    if (!mesh.isMesh || excluded.has(mesh) || Array.isArray(mesh.material)) continue;
    mesh.updateMatrix();
    if (!batches.has(mesh.material)) batches.set(mesh.material, []);
    batches.get(mesh.material).push(mesh);
  }
  for (const [material, meshes] of batches) {
    if (meshes.length < 2) continue;
    const geos = meshes.map(m => m.geometry.clone().applyMatrix4(m.matrix));
    const geometry = mergeGeometries(geos); geos.forEach(g => g.dispose());
    if (!geometry) continue;
    const combined = new THREE.Mesh(geometry, material); combined.castShadow = combined.receiveShadow = true;
    meshes.forEach(m => group.remove(m)); group.add(combined);
  }
}

export function createRockGeometry() {
  const rockGeo = new THREE.IcosahedronGeometry(1, 2), rp = rockGeo.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i), v = 1 + .13 * Math.sin(x * 16 + y * 23 + z * 11);
    rp.setXYZ(i, x * v, y * v, z * v);
  }
  rockGeo.computeVertexNormals();
  return rockGeo;
}
