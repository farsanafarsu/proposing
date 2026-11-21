import * as THREE from 'three';
import { createTable, createChair, createPlace, createVase, createRose, createTaperCandle, createVotive, createWineGlass, setWineLevel, petalGeometry } from './props.js';
import { Envelope } from './envelope.js';
import { RingBox } from './ringBox.js';
import { HERO } from './restaurant.js';

export const TABLE_TOP = 0.762;

/**
 * Scene 3–6 — the one special table: two place settings, wine glasses,
 * candlelight, roses, scattered petals, the love letter and the ring box.
 */
export function createHeroTable(mats) {
  const root = new THREE.Group();
  root.position.copy(HERO);

  root.add(createTable(mats, { radius: 0.9, runner: true }));

  const glasses = [];
  const chairs = [];
  for (const s of [-1, 1]) {
    const chair = createChair(mats);
    chair.position.set(s * 1.0, 0, 0);
    chair.rotation.y = -s * Math.PI / 2;
    root.add(chair);
    chairs.push(chair);

    const seat = new THREE.Group();
    seat.position.set(s * 0.52, TABLE_TOP, 0);
    seat.rotation.y = s * Math.PI / 2;
    seat.add(createPlace(mats));
    const glass = createWineGlass(mats, { wine: true });
    glass.position.set(0.17, 0, -0.18);
    seat.add(glass);
    glasses.push(glass);
    root.add(seat);
  }

  const vase = createVase(mats, { roses: 7, scale: 1.05 });
  vase.position.set(-0.13, TABLE_TOP, -0.26);
  root.add(vase);

  const candle = createTaperCandle(mats, { height: 0.22, flame: { intensity: 3.6, halo: 0.2, haloOpacity: 0.6 } });
  candle.position.set(0.16, TABLE_TOP, -0.2);
  root.add(candle);
  const candle2 = createTaperCandle(mats, { height: 0.16, flame: { intensity: 3.4, halo: 0.18 } });
  candle2.position.set(0.3, TABLE_TOP, -0.34);
  candle2.scale.setScalar(0.92);
  root.add(candle2);

  const votives = [];
  for (const [x, z] of [[-0.22, 0.34], [0.32, 0.3], [-0.3, -0.46]]) {
    const v = createVotive(mats);
    v.position.set(x, TABLE_TOP, z);
    root.add(v);
    votives.push(v);
  }

  /* envelope */
  // lives at scene level: its pose is computed in world space (see Envelope.update)
  const envelope = new Envelope(mats);
  envelope.setTablePose(new THREE.Vector3(0.07, TABLE_TOP + 0.001, 0.46).add(HERO), -0.12);

  /* ring box */
  const ringBox = new RingBox(mats);
  ringBox.position.set(-0.01, TABLE_TOP, 0.14);
  ringBox.rotation.y = 0.0;
  root.add(ringBox);

  /* a single long-stemmed rose laid beside the ring box, bloom turned towards us */
  const rose = createLyingRose(mats);
  root.add(rose);

  /* an arc of glass votives behind the ring box, lit one by one at the proposal */
  const tealights = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(30, 150, i / (n - 1)));
    // small, calm flames: seven halos side by side add up quickly
    const t = createVotive(mats, { lit: 0, scale: 0.78, flame: { intensity: 1.6, halo: 0.06, haloOpacity: 0.1 } });
    t.position.set(-0.01 + Math.cos(a) * 0.2, TABLE_TOP, 0.14 - Math.sin(a) * 0.17);
    t.userData.order = Math.abs(i - (n - 1) / 2); // centre first, then outwards
    root.add(t);
    tealights.push(t);
  }

  /* rose petals scattered over the linen */
  const petals = scatterPetals(mats, 46);
  root.add(petals);

  root.updateMatrixWorld(true);
  for (const g of glasses) setWineLevel(g, 0.108);

  return {
    root,
    glasses,
    chairs, // [left (−x), right (+x)]
    vase,
    candle,
    candle2,
    votives,
    envelope,
    ringBox,
    rose,
    tealights,
    petals,
    flames: [candle.userData.flame, candle2.userData.flame, ...votives.map((v) => v.userData.flame), ...tealights.map((t) => t.userData.flame)],
    candleTip: candle.localToWorld(candle.userData.tip.clone()),
  };
}

/**
 * A rose lying on the linen: the head rests on its side and the stem runs
 * back across the table, dipping just enough to touch the cloth.
 */
function createLyingRose(mats) {
  const L = 0.26;
  const scale = 0.046;
  const inner = createRose(mats, { scale, stemLength: L, lean: new THREE.Vector3(0, 0, 0.014), leaves: 1 });
  const head = inner.children[0];
  head.geometry.computeBoundingSphere();
  const headR = head.geometry.boundingSphere.radius * scale;
  // tilt so the stem end comes down to the cloth while the head lies on its side
  inner.rotation.z = -Math.PI / 2 + Math.asin(Math.min(0.5, (headR * 0.85) / L));
  inner.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true;
  });
  const g = new THREE.Group();
  g.add(inner);
  // stem runs back-right; the bloom faces front-left, towards the camera's approach
  g.rotation.y = -Math.PI + Math.atan2(0.6, 0.8);
  g.position.set(0.13, 0, 0.2);
  // settle it so its lowest point just rests on the table
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g);
  g.position.y = TABLE_TOP + 0.0008 - box.min.y;
  return g;
}

function scatterPetals(mats, n) {
  const geo = petalGeometry({ w: 0.8, l: 1, segU: 4, segV: 5, cup: 0.3, curl: 0.2 });
  const mesh = new THREE.InstancedMesh(geo, mats.petal, n);
  const d = new THREE.Object3D();
  const keepOut = [
    [-0.01, 0.14, 0.09], // ring box
    [0.07, 0.46, 0.13], // envelope
    [-0.01, -0.01, 0.2], // tea light arc
    [0.2, 0.15, 0.11], // lying rose
    [0.3, 0.07, 0.07],
    [-0.13, -0.26, 0.08],
    [0.16, -0.2, 0.06],
  ];
  let i = 0;
  let guard = 0;
  while (i < n && guard++ < 2000) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 0.82;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (keepOut.some(([kx, kz, kr]) => Math.hypot(x - kx, z - kz) < kr)) continue;
    if (Math.abs(x) > 0.36 && Math.abs(x) < 0.7 && Math.abs(z) < 0.2) continue; // plates
    d.position.set(x, TABLE_TOP + 0.003 + Math.random() * 0.002, z);
    d.rotation.set(-Math.PI / 2 + (Math.random() - 0.5) * 0.4, 0, Math.random() * Math.PI * 2, 'YXZ');
    d.rotation.y = Math.random() * Math.PI * 2;
    d.scale.setScalar(0.03 + Math.random() * 0.025);
    d.updateMatrix();
    mesh.setMatrixAt(i++, d.matrix);
  }
  mesh.count = i;
  mesh.receiveShadow = true;
  return mesh;
}
