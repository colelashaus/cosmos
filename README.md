# 🚀 Cosmic Typing Quest

A keyboard-only, educational **space typing game** for kids — built with plain
HTML5, CSS, and JavaScript (no build step, no dependencies). It teaches
**letter recognition, spelling, vocabulary, and typing** across three difficulty
levels, with spoken words and arcade-style sound effects.

Made for three kids (ages 4, 7, and 9) — but great for any beginning reader.

A **3D background layer** (Three.js, bundled locally) wraps the NASA images onto
real rotating planet spheres, with a warp-speed starfield during launches. It
degrades gracefully: if WebGL isn't available, the game falls back to a 2D
starfield and plays exactly the same.

---

## 🎮 How to play

1. **Intro screen** → press **Enter** or **Space**.
2. **Choose a level:**
   | Level | Best for | What you do |
   |-------|----------|-------------|
   | 🐣 **Easy** | ages 3–5 | Press the single **letter** you see (with a picture + spoken cue) |
   | 🚀 **Medium** | ages 6–8 | Type **short words** (`STAR`, `MOON`, `CAT`) |
   | 🛰️ **Hard** | ages 9+ | Type **long words & phrases** (`ASTEROID`, `BLAST OFF`) |
3. **Choose a mission:**
   - ☄️ **Asteroid Defense** — type the words on falling asteroids to blast them.
     Every **5-streak** drops a 💣 **NUKE** — type it to clear the whole screen!
   - 🚀 **Rocket Fuel** — type words to fuel your rocket, then enjoy a cinematic
     **3-2-1 blast-off** (countdown, sprite exhaust & smoke, shockwaves, warp-speed
     stars) as you fly to a real NASA planet.
   - 🌟 **Star Rescue** — type the words on floating stars to beam them aboard.

**Easy and Medium are endless** — a wrong letter is just a gentle buzz, so younger
players never get stuck. **Hard** adds a row of ❤️ **lives** (3): too many wrong
letters ends the run (with a friendly "play again" screen). Every completed word
sets off a **big confetti burst** 🎉, and there's gentle background **music** and
spoken words throughout.

### Keys
- **Letters / Space** — type the target words.
- **← → ↑ ↓** + **Enter** (or number keys / mouse) — navigate menus.
- **Esc** — back to the previous screen.

---

## 💻 Run it locally

It's just static files, so any web server works. From this folder:

```bash
# Python 3
python -m http.server 8000
# then open http://localhost:8000
```

> Open via `http://` (not by double-clicking the file) so the browser can load
> the NASA images and speech voices reliably.

---

## ☁️ Deploy to Render.com (free)

This is a **Static Site**, so hosting is free and there's no server to manage.

1. Push this folder to a GitHub repo (see below).
2. On [Render](https://render.com): **New → Static Site**.
3. Connect your GitHub repo.
4. Settings:
   - **Build Command:** *(leave empty)*
   - **Publish Directory:** `.`
5. Click **Create Static Site**. Render gives you a public URL.

A `render.yaml` blueprint is included, so you can alternatively choose
**New → Blueprint** and Render will read the settings automatically.

---

## 📁 Project structure

```
index.html          Page shell
styles.css          Menus & layout
js/
  data.js           Word lists, difficulty tuning, asset list
  audio.js          WebAudio sound effects + browser speech
  engine.js         2D canvas, starfield, particles, scene loop
  sprites.js        Sprite/particle engine (rocket, exhaust, smoke)
  three3d.js        3D background layer: NASA-textured planets + warp starfield
  vendor/three.min.js  Three.js (bundled locally — no CDN at runtime)
  menus.js          Intro + difficulty + mission screens
  games.js          The three mini-games
  main.js           Boot + navigation
assets/images/      NASA public-domain images (see CREDITS.md)
```

## 🖼️ Image credits

Planet, moon, and nebula images are public-domain works courtesy of **NASA/JPL**.
See [CREDITS.md](CREDITS.md). The game also works fine if any image is missing —
it falls back to drawn artwork.

## 🔊 Audio note

There are **no audio files**. Sound effects are synthesized in the browser with
the Web Audio API, and words are read aloud with the browser's built-in
Speech Synthesis. (Voices vary by browser/OS; Chrome and Edge work great.)
