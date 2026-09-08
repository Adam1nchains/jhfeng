import * as THREE from 'three';
import { SIZE, GRID, BASE, TARGET, ROCKS, WHEELS, rawHeight, heightAt, seededRandom, createState, contacts, stepDrive } from './lunar-physics.js';
import { regolithTextures, panelTexture, foilTexture, outdoorReflections, batchParts } from './lunar-visuals.js';
import { PROFILES, QualityBudget, pixelRatioFor } from './lunar-quality.js';
import { RockField } from './lunar-rocks.js';

const $ = s => document.querySelector(s), canvas = $('#moon');
const desktop = matchMedia('(min-width: 820px) and (pointer: fine)');
let initialized = false;
function deviceCheck() {
  $('#desktop-only').hidden = desktop.matches;
  if (desktop.matches && !initialized) { initialized = true; init().catch(fail); }
}
desktop.addEventListener('change', deviceCheck); deviceCheck();
function fail(error) {
  console.error(error); $('#loading').hidden = false;
  $('#loading h2').textContent = '月面环境暂时未能启动';
  $('#load-progress').hidden = true;
  $('#load-copy').textContent = '请使用支持 WebGL 2 的电脑浏览器，开启硬件加速后刷新重试。';
}

async function init() {
  // Yield between preparation stages so the loading indicator keeps painting.
  const paintLoading = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
  await paintLoading();
  const budget = new QualityBudget();
  let qualityMode = 'auto', qualityFrames = [], qualityElapsed = 0, qualityWarmup = 3, qualityChanges = 0;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pixelRatioFor(PROFILES[budget.tier], innerWidth, innerHeight, devicePixelRatio));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.13;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x030609);
  const reflections = outdoorReflections(renderer); scene.environment = reflections.texture; scene.environmentIntensity = .5;
  const camera = new THREE.PerspectiveCamera(51, innerWidth / innerHeight, .15, 2000);
  const ambient = new THREE.HemisphereLight(0xd4dce6, 0x55595d, .70); scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xfff5e8, 3.5);
  const sunOffset = new THREE.Vector3(-65, 42, -48);
  scene.add(sun, sun.target); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 180 });
  sun.shadow.bias = -.00025; sun.shadow.normalBias = .065;

  const rng = seededRandom(54321);
  const textures = regolithTextures(renderer);
  await paintLoading();
  const surface = new THREE.MeshStandardMaterial({ color: 0xbfc0c0, roughness: 1, map: textures.map, normalMap: textures.normalMap, normalScale: new THREE.Vector2(.65, .65), vertexColors: true });
  const terrainGeo = new THREE.PlaneGeometry(SIZE, SIZE, GRID, GRID); terrainGeo.rotateX(-Math.PI / 2);
  const tp = terrainGeo.attributes.position, colors = new Float32Array(tp.count * 3);
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), z = tp.getZ(i), h = rawHeight(x, z); tp.setY(i, h);
    const shade = .80 + .09 * Math.sin(x * .075 + z * .04) + .04 * Math.cos(x * .3 - z * .2) + rng() * .015;
    colors[i * 3] = shade; colors[i * 3 + 1] = shade; colors[i * 3 + 2] = shade * .98;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3)); terrainGeo.computeVertexNormals();
  await paintLoading();
  const terrain = new THREE.Mesh(terrainGeo, surface); terrain.receiveShadow = true; scene.add(terrain);

  // Low-frequency distant terrain closes the horizon without increasing the driving area.
  const horizonGeo = new THREE.RingGeometry(154, 1250, 256, 24); horizonGeo.rotateX(-Math.PI / 2);
  const hp = horizonGeo.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i), z = hp.getZ(i), d = Math.hypot(x, z), a = Math.atan2(z, x);
    const blend = Math.max(0, Math.min(1, (d - 180) / 160));
    hp.setY(i, -9 + blend * (19 + 12 * Math.sin(a * 9 + .7) + 9 * Math.cos(a * 17)) + Math.sin(d * .027 + a * 5) * 3 * blend);
  }
  horizonGeo.computeVertexNormals();
  scene.add(new THREE.Mesh(horizonGeo, new THREE.MeshStandardMaterial({ color: 0x64696e, roughness: 1 })));

  const rockGeo = new THREE.IcosahedronGeometry(1, 2), rp = rockGeo.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i), v = 1 + .13 * Math.sin(x * 16 + y * 23 + z * 11);
    rp.setXYZ(i, x * v, y * v, z * v);
  }
  rockGeo.computeVertexNormals();
  const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x85898d, roughness: 1, flatShading: true, normalMap: textures.normalMap, normalScale: new THREE.Vector2(.22, .22) });
  const rockMesh = new THREE.InstancedMesh(rockGeo, rockMaterial, ROCKS.length); rockMesh.castShadow = rockMesh.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const rockField = new RockField(ROCKS, heightAt);
  const collisionObjects = [...rockField.rocks, { ...BASE, r: 3.6 }, { ...TARGET, r: 1.3 }];
  rockMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  rockMesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 270);
  function writeRock(id) {
    const r = rockField.rocks[id]; dummy.position.set(r.x, r.y, r.z);
    dummy.scale.set(r.r, r.r * r.stretch * .7, r.r * .85); dummy.rotation.set(r.rx, r.ry, r.rz);
    dummy.updateMatrix(); rockMesh.setMatrixAt(id, dummy.matrix);
  }
  rockField.rocks.forEach(r => writeRock(r.id)); scene.add(rockMesh);
  function syncRocks() {
    const dirty = rockField.takeDirty(); if (!dirty.length) return;
    rockMesh.instanceMatrix.clearUpdateRanges();
    for (const id of dirty) { writeRock(id); rockMesh.instanceMatrix.addUpdateRange(id * 16, 16); }
    rockMesh.instanceMatrix.needsUpdate = true;
  }
  const pebbleMaterial = new THREE.MeshStandardMaterial({ color: 0x777d80, roughness: 1, flatShading: true });
  const pebbles = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), pebbleMaterial, 950);
  // Restore the original sparse decorative grit, without added roadside clusters.
  for (let i = 0; i < 950; i++) { const x = (rng() - .5) * 300, z = (rng() - .5) * 300, r = .04 + rng() * .16; dummy.position.set(x, heightAt(x, z), z); dummy.scale.set(r, r * .55, r * .7); dummy.rotation.set(0, rng() * 6, 0); dummy.updateMatrix(); pebbles.setMatrixAt(i, dummy.matrix); } scene.add(pebbles);

  const mats = {
    ivory: new THREE.MeshStandardMaterial({ color: 0xcdd0c6, metalness: .45, roughness: .42 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xb99a58, metalness: .8, roughness: .43, bumpMap: foilTexture(), bumpScale: .055 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x22292d, metalness: .5, roughness: .52 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x444946, metalness: .7, roughness: .67 }),
    panel: new THREE.MeshStandardMaterial({ color: 0xa4beef, map: panelTexture(), metalness: .3, roughness: .40, envMapIntensity: .35 }),
    lens: new THREE.MeshStandardMaterial({ color: 0x142c31, metalness: .45, roughness: .18 }),
    light: new THREE.MeshStandardMaterial({ color: 0xdcefb6, emissive: 0xb2cc72, emissiveIntensity: 1.5 })
  };
  function part(parent, geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; }
  const box = (p, x, y, z, sx, sy, sz, m) => part(p, new THREE.BoxGeometry(sx, sy, sz), m, x, y, z);
  function rod(p, a, b, radius = .045, material = mats.ivory) {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), delta = to.clone().sub(from);
    const mesh = part(p, new THREE.CylinderGeometry(radius, radius, delta.length(), 8), material);
    mesh.position.copy(from.add(to).multiplyScalar(.5)); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); return mesh;
  }
  const rover = new THREE.Group(); rover.rotation.order = 'YXZ'; scene.add(rover);
  box(rover, 0, 0, 0, 1.52, .48, 2.62, mats.gold);
  box(rover, 0, .29, 0, 1.64, .12, 2.72, mats.ivory);
  box(rover, 0, -.28, .25, 1.24, .18, 1.75, mats.dark);
  box(rover, 0, .56, .53, 1.48, .1, 1.44, mats.ivory);
  for (const x of [-.55, .55]) box(rover, x, .43, .53, .09, .20, 1.16, mats.dark);
  box(rover, 0, .617, .535, 1.423, .015, 1.314, mats.panel);
  box(rover, 0, .585, -.83, .73, .47, .57, mats.ivory);
  rod(rover, [.42, .36, -.66], [.42, 1.87, -.66], .07);
  box(rover, .40, 1.88, -.71, .75, .32, .35, mats.ivory);
  for (const x of [.18, .62]) { const lens = part(rover, new THREE.CylinderGeometry(.10, .10, .08, 20), mats.lens, x, 1.89, -.918); lens.rotation.x = Math.PI / 2; }
  rod(rover, [-.63, .36, .94], [-.63, 1.60, .94], .023, mats.dark);
  part(rover, new THREE.SphereGeometry(.045, 8, 6), mats.light, -.63, 1.6, .94);
  const dish = part(rover, new THREE.SphereGeometry(.35, 20, 12, 0, Math.PI * 2, 0, .8), mats.ivory, -.44, 1, .52); dish.rotation.z = -.5;
  // The spherical cap sits above its origin; mount to its actual back surface.
  box(rover, -.44, .65, .52, .18, .08, .18, mats.ivory);
  const dishBack = new THREE.Vector3(0, .35, 0).applyEuler(dish.rotation).add(dish.position);
  rod(rover, [-.44, .35, .52], dishBack.toArray(), .055, mats.dark);
  for (const x of [-.59, .59]) box(rover, x, .10, -1.34, .21, .10, .08, mats.light);
  rod(rover, [-.45, -.05, -1.15], [-.57, -.18, -1.9], .05);
  rod(rover, [-.57, -.18, -1.9], [-.22, -.30, -2.05], .045);
  box(rover, -.19, -.32, -2.04, .25, .14, .18, mats.dark);
  const wheelGeo = new THREE.CylinderGeometry(.44, .44, .32, 24); wheelGeo.rotateZ(Math.PI / 2);
  const wheels = WHEELS.map(p => {
    const assembly = new THREE.Group(); assembly.position.set(p.x, -.60, p.z); rover.add(assembly);
    const wheel = new THREE.Group(); assembly.add(wheel); part(wheel, wheelGeo, mats.rubber);
    const hub = part(wheel, new THREE.CylinderGeometry(.21, .21, .335, 12), mats.ivory); hub.rotation.z = Math.PI / 2;
    for (let j = 0; j < 16; j++) { const a = j * Math.PI / 8; const tread = box(wheel, 0, Math.sin(a) * .435, Math.cos(a) * .435, .36, .033, .055, mats.ivory); tread.rotation.x = -a; }
    batchParts(wheel);
    const arm = rod(rover, [Math.sign(p.x) * .62, -.13, p.z - .22], [p.x, -.60, p.z], .065, mats.dark);
    return { assembly, wheel, arm, p };
  });
  batchParts(rover, new Set(wheels.map(w => w.arm)));

  const lander = new THREE.Group(); lander.position.set(BASE.x, heightAt(BASE.x, BASE.z), BASE.z); scene.add(lander);
  part(lander, new THREE.CylinderGeometry(1.65, 1.85, 1.4, 8), mats.gold, 0, 2.2, 0);
  box(lander, 0, 3.05, 0, 2.2, .4, 2.1, mats.ivory);
  for (const x of [-1, 1]) for (const z of [-1, 1]) { rod(lander, [x, 2.2, z], [x * 2.6, .18, z * 2.6], .10); part(lander, new THREE.CylinderGeometry(.48, .48, .1, 12), mats.dark, x * 2.6, .12, z * 2.6); }
  rod(lander, [0, 3.2, 0], [0, 5.2, 0], .05); part(lander, new THREE.SphereGeometry(.12, 12, 8), mats.light, 0, 5.25, 0);
  for (const x of [-3, 3]) { box(lander, x, 3.08, 0, 3.4, .09, 2.1, mats.panel); rod(lander, [0, 2.6, 0], [x, 3.05, 0], .07); }
  const beacon = new THREE.Group(); beacon.position.set(TARGET.x, heightAt(TARGET.x, TARGET.z), TARGET.z); scene.add(beacon);
  part(beacon, new THREE.CylinderGeometry(.56, .8, .5, 8), mats.gold, 0, .25, 0); rod(beacon, [0, .4, 0], [0, 3.2, 0], .055);
  box(beacon, 0, 3.28, 0, .45, .30, .45, mats.light);
  for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; rod(beacon, [0, 1.5, 0], [Math.sin(a) * 1.25, .05, Math.cos(a) * 1.25], .035); }
  box(beacon, .58, 2.55, 0, 1.1, .6, .018, mats.ivory);
  batchParts(lander); batchParts(beacon);
  // A pale location disc remains readable against the terrain without a tall light beam.
  const disc = part(scene, new THREE.RingGeometry(4.7, 4.78, 64), new THREE.MeshBasicMaterial({ color: 0xd7e5b2, transparent: true, opacity: .65, side: THREE.DoubleSide }));
  disc.rotation.x = -Math.PI / 2;

  // Low mode retains a cheap ground-contact cue when real-time shadows are disabled.
  const contactCanvas = document.createElement('canvas'); contactCanvas.width = contactCanvas.height = 64;
  const contactCtx = contactCanvas.getContext('2d'), contactGradient = contactCtx.createRadialGradient(32, 32, 5, 32, 32, 31);
  contactGradient.addColorStop(0, '#00000099'); contactGradient.addColorStop(1, '#00000000'); contactCtx.fillStyle = contactGradient; contactCtx.fillRect(0, 0, 64, 64);
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(3.9, 4.7), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(contactCanvas), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })); scene.add(contact);

  const coarseRocks = new THREE.IcosahedronGeometry(1, 1);
  function applyQuality() {
    const profile = PROFILES[budget.tier], low = budget.tier === 0;
    renderer.setPixelRatio(pixelRatioFor(profile, innerWidth, innerHeight, devicePixelRatio, budget.scale));
    renderer.shadowMap.enabled = profile.shadows;
    if (sun.shadow.mapSize.x !== profile.shadowSize) {
      sun.shadow.map?.dispose(); sun.shadow.map = null; sun.shadow.mapSize.set(profile.shadowSize, profile.shadowSize);
    }
    sun.shadow.needsUpdate = true;
    pebbles.count = profile.pebbles; rockMesh.geometry = low ? coarseRocks : rockGeo;
    rockField.setBudget(budget.scale < .7 ? 2 : profile.activeRocks); syncRocks();
    for (const material of [surface, rockMaterial]) { material.normalMap = low ? null : textures.normalMap; material.needsUpdate = true; }
    contact.visible = low;
    scene.traverse(obj => { if (obj.material) for (const material of [obj.material].flat()) material.needsUpdate = true; });
    qualityFrames = []; qualityElapsed = 0; qualityWarmup = 2;
  }
  $('#quality').addEventListener('change', e => { qualityMode = e.target.value; budget.setMode(qualityMode); applyQuality(); });

  const tracks = new THREE.InstancedMesh(new THREE.PlaneGeometry(.34, .20), new THREE.MeshBasicMaterial({ color: 0x333637, transparent: true, opacity: .36, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), 1800);
  tracks.count = 0; tracks.frustumCulled = false; scene.add(tracks); let trackIndex = 0, trackDistance = 0;
  function markTracks(s) {
    if (s.distance - trackDistance < .42 || s.y > heightAt(s.x, s.z) + 1.6) return;
    trackDistance = s.distance;
    for (const side of [-1, 1]) {
      const x = s.x + Math.cos(s.yaw) * side * 1.03 + Math.sin(s.yaw) * 1.2;
      const z = s.z - Math.sin(s.yaw) * side * 1.03 + Math.cos(s.yaw) * 1.2;
      dummy.position.set(x, heightAt(x, z) + .025, z);
      const normal = new THREE.Vector3(heightAt(x - .1, z) - heightAt(x + .1, z), .2, heightAt(x, z - .1) - heightAt(x, z + .1)).normalize();
      dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal); dummy.rotateZ(s.yaw); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      tracks.setMatrixAt(trackIndex, dummy.matrix); trackIndex = (trackIndex + 1) % 1800; tracks.count = Math.min(1800, tracks.count + 1);
    }
    tracks.instanceMatrix.needsUpdate = true;
  }

  let state = createState(), paused = false, mission = 0, dockTime = 0, completionTime = 0;
  let cameraYaw = .28, cameraPitch = .34, cameraDistance = 12, dragging = false, pointerX = 0, pointerY = 0, lastDrag = -999;
  const keys = new Set(), clearKeys = () => keys.clear();
  const look = new THREE.Vector3(), desiredCamera = new THREE.Vector3(), camTarget = new THREE.Vector3(state.x, state.y + .6, state.z);
  const projected = new THREE.Vector3(), forward = new THREE.Vector3();
  let noticeTimer = 0, nowSeconds = 0;
  function notice(text, duration = 4) { $('#notice').textContent = text; $('#notice').classList.add('visible'); noticeTimer = nowSeconds + duration; }
  function setPause(value) {
    paused = value; clearKeys(); dragging = false;
    $('#pause-screen').hidden = !paused; $('#pause').setAttribute('aria-label', paused ? '继续' : '暂停');
    $('#pause path').setAttribute('d', paused ? 'M8 5l11 7-11 7z' : 'M8 5v14M16 5v14');
    qualityFrames = []; qualityElapsed = 0; qualityWarmup = 2;
    if (canvas.dataset.telemetry) canvas.dataset.telemetry = JSON.stringify({ ...JSON.parse(canvas.dataset.telemetry), paused });
    if (!value) canvas.focus({ preventScroll: true });
  }
  function reset() { const distance = state.distance; state = createState(); state.distance = distance; trackDistance = distance; cameraYaw = .28; cameraPitch = .34; dockTime = 0; updateCamera(1, true); updateRover(); renderer.render(scene, camera); clearKeys(); notice('已回到着陆区'); }
  $('#pause').onclick = () => setPause(!paused); $('#resume').onclick = () => setPause(false); $('#reset').onclick = reset;
  let helpWasPaused = false;
  $('#help').onclick = () => { helpWasPaused = paused; setPause(true); $('#help-dialog').showModal(); };
  $('#close-help').onclick = $('#help-drive').onclick = () => $('#help-dialog').close();
  $('#help-dialog').addEventListener('close', () => setPause(helpWasPaused));
  const drivingKeys = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyR']);
  addEventListener('keydown', e => {
    if ($('#help-dialog').open || !desktop.matches) return;
    if (e.code === 'Escape') { e.preventDefault(); if (!e.repeat) setPause(!paused); return; }
    if (e.target instanceof HTMLButtonElement && (e.code === 'Space' || e.code === 'Enter')) return;
    if (!drivingKeys.has(e.code)) return; e.preventDefault();
    if (!paused) { $('#first-hint').classList.add('dismissed'); if (e.code === 'KeyR' && !e.repeat) reset(); else keys.add(e.code); }
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => setPause(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPause(true); });
  desktop.addEventListener('change', () => { if (!desktop.matches) setPause(true); });
  canvas.addEventListener('pointerdown', e => { if (paused || e.button !== 0) return; dragging = true; pointerX = e.clientX; pointerY = e.clientY; canvas.setPointerCapture(e.pointerId); canvas.focus({ preventScroll: true }); });
  canvas.addEventListener('pointermove', e => { if (!dragging) return; cameraYaw -= (e.clientX - pointerX) * .005; cameraPitch = THREE.MathUtils.clamp(cameraPitch + (e.clientY - pointerY) * .004, .12, .9); pointerX = e.clientX; pointerY = e.clientY; lastDrag = nowSeconds; });
  const endDrag = () => { dragging = false; lastDrag = nowSeconds; };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', e => { e.preventDefault(); cameraDistance = THREE.MathUtils.clamp(cameraDistance + e.deltaY * .012, 6, 23); }, { passive: false });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); setPause(true); fail(new Error('WebGL context lost')); });
  canvas.addEventListener('webglcontextrestored', () => location.reload());

  function updateCamera(dt, snap = false) {
    if (!dragging && nowSeconds - lastDrag > 2 && Math.abs(state.speed) > .3) cameraYaw *= Math.exp(-dt * 1.5);
    camTarget.set(state.x, state.y + .65, state.z);
    const angle = state.yaw + cameraYaw;
    desiredCamera.set(state.x + Math.sin(angle) * cameraDistance * Math.cos(cameraPitch), state.y + .7 + Math.sin(cameraPitch) * cameraDistance, state.z + Math.cos(angle) * cameraDistance * Math.cos(cameraPitch));
    desiredCamera.y = Math.max(desiredCamera.y, heightAt(desiredCamera.x, desiredCamera.z) + 1.3);
    camera.position.lerp(desiredCamera, snap ? 1 : 1 - Math.exp(-dt * 5));
    camera.position.y = Math.max(camera.position.y, heightAt(camera.position.x, camera.position.z) + 1.1);
    look.lerp(camTarget, snap ? 1 : 1 - Math.exp(-dt * 8)); camera.lookAt(look);
  }
  function updateRover() {
    rover.position.set(state.x, state.y, state.z); rover.rotation.set(state.pitch, state.yaw, state.roll, 'YXZ'); rover.updateMatrixWorld(true);
    contact.position.set(state.x, heightAt(state.x, state.z) + .04, state.z);
    const contactNormal = new THREE.Vector3(heightAt(state.x - .1, state.z) - heightAt(state.x + .1, state.z), .2, heightAt(state.x, state.z - .1) - heightAt(state.x, state.z + .1)).normalize();
    contact.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), contactNormal); contact.rotateZ(state.yaw);
    const hs = contacts(state);
    wheels.forEach((w, i) => {
      const local = rover.worldToLocal(new THREE.Vector3(state.x + Math.cos(state.yaw) * w.p.x + Math.sin(state.yaw) * w.p.z, hs[i] + .44, state.z - Math.sin(state.yaw) * w.p.x + Math.cos(state.yaw) * w.p.z));
      w.assembly.position.y = THREE.MathUtils.clamp(local.y, -1, -.32);
      w.assembly.rotation.y = w.p.z < -.5 ? state.steer : w.p.z > .5 ? -state.steer * .45 : 0;
      w.wheel.rotation.x = -state.wheelAngle;
      const a = new THREE.Vector3(Math.sign(w.p.x) * .62, -.13, w.p.z - .22), b = w.assembly.position.clone();
      const length = b.clone().sub(a); w.arm.position.copy(a.add(b).multiplyScalar(.5)); w.arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), length.clone().normalize()); w.arm.scale.y = length.length() / Math.hypot(w.p.x - Math.sign(w.p.x) * .62, -.47, .22);
    });
    sun.target.position.set(state.x, 0, state.z); sun.position.copy(sun.target.position).add(sunOffset);
  }

  const map = $('#map'), ctx = map.getContext('2d'), mapBg = document.createElement('canvas'); mapBg.width = mapBg.height = 240;
  const bg = mapBg.getContext('2d'); bg.fillStyle = '#111b20'; bg.fillRect(0, 0, 240, 240);
  for (let z = 0; z < 240; z += 2) for (let x = 0; x < 240; x += 2) {
    const h = heightAt((x - 120) / .75, (z - 120) / .75), contour = Math.abs(h - Math.round(h));
    bg.fillStyle = contour < .11 ? '#52615b' : `rgb(${22 + h * 1.2},${33 + h * 1.2},${36 + h * 1.2})`; bg.fillRect(x, z, 2, 2);
  }
  bg.strokeStyle = '#8ca49722'; bg.lineWidth = 1;
  for (let i = 0; i <= 240; i += 40) { bg.beginPath(); bg.moveTo(i, 0); bg.lineTo(i, 240); bg.moveTo(0, i); bg.lineTo(240, i); bg.stroke(); }
  function updateMap() {
    ctx.clearRect(0, 0, 240, 240); ctx.drawImage(mapBg, 0, 0);
    const dest = mission === 0 ? TARGET : BASE;
    const p = o => [120 + o.x * .75, 120 + o.z * .75];
    const [tx, tz] = p(dest), [sx, sz] = p(state);
    ctx.strokeStyle = '#dceaac66'; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(sx, sz); ctx.lineTo(tx, tz); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#deebaf'; ctx.beginPath(); ctx.arc(tx, tz, 4, 0, Math.PI * 2); ctx.fill();
    ctx.font = '11px sans-serif'; ctx.fillText(mission === 0 ? 'A' : 'B', tx + 8, tz + 4);
    ctx.save(); ctx.translate(sx, sz); ctx.rotate(-state.yaw); ctx.fillStyle = '#f1f3e6'; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(0, 3); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#bbcdbf'; ctx.fillText('N', 116, 16);
  }
  function missionTick(dt) {
    const dest = mission === 0 ? TARGET : BASE, d = Math.hypot(state.x - dest.x, state.z - dest.z);
    if (mission < 2 && d < (mission === 0 ? 7 : 9) && Math.abs(state.speed) < .45) {
      dockTime += dt;
      if (dockTime > 1.3) {
        mission++; dockTime = 0;
        if (mission === 1) { $('#mission-title').textContent = '着陆器'; notice('观测完成，返回着陆器', 4); }
        else { completionTime = nowSeconds; $('#mission-title').textContent = '自由探索'; $('#destination-distance').hidden = true; notice('探索完成', 3); }
      }
    } else dockTime = 0;
    if (state.boundary) notice('已到边界，请返回', 1);
    else if (state.collision) notice('请倒车绕行', 1);
    else if (mission < 2 && d < (mission === 0 ? 7 : 9) && Math.abs(state.speed) >= .45) notice('按空格停稳', 1);
    $('#distance').textContent = Math.round(d);
    disc.position.set(dest.x, heightAt(dest.x, dest.z) + .1, dest.z);
    projected.set(dest.x, heightAt(dest.x, dest.z) + 4.8, dest.z);
    forward.copy(projected).sub(camera.position); const inFront = forward.dot(camera.getWorldDirection(new THREE.Vector3())) > 0;
    projected.project(camera);
    $('#beacon').hidden = !inFront || Math.abs(projected.x) > .94 || Math.abs(projected.y) > .80 || mission === 2;
    $('#beacon').style.left = `${(projected.x * .5 + .5) * innerWidth}px`; $('#beacon').style.top = `${(-projected.y * .5 + .5) * innerHeight}px`;
  }
  function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); applyQuality(); renderer.render(scene, camera); }
  await paintLoading();
  addEventListener('resize', resize); resize(); updateCamera(1, true); updateRover(); updateMap(); renderer.render(scene, camera);
  $('#loading').hidden = true; canvas.focus({ preventScroll: true });
  let previous = performance.now(), accumulator = 0, uiTimer = 0, frames = [];
  const fixed = 1 / 90;
  function animate(t) {
    requestAnimationFrame(animate);
    const rawDt = (t - previous) / 1000; previous = t; const dt = Math.min(.08, rawDt); nowSeconds += dt;
    if (document.hidden || !desktop.matches) return;
    if (paused) { accumulator = 0; return; }
    if (!paused) {
      accumulator += dt;
      const input = { forward: keys.has('KeyW') || keys.has('ArrowUp'), reverse: keys.has('KeyS') || keys.has('ArrowDown'), left: keys.has('KeyA') || keys.has('ArrowLeft'), right: keys.has('KeyD') || keys.has('ArrowRight'), brake: keys.has('Space') };
      while (accumulator >= fixed) { stepDrive(state, input, fixed, collisionObjects, rockField); rockField.step(fixed, state); accumulator -= fixed; }
      syncRocks();
      updateRover(); markTracks(state); updateCamera(dt); missionTick(dt);
    } else accumulator = 0;
    if (nowSeconds > noticeTimer) $('#notice').classList.remove('visible');
    if (nowSeconds > 8) $('#first-hint').classList.add('dismissed');
    renderer.render(scene, camera);
    if (rawDt > 0 && rawDt < .5) { frames.push(rawDt * 1000); if (frames.length > 240) frames.shift(); }
    if (qualityMode === 'auto') {
      if (qualityWarmup > 0) qualityWarmup -= rawDt;
      else {
        qualityFrames.push(rawDt * 1000); qualityElapsed += rawDt;
        if (qualityElapsed >= 2) {
          if (budget.observe(qualityFrames)) { qualityChanges++; applyQuality(); }
          qualityFrames = []; qualityElapsed = 0;
        }
      }
    }
    uiTimer += dt;
    if (uiTimer > .15) {
      uiTimer = 0; $('#speed').textContent = (Math.abs(state.speed) * 3.6).toFixed(1);
      updateMap(); const sorted = [...frames].sort((a, b) => a - b);
      canvas.dataset.telemetry = JSON.stringify({ ready: true, paused, mission, x: +state.x.toFixed(2), z: +state.z.toFixed(2), speed: +state.speed.toFixed(2), distance: +state.distance.toFixed(2), pitch: +state.pitch.toFixed(3), roll: +state.roll.toFixed(3), cameraYaw: +cameraYaw.toFixed(3), cameraDistance, fps: Math.round(1000 / (frames.reduce((a, b) => a + b, 0) / frames.length)), p95Ms: +(sorted[Math.floor(sorted.length * .95)] || 0).toFixed(1), drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, samples: frames.length, completionTime, qualityMode, quality: PROFILES[budget.tier].name, pixelRatio: +renderer.getPixelRatio().toFixed(2), shadows: renderer.shadowMap.enabled, qualityChanges, activeRocks: rockField.active.size, rockLimit: rockField.limit, rockHits: rockField.hits, peakRocks: rockField.peak });
    }
  }
  requestAnimationFrame(animate);
}
