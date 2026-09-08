import test from 'node:test';
import assert from 'node:assert/strict';
import { RockField, rockKind } from './lunar-rocks.js';
import { ROCKS, createState, stepDrive, heightAt } from './lunar-physics.js';

const dt = 1 / 90;
function setup(radius) {
  const s = createState(), f = new RockField([{ x: 0, z: 43, r: radius, rotation: .3, stretch: 1 }], heightAt);
  return { s, f, r: f.rocks[0] };
}
function run(s, f, seconds, input = { forward: true }) {
  for (let i = 0; i < seconds / dt; i++) { stepDrive(s, input, dt, f.rocks, f); f.step(dt, s); }
}
test('original rock population, positions and dimensions remain unchanged', () => {
  const f = new RockField(ROCKS, heightAt); assert.equal(f.rocks.length, ROCKS.length);
  f.rocks.forEach((r, i) => {
    for (const key of ['x', 'z', 'r', 'stretch', 'rotation']) assert.equal(r[key], ROCKS[i][key]);
    assert.equal(r.y, heightAt(r.x, r.z) + r.r * .24);
  });
});
test('an original small obstacle is launched and the rover can pass its old location', () => {
  const { s, f, r } = setup(.55); let airborne = false, minSpeed = Infinity;
  for (let i = 0; i < 7 / dt; i++) {
    stepDrive(s, { forward: true }, dt, f.rocks, f); f.step(dt, s);
    airborne ||= r.y - heightAt(r.x, r.z) > r.r * .24 + .15;
    if (f.hits && s.z > 42) minSpeed = Math.min(minSpeed, s.speed);
  }
  assert.ok(f.hits > 0); assert.ok(airborne); assert.ok(minSpeed > .7);
  assert.ok(s.z < 40, 'no invisible collider remains at the original location');
  assert.notEqual(r.z, 43);
});
test('medium rocks move with resistance and stay near the surface', () => {
  const { s, f, r } = setup(.9); let lift = 0;
  for (let i = 0; i < 6 / dt; i++) {
    stepDrive(s, { forward: true }, dt, f.rocks, f); f.step(dt, s);
    lift = Math.max(lift, r.y - heightAt(r.x, r.z) - r.r * .24);
  }
  assert.ok(r.z < 42); assert.ok(f.hits > 0); assert.ok(lift < .3);
  assert.ok(s.speed > .1 && s.speed < 2);
});
test('large rocks shift slightly, resist sustained pushing and cannot be launched', () => {
  const { s, f, r } = setup(1.7); run(s, f, 6);
  assert.equal(r.x, 0); assert.ok(43 - r.z > .01 && 43 - r.z < .25); assert.ok(f.hits > 0);
  assert.ok(s.z >= r.z + r.r + 1.249); assert.ok(s.speed < .1);
  assert.equal(r.y, heightAt(r.x, r.z) + r.r * .24);
  const settledZ = r.z, hits = f.hits; run(s, f, 12);
  assert.equal(r.z, settledZ); assert.equal(f.hits, hits); assert.equal(f.active.size, 0);
});
test('heavy impact response scales with mass and speed, rocks settle and can be hit again', () => {
  function impact(radius, speed) {
    const f = new RockField([{ x: 0, z: 0, r: radius }], () => 0), r = f.rocks[0];
    const s = { ...createState(), x: 0, z: radius + 1.2, y: 1.06, speed };
    f.resolveContact(s, r, dt); let tilt = 0;
    for (let i = 0; i < 4 / dt; i++) {
      f.step(dt, s); tilt = Math.max(tilt, Math.abs(r.rx - .15));
      assert.equal(r.y, radius * .24); assert.ok(f.active.size <= f.limit);
    }
    assert.ok(tilt > .001 && tilt < .08); assert.equal(f.active.size, 0);
    assert.equal(r.rx, .15); f.takeDirty(); f.step(dt, s); assert.deepEqual(f.takeDirty(), []);
    const displacement = -r.z;
    s.z = r.z + radius + 1.2; s.speed = speed;
    f.resolveContact(s, r, dt); assert.equal(f.hits, 2);
    return displacement;
  }
  assert.ok(impact(1.2, 5) > impact(2.4, 5) * 4);
  assert.ok(impact(1.7, 5) > impact(1.7, 1) * 2);
});
test('fixed landmarks remain solid independently of movable rock classification', () => {
  const s = createState(), f = new RockField([], heightAt), target = { x: 0, z: 43, r: .6 };
  for (let i = 0; i < 6 / dt; i++) stepDrive(s, { forward: true }, dt, [target], f);
  assert.ok(s.z > 44.8); assert.equal(f.hits, 0);
});
test('low-budget pool never makes a small obstacle immovable', () => {
  const f = new RockField(Array.from({ length: 8 }, (_, i) => ({ x: i * 5, z: 0, r: .5, stretch: 1 })), () => 0);
  f.setBudget(2);
  for (const r of f.rocks) {
    const s = { ...createState(), x: r.x, z: 1.6, y: 1.06, speed: 3 };
    assert.equal(f.resolveContact(s, r, dt), true); assert.ok(f.active.size <= 2);
    assert.ok(r.active); assert.ok(r.vy > 0); assert.ok(s.speed > 2);
  }
  assert.equal(f.hits, 8); f.setBudget(1); assert.equal(f.active.size, 1);
});
test('a rock settles at its new position and no longer updates while sleeping', () => {
  const { s, f, r } = setup(.5); run(s, f, 2.5);
  s.speed = 0; s.x -= 10;
  for (let i = 0; i < 7 / dt; i++) f.step(dt, s);
  assert.equal(f.active.size, 0); assert.notEqual(r.z, 43); f.takeDirty();
  for (let i = 0; i < 90; i++) f.step(dt, s);
  assert.deepEqual(f.takeDirty(), []);
  s.x = r.x; s.z = r.z + r.r + 1.2; s.y = heightAt(s.x, s.z) + 1.06; s.speed = 3;
  const hits = f.hits; f.resolveContact(s, r, dt); assert.equal(f.hits, hits + 1);
});
test('backing away does not re-launch a rock; sizes have distinct responses', () => {
  const { s, f } = setup(.5); s.z = 44.6; s.speed = -2;
  f.resolveContact(s, f.rocks[0], dt); assert.equal(f.hits, 0);
  assert.equal(rockKind(.5), 'small'); assert.equal(rockKind(.9), 'medium'); assert.equal(rockKind(1.5), 'large');
});
