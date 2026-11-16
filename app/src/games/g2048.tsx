import { useCallback, useEffect, useRef, useState } from 'react'

/* 2048 —— Canvas 2D 轻量逻辑游戏。
 * 方向键/WASD 或触屏滑动合并数字，达成 2048 获胜，无路可走结束。
 * 分数与最高分存 localStorage。 */

const LS_KEY = 'g2048.best.v1'
type Board = number[][]
const SIZE = 4

/* CRT 琥珀色阶：值越大越亮 */
const TONES: Record<number, string> = {
  2: '#1d2733', 4: '#233248', 8: '#2a4260', 16: '#33557e',
  32: '#3f6d9e', 64: '#4d87bd', 128: '#5fa3d8', 256: '#74bfe8',
  512: '#8fd8ec', 1024: '#aee9ef', 2048: '#f0a832',
}
const inkFor = (v: number) => (v >= 128 ? '#0b0e14' : '#e8e3d8')

function emptyBoard(): Board {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0))
}
function addTile(b: Board) {
  const flats: [number, number][] = []
  b.forEach((row, r) => row.forEach((v, c) => { if (v === 0) flats.push([r, c]) }))
  if (!flats.length) return
  const [r, c] = flats[Math.floor(Math.random() * flats.length)]
  b[r][c] = Math.random() < 0.9 ? 2 : 4
}
function seedBoard(): Board {
  const b = emptyBoard(); addTile(b); addTile(b); return b
}

/** 向 dir 方向推并合并；返回 [新棋盘, 本步得分, 是否有移动] */
function slide(b: Board, dr: number, dc: number): [Board, number, boolean] {
  const nb = emptyBoard()
  let gained = 0, moved = false
  for (let i = 0; i < SIZE; i++) {
    const line: number[] = []
    for (let j = 0; j < SIZE; j++) {
      const r = dr === 1 ? SIZE - 1 - j : dr === -1 ? j : i
      const c = dc === 1 ? SIZE - 1 - j : dc === -1 ? j : i
      if (b[r][c]) line.push(b[r][c])
    }
    const merged: number[] = []
    for (let k = 0; k < line.length; k++) {
      if (k + 1 < line.length && line[k] === line[k + 1]) { merged.push(line[k] * 2); gained += line[k] * 2; k++ }
      else merged.push(line[k])
    }
    for (let j = 0; j < SIZE; j++) {
      const r = dr === 1 ? SIZE - 1 - j : dr === -1 ? j : i
      const c = dc === 1 ? SIZE - 1 - j : dc === -1 ? j : i
      nb[r][c] = merged[j] ?? 0
      if (nb[r][c] !== b[r][c]) moved = true
    }
  }
  return [nb, gained, moved]
}
function stuck(b: Board) {
  if (b.some((row) => row.some((v) => v === 0))) return false
  for (const [dr, dc] of [[0, 1], [1, 0]] as const)
    for (let i = 0; i < SIZE; i++) for (let j = 0; j < SIZE - 1; j++) {
      const r1 = dr ? j : i, c1 = dr ? i : j, r2 = dr ? j + 1 : i, c2 = dr ? i : j + 1
      if (b[r1][c1] === b[r2][c2]) return false
    }
  return true
}

export default function G2048() {
  const cvRef = useRef<HTMLCanvasElement>(null)
  const boardRef = useRef<Board>(seedBoard())
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(() => { try { return Number(localStorage.getItem(LS_KEY)) || 0 } catch { return 0 } })
  const [over, setOver] = useState<'' | 'win' | 'lose'>('')
  const [flash, setFlash] = useState('')
  const wonRef = useRef(false)

  const draw = useCallback(() => {
    const ctx = cvRef.current!.getContext('2d')!
    const CELL = 96, GAP = 10
    ctx.fillStyle = '#0b0e14'
    ctx.fillRect(0, 0, 424, 424)
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      const v = boardRef.current[r][c]
      const x = GAP + c * (CELL + GAP), y = GAP + r * (CELL + GAP)
      ctx.fillStyle = v ? TONES[v] ?? '#f0a832' : 'rgba(232,227,216,.06)'
      ctx.beginPath(); ctx.roundRect(x, y, CELL, CELL, 10); ctx.fill()
      if (v) {
        ctx.fillStyle = inkFor(v)
        ctx.font = `700 ${v >= 1024 ? 34 : v >= 128 ? 40 : 46}px Consolas, monospace`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(String(v), x + CELL / 2, y + CELL / 2 + 2)
      }
    }
  }, [])

  const commit = useCallback((b: Board, gained: number) => {
    boardRef.current = b
    if (gained) {
      setScore((s) => {
        const ns = s + gained
        if (ns > best) { setBest(ns); try { localStorage.setItem(LS_KEY, String(ns)) } catch { /* ignore */ } }
        return ns
      })
      setFlash(`+${gained}`)
      setTimeout(() => setFlash(''), 500)
    }
    if (!wonRef.current && b.some((row) => row.some((v) => v >= 2048))) { wonRef.current = true; setOver('win') }
    else if (stuck(b)) setOver('lose')
    draw()
  }, [best, draw])

  const move = useCallback((dr: number, dc: number) => {
    if (over) return
    const [b, gained, moved] = slide(boardRef.current, dr, dc)
    if (!moved) return
    addTile(b)
    commit(b, gained)
  }, [over, commit])

  useEffect(() => {
    document.title = '2048 — NICE.BLOG 2.0'
    draw()
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault()
      if (k === 'arrowup' || k === 'w') move(-1, 0)
      else if (k === 'arrowdown' || k === 's') move(1, 0)
      else if (k === 'arrowleft' || k === 'a') move(0, -1)
      else if (k === 'arrowright' || k === 'd') move(0, 1)
    }
    window.addEventListener('keydown', onKey)
    const cv = cvRef.current!
    let tx = 0, ty = 0
    const ts = (e: TouchEvent) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY }
    const te = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty
      if (Math.hypot(dx, dy) < 24) return
      if (Math.abs(dx) > Math.abs(dy)) move(0, dx > 0 ? 1 : -1)
      else move(dy > 0 ? 1 : -1, 0)
    }
    cv.addEventListener('touchstart', ts, { passive: true })
    cv.addEventListener('touchend', te, { passive: true })
    return () => { window.removeEventListener('keydown', onKey); cv.removeEventListener('touchstart', ts); cv.removeEventListener('touchend', te) }
  }, [draw, move])

  const restart = () => {
    boardRef.current = seedBoard(); setScore(0); setOver(''); wonRef.current = false; draw()
  }

  return (
    <div className="g2048">
      <div className="gm-hud">
        <span>分数 <b className="mono">{score}</b></span>
        <span>最高 <b className="mono">{best}</b></span>
        {flash && <span className="gm-chain mono">{flash}</span>}
        <span className="gm-hud-ops"><button onClick={restart}>重开</button></span>
      </div>
      <div className="g2048-stage">
        <canvas ref={cvRef} width={424} height={424} className="g2048-cv" />
        {over && (
          <div className="gm-over">
            <div className="gm-over-title">{over === 'win' ? '2048!' : 'GAME OVER'}</div>
            <div className="mono">分数 {score}</div>
            {over === 'win' && <button onClick={() => setOver('')}>继续合并</button>}
            <button onClick={restart}>{over === 'win' ? '再来一局' : '重试'}</button>
          </div>
        )}
      </div>
      <p className="game-sub">方向键 / WASD / 滑动屏幕移动数字，相同数字相遇即合并。合成 2048 即胜利，之后还能继续冲分。</p>
    </div>
  )
}
