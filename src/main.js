import './styles.css';
import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { World } from './world/World.js';
import { Story, SHOTS } from './story/story.js';
import { AfterYes } from './story/afterYes.js';
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
const lenis = new Lenis({ lerp: 0.12, wheelMultiplier: 1.1, smoothWheel: true, syncTouch: false });
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
// start fetching the fonts straight away, alongside everything else
const fontsReady = Promise.all([
  document.fonts.load('80px "Great Vibes"'),
  document.fonts.load('300 40px "Cormorant Garamond"'),
  document.fonts.load('40px "Cinzel"'),
]).catch(() => {});
const audio = new Ambience();
const fireworks = new Fireworks($('#fx'));
const world = new World($('#stage'));
if (import.meta.env.DEV) window.__world = world; // debugging aid, stripped from production builds
let story;

async function boot() {
  initCursor();
  // the letter is written in a script face: give it a moment, but never hold the page for it
  let fontsIn = false;
  fontsReady.then(() => (fontsIn = true));
  await Promise.race([fontsReady, new Promise((r) => setTimeout(r, 900))]);
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

  // if the script font arrived after the letter was drawn, redraw it in the right hand
  if (!fontsIn) fontsReady.then(() => world.hero.envelope.refreshLetter());
  revealIntro();
}

/* -------------------------------------------------------------- Scene 1 */
const titleChars = splitChars($('.intro__title'));

let introTl;
function revealIntro() {
  const tl = (introTl = gsap.timeline());
  tl.to('#loader', { autoAlpha: 0, duration: 0.7, ease: 'power2.inOut', onComplete: () => body.classList.remove('is-loading') })
    .to(world.state, { fade: 0, duration: 2, ease: 'power2.out' }, 0.1)
    .to(world.rig.pos, { x: 0, y: 1.55, z: 7.4, duration: 9, ease: 'power2.out' }, 0)
    .to(world.rig.target, { y: 2.1, duration: 9, ease: 'power2.out' }, 0)
    .set('#intro', { autoAlpha: 1 }, 0.4)
    .from('#intro .eyebrow', { autoAlpha: 0, y: 14, duration: 1, ease: 'power3.out' }, 0.5)
    .from(titleChars, { autoAlpha: 0, yPercent: 60, rotateX: -70, filter: 'blur(8px)', duration: 1, stagger: 0.025, ease: 'power3.out' }, 0.6)
    .from('.intro__sub', { autoAlpha: 0, y: 16, duration: 1, ease: 'power3.out' }, 1.3)
    .from('#enter', { autoAlpha: 0, y: 18, scale: 0.94, duration: 1, ease: 'power3.out' }, 1.5)
    .from('.intro__cue', { autoAlpha: 0, duration: 0.8 }, 1.9)
    .add(() => (introReady = true), 1.2); // can enter while the last words are still settling
}

/* Enter by tapping the button — or simply by scrolling / swiping / pressing a key */
let introReady = false;
let entered = false;
const cue = $('.intro__cue');
if (matchMedia('(pointer: coarse)').matches) cue.textContent = 'or swipe up to begin';

