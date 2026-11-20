import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { HERO } from '../world/restaurant.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * The epilogue after "yes": scrolling on, the camera rises back over the
 * table, the chair across is drawn out and turned towards us, and we walk
 * round and sit down in the opposite chair — seeing the evening from a
 * seat at the table.
 */
export class AfterYes {
  constructor(world, { onEnter } = {}) {
    this.world = world;
    this.onEnter = onEnter;
    this.p = { u: 0 };
  }

  build() {
    const w = this.world;
    const [seatChair, offeredChair] = w.hero.chairs; // we sit at −x; the +x chair is drawn out
    this.offered = offeredChair;
    this.offeredRest = { x: offeredChair.position.x, ry: offeredChair.rotation.y };

    // camera path from wherever the proposal left the rig, to a seated view
    const z = HERO.z;
    const pos = [
      w.rig.pos.clone(),
      V(0.55, 1.5, z + 1.75), // rise back over the table
      V(-0.55, 1.62, z + 1.2), // walk round to our chair
      V(-1.08, 1.48, z + 0.25), // standing behind it
      V(-0.96, 1.16, z), // ...and sit down
    ];
    const look = [
      w.rig.target.clone(),
      V(0.1, 0.82, z),
      V(0.4, 0.85, z - 0.1),
      V(0.6, 0.85, z - 0.05),
      V(1.0, 0.93, z - 0.02), // across the table, to the chair waiting there
    ];
    this.posCurve = new THREE.CatmullRomCurve3(pos, false, 'centripetal');
    this.lookCurve = new THREE.CatmullRomCurve3(look, false, 'centripetal');
    const p = this.p;
    const k = (i) => i / (pos.length - 1);

    const tl = gsap.timeline({ defaults: { ease: 'none' } });
    this.tl = tl;
    tl.set(p, { u: 0 }, 0)
      .to('#finale', { autoAlpha: 0, y: -20, duration: 2, ease: 'power2.in' }, 0)
      .to(w.orbit, { weight: 0, duration: 4, ease: 'power2.inOut' }, 0)
      .to(p, { u: k(1), duration: 6, ease: 'sine.inOut' }, 0)
      // the chair across is drawn out and turned towards us
      .to(offeredChair.position, { x: this.offeredRest.x + 0.42, z: offeredChair.position.z + 0.12, duration: 5, ease: 'power2.inOut' }, 4)
      .to(offeredChair.rotation, { y: this.offeredRest.ry + 0.55, duration: 5, ease: 'power2.inOut' }, 4.4)
      .to(p, { u: k(2), duration: 5, ease: 'sine.inOut' }, 9)
      .to(p, { u: k(3), duration: 4, ease: 'sine.inOut' }, 14)
      // sit: a slower, settling descent
      .to(p, { u: k(4), duration: 5, ease: 'power2.out' }, 18)
      .to(w.rig, { fov: 5, duration: 5, ease: 'sine.inOut' }, 18)
      .fromTo('#ending', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6 }, 22)
      .fromTo('.ending__title', { autoAlpha: 0, y: 24, filter: 'blur(10px)' }, { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 3, ease: 'power2.out' }, 22)
      .fromTo('.ending__sub', { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 2.5, ease: 'power2.out' }, 23.5)
      .fromTo('#replay', { autoAlpha: 0 }, { autoAlpha: 1, duration: 2 }, 25)
      .to({}, { duration: 2 }, 27);

    this.updater = () => {
      if (!this.active) return;
      this.posCurve.getPoint(p.u, w.rig.pos);
      this.lookCurve.getPoint(p.u, w.rig.target);
    };
    w.onUpdate(this.updater);

    this.trigger = ScrollTrigger.create({
      trigger: '#afterTrack',
      start: 'top bottom', // begins as soon as the track appears below the proposal
      end: 'bottom bottom',
      scrub: w.isMobile ? 0.35 : true,
      animation: tl,
      onEnter: () => this.onEnter?.(),
    });
    this.active = true;
  }

  /** Undo everything so the story can be replayed from the start. */
  reset() {
    this.active = false;
    this.trigger?.kill();
    this.tl?.progress(0).kill();
    if (this.offered) {
      this.offered.position.x = this.offeredRest.x;
      this.offered.rotation.y = this.offeredRest.ry;
      this.offered.position.z = 0;
    }
    gsap.set(['#ending', '.ending__title', '.ending__sub', '#replay', '#finale'], { clearProps: 'all' });
    this.world.rig.fov = 0;
    this.world.updaters = this.world.updaters.filter((f) => f !== this.updater);
  }
}
