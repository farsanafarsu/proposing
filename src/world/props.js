import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Flame } from './flame.js';
import { radialTexture } from './textures.js';

const V2 = (x, y) => new THREE.Vector2(x, y);

/* ======================================================================
   Geometry utilities
   ====================================================================== */

/** Merge parts that share a material into single meshes (fewer draw calls). */
export function mergeByMaterial(parts, { castShadow = false, receiveShadow = false } = {}) {
  const groups = new Map();
  for (const { geo, mat } of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    for (const key of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv'].includes(key)) g.deleteAttribute(key);
    }
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    if (!groups.has(mat)) groups.set(mat, []);
    groups.get(mat).push(g);
  }
  const root = new THREE.Group();
  for (const [mat, geos] of groups) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    root.add(mesh);
  }
  return root;
}

/** Turn a template group into InstancedMeshes placed at each matrix. */
export function instanceTemplate(template, matrices) {
  const root = new THREE.Group();
  template.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(template.matrixWorld).invert();
  template.traverse((o) => {
    if (!o.isMesh || o.userData.noInstance) return;
    const geo = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const im = new THREE.InstancedMesh(geo, o.material, matrices.length);
    matrices.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = o.castShadow;
    im.receiveShadow = o.receiveShadow;
    im.computeBoundingSphere();
    root.add(im);
  });
  return root;
}

