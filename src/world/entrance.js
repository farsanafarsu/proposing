import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeByMaterial, createRose, createSconce } from './props.js';
import { radialTexture } from './textures.js';
import { petalGeometry } from './props.js';

/** Ground height outside the doors: threshold, three steps, then the plaza. */
export function entranceFloorAt(x, z) {
  if (z < 0) return 0;
  if (Math.abs(x) > 2.1 + Math.min(2, Math.floor(z / 0.45)) * 0.3) return -0.45;
  if (z < 0.45) return 0;
  if (z < 0.9) return -0.15;
  if (z < 1.35) return -0.3;
  return -0.45;
}

const DOOR_W = 1.25; // each leaf
const DOOR_H = 3.5;
const ARCH_R = DOOR_W;

/**
 * Scene 1 — the restaurant's grand facade: stone wall with an arched
 * opening, carved wooden double doors, a glowing fanlight, lanterns and
 * overflowing burgundy rose urns. Doors open into the dining room.
 */
export function createEntrance(mats) {
  const root = new THREE.Group();

  /* ---------- facade wall with arched opening (extruded shape + hole) */
  const shape = new THREE.Shape();
  shape.moveTo(-9, -0.5);
  shape.lineTo(9, -0.5);
  shape.lineTo(9, 7.5);
  shape.lineTo(-9, 7.5);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-DOOR_W, 0);
  hole.lineTo(DOOR_W, 0);
  hole.lineTo(DOOR_W, DOOR_H);
  hole.absarc(0, DOOR_H, ARCH_R, 0, Math.PI, false);
  hole.lineTo(-DOOR_W, 0);
  shape.holes.push(hole);
  const wallGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.4, bevelEnabled: false, curveSegments: 32 });
  wallGeo.translate(0, 0, -0.4);
  const wall = new THREE.Mesh(wallGeo, mats.stone);
  wall.receiveShadow = true;
  root.add(wall);

  /* ---------- ornate surround: pilasters, cornice, gold architrave */
  const parts = [];
  for (const s of [-1, 1]) {
    parts.push({ geo: new THREE.BoxGeometry(0.42, 4.9, 0.18).translate(s * 1.75, 2.45, 0.09), mat: mats.wainscot });
    parts.push({ geo: new THREE.BoxGeometry(0.5, 0.12, 0.24).translate(s * 1.75, 4.9, 0.12), mat: mats.goldSatin });
    parts.push({ geo: new THREE.BoxGeometry(0.5, 0.18, 0.24).translate(s * 1.75, 0.09, 0.12), mat: mats.goldSatin });
    for (let k = 0; k < 3; k++) parts.push({ geo: new THREE.BoxGeometry(0.03, 4.4, 0.02).translate(s * 1.75 + (k - 1) * 0.11, 2.5, 0.19), mat: mats.goldSatin });
  }
  parts.push({ geo: new THREE.BoxGeometry(4.6, 0.22, 0.3).translate(0, 5.05, 0.15), mat: mats.wainscot });
  parts.push({ geo: new THREE.BoxGeometry(4.7, 0.05, 0.34).translate(0, 4.93, 0.17), mat: mats.gold });
  parts.push({ geo: new THREE.BoxGeometry(4.7, 0.05, 0.34).translate(0, 5.18, 0.17), mat: mats.gold });
  // architrave tube around the opening
  const frame = new THREE.CurvePath();
  frame.add(new THREE.LineCurve3(new THREE.Vector3(-DOOR_W - 0.04, 0, 0.02), new THREE.Vector3(-DOOR_W - 0.04, DOOR_H, 0.02)));
  const arc = new THREE.EllipseCurve(0, DOOR_H, ARCH_R + 0.04, ARCH_R + 0.04, Math.PI, 0, true);
  const arcPts = arc.getPoints(40).map((p) => new THREE.Vector3(p.x, p.y, 0.02));
  frame.add(new THREE.CatmullRomCurve3(arcPts));
  frame.add(new THREE.LineCurve3(new THREE.Vector3(DOOR_W + 0.04, DOOR_H, 0.02), new THREE.Vector3(DOOR_W + 0.04, 0, 0.02)));
  parts.push({ geo: new THREE.TubeGeometry(frame, 200, 0.045, 8), mat: mats.gold });
  // keystone
  parts.push({ geo: new RoundedBoxGeometry(0.22, 0.36, 0.14, 2, 0.02).translate(0, DOOR_H + ARCH_R + 0.08, 0.06), mat: mats.gold });
  // steps
  for (let i = 0; i < 3; i++) {
    parts.push({ geo: new THREE.BoxGeometry(4.2 + i * 0.6, 0.15, 0.45).translate(0, -0.075 - i * 0.15, 0.225 + i * 0.45), mat: mats.stone });
    parts.push({ geo: new THREE.BoxGeometry(4.2 + i * 0.6, 0.012, 0.02).translate(0, -i * 0.15, 0.45 + i * 0.45), mat: mats.goldSatin });
  }
  const surround = mergeByMaterial(parts, { castShadow: true, receiveShadow: true });
  root.add(surround);

  /* ---------- fanlight: glowing glass with a gold sunburst */
  const fanGlow = new THREE.Mesh(new THREE.CircleGeometry(ARCH_R, 48, 0, Math.PI), mats.doorLight);
  fanGlow.position.set(0, DOOR_H, -0.32);
  root.add(fanGlow);
  const rays = [];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI;
    const g = new THREE.BoxGeometry(ARCH_R, 0.025, 0.025).translate(ARCH_R / 2, 0, 0).rotateZ(a);
    rays.push({ geo: g.translate(0, DOOR_H, -0.25), mat: mats.gold });
  }
  rays.push({ geo: new THREE.BoxGeometry(DOOR_W * 2, 0.06, 0.06).translate(0, DOOR_H, -0.25), mat: mats.gold });
  rays.push({ geo: new THREE.TorusGeometry(0.32, 0.02, 6, 32, Math.PI).translate(0, DOOR_H, -0.25), mat: mats.gold });
  root.add(mergeByMaterial(rays));

  /* ---------- the doors */
  const doorLeft = createDoorLeaf(mats, 1);
  doorLeft.position.set(-DOOR_W, 0, -0.2);
  const doorRight = createDoorLeaf(mats, -1);
  doorRight.position.set(DOOR_W, 0, -0.2);
  root.add(doorLeft, doorRight);

  // warm light leaking through the gaps; faded as the doors open
  const leakMat = mats.doorLight.clone();
  leakMat.transparent = true;
  const leak = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W * 2, DOOR_H), leakMat);
  leak.position.set(0, DOOR_H / 2, -0.38);
  root.add(leak);

  // pool of light on the steps once the doors open
  const poolTex = radialTexture({ size: 256, stops: [[0, 'rgba(255,200,130,1)'], [0.4, 'rgba(255,170,90,0.35)'], [1, 'rgba(255,140,60,0)']] });
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(4.5, 7).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffb070 })
  );
  pool.position.set(0, -0.43, 3.6);
  root.add(pool);
  // soft volumetric shaft
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 1.2, 5, 32, 1, true).rotateX(Math.PI / 2).translate(0, 1.6, 2.2),
    new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 } },
      vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV;
        void main(){ vP = position; vec4 mv = modelViewMatrix*vec4(position,1.); vV = normalize(-mv.xyz); vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform float uOpacity; varying vec3 vP; varying vec3 vN; varying vec3 vV;
        void main(){ float along = clamp((vP.z - (-0.3)) / 5.0, 0., 1.); float rim = pow(abs(dot(vN, vV)), 1.5);
          float a = (1. - along) * rim * uOpacity * 0.22; gl_FragColor = vec4(vec3(1.0,0.72,0.42)*a*2.0, a); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
  );
  root.add(shaft);

  /* ---------- lanterns */
  const lanterns = [];
  for (const s of [-1, 1]) {
    const sc = createSconce(mats);
    sc.position.set(s * 2.45, 2.7, 0.02);
    sc.scale.setScalar(1.4);
    // softer haloes outside: real lanterns glow, they don't flare
    sc.traverse((o) => {
      if (o.isSprite) {
        o.material = o.material.clone();
        o.material.opacity = 0.2;
        o.scale.multiplyScalar(0.6);
      }
    });
    root.add(sc);
    lanterns.push(sc);
  }

  /* ---------- urns overflowing with roses */
  for (const s of [-1, 1]) {
    const urn = createRoseUrn(mats);
    urn.position.set(s * 2.75, -0.45, 1.2);
    root.add(urn);
  }
  // small rose garlands along the cornice
  for (let i = 0; i < 14; i++) {
    const r = createRose(mats, { scale: 0.09, stemLength: 0 });
    const x = -2.2 + (i / 13) * 4.4;
    r.position.set(x, 5.32 + Math.sin(i * 1.7) * 0.04, 0.24);
    r.rotation.set(-0.6 + Math.sin(i) * 0.3, i * 1.3, Math.cos(i) * 0.4);
    root.add(r);
  }

  /* ---------- plaza & red carpet */
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(26, 16).rotateX(-Math.PI / 2), mats.floor);
  plaza.position.set(0, -0.45, 9.3);
  plaza.receiveShadow = true;
  root.add(plaza);
  const runner = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.01, 12), mats.carpet);
  runner.position.set(0, -0.44, 7.3);
  runner.receiveShadow = true;
  root.add(runner);

  /* ---------- petals already fallen on the steps, the carpet and the aisle inside */
  root.add(fallenPetals(mats));

  return {
    root,
    doors: [doorLeft, doorRight],
    leak,
    pool,
    shaft,
    fanGlow,
    lanterns,
  };
}

