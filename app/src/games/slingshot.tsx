import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as RPointerEvent } from 'react'
import Matter from 'matter-js'

/* 弹弓堡垒 —— Matter.js（愤怒的小鸟式）。
 * 引擎跑固定步长，渲染自己画（CRT 琥珀线框风），
 * 拖拽弹丸蓄力，松手按「拉伸向量 × 弹性系数」给出初速度。
 * 目标：击落全部红芯（猪）；木架被撞散也会失稳倒塌。 */

const W = 720, H = 480
const GROUND_Y = 440
const SLING = { x: 96, y: 320 }
const MAX_STRETCH = 95
const BIRD_R = 15
const PIG_R = 15

interface LevelSpec { woods: [number, number, number, number][]; pigs: [number, number][] }

const LEVELS: LevelSpec[] = [
  /* 第一关：两柱一梁 + 单猪 */
  {
    woods: [[420, 380, 24, 120], [540, 380, 24, 120], [480, 308, 160, 24]],
    pigs: [[480, 360]],
  },
  /* 第二关：双层塔 */
  {
    woods: [
      [400, 380, 22, 120], [500, 380, 22, 120], [450, 308, 130, 22],
      [418, 250, 22, 110], [482, 250, 22, 110], [450, 185, 100, 22],
    ],
    pigs: [[450, 355], [450, 158]],
  },
  /* 第三关：前挡板 + 三猪堡垒 */
  {
    woods: [
      [330, 380, 22, 120],
      [470, 380, 24, 120], [590, 380, 24, 120], [530, 308, 150, 24],
      [500, 250, 22, 110], [560, 250, 22, 110], [530, 185, 100, 22],
    ],
    pigs: [[470, 360], [530, 280], [530, 158]],
  },
]

const BIRDS_PER_LEVEL = 4

type Body = Matter.Body

function buildLevel(engine: Matter.Engine, spec: LevelSpec) {
  const ground = Matter.Bodies.rectangle(W / 2, GROUND_Y + 20, W, 40, {
    isStatic: true, label: 'ground', friction: 1,
  })
  const walls = [
    Matter.Bodies.rectangle(-30, H / 2, 60, H * 2, { isStatic: true, label: 'wall' }),
    Matter.Bodies.rectangle(W + 30, H / 2, 60, H * 2, { isStatic: true, label: 'wall' }),
  ]
  const woods = spec.woods.map(([x, y, w, h]) =>
    Matter.Bodies.rectangle(x, y, w, h, {
      label: 'wood', density: 0.002, friction: 0.6, restitution: 0.05,
      plugin: { w, h }, // 自绘用原始尺寸（旋转后 bounds 只是 AABB）
    }))
  const pigs = spec.pigs.map(([x, y]) =>
    Matter.Bodies.circle(x, y, PIG_R, {
      label: 'pig', density: 0.0025, friction: 0.4, restitution: 0.2,
    }))
  Matter.Composite.add(engine.world, [ground, ...walls, ...woods, ...pigs])
}

