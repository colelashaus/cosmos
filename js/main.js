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

  function goIntro() {
    E.setScene(M.createIntro(goDifficulty));
  }
  function goDifficulty() {
    E.setScene(M.createDifficulty(
      (diff) => { chosenDiff = diff; goGameSelect(); },
      goIntro
    ));
  }
  function goGameSelect() {
    E.setScene(M.createGameSelect(
      chosenDiff,
      (gameKey) => goGame(gameKey),
      goDifficulty
    ));
  }
  function goGame(gameKey) {
    A.unlock();
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
    E.setScene(M.createGameOver(score, () => goGame(gameKey), goGameSelect));
  }

  // ---- Boot ----
  E.resize();
  E.initStars();
  E.loadAssets().then(() => {
    E.start();
    goIntro();
  });
})();