/** A petal-shaped, cupped and curled plane (concave side faces +Z). */
export function petalGeometry({ w = 0.9, l = 1, segU = 6, segV = 8, cup = 0.5, curl = 0.2 } = {}) {
  const geo = new THREE.PlaneGeometry(1, 1, segU, segV);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5;
    const v = p.getY(i) + 0.5;
    const f = Math.pow(Math.sin(Math.PI * (0.12 + 0.62 * v)), 0.7);
    const e = 2 * u - 1;
    const x = e * 0.5 * w * f;
    const y = v * l - e * e * Math.pow(v, 3) * l * 0.22;
    const z = cup * e * e * 0.5 * w * (0.3 + v) - curl * Math.pow(v, 3) * l;
    p.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

/* ======================================================================
   Roses
   ====================================================================== */
let roseCache;
function roseGeometries() {
  if (roseCache) return roseCache;
  // seeded jitter so every petal is a little different, but the rose is the same on every load
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
  const petals = [];
  const N = 30;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const size = THREE.MathUtils.lerp(0.32, 1.02, Math.pow(t, 0.7)) * (1 + rand() * 0.14);
    const open = THREE.MathUtils.lerp(0.03, 1.22, Math.pow(t, 1.45)) + rand() * 0.12 * t;
    const g = petalGeometry({
      w: (0.92 + rand() * 0.12) * size,
      l: size,
      segU: 6,
      segV: 7,
      cup: THREE.MathUtils.lerp(0.98, 0.3, t),
      // outer petals roll their edges back the way real ones do
      curl: THREE.MathUtils.lerp(0.0, 0.78, Math.pow(t, 1.3)) + rand() * 0.1 * t,
    });
    g.rotateZ(rand() * 0.22 * t); // a slight asymmetric lean
    g.rotateX(-open);
    g.translate(0, THREE.MathUtils.lerp(0.06, -0.08, t), -THREE.MathUtils.lerp(0.03, 0.16, t));
    g.rotateY(i * golden + rand() * 0.35);
    // shade the heart of the bloom: inner petals and petal bases sit in shadow
    const uv = g.attributes.uv;
    const col = new Float32Array(uv.count * 3);
    for (let k = 0; k < uv.count; k++) {
      const v = uv.getY(k);
      const d = THREE.MathUtils.lerp(0.42, 1.0, Math.pow(t, 0.8)) * THREE.MathUtils.lerp(0.55, 1.0, Math.pow(v, 0.6));
      col[k * 3] = d;
      col[k * 3 + 1] = d * 0.92;
      col[k * 3 + 2] = d * 0.94;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    petals.push(g);
  }
  const head = mergeGeometries(petals);
  head.translate(0, -0.25, 0);

  const sepals = [];
  for (let i = 0; i < 5; i++) {
    const g = petalGeometry({ w: 0.2, l: 0.6, segU: 2, segV: 5, cup: 0.2, curl: -0.4 });
    g.rotateX(Math.PI - 0.6);
    g.translate(0, -0.22, -0.05);
    g.rotateY((i / 5) * Math.PI * 2 + 0.3);
    sepals.push(g);
  }
  const sepal = mergeGeometries(sepals);
  // serrated leaf with a crease down the midrib
  const leaf = petalGeometry({ w: 0.55, l: 1, segU: 4, segV: 14, cup: 0.25, curl: 0.15 });
  {
    const p = leaf.attributes.position;
    const cols = 5;
    for (let k = 0; k < p.count; k++) {
      const c = k % cols;
      const row = Math.floor(k / cols) / 14;
      if (c === 0 || c === cols - 1) p.setX(k, p.getX(k) * (1 + ((row * 11) % 1) * 0.16));
      if (c === 2) p.setZ(k, p.getZ(k) - 0.03);
    }
    leaf.computeVertexNormals();
  }
  roseCache = { head, sepal, leaf };
  return roseCache;
}

const thornGeo = new THREE.ConeGeometry(0.0016, 0.007, 5).translate(0, 0.0035, 0);

/**
 * A single long-stemmed rose. Head sits at the origin; the stem hangs down
 * `stemLength` with a gentle lean.
 */
export function createRose(mats, { scale = 0.055, stemLength = 0.3, lean = new THREE.Vector3(0.02, 0, 0.01), leaves = 2 } = {}) {
  const { head, sepal, leaf } = roseGeometries();
  const g = new THREE.Group();
  const h = new THREE.Mesh(head, mats.rose);
  h.scale.setScalar(scale);
  h.castShadow = true;
  const s = new THREE.Mesh(sepal, mats.leaf);
  s.scale.setScalar(scale);
  g.add(h, s);
  if (stemLength > 0) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -scale * 0.3, 0),
      new THREE.Vector3(lean.x * 0.4, -stemLength * 0.5, lean.z * 0.4),
      new THREE.Vector3(lean.x, -stemLength, lean.z),
    ]);
    const stem = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.0035, 6), mats.stem);
    g.add(stem);
    // a few small thorns
    for (let i = 0; i < 3; i++) {
      const thorn = new THREE.Mesh(thornGeo, mats.thorn);
      thorn.position.copy(curve.getPoint(0.22 + i * 0.24));
      thorn.rotation.set(0, i * 2.2, Math.PI / 2 - 0.5);
      g.add(thorn);
    }
    for (let i = 0; i < leaves; i++) {
      const lf = new THREE.Mesh(leaf, mats.leaf);
      const t = 0.3 + i * 0.25;
      lf.position.copy(curve.getPoint(t));
      lf.scale.setScalar(scale * 0.7);
      lf.rotation.set(-0.9, i * 2.4 + 0.5, 0.3);
      g.add(lf);
    }
  }
  return g;
}

/* ======================================================================
   Candles
   ====================================================================== */
