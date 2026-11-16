import { useEffect, useMemo, useRef, useState } from 'react'

/* 扫雷 —— 轻量 DOM 网格实现。
 * 9×9、10 颗雷，首次点击必安全；点按翻开，长按（手机）/右键（桌面）插旗；
 * 翻开全部非雷格即胜利。计时器与最佳纪录存 localStorage。 */

const N = 9, MINES = 10
const LS_KEY = 'mines.best.v1'

interface Cell { mine: boolean; open: boolean; flag: boolean; n: number }

function genBoard(safeR: number, safeC: number): Cell[][] {
  const b: Cell[][] = Array.from({ length: N }, () =>
    Array.from({ length: N }, () => ({ mine: false, open: false, flag: false, n: 0 })))
  const banned = new Set<number>()
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const r = safeR + dr, c = safeC + dc
    if (r >= 0 && r < N && c >= 0 && c < N) banned.add(r * N + c)
  }
  let placed = 0
  while (placed < MINES) {
    const i = Math.floor(Math.random() * N * N)
    if (banned.has(i) || b[Math.floor(i / N)][i % N].mine) continue
    b[Math.floor(i / N)][i % N].mine = true
    placed++
  }
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    let n = 0
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc
      if (rr >= 0 && rr < N && cc >= 0 && cc < N && b[rr][cc].mine) n++
    }
    b[r][c].n = n
  }
  return b
}

const NUM_COLOR = ['', '#74bfe8', '#7bc96f', '#f0a832', '#e06c60', '#e06c60', '#4dd8e6', '#e8e3d8', '#8a92a6']

export default function Mines() {
  const [board, setBoard] = useState<Cell[][] | null>(null)
  const [state, setState] = useState<'' | 'win' | 'lose'>('')
  const [flags, setFlags] = useState(0)
  const [secs, setSecs] = useState(0)
  const [best, setBest] = useState(() => { try { return Number(localStorage.getItem(LS_KEY)) || 0 } catch { return 0 } })
  const flagMode = useRef(false)
  const holdTimer = useRef(0)
  const flaggedAt = useRef(0)
  const didWin = useRef(false)

  useEffect(() => {
    document.title = '扫雷 — NICE.BLOG 2.0'
    if (state || !board) return
    const iv = window.setInterval(() => setSecs((s) => s + 1), 1000)
    return () => window.clearInterval(iv)
  }, [state, board])

  const newGame = () => { setBoard(null); setState(''); setFlags(0); setSecs(0); didWin.current = false }

  /** 翻开（含空白扩散），返回更新后的棋盘 */
  const openCell = (b: Cell[][], r: number, c: number) => {
    const stack: [number, number][] = [[r, c]]
    while (stack.length) {
      const [cr, cc] = stack.pop()!
      const cell = b[cr][cc]
      if (cell.open || cell.flag) continue
      cell.open = true
      if (cell.n === 0 && !cell.mine) {
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const rr = cr + dr, cc2 = cc + dc
          if (rr >= 0 && rr < N && cc2 >= 0 && cc2 < N && !b[rr][cc2].open) stack.push([rr, cc2])
        }
      }
    }
  }

  const onCell = (r: number, c: number) => {
    if (state) return
    /* 首局：点击任意格直接生成保证安全的首翻棋盘并翻开 */
    if (!board) {
      const fresh = genBoard(r, c)
      openCell(fresh, r, c)
      setBoard(fresh)
      return
    }
    let b = board.map((row) => row.map((x) => ({ ...x })))
    const cell = b[r][c]
    /* 长按/旗子模式：插旗 */
    if (flagMode.current) {
      flagMode.current = false
      if (!cell.open) { cell.flag = !cell.flag; setFlags(b.flat().filter((x) => x.flag).length) }
      setBoard(b); return
    }
    if (cell.flag || cell.open) return
    if (b[r][c].mine) {
      b.flat().forEach((x) => { if (x.mine) x.open = true })
      setBoard(b); setState('lose'); return
    }
    openCell(b, r, c)
    const left = b.flat().filter((x) => !x.open && !x.mine).length
    setBoard(b)
    if (left === 0) {
      setState('win'); didWin.current = true
      setBest((p) => {
        const nb = p === 0 ? secs : Math.min(p, secs)
        try { localStorage.setItem(LS_KEY, String(nb)) } catch { /* ignore */ }
        return nb
      })
    }
  }

  const startHold = (r: number, c: number) => {
    holdTimer.current = window.setTimeout(() => { flagMode.current = true; flaggedAt.current = Date.now(); onCell(r, c) }, 380)
  }
  const cancelHold = () => window.clearTimeout(holdTimer.current)

  const mineCount = useMemo(() => board?.flat().filter((x) => x.mine).length ?? MINES, [board])
  const display = board ? mineCount - flags : MINES

  return (
    <div className="mines">
      <div className="gm-hud">
        <span>💣 <b className="mono">{display}</b></span>
        <span>⏱ <b className="mono">{String(Math.floor(secs / 60)).padStart(2, '0')}:{String(secs % 60).padStart(2, '0')}</b></span>
        <span>最佳 <b className="mono">{best ? `${best}s` : '—'}</b></span>
        <span className="gm-hud-ops"><button onClick={newGame}>新局</button></span>
      </div>
      <div className="mines-grid" onContextMenu={(e) => e.preventDefault()}>
        {Array.from({ length: N * N }, (_, i) => {
          const r = Math.floor(i / N), c = i % N
          const cell = board?.[r][c]
          const cls = ['mines-cell', cell?.open ? 'open' : '', cell?.flag ? 'flag' : '', cell?.mine && cell.open ? 'boom' : ''].join(' ').trim()
          return (
            <button key={i} className={cls}
              disabled={!!cell?.open}
              onPointerDown={() => startHold(r, c)}
              onPointerUp={cancelHold} onPointerLeave={cancelHold} onPointerCancel={cancelHold}
              onContextMenu={(e) => { e.preventDefault(); flagMode.current = true; flaggedAt.current = Date.now(); onCell(r, c) }}
              onClick={() => { if (Date.now() - flaggedAt.current < 400) return; onCell(r, c) }}
              aria-label={`格子 ${r + 1},${c + 1}${cell?.open ? `，数字 ${cell.n}` : ''}`}>
              {cell?.open
                ? cell.mine ? '💥' : cell.n ? <b style={{ color: NUM_COLOR[cell.n] }}>{cell.n}</b> : ''
                : cell?.flag ? '🚩' : ''}
            </button>
          )
        })}
        {!board && <div className="mines-veil mono">点击任意格开始 · 长按或右键插旗</div>}
      </div>
      {state && (
        <div className="gm-over mines-over">
          <div className="gm-over-title">{state === 'win' ? 'WIN' : 'GAME OVER'}</div>
          <div className="mono">{state === 'win' ? `用时 ${secs}s，排雷成功！` : '踩到雷了，再来一局'}</div>
          <button onClick={newGame}>{state === 'win' ? '再来一局' : '重试'}</button>
        </div>
      )}
      <p className="game-sub">9×9 共 10 颗雷，首次点击保证安全。点按翻开数字格，长按（手机）或右键（桌面）插旗标记。</p>
    </div>
  )
}