$('#enter').addEventListener('click', enterStory);
window.addEventListener('wheel', (e) => e.deltaY > 8 && enterStory(), { passive: true });
let touchY = null;
window.addEventListener('touchstart', (e) => (touchY = e.touches[0].clientY), { passive: true });
window.addEventListener('touchmove', (e) => touchY !== null && touchY - e.touches[0].clientY > 40 && enterStory(), { passive: true });
window.addEventListener('keydown', (e) => ['ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key) && enterStory());

function enterStory() {
  if (!introReady || entered) return;
  entered = true;
  audio.start();
  // stop the slow intro drift so it doesn't fight the entrance glide
  gsap.killTweensOf([world.rig.pos, world.rig.target]);
  introTl.progress(1); // finish the intro instantly if someone enters while it is still playing
  const [p0, t0] = SHOTS.doorway;

  // one continuous glide: steps → through the doorway → into the room (no stop in between)
  const from = world.rig.pos.clone();
  const fromT = world.rig.target.clone();
  const path = new THREE.CatmullRomCurve3([from, new THREE.Vector3(0, 1.6, 4.4), new THREE.Vector3(0, 1.7, 0.9), p0], false, 'centripetal');
  const look = new THREE.CatmullRomCurve3([fromT, new THREE.Vector3(0, 1.8, -2), new THREE.Vector3(0, 1.6, -8), t0], false, 'centripetal');
  const glide = { t: 0 };

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
    .to(['#intro .eyebrow', '.intro__sub', '#enter', '.intro__cue'], { autoAlpha: 0, y: -12, duration: 0.8, ease: 'power2.in' }, 0.1)
    .set('#intro', { autoAlpha: 0 }, 1.2)
    // the doors swing open, golden light floods out, a gust of petals blows towards us
    .to(world.state, { door: 1, duration: 2.2, ease: 'none' }, 0.3)
    .add(() => world.entrancePetals.burst(new THREE.Vector3(0, 4.3, 0.5), world.isMobile ? 50 : 90, 0.7, { x: 0, z: 1 }), 0.7)
    .to(
      glide,
      {
        t: 1,
        duration: 3.8,
        ease: 'power2.inOut',
        onUpdate: () => {
          path.getPoint(glide.t, world.rig.pos);
          look.getPoint(glide.t, world.rig.target);
        },
      },
      0.4
    )
    // the outside shower stops once we're indoors (saves work)
    .to(world.state, { entrancePetals: 0, duration: 1 }, 3.3)
    .add(() => {
      // freeze door shadows once we're inside — saves a shadow pass per frame
      world.lights.door.shadow.autoUpdate = false;
      world.lights.door.shadow.needsUpdate = true;
    }, 4.1);
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

function sayYes() {
  if (celebrating) return;
  celebrating = true;
  celebrate();
}
document.querySelectorAll('[data-yes]').forEach((btn) => btn.addEventListener('click', sayYes));

/* -------------------------------------------------------------- the "No" button
   Every "no" earns a heartfelt plea; YES grows, NO shrinks — until NO becomes YES. */
const PLEAS = [
  'Are you sure? My heart just skipped a beat...',
  'Every love story is beautiful, but ours is my favourite.',
  'I would choose you in a hundred lifetimes, in a hundred worlds.',
  'Think of every sunrise we have not watched together yet...',
  'Even the candles are holding their breath for your answer.',
  'Without you, forever would just be a very long time.',
];
const noBtn = $('#no');
const yesBtn = $('.proposal__actions [data-yes]');
const subEl = $('.proposal__sub');
const subText = subEl.textContent;
let noCount = 0;

noBtn.addEventListener('click', () => {
  if (noBtn.dataset.turned) return sayYes();
  const plea = PLEAS[noCount % PLEAS.length];
  noCount++;
  gsap
    .timeline()
    .to(subEl, { autoAlpha: 0, y: -8, duration: 0.25, ease: 'power2.in' })
    .add(() => (subEl.textContent = plea))
    .to(subEl, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power2.out' });
  gsap.to(yesBtn, { scale: 1 + Math.min(noCount, 6) * 0.08, duration: 0.6, ease: 'elastic.out(1, 0.5)' });
  gsap.fromTo(yesBtn, { boxShadow: '0 0 0 0 rgba(230,199,147,0.7)' }, { boxShadow: '0 0 60px 14px rgba(230,199,147,0)', duration: 1.2 });
  gsap.to(noBtn, { scale: Math.max(0.55, 1 - noCount * 0.08), opacity: Math.max(0.5, 1 - noCount * 0.09), duration: 0.5, ease: 'power2.out' });
  gsap.fromTo(noBtn, { x: -6 }, { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' });
  if (noCount >= PLEAS.length) {
    // the No button gives in
    noBtn.dataset.turned = '1';
    const label = noBtn.querySelector('span');
    gsap
      .timeline({ delay: 0.4 })
      .to(noBtn, { rotateX: 90, duration: 0.25, ease: 'power2.in' })
      .add(() => {
        label.textContent = 'Okay... YES ❤️';
        noBtn.classList.add('btn-gold--solid');
      })
      .to(noBtn, { rotateX: 0, scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(2)' });
  }
});

function resetNo() {
  noCount = 0;
  delete noBtn.dataset.turned;
  noBtn.classList.remove('btn-gold--solid');
  noBtn.querySelector('span').textContent = 'No';
  subEl.textContent = subText;
  gsap.set([noBtn, yesBtn, subEl], { clearProps: 'transform,opacity,visibility,boxShadow' });
}

/* -------------------------------------------------------------- after the yes: take your seat */
const afterYes = new AfterYes(world, { onEnter: () => fireworks.stop() });

function openEpilogue() {
  // reveal the extra scroll track and let the visitor scroll on
  story.trigger.disable(false); // freeze the proposal timeline where it is
  body.classList.add('is-after');
  lenis.resize();
  ScrollTrigger.refresh();
  afterYes.build();
  lenis.start();
}

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
    .to(box.sparkles, { intensity: 0.75, duration: 1.5 }, 0)
    .to(world.ringMotes, { opacity: 0.7, duration: 2 }, 0)
    .to(world.orbit, { weight: 1, radius: 0.62, height: 0.3, speed: 0.12, duration: 6, ease: 'power2.inOut' }, 0.3)
    .set('#finale', { autoAlpha: 1 }, 1.6)
    .from('#finale .eyebrow', { autoAlpha: 0, y: 12, duration: 1.4, ease: 'power3.out' }, 1.6)
    .from(finaleChars, { autoAlpha: 0, y: 40, scale: 0.8, filter: 'blur(10px)', duration: 1.6, stagger: 0.04, ease: 'power3.out' }, 1.9)
    .from('.finale__flourish path', { autoAlpha: 0, scaleX: 0, transformOrigin: '50% 50%', duration: 1.6, ease: 'power3.out', stagger: 0.2 }, 3)
    .from('.finale__cue', { autoAlpha: 0, y: 10, duration: 1 }, 4.2)
    .add(openEpilogue, 6.4); // after the orbit has settled
}

$('#replay').addEventListener('click', () => {
  fireworks.stop();
  lenis.stop();
  const tl = gsap.timeline({
    onComplete: () => {
      celebrating = false;
      gsap.set('#proposal', { y: 0 });
      gsap.set(['#finale .eyebrow', finaleChars, '.finale__flourish path', '.finale__cue'], { clearProps: 'all' });
      resetNo();
    },
  });
  tl.to(['#finale', '#ending'], { autoAlpha: 0, duration: 1.2, ease: 'power2.inOut' })
    // dip to black while the camera is handed back to the story
    .to(world.state, { fade: 1, duration: 1.1, ease: 'power2.in' }, 0)
    .to(world.state, { fade: 0, duration: 1.6, ease: 'power2.out' }, 1.7)
    .add(() => {
      // put the chair back, drop the epilogue track and hand the camera back to the story
      afterYes.reset();
      body.classList.remove('is-after');
      lenis.resize();
      story.trigger.enable(false);
      ScrollTrigger.refresh();
    }, 1.2)
    .to(world.orbit, { weight: 0, duration: 2.5, ease: 'power2.inOut' }, 0)
    .to(world.state, { celebrate: 0, duration: 2.5 }, 0)
    .to(world.hero.ringBox.sparkles, { intensity: 0.6, duration: 2 }, 0)
    .to(world.ringMotes, { opacity: 0.45, duration: 2 }, 0)
    .add(() => {
      story.active = true;
      lenis.start();
      // rewind the whole evening back to the doorway
      lenis.scrollTo(0, { duration: 7, easing: (t) => 1 - Math.pow(1 - t, 3) });
    }, 1.6);
});

boot();
