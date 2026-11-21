import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Sparkles } from './particles.js';

const W = 0.078; // box width/depth
const H = 0.044; // base height
const LH = 0.028; // lid height

/**
 * Burgundy velvet engagement ring box with a solitaire diamond ring.
 *   open  0..1 — lid rotates open on its rear hinge
 *   rise  0..1 — ring lifts out of the cushion
 */
export class RingBox extends THREE.Group {
  constructor(mats) {
    super();
    // ---- base
    const base = new THREE.Mesh(new RoundedBoxGeometry(W, H, W, 5, 0.009), mats.ringVelvet);
    base.position.y = H / 2;
    base.castShadow = base.receiveShadow = true;
    const band = new THREE.Mesh(new THREE.BoxGeometry(W + 0.0006, 0.0025, W + 0.0006), mats.gold);
    band.position.y = H - 0.004;
    // satin inner tray and velvet cushions with the ring slit
    const tray = new THREE.Mesh(new RoundedBoxGeometry(W * 0.86, 0.003, W * 0.86, 2, 0.001), mats.satinCushion);
    tray.position.y = H + 0.0005;
    const cushionGeo = new THREE.CapsuleGeometry(0.0115, W * 0.62, 6, 20).rotateZ(Math.PI / 2);
    const cushionMat = mats.ringVelvet.clone();
    cushionMat.color = new THREE.Color(0x6a1026);
    const c1 = new THREE.Mesh(cushionGeo, cushionMat);
    const c2 = c1.clone();
    c1.position.set(0, H + 0.002, -0.0118);
    c2.position.set(0, H + 0.002, 0.0118);
    c1.scale.y = c2.scale.y = 0.75;
    const clasp = new THREE.Mesh(new RoundedBoxGeometry(0.012, 0.006, 0.003, 2, 0.001), mats.gold);
    clasp.position.set(0, H - 0.002, W / 2 + 0.0008);
    this.add(base, band, tray, c1, c2, clasp);

    // ---- lid (pivot on the rear top edge)
    this.lid = new THREE.Group();
    this.lid.position.set(0, H, -W / 2);
    const lidMesh = new THREE.Mesh(new RoundedBoxGeometry(W, LH, W, 5, 0.009), mats.ringVelvet);
    lidMesh.position.set(0, LH / 2, W / 2);
    lidMesh.castShadow = true;
    const lining = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.86, W * 0.86).rotateX(Math.PI / 2), mats.satinCushion);
    lining.position.set(0, -0.0004, W / 2);
    const lidBand = new THREE.Mesh(new THREE.BoxGeometry(W + 0.0006, 0.0025, W + 0.0006), mats.gold);
    lidBand.position.set(0, 0.004, W / 2);
    this.lid.add(lidMesh, lining, lidBand);
    this.add(this.lid);

    // ---- ring
    this.ring = new THREE.Group();
    const R = 0.0105;
    const band2 = new THREE.Mesh(new THREE.TorusGeometry(R, 0.0017, 20, 96), mats.ringGold);
    band2.scale.z = 1.25; // slightly wider band
    band2.castShadow = true;
    // setting: basket + six prongs
    const head = new THREE.Group();
    head.position.y = R + 0.0014;
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0016, 0.0028, 16, 1, true), mats.ringGold);
    basket.position.y = 0.0014;
    head.add(basket);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const prong = new THREE.Mesh(new THREE.CylinderGeometry(0.00045, 0.0006, 0.0062, 6), mats.ringGold);
      prong.position.set(Math.cos(a) * 0.0034, 0.0042, Math.sin(a) * 0.0034);
      prong.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
      head.add(prong);
    }
    this.diamond = new THREE.Mesh(diamondGeometry(0.0046), diamondMaterial());
    this.diamond.position.y = 0.0058;
    head.add(this.diamond);
    // tiny pavé stones on the shoulders
    const pave = diamondMaterial();
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      const a = Math.PI / 2 + i * 0.16;
      const s = new THREE.Mesh(diamondGeometry(0.0008), pave);
      s.position.set(Math.cos(a) * (R + 0.0017), Math.sin(a) * (R + 0.0017), 0);
      s.rotation.z = a - Math.PI / 2;
      this.ring.add(s);
    }
    this.sparkles = new Sparkles({ count: 5, radius: 0.0045, size: 0.016 });
    this.sparkles.position.y = 0.006;
    head.add(this.sparkles);
    this.ring.add(band2, head);
    this.ringRestY = H + 0.0035;
    this.ringUpY = H + 0.03;
    this.ring.scale.setScalar(1.55);
    this.ring.position.y = this.ringRestY;
    this.add(this.ring);

    this.open = 0;
    this.rise = 0;
  }

  get diamondWorld() {
    return this.diamond.getWorldPosition(new THREE.Vector3());
  }

  update(time) {
    const o = easeInOut(this.open);
    // a slight overshoot settle as the lid reaches its stop
    this.lid.rotation.x = -1.92 * o - Math.sin(o * Math.PI) * 0.06;
    const r = easeInOut(this.rise);
    this.ring.position.y = THREE.MathUtils.lerp(this.ringRestY, this.ringUpY, r) + Math.sin(time * 1.2) * 0.0008 * r;
    this.ring.rotation.y = Math.sin(time * 0.45) * 0.42 * r;
    this.ring.rotation.x = -0.12 * r;
    this.sparkles.update(time);
  }
}

function easeInOut(t) {
  t = Math.min(1, Math.max(0, t));
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Round brilliant cut approximation: faceted lathe, flat shaded. */
export function diamondGeometry(girdle = 0.005) {
  const g = girdle;
  const pts = [
    new THREE.Vector2(0, -0.86 * g),
    new THREE.Vector2(g * 0.98, -0.02 * g),
    new THREE.Vector2(g, 0),
    new THREE.Vector2(g, 0.05 * g),
    new THREE.Vector2(g * 0.78, 0.22 * g),
    new THREE.Vector2(g * 0.56, 0.34 * g),
    new THREE.Vector2(0, 0.34 * g),
  ];
  const geo = new THREE.LatheGeometry(pts, 16).toNonIndexed();
  geo.computeVertexNormals();
  return geo;
}

function diamondMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0,
    transmission: 1,
    thickness: 0.004,
    ior: 2.42,
    dispersion: 1.2,
    specularIntensity: 0.8,
    specularColor: new THREE.Color(1, 1, 1),
    envMapIntensity: 1.8,
    flatShading: true,
    iridescence: 0.12,
    iridescenceIOR: 1.6,
  });
}
