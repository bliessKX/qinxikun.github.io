import { useEffect, useRef, useState } from 'react'

/* 贪吃蛇 —— Canvas 2D 轻量逻辑游戏。
 * 方向键/WASD 或触屏滑动控制；吃 🍎 变长，撞墙或撞自己结束；
 * 每 4 个食物提速一档。最高分存 localStorage。 */

const COLS = 22, ROWS = 22, CELL = 22
const W = COLS * CELL, H = ROWS * CELL
const LS_KEY = 'snake.best.v1'

interface P { x: number; y: number }

export default function Snake() {
  const cvRef = useRef<HTMLCanvasElement>(null)
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(() => { try { return Number(localStorage.getItem(LS_KEY)) || 0 } catch { return 0 } })
  const [over, setOver] = useState(false)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    document.title = '贪吃蛇 — NICE.BLOG 2.0'
    const cv = cvRef.current!
    const ctx = cv.getContext('2d')!

    const st = {
      snake: [{ x: 8, y: 11 }, { x: 7, y: 11 }, { x: 6, y: 11 }] as P[],
      dir: { x: 1, y: 0 } as P,
      nextDir: { x: 1, y: 0 } as P,
      food: { x: 14, y: 11 } as P,
      speed: 150, acc: 0, running: false, dead: false,
    }

    const placeFood = () => {
      for (;;) {
        const f = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) }
        if (!st.snake.some((s) => s.x === f.x && s.y === f.y)) { st.food = f; return }
      }
    }

    const draw = () => {
      ctx.fillStyle = '#0b0e14'
      ctx.fillRect(0, 0, W, H)
      /* 网格暗线 */
      ctx.strokeStyle = 'rgba(232,227,216,.05)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let i = 1; i < COLS; i++) { ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, H) }
      for (let i = 1; i < ROWS; i++) { ctx.moveTo(0, i * CELL); ctx.lineTo(W, i * CELL) }
      ctx.stroke()
      /* 食物 */
      ctx.font = `${CELL - 4}px sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('🍎', st.food.x * CELL + CELL / 2, st.food.y * CELL + CELL / 2 + 1)
      /* 蛇：头亮身暗 */
      st.snake.forEach((s, i) => {
        ctx.fillStyle = i === 0 ? '#f0a832' : `rgba(123,201,111,${Math.max(0.35, 1 - i * 0.02)})`
        const pad = i === 0 ? 1 : 3
        ctx.beginPath()
        ctx.roundRect(s.x * CELL + pad, s.y * CELL + pad, CELL - pad * 2, CELL - pad * 2, 5)
        ctx.fill()
      })
    }

    const die = () => {
      st.dead = true; st.running = false
      setOver(true)
      setScore((sc) => {
        if (sc > best) { setBest(sc); try { localStorage.setItem(LS_KEY, String(sc)) } catch { /* ignore */ } }
        return sc
      })
    }

    const step = () => {
      const head = st.snake[0]
      st.dir = st.nextDir
      const nx = head.x + st.dir.x, ny = head.y + st.dir.y
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return die()
      if (st.snake.some((s, i) => i < st.snake.length - 1 && s.x === nx && s.y === ny)) return die()
      st.snake.unshift({ x: nx, y: ny })
      if (nx === st.food.x && ny === st.food.y) {
        setScore((s) => s + 10)
        if ((st.snake.length - 3) % 4 === 0) st.speed = Math.max(70, st.speed - 10)
        placeFood()
      } else st.snake.pop()
    }

    /* 主循环 */
    let raf = 0, last = performance.now()
    const loop = (now: number) => {
      const dt = now - last; last = now
      if (st.running && !st.dead) {
        st.acc += dt
        while (st.acc >= st.speed) { st.acc -= st.speed; step(); if (st.dead) break }
      }
      draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    /* 输入：键盘 + 触屏滑动 */
    const setDir = (x: number, y: number) => {
      if (st.dir.x === -x && st.dir.y === -y) return /* 禁止 180° 掉头 */
      st.nextDir = { x, y }
    }
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault()
      if (st.dead) return
      if (!st.running && (k === ' ' || k === 'enter')) { st.running = true; setStarted(true); return }
      if (k === 'arrowup' || k === 'w') setDir(0, -1)
      else if (k === 'arrowdown' || k === 's') setDir(0, 1)
      else if (k === 'arrowleft' || k === 'a') setDir(-1, 0)
      else if (k === 'arrowright' || k === 'd') setDir(1, 0)
    }
    window.addEventListener('keydown', onKey)

    let tx = 0, ty = 0
    const ts = (e: TouchEvent) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY }
    const te = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty
      if (Math.hypot(dx, dy) < 20) {
        if (!st.running && !st.dead) { st.running = true; setStarted(true) }
        return
      }
      if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 1 : -1, 0)
      else setDir(0, dy > 0 ? 1 : -1)
    }
    cv.addEventListener('touchstart', ts, { passive: true })
    cv.addEventListener('touchend', te, { passive: true })
    const onClick = () => { if (!st.running && !st.dead) { st.running = true; setStarted(true) } }
    cv.addEventListener('pointerdown', onClick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
      cv.removeEventListener('touchstart', ts)
      cv.removeEventListener('touchend', te)
      cv.removeEventListener('pointerdown', onClick)
    }
  }, [])

  const restart = () => { window.location.reload() }

  return (
    <div className="snake">
      <div className="gm-hud">
        <span>分数 <b className="mono">{score}</b></span>
        <span>最高 <b className="mono">{best}</b></span>
        <span className="gm-hud-ops"><button onClick={restart}>重开</button></span>
      </div>
      <div className="snake-stage">
        <canvas ref={cvRef} width={W} height={H} className="snake-cv" />
        {!started && !over && <div className="gm-over"><div className="gm-over-title mono">SNAKE</div>
          <div className="mono">方向键 / WASD / 滑动屏幕转向，点按开始</div></div>}
        {over && <div className="gm-over"><div className="gm-over-title">GAME OVER</div>
          <div className="mono">分数 {score}</div><button onClick={restart}>再来一局</button></div>}
      </div>
      <p className="game-sub">吃苹果变长，每 4 个提速一档；撞墙或咬到自己就结束。手机上在棋盘里滑动即可转向。</p>
    </div>
  )
}
