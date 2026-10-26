# Skyward ✈️

A mobile-first **PWA flight exploration game**. Fly a glider over an endless procedurally
generated low-poly world, discover landmarks, collect orbs, and unlock faster gliders.
No build step, no backend — pure vanilla JS + Three.js, installable and fully playable
offline.

**Play:** https://itsnotalwin.github.io/skyward/

## Features

- 🌍 **Endless procedural world** — seeded noise terrain with biomes: oceans, beaches,
  grassland, desert, cliffs, and snow-capped mountains
- 🕹️ **Mobile-first controls** — left-thumb virtual joystick to steer, hold the right
  side to boost; full keyboard fallback on desktop
- ✨ **Discoveries** — crystals, ruins, giant trees, floating islands and fly-through
  boost rings, each with a procedurally generated name, logged in your journal
- ✦ **Collectible orbs** that unlock 4 gliders with different speed and boost stats
- 🌅 **Day/night cycle** with gradient sky dome, stars, and matching fog
- 💾 **Persistent progress** in localStorage — discoveries, orbs, best distance & altitude
- 📲 **Installable PWA** — add to home screen, plays offline via service worker
- 🔊 Procedural Web Audio (wind, chimes) — zero audio assets

## Controls

| Action | Touch | Keyboard |
|---|---|---|
| Turn | drag left side ← / → | `A` / `D` or arrows |
| Climb / dive | drag left side ↑ / ↓ (flight-stick: drag down = climb) | `S` = climb, `W` = dive |
| Boost | hold right side | `Shift` |
| Pause | ⏸ button | `Esc` / `P` |

## Run locally

Needs any static file server (ES modules + service worker don't work from `file://`):

```
npx serve .
# or
python -m http.server
```

Then open http://localhost:8000.

## Deploy

GitHub Pages serves the `main` branch from the repo root — every push to `main` is live.
If you bump asset URLs, bump `CACHE` in `sw.js` so clients pick up the new version.

## Structure

```
index.html          app shell + import map
manifest.json       PWA manifest
sw.js               offline cache (cache-first)
css/style.css       HUD / menus, safe-area aware, dvh units
js/main.js          scene, game loop, day/night, state machine
js/terrain.js       seeded noise, heightfield, chunk streaming, water
js/player.js        flight model, glider mesh, skins
js/controls.js      touch joystick + boost, keyboard
js/discoveries.js   landmarks, orbs, rings, journal data
js/ui.js            HUD, minimap, menus, journal, settings, install prompt
js/audio.js         procedural wind + chimes
js/save.js          localStorage persistence
vendor/             three.module.min.js (vendored for offline)
tools/make-icons.ps1 regenerates the icon set
```

## Roadmap

- [ ] Photo mode / screenshots of discoveries
- [ ] Weather (wind currents, thermals)
- [ ] Clouds to fly through
- [ ] Optional cloud-sync backend (leaderboards) via a tiny Worker

## License

MIT
