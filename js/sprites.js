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

  // A detailed sci-fi rocket, rendered once. Nose points up; (0,0)=center.
  function buildRocket() {
    const W = 140, H = 250;
    rocket = mk(W, H);
    const c = rocket.getContext("2d");
    const cx = W / 2;

    // side boosters
    function booster(x) {
      c.fillStyle = "#aab7cc";
      c.beginPath();
      c.moveTo(x, 95); c.lineTo(x + 20, 95);
      c.lineTo(x + 20, 205); c.lineTo(x + 10, 226); c.lineTo(x, 205);
      c.closePath(); c.fill();
      c.fillStyle = "#ff5a5a"; c.fillRect(x, 95, 20, 9);
    }
    booster(cx - 50); booster(cx + 30);

    // main body
    const g = c.createLinearGradient(cx - 34, 0, cx + 34, 0);
    g.addColorStop(0, "#c2cde2");
    g.addColorStop(0.45, "#ffffff");
    g.addColorStop(1, "#8e9cb6");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(cx, 14);
    c.bezierCurveTo(cx + 36, 64, cx + 32, 160, cx + 26, 204);
    c.lineTo(cx - 26, 204);
    c.bezierCurveTo(cx - 32, 160, cx - 36, 64, cx, 14);
    c.closePath(); c.fill();

    // nose cone
    c.fillStyle = "#ff6b4a";
    c.beginPath();
    c.moveTo(cx, 14);
    c.bezierCurveTo(cx + 20, 44, cx + 17, 60, cx + 15, 70);
    c.lineTo(cx - 15, 70);
    c.bezierCurveTo(cx - 17, 60, cx - 20, 44, cx, 14);
    c.closePath(); c.fill();

    // window
    const wg = c.createRadialGradient(cx - 4, 104, 2, cx, 108, 17);
    wg.addColorStop(0, "#bdeeff");
    wg.addColorStop(1, "#2b86a6");
    c.fillStyle = wg;
    c.beginPath(); c.arc(cx, 108, 16, 0, Math.PI * 2); c.fill();
    c.lineWidth = 3; c.strokeStyle = "#3a4a66"; c.stroke();

    // fins
    c.fillStyle = "#ff7ad5";
    c.beginPath(); c.moveTo(cx - 26, 176); c.lineTo(cx - 48, 220); c.lineTo(cx - 26, 208); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(cx + 26, 176); c.lineTo(cx + 48, 220); c.lineTo(cx + 26, 208); c.closePath(); c.fill();

    // nozzle
    c.fillStyle = "#566784"; c.fillRect(cx - 13, 204, 26, 16);

    // panel lines
    c.strokeStyle = "rgba(90,110,140,0.5)"; c.lineWidth = 2;
    c.beginPath();
    c.moveTo(cx - 20, 128); c.lineTo(cx + 20, 128);
    c.moveTo(cx - 22, 158); c.lineTo(cx + 22, 158);
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
    flame = buildGlow([[0, "rgba(255,255,220,1)"], [0.35, "rgba(255,160,40,0.95)"], [1, "rgba(255,60,20,0)"]]);
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