/** One carved door leaf. `dir`=1 extends +x from hinge (left), -1 for right. */
function createDoorLeaf(mats, dir) {
  const g = new THREE.Group();
  const parts = [];
  const cx = (DOOR_W / 2) * dir;
  parts.push({ geo: new THREE.BoxGeometry(DOOR_W - 0.01, DOOR_H, 0.09).translate(cx, DOOR_H / 2, 0), mat: mats.door });
  // raised panels on both faces with gold inlay frames
  const panels = [
    { w: 0.86, h: 1.9, y: 2.35 },
    { w: 0.86, h: 1.0, y: 0.78 },
  ];
  for (const face of [1, -1]) {
    for (const p of panels) {
      parts.push({ geo: new RoundedBoxGeometry(p.w, p.h, 0.04, 2, 0.012).translate(cx, p.y, face * 0.05), mat: mats.door });
      const t = 0.014;
      const z = face * 0.07;
      parts.push({ geo: new THREE.BoxGeometry(p.w + 0.06, t, t).translate(cx, p.y + p.h / 2 + 0.03, z), mat: mats.gold });
      parts.push({ geo: new THREE.BoxGeometry(p.w + 0.06, t, t).translate(cx, p.y - p.h / 2 - 0.03, z), mat: mats.gold });
      parts.push({ geo: new THREE.BoxGeometry(t, p.h + 0.06, t).translate(cx - p.w / 2 - 0.03, p.y, z), mat: mats.gold });
      parts.push({ geo: new THREE.BoxGeometry(t, p.h + 0.06, t).translate(cx + p.w / 2 + 0.03, p.y, z), mat: mats.gold });
      // carved medallion
      parts.push({ geo: new THREE.TorusGeometry(0.16, 0.012, 8, 40).translate(cx, 2.35, face * 0.075), mat: mats.gold });
      parts.push({ geo: new THREE.SphereGeometry(0.04, 16, 12).scale(1, 1, 0.4).translate(cx, 2.35, face * 0.075), mat: mats.gold });
    }
    // long pull handle near the meeting edge
    const hx = (DOOR_W - 0.13) * dir;
    parts.push({ geo: new THREE.CylinderGeometry(0.016, 0.016, 0.75, 12).translate(hx, 1.45, face * 0.14), mat: mats.gold });
    for (const y of [1.12, 1.78]) parts.push({ geo: new THREE.CylinderGeometry(0.01, 0.01, 0.1, 8).rotateX(Math.PI / 2).translate(hx, y, face * 0.09), mat: mats.gold });
    for (const y of [1.08, 1.82]) parts.push({ geo: new THREE.SphereGeometry(0.022, 12, 10).translate(hx, y, face * 0.14), mat: mats.gold });
  }
  // hinges
  for (const y of [0.4, 1.75, 3.1]) parts.push({ geo: new THREE.CylinderGeometry(0.025, 0.025, 0.16, 10).translate(0, y, 0), mat: mats.gold });
  const m = mergeByMaterial(parts, { castShadow: true, receiveShadow: true });
  g.add(m);
  g.userData.dir = dir;
  return g;
}

