/* ============================================================
   Sprite engine — pre-renders bitmaps to offscreen canvases and
   provides a lightweight sprite-based particle emitter. Used for
   the cinematic Rocket Fuel blast-off (exhaust, smoke, glow).
   ============================================================ */
window.CTQ = window.CTQ || {};

CTQ.sprites = (function () {
  let rocket = null, flame = null, smoke = null, spark = null;

  function mk(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }

  // A year-3167 strike ship, rendered once. Nose up; (0,0)=center.
  // Dark titanium-alloy hull, neon trim, glowing cockpit + plasma engines.
  function buildRocket() {
    const W = 152, H = 252;
    rocket = mk(W, H);
    const c = rocket.getContext("2d");
    const cx = W / 2;

    // ---- swept wings (dark, with magenta neon leading edge) ----
    function wing(s) {
      c.save();
      c.fillStyle = "#1b2238";
      c.beginPath();
      c.moveTo(cx + s * 22, 150);
      c.lineTo(cx + s * 66, 214);
      c.lineTo(cx + s * 52, 220);
      c.lineTo(cx + s * 20, 182);
      c.closePath(); c.fill();
      c.shadowColor = "#ff36c8"; c.shadowBlur = 12;
      c.strokeStyle = "#ff5ad6"; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(cx + s * 22, 150); c.lineTo(cx + s * 66, 214); c.stroke();
      c.restore();
    }
    wing(-1); wing(1);

    // ---- main hull (dark metallic, cyan neon edge) ----
    const g = c.createLinearGradient(cx - 32, 0, cx + 32, 0);
    g.addColorStop(0, "#141b30"); g.addColorStop(0.42, "#5c6e9c");
    g.addColorStop(0.5, "#cdd9f3"); g.addColorStop(0.58, "#5c6e9c"); g.addColorStop(1, "#141b30");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(cx, 8);
    c.bezierCurveTo(cx + 30, 70, cx + 30, 162, cx + 20, 214);
    c.lineTo(cx + 13, 232); c.lineTo(cx - 13, 232); c.lineTo(cx - 20, 214);
    c.bezierCurveTo(cx - 30, 162, cx - 30, 70, cx, 8);
    c.closePath(); c.fill();
    c.save(); c.shadowColor = "#27e8ff"; c.shadowBlur = 10; c.strokeStyle = "#5ff2ff"; c.lineWidth = 2; c.stroke(); c.restore();

    // ---- warm sun-forged accent band ----
    c.save(); c.shadowColor = "#ff9a2e"; c.shadowBlur = 8; c.strokeStyle = "#ffb24a"; c.lineWidth = 3;
    c.beginPath(); c.moveTo(cx - 17, 150); c.lineTo(cx + 17, 150); c.stroke(); c.restore();

    // ---- weapon pods (photon torpedo launchers) ----
    [-1, 1].forEach((s) => {
      c.fillStyle = "#222b45"; c.fillRect(cx + s * 24 - 4, 166, 8, 28);
      c.save(); c.shadowColor = "#ffae3a"; c.shadowBlur = 8; c.fillStyle = "#ffd24a";
      c.beginPath(); c.arc(cx + s * 24, 166, 3.4, 0, Math.PI * 2); c.fill(); c.restore();
    });

    // ---- cockpit (glowing cyan) ----
    c.save();
    const wgg = c.createRadialGradient(cx - 3, 84, 1, cx, 88, 16);
    wgg.addColorStop(0, "#eaffff"); wgg.addColorStop(0.5, "#49d8ff"); wgg.addColorStop(1, "#0b6f9e");
    c.shadowColor = "#49d8ff"; c.shadowBlur = 14; c.fillStyle = wgg;
    c.beginPath(); c.ellipse(cx, 90, 12, 17, 0, 0, Math.PI * 2); c.fill();
    c.restore();

    // ---- plasma engine nozzles (glowing cyan) ----
    c.save(); c.shadowColor = "#33e6ff"; c.shadowBlur = 16;
    [-20, 0, 20].forEach((dx, i) => {
      const r = (i === 1 ? 7 : 6) + 3;
      const eg = c.createRadialGradient(cx + dx, 234, 1, cx + dx, 234, r);
      eg.addColorStop(0, "#ffffff"); eg.addColorStop(0.4, "#5fefff"); eg.addColorStop(1, "rgba(40,160,255,0)");
      c.fillStyle = eg; c.beginPath(); c.arc(cx + dx, 234, r, 0, Math.PI * 2); c.fill();
    });
    c.restore();

    // subtle panel lines
    c.strokeStyle = "rgba(180,200,240,0.25)"; c.lineWidth = 1;
    c.beginPath();
    c.moveTo(cx - 15, 118); c.lineTo(cx + 15, 118);
    c.moveTo(cx - 18, 200); c.lineTo(cx + 18, 200);
    c.stroke();
  }

  // Soft round glow sprite (used for fire / smoke / sparks).
  function buildGlow(stops, size) {
    size = size || 64;
    const cv = mk(size, size);
    const c = cv.getContext("2d");
    const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const s of stops) g.addColorStop(s[0], s[1]);
    c.fillStyle = g;
    c.fillRect(0, 0, size, size);
    return cv;
  }

  function init() {
    if (rocket) return;
    buildRocket();
    flame = buildGlow([[0, "rgba(255,255,255,1)"], [0.35, "rgba(90,210,255,0.95)"], [1, "rgba(30,90,255,0)"]]);
    smoke = buildGlow([[0, "rgba(225,225,235,0.85)"], [0.5, "rgba(150,150,170,0.5)"], [1, "rgba(120,120,140,0)"]]);
    spark = buildGlow([[0, "rgba(255,255,255,1)"], [0.5, "rgba(160,220,255,0.9)"], [1, "rgba(90,180,255,0)"]], 32);
  }

  function drawRocket(ctx, x, y, scale, angle) {
    init();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle || 0);
    ctx.scale(scale, scale);
    ctx.drawImage(rocket, -rocket.width / 2, -rocket.height / 2);
    ctx.restore();
  }
  // height of the rocket sprite in local (unscaled) units — handy for nozzle math
  function rocketHeight() { init(); return rocket.height; }

  // ---- Sprite-based particle emitter ----
  function Emitter(kind) {
    init();
    this.sprite = kind === "smoke" ? smoke : kind === "spark" ? spark : flame;
    this.additive = kind !== "smoke";       // fire/sparks glow, smoke does not
    this.ps = [];
  }
  Emitter.prototype.spawn = function (o) {
    this.ps.push({
      x: o.x, y: o.y,
      vx: o.vx || 0, vy: o.vy || 0,
      life: 1, decay: o.decay || 1.6,
      size: o.size || 30, grow: o.grow || 0,
      grav: o.grav || 0, drag: o.drag == null ? 0.98 : o.drag,
      rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 5,
      tint: o.tint || null,
    });
  };
  Emitter.prototype.update = function (dt) {
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const p = this.ps[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.grav * dt;
      p.vx *= p.drag; p.vy *= p.drag;
      p.size += p.grow * dt;
      p.rot += p.spin * dt;
      p.life -= p.decay * dt;
      if (p.life <= 0) this.ps.splice(i, 1);
    }
  };
  Emitter.prototype.draw = function (ctx) {
    if (!this.ps.length) return;
    ctx.save();
    if (this.additive) ctx.globalCompositeOperation = "lighter";
    for (const p of this.ps) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      const s = Math.max(1, p.size);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.drawImage(this.sprite, -s / 2, -s / 2, s, s);
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  };
  Emitter.prototype.count = function () { return this.ps.length; };

  return { init, drawRocket, rocketHeight, Emitter };
})();