export function createTaperCandle(mats, { height = 0.2, flame = {} } = {}) {
  const g = new THREE.Group();
  const stick = new THREE.LatheGeometry(
    [V2(0, 0), V2(0.05, 0), V2(0.052, 0.006), V2(0.03, 0.016), V2(0.012, 0.03), V2(0.01, 0.06), V2(0.018, 0.07), V2(0.009, 0.082), V2(0.008, 0.12), V2(0.016, 0.13), V2(0.022, 0.142), V2(0.012, 0.15), V2(0, 0.15)],
    32
  );
  const holder = new THREE.Mesh(stick, mats.gold);
  holder.castShadow = true;
  const wax = new THREE.CylinderGeometry(0.0105, 0.012, height, 24, 4);
  wax.translate(0, 0.15 + height / 2, 0);
  // a few wax drips near the top
  const pos = wax.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > 0.15 + height * 0.7) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      const drip = Math.max(0, Math.sin(a * 5 + 1)) * 0.0015;
      pos.setX(i, pos.getX(i) * (1 + drip * 40));
      pos.setZ(i, pos.getZ(i) * (1 + drip * 40));
    }
  }
  wax.computeVertexNormals();
  const candle = new THREE.Mesh(wax, mats.wax);
  candle.castShadow = true;
  const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.0008, 0.0008, 0.01, 4), mats.wick);
  wick.position.y = 0.15 + height + 0.004;
  const f = new Flame(flame);
  f.position.y = 0.15 + height + 0.003;
  g.add(holder, candle, wick, f);
  g.userData.flame = f;
  g.userData.tip = new THREE.Vector3(0, 0.15 + height + 0.02, 0);
  return g;
}

export function createVotive(mats, { flame = {} } = {}) {
  const g = new THREE.Group();
  const cup = new THREE.Mesh(
    new THREE.LatheGeometry([V2(0, 0), V2(0.03, 0), V2(0.032, 0.01), V2(0.033, 0.06), V2(0.03, 0.062)], 24),
    mats.vaseGlass
  );
  const light = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.018, 20), mats.wax);
  light.position.y = 0.012;
  const f = new Flame({ width: 0.009, height: 0.024, halo: 0.11, haloOpacity: 0.4, ...flame });
  f.position.y = 0.022;
  g.add(cup, light, f);
  g.userData.flame = f;
  return g;
}

/** A small tea light in a gold cup; starts unlit (flame.lit = 0). */
export function createTealight(mats, { lit = 0 } = {}) {
  const g = new THREE.Group();
  const cup = new THREE.Mesh(
    new THREE.LatheGeometry([V2(0, 0), V2(0.019, 0), V2(0.0195, 0.001), V2(0.0195, 0.014), V2(0.0185, 0.0145), V2(0.0185, 0.002), V2(0, 0.002)], 28),
    mats.goldSatin
  );
  cup.castShadow = true;
  // a slightly melted, concave pool of wax
  const wax = new THREE.Mesh(new THREE.LatheGeometry([V2(0, 0.0105), V2(0.012, 0.0112), V2(0.0184, 0.0128), V2(0.0184, 0.002), V2(0, 0.002)], 28), mats.wax);
  const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.0006, 0.0007, 0.006, 5), mats.wick);
  wick.position.y = 0.0135;
  wick.rotation.z = 0.12;
  const f = new Flame({ width: 0.0085, height: 0.024, intensity: 3.0, halo: 0.085, haloOpacity: 0.32 });
  f.position.y = 0.0155;
  f.lit = lit;
  g.add(cup, wax, wick, f);
  g.userData.flame = f;
  return g;
}

/* ======================================================================
   Glassware & table setting
   ====================================================================== */
const wineProfile = [V2(0, 0.106), V2(0.018, 0.111), V2(0.032, 0.126), V2(0.0405, 0.15), V2(0.0415, 0.165), V2(0, 0.165)];

export function wineRadiusAt(y) {
  for (let i = 0; i < wineProfile.length - 2; i++) {
    const a = wineProfile[i];
    const b = wineProfile[i + 1];
    if (y >= a.y && y <= b.y) return THREE.MathUtils.lerp(a.x, b.x, (y - a.y) / (b.y - a.y));
  }
  return 0.0415;
}

