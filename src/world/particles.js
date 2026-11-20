import * as THREE from 'three';
import { petalGeometry } from './props.js';
import { sparkleTexture } from './textures.js';

const dummy = new THREE.Object3D();

/**
 * Drifting rose petals rendered as a single InstancedMesh.
 * Petals tumble, sway and respawn above the bounds; `burst()` throws a
 * handful outward for the celebration.
 */
export class PetalField {
  constructor({ count = 300, bounds, material, size = [0.035, 0.06], fall = [0.08, 0.2], floorY = 0.02, floorAt = null, rest = [2, 6], drift = 0, active = 1 }) {
    this.count = count;
    this.floorAt = floorAt; // optional (x, z) => ground height, e.g. steps
    this.rest = rest; // seconds a petal lies on the ground before fading away
    this.drift = drift; // steady breeze along +z
    this.bounds = bounds; // THREE.Box3
    this.floorY = floorY;
    this.fall = fall;
    this.active = active;
    const geo = petalGeometry({ w: 0.8, l: 1, segU: 4, segV: 5, cup: 0.35, curl: 0.25 });
    this.mesh = new THREE.InstancedMesh(geo, material, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.p = Array.from({ length: count }, () => this._spawn({}, true, size));
    this.mesh.count = Math.floor(count * active);
    this.size = size;
  }

  _spawn(o, anywhere, size = this.size) {
    const b = this.bounds;
    o.x = THREE.MathUtils.lerp(b.min.x, b.max.x, Math.random());
    o.z = THREE.MathUtils.lerp(b.min.z, b.max.z, Math.random());
    o.y = anywhere ? THREE.MathUtils.lerp(b.min.y, b.max.y, Math.random()) : b.max.y + Math.random() * 0.3;
    o.vx = (Math.random() - 0.5) * 0.05;
    o.vy = -THREE.MathUtils.lerp(this.fall[0], this.fall[1], Math.random());
    o.vz = (Math.random() - 0.5) * 0.05;
    o.rx = Math.random() * Math.PI * 2;
    o.ry = Math.random() * Math.PI * 2;
    o.rz = Math.random() * Math.PI * 2;
    o.sx = (Math.random() - 0.5) * 2.4;
    o.sy = (Math.random() - 0.5) * 1.6;
    o.sz = (Math.random() - 0.5) * 2.4;
    o.phase = Math.random() * Math.PI * 2;
    o.s = THREE.MathUtils.lerp(size[0], size[1], Math.random());
    o.boost = 0; // extra burst velocity decay
    o.landed = 0;
    return o;
  }

  setActive(a) {
    this.active = a;
    this.mesh.count = Math.max(0, Math.min(this.count, Math.floor(this.count * a)));
  }

  burst(origin, n = 80, power = 1.6, dir = null) {
    const start = Math.floor(Math.random() * this.count);
    for (let k = 0; k < n; k++) {
      const o = this.p[(start + k) % this.count];
      o.x = origin.x;
      o.y = origin.y;
      o.z = origin.z;
      const a = Math.random() * Math.PI * 2;
      const up = 0.6 + Math.random() * 1.2;
      const sp = (0.3 + Math.random()) * power;
      // optional gust direction: scatter around it instead of all round
      o.vx = Math.cos(a) * sp * (dir ? 0.6 : 1) + (dir ? dir.x * sp : 0);
      o.vz = Math.sin(a) * sp * (dir ? 0.6 : 1) + (dir ? dir.z * sp : 0);
      o.vy = up * power;
      o.boost = 1;
      o.landed = 0;
    }
  }

  update(dt, time) {
    const n = this.mesh.count;
    const b = this.bounds;
    for (let i = 0; i < n; i++) {
      const o = this.p[i];
      let fade = 1;
      if (o.landed > 0) {
        o.landed -= dt;
        fade = Math.min(1, o.landed / 0.8);
        if (o.landed <= 0) {
          this._spawn(o, false);
          fade = 1;
        }
      } else {
        if (o.boost > 0) {
          // ballistic burst, slowed by air drag, then settles into normal fall
          o.vy -= 2.2 * dt;
          const drag = Math.exp(-1.8 * dt);
          o.vx *= drag;
          o.vz *= drag;
          o.boost -= dt * 0.5;
          if (o.vy < -this.fall[1]) {
            o.vy = -this.fall[1];
            o.boost = 0;
          }
        }
        const sway = Math.sin(time * 0.9 + o.phase);
        o.x += (o.vx + sway * 0.05) * dt;
        o.y += o.vy * dt;
        o.z += (o.vz + this.drift + Math.cos(time * 0.7 + o.phase) * 0.04) * dt;
        o.rx += o.sx * dt;
        o.ry += o.sy * dt;
        o.rz += o.sz * dt * (0.5 + 0.5 * sway);
        const floor = this.floorAt ? this.floorAt(o.x, o.z) : this.floorY;
        if (o.y < floor) {
          // settle flat on the ground, rest a while, then fade and respawn above
          o.y = floor + 0.004;
          o.rx = -Math.PI / 2;
          o.ry = 0;
          o.landed = this.rest[0] + Math.random() * (this.rest[1] - this.rest[0]);
        }
        if (o.boost <= 0 && (o.x < b.min.x - 1 || o.x > b.max.x + 1 || o.z < b.min.z - 1 || o.z > b.max.z + 1)) this._spawn(o, false);
      }
      dummy.position.set(o.x, o.y, o.z);
      dummy.rotation.set(o.rx, o.ry, o.rz);
      dummy.scale.setScalar(o.s * fade);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/**
 * Golden dust motes: soft additive points that twinkle and drift.
 */
export class Motes {
  constructor({ count = 200, center = new THREE.Vector3(), radius = new THREE.Vector3(1, 1, 1), size = 6, color = 0xffd9a0, opacity = 1 }) {
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 2 * radius.x;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 2 * radius.y;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 2 * radius.z;
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: size * Math.min(window.devicePixelRatio, 2) },
        uOpacity: { value: opacity },
        uColor: { value: new THREE.Color(color).multiplyScalar(2.2) },
        uRise: { value: 0.02 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uSize; uniform float uRise;
        attribute float aSeed;
        varying float vTw;
        void main() {
          vec3 p = position;
          float t = uTime * (0.25 + aSeed * 0.35) + aSeed * 40.0;
          p.x += sin(t) * 0.05;
          p.y += cos(t * 0.8) * 0.04 + mod(uTime * uRise * (0.5 + aSeed), 0.3) - 0.15;
          p.z += sin(t * 1.3) * 0.05;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vTw = 0.4 + 0.6 * pow(0.5 + 0.5 * sin(uTime * (1.5 + aSeed * 3.0) + aSeed * 30.0), 3.0);
          gl_PointSize = uSize * (0.4 + aSeed) * (1.0 / -mv.z);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uOpacity;
        varying float vTw;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          a *= a;
          gl_FragColor = vec4(uColor * vTw, a * uOpacity * vTw);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.baseSize = size;
    this.points = new THREE.Points(geo, this.material);
    this.points.position.copy(center);
    this.points.frustumCulled = false;
    this.points.renderOrder = 12;
  }
  set opacity(v) {
    this.material.uniforms.uOpacity.value = v;
    this.points.visible = v > 0.001;
  }
  get opacity() {
    return this.material.uniforms.uOpacity.value;
  }
  update(time) {
    this.material.uniforms.uTime.value = time;
  }
}

/**
 * Star-shaped glints that pulse over a diamond's facets.
 */
export class Sparkles extends THREE.Group {
  constructor({ count = 7, radius = 0.006, size = 0.02 } = {}) {
    super();
    const tex = sparkleTexture();
    this.items = [];
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: tex,
          color: new THREE.Color(1, 0.95, 0.85).multiplyScalar(3),
          transparent: true,
          depthWrite: false,
          depthTest: false,
          blending: THREE.AdditiveBlending,
        })
      );
      const a = (i / count) * Math.PI * 2;
      s.position.set(Math.cos(a) * radius * (0.4 + Math.random() * 0.6), (Math.random() - 0.3) * radius, Math.sin(a) * radius * 0.6);
      s.userData = { phase: Math.random() * 10, speed: 0.6 + Math.random() * 1.4, size: size * (0.5 + Math.random() * 0.8) };
      s.material.rotation = Math.random() * Math.PI;
      s.renderOrder = 20;
      this.items.push(s);
      this.add(s);
    }
    this.intensity = 0;
  }
  update(time) {
    for (const s of this.items) {
      const { phase, speed, size } = s.userData;
      const k = Math.pow(Math.max(0, Math.sin(time * speed + phase)), 8);
      const v = k * this.intensity;
      s.scale.setScalar(size * (0.2 + v));
      s.material.opacity = v;
      s.material.rotation += 0.002;
      s.visible = v > 0.01;
    }
  }
}
