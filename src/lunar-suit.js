import * as THREE from 'three';
import { batchParts } from './lunar-visuals.js';

// An unmarked location, away from both the landing apron and mission corridor.
export const SUIT_ROCK_INDEX = 241;
export function createHiddenSuit(rock, rockGeometry, heightAt, approach) {
  const group = new THREE.Group(); group.name = 'quiet-suit'; group.scale.setScalar(.94);
  const cloth = new THREE.MeshStandardMaterial({ color: 0xc4c1b5, roughness: .91 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x85847c, roughness: .96 });
  const seals = new THREE.MeshStandardMaterial({ color: 0x373c3d, roughness: .8 });
  const visor = new THREE.MeshStandardMaterial({ color: 0x11191e, metalness: .93, roughness: .15, envMapIntensity: .8 });
  function mesh(geo, mat, p, scale = [1, 1, 1]) {
    const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.scale.set(...scale);
    m.castShadow = m.receiveShadow = true; group.add(m); return m;
  }
  const ball = (p, scale, mat = cloth) => mesh(new THREE.SphereGeometry(1, 16, 12), mat, p, scale);
  const box = (p, scale, mat = cloth) => mesh(new THREE.BoxGeometry(1, 1, 1), mat, p, scale);
  function limb(a, b, radius, mat = cloth) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), direction = end.clone().sub(start);
    const m = mesh(new THREE.CapsuleGeometry(radius, Math.max(.01, direction.length() - radius * 2), 4, 12), mat, start.add(end).multiplyScalar(.5).toArray());
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()); return m;
  }
  function band(p, axis, radius, thickness = .015, mat = trim) {
    const m = mesh(new THREE.TorusGeometry(radius, thickness, 5, 16), mat, p);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...axis).normalize());
  }
  // Pelvis on the ground; the upper body leans back, legs loosely extended.
  ball([0, .25, .04], [.32, .27, .27]);
  const chest = ball([0, .77, -.075], [.335, .405, .245]); chest.rotation.x = -.20;
  box([0, .72, -.325], [.44, .52, .18]);
  box([0, .78, -.426], [.32, .29, .035], trim);
  band([0, 1.08, -.19], [0, 1, -.2], .18, .041, seals);
  band([0, 1.10, -.19], [0, 1, -.2], .215, .026);
  ball([0, 1.32, -.245], [.305, .30, .29]);
  // Opaque curved glass. There is no face, transparent layer, or interior model.
  mesh(new THREE.SphereGeometry(1, 24, 14, Math.PI * .16, Math.PI * .68, .60, 1.55), visor,
    [0, 1.32, -.231], [.311, .304, .297]);
  for (const side of [-1, 1]) {
    ball([side * .286, 1.31, -.255], [.044, .10, .10], trim);
    ball([side * .31, .96, -.095], [.17, .17, .18]);
  }
  const leftElbow = [-.43, .69, .24], rightElbow = [.42, .66, .36];
  limb([-.31, .95, -.07], leftElbow, .135);
  limb([.31, .95, -.07], rightElbow, .135);
  ball(leftElbow, [.13, .13, .13]); ball(rightElbow, [.13, .13, .13]);
  // Crossed forearms occupy separate depth layers, rather than intersecting.
  limb(leftElbow, [.20, .84, .24], .095);
  limb(rightElbow, [-.19, .84, .44], .095);
  band([.14, .825, .24], [.63, .15, 0], .094, .024, seals);
  band([-.13, .823, .432], [-.61, .18, .08], .094, .024, seals);
  const leftGlove = ball([.255, .85, .24], [.14, .10, .105], trim); leftGlove.rotation.z = .2;
  const rightGlove = ball([-.25, .86, .445], [.14, .10, .105], trim); rightGlove.rotation.z = -.2;
  // A few sleeve folds and suit fasteners remain legible without texture downloads.
  band([-.39, .77, .15], [-.12, -.26, .31], .128);
  band([.39, .76, .24], [.11, -.29, .43], .128);
  box([0, .94, .163], [.12, .085, .035], trim);
  for (const x of [-.16, .16]) ball([x, .56, .17], [.032, .032, .025], seals);
  const legs = [
    { hip: [-.17, .29, .10], knee: [-.23, .37, .63], ankle: [-.27, .15, 1.10], foot: [-.28, .14, 1.24], angle: -.10 },
    { hip: [.17, .27, .10], knee: [.25, .26, .72], ankle: [.30, .14, 1.25], foot: [.32, .14, 1.39], angle: .13 }
  ];
  for (const l of legs) {
    limb(l.hip, l.knee, .155); ball(l.knee, [.16, .15, .17]); limb(l.knee, l.ankle, .132);
    const kneePad = ball([l.knee[0], l.knee[1] + .11, l.knee[2]], [.125, .045, .15], trim); kneePad.rotation.x = .15;
    band(l.ankle, [0, 0, 1], .127, .024, seals);
    const boot = ball(l.foot, [.148, .14, .265], trim); boot.rotation.y = l.angle;
    const sole = box([l.foot[0], .034, l.foot[2]], [.275, .065, .44], seals); sole.rotation.y = l.angle;
  }
  batchParts(group);

  const away = new THREE.Vector3(rock.x - approach.x, 0, rock.z - approach.z).normalize();
  const heading = Math.atan2(away.x, away.z);
  const probe = new THREE.Mesh(rockGeometry, new THREE.MeshBasicMaterial());
  probe.position.set(rock.x, rock.y, rock.z); probe.rotation.set(rock.rx, rock.ry, rock.rz);
  probe.scale.set(rock.r, rock.r * rock.stretch * .7, rock.r * .85); probe.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(), ground = heightAt(rock.x, rock.z);
  let offset = 0;
  // Fit the reclining back to the actual irregular rock surface, not its radius.
  for (const [y, back] of [[.72, .42], [.96, .30], [1.32, .54]]) {
    ray.set(new THREE.Vector3(rock.x, ground + y * .94, rock.z).addScaledVector(away, rock.r * 4), away.clone().negate());
    const hit = ray.intersectObject(probe)[0];
    if (hit) offset = Math.max(offset, rock.r * 4 - hit.distance + back * .94 - .035);
  }
  probe.material.dispose();
  const colliders = [{ x: 0, z: 0, r: .43 }, { x: 0, z: 0, r: .48 }];
  function sync() {
    const x = rock.x + away.x * offset, z = rock.z + away.z * offset;
    // Match the small local ground slope beneath the sitting pose and both boots.
    const slope = Math.atan2(heightAt(x + away.x * 1.5, z + away.z * 1.5) - heightAt(x, z), 1.5);
    group.position.set(x, heightAt(x, z) + .018, z); group.rotation.set(-slope, heading, 0, 'YXZ');
    group.updateMatrixWorld(true);
    for (let i = 0; i < colliders.length; i++) {
      const p = group.localToWorld(new THREE.Vector3(0, 0, i ? 1.13 : .18));
      colliders[i].x = p.x; colliders[i].z = p.z;
    }
  }
  sync();
  return { group, colliders, sync, offset, away };
}
