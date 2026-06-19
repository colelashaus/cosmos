/* ============================================================
   Audio — WebAudio sound effects + browser speech synthesis.
   No audio files needed; everything is generated in-browser.
   ============================================================ */
window.CTQ = window.CTQ || {};

CTQ.audio = (function () {
  let ctx = null;
  let muted = false;
  let voice = null;

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // A simple oscillator "blip" with an envelope.
  function tone(freq, dur, type, vol, slideTo) {
    if (muted) return;
    const ac = ensureCtx();
    if (!ac) return;
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + dur);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(vol || 0.18, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  function noise(dur, vol) {
    if (muted) return;
    const ac = ensureCtx();
    if (!ac) return;
    const now = ac.currentTime;
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(vol || 0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1600;
    src.connect(filter).connect(gain).connect(ac.destination);
    src.start(now);
  }

  const sfx = {
    key()      { tone(520, 0.06, "square", 0.06); },
    wrong()    { tone(150, 0.16, "sawtooth", 0.10, 90); },
    zap()      { tone(880, 0.10, "square", 0.12, 220); },
    explode()  { noise(0.35, 0.3); tone(120, 0.3, "sawtooth", 0.12, 60); },
    success()  { tone(660, 0.10, "sine", 0.16); setTimeout(() => tone(990, 0.16, "sine", 0.16), 90); },
    collect()  { tone(740, 0.08, "sine", 0.14, 1180); },
    launch()   { tone(140, 0.7, "sawtooth", 0.18, 760); noise(0.7, 0.18); },
    fanfare()  {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.18, "triangle", 0.16), i * 110));
    },
    soft()     { tone(300, 0.18, "sine", 0.08, 200); },
    select()   { tone(600, 0.07, "triangle", 0.12); },
    hurt()     { tone(220, 0.28, "sawtooth", 0.16, 70); noise(0.18, 0.12); },
    gameover() { [392, 349, 311, 262].forEach((f, i) => setTimeout(() => tone(f, 0.3, "triangle", 0.14), i * 200)); },
  };

  // ---------- Background music (synthesized, looping) ----------
  // A gentle spacey loop: a soft bass pulse + a sparkly arpeggio.
  // No audio files — everything is generated with oscillators.
  let musicGain = null;
  let musicTimer = null;
  let musicStep = 0;

  // Notes (Hz). A minor-ish pentatonic for a calm, hopeful feel.
  const BASS = [110.0, 110.0, 146.83, 130.81]; // A2 A2 D3 C3 (one per bar)
  const ARP = [
    440.0, 523.25, 659.25, 523.25, 587.33, 659.25, 880.0, 659.25,
    587.33, 659.25, 523.25, 440.0, 392.0, 440.0, 523.25, 659.25,
  ];
  const STEP_MS = 230; // ~ relaxed tempo

  function mnote(freq, dur, type, vol) {
    const ac = ensureCtx();
    if (!ac || !musicGain) return;
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g).connect(musicGain);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  function musicTick() {
    if (!musicGain) return;
    // Arp note every step; bass note at the start of each 4-step bar.
    mnote(ARP[musicStep % ARP.length], 0.32, "triangle", 0.07);
    if (musicStep % 4 === 0) {
      const bass = BASS[Math.floor(musicStep / 4) % BASS.length];
      mnote(bass, 0.7, "sine", 0.12);
      mnote(bass * 2, 0.4, "sine", 0.05);
    }
    musicStep++;
    musicTimer = setTimeout(musicTick, STEP_MS);
  }

  const music = {
    start() {
      const ac = ensureCtx();
      if (!ac || musicTimer) return;
      musicGain = ac.createGain();
      musicGain.gain.value = muted ? 0 : 1;
      musicGain.connect(ac.destination);
      musicStep = 0;
      musicTick();
    },
    stop() {
      if (musicTimer) { clearTimeout(musicTimer); musicTimer = null; }
      if (musicGain) { try { musicGain.disconnect(); } catch (e) {} musicGain = null; }
    },
  };

  // ---- Speech ----
  function pickVoice() {
    if (!("speechSynthesis" in window)) return;
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return;
    // Prefer a clear English voice.
    voice =
      voices.find((v) => /en[-_]US/i.test(v.lang) && /female|samantha|zira|female/i.test(v.name)) ||
      voices.find((v) => /^en/i.test(v.lang)) ||
      voices[0];
  }
  if ("speechSynthesis" in window) {
    pickVoice();
    speechSynthesis.onvoiceschanged = pickVoice;
  }

  function speak(text, rate) {
    if (muted || !text || !("speechSynthesis" in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (voice) u.voice = voice;
      u.rate = rate || 0.95;
      u.pitch = 1.05;
      u.volume = 1;
      speechSynthesis.speak(u);
    } catch (e) { /* ignore */ }
  }

  function setMuted(m) {
    muted = m;
    if (musicGain) musicGain.gain.value = muted ? 0 : 1;
    if (muted && "speechSynthesis" in window) speechSynthesis.cancel();
  }
  function isMuted() { return muted; }

  // First user gesture unlocks audio on most browsers; also kicks off music.
  function unlock() {
    ensureCtx();
    music.start();
  }

  return { sfx, speak, setMuted, isMuted, unlock, music };
})();
