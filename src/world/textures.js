import * as THREE from 'three';

/**
 * Procedural canvas textures — no external image assets needed.
 * Every generator returns a THREE.CanvasTexture ready for PBR materials.
 */

let maxAniso = 4;
export function setMaxAnisotropy(v) {
  maxAniso = v;
}

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, { repeat = [1, 1], srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = maxAniso;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

// Small deterministic PRNG so textures look identical on every load
function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ wood */
export function woodTexture({ size = 512, base = '#2a120b', grain = '#140704', seed = 3, repeat = [1, 1] } = {}) {
  const [c, g] = canvas(size);
  const r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 220; i++) {
    const x = r() * size;
    const w = 0.5 + r() * 2.5;
    g.strokeStyle = grain;
    g.globalAlpha = 0.08 + r() * 0.25;
    g.lineWidth = w;
    g.beginPath();
    let px = x;
    g.moveTo(px, 0);
    for (let y = 0; y <= size; y += 16) {
      px += (r() - 0.5) * 3;
      g.lineTo(px + Math.sin(y * 0.02 + x) * 3, y);
    }
    g.stroke();
  }
  // warm highlights
  g.globalAlpha = 0.06;
  g.fillStyle = '#8a4a26';
  for (let i = 0; i < 30; i++) g.fillRect(r() * size, 0, 1 + r() * 8, size);
  g.globalAlpha = 1;
  return toTexture(c, { repeat });
}

/* ---------------------------------------------------- burgundy damask wall */
export function damaskTexture({ size = 512, repeat = [6, 2] } = {}) {
  const [c, g] = canvas(size);
  const grd = g.createLinearGradient(0, 0, 0, size);
  grd.addColorStop(0, '#3b0a16');
  grd.addColorStop(1, '#2a0610');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);

  const motif = (cx, cy, s) => {
    g.save();
    g.translate(cx, cy);
    g.scale(s, s);
    g.strokeStyle = 'rgba(196,154,101,0.16)';
    g.fillStyle = 'rgba(100,22,41,0.55)';
    g.lineWidth = 2;
    // central medallion: mirrored acanthus curls
    for (const m of [1, -1]) {
      g.save();
      g.scale(m, 1);
      g.beginPath();
      g.moveTo(0, -110);
      g.bezierCurveTo(60, -90, 70, -30, 25, -10);
      g.bezierCurveTo(70, 10, 80, 70, 0, 110);
      g.bezierCurveTo(20, 60, 10, 20, 0, 0);
      g.closePath();
      g.fill();
      g.stroke();
      g.beginPath();
      g.arc(40, -55, 16, 0, Math.PI * 1.6);
      g.stroke();
      g.beginPath();
      g.arc(42, 55, 12, Math.PI, Math.PI * 2.6);
      g.stroke();
      g.restore();
    }
    g.beginPath();
    g.ellipse(0, 0, 10, 26, 0, 0, Math.PI * 2);
    g.fillStyle = 'rgba(196,154,101,0.12)';
    g.fill();
    g.restore();
  };
  motif(size / 2, size / 2, 1.6);
  motif(0, 0, 1.6);
  motif(size, 0, 1.6);
  motif(0, size, 1.6);
  motif(size, size, 1.6);

  // fabric noise
  const r = rng(11);
  const img = g.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 14;
    img.data[i] += n;
    img.data[i + 1] += n * 0.5;
    img.data[i + 2] += n * 0.5;
  }
  g.putImageData(img, 0, 0);
  return toTexture(c, { repeat });
}

/* ------------------------------------------------------- dark marble floor */
export function marbleTexture({ size = 1024, repeat = [4, 16] } = {}) {
  const [c, g] = canvas(size);
  const r = rng(7);
  const tiles = 2;
  const ts = size / tiles;
  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) {
      const dark = (x + y) % 2 === 0;
      g.fillStyle = dark ? '#0e0406' : '#2a0b12';
      g.fillRect(x * ts, y * ts, ts, ts);
      // veins
      for (let v = 0; v < 7; v++) {
        g.strokeStyle = dark ? 'rgba(196,154,101,0.12)' : 'rgba(244,232,220,0.07)';
        g.lineWidth = 0.6 + r() * 1.6;
        g.beginPath();
        let px = x * ts + r() * ts;
        let py = y * ts;
        g.moveTo(px, py);
        while (py < (y + 1) * ts) {
          px += (r() - 0.5) * 40;
          py += 10 + r() * 30;
          g.lineTo(Math.min(Math.max(px, x * ts), (x + 1) * ts), py);
        }
        g.stroke();
      }
    }
  }
  // gold grout lines
  g.strokeStyle = 'rgba(196,154,101,0.45)';
  g.lineWidth = 3;
  for (let i = 0; i <= tiles; i++) {
    g.beginPath();
    g.moveTo(i * ts, 0);
    g.lineTo(i * ts, size);
    g.moveTo(0, i * ts);
    g.lineTo(size, i * ts);
    g.stroke();
  }
  return toTexture(c, { repeat });
}