export function createWineGlass(mats, { wine = true } = {}) {
  const g = new THREE.Group();
  const profile = [
    V2(0.0, 0.0), V2(0.036, 0.0), V2(0.038, 0.002), V2(0.012, 0.006), V2(0.004, 0.014),
    V2(0.0035, 0.09), V2(0.006, 0.1), V2(0.02, 0.108), V2(0.035, 0.124), V2(0.043, 0.15),
    V2(0.044, 0.172), V2(0.04, 0.2), V2(0.036, 0.226), V2(0.0345, 0.226), V2(0.0385, 0.2),
    V2(0.0425, 0.172), V2(0.0415, 0.15), V2(0.0335, 0.126), V2(0.019, 0.11), V2(0.0, 0.105),
  ];
  const glass = new THREE.Mesh(new THREE.LatheGeometry(profile, 48), mats.glass);
  glass.castShadow = true;
  glass.renderOrder = 2;
  g.add(glass);
  if (wine) {
    const wmat = mats.wine.clone();
    const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    wmat.clippingPlanes = [plane];
    const body = new THREE.Mesh(new THREE.LatheGeometry(wineProfile, 40), wmat);
    body.material.side = THREE.DoubleSide;
    const surface = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), wmat.clone());
    surface.material.clippingPlanes = [];
    g.add(body, surface);
    g.userData.wine = { body, surface, plane, level: 0.14 };
  }
  return g;
}

/** Update wine fill height (local Y in glass space). */
export function setWineLevel(glass, level) {
  const w = glass.userData.wine;
  if (!w) return;
  w.level = level;
  const empty = level <= 0.1065;
  w.body.visible = w.surface.visible = !empty;
  const wp = new THREE.Vector3(0, level, 0);
  glass.localToWorld(wp);
  w.plane.constant = wp.y;
  w.surface.position.y = level;
  w.surface.scale.setScalar(Math.max(0.0001, wineRadiusAt(level) * 0.985));
}

export function createPlace(mats) {
  const parts = [];
  // gold charger
  parts.push({ geo: new THREE.CylinderGeometry(0.165, 0.165, 0.004, 48).translate(0, 0.002, 0), mat: mats.goldSatin });
  // porcelain dinner plate
  parts.push({
    geo: new THREE.LatheGeometry([V2(0, 0.004), V2(0.09, 0.004), V2(0.11, 0.008), V2(0.13, 0.016), V2(0.14, 0.02), V2(0.139, 0.022), V2(0.128, 0.019), V2(0.108, 0.011), V2(0.088, 0.0075), V2(0, 0.0075)], 48),
    mat: mats.porcelain,
  });
  parts.push({ geo: new THREE.TorusGeometry(0.1335, 0.0012, 6, 64).rotateX(Math.PI / 2).translate(0, 0.0195, 0), mat: mats.gold });
  // folded napkin on the plate
  parts.push({ geo: new RoundedBoxGeometry(0.1, 0.012, 0.16, 2, 0.005).translate(0, 0.014, 0), mat: mats.burgundyCloth });
  // cutlery (gold) — fork left, knife & spoon right
  const fork = [];
  fork.push(new RoundedBoxGeometry(0.012, 0.003, 0.12, 2, 0.0012).translate(0, 0, 0.03));
  fork.push(new RoundedBoxGeometry(0.02, 0.003, 0.03, 2, 0.0012).translate(0, 0, -0.04));
  for (let i = 0; i < 4; i++) fork.push(new THREE.BoxGeometry(0.0025, 0.0025, 0.035).translate(-0.0075 + i * 0.005, 0, -0.07));
  for (const f of fork) parts.push({ geo: f.translate(-0.19, 0.003, 0), mat: mats.gold });
  parts.push({ geo: new RoundedBoxGeometry(0.012, 0.003, 0.11, 2, 0.0012).translate(0.19, 0.003, 0.035), mat: mats.gold });
  parts.push({ geo: new RoundedBoxGeometry(0.016, 0.0025, 0.1, 2, 0.001).translate(0.19, 0.003, -0.06), mat: mats.gold });
  parts.push({ geo: new RoundedBoxGeometry(0.011, 0.003, 0.12, 2, 0.0012).translate(0.215, 0.003, 0.03), mat: mats.gold });
  parts.push({ geo: new THREE.SphereGeometry(0.018, 16, 8).scale(1, 0.25, 1.35).translate(0.215, 0.004, -0.055), mat: mats.gold });
  const m = mergeByMaterial(parts, { castShadow: true, receiveShadow: true });
  return m;
}

