import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BouquetBody, createBouquet, BOUQUET_MASS } from './lunar-bouquet.js';
import { createHiddenSuit, SUIT_ROCK_INDEX } from './lunar-suit.js';
import { createRockGeometry } from './lunar-visuals.js';
import { RockField } from './lunar-rocks.js';
import { ROCKS, START, heightAt, createState, stepDrive } from './lunar-physics.js';
const flat = () => 0;
function settle(body, obstacles = [], seconds = 20) { for (let i = 0; i < seconds * 90; i++) body.step(1 / 90, obstacles); }
function grounded(body) { for (const p of body.groundPoints()) assert.ok(p.center.y - p.r >= body.heightAt(p.center.x, p.center.z) - 1e-6); }
function strike(speed, mass = BOUQUET_MASS) {
  const b = new BouquetBody(0, 0, 0, flat, mass);
  const rover = { x: .10, z: 1.28, y: 1.06, yaw: 0, speed, vy: 0 };
  b.resolveContact(rover, b.collider); return { b, rover };
}
test('bouquet has mass, lunar gravity, and no drag in free flight', () => {
  const b = new BouquetBody(0, 0, 0, flat); b.position.y = 10; b.velocity.set(2, 1, -.5);
  for (let i = 0; i < 90; i++) b.step(1 / 90);
  assert.equal(b.mass, .45); assert.ok(Math.abs(b.velocity.y + .62) < 1e-9);
  assert.equal(b.velocity.x, 2); assert.equal(b.velocity.z, -.5);
  assert.ok(Math.abs(b.position.x - 2) < 1e-9);
});
test('impacts slide and rotate the tied bouquet without stopping the much heavier rover', () => {
  const slow = strike(.4), fast = strike(5), heavy = strike(5, 45);
  assert.ok(fast.b.velocity.length() > slow.b.velocity.length());
  assert.ok(fast.b.spin.length() > .1); assert.ok(fast.rover.speed > 4.9);
  assert.ok(heavy.rover.speed < fast.rover.speed);
  const old = fast.b.position.clone(); settle(fast.b);
  assert.ok(fast.b.position.distanceTo(old) > .5); grounded(fast.b);
  assert.equal(fast.b.active, false);
  const rest = fast.b.position.clone(); settle(fast.b, [], 2); assert.deepEqual(fast.b.position, rest);
  const r = {x:fast.b.position.x, z:fast.b.position.z+1.2,y:1.06,yaw:0,speed:2};
  fast.b.resolveContact(r, fast.b.collider); assert.ok(fast.b.active); assert.ok(fast.b.velocity.length() > .1);
});
test('drop settles on sloping terrain without sinking and bounces only with lost energy', () => {
  const b = new BouquetBody(0, 0, .6, (x,z) => .06*x+.03*z); b.position.y = 2;
  let peakUp = 0;
  for (let i=0;i<1800;i++) { b.step(1/90); grounded(b); peakUp=Math.max(peakUp,b.velocity.y); }
  assert.ok(peakUp < 1); assert.equal(b.active,false);
});
test('bouquet cannot pass through nearby rocks or the suit, including a moving rock waking it', () => {
  const b = new BouquetBody(0, 0, 0, flat), wall = {x:2,z:0,r:.8}; b.velocity.x=3;
  settle(b,[wall]);
  for(const p of b.points()) assert.ok(Math.hypot(p.center.x-wall.x,p.center.z-wall.z)>=wall.r+p.r-1e-5);
  b.active=false; const moving={x:b.position.x-.3,z:b.position.z,r:.3,active:true,vx:.3};
  b.step(1/90,[moving]); assert.ok(b.active); assert.ok(b.velocity.x>0);
});
test('actual driving displaces the bouquet and clears its old position', () => {
  const b=new BouquetBody(0,40,0,heightAt), rover=createState(); rover.z=44;
  const resolver={resolveContact:(s,o)=>b.resolveContact(s,o)};
  for(let i=0;i<450;i++){stepDrive(rover,{forward:true},1/90,[b.collider],resolver); b.step(1/90);}
  assert.ok(rover.z<38); assert.ok(b.hits>0); assert.ok(Math.hypot(b.collider.x,b.collider.z-40)>.5);
  assert.equal(b.collider.x,b.position.x); assert.equal(b.collider.z,b.position.z);
});
test('five roses remain lightweight, beside the suit, grounded and hidden from the front', () => {
  const field=new RockField(ROCKS,heightAt), rock=field.rocks[SUIT_ROCK_INDEX], geo=createRockGeometry();
  const suit=createHiddenSuit(rock,geo,heightAt,START), bouquet=createBouquet(suit,heightAt);
  settle(bouquet.body,[...field.rocks,...suit.colliders]); bouquet.sync(); grounded(bouquet.body);
  assert.equal(bouquet.body.active,false);
  assert.ok(bouquet.group.position.distanceTo(suit.group.position)<1.6);
  const meshes=bouquet.group.children.filter(m=>m.isMesh);
  assert.equal(meshes.length,3);
  assert.ok(meshes.reduce((n,m)=>n+(m.geometry.index?.count??m.geometry.attributes.position.count)/3,0)<12000);
  const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial()); mesh.position.set(rock.x,rock.y,rock.z); mesh.rotation.set(rock.rx,rock.ry,rock.rz); mesh.scale.set(rock.r,rock.r*rock.stretch*.7,rock.r*.85);mesh.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(),point=new THREE.Vector3();
  for(const geometry of [geo,new THREE.IcosahedronGeometry(1,1)]){
    mesh.geometry=geometry;
    const camera=new THREE.Vector3(rock.x,heightAt(rock.x,rock.z)+5.8,rock.z).addScaledVector(suit.away,-15);
    for(const m of meshes)for(let i=0;i<m.geometry.attributes.position.count;i++){
      point.fromBufferAttribute(m.geometry.attributes.position,i).applyMatrix4(m.matrixWorld);
      const dir=point.clone().sub(camera),length=dir.length();ray.set(camera,dir.normalize());
      const hit=ray.intersectObject(mesh)[0]; assert.ok(hit&&hit.distance<length,'flower exposed from front');
    }
  }
});

test('the rendered bouquet lands after a fast impact with no visible ground penetration', () => {
  const field = new RockField(ROCKS, heightAt), rock = field.rocks[SUIT_ROCK_INDEX];
  const suit = createHiddenSuit(rock, createRockGeometry(), heightAt, START), bouquet = createBouquet(suit, heightAt);
  const b = bouquet.body, obstacles = [...field.rocks, ...suit.colliders];
  settle(b, obstacles);
  const rover = {x:b.position.x + 1.28, z:b.position.z, y:heightAt(b.position.x + 1.28,b.position.z)+1.06, yaw:Math.PI/2, speed:7};
  b.resolveContact(rover,b.collider); assert.ok(b.hits>0);
  let lowest = Infinity;
  for(let frame=0;frame<1350;frame++) {
    b.step(1/90,obstacles);
    if(frame%15)continue;
    bouquet.sync();
    for(const mesh of bouquet.group.children) {
      const positions = mesh.geometry.attributes.position, p = new THREE.Vector3();
      for(let i=0;i<positions.count;i++) {
        p.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);
        lowest = Math.min(lowest,p.y-heightAt(p.x,p.z));
      }
    }
  }
  assert.ok(lowest>-.015, `visible geometry sank ${lowest} m`);
  assert.equal(b.active,false);
});
