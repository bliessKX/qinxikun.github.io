/* ---------- 共享氛围背景：夏日稻田（白天默认 6-18 点）/ 秋日落叶（夜晚默认），可手动切换 ----------
   引入：<script src="assets/ambience.js"></script>（tools/ 子目录用 ../assets/ambience.js）
   - 页面已有 <canvas id="amb"> 则复用（水墨主页），否则自动创建并垫到最底层
   - 页面已有 #ambBtn（主页侧栏按钮）则接管它，否则注入右下角浮动切换按钮
   - 模式存 localStorage 'nice-amb'，与主页互通；无手动选择时按小时自动
   - 场景：田垄 + 蜿蜒水沟（游鱼小虾）+ 稻田里劳作的爷爷 + 远处田埂上追逐的小孩
   - 画布层级由本脚本强制注入（html #amb），不依赖页面自身的内联样式，旧 HTML 缓存也不会失效
*/
(function(){
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var KEY = 'nice-amb';

  /* ---------- 画布：复用或自建 ---------- */
  var canvas = document.getElementById('amb');
  if(!canvas){
    canvas = document.createElement('canvas');
    canvas.id = 'amb';
    if(document.body.firstChild) document.body.insertBefore(canvas, document.body.firstChild);
    else document.body.appendChild(canvas);
  }
  if(!canvas.getContext) return;
  var ctx = canvas.getContext('2d');

  var style = document.createElement('style');
  style.textContent =
    /* html #amb 提高优先级：即使用户浏览器缓存了带旧样式的 HTML，本规则也能覆盖 */
    'html #amb{position:fixed;inset:0;z-index:2;pointer-events:none;transition:opacity .45s ease}' +
    '.amb-chip{position:fixed;right:20px;bottom:66px;z-index:97;display:inline-flex;align-items:center;gap:7px;' +
    'font-family:var(--sans,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif);font-size:12px;font-weight:600;' +
    'color:var(--ink,#1b1a18);background:rgba(255,255,255,.85);border:1px solid var(--line,#e6e2d9);' +
    'border-radius:5px;padding:7px 12px;cursor:pointer;box-shadow:0 2px 8px rgba(27,26,24,.08);' +
    'transition:border-color .2s,box-shadow .2s}' +
    '.amb-chip:hover{border-color:var(--accent,#9c3b2a);box-shadow:0 3px 10px rgba(27,26,24,.12)}' +
    '.amb-chip:focus-visible{outline:2px solid var(--accent,#9c3b2a);outline-offset:2px}' +
    '.amb-chip .amb-dot{width:8px;height:8px;border-radius:50%;background:#7a8f4d;transition:background .4s}' +
    '.amb-chip .amb-dot.leaf{background:#b0713f}';
  document.head.appendChild(style);

  /* ---------- 切换按钮：接管主页侧栏按钮，或自建右下角浮动按钮 ---------- */
  var BTN = document.getElementById('ambBtn');
  var DOT, LABEL;
  if(BTN){
    DOT = document.getElementById('ambDot');
    LABEL = document.getElementById('ambLabel');
  } else {
    BTN = document.createElement('button');
    BTN.type = 'button';
    BTN.className = 'amb-chip';
    DOT = document.createElement('span'); DOT.className = 'amb-dot';
    LABEL = document.createElement('span');
    BTN.appendChild(DOT); BTN.appendChild(LABEL);
    document.body.appendChild(BTN);
  }

  var W = 0, H = 0;
  var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  function resize(){
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    initScene();
    if(reduced) frame();
  }

  /* 模式：localStorage 手动选择优先，否则按小时自动 */
  var mode;
  try{ mode = localStorage.getItem(KEY); }catch(e){}
  if(mode !== 'rice' && mode !== 'leaf'){
    var hr = new Date().getHours();
    mode = (hr >= 6 && hr < 18) ? 'rice' : 'leaf';
  }
  function syncUI(){
    if(DOT) DOT.classList.toggle('leaf', mode === 'leaf');
    if(LABEL) LABEL.textContent = mode === 'rice' ? '夏日稻田' : '秋日落叶';
    BTN.setAttribute('aria-label', '切换背景氛围，当前：' + (mode === 'rice' ? '夏日稻田' : '秋日落叶'));
  }
  syncUI();

  var LEAF_COLORS = ['#c9a86a', '#b0713f', '#9c3b2a', '#a8843c'];
  var specks = [], leaves = [], riceBack = [], riceFront = [], fishes = [], shrimps = [];

  function newLeaf(anyY){
    return {
      x: Math.random() * W, y: anyY ? Math.random() * H : -24,
      s: 7 + Math.random() * 9, vy: 0.4 + Math.random() * 0.65,
      ph: Math.random() * 6.28, rot: Math.random() * 6.28,
      rs: (Math.random() - 0.5) * 0.025,
      c: LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)],
      a: 0.36 + Math.random() * 0.2
    };
  }
  function initScene(){
    specks = []; leaves = []; riceBack = []; riceFront = []; fishes = []; shrimps = [];
    if(!W) return;
    var i;
    for(i = 0; i < 12; i++) specks.push({ x: Math.random() * W, y: Math.random() * H, r: 0.8 + Math.random() * 1.4, s: 0.12 + Math.random() * 0.22, ph: Math.random() * 6.28 });
    for(i = 0; i < 34; i++) leaves.push(newLeaf(true));
    /* 两排水稻：后排密而矮，前排疏而高（加大加浓到一眼可见） */
    for(i = 0; i < 34; i++) riceBack.push({ x: (i + Math.random() * 0.7) * W / 34, h: 40 + Math.random() * 36, lean: (Math.random() - 0.5) * 9, earLen: 12 + Math.random() * 8, ph: Math.random() * 6.28 });
    for(i = 0; i < 22; i++) riceFront.push({ x: (i + Math.random() * 0.8) * W / 22, h: 110 + Math.random() * 80, lean: (Math.random() - 0.5) * 20, earLen: 22 + Math.random() * 12, ph: Math.random() * 6.28 });
    /* 水沟里的小鱼：来回巡游 */
    fishes.push({ off: 0,   s: 0.5,  dir: 1,  dy: 1.5, ph: 0.5 });
    fishes.push({ off: 430, s: 0.36, dir: -1, dy: -2.5, ph: 1.7 });
    fishes.push({ off: 860, s: 0.44, dir: 1,  dy: 3,   ph: 2.9 });
    /* 小虾两只：蹲在沟底轻摆 */
    shrimps.push({ x: W * 0.22, dy: 3.5, rot: -0.4, ph: 0 });
    shrimps.push({ x: W * 0.74, dy: -2,  rot: 0.5,  ph: 2 });
  }

  var t = 0;
  /* 小水沟：蜿蜒穿过田面，位于两道田埂之间 */
  function ditchY(x){ return H * 0.715 + Math.sin(x * 0.008 + 1.3) * H * 0.02; }

  function drawRice(){
    /* 田野渐变带：占下方约一半，青绿打底、稻金色收边 */
    var base = ctx.createLinearGradient(0, H * 0.42, 0, H);
    base.addColorStop(0, 'rgba(122,143,77,0)');
    base.addColorStop(0.55, 'rgba(122,143,77,0.13)');
    base.addColorStop(1, 'rgba(93,112,64,0.24)');
    ctx.fillStyle = base; ctx.fillRect(0, H * 0.42, W, H * 0.58);
    var gold = ctx.createLinearGradient(0, H * 0.5, 0, H);
    gold.addColorStop(0, 'rgba(217,180,91,0)');
    gold.addColorStop(1, 'rgba(217,180,91,0.12)');
    ctx.fillStyle = gold; ctx.fillRect(0, H * 0.5, W, H * 0.5);
    /* 右上日光晕 */
    var sun = ctx.createRadialGradient(W * 0.82, H * 0.12, 0, W * 0.82, H * 0.12, Math.max(W, H) * 0.42);
    sun.addColorStop(0, 'rgba(255,243,214,0.14)');
    sun.addColorStop(1, 'rgba(255,243,214,0)');
    ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
    /* 两道浅波纹（远处田面水光，弱化让位给稻子） */
    var rows = [H * 0.58, H * 0.76], amp = [5, 8], alp = [0.05, 0.06];
    for(var k = 0; k < 2; k++){
      ctx.strokeStyle = 'rgba(109,127,69,' + alp[k] + ')';
      ctx.lineWidth = 1.4 + k * 0.5;
      ctx.beginPath();
      for(var x = 0; x <= W; x += 8){
        var y = rows[k] + Math.sin(x * 0.012 + t * 0.011 + k * 1.7) * amp[k];
        if(x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    drawRidges();
    drawDitch();
    drawKids();
    /* 后排稻子（远，矮，偏绿） */
    for(var r = 0; r < riceBack.length; r++) drawRicePlant(riceBack[r], H * 0.86, false);
    drawGrandpa();
    /* 前排稻子（近，高，带金黄垂穗） */
    for(var f = 0; f < riceFront.length; f++) drawRicePlant(riceFront[f], H + 6, true);
    /* 上浮的暖色光点 */
    for(var i = 0; i < specks.length; i++){
      var p = specks[i];
      p.y -= p.s;
      if(p.y < -8){ p.y = H + 8; p.x = Math.random() * W; }
      var px = p.x + Math.sin(t * 0.01 + p.ph) * 7;
      ctx.globalAlpha = 0.3 + 0.14 * Math.sin(t * 0.03 + p.ph);
      ctx.fillStyle = '#dfb76a';
      ctx.beginPath(); ctx.arc(px, p.y, p.r, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- 田垄：两道土埂横过田面，埂上偶有草簇 ---------- */
  function drawRidges(){
    var x, y;
    ctx.strokeStyle = 'rgba(146,112,64,0.20)'; ctx.lineWidth = 3.5;
    ctx.beginPath();
    for(x = 0; x <= W; x += 10){
      y = H * 0.655 + Math.sin(x * 0.009 + 2.1) * 3.5;
      if(x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(146,112,64,0.16)'; ctx.lineWidth = 5;
    ctx.beginPath();
    for(x = 0; x <= W; x += 10){
      y = H * 0.815 + Math.sin(x * 0.007 + 0.6) * 4.5;
      if(x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    /* 埂上稀疏草簇 */
    ctx.strokeStyle = 'rgba(122,143,77,0.3)'; ctx.lineWidth = 1;
    for(var g = 0; g < 8; g++){
      var gx = (g * 0.13 + 0.05) * W;
      var gy = H * (g % 2 === 0 ? 0.655 : 0.815) + Math.sin(gx * 0.009 + 2.1) * 3.5 - 1;
      ctx.beginPath();
      ctx.moveTo(gx, gy); ctx.lineTo(gx - 2, gy - 5);
      ctx.moveTo(gx, gy); ctx.lineTo(gx + 1, gy - 6);
      ctx.moveTo(gx, gy); ctx.lineTo(gx + 3.5, gy - 4);
      ctx.stroke();
    }
  }

  /* ---------- 小水沟：水面带 + 岸线 + 流动波光 + 游鱼小虾 ---------- */
  function drawDitch(){
    var x, y;
    ctx.fillStyle = 'rgba(150,172,172,0.28)';
    ctx.beginPath();
    for(x = 0; x <= W; x += 12){ y = ditchY(x) - 8; if(x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    for(x = W; x >= 0; x -= 12){ y = ditchY(x) + 9; ctx.lineTo(x, y); }
    ctx.closePath(); ctx.fill();
    /* 两条岸线 */
    ctx.strokeStyle = 'rgba(120,110,90,0.22)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for(x = 0; x <= W; x += 12){ y = ditchY(x) - 8; if(x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke();
    ctx.beginPath();
    for(x = 0; x <= W; x += 12){ y = ditchY(x) + 9; if(x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke();
    /* 随水流漂动的波光短线 */
    ctx.strokeStyle = 'rgba(228,240,240,0.5)'; ctx.lineWidth = 1.2;
    for(var i = 0; i < 7; i++){
      var span = W + 80;
      var fx = ((t * 0.35 * (0.7 + i * 0.1) + i * 137) % span) - 40;
      var fy = ditchY(fx) + (i % 2 === 0 ? -3 : 3);
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + 14 - i, fy); ctx.stroke();
    }
    /* 小鱼：椭圆身 + 三角尾，沿沟巡游 */
    for(var fi = 0; fi < fishes.length; fi++){
      var f = fishes[fi];
      var spanF = W + 60;
      var prog = (t * f.s + f.off) % spanF;
      var fx2 = f.dir > 0 ? prog - 30 : W - (prog - 30);
      var fy2 = ditchY(fx2) + f.dy + Math.sin(t * 0.05 + f.ph) * 1.2;
      ctx.save(); ctx.translate(fx2, fy2); ctx.scale(f.dir, 1);
      ctx.fillStyle = 'rgba(88,110,118,0.55)';
      ctx.beginPath(); ctx.ellipse(0, 0, 5.5, 2.2, 0, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(-9, -2.5); ctx.lineTo(-9, 2.5); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    /* 小虾：弯身 + 长须，原地轻摆 */
    for(var si = 0; si < shrimps.length; si++){
      var s = shrimps[si];
      ctx.save();
      ctx.translate(s.x, ditchY(s.x) + s.dy);
      ctx.rotate(s.rot + Math.sin(t * 0.02 + s.ph) * 0.25);
      ctx.strokeStyle = 'rgba(196,150,138,0.6)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, 4.5, 0.5, 2.6); ctx.stroke();
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(3.6, -3.4); ctx.lineTo(7.5, -6.5); ctx.stroke();
      ctx.restore();
    }
  }

  /* ---------- 田埂上追逐玩耍的两个小孩（远处小剪影） ---------- */
  function drawKids(){
    var baseY = H * 0.655 + Math.sin(W * 0.3 * 0.009 + 2.1) * 3.5;
    var ink = 'rgba(58,50,42,0.5)';
    var m1 = W * 0.3 + Math.sin(t * 0.005) * W * 0.05;
    var m2 = W * 0.36 + Math.sin(t * 0.005 + 1.4) * W * 0.045;
    function kid(kx, ph){
      var bob = Math.abs(Math.sin(t * 0.02 + ph)) * 1.8;
      ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(kx, baseY - 15 - bob, 2.3, 0, 6.283); ctx.fill();
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(kx, baseY - 12.5 - bob); ctx.lineTo(kx, baseY - 6 - bob); ctx.stroke();
      ctx.lineWidth = 1.6;
      var sw = Math.sin(t * 0.04 + ph) * 3;
      ctx.beginPath(); ctx.moveTo(kx, baseY - 6 - bob); ctx.lineTo(kx - 2.5 + sw, baseY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(kx, baseY - 6 - bob); ctx.lineTo(kx + 2.5 - sw, baseY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(kx, baseY - 11 - bob); ctx.lineTo(kx + 3.5, baseY - 8 - bob); ctx.stroke();
    }
    kid(m1, 0); kid(m2, 1.1);
  }

  /* ---------- 田里劳作的爷爷：草帽 + 弯腰 + 锄头 ---------- */
  function drawGrandpa(){
    var gx = W * 0.625, gy = H * 0.868;
    var sway = Math.sin(t * 0.007) * 1.6;
    ctx.strokeStyle = 'rgba(58,50,42,0.58)'; ctx.fillStyle = 'rgba(58,50,42,0.58)'; ctx.lineCap = 'round';
    /* 双腿 */
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(gx - 2, gy - 14); ctx.quadraticCurveTo(gx - 3, gy - 7, gx - 4, gy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(gx + 1, gy - 14); ctx.quadraticCurveTo(gx + 2, gy - 7, gx + 3, gy); ctx.stroke();
    /* 弯腰的身体：臀部→背部弧线→低头 */
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(gx - 2, gy - 14);
    ctx.quadraticCurveTo(gx - 6 + sway * 0.4, gy - 24, gx + 2 + sway, gy - 30);
    ctx.stroke();
    /* 手臂向前下伸 */
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gx + 2 + sway, gy - 28);
    ctx.quadraticCurveTo(gx + 10 + sway, gy - 22, gx + 15 + sway, gy - 13);
    ctx.stroke();
    /* 草帽 */
    ctx.save(); ctx.translate(gx + 3 + sway, gy - 32); ctx.rotate(0.5);
    ctx.beginPath(); ctx.ellipse(0, -1.5, 8, 2.4, 0, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -1.5, 3.4, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.restore();
    /* 锄头：木柄斜插 + 铁刃入土 */
    ctx.strokeStyle = 'rgba(120,90,55,0.6)'; ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(gx + 15 + sway, gy - 13);
    ctx.lineTo(gx + 22 + sway, gy + 1);
    ctx.stroke();
    ctx.fillStyle = 'rgba(110,116,120,0.5)';
    ctx.beginPath();
    ctx.moveTo(gx + 19 + sway, gy - 2);
    ctx.lineTo(gx + 26 + sway, gy + 3);
    ctx.lineTo(gx + 23 + sway, gy + 7);
    ctx.lineTo(gx + 16 + sway, gy + 2);
    ctx.closePath(); ctx.fill();
  }

  /* 一株水稻：弯曲的秆 + 顶端垂下的稻穗（一串谷粒椭圆） */
  function drawRicePlant(p, baseY, front){
    var sway = Math.sin(t * 0.013 + p.ph) * (front ? 5 : 3.2);
    var topX = p.x + p.lean + sway, topY = baseY - p.h;
    /* 秆 */
    ctx.strokeStyle = front ? 'rgba(88,108,46,0.62)' : 'rgba(101,120,58,0.42)';
    ctx.lineWidth = front ? 2.6 : 1.6;
    ctx.beginPath();
    ctx.moveTo(p.x, baseY);
    ctx.quadraticCurveTo(p.x + (topX - p.x) * 0.3, baseY - p.h * 0.55, topX, topY);
    ctx.stroke();
    /* 叶片一根 */
    ctx.lineWidth = front ? 1.5 : 1;
    ctx.strokeStyle = front ? 'rgba(118,140,70,0.42)' : 'rgba(122,143,77,0.26)';
    ctx.beginPath();
    ctx.moveTo(p.x, baseY - p.h * 0.25);
    ctx.quadraticCurveTo(p.x + p.lean * 0.6 - 7, baseY - p.h * 0.5, p.x + p.lean * 0.5 - 13, baseY - p.h * 0.72);
    ctx.stroke();
    /* 垂穗：谷粒沿下垂弧线排列 */
    var gx = topX, gy = topY;
    var droop = front ? 10 : 6.5;
    var dir = p.lean >= 0 ? 1 : -1;
    var grains = front ? 8 : 5;
    for(var g = 0; g < grains; g++){
      var u = g / (grains - 1);
      var gx2 = topX + dir * u * p.earLen + sway * u * 0.6;
      var gy2 = topY + u * u * droop + u * 3;
      ctx.save();
      ctx.translate(gx2, gy2);
      ctx.rotate(dir * (0.5 + u * 1.2));
      ctx.fillStyle = front
        ? 'rgba(186,142,48,' + (0.72 - u * 0.12) + ')'  /* 金黄谷粒 */
        : 'rgba(176,155,80,0.48)';
      ctx.beginPath();
      ctx.ellipse(0, 0, front ? 4.4 : 2.5, front ? 2.5 : 1.4, 0, 0, 6.283);
      ctx.fill();
      ctx.restore();
      gx = gx2; gy = gy2;
    }
    /* 穗轴 */
    ctx.strokeStyle = front ? 'rgba(155,126,52,0.48)' : 'rgba(160,132,60,0.26)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(topX + dir * p.earLen * 0.5, topY + droop * 0.4, gx, gy);
    ctx.stroke();
  }

  function drawLeafScene(){
    /* 秋暮：顶部薄凉青灰 + 底部暖赭 */
    var top = ctx.createLinearGradient(0, 0, 0, H * 0.4);
    top.addColorStop(0, 'rgba(138,151,168,0.09)');
    top.addColorStop(1, 'rgba(138,151,168,0)');
    ctx.fillStyle = top; ctx.fillRect(0, 0, W, H * 0.4);
    var bot = ctx.createLinearGradient(0, H * 0.5, 0, H);
    bot.addColorStop(0, 'rgba(201,138,59,0)');
    bot.addColorStop(1, 'rgba(190,120,45,0.17)');
    ctx.fillStyle = bot; ctx.fillRect(0, H * 0.5, W, H * 0.5);
    ctx.globalAlpha = 1;
    for(var i = 0; i < leaves.length; i++){
      var l = leaves[i];
      l.y += l.vy;
      l.x += Math.sin(t * 0.016 + l.ph) * 0.5;
      l.rot += l.rs;
      if(l.y > H + 26) leaves[i] = newLeaf(false);
      /* 叶片：两段贝塞尔勾出叶形，加叶脉 */
      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.rotate(l.rot + Math.sin(t * 0.02 + l.ph) * 0.5);
      ctx.globalAlpha = l.a;
      ctx.fillStyle = l.c;
      ctx.beginPath();
      ctx.moveTo(0, -l.s);
      ctx.quadraticCurveTo(l.s * 0.85, -l.s * 0.25, 0, l.s);
      ctx.quadraticCurveTo(-l.s * 0.85, -l.s * 0.25, 0, -l.s);
      ctx.fill();
      ctx.globalAlpha = l.a * 0.5;
      ctx.strokeStyle = '#7c5a2e';
      ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(0, -l.s * 0.8); ctx.lineTo(0, l.s * 0.8); ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function frame(){
    t++;
    ctx.clearRect(0, 0, W, H);
    if(mode === 'rice') drawRice(); else drawLeafScene();
  }

  window.addEventListener('resize', resize);
  resize();

  if(reduced){
    frame(); /* 减少动态：只画静态一帧 */
  } else {
    var raf = 0, n = 0;
    function loop(){
      n++;
      if(n % 2 === 0) frame(); /* 隔帧渲染 ≈30fps，足够顺滑且省电 */
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', function(){
      if(document.hidden) cancelAnimationFrame(raf);
      else raf = requestAnimationFrame(loop);
    });
  }

  /* 手动切换：淡出 → 换场 → 淡入 */
  BTN.addEventListener('click', function(){
    canvas.style.opacity = '0';
    setTimeout(function(){
      mode = mode === 'rice' ? 'leaf' : 'rice';
      syncUI();
      try{ localStorage.setItem(KEY, mode); }catch(e){}
      frame();
      canvas.style.opacity = '1';
    }, 460);
  });
})();