export function createVase(mats, { roses = 5, scale = 1 } = {}) {
  const g = new THREE.Group();
  const vase = new THREE.Mesh(
    new THREE.LatheGeometry([V2(0, 0), V2(0.04, 0), V2(0.05, 0.03), V2(0.055, 0.07), V2(0.042, 0.13), V2(0.03, 0.17), V2(0.034, 0.2), V2(0.037, 0.205)], 40),
    mats.vaseGlass
  );
  vase.renderOrder = 2;
  const water = new THREE.Mesh(
    new THREE.LatheGeometry([V2(0, 0.004), V2(0.038, 0.004), V2(0.047, 0.03), V2(0.052, 0.07), V2(0.044, 0.12), V2(0, 0.12)], 32),
    mats.water
  );
  g.add(water, vase);
  const heads = [];
  for (let i = 0; i < roses; i++) {
    const a = (i / roses) * Math.PI * 2 + 0.3;
    const r = i === 0 ? 0 : 0.045;
    const lean = new THREE.Vector3(-Math.cos(a) * r * 0.4, 0, -Math.sin(a) * r * 0.4);
    const rose = createRose(mats, { scale: 0.05 + (i % 2) * 0.006, stemLength: 0.3, lean });
    const hy = i === 0 ? 0.33 : 0.29 + (i % 3) * 0.015;
    rose.position.set(Math.cos(a) * r, hy, Math.sin(a) * r);
    rose.rotation.set(Math.sin(a) * 0.35 * (r > 0), a, -Math.cos(a) * 0.35 * (r > 0));
    heads.push(rose);
    g.add(rose);
  }
  g.scale.setScalar(scale);
  g.userData.roses = heads;
  return g;
}

/* ======================================================================
   Furniture
   ====================================================================== */
export function createChair(mats) {
  const parts = [];
  parts.push({ geo: new RoundedBoxGeometry(0.48, 0.09, 0.46, 3, 0.035).translate(0, 0.47, 0), mat: mats.velvet });
  const back = new RoundedBoxGeometry(0.46, 0.56, 0.07, 3, 0.03);
  back.rotateX(-0.12);
  back.translate(0, 0.82, -0.215);
  parts.push({ geo: back, mat: mats.velvet });
  // gold piping & legs
  const pipe = new THREE.CylinderGeometry(0.007, 0.007, 0.47, 8).rotateZ(Math.PI / 2);
  pipe.rotateX(-0.12);
  pipe.translate(0, 1.1, -0.25);
  parts.push({ geo: pipe, mat: mats.gold });
  for (const [x, z] of [[-0.2, -0.19], [0.2, -0.19], [-0.2, 0.19], [0.2, 0.19]]) {
    const leg = new THREE.CylinderGeometry(0.014, 0.009, 0.43, 10).translate(x, 0.215, z);
    parts.push({ geo: leg, mat: mats.gold });
  }
  for (const x of [-0.21, 0.21]) {
    const post = new THREE.CylinderGeometry(0.01, 0.01, 0.6, 8);
    post.rotateX(-0.12);
    post.translate(x, 0.8, -0.215);
    parts.push({ geo: post, mat: mats.gold });
  }
  return mergeByMaterial(parts, { castShadow: true, receiveShadow: true });
}

