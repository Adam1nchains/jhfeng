import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, stepDrive, heightAt, LIMIT, TARGET, BASE, OBSTACLES } from './lunar-physics.js';
const dt = 1 / 90;
function run(s, keys, seconds, obstacles = []) { for (let i = 0; i < seconds / dt; i++) stepDrive(s, keys, dt, obstacles); return s; }
test('forward motion, braking, reverse, steering and idle remain controllable', () => {
  const s = createState(); const z = s.z;
  run(s, { forward: true }, 4); assert.ok(s.z < z - 8); assert.ok(s.speed > 3);
  run(s, { brake: true }, 2); assert.ok(Math.abs(s.speed) < .1);
  const stoppedZ = s.z; run(s, { reverse: true }, 2); assert.ok(s.z > stoppedZ); assert.ok(s.speed < 0);
  run(s, { forward: true, left: true }, 4); assert.ok(s.yaw > .1);
  run(s, {}, 8); assert.ok(Math.abs(s.speed) < .2); assert.ok(Number.isFinite(s.y));
});
test('obstacle contact prevents driving through a rock', () => {
  const s = createState(), rock = { x: 0, z: 38, r: 2 };
  run(s, { forward: true }, 10, [rock]);
  assert.ok(Math.hypot(s.x - rock.x, s.z - rock.z) >= 3.249);
  assert.ok(s.z > rock.z); run(s, { reverse: true }, 3, [rock]); assert.ok(s.z > 43);
});
test('map edge stops outward movement and allows reversing back', () => {
  const s = createState(); s.x = 0; s.z = -LIMIT + .2; s.y = heightAt(s.x, s.z) + 1.06;
  run(s, { forward: true }, 5); assert.ok(s.z >= -LIMIT); assert.ok(Math.abs(s.speed) < .1);
  run(s, { reverse: true }, 3); assert.ok(s.z > -LIMIT + 1);
});
test('both mission destinations are reachable through actual terrain and obstacles', () => {
  const s = createState();
  for (const target of [TARGET, BASE]) {
    let reached = false;
    for (let i = 0; i < 140 / dt; i++) {
      const distance = Math.hypot(target.x - s.x, target.z - s.z);
      if (distance < 6.3) { run(s, { brake: true }, 1, OBSTACLES); reached = true; break; }
      const desired = Math.atan2(s.x - target.x, s.z - target.z);
      const angle = Math.atan2(Math.sin(desired - s.yaw), Math.cos(desired - s.yaw));
      stepDrive(s, { forward: true, left: angle > .045, right: angle < -.045, brake: distance < 12 && s.speed > 2 }, dt, OBSTACLES);
      assert.ok(Number.isFinite(s.y)); assert.ok(Math.abs(s.pitch) < 1.1); assert.ok(Math.abs(s.roll) < 1.1);
    }
    assert.ok(reached, `unreachable destination ${JSON.stringify(target)}; stopped at ${s.x}, ${s.z}`);
  }
});
