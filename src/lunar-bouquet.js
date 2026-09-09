import * as THREE from 'three';
import { batchParts } from './lunar-visuals.js';

// One tied bouquet, not a particle system. SI units; an approximate rigid body.
export const BOUQUET_MASS = .45;
const GRAVITY = 1.62, ROVER_MASS = 350;
export const BOUQUET_HULL = [
  { x: 0, y: 0, z: -.30, r: .045 },
  { x: 0, y: 0, z: -.13, r: .075 },
  { x: -.10, y: 0, z: .12, r: .13 },
  { x: .10, y: 0, z: .15, r: .13 },
  { x: 0, y: .035, z: .25, r: .12 }
];

export class BouquetBody {
  constructor(x, z, yaw, heightAt, mass = BOUQUET_MASS) {
    this.heightAt = heightAt; this.mass = mass; this.inertia = mass * .065;
    this.position = new THREE.Vector3(x, 0, z);
    this.quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.velocity = new THREE.Vector3(); this.spin = new THREE.Vector3();
    this.active = true; this.restTime = 0; this.hits = 0;
    this.collider = { x, z, r: .46, bouquet: true };
    this.projectGround(); this.syncCollider();
  }
  points() { return BOUQUET_HULL.map(p => ({ center: new THREE.Vector3(p.x, p.y, p.z).applyQuaternion(this.quaternion).add(this.position), r: p.r })); }
  groundPoints() { return this.support ? this.support.map(v => ({center:v.clone().applyQuaternion(this.quaternion).add(this.position),r:0})) : this.points(); }
  syncCollider() { this.collider.x = this.position.x; this.collider.z = this.position.z; }
  projectGround() {
    let lift = 0;
    for (const p of this.groundPoints()) lift = Math.max(lift, this.heightAt(p.center.x, p.center.z) + p.r - p.center.y);
    this.position.y += lift;
  }
  wake() { this.active = true; this.restTime = 0; }
  impulse(impulse, arm) {
    this.velocity.addScaledVector(impulse, 1 / this.mass);
    this.spin.addScaledVector(arm.clone().cross(impulse), 1 / this.inertia);
  }
  contact(normal, arm, surfaceVelocity, restitution, friction) {
    const relative = this.spin.clone().cross(arm).add(this.velocity).sub(surfaceVelocity);
    const closing = relative.dot(normal);
    if (closing >= 0) return 0;
    const denominator = 1 / this.mass + arm.clone().cross(normal).lengthSq() / this.inertia;
    const j = -(1 + restitution) * closing / denominator;
    this.impulse(normal.clone().multiplyScalar(j), arm);
    const tangent = relative.addScaledVector(normal, -closing), speed = tangent.length();
    if (speed > 1e-6) {
      tangent.divideScalar(speed);
      const jt = Math.min(friction * j, speed / (1 / this.mass + arm.clone().cross(tangent).lengthSq() / this.inertia));
      this.impulse(tangent.multiplyScalar(-jt), arm);
    }
    return j;
  }
  resolveContact(rover, object) {
    if (object !== this.collider) return false;
    if (Math.hypot(rover.x - this.position.x, rover.z - this.position.z) > 1.8) return true;
    if (rover.y - this.heightAt(rover.x, rover.z) > 2.5) return true;
    const forward = new THREE.Vector3(-Math.sin(rover.yaw), 0, -Math.cos(rover.yaw));
    const speed = forward.clone().multiplyScalar(rover.speed);
    for (const p of this.points()) {
      if (p.center.y - p.r > rover.y + .55) continue;
      const dx = p.center.x - rover.x, dz = p.center.z - rover.z, d = Math.hypot(dx, dz), reach = 1.25 + p.r;
      if (d >= reach) continue;
      const nx = d > .001 ? dx / d : forward.x, nz = d > .001 ? dz / d : forward.z;
      // A shallow upward contact normal approximates the rounded wheel/tread edge.
      const normal = new THREE.Vector3(nx, .14, nz).normalize();
      const arm = p.center.clone().sub(this.position).addScaledVector(normal, -p.r);
      const j = this.contact(normal, arm, speed, .08, .32);
      this.position.x += nx * (reach - d); this.position.z += nz * (reach - d);
      if (j > 0) { rover.speed -= j * normal.dot(forward) / ROVER_MASS; this.hits++; }
      this.wake();
    }
    this.syncCollider(); return true;
  }
  step(dt, obstacles = []) {
    // A moved host rock can wake the bouquet; stationary scenery costs no contact solving.
    if (!this.active && !obstacles.some(o => o.active && Math.hypot(o.x - this.position.x, o.z - this.position.z) < o.r + .5)) return;
    this.active = true;
    this.velocity.y -= GRAVITY * dt;
    this.position.addScaledVector(this.velocity, dt);
    const rotation = this.spin.length() * dt;
    if (rotation > 1e-9) this.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(this.spin.clone().normalize(), rotation)).normalize();
    let supported = false;
    // Small bounded contact manifold: five spheres, four solver passes.
    for (let pass = 0; pass < 4; pass++) {
      for (const p of this.groundPoints()) {
        const h = this.heightAt(p.center.x, p.center.z), depth = h + p.r - p.center.y;
        if (depth < -.002) continue;
        supported = true;
        this.position.y += Math.max(0, depth);
        const e = .06, normal = new THREE.Vector3(this.heightAt(p.center.x - e, p.center.z) - this.heightAt(p.center.x + e, p.center.z), 2 * e, this.heightAt(p.center.x, p.center.z - e) - this.heightAt(p.center.x, p.center.z + e)).normalize();
        const arm = p.center.clone().sub(this.position).addScaledVector(normal, -p.r);
        this.contact(normal, arm, new THREE.Vector3(), this.velocity.y < -.55 ? .12 : 0, .65);
      }
    }
    for (const o of obstacles) {
      if (o === this.collider || Math.hypot(o.x - this.position.x, o.z - this.position.z) > o.r + .5) continue;
      const top = this.heightAt(o.x, o.z) + (o.kind ? o.r * 1.4 : 1.6);
      for (const p of this.points()) {
        if (p.center.y - p.r > top) continue;
        const dx = p.center.x - o.x, dz = p.center.z - o.z, distance = Math.hypot(dx, dz), reach = o.r + p.r;
        if (distance >= reach) continue;
        const n = new THREE.Vector3(distance > .001 ? dx / distance : 1, 0, distance > .001 ? dz / distance : 0);
        this.position.addScaledVector(n, reach - distance);
        const arm = p.center.clone().sub(this.position).addScaledVector(n, -p.r);
        this.contact(n, arm, new THREE.Vector3(o.vx || 0, 0, o.vz || 0), .10, .5);
      }
    }
    if (supported) {
      // Rolling resistance and internal deformation act only on ground contact, not in vacuum.
      this.spin.multiplyScalar(Math.exp(-3.5 * dt));
      if (this.velocity.length() < .045 && this.spin.length() < .10) this.restTime += dt;
      else this.restTime = 0;
      if (this.restTime > .5) { this.active = false; this.velocity.set(0, 0, 0); this.spin.set(0, 0, 0); }
    } else this.restTime = 0;
    this.projectGround(); this.syncCollider();
  }
}

