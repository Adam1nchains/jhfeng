import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { batchParts } from './lunar-visuals.js';

// An unmarked location, away from both the landing apron and mission corridor.
export const SUIT_ROCK_INDEX = 241;
export function createHiddenSuit(rock, rockGeometry, heightAt, approach) {
  const group = new THREE.Group(); group.name = 'quiet-suit'; group.scale.setScalar(.94);
  const cloth = new THREE.MeshStandardMaterial({ color: 0xc4c1b5, roughness: .91 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x85847c, roughness: .96 });
  const seals = new THREE.MeshStandardMaterial({ color: 0x373c3d, roughness: .8 });
  const visor = new THREE.MeshStandardMaterial({ color: 0x11191e, metalness: .93, roughness: .15, envMapIntensity: .8 });
  // A tiny shared weave, generated once; no external images or per-frame simulation.
  const weaveData = new Uint8Array(128 * 128 * 4);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const shade = 128 + 8 * Math.sin(x * Math.PI / 2) + 8 * Math.sin(y * Math.PI / 2) + ((x * 17 + y * 31) % 7 - 3);
    const i = (y * 128 + x) * 4; weaveData[i] = weaveData[i + 1] = weaveData[i + 2] = shade; weaveData[i + 3] = 255;
  }
  const weave = new THREE.DataTexture(weaveData, 128, 128);
  weave.wrapS = weave.wrapT = THREE.RepeatWrapping; weave.repeat.set(4, 4);
  weave.generateMipmaps = true; weave.minFilter = THREE.LinearMipmapLinearFilter; weave.magFilter = THREE.LinearFilter; weave.needsUpdate = true;
  function setDetail(enabled) {
    for (const material of [cloth, trim]) { material.bumpMap = enabled ? weave : null; material.bumpScale = .006; material.needsUpdate = true; }
  }
  setDetail(true);
  function mesh(geo, mat, p, scale = [1, 1, 1]) {
    const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.scale.set(...scale);
    m.castShadow = m.receiveShadow = true; group.add(m); return m;
  }
  const ball = (p, scale, mat = cloth) => mesh(new THREE.SphereGeometry(1, 16, 12), mat, p, scale);
  const box = (p, scale, mat = cloth) => mesh(new THREE.BoxGeometry(1, 1, 1), mat, p, scale);
  function padded(p, size, mat = cloth) {
    const rounded = new RoundedBoxGeometry(...size, 1, Math.min(...size) * .22);
    const indexed = mergeVertices(rounded); rounded.dispose(); return mesh(indexed, mat, p);
  }
  function piping(points, radius = .006, mat = trim) {
    return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), Math.max(8, points.length * 3), radius, 6, false), mat, [0, 0, 0]);
  }
  function limb(a, b, radius, mat = cloth) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), direction = end.clone().sub(start);
    const length = direction.length(), profile = [];
    for (let i = 0; i <= 18; i++) {
      const t = i / 18, edge = Math.min(t, 1 - t) * length;
      const cap = edge < radius ? Math.sqrt(Math.max(0, radius * radius - (radius - edge) ** 2)) : radius;
      const fold = 1 + .035 * Math.sin(t * 39) + .022 * Math.sin(t * 73);
      profile.push(new THREE.Vector2(cap * fold, (t - .5) * length));
    }
    const m = mesh(new THREE.LatheGeometry(profile, 12), mat, start.add(end).multiplyScalar(.5).toArray());
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()); return m;
  }
  function band(p, axis, radius, thickness = .015, mat = trim) {
    const m = mesh(new THREE.TorusGeometry(radius, thickness, 5, 16), mat, p);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...axis).normalize());
  }
  // Pelvis on the ground; the upper body leans back, legs loosely extended.
  ball([0, .25, .04], [.32, .27, .27]);
  const chest = ball([0, .77, -.075], [.335, .405, .245]); chest.rotation.x = -.20;
  padded([0, .72, -.325], [.44, .52, .18]);
  padded([0, .78, -.426], [.32, .29, .035], trim);
  for (const x of [-.20, .20]) padded([x, .71, -.433], [.027, .42, .025], trim);
  for (const y of [.61, .67, .73]) box([0, y, -.45], [.22, .012, .01], seals);
  band([0, 1.08, -.19], [0, 1, -.2], .18, .041, seals);
  band([0, 1.10, -.19], [0, 1, -.2], .215, .026);
  ball([0, 1.32, -.245], [.305, .30, .29]);
  // Opaque curved glass. There is no face, transparent layer, or interior model.
  mesh(new THREE.SphereGeometry(1, 24, 14, Math.PI * .16, Math.PI * .68, .60, 1.55), visor,
    [0, 1.32, -.231], [.311, .304, .297]);
  // Follow the glass perimeter with a raised gasket and retaining rim.
  const rim = [];
  const edge = (phi, theta) => [-.315 * Math.cos(phi) * Math.sin(theta), 1.32 + .308 * Math.cos(theta), -.231 + .301 * Math.sin(phi) * Math.sin(theta)];
  for (let i = 0; i <= 14; i++) rim.push(edge(Math.PI * (.16 + .68 * i / 14), .60));
  for (let i = 1; i <= 10; i++) rim.push(edge(Math.PI * .84, .60 + 1.55 * i / 10));
  for (let i = 1; i <= 14; i++) rim.push(edge(Math.PI * (.84 - .68 * i / 14), 2.15));
  for (let i = 1; i <= 10; i++) rim.push(edge(Math.PI * .16, 2.15 - 1.55 * i / 10));
  piping(rim, .010, trim);
  for (const side of [-1, 1]) {
    ball([side * .286, 1.31, -.255], [.044, .10, .10], trim);
    const hinge = mesh(new THREE.CylinderGeometry(.045, .045, .012, 12), seals, [side * .329, 1.31, -.255]); hinge.rotation.z = Math.PI / 2;
    box([side * .336, 1.31, -.255], [.012, .026, .008], trim);
    ball([side * .31, .96, -.095], [.17, .17, .18]);
    piping([[side * .19, 1.06, .075], [side * .255, .96, .10], [side * .27, .85, .095]], .008);
    piping([[side * .25, .64, .09], [side * .22, .54, .14], [side * .13, .48, .21]], .007);
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
  for (const [side, y, z] of [[1, .85, .24], [-1, .86, .445]]) {
    ball([side * .24, y, z], [.096, .078, .086], trim);
    ball([side * .24, y, z + .078], [.068, .060, .018], cloth);
    for (let i = 0; i < 4; i++) {
      const fingerY = y - .048 + i * .032;
      piping([[side * .28, fingerY, z + .045], [side * .333, fingerY, z + .055], [side * .35, fingerY, z + .017]], .020, trim);
    }
    piping([[side * .22, y - .055, z + .005], [side * .255, y - .090, z + .035], [side * .29, y - .071, z + .045]], .027, trim);
  }
  // Layered chest fittings and a short pressure hose, with no lights or identifiers.
  band([-.39, .77, .15], [-.12, -.26, .31], .128);
  band([.39, .76, .24], [.11, -.29, .43], .128);
  padded([0, .96, .177], [.19, .13, .045]);
  padded([0, .96, .204], [.15, .087, .012], trim);
  for (const x of [-.035, .035]) box([x, .96, .215], [.019, .032, .012], seals);
  for (const x of [-.077, .077]) for (const y of [.913, 1.007]) ball([x, y, .202], [.008, .008, .008], trim);
  for (const x of [-.16, .16]) {
    const port = mesh(new THREE.CylinderGeometry(.036, .039, .022, 12), seals, [x, .56, .18]); port.rotation.x = Math.PI / 2;
    band([x, .56, .196], [0, 0, 1], .025, .007, trim);
  }
  piping([[-.16, .56, .20], [-.23, .47, .24], [-.11, .415, .28], [.07, .43, .27], [.16, .56, .20]], .019, trim);
  const legs = [
    { hip: [-.17, .29, .10], knee: [-.23, .37, .63], ankle: [-.27, .15, 1.10], foot: [-.28, .14, 1.24], angle: -.10 },
    { hip: [.17, .27, .10], knee: [.25, .26, .72], ankle: [.30, .14, 1.25], foot: [.32, .14, 1.39], angle: .13 }
  ];
  for (const l of legs) {
    limb(l.hip, l.knee, .155); ball(l.knee, [.16, .15, .17]); limb(l.knee, l.ankle, .132);
    const kneePad = padded([l.knee[0], l.knee[1] + .11, l.knee[2]], [.23, .055, .25], trim); kneePad.rotation.x = .15;
    for (const side of [-1, 1]) piping([[l.knee[0] + side * .085, l.knee[1] + .15, l.knee[2] - .07], [l.knee[0] + side * .09, l.knee[1] + .14, l.knee[2] + .07]], .005, cloth);
    band(l.ankle, [0, 0, 1], .127, .024, seals);
    const boot = ball(l.foot, [.148, .14, .265], trim); boot.rotation.y = l.angle;
    const sole = padded([l.foot[0], .034, l.foot[2]], [.285, .065, .46], seals); sole.rotation.y = l.angle;
    for (let j = -2; j <= 2; j++) {
      const z = j * .08, cx = l.foot[0] + Math.sin(l.angle) * z, cz = l.foot[2] + Math.cos(l.angle) * z;
      const tread = box([cx, .028, cz], [.296, .032, .024], trim); tread.rotation.y = l.angle;
    }
    piping([[l.foot[0] - .11, .12, l.foot[2] + .12], [l.foot[0], .14, l.foot[2] + .23], [l.foot[0] + .11, .12, l.foot[2] + .12]], .012, seals);
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
  return { group, colliders, sync, offset, away, setDetail };
}
