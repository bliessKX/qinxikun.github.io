/* ---------- 共享背景乐：非 2.0 页面通用 ----------
   引入方式：<script src="assets/bgm.js"></script>（tools/ 子目录用 ../assets/bgm.js）
   - 音频路径基于脚本自身位置解析，任意深度目录可用
   - 与水墨主页共用 localStorage 键 nice-bgm（关了就都关，开了就都开）
   - 页面自带 #bgmBtn 时自动跳过（避免与主页侧栏按钮重复）
*/
(function(){
  if(document.getElementById('bgmBtn')) return;

  var script = document.currentScript;
  if(!script) return;
  var base = script.src.replace(/[^\/]*$/, '');

  var TRACKS = [
    { src: base + 'daoxiang.mp3', name: '稻香' },
    { src: base + 'summer-field.mp3', name: '夏夜稻田' }
  ];
  var idx = 0;
  var BG_KEY = 'nice-bgm';

  /* 样式：左下角圆形浮窗按钮 */
  var css = ''
    + '.bgm-fab{position:fixed;left:18px;bottom:18px;z-index:98;width:40px;height:40px;'
    + 'border-radius:50%;border:1px solid var(--line,#e6e2d9);background:rgba(255,255,255,.88);'
    + 'color:var(--muted,#857f74);display:flex;align-items:center;justify-content:center;'
    + 'cursor:pointer;box-shadow:0 2px 8px rgba(27,26,24,.08);'
    + 'transition:color .25s,border-color .25s,transform .25s;padding:0}'
    + '.bgm-fab:hover{color:var(--accent,#9c3b2a);border-color:var(--accent,#9c3b2a);transform:translateY(-1px)}'
    + '.bgm-fab:focus-visible{outline:2px solid var(--accent,#9c3b2a);outline-offset:2px}'
    + '.bgm-fab svg{width:17px;height:17px;display:block}'
    + '.bgm-fab .bgm-wave{display:none}'
    + '.bgm-fab.on{color:var(--accent,#9c3b2a);border-color:var(--accent,#9c3b2a)}'
    + '.bgm-fab.on .bgm-note{display:none}'
    + '.bgm-fab.on .bgm-wave{display:block;animation:bgmPulse 1.6s ease-in-out infinite}'
    + '@keyframes bgmPulse{0%,100%{opacity:1}50%{opacity:.45}}'
    + '@media (prefers-reduced-motion: reduce){.bgm-fab.on .bgm-wave{animation:none}}';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  /* 音符图标（静默态）与声波图标（播放态） */
  var NOTE = '<svg class="bgm-note" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
  var WAVE = '<svg class="bgm-wave" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 10v4"/><path d="M9 7v10"/><path d="M14 4v16"/><path d="M19 8v8"/></svg>';

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'bgm-fab';
  btn.setAttribute('aria-label', '播放背景音乐');
  btn.innerHTML = NOTE + WAVE;
  document.body.appendChild(btn);

  var audio = document.createElement('audio');
  audio.loop = true;
  audio.preload = 'auto';
  audio.setAttribute('aria-hidden', 'true');
  document.body.appendChild(audio);

  var userPaused = false;
  function loadTrack(){
    if(idx >= TRACKS.length) return;
    audio.src = TRACKS[idx].src;
    audio.volume = 0.34;
    audio.load();
  }
  audio.addEventListener('error', function(){
    idx++;
    loadTrack();
    /* 首曲加载失败换备用曲后，自动重试播放（用户主动暂停过则不打扰） */
    if(!userPaused){ play(); }
  });
  loadTrack();

  function setUI(on){
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-label', on ? ('暂停背景音乐 · ' + TRACKS[idx].name) : '播放背景音乐');
    btn.title = on ? ('正在播放 · ' + TRACKS[idx].name) : '播放背景音乐';
  }
  function remember(on){ try{ localStorage.setItem(BG_KEY, on ? '1' : '0'); }catch(e){} }
  function play(){
    userPaused = false;
    var p = audio.play();
    if(p && p.then){
      p.then(function(){ setUI(true); remember(true); })
       .catch(function(){ setUI(false); });
    } else { setUI(true); remember(true); }
  }
  function pause(){
    userPaused = true;
    audio.pause();
    setUI(false);
    remember(false);
  }
  function armFallback(){
    var events = ['pointerdown','keydown','touchstart','wheel','scroll'];
    var once = function(){
      audio.muted = false;
      var p = audio.play();
      if(p && p.then){ p.then(function(){ setUI(true); remember(true); }); }
      else { setUI(true); remember(true); }
      events.forEach(function(e){ document.removeEventListener(e, once); });
    };
    events.forEach(function(e){ document.addEventListener(e, once, {once:true, passive:true}); });
  }
  btn.addEventListener('click', function(){
    if(audio.paused){ play(); } else { pause(); }
  });

  /* 自动播放：先尝试直接出声；被拦截则静音保住播放态，首次交互出声 */
  var dismissed = false;
  try{ dismissed = localStorage.getItem(BG_KEY) === '0'; }catch(e){}
  function tryAutoPlay(){
    audio.muted = false;
    var p = audio.play();
    if(p && p.then){
      p.then(function(){ setUI(true); remember(true); })
       .catch(function(){
          audio.muted = true;
          armFallback();
       });
    }
  }
  if(!dismissed){ tryAutoPlay(); }
})();
