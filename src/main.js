import './styles.css';
import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { World } from './world/World.js';
import { Story, SHOTS } from './story/story.js';
import { Ambience } from './ui/audio.js';
import { Fireworks } from './ui/fireworks.js';
import { initCursor } from './ui/cursor.js';

gsap.registerPlugin(ScrollTrigger);
// mobile browsers resize the viewport as their toolbars slide — don't recalculate the story for that
ScrollTrigger.config({ ignoreMobileResize: true });
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

const $ = (s) => document.querySelector(s);
const body = document.body;

/* -------------------------------------------------------------- helpers */
function splitChars(el) {
  const words = el.textContent.trim().split(/\s+/);
  el.textContent = '';
  el.setAttribute('aria-label', words.join(' '));
  const chars = [];
  words.forEach((w, i) => {
    const word = document.createElement('span');
    word.className = 'split-word';
    word.setAttribute('aria-hidden', 'true');
    for (const ch of w) {
      const c = document.createElement('span');
      c.className = 'split-char';
      c.textContent = ch;
      word.appendChild(c);
      chars.push(c);
    }
    el.appendChild(word);
    if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
  });
  return chars;
}

/* -------------------------------------------------------------- smooth scroll */
// Lenis is the only smoothing layer for wheel/trackpad; touch keeps native momentum scrolling
const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 0.9, smoothWheel: true, syncTouch: false });
lenis.stop();
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((t) => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);

/* -------------------------------------------------------------- loader */
const pctEl = $('.loader__pct');
const loadState = { p: 0 };
function setLoad(p) {
  gsap.to(loadState, {
    p,
    duration: 0.4,
    overwrite: true,
    onUpdate: () => (pctEl.textContent = `${Math.round(loadState.p * 100)}%`),
  });
}

/* -------------------------------------------------------------- boot */
const audio = new Ambience();
const fireworks = new Fireworks($('#fx'));
const world = new World($('#stage'));
if (import.meta.env.DEV) window.__world = world; // debugging aid, stripped from production builds
let story;

async function boot() {
  initCursor();
  // the letter is written in a script face — make sure it's ready before we draw it
  try {
    await Promise.race([
      Promise.all([document.fonts.load('80px "Great Vibes"'), document.fonts.load('300 40px "Cormorant Garamond"'), document.fonts.load('40px "Cinzel"')]),
      new Promise((r) => setTimeout(r, 3500)),
    ]);
  } catch {
    /* fall back to system fonts */
  }
  setLoad(0.05);

  try {
    await world.build((p) => setLoad(0.05 + p * 0.95));
  } catch (err) {
    console.error(err);
    $('.loader__label').textContent = 'This story needs a WebGL-capable browser.';
    return;
  }

  world.start();
  story = new Story(world, {
    onProgress: (p) => gsap.set('.progress__bar', { scaleX: p }),
    onProposalReady: (ready) => $('#proposal').classList.toggle('is-interactive', ready && !celebrating),
  });

  await new Promise((r) => setTimeout(r, 450));
  revealIntro();
}

/* -------------------------------------------------------------- Scene 1 */
const titleChars = splitChars($('.intro__title'));

function revealIntro() {
  const tl = gsap.timeline();
  tl.to('#loader', { autoAlpha: 0, duration: 1.4, ease: 'power2.inOut', onComplete: () => body.classList.remove('is-loading') })
    .to(world.state, { fade: 0, duration: 3.2, ease: 'power2.out' }, 0.2)
    .to(world.rig.pos, { x: 0, y: 1.55, z: 7.4, duration: 9, ease: 'power2.out' }, 0)
    .to(world.rig.target, { y: 2.1, duration: 9, ease: 'power2.out' }, 0)
    .set('#intro', { autoAlpha: 1 }, 1.2)
    .from('#intro .eyebrow', { autoAlpha: 0, y: 14, duration: 1.4, ease: 'power3.out' }, 1.4)
    .from(titleChars, { autoAlpha: 0, yPercent: 60, rotateX: -70, filter: 'blur(8px)', duration: 1.4, stagger: 0.035, ease: 'power3.out' }, 1.6)
    .from('.intro__sub', { autoAlpha: 0, y: 16, duration: 1.4, ease: 'power3.out' }, 2.8)
    .from('#enter', { autoAlpha: 0, y: 18, scale: 0.94, duration: 1.4, ease: 'power3.out' }, 3.3);
}

$('#enter').addEventListener('click', enterStory, { once: true });