export default function Slingshot() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [level, setLevel] = useState(0)
  const [score, setScore] = useState(0)
  const [birds, setBirds] = useState(BIRDS_PER_LEVEL)
  const [status, setStatus] = useState<'aim' | 'flying' | 'won' | 'lost' | 'all-clear'>('aim')
  const [msg, setMsg] = useState('拖住弹丸向后拉，松手发射')

  const st = useRef({
    engine: null as Matter.Engine | null,
    bird: null as Body | null,
    dragging: false,
    launched: false,
    flying: false,
    stop: false,
    settleTimer: 0,
    pigsLeft: 0,
    score: 0,
    birds: BIRDS_PER_LEVEL,
  })

  const levelRef = useRef(0)

  const resetLevel = useCallback((idx: number, keepScore: boolean) => {
    const s = st.current
    if (!s.engine) return
    Matter.Composite.clear(s.engine.world, false, true)
    const spec = LEVELS[idx]
    buildLevel(s.engine, spec)
    s.bird = Matter.Bodies.circle(SLING.x, SLING.y, BIRD_R, { label: 'bird', density: 0.004, frictionAir: 0.008, restitution: 0.4 })
    Matter.Body.setStatic(s.bird, true)
    Matter.Composite.add(s.engine.world, s.bird)
    s.dragging = false; s.launched = false; s.flying = false
    s.settleTimer = 0
    s.pigsLeft = spec.pigs.length
    s.birds = BIRDS_PER_LEVEL
    if (!keepScore) s.score = 0
    levelRef.current = idx
    setLevel(idx)
    setScore(s.score)
    setBirds(BIRDS_PER_LEVEL)
    setStatus('aim')
    setMsg(idx === 0 ? '拖住弹丸向后拉，松手发射' : `第 ${idx + 1} 关`)
  }, [])

  useEffect(() => {
    document.title = '弹弓堡垒 — NICE.BLOG 2.0'
    const s = st.current
    s.engine = Matter.Engine.create({ gravity: { x: 0, y: 1, scale: 0.001 } })
    resetLevel(0, false)

    /* 碰撞：目标受强冲击即被击破 */
    Matter.Events.on(s.engine, 'collisionStart', (evt) => {
      for (const pair of evt.pairs) {
        const { bodyA, bodyB } = pair
        const pig = bodyA.label === 'pig' ? bodyA : bodyB.label === 'pig' ? bodyB : null
        if (!pig || !s.engine) continue
        const other = pig === bodyA ? bodyB : bodyA
        const v = Math.hypot(
          (bodyA.velocity.x - bodyB.velocity.x), (bodyA.velocity.y - bodyB.velocity.y))
        const hardHit = other.label === 'bird' ? v > 4 : v > 7
        const crushed = Math.abs(pig.velocity.x) + Math.abs(pig.velocity.y) > 5
        if (hardHit || crushed) {
          Matter.Composite.remove(s.engine.world, pig)
          s.pigsLeft -= 1
          s.score += 500
          setScore(s.score)
          if (s.pigsLeft === 0) {
            /* 剩余弹丸换成分数（愤怒的小鸟传统） */
            s.score += s.birds * 200
            setScore(s.score)
            const last = levelRef.current === LEVELS.length - 1
            setStatus(last ? 'all-clear' : 'won')
            setMsg(last ? `全部通关！总分 ${s.score}` : '目标全灭！')
            s.flying = false
          }
        }
      }
    })

    /* 主循环：固定步长物理 + 自绘渲染 */
    let last = performance.now()
    let acc = 0
    const loop = (now: number) => {
      if (s.stop) return
      const dt = Math.min(now - last, 100)
      last = now
      acc += dt
      while (acc >= 1000 / 60) {
        Matter.Engine.update(s.engine!, 1000 / 60)
        acc -= 1000 / 60
      }
      /* 飞行结算：弹丸停稳 / 出界 / 超时 → 换下一发 */
      if (s.flying && s.bird) {
        const b = s.bird
        const slow = Math.hypot(b.velocity.x, b.velocity.y) < 1.2
        s.settleTimer += dt
        if ((slow && s.settleTimer > 400) || b.position.y > H + 80 || b.position.x > W + 60 || s.settleTimer > 6000) {
          s.flying = false
          if (s.pigsLeft > 0) {
            if (s.birds <= 1) {
              s.birds = 0; setBirds(0)
              setStatus('lost')
              setMsg('弹丸用尽，重试本关')
            } else {
              s.birds -= 1; setBirds(s.birds)
              const bird = Matter.Bodies.circle(SLING.x, SLING.y, BIRD_R, { label: 'bird', density: 0.004, frictionAir: 0.008, restitution: 0.4 })
              Matter.Body.setStatic(bird, true)
              s.bird = bird
              s.launched = false; s.dragging = false
              Matter.Composite.add(s.engine!.world, bird)
            }
          }
        }
      }
      draw(canvasRef.current!, s)
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)

    return () => {
      s.stop = true
      s.engine && Matter.Engine.clear(s.engine)
    }
  }, [resetLevel])

  /* ---------- 指针交互：拖拽蓄力 ---------- */
  const ptr = (e: RPointerEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current!
    const rect = cv.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (W / rect.width),
      y: (e.clientY - rect.top) * (H / rect.height),
    }
  }
  const onDown = (e: RPointerEvent<HTMLCanvasElement>) => {
    const s = st.current
    if (status !== 'aim' || !s.bird || s.launched) return
    const p = ptr(e)
    if (Math.hypot(p.x - SLING.x, p.y - SLING.y) < 60) {
      s.dragging = true
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    }
  }
  const onMove = (e: RPointerEvent<HTMLCanvasElement>) => {
    const s = st.current
    if (!s.dragging || !s.bird) return
    const p = ptr(e)
    let dx = p.x - SLING.x, dy = p.y - SLING.y
    const d = Math.hypot(dx, dy)
    if (d > MAX_STRETCH) { dx = dx / d * MAX_STRETCH; dy = dy / d * MAX_STRETCH }
    Matter.Body.setPosition(s.bird, { x: SLING.x + dx, y: SLING.y + dy })
  }
  const onUp = () => {
    const s = st.current
    if (!s.dragging || !s.bird || !s.engine) return
    s.dragging = false; s.launched = true; s.flying = true; s.settleTimer = 0
    Matter.Body.setStatic(s.bird, false)
    const dx = SLING.x - s.bird.position.x
    const dy = SLING.y - s.bird.position.y
    Matter.Body.setVelocity(s.bird, { x: dx * 0.16, y: dy * 0.16 })
    setStatus('flying')
    setMsg('命中红芯！击碎全部目标过关')
  }

  const next = () => resetLevel(Math.min(level + 1, LEVELS.length - 1), true)
  const retry = () => resetLevel(level, false)

  return (
    <div className="sling">
      <div className="gm-hud">
        <span>关卡 <b className="mono">{level + 1} / {LEVELS.length}</b></span>
        <span>分数 <b className="mono">{score}</b></span>
        <span>弹丸 <b className="mono">{'●'.repeat(birds) || '—'}</b></span>
        <span>目标 <b className="mono">{st.current.pigsLeft}</b></span>
        <span className="gm-hud-ops">
          <button onClick={retry}>重试本关</button>
        </span>
      </div>
      {msg && <div className="gm-msg mono">{msg}</div>}

      <canvas
        ref={canvasRef} width={W} height={H} className="sling-cv"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      />

      {(status === 'won' || status === 'all-clear' || status === 'lost') && (
        <div className="gm-over">
          <div className="gm-over-title">{status === 'lost' ? 'RETRY' : status === 'won' ? 'CLEAR' : 'ALL CLEAR'}</div>
          <div className="mono">分数 {score}</div>
          {status === 'won' && <button onClick={next}>下一关 ▸</button>}
          {status === 'lost' && <button onClick={retry}>重试本关</button>}
          {status === 'all-clear' && <button onClick={() => resetLevel(0, false)}>从头再来</button>}
        </div>
      )}
      <p className="muted gm-tip mono">拖住弹丸向后拉蓄力，松手发射；击碎全部红芯过关，剩弹丸结算奖励分。</p>
    </div>
  )
}