export function createTable(mats, { radius = 0.9, height = 0.76, cloth = 'linen', runner = false } = {}) {
  const parts = [];
  const top = new THREE.CircleGeometry(radius, 96).rotateX(-Math.PI / 2).translate(0, height, 0);
  const skirt = new THREE.CylinderGeometry(radius, radius + 0.07, height - 0.03, 128, 10, true);
  skirt.translate(0, height - (height - 0.03) / 2, 0);
  const p = skirt.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const y = p.getY(i);
    const k = Math.pow((height - y) / (height - 0.03), 1.3);
    const a = Math.atan2(z, x);
    const r = Math.hypot(x, z) + Math.sin(a * 18) * 0.02 * k + Math.sin(a * 7 + 1) * 0.008 * k;
    p.setXYZ(i, Math.cos(a) * r, y, Math.sin(a) * r);
  }
  skirt.computeVertexNormals();
  const edge = new THREE.TorusGeometry(radius, 0.008, 6, 96).rotateX(Math.PI / 2).translate(0, height - 0.006, 0);
  const clothMat = cloth === 'linen' ? mats.linen : mats.burgundyCloth;
  parts.push({ geo: top, mat: clothMat }, { geo: skirt, mat: clothMat }, { geo: edge, mat: clothMat });
  if (runner) {
    parts.push({ geo: new THREE.BoxGeometry(radius * 2.08, 0.003, 0.34).translate(0, height + 0.0015, 0), mat: mats.burgundyCloth });
    // gold edge stitching
    for (const z of [-0.165, 0.165]) parts.push({ geo: new THREE.BoxGeometry(radius * 2.08, 0.004, 0.006).translate(0, height + 0.002, z), mat: mats.goldSatin });
  }
  const m = mergeByMaterial(parts, { receiveShadow: true });
  m.children.forEach((c) => (c.castShadow = true));
  return m;
}

/* ======================================================================
   Lighting fixtures
   ====================================================================== */
let haloTex;
function halo(size, opacity = 0.5, color = 0xffc685) {
  haloTex ||= radialTexture({
    stops: [
      [0, 'rgba(255,220,170,1)'],
      [0.2, 'rgba(255,180,100,0.4)'],
      [1, 'rgba(255,140,60,0)'],
    ],
  });
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: haloTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  s.scale.setScalar(size);
  return s;
}

/** Crystal & gold chandelier; origin at the ceiling mount. */
export function createChandelier(mats, { scale = 1 } = {}) {
  const gold = [];
  const crystal = [];
  const bulbs = [];
  const halos = new THREE.Group();

  gold.push(new THREE.CylinderGeometry(0.14, 0.18, 0.05, 24).translate(0, -0.025, 0)); // canopy
  gold.push(new THREE.CylinderGeometry(0.008, 0.008, 0.7, 6).translate(0, -0.4, 0)); // rod
  gold.push(
    new THREE.LatheGeometry([V2(0, -0.72), V2(0.05, -0.75), V2(0.035, -0.82), V2(0.09, -0.92), V2(0.11, -0.98), V2(0.05, -1.04), V2(0.02, -1.15), V2(0.035, -1.2), V2(0, -1.24)], 24)
  );
  gold.push(new THREE.TorusGeometry(0.55, 0.012, 8, 64).rotateX(Math.PI / 2).translate(0, -1.0, 0));

  const tiers = [
    { n: 8, r: 0.55, y: -1.0, rise: 0.12 },
    { n: 6, r: 0.32, y: -0.82, rise: 0.1 },
  ];
  for (const t of tiers) {
    for (let i = 0; i < t.n; i++) {
      const a = (i / t.n) * Math.PI * 2 + (t.r < 0.4 ? 0.3 : 0);
      const c = Math.cos(a);
      const s = Math.sin(a);
      const curve = new THREE.CubicBezierCurve3(
        new THREE.Vector3(0, t.y + 0.02, 0),
        new THREE.Vector3(c * t.r * 0.5, t.y - 0.12, s * t.r * 0.5),
        new THREE.Vector3(c * t.r, t.y - 0.1, s * t.r),
        new THREE.Vector3(c * t.r, t.y + t.rise * 0.5, s * t.r)
      );
      gold.push(new THREE.TubeGeometry(curve, 16, 0.009, 6));
      const cup = new THREE.CylinderGeometry(0.03, 0.018, 0.03, 12).translate(c * t.r, t.y + t.rise * 0.5 + 0.015, s * t.r);
      gold.push(cup);
      gold.push(new THREE.CylinderGeometry(0.009, 0.009, 0.06, 10).translate(c * t.r, t.y + t.rise * 0.5 + 0.06, s * t.r));
      const bulb = new THREE.SphereGeometry(0.014, 10, 8).scale(1, 1.6, 1).translate(c * t.r, t.y + t.rise * 0.5 + 0.105, s * t.r);
      bulbs.push(bulb);
      const h = halo(0.32 * scale, 0.45);
      h.position.set(c * t.r, t.y + t.rise * 0.5 + 0.105, s * t.r);
      halos.add(h);
    }
  }
  // crystal drops along the ring
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const len = i % 2 ? 0.05 : 0.09;
    const drop = new THREE.OctahedronGeometry(0.016, 0).scale(0.8, 1.6, 0.8).translate(Math.cos(a) * 0.55, -1.03 - len, Math.sin(a) * 0.55);
    crystal.push(drop);
    gold.push(new THREE.CylinderGeometry(0.0012, 0.0012, len, 3).translate(Math.cos(a) * 0.55, -1.0 - len / 2, Math.sin(a) * 0.55));
  }
  // bead garlands
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    for (let k = 1; k < 6; k++) {
      const t = k / 6;
      const r = 0.55 * (1 - t) + 0.08 * t;
      const y = -1.0 + Math.sin(t * Math.PI) * -0.12 - t * 0.06;
      crystal.push(new THREE.OctahedronGeometry(0.008, 0).translate(Math.cos(a) * r, y, Math.sin(a) * r));
    }
  }
  crystal.push(new THREE.OctahedronGeometry(0.04, 0).scale(1, 1.8, 1).translate(0, -1.32, 0));

  const parts = [
    ...gold.map((geo) => ({ geo, mat: mats.chandGold })),
    ...crystal.map((geo) => ({ geo, mat: mats.crystal })),
    ...bulbs.map((geo) => ({ geo, mat: mats.bulb })),
  ];
  const g = mergeByMaterial(parts);
  g.add(halos);
  g.scale.setScalar(scale);
  g.userData.halos = halos;
  return g;
}

