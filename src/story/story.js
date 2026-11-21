import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { setWineLevel } from '../world/props.js';

gsap.registerPlugin(ScrollTrigger);

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * One continuous camera path through the world. Each keyframe is a
 * cinematic "moment"; scrolling glides the camera between them.
 *            position                      look-at
 */
export const SHOTS = {
  doorway: [V(0, 1.72, -0.9), V(0, 1.45, -12)],
  aisle: [V(0.35, 1.68, -8.5), V(-0.5, 1.25, -20)],
  approach: [V(-0.45, 1.58, -16.5), V(0.1, 1.05, -30)],
  arrive: [V(0.05, 1.42, -24.6), V(0, 0.9, -30)],
  dinner: [V(0, 1.3, -28.0), V(0, 0.84, -30.0)],
  glasses: [V(0.78, 1.0, -29.35), V(0.36, 0.88, -30.12)],
  candle: [V(-0.5, 1.0, -29.15), V(0.02, 0.95, -30.22)],
  letter: [V(0.08, 1.18, -28.82), V(0.07, 0.8, -29.5)],
  surprise: [V(0.12, 1.02, -29.05), V(-0.01, 0.8, -29.86)],
  closer: [V(0.05, 0.99, -29.38), V(-0.01, 0.81, -29.86)],
  ring: [V(0.0, 0.935, -29.47), V(-0.01, 0.835, -29.86)],
};

export class Story {
  constructor(world, { onProgress, onProposalReady }) {
    this.world = world;
    this.onProgress = onProgress;
    this.onProposalReady = onProposalReady;
    this.active = false;

    const keys = Object.values(SHOTS);
    this.n = keys.length;
    this.posCurve = new THREE.CatmullRomCurve3(keys.map((k) => k[0]), false, 'centripetal');
    this.tgtCurve = new THREE.CatmullRomCurve3(keys.map((k) => k[1]), false, 'centripetal');
    this.cam = { u: 0 };
    this.fx = { candle: 1 };

    world.onUpdate(() => {
      if (!this.active) return;
      this.posCurve.getPoint(this.cam.u, world.rig.pos);
      this.tgtCurve.getPoint(this.cam.u, world.rig.target);
      const h = world.hero;
      const wl = THREE.MathUtils.lerp(0.108, 0.15, world.state.wine);
      for (const g of h.glasses) setWineLevel(g, wl);
      h.flames.forEach((f) => (f.brightness = this.fx.candle));
    });
  }

  /** Keyframe index → curve parameter. */
  k(name) {
    return Object.keys(SHOTS).indexOf(name) / (this.n - 1);
  }

