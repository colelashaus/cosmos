/* ============================================================
   three3d.js — cinematic 3D background layer (Three.js).
   Equirectangular NASA-style planet maps on real spheres, a Milky
   Way skybox, Earth clouds + atmosphere glow, Saturn's rings, a
   glowing sun, ACES tone mapping and Unreal-bloom post-processing,
   plus a warp-speed starfield for launches.

   Degrades gracefully: if WebGL / Three.js is unavailable, init()
   returns false and the game falls back to the 2D starfield.

   Public API:
     CTQ.three.init() -> boolean
     CTQ.three.enabled
     CTQ.three.update(dt)
     CTQ.three.setScene('menu'|'asteroid'|'fuel'|'rescue')
     CTQ.three.setDestination(key)
     CTQ.three.setWarp(level)
   ============================================================ */
window.CTQ = window.CTQ || {};

CTQ.three = (function () {
  const api = { enabled: false };

  const TX = "assets/textures/";
  const MAP = {
    earth: TX + "earth_day.jpg",
    clouds: TX + "earth_clouds.jpg",
    moon: TX + "moon.jpg",
    mars: TX + "mars.jpg",
    jupiter: TX + "jupiter.jpg",
    saturn: TX + "saturn.jpg",
    saturnRing: TX + "saturn_ring.png",
    sun: TX + "sun.jpg",
    neptune: TX + "neptune.jpg",
    venus: TX + "venus.jpg",
    milkyway: TX + "stars_milkyway.jpg",
  };
  const R = 16; // hero planet radius

  let renderer, scene, camera, composer, bloom;
  let skybox, stars, starGeo, starPos, starN = 1200;
  let dirLight;
  let planets = {};            // key -> {group, spin, clouds?, atmo?}
  let ambient = [];
  let station = null, asteroids = [], rocket3D = null;
  let rocketFly = 0, rocketFlying = false;
  let hero = null, heroKey = "earth";
  let warp = 0, warpTarget = 0, mode = "menu", t = 0;
  let lastW = 0, lastH = 0;
  const texCache = {};

  function tex(key, srgb) {
    if (texCache[key]) return texCache[key];
    const src = MAP[key];
    if (!src) return null;
    const tx = new THREE.TextureLoader().load(src);
    if (srgb && "sRGBEncoding" in THREE) tx.encoding = THREE.sRGBEncoding;
    texCache[key] = tx;
    return tx;
  }

  // soft radial glow sprite (sun corona / atmosphere puff)
  function glowSprite(color, size) {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d").createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, color); g.addColorStop(0.4, color.replace("1)", "0.5)")); g.addColorStop(1, "rgba(0,0,0,0)");
    const cx = c.getContext("2d"); cx.fillStyle = g; cx.fillRect(0, 0, 128, 128);
    const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    const s = new THREE.Sprite(mat); s.scale.setScalar(size);
    return s;
  }

  // fresnel atmosphere shell
  function atmosphere(radius, color) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { glowColor: { value: new THREE.Color(color) }, power: { value: 3.2 } },
      vertexShader:
        "varying vec3 vN; varying vec3 vP;" +
        "void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }",
      fragmentShader:
        "uniform vec3 glowColor; uniform float power; varying vec3 vN; varying vec3 vP;" +
        "void main(){ vec3 v = normalize(-vP); float f = pow(1.0 - abs(dot(vN, v)), power); gl_FragColor = vec4(glowColor, f); }",
      transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false,
    });
    return new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 48), mat);
  }

  function buildPlanet(key) {
    const group = new THREE.Group();
    const isSun = key === "sun";
    const sphereMat = isSun
      ? new THREE.MeshBasicMaterial({ map: tex(key, true) })
      : new THREE.MeshStandardMaterial({ map: tex(key, true), roughness: 1, metalness: 0 });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(R, 72, 72), sphereMat);
    group.add(sphere);

    const data = { group, spin: 0.08, clouds: null };

    if (key === "earth") {
      const clouds = new THREE.Mesh(
        new THREE.SphereGeometry(R * 1.012, 72, 72),
        new THREE.MeshStandardMaterial({ alphaMap: tex("clouds", false), transparent: true, color: 0xffffff, roughness: 1, metalness: 0, depthWrite: false, opacity: 0.9 })
      );
      group.add(clouds); data.clouds = clouds;
      group.add(atmosphere(R * 1.13, 0x5ab6ff));
      group.userData.tilt = 0.41;
    } else if (key === "mars") {
      group.add(atmosphere(R * 1.10, 0xd98a5a));
    } else if (key === "saturn") {
      const ring = ringMesh(R * 1.35, R * 2.3, tex("saturnRing", true));
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
      group.rotation.z = 0.47; // axial tilt
    } else if (key === "jupiter") {
      // faint dusty ring system
      const ring = ringMesh(R * 1.28, R * 1.62, tex("saturnRing", true), { opacity: 0.22 });
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
      group.rotation.z = 0.05;
    } else if (isSun) {
      group.add(glowSprite("rgba(255,200,90,1)", R * 5));
      data.spin = 0.03;
    }

    group.visible = false;
    scene.add(group);
    return data;
  }

  // Generic flat ring with UVs remapped so a horizontal strip texture maps radially.
  function ringMesh(inner, outer, texture, opts) {
    opts = opts || {};
    const geo = new THREE.RingGeometry(inner, outer, opts.seg || 120, 2);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const r = Math.sqrt(x * x + y * y);
      uv.setXY(i, (r - inner) / (outer - inner), 0.5);
    }
    uv.needsUpdate = true;
    const mat = new THREE.MeshBasicMaterial({
      map: texture, side: THREE.DoubleSide, transparent: true,
      opacity: opts.opacity == null ? 1 : opts.opacity, depthWrite: false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    return new THREE.Mesh(geo, mat);
  }

  // Hot glowing gradient strip for a black-hole accretion disk.
  function hotRingTexture() {
    const w = 256, h = 8, c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"), grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0.0, "rgba(0,0,0,0)");
    grad.addColorStop(0.12, "rgba(140,45,10,0.45)");
    grad.addColorStop(0.42, "rgba(255,120,30,0.95)");
    grad.addColorStop(0.62, "rgba(255,235,180,1)");
    grad.addColorStop(0.80, "rgba(255,150,45,0.9)");
    grad.addColorStop(1.0, "rgba(70,18,5,0)");
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    return new THREE.CanvasTexture(c);
  }

  function getPlanet(key) {
    if (!planets[key]) planets[key] = (key === "blackhole") ? buildBlackHole() : buildPlanet(key);
    return planets[key];
  }

  function simplePlanet(key, radius) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 48, 48),
      new THREE.MeshStandardMaterial({ map: tex(key, true), roughness: 1, metalness: 0 })
    );
    m.userData.spin = 0.05 + Math.random() * 0.05;
    return m;
  }

  // ---- Interstellar-style black hole (Gargantua) ----
  function buildBlackHole() {
    const group = new THREE.Group();
    // event horizon — pure black
    group.add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.42, 48, 48), new THREE.MeshBasicMaterial({ color: 0x000000 })));
    // accretion disk: near edge-on, spins in its own plane
    const diskPivot = new THREE.Group();
    diskPivot.rotation.x = Math.PI / 2 - 0.32;
    const disk = ringMesh(R * 0.55, R * 1.18, hotRingTexture(), { additive: true, seg: 200 });
    diskPivot.add(disk);
    group.add(diskPivot);
    // photon ring — bright halo around the horizon (faces camera)
    const photon = new THREE.Mesh(
      new THREE.TorusGeometry(R * 0.47, R * 0.02, 16, 140),
      new THREE.MeshBasicMaterial({ color: 0xffe6b0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })
    );
    group.add(photon);
    group.visible = false;
    scene.add(group);
    return { group, spin: 0, clouds: null, disk: disk };
  }

  // ---- Rotating space station ----
  function buildStation() {
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0xc2ccda, roughness: 0.45, metalness: 0.85 });
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x244a8c, roughness: 0.4, metalness: 0.5, emissive: 0x12275a, emissiveIntensity: 0.6 });
    // central hub along Z
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 5, 18), metal); hub.rotation.x = Math.PI / 2; g.add(hub);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.4, 18), metal); cap.rotation.x = -Math.PI / 2; cap.position.z = 3.2; g.add(cap);
    // solar wings along X
    [-1, 1].forEach(function (s) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.12, 0.12), metal); arm.position.x = s * 3.4; g.add(arm);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 3.6), panelMat); panel.position.x = s * 5.6; g.add(panel);
    });
    // spinning habitat wheel (XY plane, normal Z)
    const wheel = new THREE.Group();
    wheel.add(new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.5, 14, 48), metal));
    for (let i = 0; i < 4; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.3, 0.3), metal); sp.rotation.z = i * Math.PI / 4; wheel.add(sp); }
    g.add(wheel); g.userData.wheel = wheel;
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 8), metal); ant.position.y = 1.6; g.add(ant);
    scene.add(g);
    return g;
  }

  // ---- Drifting 3D asteroid field ----
  function buildAsteroids(n) {
    const arr = [];
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a8273, roughness: 1, metalness: 0, flatShading: true });
    for (let i = 0; i < n; i++) {
      const r = 2 + Math.random() * 3.5;
      const geo = new THREE.IcosahedronGeometry(r, 1);
      const p = geo.attributes.position;
      for (let v = 0; v < p.count; v++) { const f = 0.78 + Math.random() * 0.44; p.setXYZ(v, p.getX(v) * f, p.getY(v) * f, p.getZ(v) * f); }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.position.set((Math.random() - 0.5) * 260, (Math.random() - 0.5) * 170, -70 - Math.random() * 220);
      m.userData = { rx: (Math.random() - 0.5) * 0.5, ry: (Math.random() - 0.5) * 0.5, dx: (Math.random() - 0.5) * 5 };
      scene.add(m); arr.push(m);
    }
    return arr;
  }

  // ---- 3D rocket that flies between planets in Rocket Fuel ----
  function buildRocket3D() {
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xeef3ff, roughness: 0.5, metalness: 0.3 });
    const red = new THREE.MeshStandardMaterial({ color: 0xff5a4a, roughness: 0.5, metalness: 0.2 });
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.72, 3, 20), white));
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.2, 20), red); nose.position.y = 2.1; g.add(nose);
    for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.7), red); fin.position.set(Math.cos(a) * 0.6, -1.4, Math.sin(a) * 0.6); fin.rotation.y = -a; g.add(fin); }
    const glow = glowSprite("rgba(255,180,80,1)", 3.2); glow.position.y = -2.1; g.add(glow);
    g.userData.glow = glow;
    g.visible = false; g.scale.setScalar(1.4);
    scene.add(g);
    return g;
  }

  function buildStars() {
    starGeo = new THREE.BufferGeometry();
    starPos = new Float32Array(starN * 3);
    for (let i = 0; i < starN; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 700;
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 700;
      starPos[i * 3 + 2] = -Math.random() * 700;
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcfe6ff, size: 1.3, sizeAttenuation: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending }));
    scene.add(stars);
  }

  function init() {
    if (api.enabled) return true;
    if (!window.THREE) return false;
    const canvas = document.getElementById("bg3d");
    if (!canvas) return false;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch (e) { return false; }
    if (!renderer) return false;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    if ("outputEncoding" in renderer) renderer.outputEncoding = THREE.sRGBEncoding;
    if ("toneMapping" in renderer) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15; }

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(55, 1, 0.1, 4000);
    camera.position.set(0, 0, 60);

    scene.add(new THREE.AmbientLight(0x404a5a, 0.9));
    dirLight = new THREE.DirectionalLight(0xfff4e6, 2.2);
    dirLight.position.set(-0.6, 0.35, 1);
    scene.add(dirLight);

    // Milky Way skybox
    skybox = new THREE.Mesh(
      new THREE.SphereGeometry(1500, 48, 48),
      new THREE.MeshBasicMaterial({ map: tex("milkyway", true), side: THREE.BackSide })
    );
    scene.add(skybox);

    buildStars();

    hero = getPlanet("earth"); hero.group.visible = true;

    ambient = [];
    const a = simplePlanet("venus", 7); a.position.set(-58, 30, -160); scene.add(a); ambient.push(a);
    const b = simplePlanet("neptune", 5); b.position.set(64, -26, -120); scene.add(b); ambient.push(b);

    // rotating space station, drifting asteroid field, and the interplanetary rocket
    station = buildStation(); station.scale.setScalar(1.5); station.position.set(78, 44, -210);
    asteroids = buildAsteroids(8);
    rocket3D = buildRocket3D();

    setupComposer();
    resize();
    api.enabled = true;
    setScene("menu");
    return true;
  }

  function setupComposer() {
    if (!THREE.EffectComposer || !THREE.RenderPass || !THREE.UnrealBloomPass) { composer = null; return; }
    try {
      composer = new THREE.EffectComposer(renderer);
      composer.addPass(new THREE.RenderPass(scene, camera));
      bloom = new THREE.UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.5, 0.78);
      composer.addPass(bloom);
    } catch (e) { composer = null; }
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    lastW = w; lastH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (composer) composer.setSize(w, h);
  }

  function applyHeroTransform() {
    if (!hero) return;
    const g = hero.group;
    if (mode === "fuel")        { g.position.set(0, 20, -8);  g.scale.setScalar(1.05); }
    else if (mode === "asteroid"){ g.position.set(42, 34, -110); g.scale.setScalar(0.9); }
    else if (mode === "rescue") { g.position.set(-34, 16, -50); g.scale.setScalar(1.0); }
    else                        { g.position.set(36, -4, -24); g.scale.setScalar(1.1); }
  }

  function setScene(m) { mode = m; applyHeroTransform(); }

  function setDestination(key) {
    if (!api.enabled || !key || key === heroKey) return;
    if (hero) hero.group.visible = false;
    heroKey = key;
    hero = getPlanet(key);
    hero.group.visible = true;
    applyHeroTransform();
  }

  function setWarp(level) { warpTarget = Math.max(0, level || 0); }

  function launchRocket() {
    if (!api.enabled || !rocket3D) return;
    rocketFly = 0; rocketFlying = true;
    rocket3D.visible = true;
    rocket3D.scale.setScalar(1.4);
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
      if (hero.disk) hero.disk.rotation.z += dt * 0.7;   // black-hole accretion disk
    }
    for (const p of ambient) p.rotation.y += p.userData.spin * dt;

    // space station: spin habitat wheel + slow tumble
    if (station) { station.userData.wheel.rotation.z += dt * 0.4; station.rotation.y += dt * 0.05; }
    // drifting asteroids
    for (const a of asteroids) {
      a.rotation.x += a.userData.rx * dt; a.rotation.y += a.userData.ry * dt;
      a.position.x += a.userData.dx * dt;
      if (a.position.x > 150) a.position.x = -150; else if (a.position.x < -150) a.position.x = 150;
    }
    // 3D rocket flight (Rocket Fuel launch)
    if (rocketFlying && rocket3D) {
      rocketFly += dt;
      const dur = 2.6, u = Math.min(1, rocketFly / dur), e = u * u * (3 - 2 * u);
      const tx = hero ? hero.group.position.x : 0, ty = hero ? hero.group.position.y : 20, tz = hero ? hero.group.position.z : -8;
      rocket3D.position.set(
        0 + (tx * 0.7 - 0) * e,
        -30 + (ty * 0.7 + 6 - (-30)) * e,
        28 + (tz + 8 - 28) * e
      );
      rocket3D.rotation.y += dt * 3;
      rocket3D.scale.setScalar(1.4 * (1 - 0.6 * e));
      if (u >= 1) { rocketFlying = false; rocket3D.visible = false; }
    }

    // warp starfield
    const speed = 12 + warp * 1000;
    for (let i = 0; i < starN; i++) {
      let z = starPos[i * 3 + 2] + speed * dt;
      if (z > camera.position.z) { z = -700; starPos[i * 3] = (Math.random() - 0.5) * 700; starPos[i * 3 + 1] = (Math.random() - 0.5) * 700; }
      starPos[i * 3 + 2] = z;
    }
    starGeo.attributes.position.needsUpdate = true;
    stars.material.size = 1.3 + warp * 3.5;
    stars.material.opacity = Math.min(1, 0.55 + warp);

    if (warpTarget > 0.02 && hero) hero.group.position.z -= warp * 70 * dt;

    if (composer) composer.render();
    else renderer.render(scene, camera);
  }

  api.init = init;
  api.update = update;
  api.setScene = setScene;
  api.setDestination = setDestination;
  api.setWarp = setWarp;
  api.launchRocket = launchRocket;
  return api;
})();