export function createSconce(mats) {
  const parts = [];
  parts.push({ geo: new THREE.CylinderGeometry(0.07, 0.09, 0.03, 24).rotateX(Math.PI / 2).scale(0.8, 1.6, 1), mat: mats.gold });
  for (const x of [-0.12, 0.12]) {
    const curve = new THREE.CubicBezierCurve3(new THREE.Vector3(0, -0.04, 0.02), new THREE.Vector3(x * 0.5, -0.1, 0.12), new THREE.Vector3(x, -0.08, 0.14), new THREE.Vector3(x, 0.0, 0.14));
    parts.push({ geo: new THREE.TubeGeometry(curve, 10, 0.008, 6), mat: mats.gold });
    parts.push({ geo: new THREE.CylinderGeometry(0.026, 0.016, 0.03, 12).translate(x, 0.01, 0.14), mat: mats.gold });
    parts.push({ geo: new THREE.CylinderGeometry(0.008, 0.008, 0.07, 10).translate(x, 0.06, 0.14), mat: mats.wax });
    parts.push({ geo: new THREE.SphereGeometry(0.012, 10, 8).scale(1, 1.7, 1).translate(x, 0.11, 0.14), mat: mats.bulb });
  }
  const g = mergeByMaterial(parts);
  for (const x of [-0.12, 0.12]) {
    const h = halo(0.5, 0.5);
    h.position.set(x, 0.11, 0.14);
    g.add(h);
  }
  return g;
}

/** Heavy velvet drape gathered in soft folds. */
export function createCurtain(mats, { width = 1.4, height = 4, folds = 9, depth = 0.08 } = {}) {
  const geo = new THREE.PlaneGeometry(width, height, folds * 8, 12);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const v = (y + height / 2) / height;
    const z = Math.sin((x / width) * Math.PI * 2 * folds) * depth * (0.6 + 0.4 * (1 - v)) + Math.sin((x / width) * 7.0) * 0.02;
    p.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mats.curtain);
  m.receiveShadow = true;
  return m;
}
