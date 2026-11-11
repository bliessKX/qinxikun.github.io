/*!
 * NICE.BLOG — Summer Memory Ambience
 * 2D Canvas scene: grandpa's rice field, village, children and ditch ecology.
 * Compatible with localStorage key "nice-amb" and existing #ambBtn controls.
 */
(function () {
  'use strict';

  if (window.__NICE_AMBIENCE__) return;
  window.__NICE_AMBIENCE__ = true;

  var MODE_KEY = 'nice-amb';
  var REDUCED = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var canvas = document.getElementById('amb');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'amb';
    document.body.insertBefore(canvas, document.body.firstChild);
  }
  // 关键兜底：ambience.css 由 JS 异步加载，生效前先同步内联定位样式，
  // 避免画布在样式表就绪前以文档流形式闪现一大块灰底。
  // 不内联 opacity/transition，保留 .amb-fade 淡出切换能力。
  canvas.style.cssText =
    'position:fixed;inset:0;z-index:-1;pointer-events:none;display:block';

  var ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  document.documentElement.classList.add('ambience-enabled');

  // Load the companion stylesheet once.
  if (!document.querySelector('link[data-ambience-css]')) {
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = (document.currentScript && document.currentScript.src
      ? document.currentScript.src.replace(/ambience\.js(?:\?.*)?$/, 'ambience.css')
      : 'assets/ambience.css');
    css.setAttribute('data-ambience-css', '1');
    document.head.appendChild(css);
  }

  var button = document.getElementById('ambBtn');
  var dot = document.getElementById('ambDot');
  var label = document.getElementById('ambLabel');

  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'amb-chip';
    button.innerHTML = '<span class="amb-dot"></span><span class="amb-label"></span>';
    document.body.appendChild(button);
    dot = button.querySelector('.amb-dot');
    label = button.querySelector('.amb-label');
  }

  var mode;
  try { mode = localStorage.getItem(MODE_KEY); } catch (e) {}
  if (mode !== 'rice' && mode !== 'leaf') {
    var hour = new Date().getHours();
    mode = hour >= 6 && hour < 18 ? 'rice' : 'leaf';
  }

  var W = 0, H = 0, DPR = 1;
  var raf = 0, lastTime = 0, elapsed = 0, running = false;
  var scene = {};
  var reducedMotion = REDUCED;

  function random(min, max) {
    return min + Math.random() * (max - min);
  }
  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }
  function smooth(t) {
    return t * t * (3 - 2 * t);
  }

  function syncButton() {
    if (dot) dot.classList.toggle('leaf', mode === 'leaf');
    if (label) label.textContent = mode === 'rice' ? '夏日稻田' : '秋日落叶';
    if (button) {
      button.setAttribute('aria-label',
        '切换背景氛围，当前：' + (mode === 'rice' ? '夏日稻田' : '秋日落叶'));
    }
  }

  function resize() {
    W = Math.max(1, window.innerWidth);
    H = Math.max(1, window.innerHeight);
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildScene();
    render(0);
  }

  function buildScene() {
    var i;
    var rice = [];
    var leaves = [];
    var fish = [];
    var shrimp = [];
    var grass = [];
    var clouds = [];

    // Rice plants are placed in perspective: short and dense in the distance,
    // taller and more detailed close to the viewer.
    for (i = 0; i < 42; i++) {
      rice.push({
        x: (i + random(-0.25, 0.25)) / 42,
        base: random(0.88, 1.04),
        height: random(0.09, 0.20),
        lean: random(-0.035, 0.035),
        phase: random(0, Math.PI * 2),
        width: random(0.65, 1.15),
        front: false
      });
    }
    for (i = 0; i < 26; i++) {
      rice.push({
        x: (i + random(-0.3, 0.3)) / 26,
        base: random(0.99, 1.08),
        height: random(0.19, 0.34),
        lean: random(-0.055, 0.055),
        phase: random(0, Math.PI * 2),
        width: random(0.9, 1.35),
        front: true
      });
    }

    for (i = 0; i < 34; i++) {
      leaves.push({
        x: random(0, W), y: random(-H, H),
        size: random(5, 12), speed: random(12, 28),
        drift: random(8, 24), phase: random(0, 6.28),
        rotation: random(0, 6.28), spin: random(-0.7, 0.7),
        color: ['#c8a56a', '#b47b43', '#a95e3d', '#d0ad67'][i % 4]
      });
    }

    for (i = 0; i < 5; i++) {
      fish.push({
        x: random(0.05, 0.95), speed: random(0.012, 0.027),
        direction: i % 2 ? -1 : 1, size: random(0.75, 1.2),
        phase: random(0, 6.28), depth: random(-2.5, 2.5)
      });
    }

    for (i = 0; i < 3; i++) {
      shrimp.push({
        x: random(0.12, 0.88), phase: random(0, 6.28),
        size: random(0.75, 1.15)
      });
    }

    for (i = 0; i < 70; i++) {
      grass.push({
        x: random(0, W), y: random(H * 0.64, H * 1.03),
        h: random(4, 13), phase: random(0, 6.28)
      });
    }

    for (i = 0; i < 4; i++) {
      clouds.push({
        x: random(-0.1, 1), y: random(0.08, 0.28),
        scale: random(0.65, 1.25), speed: random(2, 5)
      });
    }

    scene = { rice: rice, leaves: leaves, fish: fish, shrimp: shrimp,
      grass: grass, clouds: clouds };
  }

  function path(points, fill, stroke, lineWidth) {
    ctx.beginPath();
    points.forEach(function (p, i) {
      if (i === 0) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    });
    if (fill) {
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth || 1;
      ctx.stroke();
    }
  }

  function drawSky(t) {
    var sky = ctx.createLinearGradient(0, 0, 0, H * 0.72);
    sky.addColorStop(0, '#dce7df');
    sky.addColorStop(0.55, '#f1ead5');
    sky.addColorStop(1, 'rgba(232,218,180,0.08)');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H * 0.76);

    var sunX = W * 0.79, sunY = H * 0.17;
    var glow = ctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, Math.max(W, H) * 0.42);
    glow.addColorStop(0, 'rgba(255,244,205,0.62)');
    glow.addColorStop(0.28, 'rgba(255,239,194,0.20)');
    glow.addColorStop(1, 'rgba(255,239,194,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H * 0.75);

    scene.clouds.forEach(function (c) {
      var x = ((c.x * W + t * c.speed) % (W + 260)) - 130;
      var y = c.y * H;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(c.scale, c.scale);
      ctx.fillStyle = 'rgba(255,250,232,0.22)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 56, 11, 0, 0, Math.PI * 2);
      ctx.ellipse(27, -5, 32, 13, 0, 0, Math.PI * 2);
      ctx.ellipse(-26, -3, 27, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawMountains() {
    var y = H * 0.48;
    path([
      [0, y + 18], [W * 0.12, y - 34], [W * 0.24, y + 4],
      [W * 0.39, y - 48], [W * 0.54, y + 10],
      [W * 0.72, y - 26], [W * 0.88, y + 2], [W, y - 20],
      [W, H * 0.68], [0, H * 0.68]
    ], 'rgba(112,139,111,0.22)');

    path([
      [0, y + 42], [W * 0.18, y + 2], [W * 0.34, y + 32],
      [W * 0.52, y - 1], [W * 0.70, y + 35],
      [W * 0.86, y + 6], [W, y + 30], [W, H * 0.72], [0, H * 0.72]
    ], 'rgba(91,119,91,0.18)');
  }

  function drawTree(x, y, scale, t, tone) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.strokeStyle = 'rgba(91,77,55,0.55)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-4, -30, 4, -66);
    ctx.stroke();

    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(2, -42); ctx.lineTo(-22, -65);
    ctx.moveTo(3, -49); ctx.lineTo(25, -76);
    ctx.stroke();

    var sway = Math.sin(t * 0.00025 + x) * 2;
    var greens = tone || ['rgba(91,126,83,0.34)', 'rgba(118,143,91,0.30)', 'rgba(75,112,80,0.28)'];
    [[-17, -75, 27], [12, -87, 30], [34, -68, 23], [-39, -62, 22], [0, -103, 22]]
      .forEach(function (p, i) {
        ctx.fillStyle = greens[i % greens.length];
        ctx.beginPath();
        ctx.ellipse(p[0] + sway, p[1], p[2], p[2] * 0.72, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    ctx.restore();
  }

  function drawVillage(t) {
    var ground = H * 0.57;
    // A few old tiled houses, deliberately soft and distant.
    [0.10, 0.18, 0.87].forEach(function (p, i) {
      var x = W * p, y = ground + (i === 1 ? 4 : 0), s = clamp(W / 1200, 0.55, 1.1);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.fillStyle = 'rgba(181,159,126,0.32)';
      ctx.fillRect(-27, -34, 56, 35);
      path([[-34, -34], [0, -57], [35, -34]], 'rgba(100,91,75,0.40)');
      ctx.fillStyle = 'rgba(91,78,62,0.25)';
      ctx.fillRect(-5, -20, 12, 21);
      ctx.fillStyle = 'rgba(230,218,184,0.28)';
      ctx.fillRect(-20, -25, 9, 8);
      ctx.fillRect(17, -25, 8, 8);
      ctx.restore();
    });

    drawTree(W * 0.045, ground + 5, clamp(W / 1200, 0.65, 1.05), t);
    drawTree(W * 0.94, ground + 8, clamp(W / 1200, 0.72, 1.12), t);
    drawTree(W * 0.78, ground + 13, clamp(W / 1200, 0.48, 0.8), t);
  }

  function ridgeY(x, ratio) {
    return H * ratio + Math.sin(x * 0.006 + ratio * 9) * H * 0.004;
  }

  function drawField() {
    var field = ctx.createLinearGradient(0, H * 0.55, 0, H);
    field.addColorStop(0, 'rgba(143,158,93,0.05)');
    field.addColorStop(0.42, 'rgba(126,145,76,0.15)');
    field.addColorStop(1, 'rgba(92,112,59,0.27)');
    ctx.fillStyle = field;
    ctx.fillRect(0, H * 0.55, W, H * 0.45);

    // Far paddy plots and narrow earthen paths.
    [0.625, 0.70].forEach(function (r, idx) {
      ctx.beginPath();
      for (var x = 0; x <= W; x += 8) {
        var y = ridgeY(x, r);
        if (!x) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = idx ? 'rgba(111,91,61,0.25)' : 'rgba(132,111,76,0.20)';
      ctx.lineWidth = idx ? 5 : 3;
      ctx.stroke();
      ctx.beginPath();
      for (var xx = 0; xx <= W; xx += 8) {
        var yy = ridgeY(xx, r) - (idx ? 2 : 1);
        if (!xx) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.strokeStyle = 'rgba(218,197,145,0.22)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Small grassy clumps along the ridge.
    scene.grass.forEach(function (g) {
      if (g.y > H * 0.78) return;
      var sway = Math.sin(elapsed * 0.0007 + g.phase) * 2;
      ctx.strokeStyle = 'rgba(87,119,66,0.34)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(g.x, g.y);
      ctx.quadraticCurveTo(g.x + sway, g.y - g.h * 0.55, g.x + sway * 1.6, g.y - g.h);
      ctx.stroke();
    });
  }

  function ditchY(x) {
    return H * 0.775 + Math.sin(x * 0.005 + 0.8) * H * 0.026
      + Math.sin(x * 0.011) * H * 0.008;
  }

  function drawDitch(t) {
    // Muddy banks first, then the shallow reflective water.
    ctx.beginPath();
    for (var x = -4; x <= W + 4; x += 8) {
      var y = ditchY(x);
      if (x < 0) ctx.moveTo(x, y - H * 0.024);
      else ctx.lineTo(x, y - H * 0.024);
    }
    for (var xx = W + 4; xx >= -4; xx -= 8) {
      ctx.lineTo(xx, ditchY(xx) + H * 0.025);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(116,103,76,0.22)';
    ctx.fill();

    ctx.beginPath();
    for (var a = -4; a <= W + 4; a += 8) {
      var yy = ditchY(a);
      if (a < 0) ctx.moveTo(a, yy - H * 0.014);
      else ctx.lineTo(a, yy - H * 0.014);
    }
    for (var b = W + 4; b >= -4; b -= 8) {
      ctx.lineTo(b, ditchY(b) + H * 0.014);
    }
    ctx.closePath();
    var water = ctx.createLinearGradient(0, H * 0.74, 0, H * 0.82);
    water.addColorStop(0, 'rgba(151,183,174,0.48)');
    water.addColorStop(0.5, 'rgba(112,158,153,0.46)');
    water.addColorStop(1, 'rgba(83,126,125,0.38)');
    ctx.fillStyle = water;
    ctx.fill();

    // Uneven banks, stones and reeds make it read as a real field ditch.
    ctx.strokeStyle = 'rgba(93,82,61,0.32)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (var c = 0; c <= W; c += 8) {
      var cy = ditchY(c) - H * 0.014;
      if (!c) ctx.moveTo(c, cy); else ctx.lineTo(c, cy);
    }
    ctx.stroke();

    for (var s = 0; s < 13; s++) {
      var sx = (s / 13) * W + Math.sin(s * 7.1) * 15;
      var sy = ditchY(sx) + (s % 2 ? 1 : -1) * H * 0.021;
      ctx.fillStyle = 'rgba(112,100,75,0.30)';
      ctx.beginPath();
      ctx.ellipse(sx, sy, 3 + (s % 3), 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Water glints drift at different speeds.
    for (var i = 0; i < 11; i++) {
      var px = ((t * (0.008 + i * 0.0005) + i * 113) % (W + 80)) - 40;
      var py = ditchY(px) + Math.sin(t * 0.001 + i) * 3;
      ctx.strokeStyle = 'rgba(239,246,224,' + (0.22 + (i % 3) * 0.08) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo(px + 6, py - 1.2, px + 15 + i % 4, py);
      ctx.stroke();
    }

    drawFish(t);
    drawShrimp(t);
    drawDitchPlants(t);
  }

  function drawFish(t) {
    scene.fish.forEach(function (f) {
      var x = ((f.x + t * f.speed * f.direction * 0.001) % 1.08 + 1.08) % 1.08;
      x = x * W - W * 0.04;
      var y = ditchY(x) + f.depth;
      var facing = f.direction;
      var size = clamp(W / 1100, 0.65, 1.2) * f.size;
      ctx.save();
      ctx.translate(x, y + Math.sin(t * 0.002 + f.phase) * 1.4);
      ctx.scale(facing * size, size);
      ctx.fillStyle = 'rgba(72,100,99,0.72)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 7, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-5, 0);
      ctx.lineTo(-11 - Math.sin(t * 0.012 + f.phase) * 2, -4);
      ctx.lineTo(-10, 0);
      ctx.lineTo(-11, 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(235,230,194,0.8)';
      ctx.beginPath();
      ctx.arc(4.1, -0.8, 0.75, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawShrimp(t) {
    scene.shrimp.forEach(function (s) {
      var x = s.x * W;
      var y = ditchY(x) + 8;
      var bob = Math.sin(t * 0.001 + s.phase) * 1.1;
      ctx.save();
      ctx.translate(x, y + bob);
      ctx.scale(s.size, s.size);
      ctx.strokeStyle = 'rgba(173,125,103,0.82)';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-5, 1);
      ctx.quadraticCurveTo(-1, -5, 4, -1);
      ctx.quadraticCurveTo(7, 2, 3, 5);
      ctx.stroke();
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(2, -2); ctx.quadraticCurveTo(8, -10, 12, -11);
      ctx.moveTo(1, -2); ctx.quadraticCurveTo(5, -12, 6, -14);
      ctx.stroke();
      for (var leg = 0; leg < 3; leg++) {
        ctx.beginPath();
        ctx.moveTo(-1 + leg * 2, 2);
        ctx.lineTo(-3 + leg * 2, 7);
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  function drawDitchPlants(t) {
    for (var i = 0; i < 16; i++) {
      var x = (i / 16) * W + 8;
      var y = ditchY(x) - H * 0.012;
      var sway = Math.sin(t * 0.0008 + i * 1.7) * 3;
      ctx.strokeStyle = 'rgba(79,116,70,0.48)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y + 3);
      ctx.quadraticCurveTo(x + sway, y - 7, x + sway * 1.5, y - 13 - (i % 3) * 2);
      ctx.stroke();
      if (i % 3 === 0) {
        ctx.fillStyle = 'rgba(91,132,83,0.38)';
        ctx.beginPath();
        ctx.ellipse(x + sway, y - 12, 4, 1.7, -0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawRicePlant(p, t) {
    var x = p.x * W;
    var baseY = p.base * H;
    var scale = clamp(W / 1200, 0.55, 1.25);
    var sway = Math.sin(t * 0.00065 + p.phase) * (p.front ? 7 : 3.5) * scale;
    var topX = x + p.lean * W + sway;
    var topY = baseY - p.height * H;
    var stem = p.front ? 'rgba(77,105,48,0.72)' : 'rgba(91,119,65,0.44)';
    ctx.save();
    ctx.lineCap = 'round';

    // Main stem.
    ctx.strokeStyle = stem;
    ctx.lineWidth = (p.front ? 2.1 : 1.25) * p.width * scale;
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.quadraticCurveTo(x + sway * 0.25, baseY - p.height * H * 0.55, topX, topY);
    ctx.stroke();

    // Long leaves with a subtle central vein.
    for (var leaf = 0; leaf < 3; leaf++) {
      var startY = baseY - p.height * H * (0.22 + leaf * 0.13);
      var dir = leaf % 2 ? -1 : 1;
      var length = (p.front ? 58 : 34) * scale * (0.75 + leaf * 0.12);
      ctx.strokeStyle = p.front ? 'rgba(86,125,58,0.55)' : 'rgba(98,128,70,0.34)';
      ctx.lineWidth = (p.front ? 1.5 : 0.9) * scale;
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.quadraticCurveTo(x + dir * length * 0.42 + sway, startY - length * 0.5,
        x + dir * length + sway, startY - length * 0.72);
      ctx.stroke();
    }

    // Mature drooping panicle, with visible grains.
    if (p.front || p.height > 0.13) {
      var direction = p.lean >= 0 ? 1 : -1;
      var panicleLength = (p.front ? 33 : 19) * scale;
      ctx.strokeStyle = 'rgba(157,128,63,0.65)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(topX, topY);
      ctx.quadraticCurveTo(topX + direction * panicleLength * 0.48,
        topY + 8 * scale, topX + direction * panicleLength, topY + 13 * scale);
      ctx.stroke();

      for (var g = 0; g < (p.front ? 9 : 5); g++) {
        var u = g / (p.front ? 8 : 4);
        var gx = topX + direction * panicleLength * u;
        var gy = topY + (u * u * 13 + u * 2) * scale;
        ctx.fillStyle = p.front ? 'rgba(197,157,67,0.82)' : 'rgba(176,155,91,0.54)';
        ctx.beginPath();
        ctx.ellipse(gx, gy, (p.front ? 3.3 : 2) * scale,
          (p.front ? 1.8 : 1.2) * scale, direction * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawKids(t) {
    var baseY = ridgeY(W * 0.33, 0.625) - 2;
    var travel = Math.sin(t * 0.00042) * W * 0.035;
    var size = clamp(W / 1200, 0.58, 0.95);

    function kid(x, phase, shirt) {
      var run = Math.sin(t * 0.006 + phase);
      var bob = Math.abs(run) * 2.3 * size;
      var leg = Math.sin(t * 0.009 + phase) * 4 * size;
      ctx.save();
      ctx.translate(x, baseY - bob);
      ctx.scale(size, size);

      // Soft cast shadow.
      ctx.fillStyle = 'rgba(65,62,48,0.12)';
      ctx.beginPath();
      ctx.ellipse(0, 1, 7, 2, 0, 0, Math.PI * 2);
      ctx.fill();

      // Legs and small shoes.
      ctx.strokeStyle = 'rgba(68,59,48,0.78)';
      ctx.lineWidth = 2.1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-1, -8); ctx.lineTo(-3 + leg, 0);
      ctx.moveTo(2, -8); ctx.lineTo(4 - leg, 0);
      ctx.stroke();

      // Shirt and shorts.
      ctx.fillStyle = shirt;
      ctx.beginPath();
      ctx.moveTo(-4, -23); ctx.quadraticCurveTo(0, -26, 4, -22);
      ctx.lineTo(5, -10); ctx.quadraticCurveTo(0, -7, -5, -10);
      ctx.closePath();
      ctx.fill();

      // Head, hair and swinging arm.
      ctx.fillStyle = 'rgba(197,151,111,0.95)';
      ctx.beginPath(); ctx.arc(0, -29, 4.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(62,53,43,0.82)';
      ctx.beginPath(); ctx.arc(-0.5, -31, 4.2, Math.PI, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(197,151,111,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-3, -20); ctx.lineTo(-7 - run * 3, -15);
      ctx.moveTo(3, -20); ctx.lineTo(7 + run * 3, -24);
      ctx.stroke();
      ctx.restore();
    }

    kid(W * 0.30 + travel, 0.2, 'rgba(174,91,69,0.88)');
    kid(W * 0.365 - travel * 0.55, 1.8, 'rgba(104,132,151,0.88)');
  }

  function drawGrandpa(t) {
    var scale = clamp(W / 1200, 0.7, 1.2);
    var gx = W * 0.68;
    var gy = H * 0.895;
    var work = Math.sin(t * 0.00115);
    var bend = 0.18 + Math.max(0, work) * 0.30;
    var shoulderX = gx + 8 * scale + bend * 9 * scale;
    var shoulderY = gy - 42 * scale + bend * 9 * scale;

    ctx.save();
    ctx.translate(gx, gy);
    ctx.scale(scale, scale);

    // Shadow in the wet soil.
    ctx.fillStyle = 'rgba(65,58,43,0.13)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 20, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Old dark trousers and legs.
    ctx.strokeStyle = 'rgba(69,68,57,0.84)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-3, -20); ctx.quadraticCurveTo(-7, -10, -8, 0);
    ctx.moveTo(7, -20); ctx.quadraticCurveTo(10, -10, 9, 0);
    ctx.stroke();

    // Shirt body: light, worn blue-grey fabric.
    ctx.fillStyle = 'rgba(133,153,145,0.92)';
    ctx.beginPath();
    ctx.moveTo(-7, -50);
    ctx.quadraticCurveTo(4, -56, 14, -45);
    ctx.lineTo(11, -22);
    ctx.quadraticCurveTo(1, -17, -7, -22);
    ctx.closePath();
    ctx.fill();

    // Back and bent neck.
    ctx.strokeStyle = 'rgba(117,137,130,0.9)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(4, -46);
    ctx.quadraticCurveTo(15 + bend * 8, -38, 20 + bend * 7, -29);
    ctx.stroke();

    // Face and neck, looking down toward the soil.
    ctx.fillStyle = 'rgba(194,151,112,0.95)';
    ctx.beginPath();
    ctx.ellipse(22 + bend * 7, -34, 6, 7, 0.45, 0, Math.PI * 2);
    ctx.fill();

    // Straw hat with woven brim.
    ctx.fillStyle = 'rgba(180,151,91,0.96)';
    ctx.beginPath();
    ctx.ellipse(20 + bend * 7, -43, 13, 3.2, -0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(21 + bend * 7, -47, 7, 5, -0.18, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(111,91,55,0.38)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(20 + bend * 7, -43, 9, 1.8, -0.18, 0, Math.PI * 2);
    ctx.stroke();

    // Arm reaches down to the hoe.
    ctx.strokeStyle = 'rgba(194,151,112,0.95)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(13, -39);
    ctx.quadraticCurveTo(25, -33 + bend * 9, 31, -20 + bend * 3);
    ctx.stroke();

    // Hoe handle and metal blade. The handle rocks with the work cycle.
    var hoeAngle = 0.62 + Math.max(0, work) * 0.18;
    ctx.save();
    ctx.translate(31, -20 + bend * 3);
    ctx.rotate(hoeAngle);
    ctx.strokeStyle = 'rgba(112,79,48,0.92)';
    ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 39); ctx.stroke();
    ctx.fillStyle = 'rgba(107,119,117,0.92)';
    ctx.beginPath();
    ctx.moveTo(-7, 34); ctx.lineTo(8, 34); ctx.lineTo(5, 41); ctx.lineTo(-5, 41);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    // Shirt seam and sleeve details.
    ctx.strokeStyle = 'rgba(74,102,94,0.42)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-2, -44); ctx.lineTo(7, -27);
    ctx.moveTo(3, -36); ctx.lineTo(11, -34);
    ctx.stroke();

    ctx.restore();
  }

  function drawForeground(t) {
    // Dark, soft soil at the bottom anchors the scene.
    var soil = ctx.createLinearGradient(0, H * 0.88, 0, H);
    soil.addColorStop(0, 'rgba(91,91,55,0)');
    soil.addColorStop(1, 'rgba(87,83,54,0.16)');
    ctx.fillStyle = soil;
    ctx.fillRect(0, H * 0.86, W, H * 0.14);

    scene.rice.forEach(function (p) {
      drawRicePlant(p, t);
    });

    // Foreground leaf silhouettes, sparse enough not to obscure page text.
    for (var i = 0; i < 14; i++) {
      var x = (i / 14) * W + Math.sin(i * 2.4) * 16;
      var y = H * 1.01;
      var sway = Math.sin(t * 0.0006 + i) * 8;
      ctx.strokeStyle = 'rgba(67,105,55,0.28)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + sway, H * 0.94, x + sway * 1.5 - 18, H * 0.91);
      ctx.stroke();
    }
  }

  function drawSummer(t) {
    drawSky(t);
    drawMountains();
    drawVillage(t);
    drawField();
    drawKids(t);
    drawDitch(t);
    drawGrandpa(t);
    drawForeground(t);

    // Dust and pollen in the late-afternoon light.
    for (var i = 0; i < 16; i++) {
      var x = (i * 97 + t * (0.002 + (i % 3) * 0.0004)) % W;
      var y = H * (0.42 + (i % 7) * 0.065) + Math.sin(t * 0.001 + i) * 8;
      ctx.fillStyle = 'rgba(230,194,112,0.30)';
      ctx.beginPath();
      ctx.arc(x, y, 1 + (i % 2), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawAutumn(t) {
    var sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#e3e3dc');
    sky.addColorStop(0.6, '#e9dfc9');
    sky.addColorStop(1, '#c9b18b');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    drawMountains();
    scene.leaves.forEach(function (leaf) {
      if (!REDUCED) {
        leaf.y += leaf.speed / 60;
        leaf.x += Math.sin(t * 0.0007 + leaf.phase) * leaf.drift / 60;
        leaf.rotation += leaf.spin / 60;
        if (leaf.y > H + 25) {
          leaf.y = -20;
          leaf.x = random(0, W);
        }
      }
      ctx.save();
      ctx.translate(leaf.x, leaf.y);
      ctx.rotate(leaf.rotation);
      ctx.fillStyle = leaf.color;
      ctx.globalAlpha = 0.46;
      ctx.beginPath();
      ctx.moveTo(0, -leaf.size);
      ctx.quadraticCurveTo(leaf.size, -2, 0, leaf.size);
      ctx.quadraticCurveTo(-leaf.size, -2, 0, -leaf.size);
      ctx.fill();
      ctx.strokeStyle = 'rgba(104,75,43,0.45)';
      ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(0, -leaf.size * 0.7); ctx.lineTo(0, leaf.size * 0.7); ctx.stroke();
      ctx.restore();
    });
    ctx.globalAlpha = 1;
  }

  function render(time) {
    if (!W || !H) return;
    ctx.clearRect(0, 0, W, H);
    if (mode === 'rice') drawSummer(time);
    else drawAutumn(time);
  }

  function loop(now) {
    if (!running) return;
    if (!lastTime) lastTime = now;
    var delta = Math.min(48, now - lastTime);
    lastTime = now;
    elapsed += delta;
    // Cap the scene at roughly 30 FPS; animation still uses elapsed time.
    if (!loop.lastRender || now - loop.lastRender >= 32) {
      render(elapsed);
      loop.lastRender = now;
    }
    raf = window.requestAnimationFrame(loop);
  }

  function start() {
    if (running || reducedMotion || document.hidden) return;
    running = true;
    lastTime = 0;
    raf = window.requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
  }

  function switchMode() {
    mode = mode === 'rice' ? 'leaf' : 'rice';
    try { localStorage.setItem(MODE_KEY, mode); } catch (e) {}
    syncButton();
    canvas.classList.add('amb-fade');
    window.setTimeout(function () {
      render(elapsed);
      canvas.classList.remove('amb-fade');
    }, 180);
  }

  button.addEventListener('click', switchMode);
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
    else start();
  });

  syncButton();
  resize();
  if (reducedMotion) {
    render(0);
  } else {
    start();
  }
})();