export function createBouquet(suit, heightAt) {
  const group = new THREE.Group(); group.name = 'quiet-roses';
  const red = new THREE.MeshStandardMaterial({ color: 0x842337, roughness: .88, side: THREE.DoubleSide });
  const green = new THREE.MeshStandardMaterial({ color: 0x384c2d, roughness: .94, side: THREE.DoubleSide });
  const ribbon = new THREE.MeshStandardMaterial({ color: 0xb9aa8e, roughness: .93, side: THREE.DoubleSide });
  function part(geo, mat, p) { const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.castShadow = m.receiveShadow = true; group.add(m); return m; }
  const roses = [[-.105, 0, .11], [.10, .005, .14], [0, .04, .245], [-.04, .07, .13], [.045, -.025, .22]];
  for (let k = 0; k < roses.length; k++) {
    const p = new THREE.Vector3(...roses[k]);
    const stem = new THREE.CatmullRomCurve3([new THREE.Vector3((k - 2) * .008, -.015, -.33 + k * .008), new THREE.Vector3(0, 0, -.08), p]);
    part(new THREE.TubeGeometry(stem, 8, .007, 5, false), green, [0, 0, 0]);
    // Nested curved petals form a rose spiral without texture downloads.
    for (let ring = 0; ring < 4; ring++) for (let j = 0; j < 7; j++) {
      const angle = j * Math.PI * 2 / 7 + ring * .67 + k * 1.7;
      const radius = .018 + ring * .014;
      const positions = [], indices = [];
      for (let v = 0; v <= 5; v++) for (let u = 0; u <= 6; u++) {
        const t = v / 5, across = u / 6 - .5;
        const theta = angle + across * (1.18 + t * .45);
        const r = radius * (.27 + .90 * Math.sin(t * Math.PI / 2));
        positions.push(Math.sin(theta) * r, -.028 + t * (.086 - ring * .009) - across * across * .020 - t ** 5 * .006, Math.cos(theta) * r);
        if (v < 5 && u < 6) { const i = v * 7 + u; indices.push(i, i + 7, i + 1, i + 1, i + 7, i + 8); }
      }
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3 * 2), 2));
      geometry.setIndex(indices); geometry.computeVertexNormals();
      part(geometry, red, p.toArray());
    }
    const bud = part(new THREE.SphereGeometry(.014, 8, 6), red, [p.x, p.y + .037, p.z]); bud.scale.y = 1.4;
    for (const side of [-1, 1]) {
      const leaf = part(new THREE.SphereGeometry(1, 8, 4), green, [side * (.055 + k * .004), -.013, -.06 + k * .027]);
      leaf.scale.set(.07, .006, .025); leaf.rotation.y = side * .6;
    }
  }
  const tie = part(new THREE.TorusGeometry(.027, .009, 5, 14), ribbon, [0, 0, -.12]);
  tie.rotation.z = .15;
  for (const side of [-1, 1]) {
    const bow = part(new THREE.TorusGeometry(.028, .007, 4, 12), ribbon, [side * .035, .018, -.115]);
    bow.scale.set(1.35, .6, 1); bow.rotation.x = Math.PI / 2; bow.rotation.y = side * .35;
  }
  batchParts(group);
  const location = suit.group.localToWorld(new THREE.Vector3(.85, 0, .80));
  const body = new BouquetBody(location.x, location.z, Math.atan2(suit.away.x, suit.away.z) - .45, heightAt);
  // Sample the visible geometry's convex extremes once, so resting contact follows
  // petals, leaves and cut stems instead of the larger collision broad phase.
  const vertices = [];
  for (const m of group.children) {
    m.updateMatrix(); const positions = m.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) vertices.push(new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(m.matrix));
  }
  const support = new Set();
  for (let i = 0; i < 64; i++) {
    const y = 1 - 2 * i / 63, angle = i * 2.3999632297, r = Math.sqrt(1 - y * y);
    const direction = new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r);
    let best = vertices[0], dot = -Infinity;
    for (const v of vertices) if (v.dot(direction) > dot) { best = v; dot = v.dot(direction); }
    support.add(best);
  }
  body.support = [...support]; body.position.y = heightAt(location.x, location.z); body.projectGround();
  function sync() { group.position.copy(body.position); group.quaternion.copy(body.quaternion); group.updateMatrixWorld(true); }
  sync(); return { group, body, sync };
}
