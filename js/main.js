/* ============================================================
   Main — boot the game, wire scene navigation, mute button.
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

  // ---- Mute button ----
  const muteBtn = document.getElementById("mute-btn");
  function refreshMute() {
    muteBtn.textContent = A.isMuted() ? "🔇" : "🔊";
  }
  muteBtn.addEventListener("click", () => { A.setMuted(!A.isMuted()); refreshMute(); });
  window.addEventListener("keydown", (e) => {
    // "M" is also a letter you type in the game, so the keyboard shortcut only
    // toggles mute when you're NOT in a typing mini-game. The 🔊 button always works.
    if ((e.key === "m" || e.key === "M") && !CTQ.state.typing && !e.ctrlKey && !e.metaKey) {
      A.setMuted(!A.isMuted());
      refreshMute();
    }
  });

  // ---- Boot ----
  E.resize();
  E.initStars();
  E.loadAssets().then(() => {
    E.start();
    goIntro();
  });
})();
