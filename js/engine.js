/* ============================================================
   Engine — canvas setup, asset loading, starfield, particles,
   scene manager, game loop, and shared draw helpers.
   ============================================================ */
window.CTQ = window.CTQ || {};

// Shared runtime flags. `typing` is true while a typing mini-game is active,
// so the global "M = mute" hotkey can stand down (M is also a letter to type).
CTQ.state = CTQ.state || { typing: false };

CTQ.engine = (function () {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, dpr = 1;

  // ---------- Asset loading (NASA images, with graceful fallback) ----------
  const assets = {};
  function loadAssets() {
    const map = CTQ.data.IMAGES;
    return Promise.all(
      Object.keys(map).map(
        (k) =>
          new Promise((resolve) => {
            const img = new Image();
            img.onload = () => { assets[k] = img; resolve(); };
            img.onerror = () => { resolve(); }; // missing image is fine; we fall back to drawn art
            img.src = map[k];
          })
      )
    );
  }
  function img(key) { return assets[key] || null; }

  // ---------- Resize / DPI ----------
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (current && current.onResize) current.onResize(W, H);
  }
  window.addEventListener("resize", resize);

  // ---------- Starfield (always-on background) ----------
  let stars = [];
  function initStars() {
    stars = [];
    const n = Math.round((W * H) / 6000);
    for (let i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        z: Math.random() * 0.8 + 0.2,
        tw: Math.random() * Math.PI * 2,
      });
    }
  }
  function updateStars(dt) {
    for (const s of stars) {
      s.y += s.z * 18 * dt;
      s.tw += dt * 3;
      if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
    }
  }
  function drawStars() {
    for (const s of stars) {
      const a = 0.5 + 0.5 * Math.sin(s.tw);
      ctx.globalAlpha = a * s.z;
      ctx.fillStyle = "#ffffff";
      const r = s.z * 1.8;
      ctx.fillRect(s.x, s.y, r, r);
    }
    ctx.globalAlpha = 1;
  }

  // ---------- Particles (explosions, sparkles) ----------
  let particles = [];
  function burst(x, y, color, count, speed) {
    count = count || 18;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (Math.random() * 0.6 + 0.4) * (speed || 220);
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 1,
        decay: Math.random() * 1.4 + 0.9,
        size: Math.random() * 4 + 2,
        color: color || "#ffd35a",
      });
    }
  }
  // Big multi-colour confetti pop — fired when a word is completed.
  const CONFETTI_COLORS = ["#ff5a8a", "#5ad7ff", "#ffe45a", "#5bff9b", "#c08bff", "#ff9a3a"];
  function confetti(x, y, count) {
    count = count || 70;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (Math.random() * 0.8 + 0.3) * 360;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 120,         // bias upward for a "pop"
        life: 1,
        decay: Math.random() * 0.5 + 0.45,  // longer-lived than sparks
        size: Math.random() * 5 + 4,
        color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
        shape: "rect",
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 12,
        grav: 540,
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.grav || 120) * dt;
      if (p.shape === "rect") {
        p.vx *= 0.98;                       // air drag so confetti flutters down
        p.rot += p.spin * dt;
      }
      p.life -= p.decay * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }
  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      if (p.shape === "rect") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------- Floating score popups ----------
  let popups = [];
  function popup(x, y, text, color) {
    popups.push({ x, y, text, color: color || "#5bff9b", life: 1 });
  }
  function updatePopups(dt) {
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.y -= 40 * dt;
      p.life -= dt * 0.9;
      if (p.life <= 0) popups.splice(i, 1);
    }
  }
  function drawPopups() {
    ctx.textAlign = "center";
    for (const p of popups) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.font = "800 28px var(--font, sans-serif)";
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }

  // ---------- Scene manager + main loop ----------
  let current = null;
  let lastT = 0;
  let running = false;

  function setScene(scene) {
    if (current && current.exit) current.exit();
    current = scene;
    if (current && current.enter) current.enter(W, H);
  }

  // Route keystrokes to the active scene.
  window.addEventListener("keydown", (e) => {
    // Stop space/arrows from scrolling the page.
    if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
    }
    if (current && current.onKey) current.onKey(e);
  });

  function loop(t) {
    if (!running) return;
    const dt = Math.min((t - lastT) / 1000 || 0, 0.05);
    lastT = t;

    updateStars(dt);
    updateParticles(dt);
    updatePopups(dt);
    if (current && current.update) current.update(dt, W, H);

    // draw
    ctx.clearRect(0, 0, W, H);
    drawStars();
    if (current && current.render) current.render(ctx, W, H);
    drawParticles();
    drawPopups();

    requestAnimationFrame(loop);
  }

  function start() {
    running = true;
    lastT = performance.now();
    requestAnimationFrame(loop);
  }

  // ---------- Shared draw helpers ----------
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  return {
    get ctx() { return ctx; },
    get W() { return W; },
    get H() { return H; },
    canvas,
    loadAssets, img,
    resize, initStars,
    burst, popup,
    setScene, start,
    roundRect, confetti,
  };
})();
