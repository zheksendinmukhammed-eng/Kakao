/* Кот и Рыбки — детская аркада для Яндекс Игр */
(function () {
  'use strict';

  var canvas = document.getElementById('canvas');
  var ctx = canvas.getContext('2d');
  var W = 0, H = 0, DPR = 1;

  /* ---------- Яндекс SDK ---------- */
  var ysdk = null;

  function initYandexSDK() {
    if (window.YaGames) {
      window.YaGames.init()
        .then(function (sdk) {
          ysdk = sdk;
          if (sdk.features && sdk.features.LoadingAPI) {
            sdk.features.LoadingAPI.ready();
          }
        })
        .catch(function () { ysdk = null; });
    }
  }

  function sendFullscreenOn() {
    try { if (ysdk && ysdk.screen && ysdk.screen.fullscreen) ysdk.screen.fullscreen.request(); } catch (e) {}
  }

  /* ---------- Звук ---------- */
  var audioCtx = null;

  function beep(freq, duration, type, volume) {
    try {
      if (!audioCtx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        audioCtx = new AC();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      gain.gain.value = volume || 0.15;
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
  }

  var soundCatch = function () { beep(660, 0.12, 'triangle', 0.18); beep(880, 0.15, 'triangle', 0.12); };
  var soundBomb = function () { beep(160, 0.3, 'sawtooth', 0.2); };
  var soundOver = function () { beep(300, 0.2, 'sine', 0.15); setTimeout(function () { beep(220, 0.3, 'sine', 0.15); }, 180); };
  var soundLevel = function () { beep(523, 0.1, 'triangle', 0.15); setTimeout(function () { beep(659, 0.1, 'triangle', 0.15); }, 100); setTimeout(function () { beep(784, 0.2, 'triangle', 0.15); }, 200); };

  /* ---------- Состояние ---------- */
  var STATE_MENU = 0, STATE_PLAY = 1, STATE_OVER = 2;
  var state = STATE_MENU;

  var cat = { x: 0, y: 0, w: 90, h: 90, targetX: 0 };
  var items = [];
  var particles = [];
  var popups = [];
  var bubbles = [];
  var score = 0;
  var lives = 3;
  var level = 1;
  var best = 0;
  var spawnTimer = 0;
  var elapsed = 0;
  var shakeTime = 0;
  var lastTime = 0;

  try { best = parseInt(localStorage.getItem('catfish_best') || '0', 10) || 0; } catch (e) {}

  function maxLives() { return 3; }
  function levelSpeed() { return 120 + level * 45; }
  function spawnInterval() { return Math.max(0.45, 1.1 - level * 0.07); }

  function resetGame() {
    score = 0;
    lives = maxLives();
    level = 1;
    items = [];
    particles = [];
    popups = [];
    spawnTimer = 0;
    elapsed = 0;
    cat.x = W / 2;
    cat.targetX = W / 2;
  }

  function startGame() {
    resetGame();
    state = STATE_PLAY;
    try { if (ysdk && ysdk.features && ysdk.features.GameplayAPI) ysdk.features.GameplayAPI.start(); } catch (e) {}
  }

  function gameOver() {
    state = STATE_OVER;
    soundOver();
    if (score > best) {
      best = score;
      try { localStorage.setItem('catfish_best', String(best)); } catch (e) {}
      try {
        if (ysdk && ysdk.leaderboards) {
          ysdk.getLeaderboards()
            .then(function (lb) { return lb.setLeaderboardScore('leaderboard', best); })
            .catch(function () {});
        }
      } catch (e) {}
    }
    try { if (ysdk && ysdk.features && ysdk.features.GameplayAPI) ysdk.features.GameplayAPI.stop(); } catch (e) {}
  }

  /* ---------- Эффекты ---------- */
  function burst(x, y, color, count) {
    for (var i = 0; i < (count || 12); i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 60 + Math.random() * 140;
      particles.push({
        x: x, y: y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 40,
        life: 0.5 + Math.random() * 0.4,
        t: 0,
        color: color,
        r: 3 + Math.random() * 4
      });
    }
  }

  function popup(x, y, text, color) {
    popups.push({ x: x, y: y, text: text, color: color || '#fff', t: 0, life: 0.9 });
  }

  /* ---------- Игровые объекты ---------- */
  function spawnItem() {
    var bombChance = Math.min(0.25, 0.08 + level * 0.02);
    var isBomb = Math.random() < bombChance;
    var goldFish = !isBomb && Math.random() < 0.08;
    items.push({
      x: 40 + Math.random() * (W - 80),
      y: -50,
      vy: levelSpeed() * (0.8 + Math.random() * 0.5),
      vx: (Math.random() - 0.5) * 30,
      bomb: isBomb,
      gold: goldFish,
      rot: 0,
      w: 56,
      h: 56
    });
  }

  function onCatch(item) {
    var points = item.gold ? 5 : 1;
    score += points;
    popup(item.x, item.y, '+' + points, item.gold ? '#ffd700' : '#fff');
    burst(item.x, item.y, item.gold ? '#ffd700' : '#4dd0e1');
    soundCatch();
    var newLevel = Math.min(10, 1 + Math.floor(score / 12));
    if (newLevel > level) {
      level = newLevel;
      popup(cat.x, cat.y - 60, 'Уровень ' + level, '#ffeb3b');
      soundLevel();
    }
    if (score % 25 === 0 && lives < maxLives()) lives++;
  }

  function onBomb(item) {
    lives--;
    shakeTime = 0.35;
    burst(item.x, item.y, '#ef5350', 20);
    popup(item.x, item.y, 'Ой!', '#ef5350');
    soundBomb();
    if (lives <= 0) gameOver();
  }

  /* ---------- Размеры ---------- */
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cat.w = Math.max(70, Math.min(110, W * 0.13));
    cat.h = cat.w;
    cat.y = H - cat.h - 10;
    cat.x = cat.x || W / 2;
    cat.targetX = cat.targetX || W / 2;
    bubbles = [];
    for (var i = 0; i < 14; i++) {
      bubbles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 4 + Math.random() * 14,
        speed: 15 + Math.random() * 30
      });
    }
  }

  /* ---------- Ввод ---------- */
  function moveCatTo(clientX) {
    cat.targetX = Math.max(cat.w / 2, Math.min(W - cat.w / 2, clientX));
  }

  function activate() {
    if (state === STATE_MENU) startGame();
    else if (state === STATE_OVER) startGame();
  }

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  window.addEventListener('mousemove', function (e) { if (state === STATE_PLAY) moveCatTo(e.clientX); });
  window.addEventListener('mousedown', function (e) { moveCatTo(e.clientX); activate(); });

  window.addEventListener('touchstart', function (e) {
    if (e.target === canvas) e.preventDefault();
    if (e.touches.length) {
      moveCatTo(e.touches[0].clientX);
      activate();
    }
  }, { passive: false });
  window.addEventListener('touchmove', function (e) {
    if (e.target === canvas) e.preventDefault();
    if (e.touches.length) moveCatTo(e.touches[0].clientX);
  }, { passive: false });

  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('keydown', function (e) {
    if (e.code === 'Space' || e.code === 'Enter') { activate(); return; }
    var speed = W * 0.6;
    if (e.code === 'ArrowLeft') cat.targetX = Math.max(0, cat.targetX - speed * 0.25);
    if (e.code === 'ArrowRight') cat.targetX = Math.min(W, cat.targetX + speed * 0.25);
  });

  /* ---------- Отрисовка ---------- */
  var SEA_TOP = { r: 79, g: 195, b: 247 };
  var SEA_BOTTOM = { r: 26, g: 119, b: 182 };
  var CLOUDS, SEAWEED;

  function initDecor() {
    CLOUDS = [];
    for (var i = 0; i < 4; i++) {
      CLOUDS.push({ x: Math.random() * W, y: 30 + Math.random() * 80, s: 25 + Math.random() * 25 });
    }
    SEAWEED = [];
    for (var j = 0; j < 6; j++) {
      SEAWEED.push({ x: (W / 6) * j + 30 + Math.random() * 40, s: 0.7 + Math.random() * 0.6 });
    }
  }

  function drawBackground(dt) {
    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgb(79,195,247)');
    grad.addColorStop(0.45, 'rgb(41,150,226)');
    grad.addColorStop(1, 'rgb(13,90,158)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // солнце
    ctx.fillStyle = 'rgba(255,236,150,0.9)';
    ctx.beginPath();
    ctx.arc(W - 70, 70, 34, 0, Math.PI * 2);
    ctx.fill();

    // облака
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (var i = 0; i < CLOUDS.length; i++) {
      var c = CLOUDS[i];
      var t = elapsed * 0.25;
      var cx = ((c.x + t) % (W + 150)) - 75;
      ctx.beginPath();
      ctx.arc(cx, c.y, c.s * 0.6, 0, Math.PI * 2);
      ctx.arc(cx + c.s * 0.6, c.y - c.s * 0.25, c.s * 0.45, 0, Math.PI * 2);
      ctx.arc(cx - c.s * 0.6, c.y + c.s * 0.05, c.s * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // дно — песок
    ctx.fillStyle = '#f9dc9c';
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, H - 24);
    for (var k = 0; k <= W; k += 60) {
      ctx.quadraticCurveTo(k + 15, H - 34, k + 60, H - 24);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();

    // водоросли
    ctx.strokeStyle = '#2e9e5b';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    for (var m = 0; m < SEAWEED.length; m++) {
      var sw = SEAWEED[m];
      var sway = Math.sin(elapsed * 2 + m) * 12;
      ctx.beginPath();
      ctx.moveTo(sw.x, H - 20);
      ctx.quadraticCurveTo(sw.x + sway, H - 60 * sw.s, sw.x + sway * 1.6, H - 95 * sw.s);
      ctx.stroke();
    }

  }

  function drawBubbleField() {
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    for (var i = 0; i < bubbles.length; i++) {
      var bl = bubbles[i];
      var y = H - ((elapsed * bl.speed + bl.y * 7) % (H + 60));
      ctx.beginPath();
      ctx.arc(bl.x + Math.sin(elapsed * 1.5 + i) * 10, y, bl.r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawItem(item) {
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(item.rot);
    ctx.font = Math.round(item.w) + 'px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (item.bomb) {
      ctx.fillText('💣', 0, 0);
    } else {
      if (item.gold) {
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 15;
      }
      ctx.fillText(item.gold ? '🐠' : '🐟', 0, 0);
    }
    ctx.restore();
  }

  function drawCat() {
    ctx.save();
    ctx.translate(cat.x, cat.y);
    var bounce = state === STATE_PLAY ? Math.sin(elapsed * 10) * 3 : Math.sin(elapsed * 3) * 4;
    ctx.translate(0, bounce + 10);
    ctx.font = Math.round(cat.w) + 'px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🐱', 0, 0);
    ctx.restore();
  }

  function drawParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.t += dt;
      if (p.t >= p.life) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 300 * dt;
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawPopups(dt) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px "Segoe UI", Arial, sans-serif';
    for (var i = popups.length - 1; i >= 0; i--) {
      var p = popups[i];
      p.t += dt;
      if (p.t >= p.life) { popups.splice(i, 1); continue; }
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillStyle = p.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 4;
      ctx.strokeText(p.text, p.x, p.y - p.t * 60);
      ctx.fillText(p.text, p.x, p.y - p.t * 60);
    }
    ctx.globalAlpha = 1;
  }

  function drawHUD() {
    ctx.font = 'bold 28px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 4;
    ctx.strokeText('🐟 ' + score, 16, 14);
    ctx.fillText('🐟 ' + score, 16, 14);
    ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
    ctx.strokeText('Ур. ' + level, 16, 50);
    ctx.fillText('Ур. ' + level, 16, 50);

    ctx.font = '26px serif';
    ctx.textAlign = 'right';
    var hearts = '';
    for (var i = 0; i < lives; i++) hearts += '❤️';
    ctx.fillText(hearts, W - 16, 14);
  }

  function drawCenteredCard() {
    ctx.fillStyle = 'rgba(0,50,90,0.55)';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (state === STATE_MENU) {
      ctx.font = Math.round(Math.min(64, W * 0.12)) + 'px serif';
      ctx.fillText('🐱🐟', W / 2, H * 0.25);
      ctx.font = 'bold ' + Math.round(Math.min(56, W * 0.1)) + 'px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 6;
      ctx.strokeText('Кот и Рыбки', W / 2, H * 0.4);
      ctx.fillText('Кот и Рыбки', W / 2, H * 0.4);

      ctx.font = '22px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#ffe082';
      ctx.fillText('Ловим рыбок, не дай бомбочкам упасть!', W / 2, H * 0.5);

      var pulse = 1 + Math.sin(elapsed * 4) * 0.05;
      ctx.save();
      ctx.translate(W / 2, H * 0.63);
      ctx.scale(pulse, pulse);
      ctx.font = 'bold 30px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#00e676';
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 6;
      ctx.strokeText('▶ ИГРАТЬ', 0, 0);
      ctx.fillText('▶ ИГРАТЬ', 0, 0);
      ctx.restore();

      if (best > 0) {
        ctx.font = 'bold 22px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText('Рекорд: ' + best, W / 2, H * 0.75);
      }
    } else {
      ctx.font = 'bold ' + Math.round(Math.min(48, W * 0.09)) + 'px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#ff8a80';
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 6;
      ctx.strokeText('Игра окончена', W / 2, H * 0.3);
      ctx.fillText('Игра окончена', W / 2, H * 0.3);

      ctx.font = 'bold 30px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText('Счёт: ' + score, W / 2, H * 0.45);
      ctx.fillText('Рекорд: ' + best, W / 2, H * 0.53);

      if (score >= best && score > 0) {
        ctx.font = 'bold 24px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = '#ffd700';
        ctx.fillText('🎉 Новый рекорд!', W / 2, H * 0.6);
      }

      var pulse2 = 1 + Math.sin(elapsed * 4) * 0.05;
      ctx.save();
      ctx.translate(W / 2, H * 0.72);
      ctx.scale(pulse2, pulse2);
      ctx.font = 'bold 28px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#00e676';
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 6;
      ctx.strokeText('↻ ЕЩЁ РАЗ', 0, 0);
      ctx.fillText('↻ ЕЩЁ РАЗ', 0, 0);
      ctx.restore();
    }
  }

  /* ---------- Обновление ---------- */
  function update(dt) {
    bubbles = bubbles || [];
    for (var i = items.length - 1; i >= 0; i--) {
      var it = items[i];
      it.y += it.vy * dt;
      it.x += it.vx * dt;
      if (it.x < it.w / 2 || it.x > W - it.w / 2) it.vx *= -1;
      it.rot += dt * (it.bomb ? 1.5 : 1);

      var dx = Math.abs(it.x - cat.x);
      var dy = Math.abs(it.y - cat.y);
      if (dx < (cat.w * 0.75) && dy < (cat.h * 0.25 + it.h * 0.25)) {
        items.splice(i, 1);
        if (it.bomb) onBomb(it); else onCatch(it);
      } else if (it.y > H + 60) {
        items.splice(i, 1);
      }
    }
  }

  /* ---------- Цикл ---------- */
  function loop(now) {
    requestAnimationFrame(loop);
    if (!lastTime) lastTime = now;
    var dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    if (state === STATE_MENU || state === STATE_OVER) {
      elapsed += dt;
    }

    drawBackground();
    drawBubbleField();

    if (state === STATE_PLAY) {
      elapsed += dt;
      cat.x += (cat.targetX - cat.x) * Math.min(1, dt * 14);
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnItem();
        spawnTimer = spawnInterval() * (0.8 + Math.random() * 0.4);
      }
      update(dt);
    }

    if (shakeTime > 0) {
      shakeTime -= dt;
      ctx.save();
      ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
    }

    for (var i = 0; i < items.length; i++) drawItem(items[i]);
    drawCat();
    drawParticles(dt);
    drawPopups(dt);

    if (shakeTime > 0) ctx.restore();

    if (state === STATE_PLAY) drawHUD();
    else drawCenteredCard();
  }

  initYandexSDK();
  resize();
  initDecor();
  window.addEventListener('resize', initDecor);
  sendFullscreenOn();
  requestAnimationFrame(loop);

  var loading = document.getElementById('loading');
  if (loading) loading.remove();
})();