/* ---------- 自绘渲染 ---------- */
function draw(cv: HTMLCanvasElement, s: {
  engine: Matter.Engine | null; bird: Body | null; dragging: boolean
}) {
  const ctx = cv.getContext('2d')!
  ctx.clearRect(0, 0, W, H)
  /* 地面 */
  ctx.strokeStyle = 'rgba(240,168,50,.9)'
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(W, GROUND_Y); ctx.stroke()
  ctx.fillStyle = 'rgba(240,168,50,.08)'
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y)
  /* 刻度装饰 */
  ctx.strokeStyle = 'rgba(240,168,50,.25)'
  ctx.lineWidth = 1
  for (let x = 0; x < W; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, GROUND_Y); ctx.lineTo(x - 8, H); ctx.stroke()
  }

  /* 弹弓 */
  ctx.strokeStyle = 'rgba(77,216,230,.9)'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(SLING.x - 12, GROUND_Y); ctx.lineTo(SLING.x - 4, SLING.y - 4)
  ctx.moveTo(SLING.x + 12, GROUND_Y); ctx.lineTo(SLING.x + 4, SLING.y - 4)
  ctx.stroke()

  if (!s.engine) return
  const bodies = Matter.Composite.allBodies(s.engine.world)
  for (const b of bodies) {
    if (b.label === 'ground' || b.label === 'wall') continue
    const { x, y } = b.position
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(b.angle)
    if (b.label === 'wood') {
      const fw = (b.plugin?.w as number) ?? (b.bounds.max.x - b.bounds.min.x)
      const fh = (b.plugin?.h as number) ?? (b.bounds.max.y - b.bounds.min.y)
      ctx.strokeStyle = 'rgba(240,168,50,.85)'
      ctx.fillStyle = 'rgba(35,43,59,.9)'
      ctx.lineWidth = 2
      ctx.fillRect(-fw / 2, -fh / 2, fw, fh)
      ctx.strokeRect(-fw / 2, -fh / 2, fw, fh)
      /* 木纹 */
      ctx.strokeStyle = 'rgba(240,168,50,.3)'
      ctx.beginPath(); ctx.moveTo(-fw / 2 + 6, -fh / 2 + 6); ctx.lineTo(fw / 2 - 6, fh / 2 - 6); ctx.stroke()
    } else if (b.label === 'pig') {
      ctx.strokeStyle = '#e06c60'
      ctx.fillStyle = 'rgba(224,108,96,.25)'
      ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.arc(0, 0, PIG_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      /* 红芯十字 */
      ctx.strokeStyle = '#e06c60'
      ctx.beginPath()
      ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.moveTo(0, -6); ctx.lineTo(0, 6)
      ctx.stroke()
    } else if (b.label === 'bird') {
      ctx.strokeStyle = '#4dd8e6'
      ctx.fillStyle = 'rgba(77,216,230,.3)'
      ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#4dd8e6'
      ctx.beginPath(); ctx.arc(4, -4, 2.5, 0, Math.PI * 2); ctx.fill()
      /* 蓄力时的皮筋 */
      if (s.dragging) {
        ctx.strokeStyle = 'rgba(240,168,50,.7)'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(SLING.x - 2 - x, SLING.y - y); ctx.lineTo(0, 0)
        ctx.moveTo(SLING.x + 2 - x, SLING.y - y); ctx.lineTo(0, 0)
        ctx.stroke()
      }
    }
    ctx.restore()
  }

  /* 蓄力强度条（皮筋拉得越满发射越远） */
  if (s.dragging && s.bird) {
    const d = Math.hypot(s.bird.position.x - SLING.x, s.bird.position.y - SLING.y)
    const p = Math.min(d / MAX_STRETCH, 1)
    ctx.fillStyle = 'rgba(240,168,50,.2)'
    ctx.fillRect(16, 16, 120, 8)
    ctx.fillStyle = p > 0.8 ? '#e06c60' : '#f0a832'
    ctx.fillRect(16, 16, 120 * p, 8)
    ctx.strokeStyle = 'rgba(240,168,50,.6)'
    ctx.lineWidth = 1
    ctx.strokeRect(16, 16, 120, 8)
  }
}
