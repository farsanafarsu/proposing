/**
 * Elegant 2D fireworks overlay — gold, champagne, ivory and rose bursts
 * (some heart-shaped) with fading trails. Drawn on a transparent canvas
 * above the WebGL stage.
 */
const COLORS = ['#e6c793', '#c49a65', '#f4e8dc', '#ffd9a0', '#d4485f', '#f08aa0'];

export class Fireworks {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.rockets = [];
    this.sparks = [];
    this.running = false;
    this.launching = false;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio, 2);
    this.w = innerWidth;
    this.h = innerHeight;
    this.canvas.width = this.w * this.dpr;
    this.canvas.height = this.h * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  start(duration = 14) {
    this.launching = true;
    this.endAt = performance.now() + duration * 1000;
    this.nextLaunch = 0;
    // opening volley
    for (let i = 0; i < 4; i++) setTimeout(() => this.launch(), i * 260);
    if (!this.running) {
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame((t) => this.loop(t));
    }
  }

  stop() {
    this.launching = false;
  }

  launch(x = this.w * (0.15 + Math.random() * 0.7)) {
    this.rockets.push({
      x,
      y: this.h + 10,
      vx: (Math.random() - 0.5) * 60,
      vy: -(this.h * (0.75 + Math.random() * 0.35)),
      targetY: this.h * (0.14 + Math.random() * 0.32),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      heart: Math.random() < 0.3,
    });
  }

  explode(r) {
    const n = r.heart ? 90 : 70 + Math.floor(Math.random() * 50);
    const speed = Math.min(this.w, this.h) * (0.28 + Math.random() * 0.12);
    const alt = COLORS[Math.floor(Math.random() * COLORS.length)];
    for (let i = 0; i < n; i++) {
      let vx;
      let vy;
      if (r.heart) {
        const t = (i / n) * Math.PI * 2;
        vx = 16 * Math.pow(Math.sin(t), 3);
        vy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        vx *= speed / 17;
        vy *= speed / 17;
      } else {
        const a = Math.random() * Math.PI * 2;
        const s = speed * (0.35 + Math.random() * 0.65);
        vx = Math.cos(a) * s;
        vy = Math.sin(a) * s;
      }
      this.sparks.push({
        x: r.x,
        y: r.y,
        vx,
        vy,
        life: 1,
        decay: 0.38 + Math.random() * 0.35,
        color: Math.random() < 0.7 ? r.color : alt,
        size: 1.4 + Math.random() * 2.2,
        twinkle: Math.random() < 0.4,
      });
    }
  }

  loop(now) {
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    const { ctx } = this;

    // fade previous frame → soft trails on a transparent canvas
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.globalCompositeOperation = 'lighter';

    if (this.launching) {
      if (now > this.endAt) this.launching = false;
      this.nextLaunch -= dt;
      if (this.nextLaunch <= 0) {
        this.launch();
        this.nextLaunch = 0.45 + Math.random() * 0.9;
      }
    }

    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.vy *= 0.985;
      ctx.fillStyle = '#ffe9c4';
      ctx.beginPath();
      ctx.arc(r.x, r.y, 1.6, 0, Math.PI * 2);
      ctx.fill();
      if (r.y <= r.targetY || r.vy > -60) {
        this.explode(r);
        this.rockets.splice(i, 1);
      }
    }

    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.vx *= 0.965;
      s.vy = s.vy * 0.965 + 70 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= s.decay * dt;
      if (s.life <= 0) {
        this.sparks.splice(i, 1);
        continue;
      }
      const a = s.twinkle ? s.life * (0.5 + 0.5 * Math.sin(now * 0.04 + i)) : s.life;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * (0.6 + s.life * 0.6), 0, Math.PI * 2);
      ctx.fill();
      // soft glow halo
      ctx.globalAlpha = Math.max(0, a) * 0.18;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (this.launching || this.rockets.length || this.sparks.length) {
      requestAnimationFrame((t) => this.loop(t));
    } else {
      this.running = false;
      ctx.clearRect(0, 0, this.w, this.h);
    }
  }
}
