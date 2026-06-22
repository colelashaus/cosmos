/* ============================================================
   three3d.js — cinematic 3D layer on the modern Three.js WebGPU
   renderer (ES module). Uses WebGPU when available and AUTOMATICALLY
   falls back to WebGL2 on devices without it; if even that fails to
   render, init() resolves false and the game keeps its 2D starfield.

   Same public API as before (exposed on window.CTQ.three):
     init() -> Promise<boolean>   (self-runs on load)
     enabled, update(dt), setScene(mode), setDestination(key),
     setWarp(level), launchRocket()
   ============================================================ */
import * as THREE from "three";
import { pass, bloom, PostProcessing, uniform, Fn, screenUV, vec2, float } from "three";

window.CTQ = window.CTQ || {};

CTQ.three = (function () {
  const api = { enabled: false };

  const TX = "assets/textures/";
  const MAP = {
    earth: TX + "earth_day.jpg", clouds: TX + "earth_clouds.jpg", moon: TX + "moon.jpg",
    mars: TX + "mars.jpg", jupiter: TX + "jupiter.jpg", saturn: TX + "saturn.jpg",
    saturnRing: TX + "saturn_ring.png", sun: TX + "sun.jpg", neptune: TX + "neptune.jpg",
    venus: TX + "venus.jpg", milkyway: TX + "stars_milkyway.jpg",
  };
  const R = 16;

  let renderer, scene, camera, post = null, busy = false;
  let skybox, stars, starGeo, starPos, starN = 1200;
  let planets = {}, ambient = [], station = null, asteroids = [], rocket3D = null;
  let rocketFly = 0, rocketFlying = false;
  let hero = null, heroKey = "earth";
  let nebulae = [];
  let uLensPos = null, uLensStr = null, uAspect = null;
  let warp = 0, warpTarget = 0, mode = "menu", t = 0, lastW = 0, lastH = 0;
  const texCache = {};

  function tex(key, srgb) {
    if (texCache[key]) return texCache[key];
    const src = MAP[key]; if (!src) return null;
    const tx = new THREE.TextureLoader().load(src);
    if (srgb) tx.colorSpace = THREE.SRGBColorSpace;
    texCache[key] = tx; return tx;
  }

  function glowSprite(colorStr, size) {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const cx = c.getContext("2d"), g = cx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, colorStr); g.addColorStop(0.4, colorStr.replace("1)", "0.5)")); g.addColorStop(1, "rgba(0,0,0,0)");
    cx.fillStyle = g; cx.fillRect(0, 0, 128, 128);
    const mat = new THREE.SpriteNodeMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    const s = new THREE.Sprite(mat); s.scale.setScalar(size); return s;
  }

  // soft additive atmosphere shell (bloom makes it glow)
  function atmosphere(radius, colr) {
    return new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 48),
      new THREE.MeshBasicNodeMaterial({ color: colr, transparent: true, opacity: 0.16, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  }

  function ringMesh(inner, outer, texture, opts) {
    opts = opts || {};
    const geo = new THREE.RingGeometry(inner, outer, opts.seg || 120, 2);
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); const r = Math.sqrt(x * x + y * y); uv.setXY(i, (r - inner) / (outer - inner), 0.5); }
    uv.needsUpdate = true;
    return new THREE.Mesh(geo, new THREE.MeshBasicNodeMaterial({ map: texture, side: THREE.DoubleSide, transparent: true, opacity: opts.opacity == null ? 1 : opts.opacity, depthWrite: false, blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
  }

  function hotRingTexture() {
    const w = 256, h = 8, c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"), grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0.0, "rgba(0,0,0,0)"); grad.addColorStop(0.12, "rgba(140,45,10,0.45)");
    grad.addColorStop(0.42, "rgba(255,120,30,0.95)"); grad.addColorStop(0.62, "rgba(255,235,180,1)");
    grad.addColorStop(0.80, "rgba(255,150,45,0.9)"); grad.addColorStop(1.0, "rgba(70,18,5,0)");
    g.fillStyle = grad; g.fillRect(0, 0, w, h); return new THREE.CanvasTexture(c);
  }

  // radial "god ray" starburst — many soft spokes from the centre
  function raysTexture() {
    const S = 512, c = document.createElement("canvas"); c.width = c.height = S;
    const g = c.getContext("2d"); g.translate(S / 2, S / 2);
    const rng = (n) => ((Math.sin(n * 12.9898) * 43758.5453) % 1 + 1) % 1; // deterministic
    for (let i = 0; i < 140; i++) {
      const a = (i / 140) * Math.PI * 2 + rng(i) * 0.1;
      const len = S * (0.28 + rng(i + 7) * 0.22);
      const wdt = 0.004 + rng(i + 3) * 0.012;
      const grad = g.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
      grad.addColorStop(0, "rgba(255,235,170,0.5)"); grad.addColorStop(1, "rgba(255,180,80,0)");
      g.strokeStyle = grad; g.lineWidth = S * wdt;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * len, Math.sin(a) * len); g.stroke();
    }
    return new THREE.CanvasTexture(c);
  }

  function buildPlanet(key) {
    const group = new THREE.Group();
    const isSun = key === "sun";
    const mat = isSun
      ? new THREE.MeshBasicNodeMaterial({ map: tex(key, true) })
      : new THREE.MeshStandardNodeMaterial({ map: tex(key, true), roughness: 1, metalness: 0 });
    group.add(new THREE.Mesh(new THREE.SphereGeometry(R, 72, 72), mat));
    const data = { group, spin: 0.08, clouds: null, disk: null };

    if (key === "earth") {
      const clouds = new THREE.Mesh(new THREE.SphereGeometry(R * 1.012, 72, 72),
        new THREE.MeshStandardNodeMaterial({ alphaMap: tex("clouds", false), transparent: true, color: 0xffffff, roughness: 1, metalness: 0, depthWrite: false, opacity: 0.9 }));
      group.add(clouds); data.clouds = clouds;
      group.add(atmosphere(R * 1.16, 0x5ab6ff));
    } else if (key === "mars") {
      group.add(atmosphere(R * 1.12, 0xd98a5a));
    } else if (key === "saturn") {
      const ring = ringMesh(R * 1.35, R * 2.3, tex("saturnRing", true)); ring.rotation.x = Math.PI / 2; group.add(ring); group.rotation.z = 0.47;
    } else if (key === "jupiter") {
      const ring = ringMesh(R * 1.28, R * 1.62, tex("saturnRing", true), { opacity: 0.22 }); ring.rotation.x = Math.PI / 2; group.add(ring); group.rotation.z = 0.05;
    } else if (isSun) {
      group.add(glowSprite("rgba(255,200,90,1)", R * 4.5));
      const rays = new THREE.Sprite(new THREE.SpriteNodeMaterial({ map: raysTexture(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.7 }));
      rays.scale.setScalar(R * 9); group.add(rays); data.rays = rays;
      data.spin = 0.03;
    }
    group.visible = false; scene.add(group); return data;
  }

  function buildBlackHole() {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.42, 48, 48), new THREE.MeshBasicNodeMaterial({ color: 0x000000 })));
    const pivot = new THREE.Group(); pivot.rotation.x = Math.PI / 2 - 0.32;
    const disk = ringMesh(R * 0.55, R * 1.18, hotRingTexture(), { additive: true, seg: 200 }); pivot.add(disk); group.add(pivot);
    const photon = new THREE.Mesh(new THREE.TorusGeometry(R * 0.47, R * 0.02, 16, 140),
      new THREE.MeshBasicNodeMaterial({ color: 0xffe6b0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    group.add(photon);
    group.visible = false; scene.add(group); return { group, spin: 0, clouds: null, disk };
  }

  function getPlanet(key) {
    if (!planets[key]) planets[key] = (key === "blackhole") ? buildBlackHole() : buildPlanet(key);
    return planets[key];
  }

  function simplePlanet(key, radius) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 48), new THREE.MeshStandardNodeMaterial({ map: tex(key, true), roughness: 1, metalness: 0 }));
    m.userData.spin = 0.05 + Math.random() * 0.05; return m;
  }

  function buildStation() {
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardNodeMaterial({ color: 0xc2ccda, roughness: 0.45, metalness: 0.85 });
    const panelMat = new THREE.MeshStandardNodeMaterial({ color: 0x244a8c, roughness: 0.4, metalness: 0.5, emissive: 0x12275a, emissiveIntensity: 0.6 });
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 5, 18), metal); hub.rotation.x = Math.PI / 2; g.add(hub);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1, 1.4, 18), metal); cap.rotation.x = -Math.PI / 2; cap.position.z = 3.2; g.add(cap);
    [-1, 1].forEach((s) => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.12, 0.12), metal); arm.position.x = s * 3.4; g.add(arm);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 3.6), panelMat); panel.position.x = s * 5.6; g.add(panel);
    });
    const wheel = new THREE.Group();
    wheel.add(new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.5, 14, 48), metal));
    for (let i = 0; i < 4; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.3, 0.3), metal); sp.rotation.z = i * Math.PI / 4; wheel.add(sp); }
    g.add(wheel); g.userData.wheel = wheel;
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 8), metal)).position.y = 1.6;
    scene.add(g); return g;
  }

  function buildAsteroids(n) {
    const arr = [], mat = new THREE.MeshStandardNodeMaterial({ color: 0x8a8273, roughness: 1, metalness: 0, flatShading: true });
    for (let i = 0; i < n; i++) {
      const r = 2 + Math.random() * 3.5, geo = new THREE.IcosahedronGeometry(r, 1), p = geo.attributes.position;
      for (let v = 0; v < p.count; v++) { const f = 0.78 + Math.random() * 0.44; p.setXYZ(v, p.getX(v) * f, p.getY(v) * f, p.getZ(v) * f); }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.position.set((Math.random() - 0.5) * 260, (Math.random() - 0.5) * 170, -70 - Math.random() * 220);
      m.userData = { rx: (Math.random() - 0.5) * 0.5, ry: (Math.random() - 0.5) * 0.5, dx: (Math.random() - 0.5) * 5 };
      scene.add(m); arr.push(m);
    }
    return arr;
  }

  // A detailed year-3167 starship (Star Trek-inspired: saucer + engineering
  // hull + warp nacelles, with glowing deflector, bussard collectors, warp
  // grilles and running lights). Built facing -Z so lookAt() aims it forward.
  function buildStarship() {
    const g = new THREE.Group();
    const hull = new THREE.MeshStandardNodeMaterial({ color: 0xd2dae8, roughness: 0.32, metalness: 0.75 });
    const hullDark = new THREE.MeshStandardNodeMaterial({ color: 0x9aa6bc, roughness: 0.4, metalness: 0.7 });
    const glowBlue = new THREE.MeshStandardNodeMaterial({ color: 0x0a2740, emissive: 0x3aa6ff, emissiveIntensity: 2.6, roughness: 0.4, metalness: 0.2 });
    const glowWarp = new THREE.MeshStandardNodeMaterial({ color: 0x0a1840, emissive: 0x5e8bff, emissiveIntensity: 3.0, roughness: 0.5 });
    const glowAmber = new THREE.MeshStandardNodeMaterial({ color: 0x3a1e00, emissive: 0xffae3a, emissiveIntensity: 3.0 });
    const glowRed = new THREE.MeshStandardNodeMaterial({ color: 0x3a0a06, emissive: 0xff4422, emissiveIntensity: 3.0 });

    // --- saucer (primary hull) at front (-Z) ---
    const saucer = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.42, 64), hull);
    saucer.scale.set(1, 1, 1); saucer.rotation.x = Math.PI / 2; saucer.position.z = -2.2; g.add(saucer);
    const saucerEdge = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.12, 12, 64), glowBlue);
    saucerEdge.position.z = -2.2; g.add(saucerEdge);
    const bridge = new THREE.Mesh(new THREE.SphereGeometry(0.7, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), hull);
    bridge.position.set(0, 0.28, -2.2); g.add(bridge);

    // --- neck ---
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 2.2), hullDark);
    neck.position.set(0, -0.15, -1.0); neck.rotation.x = 0.25; g.add(neck);

    // --- engineering hull (secondary) along Z ---
    const eng = new THREE.Mesh(new THREE.CapsuleGeometry(0.85, 2.4, 8, 20), hull);
    eng.rotation.x = Math.PI / 2; eng.position.set(0, -0.45, 0.9); g.add(eng);
    // deflector dish at the front of the engineering hull
    const dish = new THREE.Mesh(new THREE.CircleGeometry(0.62, 32), glowAmber);
    dish.position.set(0, -0.45, -0.55); g.add(dish);

    // --- warp nacelles + pylons ---
    [-1, 1].forEach((s) => {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.5, 1.0), hullDark);
      pylon.position.set(s * 1.0, 0.2, 1.4); pylon.rotation.z = s * 0.5; g.add(pylon);
      const nacelle = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 2.6, 8, 18), hull);
      nacelle.rotation.x = Math.PI / 2; nacelle.position.set(s * 1.9, 0.95, 1.2); g.add(nacelle);
      // bussard collector (glowing red) at the front
      const bussard = new THREE.Mesh(new THREE.SphereGeometry(0.36, 20, 16), glowRed);
      bussard.position.set(s * 1.9, 0.95, -0.35); g.add(bussard);
      // warp grille (glowing blue strip) along the nacelle
      const grille = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 2.2), glowWarp);
      grille.position.set(s * (1.9 - 0.32), 0.95, 1.3); g.add(grille);
      const grille2 = grille.clone(); grille2.position.x = s * (1.9 + 0.32); g.add(grille2);
      // rear warp glow
      const trail = glowSprite("rgba(120,170,255,1)", 1.5); trail.position.set(s * 1.9, 0.95, 2.6); g.add(trail);
    });

    // running lights along the saucer
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const lite = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), glowBlue);
      lite.position.set(Math.cos(a) * 2.35, 0.06, -2.2 + Math.sin(a) * 2.35); g.add(lite);
    }

    g.visible = false; g.scale.setScalar(0.9); scene.add(g); return g;
  }

  function buildStars() {
    starGeo = new THREE.BufferGeometry(); starPos = new Float32Array(starN * 3);
    for (let i = 0; i < starN; i++) { starPos[i * 3] = (Math.random() - 0.5) * 700; starPos[i * 3 + 1] = (Math.random() - 0.5) * 700; starPos[i * 3 + 2] = -Math.random() * 700; }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    stars = new THREE.Points(starGeo, new THREE.PointsNodeMaterial({ color: 0xcfe6ff, size: 1.3, sizeAttenuation: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending }));
    scene.add(stars);
  }

  // GPU-particle nebula clouds (additive coloured point blobs, far away)
  function buildNebulae() {
    const defs = [
      { c: 0xff4fa3, p: [-200, 90, -420], s: 130, n: 420 },
      { c: 0x4fd0ff, p: [220, -70, -460], s: 150, n: 460 },
      { c: 0x9b6bff, p: [70, 150, -520], s: 140, n: 420 },
    ];
    const arr = [];
    for (const d of defs) {
      const geo = new THREE.BufferGeometry(), pos = new Float32Array(d.n * 3);
      for (let i = 0; i < d.n; i++) {
        const r = Math.pow(Math.random(), 2) * d.s, th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1);
        pos[i * 3] = d.p[0] + r * Math.sin(ph) * Math.cos(th);
        pos[i * 3 + 1] = d.p[1] + r * Math.sin(ph) * Math.sin(th);
        pos[i * 3 + 2] = d.p[2] + r * Math.cos(ph);
      }
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const m = new THREE.Points(geo, new THREE.PointsNodeMaterial({ color: d.c, size: 7, sizeAttenuation: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.userData.spin = (Math.random() - 0.5) * 0.02;
      scene.add(m); arr.push(m);
    }
    return arr;
  }

  // Post-processing chain. withLensing adds a screen-space gravitational lens
  // (used only around the black hole). Falls back to bloom-only if TSL sampling
  // isn't supported on the active backend.
  function buildPost(withLensing) {
    post = new PostProcessing(renderer);
    const scenePass = pass(scene, camera);
    let colorNode = scenePass.getTextureNode();
    if (withLensing) {
      uLensPos = uniform(new THREE.Vector2(0.5, 0.5));
      uLensStr = uniform(0);
      uAspect = uniform(1);
      const lp = uLensPos, ls = uLensStr, asp = uAspect, src = colorNode;
      colorNode = Fn(() => {
        const uv = screenUV;
        const d = uv.sub(lp);
        const dc = vec2(d.x.mul(asp), d.y);
        const dist = dc.length().max(float(0.0001));
        const strength = ls.div(dist.mul(dist).add(float(0.004))).min(float(0.4));
        const dir = dc.div(dist);
        const off = vec2(dir.x.div(asp), dir.y).mul(strength);
        return src.uv(uv.sub(off));
      })();
    } else {
      uLensPos = uLensStr = uAspect = null;
    }
    post.outputNode = colorNode.add(bloom(colorNode, 0.95, 0.5, 0.68));
  }

  async function setupPost() {
    for (const lz of [true, false]) {
      try { buildPost(lz); await post.renderAsync(); return; }
      catch (e) { post = null; uLensPos = uLensStr = uAspect = null; }
    }
  }

  async function init() {
    if (api.enabled) return true;
    const canvas = document.getElementById("bg3d");
    if (!canvas || !THREE.WebGPURenderer) return false;
    try {
      renderer = new THREE.WebGPURenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      await renderer.init();

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(55, 1, 0.1, 4000); camera.position.set(0, 0, 60);
      scene.add(new THREE.AmbientLight(0x404a5a, 0.9));
      const dir = new THREE.DirectionalLight(0xfff4e6, 2.4); dir.position.set(-0.6, 0.35, 1); scene.add(dir);

      skybox = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 48), new THREE.MeshBasicNodeMaterial({ map: tex("milkyway", true), side: THREE.BackSide }));
      scene.add(skybox);
      buildStars();

      hero = getPlanet("earth"); hero.group.visible = true;
      const a = simplePlanet("venus", 7); a.position.set(-58, 30, -160); scene.add(a); ambient.push(a);
      const b = simplePlanet("neptune", 5); b.position.set(64, -26, -120); scene.add(b); ambient.push(b);
      station = buildStation(); station.scale.setScalar(1.5); station.position.set(78, 44, -210);
      asteroids = buildAsteroids(8);
      nebulae = buildNebulae();
      rocket3D = buildStarship();

      resize();
      setScene("menu");

      // post-processing (lensing + bloom), with verified-render fallback ladder
      await setupPost();
      try { await (post ? post.renderAsync() : renderer.renderAsync(scene, camera)); }
      catch (e) { post = null; await renderer.renderAsync(scene, camera); }

      api.enabled = true;
      const label = (renderer.backend && renderer.backend.isWebGPUBackend) ? "WebGPU" : "WebGL2";
      const badge = document.getElementById("gpu-badge");
      if (badge) badge.textContent = "⚡ " + label;
      if (CTQ.engine && CTQ.engine.setStarfield2D) CTQ.engine.setStarfield2D(false);
      return true;
    } catch (e) {
      api.enabled = false;
      return false;
    }
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight; lastW = w; lastH = h;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    if (post && post.setSize) post.setSize(w, h);
  }

  function applyHeroTransform() {
    if (!hero) return; const g = hero.group;
    if (mode === "fuel") { g.position.set(0, 20, -8); g.scale.setScalar(1.05); }
    else if (mode === "asteroid") { g.position.set(42, 34, -110); g.scale.setScalar(0.9); }
    else if (mode === "rescue") { g.position.set(-34, 16, -50); g.scale.setScalar(1.0); }
    else { g.position.set(36, -4, -24); g.scale.setScalar(1.1); }
  }
  function setScene(m) { mode = m; applyHeroTransform(); }
  function setDestination(key) {
    if (!api.enabled || !key || key === heroKey) return;
    if (hero) hero.group.visible = false;
    heroKey = key; hero = getPlanet(key); hero.group.visible = true; applyHeroTransform();
  }
  function setWarp(level) { warpTarget = Math.max(0, level || 0); }
  function launchRocket() { if (!api.enabled || !rocket3D) return; rocketFly = 0; rocketFlying = true; rocket3D.visible = true; rocket3D.scale.setScalar(0.9); }

  function renderFrame() {
    if (busy) return; busy = true;
    const p = post ? post.renderAsync() : renderer.renderAsync(scene, camera);
    Promise.resolve(p).then(() => { busy = false; }).catch(() => { busy = false; });
  }

  function update(dt) {
    if (!api.enabled) return;
    t += dt;
    if (window.innerWidth !== lastW || window.innerHeight !== lastH) resize();
    warp += (warpTarget - warp) * Math.min(1, dt * 6);

    if (skybox) skybox.rotation.y += dt * 0.005;
    if (hero) {
      hero.group.rotation.y += hero.spin * dt;
      if (hero.clouds) hero.clouds.rotation.y += hero.spin * 0.4 * dt;
      if (hero.disk) hero.disk.rotation.z += dt * 0.7;
      if (hero.rays) hero.rays.material.rotation += dt * 0.05;   // sun god-rays
    }
    for (const p of ambient) p.rotation.y += p.userData.spin * dt;
    for (const nb of nebulae) nb.rotation.y += nb.userData.spin * dt;
    if (station) { station.userData.wheel.rotation.z += dt * 0.4; station.rotation.y += dt * 0.05; }
    for (const a of asteroids) { a.rotation.x += a.userData.rx * dt; a.rotation.y += a.userData.ry * dt; a.position.x += a.userData.dx * dt; if (a.position.x > 150) a.position.x = -150; else if (a.position.x < -150) a.position.x = 150; }

    if (rocketFlying && rocket3D) {
      rocketFly += dt; const dur = 2.8, u = Math.min(1, rocketFly / dur), e = u * u * (3 - 2 * u);
      const tx = hero ? hero.group.position.x : 0, ty = hero ? hero.group.position.y : 20, tz = hero ? hero.group.position.z : -8;
      rocket3D.position.set((tx * 0.7) * e, -28 + (ty * 0.7 + 6 + 28) * e, 30 + (tz + 8 - 30) * e);
      if (hero) rocket3D.lookAt(hero.group.position);        // face the destination
      rocket3D.rotateZ(Math.sin(rocketFly * 1.5) * 0.22);    // gentle bank
      rocket3D.scale.setScalar(0.9 * (1 - 0.55 * e));
      if (u >= 1) { rocketFlying = false; rocket3D.visible = false; }
    }

    const speed = 12 + warp * 1000;
    for (let i = 0; i < starN; i++) { let z = starPos[i * 3 + 2] + speed * dt; if (z > camera.position.z) { z = -700; starPos[i * 3] = (Math.random() - 0.5) * 700; starPos[i * 3 + 1] = (Math.random() - 0.5) * 700; } starPos[i * 3 + 2] = z; }
    starGeo.attributes.position.needsUpdate = true;
    stars.material.size = 1.3 + warp * 3.5; stars.material.opacity = Math.min(1, 0.55 + warp);
    if (warpTarget > 0.02 && hero) hero.group.position.z -= warp * 70 * dt;

    // drive the gravitational lens onto the black hole's screen position
    if (uLensStr) {
      if (heroKey === "blackhole" && hero && hero.group.visible) {
        const v = hero.group.position.clone().project(camera);
        uLensPos.value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
        uLensStr.value = 0.014; uAspect.value = camera.aspect;
      } else { uLensStr.value = 0; }
    }

    renderFrame();
  }

  api.init = init; api.update = update; api.setScene = setScene; api.setDestination = setDestination; api.setWarp = setWarp; api.launchRocket = launchRocket;
  api._dbg = function () {
    const types = {};
    if (scene) scene.traverse((o) => { if (o.material) { const m = Array.isArray(o.material) ? o.material[0] : o.material; types[m.type] = (types[m.type] || 0) + 1; } });
    return { bloom: !!post, lens: !!uLensStr, isWebGPU: !!(renderer && renderer.backend && renderer.backend.isWebGPUBackend), calls: renderer ? renderer.info.render.calls : null, tris: renderer ? renderer.info.render.triangles : null, matTypes: types };
  };
  return api;
})();

// self-initialize (module runs after the classic scripts have defined CTQ.engine etc.)
CTQ.three.init().catch(() => {});
