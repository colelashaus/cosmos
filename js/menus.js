/* ============================================================
   Menus — Intro, Difficulty select, Mini-game select.
   These use the #ui HTML overlay for crisp text + keyboard/click,
   while the canvas keeps animating space behind them.
   ============================================================ */
window.CTQ = window.CTQ || {};

CTQ.menus = (function () {
  const E = CTQ.engine;
  const A = CTQ.audio;
  const ui = document.getElementById("ui");

  function clearUI() {
    ui.innerHTML = "";
    ui.classList.remove("active");
  }
  function setUI(html) {
    ui.innerHTML = html;
    ui.classList.add("active");
  }

  // ---------- Decorative drifting planet for menu backgrounds ----------
  function makeDrifters() {
    const keys = ["jupiter", "saturn", "mars", "nebula"];
    return keys.map((k, i) => ({
      key: k,
      x: Math.random() * E.W,
      y: Math.random() * E.H,
      r: 60 + Math.random() * 70,
      vx: (Math.random() - 0.5) * 12,
      vy: (Math.random() - 0.5) * 12,
      alpha: 0.18 + Math.random() * 0.12,
    }));
  }
  function drawDrifters(ctx, list) {
    // The 3D layer already shows planets behind everything — skip the 2D ones.
    if (CTQ.three && CTQ.three.enabled) return;
    for (const d of list) {
      d.x += d.vx * 0.016;
      d.y += d.vy * 0.016;
      if (d.x < -d.r) d.x = E.W + d.r;
      if (d.x > E.W + d.r) d.x = -d.r;
      if (d.y < -d.r) d.y = E.H + d.r;
      if (d.y > E.H + d.r) d.y = -d.r;
      const im = E.img(d.key);
      ctx.globalAlpha = d.alpha;
      if (im) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(im, d.x - d.r, d.y - d.r, d.r * 2, d.r * 2);
        ctx.restore();
      } else {
        ctx.fillStyle = "#445";
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  // ============================================================
  // INTRO SCENE — exciting animated title
  // ============================================================
  function createIntro(onStart) {
    let t = 0;
    let rocket = { x: -120, y: 0, ang: 0 };
    let drifters = [];

    return {
      enter() {
        drifters = makeDrifters();
        rocket.y = E.H * 0.62;
        setUI(`
          <div class="title">COSMIC<br>TYPING QUEST</div>
          <div class="subtitle">⭐ Learn to spell &amp; type — among the stars! ⭐</div>
          <div class="blink">▶ Press ENTER or SPACE to begin</div>
          <div class="hint-bar">Best played on a keyboard 🎹</div>
        `);
      },
      exit() { clearUI(); },
      onResize() { rocket.y = E.H * 0.62; },
      update(dt) {
        t += dt;
        rocket.x += 130 * dt;
        if (rocket.x > E.W + 160) rocket.x = -160;
        rocket.y = E.H * 0.62 + Math.sin(t * 1.4) * 22;
        rocket.ang = Math.sin(t * 1.4) * 0.12;
        // occasional sparkle
        if (Math.random() < 0.25) E.burst(Math.random() * E.W, Math.random() * E.H * 0.5, "#ffffff", 1, 30);
      },
      render(ctx) {
        drawDrifters(ctx, drifters);
        drawRocket(ctx, rocket.x, rocket.y, 1.2, rocket.ang, t);
      },
      onKey(e) {
        if (e.key === "Enter" || e.key === " ") {
          A.unlock();
          A.sfx.launch();
          onStart();
        }
      },
    };
  }

  // ============================================================
  // CARD MENU base (difficulty + game select share this)
  // ============================================================
  function createCardMenu({ heading, sub, items, onPick, onBack, render: extraRender }) {
    let sel = 0;
    let drifters = [];

    function html() {
      const cards = items
        .map(
          (it, i) => `
        <div class="card ${i === sel ? "selected" : ""}" data-i="${i}">
          <span class="emoji">${it.emoji}</span>
          <div class="name">${it.name}</div>
          ${it.age ? `<div class="age">${it.age}</div>` : ""}
          ${it.desc ? `<div class="desc">${it.desc}</div>` : ""}
        </div>`
        )
        .join("");
      return `
        ${onBack ? `<div class="back-link" data-back="1">← Back (Esc)</div>` : ""}
        <div class="screen-heading">${heading}</div>
        <div class="screen-sub">${sub}</div>
        <div class="cards">${cards}</div>
        <div class="hint-bar">Use <kbd>←</kbd> <kbd>→</kbd> then <kbd>Enter</kbd>, press <kbd>1</kbd>–<kbd>${items.length}</kbd>, or tap a card</div>
      `;
    }

    function refresh() {
      ui.querySelectorAll(".card").forEach((el, i) =>
        el.classList.toggle("selected", i === sel)
      );
    }

    function bindClicks() {
      ui.querySelectorAll(".card").forEach((el) => {
        el.addEventListener("mouseenter", () => { sel = +el.dataset.i; refresh(); });
        el.addEventListener("click", () => { sel = +el.dataset.i; A.sfx.select(); onPick(items[sel], sel); });
      });
      const back = ui.querySelector("[data-back]");
      if (back) back.addEventListener("click", () => onBack && onBack());
    }

    return {
      enter() {
        drifters = makeDrifters();
        setUI(html());
        bindClicks();
      },
      exit() { clearUI(); },
      render(ctx) {
        drawDrifters(ctx, drifters);
        if (extraRender) extraRender(ctx);
      },
      onKey(e) {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") { sel = (sel + 1) % items.length; A.sfx.key(); refresh(); }
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { sel = (sel - 1 + items.length) % items.length; A.sfx.key(); refresh(); }
        else if (e.key === "Enter" || e.key === " ") { A.sfx.select(); onPick(items[sel], sel); }
        else if (e.key === "Escape" && onBack) { onBack(); }
        else if (/^[1-9]$/.test(e.key)) {
          const i = +e.key - 1;
          if (i < items.length) { sel = i; refresh(); A.sfx.select(); onPick(items[i], i); }
        }
      },
    };
  }

  function createDifficulty(onPick, onBack) {
    const D = CTQ.data.DIFFICULTY;
    const items = ["easy", "medium", "hard"].map((k) => ({
      name: D[k].label, emoji: D[k].emoji, age: D[k].age, desc: D[k].desc, key: k,
    }));
    return createCardMenu({
      heading: "Choose Your Level",
      sub: "Pick the level that fits the astronaut playing 🧑‍🚀",
      items,
      onPick: (it) => onPick(it.key),
      onBack,
    });
  }

  function createGameSelect(diffKey, onPick, onBack) {
    const items = CTQ.data.GAMES.map((g) => ({ name: g.name, emoji: g.emoji, desc: g.desc, key: g.key }));
    const label = CTQ.data.DIFFICULTY[diffKey].label;
    return createCardMenu({
      heading: "Choose a Mission",
      sub: `Level: ${label} ${CTQ.data.DIFFICULTY[diffKey].emoji} — pick a game to play`,
      items,
      onPick: (it) => onPick(it.key),
      onBack,
    });
  }

  // ============================================================
  // GAME OVER SCENE
  // ============================================================
  function createGameOver(score, onRetry, onMenu) {
    let drifters = [];
    const cheer =
      score >= 150 ? "Amazing flying, astronaut! 🌟" :
      score >= 60  ? "Great job out there! 🚀" :
                     "Good try — let's go again! 💫";
    return {
      enter() {
        drifters = makeDrifters();
        A.speak("Game over. " + cheer, 0.95);
        setUI(`
          <div class="screen-heading">💥 Game Over 💥</div>
          <div class="screen-sub">${cheer}</div>
          <div class="title" style="font-size:clamp(30px,6vw,64px)">⭐ ${score}</div>
          <div class="cards">
            <div class="card selected" data-act="retry"><span class="emoji">🔁</span><div class="name">Play Again</div><div class="desc">Press Enter</div></div>
            <div class="card" data-act="menu"><span class="emoji">🪐</span><div class="name">Pick a Mission</div><div class="desc">Press Esc</div></div>
          </div>
          <div class="hint-bar"><kbd>Enter</kbd> play again • <kbd>Esc</kbd> menu</div>
        `);
        ui.querySelector('[data-act="retry"]').addEventListener("click", () => { A.sfx.select(); onRetry(); });
        ui.querySelector('[data-act="menu"]').addEventListener("click", () => { A.sfx.select(); onMenu(); });
      },
      exit() { clearUI(); },
      render(ctx) { drawDrifters(ctx, drifters); },
      onKey(e) {
        if (e.key === "Enter" || e.key === " ") { A.sfx.select(); onRetry(); }
        else if (e.key === "Escape") { onMenu(); }
      },
    };
  }

  // ---------- Shared rocket drawing (used by intro + games) ----------
  function drawRocket(ctx, x, y, scale, ang, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((ang || 0) + Math.PI / 2); // nose points right when ang 0
    ctx.scale(scale, scale);

    // flame
    const fl = 18 + Math.sin((t || 0) * 30) * 8;
    const grd = ctx.createLinearGradient(0, 28, 0, 28 + fl);
    grd.addColorStop(0, "#ffd35a");
    grd.addColorStop(1, "rgba(255,90,40,0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(-10, 26); ctx.lineTo(10, 26); ctx.lineTo(0, 26 + fl); ctx.closePath();
    ctx.fill();

    // body
    ctx.fillStyle = "#eef3ff";
    ctx.beginPath();
    ctx.moveTo(0, -34);
    ctx.quadraticCurveTo(18, -4, 14, 26);
    ctx.lineTo(-14, 26);
    ctx.quadraticCurveTo(-18, -4, 0, -34);
    ctx.fill();
    // fins
    ctx.fillStyle = "#ff7ad5";
    ctx.beginPath(); ctx.moveTo(-14, 14); ctx.lineTo(-26, 30); ctx.lineTo(-14, 28); ctx.fill();
    ctx.beginPath(); ctx.moveTo(14, 14); ctx.lineTo(26, 30); ctx.lineTo(14, 28); ctx.fill();
    // window
    ctx.fillStyle = "#5ad7ff";
    ctx.beginPath(); ctx.arc(0, -4, 7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#2b86a6"; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }

  return { createIntro, createDifficulty, createGameSelect, createGameOver, drawRocket };
})();
