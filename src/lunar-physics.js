// Bounded, deliberately assisted driving model for the first playable prototype.
// Suspension/traction are simplified; this is not an engineering simulation.
export const SIZE = 320;
export const LIMIT = 143;
export const START = { x: 0, z: 48, yaw: 0 };
export const BASE = { x: -10, z: 54 };
export const TARGET = { x: -18, z: -54 };
export const CRATERS = [
  [-39, -25, 23, 6.2], [58, -56, 32, 8], [-74, 73, 27, 6],
  [76, 48, 17, 4], [-105, -96, 36, 8], [7, -116, 21, 5],
  [25, 8, 9, 1.7], [-17, 23, 6, 1.1], [98, -9, 11, 2.8]
];
export function rawHeight(x, z) {
  let h = Math.sin(x * .029) * Math.cos(z * .021) * 3.6
    + Math.sin(x * .069 + z * .034) * .9 + Math.cos(z * .092 - x * .013) * .48
    + Math.sin(x * .22) * Math.cos(z * .18) * .08;
  for (const [cx, cz, r, depth] of CRATERS) {
    const d = Math.hypot(x - cx, z - cz) / r;
    if (d < 1.55) h += -depth * Math.exp(-Math.pow(d / .68, 4))
      + depth * .24 * Math.exp(-Math.pow((d - 1) / .15, 2));
  }
  // A small flat landing apron; the exploration terrain retains its relief.
  const apron = Math.max(0, 1 - Math.hypot(x + 5, z - 52) / 16);
  return h * (1 - apron * apron * (3 - 2 * apron));
}
export const GRID = 224;
const step = SIZE / GRID;
let cachedHeights;
function gridHeight(x, z) {
  if (x < 0 || z < 0 || x > GRID || z > GRID) return rawHeight(x * step - SIZE / 2, z * step - SIZE / 2);
  if (!cachedHeights) {
    cachedHeights = new Float64Array((GRID + 1) ** 2);
    for (let j = 0; j <= GRID; j++) for (let i = 0; i <= GRID; i++) cachedHeights[j * (GRID + 1) + i] = rawHeight(i * step - SIZE / 2, j * step - SIZE / 2);
  }
  return cachedHeights[z * (GRID + 1) + x];
}
// Match the rendered terrain's triangle interpolation, so wheels use the same surface.
export function heightAt(x, z) {
  const gx = (x + SIZE / 2) / step, gz = (z + SIZE / 2) / step;
  const ix = Math.floor(gx), iz = Math.floor(gz), u = gx - ix, v = gz - iz;
  const a = gridHeight(ix, iz), b = gridHeight(ix + 1, iz);
  const c = gridHeight(ix, iz + 1), d = gridHeight(ix + 1, iz + 1);
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v
    : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}
export function seededRandom(seed = 6387) {
  return () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
}
const rng = seededRandom();
export const ROCKS = [];
for (let i = 0; i < 360; i++) {
  const x = (rng() - .5) * 292, z = (rng() - .5) * 292;
  const r = .25 + Math.pow(rng(), 3) * 2.1;
  // Keep the starting apron, destination, and a meandering first route accessible.
  const lane = -9 + Math.sin(z * .035) * 9;
  const outbound = -8.47 + .17647 * z, inbound = -14 + .07407 * z;
  const missionCorridor = z > -65 && z < 65 && x > Math.min(outbound, inbound) - 6 && x < Math.max(outbound, inbound) + 6;
  if (missionCorridor || Math.abs(x - lane) < 5 || Math.hypot(x - START.x, z - START.z) < 10
    || Math.hypot(x - BASE.x, z - BASE.z) < 8 || Math.hypot(x - TARGET.x, z - TARGET.z) < 8) continue;
  ROCKS.push({ x, z, r, rotation: rng() * Math.PI * 2, stretch: .65 + rng() * .65 });
}
export const OBSTACLES = [...ROCKS, { ...BASE, r: 3.6 }, { ...TARGET, r: 1.3 }];
export const WHEELS = [-1.03, 1.03].flatMap(x => [-1.2, 0, 1.2].map(z => ({ x, z })));
export function contacts(s) {
  const c = Math.cos(s.yaw), n = Math.sin(s.yaw);
  return WHEELS.map(p => heightAt(s.x + c * p.x + n * p.z, s.z - n * p.x + c * p.z));
}
export function createState() {
  return { ...START, y: heightAt(START.x, START.z) + 1.06, vy: 0, speed: 0,
    pitch: 0, roll: 0, steer: 0, wheelAngle: 0, distance: 0, collision: false, boundary: false };
}
export function stepDrive(s, input, dt, obstacles = OBSTACLES, rockField = null) {
  const before = { x: s.x, z: s.z };
  const throttle = Number(!!input.forward) - Number(!!input.reverse);
  const turn = Number(!!input.left) - Number(!!input.right);
  s.steer += (turn * .44 - s.steer) * (1 - Math.exp(-7 * dt));
  const braking = input.brake || (throttle !== 0 && Math.sign(throttle) !== Math.sign(s.speed) && Math.abs(s.speed) > .2);
  if (braking) s.speed = Math.sign(s.speed) * Math.max(0, Math.abs(s.speed) - 6 * dt);
  else s.speed += (throttle * 2.5 - s.speed * (throttle ? .34 : 1.1) - Math.sin(s.pitch) * 1.1) * dt;
  if (!throttle && Math.abs(s.speed) < .035) s.speed = 0;
  s.speed = Math.max(-3, Math.min(7.1, s.speed));
  s.yaw += s.speed * Math.tan(s.steer) / 2.65 * dt;
  const nx = s.x - Math.sin(s.yaw) * s.speed * dt, nz = s.z - Math.cos(s.yaw) * s.speed * dt;
  s.boundary = Math.abs(nx) > LIMIT || Math.abs(nz) > LIMIT;
  s.collision = false;
  if (!s.boundary) {
    s.x = nx; s.z = nz;
    for (const rock of obstacles) {
      if (rockField?.resolveContact(s, rock, dt)) continue;
      if (rock.r < .42) continue;
      const dx = s.x - rock.x, dz = s.z - rock.z, d = Math.hypot(dx, dz), min = rock.r + 1.25;
      if (d < min) {
        s.x = rock.x + (d > .001 ? dx / d : 1) * min;
        s.z = rock.z + (d > .001 ? dz / d : 0) * min;
        s.speed *= .2; s.collision = true;
      }
    }
  } else s.speed = 0;
  const hs = contacts(s), front = (hs[0] + hs[3]) / 2, back = (hs[2] + hs[5]) / 2;
  const pitch = Math.atan2(front - back, 2.4);
  const roll = Math.atan2((hs[3] + hs[4] + hs[5] - hs[0] - hs[1] - hs[2]) / 3, 2.06);
  s.pitch += (pitch - s.pitch) * (1 - Math.exp(-8 * dt));
  s.roll += (roll - s.roll) * (1 - Math.exp(-8 * dt));
  const support = hs.reduce((a, b) => a + b, 0) / 6 + 1.06;
  if (s.y > support + .14) s.vy -= 1.62 * dt;
  else s.vy += ((support - s.y) * 65 - s.vy * 12) * dt;
  s.y += s.vy * dt;
  if (s.y < support - .18) { s.y = support - .18; s.vy = Math.max(0, s.vy); }
  const traveled = Math.hypot(s.x - before.x, s.z - before.z);
  s.distance += traveled;
  s.wheelAngle += Math.sign(s.speed) * traveled / .44;
  return s;
}
