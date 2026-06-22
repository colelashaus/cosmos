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
    let nukeFlash = 0;
    let clock = 0;
    const useLives = !!cfg.lives;     // Easy/Medium are endless; Hard has lives
    let lives = cfg.lives || 0;
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
      if (t.nuke) { nukeAll(t); return; }
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
      // Every 5-streak: drop a NUKE in Asteroid Defense, cheer otherwise.
      if (streak > 0 && streak % 5 === 0) {
        A.sfx.fanfare();
        if (descend && !targets.some((x) => x.nuke && !x.dead)) {
          spawnNuke();
          E.popup(E.W / 2, E.H * 0.4, "💣 NUKE incoming — type it!", "#ff8a5a");
        } else {
          E.popup(E.W / 2, E.H / 2, "Streak " + streak + "! 🎉", "#ffe45a");
        }
      }
      active = null;
    }

    // Special bonus target that, when typed, wipes every asteroid on screen.
    function spawnNuke() {
      const text = cfg.key === "easy"
        ? "ABCDEFGHJKLMNPRSTUW"[Math.floor(Math.random() * 19)]
        : "NUKE";
      const t = {
        text, emoji: null, speak: text, typed: 0,
        rot: 0, rotV: rand(-0.3, 0.3),
        size: Math.max(46, text.length * 9),
        nuke: true, dead: false,
        x: rand(140, E.W - 140), y: -50,
        vx: rand(-6, 6), vy: cfg.fallSpeed * 0.8,
      };
      targets.push(t);
      A.speak(cfg.key === "easy" ? text + ". Nuke!" : "Type nuke!");
    }

    function nukeAll(t) {
      t.dead = true;
      nukeFlash = 0.7;
      A.sfx.explode(); A.sfx.fanfare();
      A.speak("Boom!");
      E.confetti(E.W / 2, E.H * 0.4, 130);
      let cleared = 0;
      for (const x of targets) {
        if (x === t || x.dead) continue;
        E.burst(x.x, x.y, "#ffb05a", 18, 240);
        x.dead = true;
        cleared++;
      }
      const bonus = 25 + cleared * 5;
      score += bonus;
      best = Math.max(best, streak);
      E.popup(E.W / 2, E.H / 2, "💥 NUKE! +" + bonus + " 💥", "#ffe45a");
      active = null;
    }

    // Wrong keystroke. In endless modes (Easy/Medium) it's just a gentle buzz;
    // on Hard it costs a life and running out ends the game.
    function loseLife() {
      if (over) return;
      streak = 0;
      shake = 0.3;
      if (!useLives) { A.sfx.wrong(); return; }
      lives--;
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
        lives = cfg.lives || 0; over = false;
        spawnT = 0.6;
        CTQ.state.typing = true;
        // seed a couple for rescue so the screen isn't empty
        if (!descend) { spawn(); if (cfg.maxTargets > 1) spawn(); }
      },
      exit() { CTQ.state.typing = false; },
      onKey,
      update(dt) {
        clock += dt;
        if (shake > 0) shake = Math.max(0, shake - dt);
        if (groundFlash > 0) groundFlash = Math.max(0, groundFlash - dt);
        if (nukeFlash > 0) nukeFlash = Math.max(0, nukeFlash - dt * 1.6);

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
          if (t.nuke) {
            ctx.save();
            ctx.translate(t.x, t.y);
            drawNukeBody(ctx, t.size, t === active, clock);
            ctx.restore();
          } else if (!t.emoji) {
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

        if (nukeFlash > 0) {
          ctx.fillStyle = "rgba(255,255,255," + Math.min(0.85, nukeFlash) + ")";
          ctx.fillRect(0, 0, E.W, E.H);
        }

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

  function drawNukeBody(ctx, size, isActive, clock) {
    const pulse = 0.6 + 0.4 * Math.sin(clock * 8);
    // danger glow
    const g = ctx.createRadialGradient(0, 0, size * 0.4, 0, 0, size * 1.7);
    g.addColorStop(0, "rgba(255,90,60," + (0.55 * pulse) + ")");
    g.addColorStop(1, "rgba(255,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, size * 1.7, 0, Math.PI * 2); ctx.fill();
    // bomb body
    const bg = ctx.createRadialGradient(-size * 0.3, -size * 0.3, size * 0.2, 0, 0, size);
    bg.addColorStop(0, "#5b5b66");
    bg.addColorStop(1, "#0e0e16");
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(0, 0, size, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = isActive ? "#5ad7ff" : "#ff5a5a";
    ctx.lineWidth = isActive ? 5 : 3;
    ctx.stroke();
    // fuse + spark
    ctx.strokeStyle = "#c9b08a"; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.quadraticCurveTo(size * 0.5, -size * 1.35, size * 0.25, -size * 1.55);
    ctx.stroke();
    ctx.fillStyle = "#ffd35a";
    ctx.beginPath(); ctx.arc(size * 0.25, -size * 1.55, 3 + 3 * pulse, 0, Math.PI * 2); ctx.fill();
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
    const COUNTDOWN_DUR = 3;

    let word = null, typed = 0, lastText = null;
    let fuel = 0;
    let score = 0, planetsVisited = 0, planetIdx = 0;
    let state = "type";          // "type" | "countdown" | "liftoff" | "arrive"
    let stateT = 0, t = 0;
    let rocketY = 0, rocketVy = 0;
    let countdownNum = 0;
    let warp = 0, rumble = 0;
    const useLives = !!cfg.lives;     // Easy/Medium endless; Hard has lives
    let lives = cfg.lives || 0;
    let over = false;

    // sprite-based particle engines (built in enter())
    let exhaust = null, smokeEm = null, sparks = null;
    let rings = [];

    // rocket scale + its resting CENTER y on the pad (drawRocket draws centered)
    function rocketScale() { return Math.max(0.85, Math.min(1.5, Math.min(E.W, E.H) / 620)); }
    function baseLine() { return E.H * 0.70; }
    function nozzle() {
      const s = rocketScale();
      return { x: E.W / 2, y: baseLine() + rocketY + 85 * s, s };
    }

    function nextWord() {
      let it, guard = 0;
      do { it = pool[Math.floor(Math.random() * pool.length)]; } while (lastText && it.text === lastText && guard++ < 6);
      lastText = it.text;
      word = it; typed = 0;
      if (cfg.speakOnSpawn) A.speak(it.speak);
    }

    function startCountdown() {
      state = "countdown"; stateT = 0; countdownNum = 99;
      A.speak("Get ready!");
    }

    function destLabel(k) { return k === "blackhole" ? "BLACK HOLE" : k.toUpperCase(); }
    function destName(k) { return k === "blackhole" ? "the black hole" : k; }

    function ignite() {
      const n = nozzle();
      state = "liftoff"; stateT = 0; rocketVy = 130;
      A.sfx.launch(); A.speak("Blast off!");
      if (CTQ.three && CTQ.three.enabled) CTQ.three.launchRocket();
      for (let i = 0; i < 3; i++) rings.push({ x: n.x, y: n.y, r: 18 + i * 28, vr: 520, life: 1 });
      for (let i = 0; i < 32; i++) sparks.spawn({ x: n.x, y: n.y, vx: rand(-340, 340), vy: rand(-100, 320), size: rand(8, 18), decay: rand(1.6, 2.6), grav: 180, drag: 0.93 });
      for (let i = 0; i < 16; i++) smokeEm.spawn({ x: n.x + rand(-40, 40), y: n.y, vx: rand(-180, 180), vy: rand(-20, 70), size: rand(50, 100) * n.s, grow: 80, decay: rand(0.5, 1), drag: 0.96 });
    }

    function emitExhaust(intensity, n) {
      const cnt = Math.round(intensity * 7);
      for (let i = 0; i < cnt; i++) {
        exhaust.spawn({
          x: n.x + rand(-9, 9) * n.s, y: n.y,
          vx: rand(-70, 70), vy: rand(140, 320) * intensity + 90,
          size: rand(20, 48) * n.s, decay: rand(2.2, 3.4), grav: 50, drag: 0.95,
        });
      }
      if (Math.random() < 0.6 * intensity) {
        smokeEm.spawn({ x: n.x + rand(-22, 22) * n.s, y: n.y + rand(0, 18), vx: rand(-60, 60), vy: rand(40, 130), size: rand(40, 80) * n.s, grow: 60, decay: rand(0.7, 1.3), grav: -8, drag: 0.97 });
      }
      if (Math.random() < 0.4 * intensity) {
        sparks.spawn({ x: n.x, y: n.y, vx: rand(-220, 220), vy: rand(60, 280), size: rand(8, 16), decay: rand(2, 3), grav: 140, drag: 0.94 });
      }
    }

    function loseLife() {
      if (over) return;
      rumble = 6;
      if (!useLives) { A.sfx.wrong(); return; }
      lives--; A.sfx.hurt();
      if (lives <= 0) { lives = 0; over = true; A.sfx.gameover(); if (onDead) onDead(score); }
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
        E.burst(E.W / 2, E.H - 220, "#ffd35a", 4, 120);
        if (typed >= word.text.length) {
          fuel++;
          score += (cfg.key === "easy" ? 5 : cfg.key === "medium" ? 10 : 15);
          A.sfx.success();
          E.confetti(E.W / 2, consoleTop() + 36);   // big confetti on every word!
          if (cfg.key !== "easy") A.speak(word.speak);
          E.popup(E.W / 2, consoleTop() - 16, "Fuel +1 ⛽", "#5bff9b");
          if (fuel >= cfg.fuelGoal) startCountdown();
          else nextWord();
        }
      } else {
        loseLife();
      }
    }

    // Vertical anchor for the on-screen word console (upper-middle).
    function consoleTop() { return E.H * 0.40; }

    return {
      enter() {
        CTQ.sprites.init();
        exhaust = new CTQ.sprites.Emitter("flame");
        smokeEm = new CTQ.sprites.Emitter("smoke");
        sparks = new CTQ.sprites.Emitter("spark");
        rings = [];
        fuel = 0; score = 0; planetsVisited = 0; planetIdx = 0;
        state = "type"; stateT = 0; rocketY = 0; rocketVy = 0;
        warp = 0; rumble = 0;
        lives = cfg.lives || 0; over = false;
        CTQ.state.typing = true;
        E.setWarp(0);
        if (CTQ.three && CTQ.three.enabled) CTQ.three.setDestination(D.PLANETS[planetIdx]);
        nextWord();
      },
      exit() { CTQ.state.typing = false; E.setWarp(0); },
      onKey,
      update(dt) {
        t += dt;
        if (rumble > 0) rumble = Math.max(0, rumble - dt * 14);
        exhaust.update(dt); smokeEm.update(dt); sparks.update(dt);
        for (let i = rings.length - 1; i >= 0; i--) {
          const r = rings[i]; r.r += r.vr * dt; r.life -= dt * 1.2;
          if (r.life <= 0) rings.splice(i, 1);
        }

        const n = nozzle();
        if (state === "countdown") {
          stateT += dt;
          const remaining = COUNTDOWN_DUR - stateT;
          const num = Math.ceil(remaining);
          if (num !== countdownNum && num > 0) { countdownNum = num; A.sfx.select(); A.speak(String(num)); }
          rumble = 2 + (stateT / COUNTDOWN_DUR) * 5;
          emitExhaust(0.25 + (stateT / COUNTDOWN_DUR) * 0.45, n);
          if (remaining <= 0) ignite();
        } else if (state === "liftoff") {
          stateT += dt;
          rocketVy += 900 * dt;
          rocketY -= rocketVy * dt;
          warp = Math.min(1.2, warp + dt * 1.6); E.setWarp(warp);
          rumble = 9 * Math.max(0, 1 - stateT * 0.7);
          emitExhaust(1, n);
          if (rocketY < -E.H * 0.7) {
            planetsVisited++;
            planetIdx = (planetIdx + 1) % D.PLANETS.length;
            A.sfx.fanfare();
            A.speak("Welcome to " + destName(D.PLANETS[planetIdx]) + "!");
            if (CTQ.three && CTQ.three.enabled) CTQ.three.setDestination(D.PLANETS[planetIdx]);
            state = "arrive"; stateT = 0;
          }
        } else if (state === "arrive") {
          stateT += dt;
          warp = Math.max(0, warp - dt * 2.2); E.setWarp(warp);
          if (stateT > 2.0) { fuel = 0; rocketY = 0; rocketVy = 0; state = "type"; nextWord(); }
        } else if (warp > 0) {
          warp = Math.max(0, warp - dt * 3); E.setWarp(warp);
        }
      },
      render(ctx) {
        const W = E.W, H = E.H;
        const ox = rumble > 0 ? rand(-rumble, rumble) : 0;
        const oy = rumble > 0 ? rand(-rumble, rumble) : 0;
        const destKey = D.PLANETS[planetIdx];
        const n = nozzle();

        // destination planet (top center). With the 3D layer on, the rotating
        // 3D sphere is the destination, so we draw only the text label.
        const use3DPlanet = !!(CTQ.three && CTQ.three.enabled);
        const im = E.img(destKey);
        const arriveZoom = state === "arrive" ? 1 + Math.min(0.35, stateT * 0.25) : 1;
        const pr = Math.min(W, H) * 0.13 * arriveZoom;
        const py = H * 0.19 + (state === "arrive" ? Math.sin(stateT * 2) * 6 : 0);
        if (!use3DPlanet) {
          if (destKey === "blackhole") {
            ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(W / 2, py, pr * 0.62, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = "#ffae5a"; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(W / 2, py, pr * 0.86, 0, Math.PI * 2); ctx.stroke();
          } else {
            ctx.save();
            ctx.beginPath(); ctx.arc(W / 2, py, pr, 0, Math.PI * 2); ctx.clip();
            if (im) ctx.drawImage(im, W / 2 - pr, py - pr, pr * 2, pr * 2);
            else { ctx.fillStyle = "#7a5"; ctx.fillRect(W / 2 - pr, py - pr, pr * 2, pr * 2); }
            ctx.restore();
            ctx.beginPath(); ctx.arc(W / 2, py, pr, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(90,215,255,0.45)"; ctx.lineWidth = 3; ctx.stroke();
          }
        }
        ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#cfe6ff"; ctx.font = "800 18px " + FONT;
        ctx.fillText("Destination: " + destLabel(destKey), W / 2, use3DPlanet ? 86 : py + pr + 26);

        // ground shockwave rings
        for (const r of rings) {
          ctx.globalAlpha = Math.max(0, r.life) * 0.5;
          ctx.strokeStyle = "#ffd9a0"; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(r.x + ox, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // launch pad (hidden once airborne)
        const baseY = baseLine();
        if (state === "type" || state === "countdown") {
          ctx.fillStyle = "rgba(255,255,255,0.12)";
          E.roundRect(ctx, W / 2 - 70 * n.s, baseY + rocketY + 96 * n.s, 140 * n.s, 12, 6); ctx.fill();
        }

        // smoke behind, rocket, then bright core flame + glowing exhaust/sparks
        smokeEm.draw(ctx);
        CTQ.sprites.drawRocket(ctx, W / 2 + ox, baseY + rocketY + oy, n.s, 0);
        if (state === "countdown" || state === "liftoff") {
          const fl = state === "liftoff" ? 1 : 0.4;
          const len = (90 + 70 * fl) * n.s;
          const fg = ctx.createLinearGradient(0, n.y, 0, n.y + len);
          fg.addColorStop(0, "rgba(255,255,215,0.95)");
          fg.addColorStop(0.5, "rgba(255,150,40,0.7)");
          fg.addColorStop(1, "rgba(255,60,20,0)");
          ctx.fillStyle = fg;
          ctx.beginPath();
          ctx.moveTo(n.x - 18 * n.s + ox, n.y); ctx.lineTo(n.x + 18 * n.s + ox, n.y);
          ctx.lineTo(n.x + 6 * n.s + ox, n.y + len); ctx.lineTo(n.x - 6 * n.s + ox, n.y + len);
          ctx.closePath(); ctx.fill();
        }
        exhaust.draw(ctx);
        sparks.draw(ctx);

        ctx.textAlign = "center";
        if (state === "type" && word) {
          const boxW = Math.min(W * 0.8, 560);
          const bx = W / 2 - boxW / 2, by = consoleTop();
          ctx.fillStyle = "rgba(5,3,15,0.6)";
          E.roundRect(ctx, bx, by, boxW, 72, 16); ctx.fill();
          ctx.strokeStyle = "rgba(90,215,255,0.5)"; ctx.lineWidth = 2; ctx.stroke();
          drawLabel(ctx, { x: W / 2, y: by + 37, text: word.text, emoji: word.emoji, typed }, true);
          ctx.fillStyle = "#9fb6dd"; ctx.font = "700 15px " + FONT; ctx.textBaseline = "alphabetic";
          ctx.fillText("Type it to add fuel!", W / 2, by - 12);
        } else if (state === "countdown") {
          // number grows fresh then shrinks across its one-second slot
          const within = countdownNum - (COUNTDOWN_DUR - stateT); // 0 → 1
          ctx.fillStyle = "#ffe45a";
          ctx.font = "900 " + Math.round(150 - within * 50) + "px " + FONT;
          ctx.textBaseline = "middle";
          ctx.fillText(String(countdownNum), W / 2, H * 0.5);
          ctx.font = "800 26px " + FONT; ctx.fillStyle = "#fff";
          ctx.fillText("🚀 LAUNCHING! 🚀", W / 2, H * 0.5 - 90);
          ctx.textBaseline = "alphabetic";
        } else if (state === "arrive") {
          ctx.fillStyle = "#ffe45a"; ctx.font = "900 34px " + FONT;
          ctx.fillText("🎉 Welcome to " + destLabel(destKey) + "! 🎉", W / 2, H * 0.62);
        }

        // fuel gauge (during typing / countdown)
        if (state === "type" || state === "countdown") {
          const gw = Math.min(W * 0.7, 480), gx = W / 2 - gw / 2, gy = H - 50;
          ctx.fillStyle = "rgba(255,255,255,0.12)";
          E.roundRect(ctx, gx, gy, gw, 22, 11); ctx.fill();
          const frac = Math.min(1, fuel / cfg.fuelGoal);
          if (frac > 0) { ctx.fillStyle = "#5bff9b"; E.roundRect(ctx, gx, gy, gw * frac, 22, 11); ctx.fill(); }
          ctx.fillStyle = "#fff"; ctx.font = "800 14px " + FONT; ctx.textBaseline = "middle";
          ctx.fillText("⛽ FUEL  " + fuel + " / " + cfg.fuelGoal, W / 2, gy + 11);
          ctx.textBaseline = "alphabetic";
        }

        drawHUD(ctx, { title: "Rocket Fuel 🚀", diff: cfg.label, score, extra: "Planets visited: " + planetsVisited, lives, maxLives: cfg.lives });
        drawBackHint(ctx);
      },
    };
  }

  return { createTargetGame, createFuelGame };
})();
