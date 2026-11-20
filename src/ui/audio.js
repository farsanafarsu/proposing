/**
 * Soft instrumental ambience.
 *
 * If you drop an mp3 at /public/audio/music.mp3 it will be used. Otherwise
 * a gentle generative score is synthesised live with the Web Audio API:
 * warm string-like pads under a slow, sparse felt-piano arpeggio, through
 * a long hall reverb. Audio only starts after a user gesture.
 */
export class Ambience {
  constructor() {
    this.muted = false;
    this.started = false;
    this.volume = 0.32;
  }

  async start() {
    if (this.started) return;
    this.started = true;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = (this.ctx = new Ctx());
    // a scroll or swipe doesn't count as a user gesture for audio — wait for the next tap/click/key
    if (ctx.state !== 'running') {
      ctx.resume().catch(() => {});
      const unlock = () => {
        ctx.resume().catch(() => {});
        if (this.el && !this.muted) this.el.play().catch(() => {});
        if (ctx.state === 'running') ['pointerdown', 'touchend', 'keydown'].forEach((t) => window.removeEventListener(t, unlock, true));
      };
      ['pointerdown', 'touchend', 'keydown'].forEach((t) => window.addEventListener(t, unlock, true));
    }

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(4.2, 2.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.reverb.connect(wet).connect(this.master);
    this.dry = ctx.createGain();
    this.dry.gain.value = 0.6;
    this.dry.connect(this.master);

    const file = await this.tryFile();
    if (!file) this.startScore();
    this.fadeTo(this.muted ? 0 : this.volume, 4);
  }

  async tryFile() {
    try {
      const url = `${import.meta.env.BASE_URL}audio/music.mp3`;
      const res = await fetch(url, { method: 'HEAD' });
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !type.startsWith('audio')) return false;
      const el = new Audio(url);
      el.loop = true;
      el.crossOrigin = 'anonymous';
      const src = this.ctx.createMediaElementSource(el);
      src.connect(this.dry);
      src.connect(this.reverb);
      this.el = el;
      el.play().catch(() => {}); // may wait for a tap if we entered by scrolling
      return true;
    } catch {
      return false;
    }
  }

  impulse(seconds, decay) {
    const { ctx } = this;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  fadeTo(v, time = 1.2) {
    if (!this.master) return;
    const g = this.master.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(v, now + time);
  }

  toggle() {
    this.muted = !this.muted;
    if (this.started) this.fadeTo(this.muted ? 0 : this.volume, 0.8);
    if (this.el) this.muted ? this.el.pause() : this.el.play().catch(() => {});
    return this.muted;
  }

  /* ---------------------------------------------------------- the score */
  startScore() {
    const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
    // Dmaj9 – Bm9 – Gmaj7 – A(sus)  : tender and unresolved
    this.chords = [
      [50, 57, 62, 66, 69, 76],
      [47, 54, 62, 66, 69, 73],
      [43, 50, 59, 62, 66, 71],
      [45, 52, 57, 62, 64, 69],
    ].map((c) => c.map(midi));
    this.bar = 0;
    this.beat = 0;
    this.chordLen = 8; // seconds per chord
    this.next = this.ctx.currentTime + 0.1;
    this.nextNote = this.next + 1.5;
    this.timer = setInterval(() => this.schedule(), 200);
  }

  schedule() {
    const { ctx } = this;
    while (this.next < ctx.currentTime + 1) {
      const chord = this.chords[this.bar % this.chords.length];
      this.pad(chord.slice(0, 4), this.next, this.chordLen + 3);
      this.chordStart = this.next;
      this.currentChord = chord;
      this.next += this.chordLen;
      this.bar++;
    }
    while (this.currentChord && this.nextNote < ctx.currentTime + 1) {
      const c = this.currentChord;
      const pool = [c[2] * 2, c[3] * 2, c[4] * 2, c[5] * 2, c[3], c[4] * 4];
      if (Math.random() > 0.22) {
        const f = pool[Math.floor(Math.random() * pool.length)];
        this.piano(f, this.nextNote, 0.12 + Math.random() * 0.08);
      }
      this.nextNote += [0.75, 0.75, 1.5, 0.5][Math.floor(Math.random() * 4)];
    }
  }

  pad(freqs, t, dur) {
    const { ctx } = this;
    const out = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    lp.Q.value = 0.4;
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.07, t + 2.8);
    out.gain.setValueAtTime(0.07, t + dur - 3.5);
    out.gain.linearRampToValueAtTime(0, t + dur);
    lp.connect(out);
    out.connect(this.dry);
    out.connect(this.reverb);
    for (const f of freqs) {
      for (const det of [-6, 5]) {
        const o = ctx.createOscillator();
        o.type = det < 0 ? 'sawtooth' : 'triangle';
        o.frequency.value = f;
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.value = o.type === 'sawtooth' ? 0.12 : 0.35;
        o.connect(g).connect(lp);
        o.start(t);
        o.stop(t + dur + 0.1);
      }
    }
  }

  piano(f, t, vel) {
    const { ctx } = this;
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(700, t + 2.5);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.008);
    g.gain.exponentialRampToValueAtTime(vel * 0.3, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
    g.connect(lp);
    lp.connect(this.dry);
    lp.connect(this.reverb);
    for (const [mult, amp, type] of [[1, 1, 'sine'], [2, 0.32, 'sine'], [3, 0.12, 'triangle'], [1.002, 0.4, 'triangle']]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * mult;
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + 3.8);
    }
  }

  /** A rising, shimmering flourish for the "yes" moment. */
  celebrate() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + 0.05;
    const notes = [62, 66, 69, 74, 78, 81, 86, 90].map((n) => 440 * Math.pow(2, (n - 69) / 12));
    notes.forEach((f, i) => this.piano(f, t + i * 0.11, 0.16));
    this.pad([146.83, 220, 293.66, 369.99], t, 9);
  }
}
