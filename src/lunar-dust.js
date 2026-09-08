// A small reusable pool: ballistic grit, no smoke simulation or particle collisions.
export class DustField {
  constructor(heightAt, random = Math.random) {
    this.heightAt = heightAt; this.random = random; this.limit = 0; this.credit = 0; this.next = 0; this.wheel = 0;
    this.particles = Array.from({ length: 56 }, () => ({ life: 0, age: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0 }));
  }
  clear() { for (const p of this.particles) p.life = 0; this.credit = 0; this.next = 0; }
  setBudget(limit) { this.limit = Math.max(0, Math.min(this.particles.length, Math.floor(limit))); this.clear(); }
  step(dt, rover) {
    if (!this.limit) return;
    for (let i = 0; i < this.limit; i++) {
      const p = this.particles[i]; if (!p.life) continue;
      p.age += dt; p.vy -= 1.62 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.age >= p.life || p.y <= this.heightAt(p.x, p.z) + .018) p.life = 0;
    }
    const speed = Math.abs(rover.speed);
    if (speed < .25 || rover.y > this.heightAt(rover.x, rover.z) + 1.65) { this.credit = 0; return; }
    this.credit += Math.min(this.limit * .65, speed * 5) * dt;
    const sin = Math.sin(rover.yaw), cos = Math.cos(rover.yaw), direction = Math.sign(rover.speed);
    while (this.credit >= 1) {
      this.credit--; const side = this.wheel++ % 2 ? 1 : -1;
      const x = rover.x + cos * side * 1.03 + sin * direction * 1.2;
      const z = rover.z - sin * side * 1.03 + cos * direction * 1.2;
      const floor = this.heightAt(x, z);
      // Suspended wheels do not emit; terrain under each rear contact sets the origin.
      if (rover.y - floor > 1.9) continue;
      const p = this.particles[this.next++ % this.limit], spread = .12 + this.random() * .3;
      const throwBack = direction * (.18 + speed * .1);
      p.x = x; p.y = floor + .045; p.z = z; p.age = 0; p.life = .65 + this.random() * .3;
      p.vx = sin * throwBack + cos * side * spread;
      p.vz = cos * throwBack - sin * side * spread;
      p.vy = .25 + this.random() * .3 + Math.min(speed, 5) * .045;
      p.size = .07 + this.random() * .10;
    }
  }
}