function enterStory() {
  audio.start();
  const [p0, t0] = SHOTS.doorway;
  const tl = gsap.timeline({
    onComplete: () => {
      body.classList.remove('is-locked');
      body.classList.add('is-entered');
      story.build();
      lenis.resize();
      ScrollTrigger.refresh();
      lenis.start();
      gsap.fromTo('[data-cap="hint"]', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 1.4 });
    },
  });
  tl.to('#enter', { scale: 0.96, duration: 0.15, yoyo: true, repeat: 1 })
    .to(titleChars, { autoAlpha: 0, yPercent: -40, filter: 'blur(6px)', duration: 0.9, stagger: 0.012, ease: 'power2.in' }, 0.1)
    .to(['#intro .eyebrow', '.intro__sub', '#enter'], { autoAlpha: 0, y: -12, duration: 0.8, ease: 'power2.in' }, 0.1)
    .set('#intro', { autoAlpha: 0 }, 1.2)
    // the doors swing open, golden light floods out
    .to(world.state, { door: 1, duration: 3.6, ease: 'none' }, 0.5)
    .to(world.rig.pos, { x: 0, y: 1.62, z: 4.4, duration: 3, ease: 'power2.inOut' }, 0.6)
    .to(world.rig.target, { x: 0, y: 1.7, z: -4, duration: 3, ease: 'power2.inOut' }, 0.6)
    // ...and we step inside
    .to(world.rig.pos, { x: p0.x, y: p0.y, z: p0.z, duration: 3.6, ease: 'power2.inOut' }, 3.2)
    .to(world.rig.target, { x: t0.x, y: t0.y, z: t0.z, duration: 3.6, ease: 'power2.inOut' }, 3.2)
    .add(() => {
      // freeze door shadows once we're inside — saves a shadow pass per frame
      world.lights.door.shadow.autoUpdate = false;
      world.lights.door.shadow.needsUpdate = true;
    }, 7);
}

/* -------------------------------------------------------------- sound */
const soundBtn = $('#sound');
soundBtn.addEventListener('click', () => {
  const muted = audio.toggle();
  soundBtn.classList.toggle('is-muted', muted);
  soundBtn.setAttribute('aria-pressed', String(muted));
  soundBtn.setAttribute('aria-label', muted ? 'Unmute music' : 'Mute music');
});

/* -------------------------------------------------------------- the YES */
let celebrating = false;
const finaleChars = splitChars($('.finale__title'));

document.querySelectorAll('[data-yes]').forEach((btn) =>
  btn.addEventListener('click', () => {
    if (celebrating) return;
    celebrating = true;
    celebrate();
  })
);

function celebrate() {
  $('#proposal').classList.remove('is-interactive');
  lenis.stop();
  story.active = false;
  audio.celebrate();

  // start the orbit from wherever the camera is now
  const c = world.hero.ringBox.diamondWorld;
  const cam = world.camera.position;
  world.orbit.angle = Math.atan2(cam.x - c.x, cam.z - c.z);
  world.orbit.radius = Math.hypot(cam.x - c.x, cam.z - c.z);
  world.orbit.height = cam.y - c.y;

  const box = world.hero.ringBox;
  const tl = gsap.timeline();
  tl.to('#proposal', { autoAlpha: 0, y: -10, duration: 1, ease: 'power2.inOut' }, 0)
    .add(() => {
      world.localPetals.burst(c.clone().add(new THREE.Vector3(0, 0.05, 0)), world.isMobile ? 80 : 140, 0.9);
      fireworks.start(16);
    }, 0.2)
    .to(world.state, { celebrate: 1, localPetals: 1, ambientPetals: 1, duration: 3, ease: 'power2.out' }, 0)
    .to(box.sparkles, { intensity: 1.8, duration: 1.5 }, 0)
    .to(world.ringMotes, { opacity: 1.8, duration: 2 }, 0)
    .to(world.orbit, { weight: 1, radius: 0.62, height: 0.3, speed: 0.12, duration: 6, ease: 'power2.inOut' }, 0.3)
    .set('#finale', { autoAlpha: 1 }, 1.6)
    .from('#finale .eyebrow', { autoAlpha: 0, y: 12, duration: 1.4, ease: 'power3.out' }, 1.6)
    .from(finaleChars, { autoAlpha: 0, y: 40, scale: 0.8, filter: 'blur(10px)', duration: 1.6, stagger: 0.04, ease: 'power3.out' }, 1.9)
    .from('.finale__flourish path', { autoAlpha: 0, scaleX: 0, transformOrigin: '50% 50%', duration: 1.6, ease: 'power3.out', stagger: 0.2 }, 3)
    .from('#replay', { autoAlpha: 0, y: 10, duration: 1 }, 4.2);
}

$('#replay').addEventListener('click', () => {
  fireworks.stop();
  const tl = gsap.timeline({
    onComplete: () => {
      celebrating = false;
      gsap.set('#proposal', { y: 0 });
      gsap.set(['#finale .eyebrow', finaleChars, '.finale__flourish path', '#replay'], { clearProps: 'all' });
    },
  });
  tl.to('#finale', { autoAlpha: 0, duration: 1.2, ease: 'power2.inOut' })
    .to(world.orbit, { weight: 0, duration: 2.5, ease: 'power2.inOut' }, 0)
    .to(world.state, { celebrate: 0, duration: 2.5 }, 0)
    .to(world.hero.ringBox.sparkles, { intensity: 1, duration: 2 }, 0)
    .to(world.ringMotes, { opacity: 1, duration: 2 }, 0)
    .add(() => {
      story.active = true;
      lenis.start();
      // rewind the whole evening back to the doorway
      lenis.scrollTo(0, { duration: 7, easing: (t) => 1 - Math.pow(1 - t, 3) });
    }, 1.6);
});

boot();
