/* ============================================================
   Games — three keyboard-only mini-games:
     • Asteroid Defense  (type words on descending asteroids)
     • Star Rescue       (type words on floating stars)
     • Rocket Fuel       (type words to fuel + fly to NASA planets)
   All modes are ENDLESS (no game over) so younger players never
   get stuck. Esc returns to the mission select screen.
   ============================================================ */
window.CTQ = window.CTQ || {};

CTQ.games = (function () {
  const E = CTQ.engine;
  const A = CTQ.audio;
  const D = CTQ.data;

  function isTypeable(key) {
    return key === " " || /^[a-zA-Z]$/.test(key);
  }
  function norm(key) {
    return key === " " ? " " : key.toUpperCase();
  }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr, not) {
    let x;
    do { x = arr[Math.floor(Math.random() * arr.length)]; } while (arr.length > 1 && x === not);
    return x;
  }

  // ---------- Shared HUD ----------
  function drawHUD(ctx, info) {
    const W = E.W;
    ctx.save();
    // top bar
    ctx.fillStyle = "rgba(5,3,15,0.55)";
    ctx.fillRect(0, 0, W, 56);
    ctx.textBaseline = "middle";

    ctx.textAlign = "left";
    ctx.font = "800 22px " + FONT;
    ctx.fillStyle = "#9fd9ff";
    ctx.fillText(info.title, 70, 28);

    ctx.font = "700 16px " + FONT;
    ctx.fillStyle = "#bcd2ff";
    ctx.fillText("Level: " + info.diff, 70, 48);

    ctx.textAlign = "right";
    ctx.font = "900 26px " + FONT;
    ctx.fillStyle = "#ffe45a";
    ctx.fillText("⭐ " + info.score, W - 18, 24);
    if (info.extra) {
      ctx.font = "700 15px " + FONT;
      ctx.fillStyle = "#9fb6dd";
      ctx.fillText(info.extra, W - 18, 46);
    }

    // Lives (hearts) — centered at the top
    if (info.maxLives) {
      ctx.textAlign = "center";
      ctx.font = "24px " + FONT;
      let hearts = "";
      for (let i = 0; i < info.maxLives; i++) hearts += i < info.lives ? "❤️" : "🖤";
      ctx.fillText(hearts, W / 2, 28);
    }
    ctx.restore();
  }
  const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

  function drawBackHint(ctx) {
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = "700 14px " + FONT;
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText("Esc ← Menu", 14, 28);
    ctx.restore();
  }

  // Draws the typing label on a target, highlighting progress.
  // A dark rounded backdrop sits behind the text so it stays readable on
  // any colour body (e.g. the bright yellow rescue stars).
  function drawLabel(ctx, target, big) {
    const { x, y, text, typed } = target;
    if (target.emoji) {
      // EASY mode: emoji above, big letter below
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = (big ? 64 : 48) + "px " + FONT;
      ctx.fillText(target.emoji, x, y - 6);
      const ly = y + (big ? 58 : 46);
      const lp = big ? 56 : 44;
      ctx.fillStyle = "rgba(5,3,15,0.55)";
      E.roundRect(ctx, x - lp / 2, ly - lp / 2, lp, lp, 12);
      ctx.fill();
      ctx.font = "900 " + (big ? 70 : 54) + "px " + FONT;
      ctx.fillStyle = typed > 0 ? "#5bff9b" : "#ffffff";
      ctx.fillText(text, x, ly + 2);
      return;
    }
    // WORD mode: highlight typed prefix in green, next letter glowing
    ctx.textBaseline = "middle";
    const fontPx = big ? 40 : 28;
    ctx.font = "900 " + fontPx + "px " + FONT;
    const full = text;
    const w = ctx.measureText(full).width;
    // backdrop pill for contrast
    const padX = 14, h = fontPx + 14;
    ctx.fillStyle = "rgba(5,3,15,0.6)";
    E.roundRect(ctx, x - w / 2 - padX, y - h / 2, w + padX * 2, h, h / 2);
    ctx.fill();

    let cx = x - w / 2;
    ctx.textAlign = "left";
    for (let i = 0; i < full.length; i++) {
      const ch = full[i];
      const cw = ctx.measureText(ch).width;
      if (i < typed) ctx.fillStyle = "#5bff9b";
      else if (i === typed) ctx.fillStyle = "#ffe45a";
      else ctx.fillStyle = "#ffffff";
      ctx.fillText(ch, cx, y);
      cx += cw;
    }
    ctx.textAlign = "center";
  }

  // ============================================================
  //  TARGET GAME  (asteroid = descending, rescue = floating)
  // ============================================================
  function createTargetGame(diffKey, mode, onBack, onDead) {
    const cfg = D.DIFFICULTY[diffKey];
    const pool = D.getPool(cfg.pool);
    const descend = mode === "asteroid";
    const title = descend ? "Asteroid Defense ☄️" : "Star Rescue 🌟";

    let targets = [];
    let active = null;
    let score = 0, hits = 0, streak = 0, best = 0;
    let spawnT = 0;
    let lastText = null;
    let shake = 0;
    let groundFlash = 0;
    let lives = cfg.lives;
    let over = false;

    function spawn() {
      const item = pick(pool, lastText && { text: lastText });
      // pick avoiding identical text to previous
      let it = item;
      let guard = 0;
      while (lastText && it.text === lastText && guard++ < 6) it = pool[Math.floor(Math.random() * pool.length)];
      lastText = it.text;

      const margin = 90;
      const t = {
        text: it.text,
        emoji: it.emoji,
        speak: it.speak,
        typed: 0,
        rot: rand(0, Math.PI * 2),
        rotV: rand(-0.6, 0.6),
        size: it.emoji ? 0 : Math.max(34, it.text.length * 7),
        exploding: 0,
        collecting: 0,
        dead: false,
      };
      if (descend) {
        t.x = rand(margin, E.W - margin);
        t.y = -40;
        t.vx = rand(-8, 8);
        t.vy = cfg.fallSpeed * rand(0.85, 1.15);
      } else {
        t.x = rand(margin, E.W - margin);
        t.y = rand(120, E.H - 140);
        const a = rand(0, Math.PI * 2);
        t.vx = Math.cos(a) * cfg.driftSpeed;
        t.vy = Math.sin(a) * cfg.driftSpeed;
      }
      targets.push(t);
      if (cfg.speakOnSpawn) A.speak(it.speak);
    }

    function destroy(t) {
      t.dead = true;
      const pts = (cfg.key === "easy" ? 5 : cfg.key === "medium" ? 10 : 15);
      score += pts;
      hits++; streak++; best = Math.max(best, streak);
      E.popup(t.x, t.y, "+" + pts, "#5bff9b");
      // Big celebratory confetti on every completed word/letter!
      E.confetti(t.x, t.y);
      if (descend) {
        A.sfx.explode();
        E.burst(t.x, t.y, "#ffb05a", 26, 260);
      } else {
        A.sfx.collect();
        E.burst(t.x, t.y, "#5ad7ff", 20, 200);
      }
      // Reinforce spelling: speak the word on success (medium/hard).
      if (cfg.key !== "easy") A.speak(t.speak);
      if (streak > 0 && streak % 5 === 0) { A.sfx.fanfare(); E.popup(E.W / 2, E.H / 2, "Streak " + streak + "! 🎉", "#ffe45a"); }
      active = null;
    }

    // A wrong keystroke costs a life; running out ends the game.
    function loseLife() {
      if (over) return;
      lives--;
      streak = 0;
      shake = 0.3;
      A.sfx.hurt();
      if (lives <= 0) {
        lives = 0;
        over = true;
        A.sfx.gameover();
        if (onDead) onDead(score);
      }
    }

    function onKey(e) {
      if (e.key === "Escape") { onBack(); return; }
      if (over || !isTypeable(e.key)) return;
      const key = norm(e.key);

      if (!active) {
        // Choose a target whose next-needed char matches. Prefer the most urgent.
        const candidates = targets.filter((t) => !t.dead && !t.exploding && t.text[t.typed] === key);
        if (!candidates.length) { loseLife(); return; }
        candidates.sort((a, b) => (descend ? b.y - a.y : a.text.length - b.text.length));
        active = candidates[0];
      }
      const expected = active.text[active.typed];
      if (key === expected) {
        active.typed++;
        A.sfx.zap();
        E.burst(active.x, active.y, "#ffe45a", 4, 90);
        if (active.typed >= active.text.length) destroy(active);
      } else {
        loseLife();
      }
    }

    return {
      enter() {
        targets = []; active = null; score = 0; hits = 0; streak = 0;
        lives = cfg.lives; over = false;
        spawnT = 0.6;
        CTQ.state.typing = true;
        // seed a couple for rescue so the screen isn't empty
        if (!descend) { spawn(); if (cfg.maxTargets > 1) spawn(); }
      },
      exit() { CTQ.state.typing = false; },
      onKey,
      update(dt) {
        if (shake > 0) shake = Math.max(0, shake - dt);
        if (groundFlash > 0) groundFlash = Math.max(0, groundFlash - dt);

        spawnT -= dt;
        const alive = targets.filter((t) => !t.dead);
        if (spawnT <= 0 && alive.length < cfg.maxTargets) {
          spawn();
          spawnT = cfg.spawnEvery * rand(0.8, 1.2);
        }

        for (const t of targets) {
          if (t.dead) continue;
          t.x += t.vx * dt;
          t.y += t.vy * dt;
          t.rot += t.rotV * dt;
          if (descend) {
            if (t.y > E.H - 30) {
              // Reached the ground — gentle, no penalty (endless mode).
              t.dead = true;
              if (active === t) active = null;
              streak = 0;
              groundFlash = 0.4;
              A.sfx.soft();
            }
          } else {
            // bounce inside the play area
            if (t.x < 70 || t.x > E.W - 70) t.vx *= -1;
            if (t.y < 110 || t.y > E.H - 90) t.vy *= -1;
            t.x = Math.max(70, Math.min(E.W - 70, t.x));
            t.y = Math.max(110, Math.min(E.H - 90, t.y));
          }
        }
        targets = targets.filter((t) => !t.dead);
      },
      render(ctx) {
        const ox = shake > 0 ? rand(-6, 6) : 0;
        const oy = shake > 0 ? rand(-6, 6) : 0;
        ctx.save();
        ctx.translate(ox, oy);

        if (descend) {
          // Earth horizon to protect at the bottom
          const earth = E.img("earth");
          const r = E.W * 0.9;
          ctx.save();
          ctx.beginPath();
          ctx.arc(E.W / 2, E.H + r - 40, r, 0, Math.PI * 2);
          ctx.clip();
          if (earth) ctx.drawImage(earth, E.W / 2 - r, E.H - 40, r * 2, r * 2);
          else { ctx.fillStyle = "#2e6cff"; ctx.fillRect(0, E.H - 60, E.W, 120); }
          ctx.restore();
          if (groundFlash > 0) {
            ctx.fillStyle = "rgba(255,120,120," + groundFlash + ")";
            ctx.fillRect(0, E.H - 70, E.W, 80);
          }
        }

        for (const t of targets) {
          if (t.dead) continue;
          if (!t.emoji) {
            // draw rock / star body
            ctx.save();
            ctx.translate(t.x, t.y);
            ctx.rotate(t.rot);
            if (descend) drawAsteroid(ctx, t.size, t === active);
            else drawStarBody(ctx, t.size, t === active);
            ctx.restore();
          } else if (t === active) {
            // glow ring for the active easy-mode target
            ctx.beginPath();
            ctx.arc(t.x, t.y + 20, 64, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(90,215,255,0.7)";
            ctx.lineWidth = 4;
            ctx.stroke();
          }
          ctx.fillStyle = "#fff";
          drawLabel(ctx, t, cfg.bigText);
        }

        ctx.restore();
        drawHUD(ctx, { title, diff: cfg.label, score, extra: "Streak " + streak + " • Best " + best, lives, maxLives: cfg.lives });
        drawBackHint(ctx);

        if (targets.length === 0) {
          ctx.textAlign = "center";
          ctx.fillStyle = "rgba(255,255,255,0.5)";
          ctx.font = "700 22px " + FONT;
          ctx.fillText("Get ready…", E.W / 2, E.H / 2);
        }
      },
    };
  }

  function drawAsteroid(ctx, size, isActive) {
    ctx.beginPath();
    const pts = 9;
    for (let i = 0; i < pts; i++) {
      const a = (i / pts) * Math.PI * 2;
      const rr = size * (0.8 + ((i * 37) % 10) / 25);
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(-size * 0.3, -size * 0.3, size * 0.2, 0, 0, size);
    g.addColorStop(0, "#8a8273");
    g.addColorStop(1, "#4a4640");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = isActive ? "#5ad7ff" : "rgba(0,0,0,0.4)";
    ctx.lineWidth = isActive ? 5 : 2;
    ctx.stroke();
  }

  function drawStarBody(ctx, size, isActive) {
    const spikes = 5, outer = size, inner = size * 0.45;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(0, 0, inner * 0.3, 0, 0, outer);
    g.addColorStop(0, "#fff7c2");
    g.addColorStop(1, "#ffcf3a");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = isActive ? "#5ad7ff" : "rgba(180,120,0,0.5)";
    ctx.lineWidth = isActive ? 5 : 2;
    ctx.stroke();
  }

  // ============================================================
  //  ROCKET FUEL  (type words to fuel + fly to a new NASA planet)
  // ============================================================
  function createFuelGame(diffKey, onBack, onDead) {
    const cfg = D.DIFFICULTY[diffKey];
    const pool = D.getPool(cfg.pool);

    let word = null, typed = 0, lastText = null;
    let fuel = 0;
    let score = 0, planetsVisited = 0, planetIdx = 0;
    let state = "type";          // "type" | "launch" | "arrive"
    let stateT = 0;
    let rocketY = 0;
    let shake = 0;
    let t = 0;
    let lives = cfg.lives;
    let over = false;

    function nextWord() {
      let it;
      let guard = 0;
      do { it = pool[Math.floor(Math.random() * pool.length)]; } while (lastText && it.text === lastText && guard++ < 6);
      lastText = it.text;
      word = it; typed = 0;
      if (cfg.speakOnSpawn) A.speak(it.speak);
    }

    function launch() {
      state = "launch"; stateT = 0; rocketY = 0;
      A.sfx.launch();
    }

    function loseLife() {
      if (over) return;
      lives--;
      shake = 0.3;
      A.sfx.hurt();
      if (lives <= 0) {
        lives = 0;
        over = true;
        A.sfx.gameover();
        if (onDead) onDead(score);
      }
    }

    function onKey(e) {
      if (e.key === "Escape") { onBack(); return; }
      if (over || state !== "type") return;
      if (!isTypeable(e.key)) return;
      const key = norm(e.key);
      const expected = word.text[typed];
      if (key === expected) {
        typed++;
        A.sfx.zap();
        E.burst(E.W / 2, E.H - 120, "#ffd35a", 4, 120);
        if (typed >= word.text.length) {
          // word complete -> add fuel
          fuel++;
          score += (cfg.key === "easy" ? 5 : cfg.key === "medium" ? 10 : 15);
          A.sfx.success();
          E.confetti(E.W / 2, E.H - 200);   // big confetti on every word!
          if (cfg.key !== "easy") A.speak(word.speak);
          E.popup(E.W / 2, E.H - 160, "Fuel +1 ⛽", "#5bff9b");
          if (fuel >= cfg.fuelGoal) launch();
          else nextWord();
        }
      } else {
        loseLife();
      }
    }

    return {
      enter() {
        fuel = 0; score = 0; planetsVisited = 0; planetIdx = 0;
        state = "type"; stateT = 0;
        lives = cfg.lives; over = false;
        CTQ.state.typing = true;
        nextWord();
      },
      exit() { CTQ.state.typing = false; },
      onKey,
      update(dt) {
        t += dt;
        if (shake > 0) shake = Math.max(0, shake - dt);
        if (state === "launch") {
          stateT += dt;
          rocketY -= (120 + stateT * 220) * dt;
          if (Math.random() < 0.7) E.burst(E.W / 2, E.H - 120 - rocketY + 30, "#ff9a3a", 2, 120);
          if (rocketY < -E.H) {
            // arrived at a new planet
            planetsVisited++;
            planetIdx = (planetIdx + 1) % D.PLANETS.length;
            A.sfx.fanfare();
            state = "arrive"; stateT = 0;
          }
        } else if (state === "arrive") {
          stateT += dt;
          if (stateT > 1.8) { fuel = 0; state = "type"; nextWord(); }
        }
      },
      render(ctx) {
        const W = E.W, H = E.H;
        const ox = shake > 0 ? rand(-5, 5) : 0;

        // destination planet (top center)
        const destKey = D.PLANETS[planetIdx];
        const im = E.img(destKey);
        const pr = Math.min(W, H) * 0.16;
        const py = H * 0.24 + (state === "arrive" ? Math.sin(stateT * 2) * 6 : 0);
        ctx.save();
        ctx.beginPath();
        ctx.arc(W / 2, py, pr, 0, Math.PI * 2);
        ctx.clip();
        if (im) ctx.drawImage(im, W / 2 - pr, py - pr, pr * 2, pr * 2);
        else { ctx.fillStyle = "#7a5"; ctx.fill(); }
        ctx.restore();
        ctx.beginPath();
        ctx.arc(W / 2, py, pr, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(90,215,255,0.4)";
        ctx.lineWidth = 3; ctx.stroke();
        ctx.textAlign = "center";
        ctx.fillStyle = "#cfe6ff";
        ctx.font = "800 18px " + FONT;
        ctx.fillText("Destination: " + destKey.toUpperCase(), W / 2, py + pr + 26);

        // launch pad + rocket
        const baseY = H - 90;
        if (state !== "launch") {
          ctx.fillStyle = "rgba(255,255,255,0.12)";
          E.roundRect(ctx, W / 2 - 60, baseY + 18, 120, 12, 6); ctx.fill();
        }
        CTQ.menus.drawRocket(ctx, W / 2 + ox, baseY + rocketY, 1.6, 0, t);

        if (state === "type" && word) {
          // word console
          const boxW = Math.min(W * 0.8, 560);
          const bx = W / 2 - boxW / 2, by = H - 230;
          ctx.fillStyle = "rgba(5,3,15,0.6)";
          E.roundRect(ctx, bx, by, boxW, 70, 16); ctx.fill();
          ctx.strokeStyle = "rgba(90,215,255,0.5)";
          ctx.lineWidth = 2; ctx.stroke();
          drawLabel(ctx, { x: W / 2, y: by + 36, text: word.text, emoji: word.emoji, typed }, true);
          if (word.emoji) { /* easy mode draws emoji+letter via drawLabel big */ }
          ctx.fillStyle = "#9fb6dd";
          ctx.font = "700 15px " + FONT;
          ctx.fillText("Type it to add fuel!", W / 2, by - 12);
        } else if (state === "arrive") {
          ctx.fillStyle = "#ffe45a";
          ctx.font = "900 34px " + FONT;
          ctx.fillText("🎉 Welcome to " + destKey.toUpperCase() + "! 🎉", W / 2, H * 0.6);
        }

        // fuel gauge
        const gw = Math.min(W * 0.7, 480), gx = W / 2 - gw / 2, gy = H - 50;
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        E.roundRect(ctx, gx, gy, gw, 22, 11); ctx.fill();
        const frac = Math.min(1, fuel / cfg.fuelGoal);
        ctx.fillStyle = "#5bff9b";
        if (frac > 0) { E.roundRect(ctx, gx, gy, gw * frac, 22, 11); ctx.fill(); }
        ctx.fillStyle = "#fff";
        ctx.font = "800 14px " + FONT;
        ctx.fillText("⛽ FUEL  " + fuel + " / " + cfg.fuelGoal, W / 2, gy + 11);

        drawHUD(ctx, { title: "Rocket Fuel 🚀", diff: cfg.label, score, extra: "Planets visited: " + planetsVisited, lives, maxLives: cfg.lives });
        drawBackHint(ctx);
      },
    };
  }

  return { createTargetGame, createFuelGame };
})();
