import test from 'node:test';
import assert from 'node:assert/strict';
import { PROFILES, pixelRatioFor, QualityBudget } from './lunar-quality.js';
import { heightAt, rawHeight, SIZE, GRID } from './lunar-physics.js';

test('all tiers bound pixel count for small, HD, 4K, and 8K screens and browser zoom', () => {
  for (const [w, h] of [[848, 786], [1920, 1080], [3840, 2160], [7680, 4320]]) {
    for (const dpr of [.5, 1, 1.25, 2, 3]) for (const profile of PROFILES) {
      const ratio = pixelRatioFor(profile, w, h, dpr);
      assert.ok(w * h * ratio * ratio <= profile.pixels + .001);
      assert.ok(ratio <= dpr && ratio <= profile.ratio && ratio > 0);
    }
  }
});
test('slow visitors downgrade to low and can reduce resolution further', () => {
  const q = new QualityBudget(); assert.equal(q.tier, 1);
  assert.equal(q.observe(Array(60).fill(33.3)), false);
  assert.equal(q.observe(Array(60).fill(33.3)), true); assert.equal(q.tier, 0);
  for (let i = 0; i < 12; i++) q.observe(Array(20).fill(100));
  assert.equal(q.scale, .5); assert.equal(q.tier, 0);
  assert.equal(q.observe(Array(20).fill(100)), false);
});
test('isolated stutter does not change quality; sustained smoothness raises it', () => {
  const q = new QualityBudget();
  q.observe([...Array(119).fill(16.7), 120]); assert.equal(q.tier, 1);
  for (let i = 0; i < 5; i++) q.observe(Array(120).fill(16.7));
  assert.equal(q.tier, 2);
});
test('a downgrade has a cooldown to avoid repeated quality oscillation', () => {
  const q = new QualityBudget(); q.observe([50, 50]); q.observe([50, 50]); assert.equal(q.tier, 0);
  for (let i = 0; i < 29; i++) q.observe(Array(120).fill(16.7));
  assert.equal(q.tier, 0); q.observe(Array(120).fill(16.7)); assert.equal(q.tier, 1);
});
test('manual choices and returning to automatic start with the intended budget', () => {
  const q = new QualityBudget(); q.setMode('high'); assert.equal(q.tier, 2);
  q.setMode('low'); assert.equal(q.tier, 0);
  q.setMode('auto'); assert.equal(q.tier, 1); assert.equal(q.slow, 0);
});
test('cached terrain matches the actual triangle surface including camera positions beyond the edge', () => {
  const step = SIZE / GRID;
  for (const [x, z] of [[0, 48], [-18.2, -53.7], [-159.9, 30], [163, -168], [30.1, 160]]) {
    const gx = (x + SIZE / 2) / step, gz = (z + SIZE / 2) / step;
    const ix = Math.floor(gx), iz = Math.floor(gz), u = gx - ix, v = gz - iz;
    const x0 = ix * step - SIZE / 2, z0 = iz * step - SIZE / 2;
    const a = rawHeight(x0, z0), b = rawHeight(x0 + step, z0), c = rawHeight(x0, z0 + step), d = rawHeight(x0 + step, z0 + step);
    const expected = u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
    assert.ok(Math.abs(heightAt(x, z) - expected) < 1e-10);
  }
});
