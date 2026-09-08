import test from 'node:test';
import assert from 'node:assert/strict';
import { DustField } from './lunar-dust.js';
const step = 1 / 90;
const rover = { x: 0, z: 0, y: 1.06, yaw: 0, speed: 4 };
function run(f, s, seconds) { for (let t = 0; t < seconds; t += step) f.step(step, s); }
const active = f => f.particles.filter(p => p.life);
test('dust stays bounded, lands after stopping, and shuts off in low quality', () => {
  const f = new DustField(() => 0, () => .5); f.setBudget(32); run(f, rover, 10);
  assert.ok(active(f).length > 0 && active(f).length <= 32);
  assert.ok(active(f).every(p => p.y > 0 && p.y < .3));
  run(f, { ...rover, speed: 0 }, 1.5); assert.equal(active(f).length, 0);
  run(f, rover, 1); f.setBudget(0); run(f, rover, 2); assert.equal(active(f).length, 0);
});
test('forward and reverse dust originate at trailing wheels on the terrain', () => {
  for (const direction of [-1, 1]) {
    const f = new DustField(() => 2, () => .5); f.setBudget(56);
    run(f, { ...rover, y: 3.06, speed: direction * 4 }, .2);
    assert.ok(active(f).some(p => p.x < 0) && active(f).some(p => p.x > 0));
    assert.ok(active(f).every(p => Math.sign(p.z) === direction && p.y > 2));
  }
});
test('idle or airborne rovers emit nothing; reset clears existing trails', () => {
  const f = new DustField(() => 0); f.setBudget(56);
  run(f, { ...rover, speed: .1 }, 2); assert.equal(active(f).length, 0);
  run(f, { ...rover, y: 4 }, 2); assert.equal(active(f).length, 0);
  run(f, rover, 1); assert.ok(active(f).length); f.clear(); assert.equal(active(f).length, 0);
});
