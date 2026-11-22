/* Кот-Космонавт: Космический защитник — аркадный шутер для Яндекс Игр */
(function () {
  'use strict';

  var canvas = document.getElementById('canvas');
  var ctx = canvas.getContext('2d');
  var W = 0, H = 0, DPR = 1;

  /* ============ Яндекс SDK ============ */
  var ysdk = null;

  try {
    if (window.YaGames) {
      window.YaGames.init().then(function (sdk) {
        ysdk = sdk;
        if (sdk.features && sdk.features.LoadingAPI) sdk.features.LoadingAPI.ready();
        if (sdk.environment && sdk.environment.i18n) applyLang((sdk.environment.i18n.lang || 'ru').slice(0, 2));
      }).catch(function () {});
    }
  } catch (e) {}

  var lang = (navigator.language || 'ru').slice(0, 2).toLowerCase();

  var TT = {
    ru: {
      title1: 'КОТ-КОСМОНАВТ', title2: 'защитник галактики',
      play: '▶ ИГРАТЬ', best: 'Рекорд', level: 'Волна',
      over: 'КОРАБЛЬ ПОДБИТ', score: 'Счёт',
      newRec: 'НОВЫЙ РЕКОРД!', again: '↻ ЕЩЁ РАЗ', continueAd: '🎬 ПРОДОЛЖИТЬ',
      pause: 'ПАУЗА', resume: '▶ ПРОДОЛЖИТЬ', toMenu: 'В МЕНЮ',
      waveUp: 'ВОЛНА', combo: 'КОМБО', shield: 'ЩИТ!', gunUp: 'ОРУЖИЕ UP',
      bomb: 'БОМБА!', life: '+1 ЖИЗНЬ', reviving: 'Возрождение...'
    },
    en: {
      title1: 'ASTRO CAT', title2: 'galaxy defender',
      play: '▶ PLAY', best: 'Best', level: 'Wave',
      over: 'SHIP DESTROYED', score: 'Score',
      newRec: 'NEW RECORD!', again: '↻ RETRY', continueAd: '🎬 CONTINUE',
      pause: 'PAUSED', resume: '▶ RESUME', toMenu: 'MENU',
      waveUp: 'WAVE', combo: 'COMBO', shield: 'SHIELD!', gunUp: 'GUN UP',
      bomb: 'BOMB!', life: '+1 LIFE', reviving: 'Reviving...'
    }
  };
  if (lang !== 'ru' && lang !== 'en') lang = 'ru';
  function applyLang(l) { if (TT[l]) lang = l; }
  function t(k) { return (TT[lang] && TT[lang][k]) || TT.ru[k] || k; }

  function gameplayStart() { try { if (ysdk && ysdk.features && ysdk.features.GameplayAPI) ysdk.features.GameplayAPI.start(); } catch (e) {} }
  function gameplayStop() { try { if (ysdk && ysdk.features && ysdk.features.GameplayAPI) ysdk.features.GameplayAPI.stop(); } catch (e) {} }

  function submitScore(v) {
    try {
      if (ysdk && ysdk.getLeaderboards) {
        ysdk.getLeaderboards().then(function (lb) {
          return lb.setLeaderboardScore('leaderboard', Math.max(0, Math.round(v)));
        }).catch(function () {});
      }
    } catch (e) {}
  }

  function requestFullscreen() {
    try { if (ysdk && ysdk.screen && ysdk.screen.fullscreen) ysdk.screen.fullscreen.request(); } catch (e) {}
  }

  function onGameOverTryInterstitial(n) {
    try {
      if (ysdk && ysdk.adv && n > 0 && n % 3 === 0) ysdk.adv.showFullscreenAdv({ callbacks: {} });
    } catch (e) {}
  }

  function showRewardedAd(onDone) {
    var ok = false;
    try {
      if (ysdk && ysdk.adv) {
        ysdk.adv.showRewardedVideo({
          callbacks: {
            onRewarded: function () { ok = true; },
            onClose: function () { if (ok) onDone(); },
            onError: function () {}
          }
        });
        return;
      }
    } catch (e) {}
    onDone();
  }

  /* ============ Аудио ============ */
  var audioCtx = null, musicGain = null, sfxGain = null, masterGain = null;
  var musicOn = false, nextNoteTime = 0, musicStep = 0, musicStarted = false;

  function ensureAudio() {
    if (audioCtx) return true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      audioCtx = new AC();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.5;
      masterGain.connect(audioCtx.destination);
      musicGain = audioCtx.createGain();
      musicGain.gain.value = 0.4;
      musicGain.connect(masterGain);
      sfxGain = audioCtx.createGain();
      sfxGain.gain.value = 1;
      sfxGain.connect(masterGain);
      return true;
    } catch (e) { audioCtx = null; return false; }
  }

  function resumeAudio() {
    if (ensureAudio() && audioCtx.state === 'suspended') audioCtx.resume();
  }

  function envGain(dest, t0, a, peak, d) {
    var g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    g.connect(dest);
    return g;
  }

  function tone(t0, freq, dur, type, peak, dest, freqEnd) {
    if (!audioCtx) return;
    var o = audioCtx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    o.connect(envGain(dest, t0, 0.005, peak, dur));
    o.start(t0);
    o.stop(t0 + dur + 0.1);
  }

  function noiseBurst(t0, dur, peak, f0, f1) {
    if (!audioCtx) return;
    var len = Math.max(1, Math.floor(audioCtx.sampleRate * dur));
    var buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var src = audioCtx.createBufferSource();
    src.buffer = buf;
    var flt = audioCtx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(f0 || 1200, t0);
    flt.frequency.exponentialRampToValueAtTime(Math.max(40, f1 || 100), t0 + dur);
    src.connect(flt);
    flt.connect(envGain(sfxGain, t0, 0.005, peak, dur));
    src.start(t0);
  }

  function sfxLaser() { tone(audioCtx.currentTime, 880, 0.08, 'square', 0.09, sfxGain, 220); }
  function sfxLaserHeavy() { tone(audioCtx.currentTime, 520, 0.14, 'sawtooth', 0.11, sfxGain, 140); }
  function sfxTick() { tone(audioCtx.currentTime, 1800, 0.03, 'square', 0.04, sfxGain); }
  function sfxCoin() {
    var t0 = audioCtx.currentTime;
    tone(t0, 1046, 0.06, 'square', 0.09, sfxGain);
    tone(t0 + 0.06, 1568, 0.1, 'square', 0.09, sfxGain);
  }
  function sfxPower() {
    var t0 = audioCtx.currentTime;
    [523, 659, 784, 1046].forEach(function (f, i) { tone(t0 + i * 0.07, f, 0.11, 'triangle', 0.13, sfxGain); });
  }
  function sfxShield() { tone(audioCtx.currentTime, 300, 0.4, 'sine', 0.11, sfxGain, 900); }
  function sfxWave() {
    var t0 = audioCtx.currentTime;
    [392, 523, 659, 784].forEach(function (f, i) { tone(t0 + i * 0.09, f, 0.15, 'square', 0.1, musicGain); });
  }
  function sfxGameOver() {
    var t0 = audioCtx.currentTime;
    [392, 330, 262, 196].forEach(function (f, i) { tone(t0 + i * 0.25, f, 0.34, 'sawtooth', 0.12, sfxGain, f * 0.8); });
  }
  function sfxExplosion(big) {
    var t0 = audioCtx.currentTime;
    noiseBurst(t0, big ? 0.55 : 0.3, big ? 0.32 : 0.2, big ? 900 : 1400, 60);
    tone(t0, big ? 110 : 180, big ? 0.4 : 0.22, 'triangle', 0.16, sfxGain, 40);
  }
  function sfxHit() {
    var t0 = audioCtx.currentTime;
    noiseBurst(t0, 0.2, 0.25, 600, 80);
    tone(t0, 150, 0.25, 'sawtooth', 0.14, sfxGain, 50);
  }

  var BPM = 118, STEP_DUR = 60 / BPM / 4;
  var bassPat = [0, 0, 12, 0, 7, 0, 12, 0, 3, 3, 15, 3, 7, 7, 10, 10];
  var bassRoots = [0, 0, -4, -2];
  var leadPat = [12, 0, 15, 12, 19, 0, 15, 0, 17, 0, 15, 12, 15, 0, 12, 0, 12, 0, 15, 12, 19, 22, 19, 0, 17, 0, 19, 0, 22, 0, 0, 0];
  var hatPat = [0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1];

  function ntSem(t0, semi, dur, type, peak, dest) {
    tone(t0, 440 * Math.pow(2, semi / 12), dur, type, peak, dest);
  }

  function noiseHat(t0) {
    var len = Math.floor(audioCtx.sampleRate * 0.03);
    var buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = audioCtx.createBufferSource();
    src.buffer = buf;
    var flt = audioCtx.createBiquadFilter();
    flt.type = 'highpass';
    flt.frequency.value = 6000;
    src.connect(flt);
    flt.connect(envGain(musicGain, t0, 0.002, 0.045, 0.03));
    src.start(t0);
  }

  function scheduleMusic() {
    if (!audioCtx || !musicOn) return;
    var ahead = audioCtx.currentTime + 0.42;
    while (nextNoteTime < ahead) {
      var s = musicStep % 16;
      var bar = Math.floor(musicStep / 16) % 4;
      var root = bassRoots[bar];
      if (s % 2 === 0) ntSem(nextNoteTime, 36 + root + bassPat[s], 0.11, 'triangle', 0.2, musicGain);
      if (hatPat[s]) noiseHat(nextNoteTime);
      if (root >= 0) {
        var lk = leadPat[musicStep % leadPat.length];
        if (lk > 0) ntSem(nextNoteTime, 57 + root + lk, 0.12, 'square', 0.07, musicGain);
      }
      nextNoteTime += STEP_DUR;
      musicStep++;
    }
  }

  /* ============ Состояние игры ============ */
  var ST_MENU = 0, ST_PLAY = 1, ST_PAUSE = 2, ST_OVER = 3, ST_REVIVE = 4;
  var state = ST_MENU;

  var player = {
    x: 0, y: 0, vx: 0, vy: 0, r: 22,
    gunLvl: 1, fireCd: 0, fireRate: 0.16,
    shieldTime: 0, lives: 3, invuln: 0,
    tilt: 0, enginePhase: 0
  };

  var enemies = [], bullets = [], ebullets = [], particles = [], popups = [], powerups = [], stars = [], shootStars = [];
  var best = 0, wave = 1, killsThisWave = 0;
  var combo = 1, comboTimer = 0;
  var waveBannerTime = 0, bossBanner = false;
  var gameTime = 0, menuAnim = 0, lastTime = 0;
  var shake = 0, flash = 0, flashColor = '255,255,255';
  var gamesPlayed = 0;
  var clickable = [];
  var bossActive = null;
  var enemySpawnAcc = 0;
  var planet = null;

  try { best = parseInt(localStorage.getItem('astrocat_best') || '0', 10) || 0; } catch (e) {}

  function resetGame() {
    score = 0; wave = 1; killsThisWave = 0;
    combo = 1; comboTimer = 0; bossActive = null; bossBanner = false;
    enemies = []; bullets = []; ebullets = []; powerups = []; particles = []; popups = [];
    player.x = W / 2; player.y = H - 110; player.vx = 0; player.vy = 0;
    player.gunLvl = 1; player.fireCd = 0; player.fireRate = 0.16; player.shieldTime = 0;
    player.lives = 3; player.invuln = 1.4;
    enemySpawnAcc = 0; waveBannerTime = 1.4;
  }

  function startGame() {
    ensureAudio(); resumeAudio(); startMusic();
    resetGame();
    state = ST_PLAY;
    gameplayStart();
  }

  function gameOver() {
    state = ST_OVER;
    gameplayStop();
    sfxGameOver();
    gamesPlayed++;
    if (score > best) {
      best = score;
      try { localStorage.setItem('astrocat_best', String(best)); } catch (e) {}
      submitScore(best);
    }
    onGameOverTryInterstitial(gamesPlayed);
  }

  function revive() {
    state = ST_PLAY;
    gameplayStart();
    player.lives = 3;
    player.invuln = 2;
    player.shieldTime = 3;
    ebullets = [];
    enemies = enemies.filter(function (e) { return e.kind === 'boss'; });
    enemies.forEach(function (e) { e.x = W / 2; e.y = -140; });
  }

  /* ============ Волны и враги ============ */
  var KILLS_PER_WAVE = 10;

  function isBossWave() { return wave % 5 === 0; }

  function spawnEnemy() {
    var pool = ['drone', 'drone', 'zig'];
    if (wave >= 2) pool = pool.concat(['shooter', 'kamikaze', 'zig']);
    if (wave >= 3) pool = pool.concat(['tank', 'kamikaze']);
    if (wave >= 5) pool = pool.concat(['tank', 'shooter', 'kamikaze']);
    var kind = pool[Math.floor(Math.random() * pool.length)];

    var e = {
      kind: kind,
      x: 60 + Math.random() * Math.max(60, W - 120),
      y: -50,
      vx: 0, vy: 90 + wave * 12 + Math.random() * 50,
      hp: 1, maxHp: 1, r: 18, t: Math.random() * 10,
      baseX: 0, phase: Math.random() * Math.PI * 2,
      fireCd: 1 + Math.random() * 2, hitFlash: 0, stopY: 0
    };
    e.baseX = e.x;

    if (kind === 'drone') { e.hp = 2; e.r = 17; }
    if (kind === 'zig') { e.hp = 1; e.r = 15; e.vy = 130 + wave * 14; }
    if (kind === 'tank') { e.hp = 8 + wave; e.r = 30; e.vy = 45 + wave * 6; }
    if (kind === 'shooter') { e.hp = 3; e.r = 19; e.vy = 110; e.stopY = 90 + Math.random() * 140; }
    if (kind === 'kamikaze') { e.hp = 1; e.r = 14; e.vy = 210 + wave * 16; }
    e.maxHp = e.hp;
    enemies.push(e);
  }

  function spawnBoss() {
    bossActive = {
      kind: 'boss',
      x: W / 2, y: -140,
      hp: 60 + wave * 18, maxHp: 60 + wave * 18,
      r: 58, t: 0, baseY: 140, phase: 0, fireCd: 1.4, hitFlash: 0
    };
    enemies.push(bossActive);
    bossBanner = true;
    waveBannerTime = 2;
    sfxWave();
  }

  function onKill(e) {
    killsThisWave++;
    var base = e.kind === 'boss' ? 1000 : e.kind === 'tank' ? 150 : e.kind === 'shooter' ? 80 : 30;
    var pts = base * combo;
    score += pts;
    combo = Math.min(5, combo + 1);
    comboTimer = 3;
    popupText(e.x, e.y, '+' + pts, '#ffd740');
    explode(e.x, e.y, (e.kind === 'boss' || e.kind === 'tank') ? 'big' : 'normal');

    if (e.kind === 'boss') {
      bossActive = null; bossBanner = false;
      var i;
      for (i = 0; i < 5; i++) {
        dropPowerup(e.x + (Math.random() - 0.5) * 160, e.y + (Math.random() - 0.5) * 60, i === 0 ? 'life' : (Math.random() < 0.5 ? 'coin' : 'gun'));
      }
    } else {
      var chance = e.kind === 'tank' ? 0.65 : 0.18;
      if (Math.random() < chance) {
        var pool = ['coin', 'coin', 'gun', 'shield', 'bomb'];
        if (player.lives < 5) pool.push('life');
        dropPowerup(e.x, e.y, pool[Math.floor(Math.random() * pool.length)]);
      }
    }

    if (!isBossWave() && killsThisWave >= KILLS_PER_WAVE) {
      wave++; killsThisWave = 0;
      if (isBossWave()) spawnBoss();
      else { waveBannerTime = 1.4; sfxWave(); }
    }
  }

  function dropPowerup(x, y, kind) {
    powerups.push({ x: x, y: y, vy: 95, kind: kind, r: 16, t: 0 });
  }

  function popupText(x, y, text, color) {
    popups.push({ x: x, y: y, text: text, color: color || '#fff', t: 0, life: 0.9 });
  }

  function spawnParticles(x, y, count, colors, speed, size, life, grav) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = speed * (0.3 + Math.random() * 0.7);
      particles.push({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: life * (0.6 + Math.random() * 0.6), t: 0,
        color: colors[Math.floor(Math.random() * colors.length)],
        r: size * (0.5 + Math.random() * 0.7),
        grav: grav || 0
      });
    }
    if (particles.length > 340) particles.splice(0, particles.length - 340);
  }

  function explode(x, y, size) {
    if (size === 'big') {
      spawnParticles(x, y, 55, ['#fff3c4', '#ffb300', '#ff6d00', '#ff3d00', '#ff8a65'], 330, 7, 0.9, 60);
      spawnParticles(x, y, 22, ['#90a4ae', '#607d8b', '#37474f'], 150, 9, 1.3, -30);
      shake = Math.max(shake, 14); flash = 0.35; flashColor = '255,200,100';
    } else {
      spawnParticles(x, y, 20, ['#fff3c4', '#ffb300', '#ff6d00', '#ff8a65'], 220, 5, 0.6, 40);
      shake = Math.max(shake, 5);
    }
  }

  function sparkAt(x, y, color) {
    spawnParticles(x, y, 6, [color || '#b3e5fc', '#4fc3f7', '#fff'], 160, 3, 0.4, 0);
  }

  /* ============ Экран и фон ============ */
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function initBackground() {
    stars = [];
    var n = Math.min(120, Math.round(W * H / 9000));
    for (var i = 0; i < n; i++) {
      var layer = Math.floor(Math.random() * 3);
      stars.push({
        x: Math.random() * W, y: Math.random() * H,
        layer: layer,
        speed: 12 + layer * 26,
        r: 0.6 + layer * 0.7,
        twinkle: Math.random() * Math.PI * 2
      });
    }
    planet = {
      x: W * 0.82, y: H * 0.16, r: Math.min(64, W * 0.13),
      hue: ['#8e6ff7', '#ff8a65', '#4dd0e1', '#ffca28'][Math.floor(Math.random() * 4)],
      ring: Math.random() < 0.5
    };
    shootStars = [];
  }

  /* ============ Ввод ============ */
  var usePointerControl = false, ptrPrev = null;

  function handleTap(x, y) {
    resumeAudio(); startMusic();
    if (state === ST_PLAY && pauseBtnRect) {
      if (x >= pauseBtnRect.x && x <= pauseBtnRect.x + pauseBtnRect.w && y >= pauseBtnRect.y && y <= pauseBtnRect.y + pauseBtnRect.h) {
        state = ST_PAUSE; gameplayStop(); return;
      }
    }
    for (var i = 0; i < clickable.length; i++) {
      var b = clickable[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.fn(); return; }
    }
    if (state === ST_MENU || state === ST_OVER) startGame();
  }

  function handleMove(x, y) {
    if (state === ST_PLAY && usePointerControl && ptrPrev) {
      player.vx += (x - ptrPrev.x) * 2.4;
      player.vy += (y - ptrPrev.y) * 2.4;
      ptrPrev = { x: x, y: y };
    }
  }

  function bindPointer(x, y) {
    usePointerControl = true;
    ptrPrev = { x: x, y: y };
  }

  window.addEventListener('mousedown', function (e) { handleTap(e.clientX, e.clientY); if (state === ST_PLAY) bindPointer(e.clientX, e.clientY); });
  window.addEventListener('mousemove', function (e) { handleMove(e.clientX, e.clientY); });
  window.addEventListener('touchstart', function (e) {
    if (e.target === canvas) e.preventDefault();
    var t0 = e.changedTouches[0];
    var hit = clickable.length === 0;
    handleTap(t0.clientX, t0.clientY);
    if (state === ST_PLAY) bindPointer(t0.clientX, t0.clientY);
  }, { passive: false });
  window.addEventListener('touchmove', function (e) {
    if (e.target === canvas) e.preventDefault();
    var t0 = e.changedTouches[0];
    handleMove(t0.clientX, t0.clientY);
  }, { passive: false });
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  var keys = {};
  document.addEventListener('keydown', function (e) {
    keys[e.code] = true;
    if (e.code === 'Escape') {
      if (state === ST_PLAY) { state = ST_PAUSE; gameplayStop(); }
      else if (state === ST_PAUSE) { state = ST_PLAY; gameplayStart(); }
    }
    if (e.code === 'Space' || e.code === 'Enter') {
      if (state === ST_MENU || state === ST_OVER) startGame();
      else if (state === ST_PAUSE) { state = ST_PLAY; gameplayStart(); }
    }
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'Space') e.preventDefault();
  });
  document.addEventListener('keyup', function (e) { keys[e.code] = false; });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && state === ST_PLAY) { state = ST_PAUSE; gameplayStop(); }
  });

  /* ============ Бой ============ */
  function firePlayerBullets() {
    var px = player.x, py = player.y - player.r;
    function shoot(x, y, vx, vy, big) {
      bullets.push({ x: x, y: y, vx: vx, vy: vy, r: big ? 8 : 5, big: !!big });
      (big ? sfxLaserHeavy : sfxLaser)();
    }
    if (player.gunLvl === 1) shoot(px, py - 6, 0, -560);
    else if (player.gunLvl === 2) { shoot(px - 10, py, 0, -580); shoot(px + 10, py, 0, -580); }
    else if (player.gunLvl === 3) { shoot(px - 12, py, 0, -600); shoot(px + 12, py, 0, -600); shoot(px, py + 4, 0, -520, true); }
    else {
      shoot(px - 14, py, -50, -600); shoot(px + 14, py, 50, -600);
      shoot(px - 26, py, -110, -520); shoot(px + 26, py, 110, -520);
      shoot(px, py + 4, 0, -560, true);
    }
  }

  function damagePlayer() {
    if (player.invuln > 0) return;
    if (player.shieldTime > 0) {
      player.shieldTime = Math.max(0, player.shieldTime - 0.8);
      sparkAt(player.x, player.y - 12, '#4dd0e1');
      sfxShield();
      return;
    }
    player.lives -= 1;
    combo = 1;
    shake = 12; flash = 0.5; flashColor = '255,80,80';
    spawnParticles(player.x, player.y, 28, ['#ff5252', '#ff8a80', '#fff'], 260, 5, 0.7, 50);
    sfxHit();
    player.invuln = 1.6;
    player.gunLvl = Math.max(1, player.gunLvl - 1);
    if (player.lives <= 0) {
      explode(player.x, player.y, 'big');
      gameOver();
    }
  }

  function aimAtPlayer(e) {
    var dx = player.x - e.x, dy = player.y - e.y;
    var d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    var sp = 190 + wave * 12;
    return { vx: dx / d * sp, vy: dy / d * sp };
  }

  function fireEnemyBullet(x, y, vel, kind) {
    ebullets.push({ x: x, y: y, vx: vel.vx, vy: vel.vy, r: 7, kind: kind || 's' });
  }

  function updateBoss(b, dt) {
    var targetX = W / 2 + Math.sin(b.t * 0.7) * (W * 0.25);
    b.x += (targetX - b.x) * dt * 2;
    if (b.y < b.baseY) b.y += 60 * dt;
    b.fireCd -= dt;
    if (b.fireCd <= 0) {
      b.phase++;
      if (b.phase % 3 === 0) {
        for (var i = -2; i <= 2; i++) {
          var ang = Math.PI / 2 + i * 0.28;
          ebullets.push({
            x: b.x, y: b.y + b.r * 0.7,
            vx: Math.cos(ang) * (170 + wave * 6),
            vy: Math.sin(ang) * (170 + wave * 6),
            r: 8, kind: 'b'
          });
        }
      } else {
        var v = aimAtPlayer(b);
        fireEnemyBullet(b.x, b.y + b.r * 0.7, v, 'b');
        fireEnemyBullet(b.x, b.y + b.r * 0.7, { vx: v.vx * 1.3, vy: v.vy * 0.7 }, 'b');
      }
      b.fireCd = Math.max(0.55, 1.5 - wave * 0.07);
    }
  }

  function applyPowerup(pu) {
    sfxCoin();
    switch (pu.kind) {
      case 'coin':
        score += 50 * combo;
        popupText(pu.x, pu.y, '+' + (50 * combo), '#ffd740');
        sparkAt(pu.x, pu.y, '#ffd740');
        break;
      case 'gun':
        if (player.gunLvl < 4) {
          player.gunLvl++;
          popupText(pu.x, pu.y, t('gunUp'), '#69f0ae');
          sparkAt(pu.x, pu.y, '#69f0ae');
          sfxPower();
        } else { score += 100; popupText(pu.x, pu.y, '+100', '#69f0ae'); }
        break;
      case 'shield':
        player.shieldTime = 6;
        popupText(pu.x, pu.y, t('shield'), '#4dd0e1');
        sfxShield();
        break;
      case 'bomb': {
        popupText(pu.x, pu.y, t('bomb'), '#ff8a65');
        sfxPower();
        shake = 14; flash = 0.4; flashColor = '255,200,100';
        for (var i = enemies.length - 1; i >= 0; i--) {
          var e = enemies[i];
          if (e.kind === 'boss') {
            e.hp -= 18; e.hitFlash = 0.15;
            if (e.hp <= 0) { enemies.splice(i, 1); onKill(e); }
          } else {
            enemies.splice(i, 1); onKill(e);
          }
        }
        ebullets = [];
        for (var f = 0; f < 40; f++) sparkAt(Math.random() * W, Math.random() * H, '#ffab91');
        break;
      }
      case 'life':
        player.lives = Math.min(5, player.lives + 1);
        popupText(pu.x, pu.y, t('life'), '#ff5252');
        sfxPower();
        break;
    }
  }

  /* ============ Обновление (update) ============ */
  function update(dt) {
    gameTime += dt;

    if (keys.ArrowLeft || keys.KeyA) player.vx -= 1500 * dt;
    if (keys.ArrowRight || keys.KeyD) player.vx += 1500 * dt;
    if (keys.ArrowUp || keys.KeyW) player.vy -= 1200 * dt;
    if (keys.ArrowDown || keys.KeyS) player.vy += 1200 * dt;

    player.vx *= Math.pow(0.004, dt);
    player.vy *= Math.pow(0.004, dt);
    player.vx = Math.max(-700, Math.min(700, player.vx));
    player.vy = Math.max(-600, Math.min(600, player.vy));

    player.x += player.vx * dt;
    player.y += player.vy * dt;

    var pad = player.r + 4;
    if (player.x < pad) { player.x = pad; player.vx = 0; }
    if (player.x > W - pad) { player.x = W - pad; player.vx = 0; }
    if (player.y < pad + 40) { player.y = pad + 40; player.vy = 0; }
    if (player.y > H - pad) { player.y = H - pad; player.vy = 0; }

    player.tilt = player.vx / 900;
    player.enginePhase += dt * (10 + Math.abs(player.vx) / 50);
    if (player.invuln > 0) player.invuln -= dt;
    if (player.shieldTime > 0) player.shieldTime -= dt;

    player.fireCd -= dt;
    if (player.fireCd <= 0) {
      firePlayerBullets();
      player.fireCd = player.fireRate;
    }

    if (comboTimer > 0) {
      comboTimer -= dt;
      if (comboTimer <= 0) combo = Math.max(1, combo - 1);
    }

    if (isBossWave()) {
      if (!bossActive) spawnBoss();
    } else {
      enemySpawnAcc += dt;
      var interval = Math.max(0.38, 1.25 - wave * 0.09);
      if (enemySpawnAcc >= interval) {
        enemySpawnAcc = 0;
        spawnEnemy();
      }
    }

    var i, j, k;

    for (i = bullets.length - 1; i >= 0; i--) {
      var b = bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y < -30 || b.x < -30 || b.x > W + 30) bullets.splice(i, 1);
    }

    for (j = enemies.length - 1; j >= 0; j--) {
      var e = enemies[j];
      e.t += dt;
      if (e.hitFlash > 0) e.hitFlash -= dt;

      if (e.kind === 'boss') {
        updateBoss(e, dt);
      } else if (e.kind === 'drone') {
        e.y += e.vy * dt;
        e.x = e.baseX + Math.sin(e.t * 2.4 + e.phase) * 60;
      } else if (e.kind === 'zig') {
        e.y += e.vy * dt;
        e.x += Math.sin(e.t * 7) * 340 * dt;
      } else if (e.kind === 'tank') {
        e.y += e.vy * dt;
      } else if (e.kind === 'shooter') {
        if (e.y < e.stopY) e.y += e.vy * dt;
        else {
          e.x += Math.sin(e.t * 1.6) * 70 * dt;
          e.fireCd -= dt;
          if (e.fireCd <= 0) {
            fireEnemyBullet(e.x, e.y + e.r, aimAtPlayer(e), e.kind);
            e.fireCd = Math.max(0.9, 2.2 - wave * 0.12);
          }
        }
      } else if (e.kind === 'kamikaze') {
        var dx = player.x - e.x, dy = player.y - e.y;
        var dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        e.x += (dx / dist) * e.vy * dt * 1.5;
        e.y += (dy / dist) * e.vy * dt * 1.5;
      }

      var dead = false;
      for (k = bullets.length - 1; k >= 0; k--) {
        var pb = bullets[k];
        var ddx = pb.x - e.x, ddy = pb.y - e.y;
        var rr = e.r + pb.r;
        if (ddx * ddx + ddy * ddy < rr * rr) {
          bullets.splice(k, 1);
          e.hp -= (pb.big ? 3 : 1);
          e.hitFlash = 0.08;
          sparkAt(pb.x, pb.y, '#fff59d');
          if (e.hp <= 0) {
            if (e.kind === 'boss') bossActive = null;
            enemies.splice(j, 1);
            onKill(e);
            dead = true;
            break;
          } else {
            sfxTick();
          }
        }
      }
      if (dead) continue;

      var cdx = e.x - player.x, cdy = e.y - player.y;
      var cr = e.r + player.r * 0.8;
      if (cdx * cdx + cdy * cdy < cr * cr) {
        if (e.kind !== 'boss' && e.kind !== 'tank') {
          if (e.kind === 'boss') bossActive = null;
          enemies.splice(j, 1);
          explode(e.x, e.y, 'normal');
        }
        damagePlayer();
        continue;
      }

      if (e.y > H + 100) enemies.splice(j, 1);
    }

    for (i = powerups.length - 1; i >= 0; i--) {
      var pu = powerups[i];
      pu.t += dt;
      pu.y += pu.vy * dt;
      pu.x += Math.sin(pu.t * 3) * 30 * dt;
      var pdx = pu.x - player.x, pdy = pu.y - player.y;
      var pr = pu.r + player.r;
      if (pdx * pdx + pdy * pdy < pr * pr) {
        powerups.splice(i, 1);
        applyPowerup(pu);
      } else if (pu.y > H + 60) powerups.splice(i, 1);
    }

    for (i = ebullets.length - 1; i >= 0; i--) {
      var bs = ebullets[i];
      bs.x += bs.vx * dt; bs.y += bs.vy * dt;
      var edx = bs.x - player.x, edy = bs.y - player.y;
      var er = bs.r + player.r * 0.75;
      if (edx * edx + edy * edy < er * er) {
        ebullets.splice(i, 1);
        damagePlayer();
      } else if (bs.y > H + 30 || bs.y < -30 || bs.x < -30 || bs.x > W + 30) {
        ebullets.splice(i, 1);
      }
    }
  }

  function updateBackground(dt) {
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      s.y += s.speed * dt * (state === ST_PLAY ? 1 : 0.4);
      s.twinkle += dt * 3;
      if (s.y > H + 4) { s.y = -4; s.x = Math.random() * W; }
    }
    if (Math.random() < 0.005 && shootStars.length < 2) {
      shootStars.push({
        x: Math.random() * W * 0.7, y: -10,
        vx: 320 + Math.random() * 260,
        vy: 160 + Math.random() * 120, t: 0
      });
    }
    for (var j = shootStars.length - 1; j >= 0; j--) {
      var sh = shootStars[j];
      sh.t += dt;
      sh.x += sh.vx * dt; sh.y += sh.vy * dt;
      if (sh.t > 1.6 || sh.y > H + 20 || sh.x > W + 20) shootStars.splice(j, 1);
    }
  }

  /* ============ Рисование ============ */
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBackground(dt) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b0e2a');
    g.addColorStop(0.5, '#1a1f4b');
    g.addColorStop(1, '#2a1a4a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    var neb = ctx.createRadialGradient(W * 0.25, H * 0.25, 10, W * 0.25, H * 0.25, W * 0.5);
    neb.addColorStop(0, 'rgba(120,60,220,0.18)');
    neb.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = neb;
    ctx.fillRect(0, 0, W, H);

    neb = ctx.createRadialGradient(W * 0.75, H * 0.7, 10, W * 0.75, H * 0.7, W * 0.45);
    neb.addColorStop(0, 'rgba(20,140,200,0.14)');
    neb.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = neb;
    ctx.fillRect(0, 0, W, H);

    if (planet) {
      var pg = ctx.createRadialGradient(planet.x - planet.r * 0.3, planet.y - planet.r * 0.3, planet.r * 0.1, planet.x, planet.y, planet.r);
      pg.addColorStop(0, planet.hue);
      pg.addColorStop(1, 'rgba(12,12,44,0.95)');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(planet.x, planet.y, planet.r, 0, Math.PI * 2);
      ctx.fill();
      if (planet.ring) {
        ctx.save();
        ctx.translate(planet.x, planet.y);
        ctx.rotate(-0.35);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(0, 0, planet.r * 1.6, planet.r * 0.4, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    for (var s = 0; s < shootStars.length; s++) {
      var sh = shootStars[s];
      ctx.strokeStyle = 'rgba(255,255,255,' + (Math.max(0, 1 - sh.t / 1.6)) * 0.8 + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sh.x, sh.y);
      ctx.lineTo(sh.x - sh.vx * 0.07, sh.y - sh.vy * 0.07);
      ctx.stroke();
    }

    ctx.fillStyle = '#fff';
    for (var i = 0; i < stars.length; i++) {
      var st = stars[i];
      ctx.globalAlpha = Math.min(1, 0.3 + 0.4 * Math.abs(Math.sin(st.twinkle)) + st.layer * 0.25);
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawPlayerCat(x, y, r, tilt, enginePhase, damaged) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt * 0.35);

    var flameLen = 22 + Math.sin(enginePhase) * 7;
    var fg = ctx.createLinearGradient(0, r * 0.6, 0, r * 0.6 + flameLen);
    fg.addColorStop(0, 'rgba(255,255,200,0.95)');
    fg.addColorStop(0.4, 'rgba(255,160,40,0.7)');
    fg.addColorStop(1, 'rgba(255,60,10,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-7, r * 0.55);
    ctx.quadraticCurveTo(0, r * 0.6 + flameLen, 7, r * 0.55);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = damaged ? '#ef5350' : '#9aa3b2';
    ctx.beginPath();
    ctx.moveTo(-r * 0.25, r * 1.0);
    ctx.lineTo(-r * 0.75, r * 1.7);
    ctx.lineTo(-r * 0.25, r * 1.5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(r * 0.25, r * 1.0);
    ctx.lineTo(r * 0.75, r * 1.7);
    ctx.lineTo(r * 0.25, r * 1.5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = damaged ? '#ef5350' : '#f0f3f8';
    roundRect(-r * 0.5, -r * 0.1, r, r * 1.2, r * 0.3);
    ctx.fill();

    ctx.strokeStyle = 'rgba(77,208,225,0.9)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, -r * 0.25, r * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(140,220,255,0.16)';
    ctx.beginPath();
    ctx.arc(0, -r * 0.25, r * 0.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = damaged ? '#ef5350' : '#8d6e63';
    ctx.beginPath();
    ctx.moveTo(-r * 0.42, -r * 0.25); ctx.lineTo(-r * 0.2, -r * 0.75); ctx.lineTo(-r * 0.05, -r * 0.3);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(r * 0.42, -r * 0.25); ctx.lineTo(r * 0.2, -r * 0.75); ctx.lineTo(r * 0.05, -r * 0.3);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#ffca28';
    ctx.beginPath();
    ctx.moveTo(-r * 0.13, -r * 0.1);
    ctx.lineTo(-r * 0.05, -r * 0.28);
    ctx.lineTo(r * 0.03, -r * 0.1);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(-r * 0.18, -r * 0.25, r * 0.13, r * 0.16, 0, 0, Math.PI * 2);
    ctx.ellipse(r * 0.18, -r * 0.25, r * 0.13, r * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#213530';
    ctx.beginPath();
    ctx.arc(-r * 0.18, -r * 0.25, r * 0.065, 0, Math.PI * 2);
    ctx.arc(r * 0.18, -r * 0.25, r * 0.065, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(-r * 0.25, -r * 0.5, r * 0.16, r * 0.09, -0.7, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  function drawPlayer() {
    var blink = player.invuln > 0 && Math.floor(gameTime * 14) % 2 === 0;
    if (!blink) drawPlayerCat(player.x, player.y, player.r, player.tilt, player.enginePhase, player.lives <= 1);

    if (player.shieldTime > 0) {
      var sa = 0.5 + 0.4 * Math.sin(gameTime * 8);
      if (player.shieldTime < 2) sa *= 0.4 + 0.6 * Math.abs(Math.sin(gameTime * 12));
      ctx.strokeStyle = 'rgba(77,208,225,' + sa + ')';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.r * 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(77,208,225,' + (sa * 0.12) + ')';
      ctx.fill();
    }
  }

  function drawEnemy(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    var fw = e.hitFlash > 0;

    if (e.kind === 'drone') {
      ctx.fillStyle = fw ? '#fff' : '#7e57c2';
      roundRect(-15, -12, 30, 24, 8); ctx.fill();
      ctx.fillStyle = fw ? '#fff' : '#512da8';
      ctx.beginPath();
      ctx.moveTo(-15, -4); ctx.lineTo(-22, 4); ctx.lineTo(-15, 8);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(15, -4); ctx.lineTo(22, 4); ctx.lineTo(15, 8);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = fw ? '#fff' : '#b388ff';
      ctx.beginPath(); ctx.moveTo(-7, -10); ctx.lineTo(-3, -20); ctx.lineTo(-1, -10); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(7, -10); ctx.lineTo(3, -20); ctx.lineTo(1, -10); ctx.closePath(); ctx.fill();
      ctx.fillStyle = fw ? '#eee' : '#b388ff';
      ctx.beginPath(); ctx.arc(0, -1, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#311b92';
      ctx.beginPath(); ctx.arc(0, -1, 2.6, 0, Math.PI * 2); ctx.fill();
    } else if (e.kind === 'zig') {
      ctx.fillStyle = fw ? '#fff' : '#ef6c00';
      ctx.beginPath();
      for (var i = 0; i < 6; i++) {
        var ang = i * Math.PI / 3 + e.t * 3;
        var rr = i % 2 === 0 ? 16 : 9;
        var px = Math.cos(ang) * rr, py = Math.sin(ang) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = fw ? '#eee' : '#ffab40';
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#bf360c';
      ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, Math.PI * 2); ctx.fill();
    } else if (e.kind === 'tank') {
      ctx.fillStyle = fw ? '#fff' : '#455a64';
      roundRect(-26, -20, 52, 40, 10); ctx.fill();
      ctx.fillStyle = fw ? '#eee' : '#263238';
      roundRect(-18, -12, 36, 24, 6); ctx.fill();
      ctx.fillStyle = fw ? '#eee' : '#ff5252';
      ctx.globalAlpha = 0.5 + 0.4 * Math.sin(e.t * 6);
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = fw ? '#fff' : '#37474f';
      roundRect(-30, -24, 60, 8, 4); ctx.fill();
      ctx.fillStyle = fw ? '#eee' : '#546e7a';
      roundRect(-8, -34, 16, 12, 3); ctx.fill();
      ctx.fillStyle = '#ff8a80';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('TANK', 0, 2);
    } else if (e.kind === 'shooter') {
      ctx.fillStyle = fw ? '#fff' : '#00897b';
      ctx.beginPath();
      ctx.moveTo(0, 20);
      ctx.lineTo(-17, -8); ctx.lineTo(-6, -16); ctx.lineTo(6, -16); ctx.lineTo(17, -8);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = fw ? '#eee' : '#b2dfdb';
      ctx.beginPath(); ctx.arc(0, -2, 6.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = fw ? '#eee' : '#004d40';
      ctx.beginPath(); ctx.arc(0, -2, 3, 0, Math.PI * 2); ctx.fill();
    } else if (e.kind === 'kamikaze') {
      ctx.fillStyle = fw ? '#fff' : '#e53935';
      ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = fw ? '#eee' : '#ffcdd2';
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(e.t * 16);
      ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = fw ? '#eee' : '#b71c1c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-9, 0); ctx.lineTo(9, 0);
      ctx.moveTo(0, -9); ctx.lineTo(0, 9);
      ctx.stroke();
    } else if (e.kind === 'boss') {
      drawBossBody(e);
    }

    if (fw) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();

    if (e.kind !== 'boss' && e.maxHp > 2 && e.hp < e.maxHp) {
      var w = e.r * 2, pct = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(e.x - w / 2, e.y - e.r - 12, w, 5);
      ctx.fillStyle = '#ff7043';
      ctx.fillRect(e.x - w / 2 + 1, e.y - e.r - 11, (w - 2) * pct, 3);
    }
  }

  function drawBossBody(b) {
    var fw = b.hitFlash > 0;
    ctx.save();
    ctx.translate(0, Math.sin(b.t * 2) * 4);

    ctx.fillStyle = fw ? '#fff' : '#2e1065';
    ctx.beginPath();
    ctx.ellipse(0, 0, b.r, b.r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = fw ? '#eee' : '#7c4dff';
    ctx.beginPath();
    ctx.ellipse(0, -6, b.r * 0.75, b.r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();

    var eyeR = 13 + Math.sin(b.t * 5) * 2;
    for (var s = -1; s <= 1; s += 2) {
      ctx.fillStyle = fw ? '#eee' : '#fff200';
      ctx.beginPath();
      ctx.arc(s * b.r * 0.25, -12, eyeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#212121';
      ctx.beginPath();
      ctx.arc(s * b.r * 0.25, -12, eyeR * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = fw ? '#eee' : '#5e35b1';
    for (var t2 = 0; t2 < 5; t2++) {
      var xx = -b.r + t2 * (b.r / 2);
      ctx.beginPath();
      ctx.moveTo(xx, b.r * 0.25);
      ctx.lineTo(xx + b.r * 0.25, b.r * 0.25);
      ctx.lineTo(xx + b.r * 0.125, b.r * 0.25 + 14 + Math.sin(b.t * 7 + t2) * 4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    var bw = Math.min(340, W - 100);
    var by = 14;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(W / 2 - bw / 2, by, bw, 16);
    var pct = Math.max(0, b.hp / b.maxHp);
    var bg = ctx.createLinearGradient(W / 2 - bw / 2, 0, W / 2 + bw / 2, 0);
    bg.addColorStop(0, '#ff1744');
    bg.addColorStop(1, '#ff8a80');
    ctx.fillStyle = bg;
    ctx.fillRect(W / 2 - bw / 2 + 2, by + 2, (bw - 4) * pct, 12);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(W / 2 - bw / 2, by, bw, 16);
  }

  function drawBullets() {
    var i;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < bullets.length; i++) {
      var b = bullets[i];
      if (b.big) {
        var g = ctx.createRadialGradient(b.x, b.y, 1, b.x, b.y, b.r * 2.4);
        g.addColorStop(0, 'rgba(255,255,220,0.95)');
        g.addColorStop(0.4, 'rgba(255,180,60,0.5)');
        g.addColorStop(1, 'rgba(255,120,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 2.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(77,208,225,0.85)';
        ctx.beginPath();
        ctx.arc(b.x, b.y + 5, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e0feff';
        roundRect(b.x - 2.4, b.y - 9, 4.8, 16, 2.4);
        ctx.fill();
      }
    }
    for (i = 0; i < ebullets.length; i++) {
      var e = ebullets[i];
      var col = e.kind === 'b' ? '255,60,120' : '255,180,60';
      var g2 = ctx.createRadialGradient(e.x, e.y, 1, e.x, e.y, e.r * 2);
      g2.addColorStop(0, 'rgba(255,255,255,0.95)');
      g2.addColorStop(0.4, 'rgba(' + col + ',0.7)');
      g2.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPowerups() {
    var icons = { coin: '#ffd740', gun: '#69f0ae', shield: '#4dd0e1', bomb: '#ff8a65', life: '#ff5252' };
    var glyph = { coin: '★', gun: '▲', shield: '⬡', bomb: '✸', life: '♥' };
    for (var i = 0; i < powerups.length; i++) {
      var pu = powerups[i];
      var pulse = 1 + Math.sin(pu.t * 6) * 0.12;
      var col = icons[pu.kind] || '#fff';
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.3 + 0.15 * Math.sin(pu.t * 6);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(pu.x, pu.y, pu.r * 1.5 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(10,15,40,0.85)';
      ctx.beginPath();
      ctx.arc(pu.x, pu.y, pu.r * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.font = 'bold 17px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(glyph[pu.kind] || '?', pu.x, pu.y + 1);
    }
  }

  function drawParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.t += dt;
      if (p.t >= p.life) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.grav || 0) * dt;
      ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawPopups(dt) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
    for (var i = popups.length - 1; i >= 0; i--) {
      var p = popups[i];
      p.t += dt;
      if (p.t >= p.life) { popups.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillText(p.text, p.x + 1.5, p.y - p.t * 55 + 1.5);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y - p.t * 55);
    }
    ctx.globalAlpha = 1;
  }

  function drawHeart(x, y, r, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, r * 0.7);
    ctx.bezierCurveTo(-r * 1.4, -r * 0.3, -r * 0.55, -r * 1.2, 0, -r * 0.25);
    ctx.bezierCurveTo(r * 0.55, -r * 1.2, r * 1.4, -r * 0.3, 0, r * 0.7);
    ctx.fill();
    ctx.restore();
  }

  var pauseBtnRect = null;

  function drawHUD() {
    ctx.fillStyle = 'rgba(5,10,30,0.45)';
    roundRect(10, 10, 130, 52, 10);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#fdfdfd';
    ctx.font = 'bold 22px "Segoe UI", Arial, sans-serif';
    ctx.fillText(String(score), 22, 15);
    ctx.font = '13px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#b0bec5';
    ctx.fillText(t('level') + ' ' + wave, 22, 40);

    if (combo > 1) {
      ctx.fillStyle = 'rgba(255,215,64,' + Math.min(1, comboTimer / 2 + 0.4) + ')';
      ctx.font = 'bold 17px "Segoe UI", Arial, sans-serif';
      ctx.fillText('x' + combo + ' ' + t('combo'), 150, 24);
    }

    for (var i = 0; i < player.lives; i++) {
      drawHeart(W - 26 - i * 28, 26, 11, '#ff5252');
    }

    var s = 40, bx = W - 16 - s, by = 66;
    pauseBtnRect = { x: bx, y: by, w: s, h: s };
    ctx.fillStyle = 'rgba(5,10,30,0.45)';
    roundRect(bx, by, s, s, 9);
    ctx.fill();
    ctx.fillStyle = '#fdfdfd';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('❚❚', bx + s / 2, by + s / 2 + 1);
  }

  function drawBanner() {
    if (waveBannerTime <= 0) return;
    var a = Math.min(1, waveBannerTime * 2);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(5,10,40,0.45)';
    ctx.fillRect(0, H * 0.36, W, 90);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + Math.min(46, W * 0.09) + 'px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = bossBanner ? '#ff1744' : '#4dd0e1';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 5;
    var txt = bossBanner ? '☠ BOSS ☠' : t('waveUp') + ' ' + wave;
    ctx.strokeText(txt, W / 2, H * 0.36 + 34);
    ctx.fillText(txt, W / 2, H * 0.36 + 34);
    ctx.restore();
  }

  function button(label, cx, cy, wBg, colorBg, colorText) {
    var h = 52;
    var w = Math.min(wBg, W - 60);
    var x = cx - w / 2, y = cy - h / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = colorBg;
    roundRect(x, y, w, h, 14);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = colorText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 21px "Segoe UI", Arial, sans-serif';
    ctx.fillText(label, x + w / 2, y + h / 2);
    return { x: x, y: y, w: w, h: h };
  }

  function drawMenu() {
    clickable = [];
    var scale = Math.min(1, W / 420);
    var cx = W / 2, baseY = H * 0.18;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 ' + Math.floor(46 * scale) + 'px "Segoe UI", Arial, sans-serif';
    var g = ctx.createLinearGradient(0, baseY - 30, 0, baseY + 30);
    g.addColorStop(0, '#fff59d');
    g.addColorStop(0.5, '#ffd740');
    g.addColorStop(1, '#ff9100');
    ctx.fillStyle = g;
    ctx.strokeStyle = 'rgba(30,20,8,0.65)';
    ctx.lineWidth = 6;
    ctx.strokeText(t('title1'), cx, baseY);
    ctx.fillText(t('title1'), cx, baseY);
    ctx.font = Math.floor(15 * scale) + 'px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#90a4ae';
    ctx.fillText(t('title2'), cx, baseY + 40 * scale);
    ctx.restore();

    drawPlayerCat(W / 2, H * 0.42, Math.min(55, W * 0.13), Math.sin(menuAnim * 1.5) * 0.12, menuAnim * 7, false);
    drawPlayerCat(W / 2 - 130 * scale, H * 0.5, Math.min(30, W * 0.075), Math.sin(menuAnim * 2 + 2) * 0.25, menuAnim * 7, false);
    drawPlayerCat(W / 2 + 130 * scale, H * 0.5, Math.min(30, W * 0.075), Math.sin(menuAnim * 2 + 4) * 0.25, menuAnim * 7, false);

    var btnY = H * 0.68;
    var pulse = 1 + Math.sin(menuAnim * 3) * 0.25;
    ctx.save();
    ctx.translate(W / 2, btnY);
    ctx.scale(pulse, pulse);
    ctx.translate(-W / 2, -btnY);
    var bb = button(t('play'), W / 2, btnY, 250, '#00c853', '#fff');
    clickable.push(Object.assign({}, bb, { fn: startGame }));
    ctx.restore();

    if (best > 0) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#fdfdfd';
      ctx.fillText(t('best') + ': ' + best, W / 2, H * 0.78);
    }
  }

  function drawGameOver() {
    clickable = [];
    ctx.fillStyle = 'rgba(5,10,40,0.72)';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var baseY = H * 0.2;
    ctx.font = '900 ' + Math.min(40, W * 0.075) + 'px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#ff5252';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 5;
    ctx.strokeText(t('over'), W / 2, baseY);
    ctx.fillText(t('over'), W / 2, baseY);

    ctx.font = 'bold 26px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#fdfdfd';
    ctx.fillText(t('score') + ': ' + score, W / 2, baseY + 52);
    ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#ffca28';
    ctx.fillText(t('best') + ': ' + best, W / 2, baseY + 84);

    if (score > 0 && score >= best) {
      var s = 1 + Math.sin(menuAnim * 4) * 0.25;
      ctx.font = 'bold ' + Math.floor(20 * s) + 'px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#ffea00';
      ctx.fillText('🏆 ' + t('newRec'), W / 2, baseY + 118);
    }

    var b1 = button(t('again'), W / 2, H * 0.56, 240, '#00c853', '#fff');
    clickable.push(Object.assign({}, b1, { fn: startGame }));

    var b2 = button(t('continueAd'), W / 2, H * 0.56 + 64, 240, '#7c4dff', '#fff');
    clickable.push(Object.assign({}, b2, { fn: function () { showRewardedAd(function () { revive(); popupText(W / 2, H / 2, t('reviving'), '#fff'); }); } }));
  }

  function drawPause() {
    ctx.fillStyle = 'rgba(5,10,40,0.7)';
    ctx.fillRect(0, 0, W, H);
    clickable = [];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 ' + Math.min(40, W * 0.08) + 'px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#fdfdfd';
    ctx.fillText(t('pause'), W / 2, H * 0.3);

    var b1 = button(t('resume'), W / 2, H * 0.47, 240, '#00c853', '#fff');
    clickable.push(Object.assign({}, b1, { fn: function () { state = ST_PLAY; gameplayStart(); } }));
    var b2 = button(t('toMenu'), W / 2, H * 0.47 + 64, 240, '#455a64', '#fff');
    clickable.push(Object.assign({}, b2, { fn: function () { state = ST_MENU; gameplayStop(); } }));
  }

  /* ============ Главное меню-фон и цикл ============ */
  function menuEnemyDecor(dt) {
    if (enemies.length === 0 && Math.random() < 0.02) {
      enemies.push({ kind: 'drone', x: 40 + Math.random() * (W - 80), y: -40, vx: 0, vy: 60, hp: 1, maxHp: 1, r: 17, t: 0, baseX: 0, phase: 0, fireCd: 99, hitFlash: 0, stopY: 0, baseY: 0 });
      enemies[enemies.length - 1].baseX = enemies[enemies.length - 1].x;
    }
    for (var j = enemies.length - 1; j >= 0; j--) {
      var e = enemies[j];
      e.y += e.vy * dt;
      e.x = e.baseX + Math.sin(e.t * 2) * 50;
      e.t += dt;
      if (e.y > H + 60) enemies.splice(j, 1);
    }
  }

  function loop(now) {
    requestAnimationFrame(loop);
    if (!lastTime) lastTime = now;
    var dt = Math.min(0.045, (now - lastTime) / 1000);
    lastTime = now;
    menuAnim += dt;

    updateBackground(dt);

    ctx.save();
    if (shake > 0) {
      shake = Math.max(0, shake - dt * 30);
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }

    drawBackground(dt);

    if (state === ST_PLAY) update(dt);
    if (state === ST_MENU) menuEnemyDecor(dt);

    for (var j = 0; j < enemies.length; j++) drawEnemy(enemies[j]);
    drawBullets();
    drawPowerups();
    drawParticles(dt);
    if (state === ST_PLAY) drawPlayer();
    drawPopups(dt);

    ctx.restore();

    if (flash > 0) {
      flash = Math.max(0, flash - dt * 2);
      ctx.fillStyle = 'rgba(' + flashColor + ',' + (flash * 0.5) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    if (state === ST_PLAY) {
      drawHUD();
      drawBanner();
      if (waveBannerTime > 0) waveBannerTime -= dt;
    } else if (state === ST_MENU) {
      drawMenu();
    } else if (state === ST_OVER) {
      drawGameOver();
    } else if (state === ST_PAUSE) {
      drawPause();
    }
  }

  /* ============ Музыка: старт ============ */
  function startMusic() {
    if (!ensureAudio()) return;
    resumeAudio();
    if (!musicStarted) {
      musicStarted = true;
      nextNoteTime = audioCtx.currentTime + 0.1;
      musicStep = 0;
      scheduleMusic();
      setInterval(function () {
        if (audioCtx && musicOn && (state === ST_PLAY || state === ST_MENU)) scheduleMusic();
      }, 180);
    }
    musicOn = true;
  }

  /* ============ Старт ============ */
  resize();
  initBackground();
  window.addEventListener('resize', function () { resize(); initBackground(); });
  window.addEventListener('orientationchange', function () { setTimeout(function () { resize(); initBackground(); }, 120); });
  requestFullscreen();
  try {
    var firstInteract = function () { startMusic(); window.removeEventListener('mousedown', firstInteract); window.removeEventListener('touchstart', firstInteract); };
    window.addEventListener('mousedown', firstInteract);
    window.addEventListener('touchstart', firstInteract);
  } catch (e) {}
  startMusic();
  requestAnimationFrame(loop);

  var loading = document.getElementById('loading');
  if (loading) loading.remove();
})();
