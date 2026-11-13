import { useCallback, useEffect, useRef, useState } from 'react'

/* 体感打气球 —— 摄像头 + MediaPipe FaceDetector（CDN 运行时加载，不进打包产物）。
 * 头部位置（人脸中心，镜像）驱动飞针；气球上飘，针尖碰到即爆。
 * 摄像头不可用 / 模型加载失败时自动降级为鼠标模式，玩法不变。 */

const W = 640, H = 480
const ROUND = 60
const LS_KEY = 'nice2.games.balloon.best'
const MEDIAPIPE_VER = '0.10.18'
const MEDIAPIPE_ESM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VER}/+esm`
const MEDIAPIPE_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VER}/wasm`
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'

type Balloon = { x: number; y: number; vy: number; r: number; hue: number; wob: number; dead: number }
type Pop = { x: number; y: number; t: number; hue: number }

export default function Balloon() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [phase, setPhase] = useState<'idle' | 'loading' | 'playing' | 'done'>('idle')
  const [mode, setMode] = useState<'face' | 'mouse'>('mouse')
  const [score, setScore] = useState(0)
  const [timeLeft, setTimeLeft] = useState(ROUND)
  const [best, setBest] = useState(() => { try { return Number(localStorage.getItem(LS_KEY)) || 0 } catch { return 0 } })
  const [note, setNote] = useState('')

  const st = useRef({
    running: false,
    raf: 0,
    balloons: [] as Balloon[],
    pops: [] as Pop[],
    needle: { x: W / 2, y: H / 2 },
    needleVX: 0,
    needleVY: 0,
    face: { x: W / 2, y: H / 2 },
    score: 0,
    spawn: 0,
    timeLeft: ROUND,
    detector: null as any,
    stream: null as MediaStream | null,
    lastVideoTime: -1,
  })

  const draw = useCallback(() => {
    const s = st.current
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')!
    ctx.fillStyle = '#0b0e14'
    ctx.fillRect(0, 0, W, H)

    /* 摄像头画面做背景（镜像），画成低亮度 CRT 层 */
    const video = videoRef.current
    if (video && video.readyState >= 2 && mode === 'face') {
      ctx.save()
      ctx.globalAlpha = 0.28
      ctx.translate(W, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(video, 0, 0, W, H)
      ctx.restore()
      /* 扫描线 */
      ctx.fillStyle = 'rgba(11,14,20,.35)'
      for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2)
    } else {
      /* 鼠标模式：电网背景 */
      ctx.strokeStyle = 'rgba(35,43,59,.6)'
      ctx.lineWidth = 1
      for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
      for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }
    }

    /* 气球 */
    for (const b of s.balloons) {
      if (b.dead) continue
      const px = b.x + Math.sin(b.wob) * 6
      ctx.strokeStyle = `hsl(${b.hue} 70% 60%)`
      ctx.fillStyle = `hsla(${b.hue} 70% 55% / .18)`
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.ellipse(px, b.y, b.r, b.r * 1.18, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      /* 高光 */
      ctx.strokeStyle = `hsla(${b.hue} 70% 80% / .5)`
      ctx.beginPath(); ctx.ellipse(px - b.r * 0.38, b.y - b.r * 0.42, b.r * 0.24, b.r * 0.4, -0.5, 0, Math.PI * 2); ctx.stroke()
      /* 尾线 */
      ctx.strokeStyle = `hsla(${b.hue} 70% 60% / .7)`
      ctx.beginPath(); ctx.moveTo(px, b.y + b.r * 1.18)
      ctx.quadraticCurveTo(px + 6, b.y + b.r * 1.18 + 12, px - 4, b.y + b.r * 1.18 + 22)
      ctx.stroke()
    }

    /* 爆裂特效 */
    for (const p of s.pops) {
      const k = p.t / 400
      ctx.strokeStyle = `hsla(${p.hue} 70% 60% / ${1 - k})`
      ctx.lineWidth = 2
      for (let i = 0; i < 7; i++) {
        const a = (Math.PI * 2 * i) / 7
        const d1 = 10 + k * 26, d2 = d1 + 8 * (1 - k)
        ctx.beginPath()
        ctx.moveTo(p.x + Math.cos(a) * d1, p.y + Math.sin(a) * d1)
        ctx.lineTo(p.x + Math.cos(a) * d2, p.y + Math.sin(a) * d2)
        ctx.stroke()
      }
    }

    /* 飞针（十字准星 + 箭头） */
    const nx = s.needle.x, ny = s.needle.y
    ctx.strokeStyle = mode === 'face' ? '#4dd8e6' : '#f0a832'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(nx - 16, ny); ctx.lineTo(nx - 5, ny)
    ctx.moveTo(nx + 5, ny); ctx.lineTo(nx + 16, ny)
    ctx.moveTo(nx, ny - 16); ctx.lineTo(nx, ny - 5)
    ctx.moveTo(nx, ny + 5); ctx.lineTo(nx, ny + 16)
    ctx.stroke()
    ctx.beginPath(); ctx.arc(nx, ny, 3, 0, Math.PI * 2); ctx.stroke()

    /* 人脸模式下：框出检测到的人脸 */
    if (mode === 'face') {
      ctx.strokeStyle = 'rgba(123,201,111,.55)'
      ctx.setLineDash([6, 5])
      ctx.strokeRect(s.face.x - 52, s.face.y - 52, 104, 104)
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(123,201,111,.8)'
      ctx.font = '12px Consolas, monospace'
      ctx.fillText('FACE LOCK', s.face.x - 52, s.face.y - 58)
    }
  }, [mode])

  useEffect(() => { if (phase === 'playing' || phase === 'done') draw() }, [draw, phase])

  /* ---------- 主循环 ---------- */
  const startLoop = useCallback((detector: any) => {
    const s = st.current
    s.running = true
    s.timeLeft = ROUND
    s.score = 0
    s.balloons = []
    s.pops = []
    s.spawn = 0
    setScore(0); setTimeLeft(ROUND)

    const video = videoRef.current
    let last = performance.now()

    const loop = async (now: number) => {
      if (!s.running) return
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now

      /* 人脸检测（有帧才推） */
      if (detector && video && video.readyState >= 2 && video.currentTime !== s.lastVideoTime) {
        s.lastVideoTime = video.currentTime
        try {
          const res = detector.detectForVideo(video, now)
          if (res.detections?.length) {
            const box = res.detections[0].boundingBox
            /* 视频坐标 → 画布坐标（镜像 x） */
            const sx = video.videoWidth / W, sy = video.videoHeight / H
            s.face.x = W - (box.originX + box.width / 2) / sx
            s.face.y = (box.originY + box.height / 2) / sy
          }
        } catch { /* 偶发帧失败忽略 */ }
      }

      /* 飞针追踪目标（人脸或上一帧鼠标位置），加速度限速，避免瞬移 */
      const k = mode === 'face' ? 8 : 20
      s.needle.x += (s.face.x - s.needle.x) * Math.min(1, dt * k)
      s.needle.y += (s.face.y - s.needle.y) * Math.min(1, dt * k)

      /* 生成气球：随时间加密度 */
      s.spawn -= dt
      if (s.spawn <= 0) {
        s.spawn = Math.max(0.4, 1.15 - (ROUND - s.timeLeft) / 90)
        const r = 22 + Math.random() * 14
        s.balloons.push({
          x: 40 + Math.random() * (W - 80),
          y: H + r * 2,
          vy: 46 + Math.random() * 46,
          r,
          hue: Math.floor(Math.random() * 360),
          wob: Math.random() * Math.PI * 2,
          dead: 0,
        })
      }

      /* 气球运动与命中 */
      for (let i = s.balloons.length - 1; i >= 0; i--) {
        const b = s.balloons[i]
        b.y -= b.vy * dt
        b.wob += dt * 2.2
        if (b.y < -b.r * 2) { s.balloons.splice(i, 1); continue }
        const px = b.x + Math.sin(b.wob) * 6
        if (Math.hypot(px - s.needle.x, b.y - s.needle.y) < b.r + 10) {
          s.balloons.splice(i, 1)
          s.pops.push({ x: px, y: b.y, t: 0, hue: b.hue })
          s.score += 1
          setScore(s.score)
        }
      }
      for (let i = s.pops.length - 1; i >= 0; i--) {
        s.pops[i].t += dt * 1000
        if (s.pops[i].t > 400) s.pops.splice(i, 1)
      }

      /* 倒计时 */
      s.timeLeft -= dt
      setTimeLeft(Math.max(0, Math.ceil(s.timeLeft)))
      if (s.timeLeft <= 0) {
        s.running = false
        setPhase('done')
        try {
          if (s.score > (Number(localStorage.getItem(LS_KEY)) || 0)) {
            localStorage.setItem(LS_KEY, String(s.score)); setBest(s.score)
          }
        } catch { /* 忽略 */ }
        draw()
        return
      }

      draw()
      s.raf = requestAnimationFrame(loop)
    }
    s.raf = requestAnimationFrame(loop)
  }, [draw, mode])

  /* ---------- 开局：请求摄像头 + 加载模型 ---------- */
  const startFace = async () => {
    setPhase('loading')
    setNote('正在请求摄像头…')
    const s = st.current
    try {
      s.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      })
      const video = videoRef.current!
      video.srcObject = s.stream
      await video.play()
    } catch {
      setNote('摄像头不可用，已切换为鼠标模式')
      setMode('mouse')
      startLoop(null)
      setPhase('playing')
      return
    }
    setNote('正在加载人脸检测模型（约 3 MB，来自 CDN）…')
    try {
      const vision: any = await import(/* @vite-ignore */ MEDIAPIPE_ESM)
      const fileset = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM)
      s.detector = await vision.FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.4,
      })
      setMode('face')
      setNote('')
      startLoop(s.detector)
      setPhase('playing')
    } catch {
      setNote('模型加载失败（可能被网络拦截），已切换为鼠标模式')
      setMode('mouse')
      startLoop(null)
      setPhase('playing')
    }
  }

  const startMouse = () => {
    setMode('mouse')
    setNote('')
    startLoop(null)
    setPhase('playing')
  }

  /* 鼠标兜底模式：指针移动即飞针目标 */
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const handler = (e: PointerEvent) => {
      const rect = cv.getBoundingClientRect()
      st.current.face.x = (e.clientX - rect.left) * (W / rect.width)
      st.current.face.y = (e.clientY - rect.top) * (H / rect.height)
    }
    cv.addEventListener('pointermove', handler)
    return () => cv.removeEventListener('pointermove', handler)
  }, [])

  /* 静态首帧预览 */
  useEffect(() => {
    document.title = '体感打气球 — NICE.BLOG 2.0'
    draw()
  }, [draw])

  /* 卸载清理：停循环、关模型、停摄像头 */
  useEffect(() => {
    const s = st.current
    return () => {
      s.running = false
      cancelAnimationFrame(s.raf)
      try { s.detector?.close?.() } catch { /* 忽略 */ }
      s.stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <div className="balloon">
      <div className="gm-hud">
        <span>模式 <b className="mono">{phase === 'playing' || phase === 'done' ? (mode === 'face' ? '人脸体感' : '鼠标') : '—'}</b></span>
        <span>分数 <b className="mono">{score}</b></span>
        <span>时间 <b className="mono">{Math.max(0, timeLeft)}s</b></span>
        <span>最高 <b className="mono">{best}</b></span>
      </div>
      {note && <div className="gm-msg mono">{note}</div>}

      <video ref={videoRef} className="balloon-video" playsInline muted />
      <div className="balloon-stage">
        <canvas ref={canvasRef} width={W} height={H} className="balloon-cv" />
        {phase === 'idle' && (
          <div className="gm-over">
            <div className="gm-over-title">体感打气球</div>
            <div className="mono">用头部的移动控制飞针，顶破上升的气球，60 秒限时</div>
            <div className="gm-over-ops">
              <button onClick={startFace}>开启摄像头对战 ▸</button>
              <button onClick={startMouse}>鼠标模式</button>
            </div>
            <p className="muted mono" style={{ fontSize: 11, maxWidth: 420, marginTop: 10 }}>
              摄像头画面仅绘制在本页画布内，不上传任何数据；人脸检测模型从 CDN 加载。
            </p>
          </div>
        )}
        {phase === 'loading' && (
          <div className="gm-over"><div className="gm-over-title mono">LOADING…</div></div>
        )}
        {phase === 'done' && (
          <div className="gm-over">
            <div className="gm-over-title">TIME UP</div>
            <div className="mono">本次 {score} 分 · 最高 {best} 分</div>
            <div className="gm-over-ops">
              <button onClick={mode === 'face' ? startFace : startMouse}>再来一轮</button>
              <button onClick={() => setPhase('idle')}>返回</button>
            </div>
          </div>
        )}
      </div>
      <p className="muted gm-tip mono">移动头即可移动准星；坐着正对摄像头，幅度不用太大。</p>
    </div>
  )
}