function fallenPetals(mats) {
  const n = 260;
  const geo = petalGeometry({ w: 0.8, l: 1, segU: 3, segV: 4, cup: 0.25, curl: 0.15 });
  const mesh = new THREE.InstancedMesh(geo, mats.petal, n);
  const d = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    // denser along the red carpet, thinning out to the sides
    const spread = Math.random() < 0.7 ? 1.1 : 3.6;
    const x = (Math.random() - 0.5) * 2 * spread * Math.random();
    const z = i < 200 ? 0.05 + Math.pow(Math.random(), 1.4) * 8 : -0.4 - Math.random() * 5;
    d.position.set(x, (z < 0 ? 0.012 : entranceFloorAt(x, z) + 0.006) + Math.random() * 0.002, z);
    d.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
    d.scale.setScalar(0.04 + Math.random() * 0.035);
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
  }
  mesh.receiveShadow = true;
  return mesh;
}

export function createRoseUrn(mats) {
  const g = new THREE.Group();
  const urn = new THREE.Mesh(
    new THREE.LatheGeometry(
      [[0, 0], [0.32, 0], [0.32, 0.08], [0.18, 0.14], [0.14, 0.35], [0.2, 0.42], [0.38, 0.8], [0.44, 1.05], [0.5, 1.1], [0.48, 1.14], [0, 1.14]].map(([x, y]) => new THREE.Vector2(x, y)),
      40
    ),
    mats.goldSatin
  );
  urn.castShadow = urn.receiveShadow = true;
  g.add(urn);
  // dome of roses
  const n = 34;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 0.9;
    const r = Math.sqrt(1 - y * y);
    const a = i * golden;
    const p = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    const rose = createRose(mats, { scale: 0.1 + (i % 3) * 0.012, stemLength: 0 });
    rose.position.set(p.x * 0.5, 1.12 + p.y * 0.45, p.z * 0.5);
    rose.lookAt(rose.position.clone().add(p));
    rose.rotateX(Math.PI / 2);
    g.add(rose);
  }
  // trailing leaves
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.28), mats.leaf);
    leaf.position.set(Math.cos(a) * 0.5, 1.08, Math.sin(a) * 0.5);
    leaf.rotation.set(0.8, -a + Math.PI / 2, 0);
    g.add(leaf);
  }
  return g;
}
