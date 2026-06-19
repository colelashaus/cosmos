/* ============================================================
   Cosmic Typing Quest — game data
   Word lists, letter/picture cues, difficulty settings, assets.
   ============================================================ */
window.CTQ = window.CTQ || {};

CTQ.data = (function () {
  // ---- EASY: single letters with a picture cue (for the 4-year-old) ----
  // Each letter shows a big letter + a picture whose name starts with it,
  // and the game speaks "A. Apple." to build letter–sound recognition.
  const LETTERS = [
    { ch: "A", emoji: "🍎", word: "Apple" },
    { ch: "B", emoji: "🎈", word: "Balloon" },
    { ch: "C", emoji: "🐱", word: "Cat" },
    { ch: "D", emoji: "🐶", word: "Dog" },
    { ch: "E", emoji: "🌍", word: "Earth" },
    { ch: "F", emoji: "🐟", word: "Fish" },
    { ch: "G", emoji: "🍇", word: "Grapes" },
    { ch: "H", emoji: "🏠", word: "House" },
    { ch: "I", emoji: "🍦", word: "Ice cream" },
    { ch: "J", emoji: "🕹️", word: "Joystick" },
    { ch: "K", emoji: "🪁", word: "Kite" },
    { ch: "L", emoji: "🦁", word: "Lion" },
    { ch: "M", emoji: "🌙", word: "Moon" },
    { ch: "N", emoji: "🪺", word: "Nest" },
    { ch: "O", emoji: "🐙", word: "Octopus" },
    { ch: "P", emoji: "🪐", word: "Planet" },
    { ch: "Q", emoji: "👑", word: "Queen" },
    { ch: "R", emoji: "🚀", word: "Rocket" },
    { ch: "S", emoji: "⭐", word: "Star" },
    { ch: "T", emoji: "🌳", word: "Tree" },
    { ch: "U", emoji: "☂️", word: "Umbrella" },
    { ch: "V", emoji: "🌋", word: "Volcano" },
    { ch: "W", emoji: "🐳", word: "Whale" },
    { ch: "X", emoji: "🎸", word: "X-ray... eXcellent!" },
    { ch: "Y", emoji: "🪀", word: "Yo-yo" },
    { ch: "Z", emoji: "🦓", word: "Zebra" },
  ];

  // ---- MEDIUM: short words, mix of space + everyday (for the 7-year-old) ----
  const MEDIUM = [
    // space
    "sun", "moon", "mars", "star", "ship", "rock", "orbit", "comet",
    "space", "earth", "blast", "alien", "lunar", "solar", "venus",
    // everyday
    "cat", "dog", "ball", "fish", "bird", "tree", "cake", "book",
    "milk", "jump", "blue", "frog", "hand", "rain", "snow", "boat",
    "ring", "lamp", "gift", "king", "leaf", "road", "kite", "drum",
  ];

  // ---- HARD: long words + short phrases (for the 9-year-old) ----
  const HARD = [
    // long single words
    "asteroid", "galaxy", "gravity", "astronaut", "telescope",
    "satellite", "universe", "spaceship", "meteor", "eclipse",
    "mission", "capsule", "station", "nebula", "cosmos",
    "explore", "journey", "mercury", "jupiter", "neptune",
    "oxygen", "horizon", "voyager", "crater", "starlight",
    // phrases (spaces must be typed too)
    "blast off", "ready to launch", "shooting star", "count down",
    "milky way", "outer space", "deep space", "moon landing",
  ];

  // Difficulty tuning shared by the mini-games.
  const DIFFICULTY = {
    easy: {
      key: "easy",
      label: "Easy",
      emoji: "🐣",
      age: "Ages 3–5",
      desc: "Press the letter you see. Pictures and sounds help you learn your ABCs!",
      pool: "letters",
      spawnEvery: 2.6,    // seconds between new targets
      maxTargets: 1,
      fallSpeed: 16,      // px/sec for descending mode (gentle)
      driftSpeed: 14,
      lives: null,        // null = endless (no game over) for the youngest players
      fuelGoal: 4,        // words to fill the rocket
      speakOnSpawn: true,
      bigText: true,
    },
    medium: {
      key: "medium",
      label: "Medium",
      emoji: "🚀",
      age: "Ages 6–8",
      desc: "Type the short words to power up. Great for new spellers!",
      pool: "medium",
      spawnEvery: 2.0,
      maxTargets: 3,
      fallSpeed: 26,
      driftSpeed: 22,
      lives: null,        // endless (no game over)
      fuelGoal: 5,
      speakOnSpawn: false,
      bigText: false,
    },
    hard: {
      key: "hard",
      label: "Hard",
      emoji: "🛰️",
      age: "Ages 9+",
      desc: "Type long words and whole phrases. Fast hands and sharp spelling!",
      pool: "hard",
      spawnEvery: 1.5,
      maxTargets: 5,
      fallSpeed: 36,
      driftSpeed: 30,
      lives: 3,
      fuelGoal: 6,
      speakOnSpawn: false,
      bigText: false,
    },
  };

  const GAMES = [
    {
      key: "asteroid",
      name: "Asteroid Defense",
      emoji: "☄️",
      desc: "Type the words on the asteroids to blast them before they land!",
    },
    {
      key: "fuel",
      name: "Rocket Fuel",
      emoji: "🚀",
      desc: "Type words to fuel your rocket and fly to a new NASA planet!",
    },
    {
      key: "rescue",
      name: "Star Rescue",
      emoji: "🌟",
      desc: "Type the words on the floating stars to beam them aboard!",
    },
  ];

  // NASA public-domain images shipped in /assets/images (with credits in CREDITS.md)
  const PLANETS = ["earth", "mars", "jupiter", "saturn", "moon", "sun"];
  const IMAGES = {
    earth: "assets/images/earth.jpg",
    mars: "assets/images/mars.jpg",
    jupiter: "assets/images/jupiter.jpg",
    saturn: "assets/images/saturn.jpg",
    moon: "assets/images/moon.jpg",
    sun: "assets/images/sun.jpg",
    nebula: "assets/images/nebula.jpg",
    galaxy: "assets/images/galaxy.jpg",
  };

  function getPool(name) {
    if (name === "letters") return LETTERS.map((l) => ({ text: l.ch, emoji: l.emoji, speak: l.ch + ". " + l.word + "." }));
    const src = name === "medium" ? MEDIUM : HARD;
    return src.map((w) => ({ text: w.toUpperCase(), emoji: null, speak: w }));
  }

  return { LETTERS, MEDIUM, HARD, DIFFICULTY, GAMES, PLANETS, IMAGES, getPool };
})();
