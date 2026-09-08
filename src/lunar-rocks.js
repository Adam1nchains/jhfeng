// Animate the original obstacle instances, keeping their initial placement and shape.
export function rockKind(radius) { return radius <= .65 ? 'small' : radius <= 1.10 ? 'medium' : 'large'; }

export class RockField {
  constructor(rocks, heightAt) {
    this.heightAt = heightAt; this.active = new Set(); this.dirty = new Set(); this.limit = 12;
    this.time = 0; this.hits = 0; this.peak = 0;
    this.rocks = rocks.map((r, id) => ({ ...r, id, kind: rockKind(r.r),
      y: heightAt(r.x, r.z) + r.r * .24, rx: .15, ry: r.rotation || 0, rz: .12,
      vx: 0, vy: 0, vz: 0, sx: 0, sy: 0, sz: 0, age: 0, lastHit: -10, active: false }));
  }
  sleep(r) {
    r.y = this.heightAt(r.x, r.z) + r.r * .24;
    r.vx = r.vy = r.vz = r.sx = r.sy = r.sz = 0;
    r.active = false; this.active.delete(r.id); this.dirty.add(r.id);
  }
  setBudget(limit) {
    this.limit = Math.max(1, Math.min(20, Math.floor(limit)));
    while (this.active.size > this.limit) this.sleep(this.rocks[this.active.values().next().value]);
  }
  activate(r) {
    if (r.active) return;
    // A full pool must never turn a small rock back into an immovable wall.
    if (this.active.size >= this.limit) this.sleep(this.rocks[this.active.values().next().value]);
    r.active = true; r.age = 0; this.active.add(r.id); this.peak = Math.max(this.peak, this.active.size);
  }
  resolveContact(rover, rock, dt) {
    // Fixed landmarks have no kind; large rocks keep the normal obstacle response.
    if (!rock.kind || rock.kind === 'large') return false;
    if (rock.active && rock.y - this.heightAt(rock.x, rock.z) > 1.6) return true;
    const dx = rock.x - rover.x, dz = rock.z - rover.z, d = Math.hypot(dx, dz), reach = rock.r + 1.25;
    if (d >= reach) return true;
    const ground = this.heightAt(rock.x, rock.z);
    if (rover.y - ground > 2.5 + rock.r) return true;
    const sign = Math.sign(rover.speed) || 1, fx = -Math.sin(rover.yaw) * sign, fz = -Math.cos(rover.yaw) * sign;
    const nx = d > .001 ? dx / d : fx, nz = d > .001 ? dz / d : fz;
    const speed = Math.abs(rover.speed), approach = speed * (fx * nx + fz * nz);
    // Allow backing away without repeatedly re-launching the same object.
    if (approach <= .02) return true;
    const small = rock.kind === 'small', mobility = small ? 1 : .38;
    const overlap = reach - d;
    rock.x += nx * overlap * mobility; rock.z += nz * overlap * mobility;
    if (!small) {
      rover.x -= nx * overlap * (1 - mobility); rover.z -= nz * overlap * (1 - mobility);
      rover.speed *= Math.exp(-2.4 * dt);
    }
    this.activate(rock); this.dirty.add(rock.id);
    if (this.time - rock.lastHit < .32) return true;
    rock.lastHit = this.time; rock.age = 0; this.hits++;
    const massFactor = small ? 1 - (rock.r - .25) * .75 : .22;
    const kick = Math.min(4.2, .4 + approach * .68) * massFactor;
    rock.vx = fx * kick * .55 + nx * kick * .7;
    rock.vz = fz * kick * .55 + nz * kick * .7;
    rock.vy = small ? Math.min(1.65, .35 + approach * .2) * massFactor : Math.min(.17, speed * .025);
    const spin = (small ? 2.8 : .4) * massFactor * Math.min(speed, 5);
    rock.sx = -nz * spin; rock.sz = nx * spin; rock.sy = (rock.id % 2 ? 1 : -1) * spin * .2;
    if (small) { rover.speed *= .97; rover.vy = Math.min(.3, rover.vy + Math.min(.12, speed * .025)); }
    return true;
  }
  step(dt, rover) {
    this.time += dt;
    for (const id of this.active) {
      const r = this.rocks[id]; r.age += dt; r.vy -= 1.62 * dt;
      r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
      r.rx += r.sx * dt; r.ry += r.sy * dt; r.rz += r.sz * dt;
      const floor = this.heightAt(r.x, r.z) + r.r * .24;
      if (r.y <= floor) {
        r.y = floor; r.vy = r.vy < -.4 && r.kind === 'small' ? -r.vy * .23 : 0;
        const friction = r.kind === 'small' ? .72 : .5;
        r.vx *= friction; r.vz *= friction; r.sx *= friction; r.sy *= friction; r.sz *= friction;
        if (Math.hypot(r.vx, r.vz) < .12 && r.vy < .15) { this.sleep(r); continue; }
      }
      if (r.age > 6 || Math.hypot(r.x - rover.x, r.z - rover.z) > 32) { this.sleep(r); continue; }
      this.dirty.add(id);
    }
  }
  takeDirty() { const ids = [...this.dirty]; this.dirty.clear(); return ids; }
}
