import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHiddenSuit, SUIT_ROCK_INDEX } from './lunar-suit.js';
import { createRockGeometry } from './lunar-visuals.js';
import { RockField } from './lunar-rocks.js';
import { ROCKS, heightAt, START, createState, stepDrive } from './lunar-physics.js';
function setup() {
  const rock = new RockField(ROCKS, heightAt).rocks[SUIT_ROCK_INDEX];
  const geometry = createRockGeometry();
  const suit = createHiddenSuit(rock, geometry, heightAt, START);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.position.set(rock.x, rock.y, rock.z); mesh.rotation.set(rock.rx, rock.ry, rock.rz);
  mesh.scale.set(rock.r, rock.r * rock.stretch * .7, rock.r * .85); mesh.updateMatrixWorld(true);
  return { rock, suit, mesh };
}
test('the suit is concealed behind the original rock from normal front driving views in both detail tiers', () => {
  const { rock, suit, mesh } = setup();
  assert.ok(Math.hypot(rock.x - START.x, rock.z - START.z) > 110);
  const ray = new THREE.Raycaster(), point = new THREE.Vector3(), direction = new THREE.Vector3();
  for (const geometry of [mesh.geometry, new THREE.IcosahedronGeometry(1, 1)]) {
    mesh.geometry = geometry;
    for (const [distance, height] of [[9, 3.8], [15, 5.8], [26, 9.4]]) for (const angle of [-.18, 0, .18]) {
      const camera = new THREE.Vector3(rock.x, heightAt(rock.x, rock.z) + height, rock.z).addScaledVector(suit.away.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle), -distance);
      let visible = 0, count = 0;
      suit.group.traverse(m => {
        if (!m.isMesh) return;
        const positions = m.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          point.fromBufferAttribute(positions, i).applyMatrix4(m.matrixWorld);
          direction.copy(point).sub(camera); const length = direction.length();
          ray.set(camera, direction.normalize()); const hit = ray.intersectObject(mesh)[0];
          if (!hit || hit.distance >= length) visible++;
          count++;
        }
      });
      assert.equal(visible, 0, `${visible}/${count} vertices exposed from ${distance} m front view`);
    }
  }
});
test('opaque visor, limited static meshes, and attached colliders stay aligned when the host rock moves', () => {
  const { rock, suit } = setup();
  const meshes = suit.group.children.filter(m => m.isMesh);
  assert.ok(meshes.length <= 4);
  const triangles = meshes.reduce((sum, m) => sum + (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3, 0);
  assert.ok(triangles <= 20000, `suit exceeds geometry budget: ${triangles} triangles`);
  const woven = meshes.filter(m => m.material.bumpMap);
  assert.equal(woven.length, 2);
  suit.setDetail(false);
  assert.ok(woven.every(m => m.material.bumpMap === null));
  suit.setDetail(true);
  assert.ok(woven.every(m => m.material.bumpMap?.image.width === 128));
  const visor = meshes.find(m => m.material.metalness > .9);
  assert.ok(visor); assert.equal(visor.material.transparent, false); assert.equal(visor.material.opacity, 1);
  const old = suit.group.position.clone(), before = suit.colliders.map(c => ({...c}));
  rock.x += .08; rock.z -= .05; suit.sync();
  assert.ok(Math.abs(suit.group.position.x - old.x - .08) < 1e-8);
  assert.ok(Math.abs(suit.group.position.z - old.z + .05) < 1e-8);
  for (let i = 0; i < before.length; i++) {
    assert.ok(Math.abs(suit.colliders[i].x - before[i].x - .08) < .005);
    assert.ok(Math.abs(suit.colliders[i].z - before[i].z + .05) < .005);
  }
});

test('the rover cannot drive through the seated suit', () => {
  const { suit } = setup(), target = suit.colliders[1];
  const s = createState(); s.x = target.x + suit.away.x * 4; s.z = target.z + suit.away.z * 4;
  s.y = heightAt(s.x, s.z) + 1.06; s.yaw = Math.atan2(suit.away.x, suit.away.z);
  let collided = false;
  for (let i = 0; i < 5 * 90; i++) {
    stepDrive(s, {forward: true}, 1 / 90, suit.colliders); collided ||= s.collision;
    for (const c of suit.colliders) assert.ok(Math.hypot(s.x - c.x, s.z - c.z) >= c.r + 1.249);
  }
  assert.ok(collided);
});