/* -------------------------------------------- velvet fibre (roughness/bump) */
export function velvetTexture({ size = 256, repeat = [2, 2] } = {}) {
  const [c, g] = canvas(size);
  const r = rng(5);
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = 150 + (r() - 0.5) * 90;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // soft crush marks
  g.globalAlpha = 0.08;
  for (let i = 0; i < 40; i++) {
    g.fillStyle = r() > 0.5 ? '#fff' : '#000';
    g.beginPath();
    g.ellipse(r() * size, r() * size, 10 + r() * 40, 4 + r() * 10, r() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  return toTexture(c, { repeat, srgb: false });
}

/* --------------------------------------------------- linen tablecloth weave */
export function linenTexture({ size = 256, repeat = [9, 9], color = '#efe3d3' } = {}) {
  const [c, g] = canvas(size);
  g.fillStyle = color;
  g.fillRect(0, 0, size, size);
  const r = rng(9);
  g.globalAlpha = 0.035;
  for (let i = 0; i < size; i += 2) {
    g.fillStyle = r() > 0.5 ? '#000' : '#fff';
    g.fillRect(0, i, size, 1);
    g.fillStyle = r() > 0.5 ? '#000' : '#fff';
    g.fillRect(i, 0, 1, size);
  }
  g.globalAlpha = 1;
  return toTexture(c, { repeat });
}

/* -------------------------------------------------------- envelope paper */
export function paperTexture({ w = 512, h = 512, tint = '#efe2cf', seed = 21 } = {}) {
  const [c, g] = canvas(w, h);
  g.fillStyle = tint;
  g.fillRect(0, 0, w, h);
  const r = rng(seed);
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 12;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n * 0.8;
  }
  g.putImageData(img, 0, 0);
  // vignette like aged paper
  const grd = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(1, 'rgba(120,80,40,0.25)');
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  return [c, g];
}

/** The love letter itself, written in a handwritten script. */
export function letterTexture() {
  const W = 1024;
  const H = 1400;
  const [c, g] = paperTexture({ w: W, h: H, tint: '#f3e7d6', seed: 33 });

  // gold border
  g.strokeStyle = 'rgba(160,118,64,0.8)';
  g.lineWidth = 3;
  g.strokeRect(46, 46, W - 92, H - 92);
  g.lineWidth = 1;
  g.strokeRect(60, 60, W - 120, H - 120);

  const ink = '#4a0f1c';
  g.fillStyle = ink;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';

  g.font = '92px "Great Vibes", "Snell Roundhand", cursive';
  g.fillText('My love,', 130, 260);

  const body =
    'From the moment you came into my life, everything started feeling a little more beautiful.';
  g.font = '80px "Great Vibes", "Snell Roundhand", cursive';
  const lines = wrap(g, body, W - 260);
  let y = 440;
  for (const line of lines) {
    g.fillText(line, 130, y);
    y += 112;
  }

  g.textAlign = 'right';
  g.font = '76px "Great Vibes", "Snell Roundhand", cursive';
  g.fillText('Forever yours', W - 130, H - 250);

  // tiny heart flourish
  g.save();
  g.translate(W - 175, H - 165);
  g.scale(1.3, 1.3);
  g.beginPath();
  g.moveTo(0, 12);
  g.bezierCurveTo(-20, -2, -12, -18, 0, -8);
  g.bezierCurveTo(12, -18, 20, -2, 0, 12);
  g.fillStyle = '#8c1d33';
  g.fill();
  g.restore();

  // crease across the middle (where it was folded)
  const grd = g.createLinearGradient(0, H / 2 - 18, 0, H / 2 + 18);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(0.5, 'rgba(90,60,30,0.16)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, H / 2 - 18, W, 36);

  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function wrap(g, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export function envelopeTexture() {
  const [c, g] = paperTexture({ w: 512, h: 360, tint: '#e9dac3', seed: 41 });
  g.strokeStyle = 'rgba(150,110,60,0.5)';
  g.lineWidth = 2;
  g.strokeRect(14, 14, 484, 332);
  g.fillStyle = '#5a1222';
  g.font = 'italic 34px "Great Vibes", cursive';
  g.textAlign = 'center';
  g.fillText('For you', 256, 200);
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/* ------------------------------------------------- glow / sprite textures */
export function radialTexture({ size = 128, stops = [[0, 'rgba(255,220,160,1)'], [1, 'rgba(255,160,60,0)']] } = {}) {
  const [c, g] = canvas(size);
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) grd.addColorStop(o, col);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function sparkleTexture(size = 128) {
  const [c, g] = canvas(size);
  const m = size / 2;
  const grd = g.createRadialGradient(m, m, 0, m, m, m);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.12, 'rgba(255,245,220,0.9)');
  grd.addColorStop(0.35, 'rgba(255,220,170,0.12)');
  grd.addColorStop(1, 'rgba(255,200,150,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  // four-point star rays
  g.globalCompositeOperation = 'lighter';
  for (const a of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) {
    g.save();
    g.translate(m, m);
    g.rotate(a);
    const long = a % (Math.PI / 2) === 0;
    const ray = g.createLinearGradient(-m, 0, m, 0);
    ray.addColorStop(0, 'rgba(255,255,255,0)');
    ray.addColorStop(0.5, `rgba(255,250,235,${long ? 0.95 : 0.4})`);
    ray.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = ray;
    const len = long ? m : m * 0.55;
    g.fillRect(-len, -1.2, len * 2, 2.4);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Rose petal colour map with a darker base and velvety veins. */
export function petalTexture(size = 256) {
  const [c, g] = canvas(size);
  const grd = g.createLinearGradient(0, size, 0, 0);
  grd.addColorStop(0, '#3a0510');
  grd.addColorStop(0.45, '#8a0f24');
  grd.addColorStop(0.85, '#b51a32');
  grd.addColorStop(1, '#6e0b1d');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const r = rng(13);
  g.globalAlpha = 0.12;
  g.strokeStyle = '#2a0309';
  for (let i = 0; i < 26; i++) {
    g.lineWidth = 0.5 + r() * 1.2;
    g.beginPath();
    const x = size / 2 + (r() - 0.5) * size * 0.2;
    g.moveTo(x, size);
    g.quadraticCurveTo(x + (r() - 0.5) * size, size * 0.5, r() * size, 0);
    g.stroke();
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
