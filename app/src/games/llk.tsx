import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/* 连连看 —— 原生 JS + CSS。
 * 配对规则：同图案，且能在空格中找到一条「转角 ≤ 2」的连线。
 * 实现：把棋盘外围加一圈虚拟空格，对 (r,c) 之间做 BFS，
 *       每个状态携带方向与已用转角数，扩展超过 2 个转角剪枝。 */

const ROWS = 8, COLS = 12
const SYMBOLS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'.split('') // 25 种图案
const POOL_LEN = (ROWS * COLS) / 2 // 48 对

interface Pt { r: number; c: number }

/** 生成一局保证可解的牌面：先随机分配符号对，再验证；若无解则重排。 */
function dealBoard(): (string | null)[][] {
  for (let attempt = 0; attempt < 20; attempt++) {
    const pool: string[] = []
    for (let i = 0; i < POOL_LEN; i++) {
      const s = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
      pool.push(s, s)
    }
    /* Fisher-Yates 洗牌 */
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    const board: (string | null)[][] = []
    for (let r = 0; r < ROWS; r++) board.push(pool.slice(r * COLS, (r + 1) * COLS))
    if (findAnyPair(board)) return board
  }
  /* 兜底：交替填充（一定有大量横排可消） */
  const board: (string | null)[][] = []
  let k = 0
  for (let r = 0; r < ROWS; r++) {
    const row: (string | null)[] = []
    for (let c = 0; c < COLS; c++) {
      const s = SYMBOLS[Math.floor((k % POOL_LEN) / 2)]
      row.push(s); k++
    }
    board.push(row)
  }
  return board
}

/** BFS：两个同图案格之间是否存在转角 ≤ 2 的路径（经过的格子必须为空）。 */
function canLink(board: (string | null)[][], a: Pt, b: Pt): boolean {
  const H = ROWS + 2, W = COLS + 2
  const empty = (r: number, c: number) => {
    /* 虚拟边界环永远为空 */
    if (r < 0 || r >= H || c < 0 || c >= W) return false
    if (r === 0 || r === H - 1 || c === 0 || c === W - 1) return true
    return board[r - 1][c - 1] === null
  }
  const inb = (r: number, c: number) => r >= 0 && r < H && c >= 0 && c < W
  const src = { r: a.r + 1, c: a.c + 1 }
  const dst = { r: b.r + 1, c: b.c + 1 }
  /* best[d][r][c]：以方向 d 到达该格的最小转角数 */
  const DIRS: Pt[] = [{ r: -1, c: 0 }, { r: 1, c: 0 }, { r: 0, c: -1 }, { r: 0, c: 1 }]
  const best: number[][][] = Array.from({ length: 4 }, () =>
    Array.from({ length: H }, () => Array(W).fill(99)))
  type St = { r: number; c: number; d: number; turns: number }
  const queue: St[] = DIRS.map((_, d) => ({ r: src.r, c: src.c, d, turns: 0 }))
  for (const s of queue) best[s.d][s.r][s.c] = 0
  while (queue.length) {
    const st = queue.shift()!
    if (st.turns > 2 || best[st.d][st.r][st.c] < st.turns) continue
    if (st.r === dst.r && st.c === dst.c) return true
    for (let nd = 0; nd < 4; nd++) {
      const nt = st.turns + (nd === st.d ? 0 : 1)
      if (nt > 2) continue
      const nr = st.r + DIRS[nd].r, nc = st.c + DIRS[nd].c
      if (!inb(nr, nc)) continue
      if (!(nr === dst.r && nc === dst.c) && !empty(nr, nc)) continue
      if (nt < best[nd][nr][nc]) {
        best[nd][nr][nc] = nt
        queue.push({ r: nr, c: nc, d: nd, turns: nt })
      }
    }
  }
  return false
}

/** 全盘扫描：当前是否还有任何可消对；顺便可作为提示。 */
function findAnyPair(board: (string | null)[][]): [Pt, Pt] | null {
  const tiles: Pt[] = []
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (board[r][c]) tiles.push({ r, c })
  for (let i = 0; i < tiles.length; i++) for (let j = i + 1; j < tiles.length; j++) {
    const a = tiles[i], b = tiles[j]
    if (board[a.r][a.c] === board[b.r][b.c] && canLink(board, a, b)) return [a, b]
  }
  return null
}

function shuffleRemain(board: (string | null)[][]): (string | null)[][] {
  const vals = board.flat().filter((v): v is string => v !== null)
  for (let i = vals.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[vals[i], vals[j]] = [vals[j], vals[i]]
  }
  const next: (string | null)[][] = board.map((row) => row.map(() => null))
  let k = 0
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (board[r][c]) next[r][c] = vals[k++]
  return next
}

