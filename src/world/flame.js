import * as THREE from 'three';
import { radialTexture } from './textures.js';

/**
 * Animated candle flame: a cylindrically-billboarded quad with a procedural
 * teardrop shader, plus a soft additive halo sprite. HDR output so the
 * bloom pass turns it into real candlelight.
 */

const vert = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uWind;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    float t = uTime + uSeed * 17.0;
    float sway = (sin(t * 2.1) * 0.55 + sin(t * 5.3 + 1.7) * 0.3 + sin(t * 11.0) * 0.15) * (0.08 + uWind);
    p.x += sway * uv.y * uv.y;
    p.y *= 1.0 + sin(t * 8.7) * 0.05 + sin(t * 14.3 + 2.0) * 0.035;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const frag = /* glsl */ `
  uniform float uIntensity;
  varying vec2 vUv;
  void main() {
    float y = vUv.y;
    float w = 0.5 * pow(max(sin(3.14159 * pow(y, 0.6)), 0.0), 0.85) * (1.0 - 0.2 * y);
    w = max(w, 0.0005);
    float d = abs(vUv.x - 0.5) / w;
    float shape = 1.0 - smoothstep(0.45, 1.0, d);
    shape *= smoothstep(0.0, 0.06, y) * (1.0 - smoothstep(0.82, 1.0, y));
    float core = (1.0 - smoothstep(0.0, 0.55, d)) * (1.0 - smoothstep(0.15, 0.62, y));

    vec3 outer = vec3(1.0, 0.36, 0.08);
    vec3 mid = vec3(1.0, 0.7, 0.32);
    vec3 inner = vec3(1.0, 0.96, 0.84);
    vec3 col = mix(outer, mid, smoothstep(0.0, 0.8, 1.0 - d));
    col = mix(col, inner, core);
    float base = (1.0 - smoothstep(0.0, 0.16, y)) * (1.0 - smoothstep(0.2, 0.9, d));
    col = mix(col, vec3(0.25, 0.35, 1.0), base * 0.6);

    gl_FragColor = vec4(col * uIntensity, shape);
  }
`;

const flameGeo = new THREE.PlaneGeometry(1, 1, 1, 8).translate(0, 0.5, 0);
let haloTex;

export class Flame extends THREE.Group {
  constructor({ width = 0.014, height = 0.042, intensity = 3.2, halo = 0.16, haloOpacity = 0.55 } = {}) {
    super();
    haloTex ||= radialTexture({
      size: 128,
      stops: [
        [0, 'rgba(255,214,150,1)'],
        [0.25, 'rgba(255,170,80,0.35)'],
        [1, 'rgba(255,120,40,0)'],
      ],
    });
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSeed: { value: Math.random() * 10 },
        uIntensity: { value: intensity },
        uWind: { value: 0 },
      },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.flame = new THREE.Mesh(flameGeo, this.material);
    this.flame.scale.set(width, height, 1);
    this.flame.renderOrder = 10;
    this.flame.userData.noInstance = true;
    this.add(this.flame);

    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: haloTex,
        color: 0xffc07a,
        transparent: true,
        opacity: haloOpacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.halo.scale.setScalar(halo);
    this.halo.position.y = height * 0.45;
    this.halo.renderOrder = 9;
    this.add(this.halo);

    this.baseIntensity = intensity;
    this.baseHalo = haloOpacity;
    this.haloSize = halo;
    this.brightness = 1;
    this.lit = 1; // 0 = unlit, 1 = burning; above 1 it flares briefly while catching
    this.size = new THREE.Vector2(width, height);
    this._wp = new THREE.Vector3();
  }

  update(time, camera) {
    const u = this.material.uniforms;
    u.uTime.value = time;
    const flicker = 0.9 + Math.sin(time * 9 + u.uSeed.value) * 0.05 + Math.sin(time * 23.0 + u.uSeed.value * 3) * 0.05;
    const lit = Math.max(0, this.lit);
    this.visible = lit > 0.01;
    if (!this.visible) return;
    this.flame.scale.set(this.size.x * (0.45 + 0.55 * Math.min(lit, 1.3)), this.size.y * lit, 1);
    u.uIntensity.value = this.baseIntensity * flicker * this.brightness * Math.min(lit, 1);
    // a glow right next to the lens would wash out the frame: fade it as the camera comes close
    this.getWorldPosition(this._wp);
    const near = THREE.MathUtils.smoothstep(this._wp.distanceTo(camera.position), 0.12, 0.5);
    this.halo.material.opacity = this.baseHalo * flicker * this.brightness * Math.min(lit, 1.2) * near;
    this.halo.scale.setScalar(this.haloSize * (0.96 + flicker * 0.06) * (0.6 + 0.4 * lit));
    // cylindrical billboard: rotate around Y towards the camera
    this.flame.rotation.y = Math.atan2(camera.position.x - this._wp.x, camera.position.z - this._wp.z);
  }
}
