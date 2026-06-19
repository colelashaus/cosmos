/* ============================================================
   three3d.js — optional 3D background layer (Three.js).
   Renders a starfield + rotating, NASA-textured planet spheres
   behind the 2D gameplay. Degrades gracefully: if WebGL or the
   library is unavailable, init() returns false and the game keeps
   using the 2D starfield.

   Public API (all no-ops until init() succeeds):
     CTQ.three.init()                -> boolean (true if 3D is live)
     CTQ.three.enabled               -> boolean
     CTQ.three.update(dt)            -> render one frame
     CTQ.three.setScene(mode)        -> 'menu'|'asteroid'|'fuel'|'rescue'
     CTQ.three.setDestination(key)   -> feature a planet (Rocket Fuel)
     CTQ.three.setWarp(level)        -> 0..~1.2 warp-speed star streaks
   ============================================================ */
window.CTQ = window.CTQ || {};

CTQ.three = (function () {
  const api = { enabled: false };

  let renderer, scene, camera, canvas;
  let starGeo, starPos, starN = 1600, stars;
  let hero = null;                 // featured planet (textured sphere)
  let bgPlanets = [];              // ambient drifting planets
  let warp = 0, warpTarget = 0;
  let mode = "menu";
  let texCache = {};
  let lastW = 0, lastH = 0;
  let heroKey = "earth";

  function tex(key) {
    if (texCache[key]) return texCache[key];
    const src = (CTQ.data.IMAGES || {})[key];
    if (!src) return null;
    const t = new THREE.TextureLoader().load(src);
    if ("colorSpace" in t) t.colorSpace = THREE.SRGBColorSpace;
    texCache[key] = t;
    return t;
  }

  function makePlanet(key, radius) {
    const isSun = key === "sun";
    const mat = new THREE.MeshPhongMaterial({
      map: tex(key),
      shininess: isSun ? 0 : 6,
      emissive: isSun ? 0xffaa33 : 0x111418,
      emissiveIntensity: isSun ? 0.7 : 0.25,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 48), mat);
    mesh.userData.spin = 0.06 + Math.random() * 0.06;
    mesh.rotation.z = (Math.random() - 0.5) * 0.5;   // slight axial tilt
    return mesh;
  }

  function buildStars() {
    starGeo = new THREE.BufferGeometry();
    starPos = new Float32Array(starN * 3);
    for (let i = 0; i < starN; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 700;
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 700;
      starPos[i * 3 + 2] = -Math.random() * 700;       // ahead of the camera
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: true, transparent: true, opacity: 0.9 });
    stars = new THREE.Points(starGeo, mat);
    scene.add(stars);
  }

  function init() {
    if (api.enabled) return true;
    if (!window.THREE) return false;
    canvas = document.getElementById("bg3d");
    if (!canvas) return false;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
    } catch (e) { return false; }
    if (!renderer) return false;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(55, 1, 0.1, 3000);
    camera.position.set(0, 0, 60);

    scene.add(new THREE.AmbientLight(0x556677, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.15);
    sun.position.set(-1, 0.5, 1.2);
    scene.add(sun);

    buildStars();

    hero = makePlanet(heroKey, 16);
    scene.add(hero);

    // a couple of distant ambient planets
    const a = makePlanet("jupiter", 9); a.position.set(-46, 26, -120); scene.add(a);
    const b = makePlanet("mars", 5); b.position.set(52, -20, -90); scene.add(b);
    bgPlanets = [a, b];

    resize();
    api.enabled = true;
    setScene("menu");
    return true;
  }

  function resize() {
    if (!api.enabled && !renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    lastW = w; lastH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // Place the hero planet for the current screen.
  function setScene(m) {
    mode = m;
    if (!api.enabled) return;
    if (m === "fuel") {
      hero.position.set(0, 20, -10);   // up top, behind the 2D destination dial
      hero.scale.setScalar(1.0);
    } else if (m === "asteroid") {
      hero.position.set(40, 32, -90);  // distant world up high (2D Earth is the one you defend)
      hero.scale.setScalar(1.0);
    } else if (m === "rescue") {
      hero.position.set(-30, 14, -40);
      hero.scale.setScalar(1.1);
    } else { // menu
      hero.position.set(34, -6, -20);
      hero.scale.setScalar(1.15);
    }
  }

  function setDestination(key) {
    if (!api.enabled || !key || key === heroKey) return;
    heroKey = key;
    const t = tex(key);
    if (t) { hero.material.map = t; hero.material.emissive.setHex(key === "sun" ? 0xffaa33 : 0x111418); hero.material.needsUpdate = true; }
  }

  function setWarp(level) { warpTarget = Math.max(0, level || 0); }

  function update(dt) {
    if (!api.enabled) return;
    if (window.innerWidth !== lastW || window.innerHeight !== lastH) resize();

    // ease warp toward target
    warp += (warpTarget - warp) * Math.min(1, dt * 6);

    // spin planets
    if (hero) hero.rotation.y += hero.userData.spin * dt;
    for (const p of bgPlanets) p.rotation.y += p.userData.spin * dt;

    // drive the starfield toward the camera (fast during warp)
    const speed = 14 + warp * 900;
    for (let i = 0; i < starN; i++) {
      let z = starPos[i * 3 + 2] + speed * dt;
      if (z > camera.position.z) { z = -700; starPos[i * 3] = (Math.random() - 0.5) * 700; starPos[i * 3 + 1] = (Math.random() - 0.5) * 700; }
      starPos[i * 3 + 2] = z;
    }
    starGeo.attributes.position.needsUpdate = true;
    stars.material.size = 1.4 + warp * 3.5;

    // during warp the hero planet recedes for a "leaving orbit" feel
    if (warp > 0.02) hero.position.z -= warp * 60 * dt;

    renderer.render(scene, camera);
  }

  api.init = init;
  api.update = update;
  api.setScene = setScene;
  api.setDestination = setDestination;
  api.setWarp = setWarp;
  return api;
})();
