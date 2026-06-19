# 🚀 Cosmic Typing Quest

A keyboard-only, educational **space typing game** for kids — built with plain
HTML5, CSS, and JavaScript (no build step, no dependencies). It teaches
**letter recognition, spelling, vocabulary, and typing** across three difficulty
levels, with spoken words and arcade-style sound effects.

Made for three kids (ages 4, 7, and 9) — but great for any beginning reader.

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
   - 🚀 **Rocket Fuel** — type words to fuel your rocket and fly to a real NASA planet.
   - 🌟 **Star Rescue** — type the words on floating stars to beam them aboard.

You have a row of ❤️ **lives** — typing the wrong letter too many times ends the
run (with a friendly "play again" screen). Younger levels get more lives (Easy 5,
Medium 4, Hard 3), and every completed word sets off a **big confetti burst** 🎉.
There's gentle background **music** and spoken words throughout.

### Keys
- **Letters / Space** — type the target words.
- **← → ↑ ↓** + **Enter** (or number keys / mouse) — navigate menus.
- **Esc** — back to the previous screen.
- **M** — mute / unmute sound (works in menus; during a game use the 🔊 button,
  since *M* is also a letter you might be spelling). The 🔊 button always works.

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
  engine.js         Canvas, starfield, particles, scene loop
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
