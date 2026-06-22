/* ============================================================
   Main — boot the game and wire scene navigation.
   Flow:  Intro → Difficulty → Mission select → Game (Esc back)
   ============================================================ */
(function () {
  const E = CTQ.engine;
  const A = CTQ.audio;
  const M = CTQ.menus;
  const G = CTQ.games;

  let chosenDiff = "easy";

  function scene3D(mode) {
    if (CTQ.three && CTQ.three.enabled) CTQ.three.setScene(mode);
  }

  function goIntro() {
    scene3D("menu");
    E.setScene(M.createIntro(goDifficulty));
  }
  function goDifficulty() {
    scene3D("menu");
    E.setScene(M.createDifficulty(
      (diff) => { chosenDiff = diff; goGameSelect(); },
      goIntro
    ));
  }
  function goGameSelect() {
    scene3D("menu");
    E.setScene(M.createGameSelect(
      chosenDiff,
      (gameKey) => goGame(gameKey),
      goDifficulty
    ));
  }
  function goGame(gameKey) {
    A.unlock();
    scene3D(gameKey === "asteroid" ? "asteroid" : gameKey === "fuel" ? "fuel" : "rescue");
    const back = goGameSelect;
    const onDead = (score) => goGameOver(score, gameKey);
    if (gameKey === "fuel") {
      E.setScene(G.createFuelGame(chosenDiff, back, onDead));
    } else {
      // "asteroid" (descending) or "rescue" (floating)
      E.setScene(G.createTargetGame(chosenDiff, gameKey, back, onDead));
    }
  }
  function goGameOver(score, gameKey) {
    scene3D("menu");
    E.setScene(M.createGameOver(score, () => goGame(gameKey), goGameSelect));
  }

  // ---- Boot ----
  // The 3D layer (js/three3d.js) is an ES module that self-initializes and, on
  // success, disables the 2D starfield itself. Until then the 2D starfield shows.
  E.resize();
  E.initStars();
  E.loadAssets().then(() => {
    E.start();
    goIntro();
  });
})();