  build() {
    const w = this.world;
    const h = w.hero;
    const env = h.envelope;
    const box = h.ringBox;
    const cap = (id) => document.querySelector(`[data-cap="${id}"]`);
    const cam = this.cam;
    const S = w.state;
    const tl = gsap.timeline({ defaults: { ease: 'none' } });
    this.tl = tl;

    const shot = (name, at, dur, ease = 'sine.inOut') => tl.to(cam, { u: this.k(name), duration: dur, ease }, at);
    const caption = (el, inAt, outAt) => {
      tl.fromTo(el, { autoAlpha: 0, y: 26, filter: 'blur(12px)' }, { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 2.4, ease: 'power2.out' }, inAt);
      tl.to(el, { autoAlpha: 0, y: -18, filter: 'blur(10px)', duration: 2, ease: 'power2.in' }, outAt);
    };

    // set the starting values explicitly so scrubbing backwards restores them
    tl.set(cam, { u: 0 }, 0);

    /* Scene 2 — through the restaurant */
    tl.fromTo(cap('hint'), { autoAlpha: 1 }, { autoAlpha: 0, duration: 2 }, 0);
    shot('aisle', 0, 10);
    caption(cap('welcome'), 3, 8.5);
    shot('approach', 10, 8);
    shot('arrive', 18, 7);

    /* Scene 3 — the candlelight dinner */
    shot('dinner', 25, 6);
    tl.fromTo('.letterbox', { scaleY: 0 }, { scaleY: 1, duration: 4, ease: 'power2.inOut' }, 26);
    caption(cap('m1'), 29, 35);
    shot('glasses', 37, 7);
    tl.to(S, { wine: 1, duration: 8, ease: 'power1.inOut' }, 38);
    caption(cap('m2'), 41, 47);
    shot('candle', 49, 7);
    tl.to(this.fx, { candle: 1.35, duration: 6, ease: 'sine.inOut' }, 50);
    caption(cap('m3'), 53, 59);

    /* Scene 4 — the love letter */
    shot('letter', 61, 5);
    tl.to(env, { lift: 1, duration: 6, ease: 'power1.inOut' }, 66);
    tl.to(env, { flapT: 1, duration: 3, ease: 'power2.inOut' }, 71);
    tl.to(env, { slide: 1, duration: 5, ease: 'power1.inOut' }, 73);
    tl.to(env, { present: 1, duration: 4, ease: 'power1.inOut' }, 78);
    tl.to(w.letterMotes, { opacity: 1, duration: 5 }, 78);
    tl.to(env, { glow: 1, duration: 5 }, 79);
    tl.to(env, { unfold: 1, duration: 5, ease: 'power2.inOut' }, 80.5);
    caption(cap('letter'), 84, 95); // only displayed on watch-sized screens (CSS)
    tl.to(this.fx, { candle: 1, duration: 4 }, 84);
    tl.to(w.rig, { fov: -2, duration: 9, ease: 'sine.inOut' }, 88);
    tl.to(env, { lift: 0, present: 0, glow: 0, duration: 6, ease: 'power2.inOut' }, 97);
    tl.to(w.letterMotes, { opacity: 0, duration: 4 }, 97);
    tl.to(w.rig, { fov: 0, duration: 6 }, 97);

    /* Scene 5 — the surprise */
    tl.to(S, { mood: 1, duration: 9, ease: 'power1.inOut' }, 101);
    shot('surprise', 101, 9);
    tl.to(S, { ambientPetals: 0.45, duration: 6 }, 102);
    caption(cap('question'), 105, 113);
    tl.to(this.fx, { candle: 1.2, duration: 6 }, 106);

    /* Scene 6 — the proposal */
    shot('closer', 110, 8);
    tl.to(S, { localPetals: 1, duration: 10 }, 110);
    tl.to(box, { open: 1, duration: 8, ease: 'none' }, 117);
    tl.to(w.ringMotes, { opacity: 0.45, duration: 8 }, 118);
    tl.to(box, { rise: 1, duration: 8, ease: 'none' }, 123);
    tl.to(box.sparkles, { intensity: 0.6, duration: 6 }, 125);
    shot('ring', 129, 6);
    tl.to('.letterbox', { scaleY: 0, duration: 4, ease: 'power2.inOut' }, 132);
    tl.fromTo('#proposal', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5 }, 133);
    tl.fromTo('.proposal__title', { autoAlpha: 0, y: 30, letterSpacing: '0.3em', filter: 'blur(14px)' }, { autoAlpha: 1, y: 0, letterSpacing: '0.08em', filter: 'blur(0px)', duration: 4, ease: 'power2.out' }, 133);
    tl.fromTo('.proposal__sub', { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 3, ease: 'power2.out' }, 135.5);
    tl.fromTo('.proposal__actions', { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 3, ease: 'power2.out' }, 137);
    tl.to({}, { duration: 3 }, 140); // hold at the end
    const readyAt = 138.5 / tl.duration();

    this.trigger = ScrollTrigger.create({
      trigger: '#track',
      start: 'top top',
      end: 'bottom bottom',
      // desktop: Lenis already smooths, so follow it directly (no second, laggy ease)
      // touch: a short scrub turns native scroll steps into a glide
      scrub: w.isMobile ? 0.35 : true,
      animation: tl,
      onUpdate: (self) => this.onProgress?.(self.progress),
    });
    // checked on the timeline itself: with scrub it keeps rendering after scrolling stops
    tl.eventCallback('onUpdate', () => this.onProposalReady?.(tl.progress() >= readyAt));
    this.active = true;
  }
}
