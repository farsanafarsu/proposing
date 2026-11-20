import * as THREE from 'three';
import {
  createTable,
  createChair,
  createPlace,
  createVase,
  createTaperCandle,
  createWineGlass,
  createChandelier,
  createSconce,
  createCurtain,
  instanceTemplate,
  mergeByMaterial,
} from './props.js';
import { createRoseUrn } from './entrance.js';
import { Flame } from './flame.js';
import { radialTexture } from './textures.js';

export const ROOM = { halfW: 5.5, depth: 36, height: 4.6 };
export const HERO = new THREE.Vector3(0, 0, -30);
const BAYS = [-6, -12, -18, -24, -30];
const PILASTERS = [-3, -9, -15, -21, -27, -33];

/**
 * Scene 2 — the candlelit dining room. Repeated furniture is instanced
 * so the whole room costs only a few dozen draw calls.
 */
export function createRestaurant(mats, { quality = 'high' } = {}) {
  const root = new THREE.Group();
  const flames = [];
  const chandeliers = [];
  const { halfW, depth, height } = ROOM;

  /* ---------- shell */
  mats.floor.map.repeat.set(4, 13);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2, depth).rotateX(-Math.PI / 2), mats.floor);
  floor.position.set(0, 0, -depth / 2);
  floor.receiveShadow = true;
  root.add(floor);

  const runner = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.01, 27.6), mats.carpet);
  runner.position.set(0, 0.005, -0.4 - 13.8);
  runner.receiveShadow = true;
  root.add(runner);

  const wallParts = [];
  mats.wall.map.repeat.set(14, 1.3);
  for (const s of [-1, 1]) {
    wallParts.push({ geo: new THREE.PlaneGeometry(depth, height).rotateY(-s * Math.PI / 2).translate(s * halfW, height / 2, -depth / 2), mat: mats.wall });
    // wainscot + chair rail + crown
    wallParts.push({ geo: new THREE.BoxGeometry(0.06, 1.1, depth).translate(s * (halfW - 0.03), 0.55, -depth / 2), mat: mats.wainscot });
    wallParts.push({ geo: new THREE.BoxGeometry(0.1, 0.05, depth).translate(s * (halfW - 0.05), 1.12, -depth / 2), mat: mats.goldSatin });
    wallParts.push({ geo: new THREE.BoxGeometry(0.22, 0.2, depth).translate(s * (halfW - 0.11), height - 0.1, -depth / 2), mat: mats.wainscot });
    wallParts.push({ geo: new THREE.BoxGeometry(0.24, 0.03, depth).translate(s * (halfW - 0.12), height - 0.22, -depth / 2), mat: mats.gold });
    wallParts.push({ geo: new THREE.BoxGeometry(0.08, 0.08, depth).translate(s * (halfW - 0.04), 0.04, -depth / 2), mat: mats.goldSatin });
  }
  // back wall
  wallParts.push({ geo: new THREE.PlaneGeometry(halfW * 2, height).translate(0, height / 2, -depth), mat: mats.wall });
  wallParts.push({ geo: new THREE.BoxGeometry(halfW * 2, 1.1, 0.06).translate(0, 0.55, -depth + 0.03), mat: mats.wainscot });
  wallParts.push({ geo: new THREE.BoxGeometry(halfW * 2, 0.05, 0.1).translate(0, 1.12, -depth + 0.05), mat: mats.goldSatin });
  // ceiling & coffer beams — matte, or the chandelier lights smear across them
  const beamMat = new THREE.MeshStandardMaterial({ map: mats.wainscot.map, roughness: 0.9, metalness: 0 });
  wallParts.push({ geo: new THREE.PlaneGeometry(halfW * 2, depth).rotateX(Math.PI / 2).translate(0, height, -depth / 2), mat: mats.ceiling });
  for (const z of PILASTERS) {
    wallParts.push({ geo: new THREE.BoxGeometry(halfW * 2, 0.26, 0.32).translate(0, height - 0.13, z), mat: beamMat });
    wallParts.push({ geo: new THREE.BoxGeometry(halfW * 2, 0.025, 0.34).translate(0, height - 0.26, z), mat: mats.gold });
  }
  wallParts.push({ geo: new THREE.BoxGeometry(0.3, 0.26, depth).translate(0, height - 0.13, -depth / 2), mat: beamMat });
  // ceiling medallions above chandeliers
  for (const z of [-6, -13, -20, -30]) {
    wallParts.push({ geo: new THREE.CylinderGeometry(0.55, 0.6, 0.04, 40).translate(0, height - 0.02, z), mat: mats.goldSatin });
    wallParts.push({ geo: new THREE.TorusGeometry(0.7, 0.02, 6, 48).rotateX(Math.PI / 2).translate(0, height - 0.02, z), mat: mats.gold });
  }
  const shell = mergeByMaterial(wallParts, { receiveShadow: true });
  root.add(shell);

  /* ---------- pilasters with sconces (instanced) */
  const pil = new THREE.Group();
  const pilParts = [
    { geo: new THREE.BoxGeometry(0.14, height - 0.3, 0.42).translate(0.07, (height - 0.3) / 2, 0), mat: mats.wainscot },
    { geo: new THREE.BoxGeometry(0.18, 0.1, 0.5).translate(0.09, height - 0.35, 0), mat: mats.goldSatin },
    { geo: new THREE.BoxGeometry(0.16, 0.14, 0.48).translate(0.08, 0.07, 0), mat: mats.goldSatin },
    { geo: new THREE.BoxGeometry(0.02, 2.6, 0.03).translate(0.15, 2.3, -0.12), mat: mats.goldSatin },
    { geo: new THREE.BoxGeometry(0.02, 2.6, 0.03).translate(0.15, 2.3, 0.12), mat: mats.goldSatin },
  ];
  pil.add(mergeByMaterial(pilParts));
  const sconce = createSconce(mats);
  sconce.rotation.y = Math.PI / 2;
  sconce.position.set(0.16, 2.35, 0);
  pil.add(sconce);
  const pilMatrices = [];
  const sconcePositions = [];
  for (const z of PILASTERS) {
    for (const s of [-1, 1]) {
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(s * halfW, 0, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s < 0 ? 0 : Math.PI),
        new THREE.Vector3(1, 1, 1)
      );
      pilMatrices.push(m);
      for (const dz of [-0.12, 0.12]) sconcePositions.push(new THREE.Vector3(s * (halfW - 0.3), 2.46, z + dz * -s));
    }
  }
  root.add(instanceTemplate(pil, pilMatrices));
  const haloTex = radialTexture({ stops: [[0, 'rgba(255,215,160,1)'], [0.2, 'rgba(255,170,90,0.4)'], [1, 'rgba(255,140,60,0)']] });
  for (const p of sconcePositions) {
    const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0xffc07a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    h.position.copy(p);
    h.scale.setScalar(0.55);
    root.add(h);
    // warm wash on the wall behind each sconce
  }
  const washTex = radialTexture({ size: 256, stops: [[0, 'rgba(255,190,120,0.55)'], [0.5, 'rgba(255,150,80,0.12)'], [1, 'rgba(255,120,60,0)']] });
  const washMat = new THREE.MeshBasicMaterial({ map: washTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const wash = new THREE.Group();
  wash.add(new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.2).rotateY(Math.PI / 2).translate(0.155, 2.5, 0), washMat));
  root.add(instanceTemplate(wash, pilMatrices));

  /* ---------- mirror bays framed by velvet drapes (instanced) */
  const bay = new THREE.Group();
  const bayParts = [
    { geo: new THREE.PlaneGeometry(1.5, 2.5).rotateY(Math.PI / 2).translate(0.03, 2.45, 0), mat: mats.mirror },
  ];
  const fr = 0.05;
  for (const [w, h, y, z] of [[fr, fr, 3.72, 0], [fr, fr, 1.18, 0]]) bayParts.push({ geo: new THREE.BoxGeometry(w, h, 1.6).translate(0.05, y, z), mat: mats.gold });
  for (const z of [-0.78, 0.78]) bayParts.push({ geo: new THREE.BoxGeometry(fr, 2.6, fr).translate(0.05, 2.45, z), mat: mats.gold });
  bayParts.push({ geo: new THREE.TorusGeometry(0.25, 0.02, 6, 24, Math.PI).rotateY(Math.PI / 2).translate(0.05, 3.75, 0), mat: mats.gold });
  bayParts.push({ geo: new THREE.CylinderGeometry(0.02, 0.02, 2.6, 8).rotateX(Math.PI / 2).translate(0.2, height - 0.42, 0), mat: mats.gold });
  bay.add(mergeByMaterial(bayParts));
  for (const z of [-1.05, 1.05]) {
    const c = createCurtain(mats, { width: 0.8, height: height - 0.45, folds: 6, depth: 0.05 });
    c.rotation.y = Math.PI / 2;
    c.position.set(0.18, (height - 0.45) / 2, z);
    bay.add(c);
  }
  const bayMatrices = [];
  for (const z of BAYS) {
    for (const s of [-1, 1]) {
      bayMatrices.push(
        new THREE.Matrix4().compose(
          new THREE.Vector3(s * halfW, 0, z),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s < 0 ? 0 : Math.PI),
          new THREE.Vector3(1, 1, 1)
        )
      );
    }
  }
  root.add(instanceTemplate(bay, bayMatrices));

  /* ---------- back wall: grand arched mirror, drapes and rose urns */
  const backParts = [];
  backParts.push({ geo: new THREE.PlaneGeometry(2.6, 2.6).translate(0, 2.4, -depth + 0.03), mat: mats.mirror });
  backParts.push({ geo: new THREE.CircleGeometry(1.3, 40, 0, Math.PI).translate(0, 3.7, -depth + 0.03), mat: mats.mirror });
  const archPath = new THREE.CurvePath();
  archPath.add(new THREE.LineCurve3(new THREE.Vector3(-1.32, 1.1, -depth + 0.06), new THREE.Vector3(-1.32, 3.7, -depth + 0.06)));
  archPath.add(new THREE.CatmullRomCurve3(new THREE.EllipseCurve(0, 3.7, 1.32, 1.32, Math.PI, 0, true).getPoints(40).map((p) => new THREE.Vector3(p.x, p.y, -depth + 0.06))));
  archPath.add(new THREE.LineCurve3(new THREE.Vector3(1.32, 3.7, -depth + 0.06), new THREE.Vector3(1.32, 1.1, -depth + 0.06)));
  backParts.push({ geo: new THREE.TubeGeometry(archPath, 160, 0.05, 8), mat: mats.gold });
  root.add(mergeByMaterial(backParts));
  for (const s of [-1, 1]) {
    const c = createCurtain(mats, { width: 1.5, height: height - 0.2, folds: 10, depth: 0.07 });
    c.position.set(s * 2.1, (height - 0.2) / 2, -depth + 0.25);
    root.add(c);
    const urn = createRoseUrn(mats);
    urn.position.set(s * 3.6, 0, -depth + 0.8);
    urn.scale.setScalar(0.9);
    root.add(urn);
  }

  /* ---------- dining tables for other (absent) guests — instanced */
  const set = new THREE.Group();
  set.add(createTable(mats, { radius: 0.75 }));
  for (const s of [-1, 1]) {
    const chair = createChair(mats);
    chair.position.set(0, 0, s * 0.85);
    chair.rotation.y = s > 0 ? Math.PI : 0;
    set.add(chair);
    const seat = new THREE.Group();
    seat.position.set(0, 0.762, s * 0.42);
    seat.rotation.y = s > 0 ? 0 : Math.PI;
    seat.add(createPlace(mats));
    const glass = createWineGlass(mats, { wine: false });
    glass.position.set(0.17, 0, -0.19);
    seat.add(glass);
    set.add(seat);
  }
  const vase = createVase(mats, { roses: 3, scale: 0.85 });
  vase.position.set(-0.08, 0.762, 0);
  set.add(vase);
  const candle = createTaperCandle(mats, { height: 0.17 });
  candle.position.set(0.12, 0.762, 0.05);
  set.add(candle);
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: radialTexture({ stops: [[0, 'rgba(255,180,100,0.55)'], [1, 'rgba(255,140,60,0)']] }), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  pool.position.set(0.12, 0.764, 0.05);
  set.add(pool);

  const tableSpots = [];
  for (const z of [-5, -10.5, -16, -21.5, -26]) for (const x of [-3.2, 3.2]) tableSpots.push(new THREE.Vector3(x, 0, z));
  const tableMatrices = tableSpots.map((p, i) =>
    new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i % 3) * 0.35 - 0.35), new THREE.Vector3(1, 1, 1))
  );
  const tables = instanceTemplate(set, tableMatrices);
  root.add(tables);
  // live flames for every table candle
  set.updateMatrixWorld(true);
  const tipLocal = candle.localToWorld(candle.userData.tip.clone()).sub(new THREE.Vector3(0, 0.017, 0));
  for (const m of tableMatrices) {
    const f = new Flame({ intensity: 3 });
    f.position.copy(tipLocal).applyMatrix4(m);
    root.add(f);
    flames.push(f);
  }

  /* ---------- chandeliers */
  for (const z of [-6, -13, -20]) {
    const c = createChandelier(mats, { scale: 1 });
    c.position.set(0, height, z);
    root.add(c);
    chandeliers.push(c);
  }
  const heroChand = createChandelier(mats, { scale: 0.72 });
  heroChand.position.set(0, height, HERO.z);
  root.add(heroChand);
  chandeliers.push(heroChand);

  return { root, flames, chandeliers };
}
