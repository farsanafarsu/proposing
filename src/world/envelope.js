import * as THREE from 'three';
import { letterTexture, paperTexture } from './textures.js';

const EW = 0.2; // envelope width
const EH = 0.13; // envelope height
const LW = 0.17; // letter width
const LH = 0.115; // half letter height (folded size)

/**
 * A love letter in a sealed envelope.
 *
 * Driven by four normalised values (0..1) set from the scroll timeline:
 *   lift    — envelope rises from the table and turns to face the camera
 *   flap    — flap opens
 *   slide   — letter slides out of the envelope
 *   present — letter moves forward, centred in view
 *   unfold  — lower half of the letter unfolds
 */
export class Envelope extends THREE.Group {
  constructor(mats) {
    super();
    const [pc] = paperTexture({ w: 512, h: 340, tint: '#eadcc6', seed: 51 });
    const paperMap = new THREE.CanvasTexture(pc);
    paperMap.colorSpace = THREE.SRGBColorSpace;
    const paper = new THREE.MeshStandardMaterial({ map: paperMap, roughness: 0.88, side: THREE.DoubleSide });
    const inner = new THREE.MeshStandardMaterial({ color: 0x5a1222, roughness: 0.7, side: THREE.DoubleSide });

    this.body = new THREE.Group();
    this.add(this.body);

    // back panel (with burgundy liner on the inside)
    const back = new THREE.Mesh(new THREE.PlaneGeometry(EW, EH), paper);
    const liner = new THREE.Mesh(new THREE.PlaneGeometry(EW * 0.94, EH * 0.9), inner);
    liner.position.z = 0.0004;
    // front pocket with a V opening
    const pocketShape = new THREE.Shape();
    pocketShape.moveTo(-EW / 2, -EH / 2);
    pocketShape.lineTo(EW / 2, -EH / 2);
    pocketShape.lineTo(EW / 2, EH / 2);
    pocketShape.lineTo(0, -EH * 0.04);
    pocketShape.lineTo(-EW / 2, EH / 2);
    pocketShape.closePath();
    const pocketGeo = new THREE.ShapeGeometry(pocketShape);
    remapUV(pocketGeo, EW, EH);
    const pocket = new THREE.Mesh(pocketGeo, paper);
    pocket.position.z = 0.004;
    // flap, hinged along the top edge
    const flapShape = new THREE.Shape();
    flapShape.moveTo(-EW / 2, 0);
    flapShape.lineTo(EW / 2, 0);
    flapShape.lineTo(0, -EH * 0.58);
    flapShape.closePath();
    const flapGeo = new THREE.ShapeGeometry(flapShape);
    remapUV(flapGeo, EW, EH);
    this.flap = new THREE.Group();
    this.flap.position.set(0, EH / 2, 0.0048);
    const flapMesh = new THREE.Mesh(flapGeo, paper);
    const seal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0125, 0.013, 0.003, 28).rotateX(Math.PI / 2),
      new THREE.MeshPhysicalMaterial({ color: 0x6d0d22, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.3 })
    );
    seal.position.set(0, -EH * 0.58 + 0.018, 0.0018);
    const sealHeart = new THREE.Mesh(heartGeometry(0.006, 0.0012), mats.gold);
    sealHeart.position.set(0, -EH * 0.58 + 0.018, 0.0034);
    this.flap.add(flapMesh, seal, sealHeart);

    // the letter: two halves hinged at the fold
    const tex = letterTexture();
    const letterMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide, emissive: 0xfff1dc, emissiveMap: tex, emissiveIntensity: 0.0 });
    this.letterMat = letterMat;
    const topGeo = new THREE.PlaneGeometry(LW, LH).translate(0, LH / 2, 0);
    setUVRange(topGeo, 0.5, 1);
    const botGeo = new THREE.PlaneGeometry(LW, LH).translate(0, -LH / 2, 0);
    setUVRange(botGeo, 0, 0.5);
    this.letter = new THREE.Group();
    const top = new THREE.Mesh(topGeo, letterMat);
    this.lower = new THREE.Group();
    const bottom = new THREE.Mesh(botGeo, letterMat);
    bottom.position.z = 0.0008;
    this.lower.add(bottom);
    this.letter.add(top, this.lower);
    this.letterRest = new THREE.Vector3(0, -EH / 2 + 0.007, 0.0018);
    this.letter.position.copy(this.letterRest);

    // everything but the letter, so the envelope can drop away while the letter is read
    this.shell = new THREE.Group();
    this.shell.add(back, liner, pocket, this.flap);
    this.body.add(this.shell, this.letter);
    this.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });

    // state
    this.lift = 0;
    this.flapT = 0;
    this.slide = 0;
    this.present = 0;
    this.unfold = 0;
    this.glow = 0;

    this.tablePos = new THREE.Vector3();
    this.tableQuat = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._fwd = new THREE.Vector3();
    this._up = new THREE.Vector3();
  }

  /** Redraw the letter (e.g. once its script font has finished loading). */
  refreshLetter() {
    const old = this.letterMat.map;
    const tex = letterTexture();
    this.letterMat.map = tex;
    this.letterMat.emissiveMap = tex;
    this.letterMat.needsUpdate = true;
    old?.dispose();
  }

  setTablePose(pos, rotY = 0) {
    this.tablePos.copy(pos);
    this.tableQuat.setFromEuler(new THREE.Euler(-Math.PI / 2, rotY, 0, 'YXZ'));
    this.position.copy(pos);
    this.quaternion.copy(this.tableQuat);
  }

  /** Distance in front of the camera at which the open letter fills the view. */
  presentDistance(camera) {
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const fill = 0.7; // leave room for the cinematic bars at the top and bottom
    const dV = (LH * 2) / (fill * 2 * tanV);
    const dH = LW / (fill * 2 * tanV * camera.aspect);
    return Math.max(dV, dH);
  }

  update(camera) {
    const e = this.lift;
    // where the letter fold should end up relative to the envelope
    const yF = 0.03;
    const zF = 0.05;
    const D = this.presentDistance(camera);
    camera.getWorldDirection(this._fwd);
    this._up.set(0, 1, 0).applyQuaternion(camera.quaternion);

    // presentation pose: in front of camera, offset so the letter is centred
    const pres = this._v
      .copy(camera.position)
      .addScaledVector(this._fwd, D + zF)
      .addScaledVector(this._up, -yF * this.present - 0.01 * (1 - this.present));
    this.position.lerpVectors(this.tablePos, pres, smooth(e));
    this.position.y += Math.sin(Math.PI * e) * 0.06; // graceful arc
    this.quaternion.slerpQuaternions(this.tableQuat, camera.quaternion, smooth(e));

    // the flap folds back past flat and tucks behind the envelope, so it never covers the letter
    const f = smooth(this.flapT);
    this.flap.rotation.x = -Math.PI * 1.04 * f;
    this.flap.position.z = THREE.MathUtils.lerp(0.0048, -0.0012, smooth((f - 0.35) / 0.4));

    const s = smooth(this.slide);
    const p = smooth(this.present);
    const outY = 0.075;
    this.letter.position.set(
      0,
      THREE.MathUtils.lerp(THREE.MathUtils.lerp(this.letterRest.y, outY, s), yF, p),
      THREE.MathUtils.lerp(this.letterRest.z, zF, p)
    );
    this.letter.rotation.x = Math.sin(Math.PI * p) * -0.12;
    // once the letter is out, the envelope sinks away below it
    this.shell.position.set(0, -0.22 * p, -0.03 * p);
    this.shell.visible = p < 0.98;
    this.lower.rotation.x = -Math.PI * (1 - smooth(this.unfold));
    this.letterMat.emissiveIntensity = 0.22 * this.glow;
  }
}

function smooth(t) {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
}

function remapUV(geo, w, h) {
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
}

function setUVRange(geo, v0, v1) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, v0 + uv.getY(i) * (v1 - v0));
}

export function heartGeometry(size = 1, depth = 0.2) {
  const s = new THREE.Shape();
  s.moveTo(0, -size);
  s.bezierCurveTo(-size * 1.6, -size * 0.1, -size * 0.9, size * 1.2, 0, size * 0.45);
  s.bezierCurveTo(size * 0.9, size * 1.2, size * 1.6, -size * 0.1, 0, -size);
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 10 }).translate(0, 0, -depth / 2);
}
