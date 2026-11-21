import * as THREE from 'three';
import gsap from 'gsap';
import { createMaterials } from './materials.js';
import { setMaxAnisotropy } from './textures.js';
import { createEntrance, entranceFloorAt } from './entrance.js';
import { createRestaurant, HERO, ROOM } from './restaurant.js';
import { createHeroTable, TABLE_TOP } from './heroTable.js';
import { PetalField, Motes } from './particles.js';
import { createComposer } from './post.js';

const lerp = THREE.MathUtils.lerp;
const tick = () => new Promise((r) => requestAnimationFrame(() => r()));

/**
 * The single continuous 3D world: facade → dining room → the table → the
 * ring. Exposes a small set of animatable values (`rig`, `state`) that the
 * GSAP story timeline drives.
 */
export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.isMobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
    this.isTiny = Math.min(innerWidth, innerHeight) < 320; // smartwatches
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // values tweened by the story
    this.rig = {
      pos: new THREE.Vector3(0, 1.35, 10.5),
      target: new THREE.Vector3(0, 2.05, 0),
      roll: 0,
      fov: 0, // additive offset in degrees
    };
    this.state = {
      door: 0, // 0 closed → 1 open
      mood: 0, // 0 warm dinner → 1 dark proposal spotlight
      wine: 0, // pour progress
      celebrate: 0,
      fade: 1, // post fade to black
      ambientPetals: 1,
      entrancePetals: 1, // the shower outside the doors
      localPetals: 0,
    };
    this.orbit = { weight: 0, angle: 0, radius: 0.6, height: 0.32, speed: 0.08 };
    this.pointer = new THREE.Vector2();
    this.pointerSmooth = new THREE.Vector2();
    this.clock = new THREE.Clock(false);
    this.updaters = [];
    this._sway = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._op = new THREE.Vector3();
    this._look = new THREE.Vector3();
  }

  async build(onProgress = () => {}) {
    const step = async (p) => {
      onProgress(p);
      await tick();
    };

    /* renderer */
    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.maxPixelRatio = Math.min(window.devicePixelRatio, this.isTiny ? 1.25 : this.isMobile ? 1.5 : 1.5);
    this.pixelRatio = this.maxPixelRatio;
    this.perf = { frames: 0, time: 0, settled: false };
    renderer.setPixelRatio(this.pixelRatio);
    renderer.setSize(innerWidth, innerHeight, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true;
    this.renderer = renderer;
    setMaxAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0204);
    scene.fog = new THREE.FogExp2(0x0d0305, 0.03);
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.008, 70);
    this.camera = camera;
    this.baseFov = this.fovFor(camera.aspect);
    await step(0.08);

    /* environment for reflections: dark room with warm hot spots */
    this.buildEnvironment();
    await step(0.16);

    /* materials & world */
    const mats = createMaterials();
    this.mats = mats;
    this.bulbBase = mats.bulb.color.clone();
    await step(0.28);

    this.entrance = createEntrance(mats);
    scene.add(this.entrance.root);
    await step(0.4);

    this.restaurant = createRestaurant(mats, { quality: this.isMobile ? 'low' : 'high' });
    scene.add(this.restaurant.root);
    await step(0.58);

    this.hero = createHeroTable(mats);
    scene.add(this.hero.root);
    scene.add(this.hero.envelope);
    await step(0.68);

    this.buildLights();
    this.buildParticles();
    await step(0.78);

    /* post-processing */
    const { composer, bloom, grade } = createComposer(renderer, scene, camera, {
      samples: this.isMobile ? 0 : 2,
      bloomScale: 0.5, // bloom is a soft blur — half resolution looks identical and costs a quarter
    });
    this.composer = composer;
    this.bloom = bloom;
    this.grade = grade;
    this.resize();
    await step(0.86);

    // compile every shader up-front so the story never hitches
    this.applyCamera(0);
    try {
      await renderer.compileAsync(scene, camera);
    } catch {
      renderer.compile(scene, camera);
    }
    composer.render();
    await step(1);

    let raf = 0;
    this.lastSize = { w: innerWidth, h: innerHeight };
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // on phones the toolbar sliding in/out changes only the height a little — skip that
        const dw = Math.abs(innerWidth - this.lastSize.w);
        const dh = Math.abs(innerHeight - this.lastSize.h);
        if (this.isMobile && dw === 0 && dh < 160) return;
        this.lastSize = { w: innerWidth, h: innerHeight };
        this.resize();
      });
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(onResize, 250));
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return; // touch drags are for scrolling
      this.pointer.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
    });
  }

  buildEnvironment() {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.BoxGeometry(20, 10, 20), new THREE.MeshBasicMaterial({ color: 0x1a0609, side: THREE.BackSide })));
    const warm = (k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.68, 0.38).multiplyScalar(k) });
    const spots = [
      [0, 4.5, 0, 2.2, 0.2, 2.2, 2.5],
      [-6, 2, -3, 0.3, 1.2, 2, 3],
      [6, 2, 3, 0.3, 1.2, 2, 3],
      [3, 3, -7, 1.5, 0.6, 0.3, 2.5],
      [-3, 1.2, 8, 2, 0.5, 0.3, 1.5],
      [0, -4.5, 0, 6, 0.1, 6, 0.25],
    ];
    for (const [x, y, z, w, h, d, k] of spots) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), warm(k));
      m.position.set(x, y, z);
      env.add(m);
    }
    for (let i = 0; i < 18; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), warm(5));
      const a = (i / 18) * Math.PI * 2;
      s.position.set(Math.cos(a) * 7, 2.5 + Math.sin(i * 3.1) * 1.5, Math.sin(a) * 7);
      env.add(s);
    }
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(env, 0.03).texture;
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();
  }

  buildLights() {
    const { scene, isMobile } = this;
    const L = (this.lights = {});

    L.hemi = new THREE.HemisphereLight(0xffcf9e, 0x2a0610, 0.35);
    scene.add(L.hemi);
    L.moon = new THREE.DirectionalLight(0x8a7aa8, 0.25);
    L.moon.position.set(-4, 8, 12);
    scene.add(L.moon);

    // chandeliers
    L.chand = this.restaurant.chandeliers.map((c, i) => {
      // hang the light below the fixture so it doesn't scorch the gold arms
      const p = new THREE.PointLight(0xffb06a, i === 3 ? 8 : 20, 18, 2);
      p.position.set(c.position.x, ROOM.height - (i === 3 ? 1.5 : 2.0), c.position.z);
      scene.add(p);
      return p;
    });

    // entrance lanterns
    L.lanterns = this.entrance.lanterns.map((s) => {
      const p = new THREE.PointLight(0xff9a50, 3.2, 7, 2);
      p.position.copy(s.position).add(new THREE.Vector3(0, 0.1, 0.45));
      scene.add(p);
      return p;
    });

    L.porch = new THREE.PointLight(0xffa868, 5.5, 11, 2);
    L.porch.position.set(0, 3.6, 4.6);
    scene.add(L.porch);

    // light spilling out through the opening doors — casts the doors' shadows
    L.door = new THREE.SpotLight(0xffb27a, 0, 20, 0.62, 0.7, 2);
    L.door.position.set(0, 3.1, -3);
    L.door.target.position.set(0, -0.45, 6);
    L.door.castShadow = true;
    L.door.shadow.mapSize.set(isMobile ? 512 : 1024, isMobile ? 512 : 1024);
    L.door.shadow.bias = -0.0005;
    L.door.shadow.camera.near = 0.5;
    scene.add(L.door, L.door.target);

    // key light over the special table
    L.hero = new THREE.SpotLight(0xffd0a0, 9, 9, 0.46, 0.85, 2);
    L.hero.position.set(0.25, ROOM.height - 0.25, HERO.z + 1.1);
    L.hero.target.position.set(0, TABLE_TOP, HERO.z);
    L.hero.castShadow = true;
    L.hero.shadow.mapSize.set(isMobile ? 1024 : 1536, isMobile ? 1024 : 1536);
    L.hero.shadow.bias = -0.0002;
    L.hero.shadow.normalBias = 0.01;
    L.hero.shadow.camera.near = 1;
    L.hero.shadow.camera.far = 6;
    scene.add(L.hero, L.hero.target);

    // the candle on the table actually lights it
    L.candle = new THREE.PointLight(0xff9440, 0.4, 3, 2);
    L.candle.position.copy(this.hero.candleTip);
    scene.add(L.candle);

    // the warm glow of the tea lights behind the ring box
    L.arc = new THREE.PointLight(0xff9a4a, 0, 1.2, 2);
    L.arc.position.copy(this.hero.ringBox.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(0, 0.05, -0.1));
    scene.add(L.arc);

    // narrow spotlight for the ring box reveal
    const box = this.hero.ringBox.getWorldPosition(new THREE.Vector3());
    L.ring = new THREE.SpotLight(0xfff0dc, 0, 5, 0.085, 1, 2);
    L.ring.position.set(box.x + 0.35, 2.3, box.z + 1.25);
    L.ring.target.position.copy(box).add(new THREE.Vector3(0, 0.03, 0));
    L.ring.castShadow = !isMobile;
    L.ring.shadow.mapSize.set(1024, 1024);
    L.ring.shadow.bias = -0.0002;
    L.ring.shadow.camera.near = 1;
    L.ring.shadow.camera.far = 4;
    scene.add(L.ring, L.ring.target);

    // visible beam of the ring spotlight (fake volumetric)
    const from = L.ring.position.clone();
    const to = L.ring.target.position.clone();
    const len = from.distanceTo(to);
    const beamGeo = new THREE.CylinderGeometry(0.004, len * Math.tan(0.085) * 1.25, len, 32, 1, true).translate(0, -len / 2, 0);
    this.beam = new THREE.Mesh(
      beamGeo,
      new THREE.ShaderMaterial({
        uniforms: { uOpacity: { value: 0 }, uLen: { value: len } },
        vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV;
          void main(){ vY = position.y; vec4 mv = modelViewMatrix*vec4(position,1.); vV = normalize(-mv.xyz); vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*mv; }`,
        fragmentShader: `uniform float uOpacity; uniform float uLen; varying float vY; varying vec3 vN; varying vec3 vV;
          void main(){ float t = clamp(-vY / uLen, 0., 1.); float rim = pow(abs(dot(normalize(vN), normalize(vV))), 2.0);
            float a = rim * uOpacity * (0.25 + 0.75 * t) * (1.0 - smoothstep(0.92, 1.0, t)) * 0.07;
            gl_FragColor = vec4(vec3(1.0, 0.9, 0.75) * a * 2.0, a); }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      })
    );
    this.beam.position.copy(from);
    this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(from).normalize());
    this.beam.visible = false;
    scene.add(this.beam);
  }

  buildParticles() {
    const { scene, isMobile, mats } = this;
    this.ambientPetals = new PetalField({
      count: this.isTiny ? 60 : isMobile ? 160 : 320,
      bounds: new THREE.Box3(new THREE.Vector3(-5, 0, -34), new THREE.Vector3(5, 4.2, -0.6)),
      material: mats.petal,
      size: [0.035, 0.06],
      fall: [0.1, 0.24],
    });
    scene.add(this.ambientPetals.mesh);

    // a steady shower of petals drifting down from above the doors onto the steps
    this.entrancePetals = new PetalField({
      count: this.isTiny ? 90 : isMobile ? 220 : 420,
      bounds: new THREE.Box3(new THREE.Vector3(-3.2, -0.45, 0.2), new THREE.Vector3(3.2, 5.4, 6.2)),
      material: mats.petal,
      size: [0.06, 0.1],
      fall: [0.35, 0.65],
      floorAt: entranceFloorAt,
      rest: [3, 7],
      drift: 0.05,
    });
    scene.add(this.entrancePetals.mesh);

    this.localPetals = new PetalField({
      count: this.isTiny ? 50 : isMobile ? 120 : 220,
      bounds: new THREE.Box3(new THREE.Vector3(-0.9, 0.6, HERO.z - 0.8), new THREE.Vector3(0.9, 1.8, HERO.z + 0.3)),
      material: mats.petal,
      size: [0.018, 0.032],
      fall: [0.05, 0.12],
      floorY: TABLE_TOP + 0.004,
      active: 0,
    });
    scene.add(this.localPetals.mesh);

    const env = this.hero.envelope;
    this.letterMotes = new Motes({ count: isMobile ? 90 : 160, center: new THREE.Vector3(0, 1.0, HERO.z + 0.9), radius: new THREE.Vector3(0.3, 0.22, 0.12), size: 5, opacity: 0 });
    scene.add(this.letterMotes.points);
    this.letterMotesAnchor = env;

    const box = this.hero.ringBox.getWorldPosition(new THREE.Vector3());
    this.ringMotes = new Motes({ count: isMobile ? 120 : 220, center: box.clone().add(new THREE.Vector3(0, 0.25, 0)), radius: new THREE.Vector3(0.35, 0.3, 0.3), size: 6.5, opacity: 0 });
    scene.add(this.ringMotes.points);
  }

  fovFor(aspect) {
    const minHFov = 52;
    const v = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(minHFov / 2)) / aspect));
    return THREE.MathUtils.clamp(v, 38, 74);
  }

  /** Lower the render resolution if the device can't hold ~40fps (older Android, watches). */
  adaptQuality(dt) {
    const p = this.perf;
    if (p.settled || this.state.fade > 0.5) return;
    p.frames++;
    p.time += dt;
    if (p.time < 2.5) return;
    const fps = p.frames / p.time;
    p.frames = 0;
    p.time = 0;
    const floor = this.isMobile ? 0.75 : 1;
    if (fps < 40 && this.pixelRatio > floor) {
      this.pixelRatio = Math.max(floor, +(this.pixelRatio - 0.25).toFixed(2));
      this.resize();
      if (fps < 24 && this.bloom.enabled && this.pixelRatio <= floor) this.bloom.enabled = false;
    } else if (fps >= 50) {
      p.settled = true;
    }
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.camera.aspect = w / h;
    this.baseFov = this.fovFor(this.camera.aspect);
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.pixelRatio);
      this.composer.setSize(w, h);
      this.grade.uniforms.uAspect.value = w / h;
      // keep gold dust the same size relative to the screen on every device
      const k = (h * this.pixelRatio) / 900;
      for (const m of [this.letterMotes, this.ringMotes]) m.material.uniforms.uSize.value = m.baseSize * k;
    }
  }

  /* -------------------------------------------------- per-frame state */

  applyDoor(t) {
    const e = this.entrance;
    const o = easeInOutCubic(t);
    e.doors[0].rotation.y = 1.75 * o;
    e.doors[1].rotation.y = -1.75 * o;
    e.leak.material.opacity = 1 - THREE.MathUtils.smoothstep(t, 0.05, 0.4);
    e.leak.visible = e.leak.material.opacity > 0.01;
    e.pool.material.opacity = 0.65 * THREE.MathUtils.smoothstep(t, 0.05, 0.6);
    e.shaft.material.uniforms.uOpacity.value = THREE.MathUtils.smoothstep(t, 0.05, 0.7);
    this.lights.door.intensity = 70 * THREE.MathUtils.smoothstep(t, 0.0, 0.6);
  }

  applyMood(m, celebrate) {
    const L = this.lights;
    const c = celebrate;
    const k = lerp(m, m * 0.35, c); // celebration lifts the darkness again
    L.chand.forEach((p, i) => (p.intensity = (i === 3 ? 8 : 20) * lerp(1, 0.1, k)));
    L.hemi.intensity = lerp(0.35, 0.05, k);
    L.moon.intensity = lerp(0.25, 0.0, Math.max(m, c));
    L.hero.intensity = lerp(9, 1.2, k) + c * 1.2;
    L.ring.intensity = 2.2 * m * (1 - c * 0.35); // a gentle pool of light, not a stage spot
    L.ring.shadow.autoUpdate = m > 0.01; // no shadow pass while the ring spotlight is off
    this.mats.bulb.color.copy(this.bulbBase).multiplyScalar(lerp(1, 0.35, k));
    for (const ch of this.restaurant.chandeliers) ch.userData.halos.children.forEach((h) => (h.material.opacity = lerp(0.28, 0.1, k)));
    this.scene.environmentIntensity = lerp(0.55, 0.3, k);
    this.scene.fog.density = lerp(0.03, 0.11, k);
    this.renderer.toneMappingExposure = lerp(1.05, 1.0, k) + c * 0.03;
    this.grade.uniforms.uVignette.value = lerp(0.55, 1.05, k);
    for (const f of this.restaurant.flames) f.brightness = lerp(1, 0.45, k);
    this.beam.material.uniforms.uOpacity.value = m * (1 - c * 0.6);
    this.beam.visible = m > 0.01;
  }

  applyCamera(time) {
    const { camera, rig, orbit } = this;
    // pointer parallax + subtle handheld drift — keeps the frame alive
    const ps = this.pointerSmooth.lerp(this.pointer, 0.04);
    const close = THREE.MathUtils.clamp(rig.pos.distanceTo(rig.target) / 3, 0.12, 1);
    const amp = this.reducedMotion ? 0 : 1;
    const sway = this._sway.set(Math.sin(time * 0.31) * 0.012, Math.sin(time * 0.47) * 0.008, 0).multiplyScalar(close * amp);

    camera.position.copy(rig.pos).add(sway);
    const right = this._right.subVectors(rig.target, rig.pos).cross(camera.up).normalize();
    camera.position.addScaledVector(right, ps.x * 0.06 * close * amp);
    camera.position.y += -ps.y * 0.035 * close * amp;

    if (orbit.weight > 0) {
      const center = this.hero.ringBox.diamondWorld;
      const a = orbit.angle;
      const op = this._op.set(center.x + Math.sin(a) * orbit.radius, center.y + orbit.height, center.z + Math.cos(a) * orbit.radius);
      camera.position.lerp(op, orbit.weight);
      const t = this._look.lerpVectors(rig.target, center, orbit.weight);
      camera.lookAt(t);
    } else {
      camera.lookAt(rig.target);
    }
    if (rig.roll) camera.rotateZ(rig.roll);
    const fov = this.baseFov + rig.fov;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
  }

  start() {
    this.clock.start();
    // render on GSAP's ticker, after Lenis and ScrollTrigger have updated in the same frame
    gsap.ticker.add(() => this.frame());
  }

  onUpdate(fn) {
    this.updaters.push(fn);
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    const time = this.clock.elapsedTime;
    const s = this.state;

    this.orbit.angle += dt * this.orbit.speed * this.orbit.weight;
    this.applyCamera(time);
    this.applyDoor(s.door);
    this.applyMood(s.mood, s.celebrate);
    this.grade.uniforms.uFade.value = s.fade;
    // ease the glow off as the room darkens so the ring reads naturally
    this.bloom.strength = lerp(0.32, 0.55, s.door) * lerp(1, 0.55, s.mood);

    for (const fn of this.updaters) fn(dt, time);

    // flames
    const cam = this.camera;
    for (const f of this.restaurant.flames) f.update(time, cam);
    for (const f of this.hero.flames) f.update(time, cam);
    let lit = 0;
    for (const t of this.hero.tealights) lit += Math.min(1, t.userData.flame.lit);
    const flick = 0.92 + Math.sin(time * 9.3) * 0.05 + Math.sin(time * 21.7) * 0.03;
    this.lights.arc.intensity = ((0.9 * lit) / this.hero.tealights.length) * flick;
    this.lights.candle.intensity = 0.4 * (0.85 + Math.sin(time * 11) * 0.08 + Math.sin(time * 23.7) * 0.07) * (1 + s.mood * 0.6);

    // hero objects
    this.hero.envelope.update(cam);
    this.hero.ringBox.update(time);

    // particles
    if (s.entrancePetals > 0.001) {
      this.entrancePetals.mesh.visible = true;
      this.entrancePetals.setActive(s.entrancePetals);
      this.entrancePetals.update(dt, time);
    } else this.entrancePetals.mesh.visible = false;
    this.lights.porch.intensity = 5.5 * s.entrancePetals;
    this.ambientPetals.setActive(s.ambientPetals);
    this.ambientPetals.update(dt, time);
    this.localPetals.setActive(s.localPetals);
    if (this.localPetals.mesh.count > 0) this.localPetals.update(dt, time);
    this.letterMotes.points.position.copy(this.hero.envelope.position);
    this.letterMotes.update(time);
    this.ringMotes.update(time);

    this.composer.render(dt);
    this.adaptQuality(dt);
  }
}

function easeInOutCubic(t) {
  t = Math.min(1, Math.max(0, t));
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export { HERO, TABLE_TOP };
