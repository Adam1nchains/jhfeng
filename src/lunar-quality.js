export const PROFILES = [
  { name: 'low', ratio: 1, pixels: 1_000_000, shadows: false, shadowSize: 1024, pebbles: 260, activeRocks: 4, dust: 0 },
  { name: 'balanced', ratio: 1.25, pixels: 1_800_000, shadows: true, shadowSize: 1024, pebbles: 650, activeRocks: 12, dust: 32 },
  { name: 'high', ratio: 2, pixels: 3_200_000, shadows: true, shadowSize: 2048, pebbles: 950, activeRocks: 20, dust: 56 }
];
export function pixelRatioFor(profile, width, height, dpr, scale = 1) {
  return Math.min(dpr, profile.ratio * scale, Math.sqrt(profile.pixels / Math.max(1, width * height)) * scale);
}
// Feed disjoint two-second windows from active, visible rendering only.
// Slow windows degrade quickly. Raising quality needs sustained smooth output.
export class QualityBudget {
  constructor() { this.tier = 1; this.scale = 1; this.slow = 0; this.smooth = 0; this.cooldown = 0; }
  observe(milliseconds) {
    if (!milliseconds.length) return false;
    const samples = [...milliseconds].sort((a, b) => a - b);
    const average = samples.reduce((a, b) => a + b, 0) / samples.length;
    const p90 = samples[Math.floor(samples.length * .9)];
    const slow = average > 21 || p90 > 26;
    this.slow = slow ? this.slow + 1 : 0;
    this.smooth = !slow && average < 18.2 && p90 < 20 ? this.smooth + 1 : 0;
    this.cooldown = Math.max(0, this.cooldown - 1);
    if (this.slow >= 2) {
      this.slow = this.smooth = 0; this.cooldown = 30;
      if (this.tier > 0) { this.tier--; this.scale = 1; return true; }
      if (this.scale > .5) { this.scale = Math.max(.5, this.scale - .15); return true; }
    }
    if (!this.cooldown && this.smooth >= 6 && this.tier < 2) {
      this.tier++; this.scale = 1; this.smooth = 0; return true;
    }
    return false;
  }
  setMode(mode) { this.tier = mode === 'low' ? 0 : mode === 'high' ? 2 : 1; this.scale = 1; this.slow = this.smooth = this.cooldown = 0; }
}
