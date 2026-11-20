# Our Forever — a cinematic 3D proposal

A scroll-driven love story told in one continuous 3D world: the camera walks
from the doors of a candlelit restaurant, down the aisle, to a table set for
two, through a love letter, and finally into a velvet ring box.

Built with **Three.js**, **GSAP + ScrollTrigger**, **Lenis** and **Vite**.
Every model and texture is generated in code (no downloads), so it loads fast
and works offline once the fonts are cached.

## Run it

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # static site in dist/ — upload anywhere
npm run preview   # serve the built site locally
```

## Make it yours

| What | Where |
| --- | --- |
| Intro, captions, proposal and finale text | `index.html` |
| The handwritten letter (greeting, body, sign-off) | `letterTexture()` in `src/world/textures.js` |
| Your own song | drop an mp3 at `public/audio/music.mp3`; otherwise a gentle piano-and-strings score is synthesised live |
| Camera shots / pacing | `SHOTS` and the timeline in `src/story/story.js` |
| Colours & typography | CSS variables at the top of `src/styles.css` |

## How it's organised

```
src/
  main.js            boot, loader, intro, door entry, celebration, replay
  story/story.js     the camera path + scroll timeline (all six scenes)
  world/World.js     renderer, lights, mood, camera rig, render loop
  world/entrance.js  facade, carved double doors, fanlight, rose urns
  world/restaurant.js  dining room (instanced tables, chandeliers, drapes)
  world/heroTable.js the special table: settings, wine, candles, petals
  world/envelope.js  envelope + letter (lift, open, slide, unfold)
  world/ringBox.js   velvet box, solitaire ring, diamond sparkles
  world/props.js     roses, candles, glassware, chairs, chandeliers…
  world/particles.js rose petals, golden motes, sparkles
  world/flame.js     candle flame shader
  world/post.js      bloom + film grade
  ui/                audio, fireworks, cursor
```

Mobile gets a lower pixel ratio, fewer particles and smaller shadow maps, and
the camera widens its field of view in portrait so every shot still frames.