const SYM_CLASS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'k']

export default function Lianlian() {
  const [board, setBoard] = useState<(string | null)[][]>(() => dealBoard())
  const [picked, setPicked] = useState<Pt | null>(null)
  const [wrong, setWrong] = useState<Pt | null>(null)
  const [cleared, setCleared] = useState(0)
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [msg, setMsg] = useState('')
  const [shuffles, setShuffles] = useState(0)
  const msgTimer = useRef<number>(0)
  const left = useMemo(() => board.flat().filter(Boolean).length, [board])
  const won = left === 0

  useEffect(() => { document.title = '连连看 — NICE.BLOG 2.0' }, [])
  useEffect(() => {
    if (won) return
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => window.clearInterval(t)
  }, [won])

  const flash = useCallback((text: string) => {
    setMsg(text)
    window.clearTimeout(msgTimer.current)
    msgTimer.current = window.setTimeout(() => setMsg(''), 1800)
  }, [])

  /** 消除后检查死局：无可消对就自动洗牌剩余牌。 */
  const afterClear = useCallback((b: (string | null)[][]) => {
    if (b.flat().filter(Boolean).length === 0) return
    if (!findAnyPair(b)) {
      const shuffled = shuffleRemain(b)
      /* 洗完仍死局的极端情况直接再洗 */
      setBoard(findAnyPair(shuffled) ? shuffled : shuffleRemain(shuffled))
      setShuffles((n) => n + 1)
      flash('局面卡死，已自动洗牌')
    }
  }, [flash])

  const clickTile = (r: number, c: number) => {
    if (won || !board[r][c]) return
    if (picked && picked.r === r && picked.c === c) { setPicked(null); return }
    if (!picked) { setPicked({ r, c }); setWrong(null); return }
    const a = picked, b = { r, c }
    if (board[a.r][a.c] !== board[b.r][b.c] || !canLink(board, a, b)) {
      setWrong(b)
      setCombo(0)
      window.setTimeout(() => setWrong(null), 320)
      setPicked(b)
      return
    }
    const next = board.map((row) => row.slice())
    next[a.r][a.c] = null
    next[b.r][b.c] = null
    setBoard(next)
    setPicked(null)
    setCleared((n) => n + 2)
    const nc = combo + 1
    setCombo(nc)
    setScore((s) => s + 10 + (nc > 1 ? (nc - 1) * 5 : 0))
    afterClear(next)
  }

  const hint = () => {
    const pair = findAnyPair(board)
    if (!pair) { flash('没有可消的对了'); return }
    setPicked(pair[0])
    flash('提示一对，另一块与它同图案')
  }

  const restart = () => {
    setBoard(dealBoard()); setPicked(null); setCleared(0); setScore(0)
    setCombo(0); setSeconds(0); setShuffles(0); setMsg('')
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')

  return (
    <div className="llk">
      <div className="gm-hud">
        <span>剩余 <b className="mono">{left}</b></span>
        <span>已消 <b className="mono">{cleared}</b></span>
        <span>连击 <b className="mono">{combo}</b></span>
        <span>分数 <b className="mono">{score}</b></span>
        <span>用时 <b className="mono">{mm}:{ss}</b></span>
        {shuffles > 0 && <span>洗牌 <b className="mono">{shuffles}</b></span>}
        <span className="gm-hud-ops">
          <button onClick={hint} disabled={won}>提示</button>
          <button onClick={restart}>重开</button>
        </span>
      </div>

      {msg && <div className="gm-msg mono">{msg}</div>}
      {won && (
        <div className="gm-over">
          <div className="gm-over-title">CLEAR</div>
          <div className="mono">用时 {mm}:{ss} · 分数 {score}</div>
          <button onClick={restart}>再来一局</button>
        </div>
      )}

      <div className="llk-board" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
        {board.map((row, r) => row.map((v, c) => {
          const isPick = picked && picked.r === r && picked.c === c
          const isBad = wrong && wrong.r === r && wrong.c === c
          const cls = v ? `llk-tile on s${SYM_CLASS[SYMBOLS.indexOf(v) % SYM_CLASS.length]}` : 'llk-tile'
          return (
            <button
              key={`${r}-${c}`}
              className={`${cls}${isPick ? ' pick' : ''}${isBad ? ' bad' : ''}`}
              onClick={() => clickTile(r, c)}
              disabled={!v || won}
              aria-label={v ? `方块 ${v} 第${r + 1}行第${c + 1}列` : '空格'}
            >{v ?? ''}</button>
          )
        }))}
      </div>

      <p className="muted gm-tip mono">规则：点选两块同图案方块，若连线转角不超过 2 即消除。</p>
    </div>
  )
}
