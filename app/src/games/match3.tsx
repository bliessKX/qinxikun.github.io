import { useCallback, useEffect, useRef, useState } from 'react'

/* 消消乐（三消）—— 原生 JS + CSS。
 * 数据模型：tiles 数组（id / color / row / col），绝对定位 + transform 过渡做下落动画。
 * 流程：选块 → 换位 → 成三消则「爆闪 → 落下 → 补块 → 级联」循环，否则弹回。
 * 死局检测：任意交换都无法成消时自动重排颜色。 */

const COLS = 8, ROWS = 8, COLORS = 6
const MOVES = 30, TARGET = 1500

interface Tile { id: number; color: number; row: number; col: number }

let uid = 1
const nextId = () => uid++

const rnd = () => Math.floor(Math.random() * COLORS)

function keyOf(t: { row: number; col: number }) { return t.row * COLS + t.col }

/** 生成不含初始三连的满盘。 */
function newTiles(): Tile[] {
  const tiles: Tile[] = []
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    let color = rnd()
    /* 避免开局横竖三连 */
    for (let guard = 0; guard < 20; guard++) {
      const h2 = tiles.find((t) => t.row === r && t.col === c - 1 && t.color === color)
        && tiles.find((t) => t.row === r && t.col === c - 2 && t.color === color)
      const v2 = tiles.find((t) => t.row === r - 1 && t.col === c && t.color === color)
        && tiles.find((t) => t.row === r - 2 && t.col === c && t.color === color)
      if (!h2 && !v2) break
      color = rnd()
    }
    tiles.push({ id: nextId(), color, row: r, col: c })
  }
  return tiles
}

/** 找出所有 ≥3 连的组，返回命中的 tile id 集合。 */
function findMatches(tiles: Tile[]): Set<number> {
  const grid = new Map<number, Tile>()
  tiles.forEach((t) => grid.set(keyOf(t), t))
  const hit = new Set<number>()
  /* 横向 */
  for (let r = 0; r < ROWS; r++) {
    let run = 1
    for (let c = 1; c <= COLS; c++) {
      const prev = grid.get(r * COLS + c - 1)
      const cur = c < COLS ? grid.get(r * COLS + c) : undefined
      if (prev && cur && prev.color === cur.color) run++
      else {
        if (run >= 3) for (let k = c - run; k < c; k++) hit.add(grid.get(r * COLS + k)!.id)
        run = 1
      }
    }
  }
  /* 纵向 */
  for (let c = 0; c < COLS; c++) {
    let run = 1
    for (let r = 1; r <= ROWS; r++) {
      const prev = grid.get((r - 1) * COLS + c)
      const cur = r < ROWS ? grid.get(r * COLS + c) : undefined
      if (prev && cur && prev.color === cur.color) run++
      else {
        if (run >= 3) for (let k = r - run; k < r; k++) hit.add(grid.get(k * COLS + c)!.id)
        run = 1
      }
    }
  }
  return hit
}

const adjacent = (a: Tile, b: Tile) => Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1

/** 死局检测：存在一次交换使得 findMatches 非空。 */
function hasAnyMove(tiles: Tile[]): boolean {
  const grid = new Map<number, Tile>()
  tiles.forEach((t) => grid.set(keyOf(t), t))
  for (const t of tiles) {
    for (const [dr, dc] of [[0, 1], [1, 0]] as const) {
      const other = grid.get((t.row + dr) * COLS + (t.col + dc))
      if (!other) continue
      const swapped = tiles.map((x) =>
        x.id === t.id ? { ...x, row: other.row, col: other.col }
          : x.id === other.id ? { ...x, row: t.row, col: t.col } : x)
      if (findMatches(swapped).size > 0) return true
    }
  }
  return false
}

const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms))

export default function Match3() {
  const [tiles, setTiles] = useState<Tile[]>(() => {
    for (let i = 0; i < 30; i++) { const t = newTiles(); if (hasAnyMove(t)) return t }
    return newTiles()
  })
  const [picked, setPicked] = useState<Tile | null>(null)
  const [popping, setPopping] = useState<Set<number>>(new Set())
  const [score, setScore] = useState(0)
  const [moves, setMoves] = useState(MOVES)
  const [chain, setChain] = useState(0)
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState<'' | 'win' | 'lose'>('')
  const [msg, setMsg] = useState('')
  const busyRef = useRef(false)

  useEffect(() => { document.title = '消消乐 — NICE.BLOG 2.0' }, [])

  /** 级联结算：爆闪 → 下落补块 → 再查，直到无消。返回本次结算总分。 */
  const resolve = useCallback(async (start: Tile[]): Promise<number> => {
    let current = start
    let n = 0
    let gained = 0
    for (;;) {
      const hit = findMatches(current)
      if (hit.size === 0) break
      n++
      setChain(n)
      setPopping(hit)
      await sleep(200)
      /* 计分：每块 15 分 × 连锁级数 */
      const gain = hit.size * 15 * n
      gained += gain
      setScore((s) => s + gain)
      current = current.filter((t) => !hit.has(t.id))
      /* 按列下落 */
      const next: Tile[] = []
      for (let c = 0; c < COLS; c++) {
        const col = current.filter((t) => t.col === c).sort((a, b) => b.row - a.row)
        col.forEach((t, i) => { t.row = ROWS - 1 - i; next.push(t) })
        /* 顶部补块：先放在棋盘上方，动画落下 */
        for (let r = col.length; r < ROWS; r++) {
          next.push({ id: nextId(), color: rnd(), row: r - ROWS, col: c })
        }
      }
      current = next
      setTiles(current.map((t) => ({ ...t })))
      setPopping(new Set())
      /* 让 React 先渲染到棋盘上方的位置，下一帧再落到目标行 */
      await sleep(30)
      current = current.map((t) => (t.row < 0 ? { ...t, row: t.row + ROWS } : t))
      setTiles(current.map((t) => ({ ...t })))
      await sleep(180)
    }
    setChain(0)
    /* 死局重排 */
    if (current.length === ROWS * COLS && !hasAnyMove(current)) {
      for (let i = 0; i < 20; i++) {
        const shuffled = current.map((t) => ({ ...t, color: rnd() }))
        if (findMatches(shuffled).size === 0 && hasAnyMove(shuffled)) {
          setTiles(shuffled); setMsg('死局，已重排颜色')
          setTimeout(() => setMsg(''), 1600)
          break
        }
      }
    }
    return gained
  }, [])

  const clickTile = (t: Tile) => {
    if (busyRef.current || over) return
    if (!picked) { setPicked(t); return }
    if (picked.id === t.id) { setPicked(null); return }
    if (!adjacent(picked, t)) { setPicked(t); return }
    /* 交换尝试 */
    const a = picked, b = t
    const swapped = tiles.map((x) =>
      x.id === a.id ? { ...x, row: b.row, col: b.col } : x.id === b.id ? { ...x, row: a.row, col: a.col } : x)
    setPicked(null)
    if (findMatches(swapped).size === 0) {
      /* 无效交换：先展示交换再弹回 */
      busyRef.current = true; setBusy(true)
      setTiles(swapped)
      await1()
      async function await1() {
        await sleep(160)
        setTiles(tiles.map((x) => ({ ...x })))
        busyRef.current = false; setBusy(false)
      }
      return
    }
    const nextMoves = moves - 1
    setMoves(nextMoves)
    busyRef.current = true; setBusy(true)
    setTiles(swapped)
    void (async () => {
      await sleep(160)
      const gained = await resolve(swapped)
      busyRef.current = false; setBusy(false)
      const finalScore = score + gained
      if (finalScore >= TARGET) setOver('win')
      else if (nextMoves <= 0) setOver('lose')
    })()
  }

  const restart = () => {
    busyRef.current = false; setBusy(false)
    setTiles(newTiles()); setPicked(null); setScore(0); setMoves(MOVES); setOver(''); setChain(0)
  }

  return (
    <div className="m3">
      <div className="gm-hud">
        <span>分数 <b className="mono">{score}</b><i className="mono gm-target"> / {TARGET}</i></span>
        <span>步数 <b className="mono">{moves}</b></span>
        {chain > 1 && <span className="gm-chain mono">连锁 ×{chain}</span>}
        <span className="gm-hud-ops">
          <button onClick={restart}>重开</button>
        </span>
      </div>
      {msg && <div className="gm-msg mono">{msg}</div>}

      <div className={`m3-board${busy ? ' busy' : ''}`}>
        {tiles.map((t) => (
          <div
            key={t.id}
            className={`m3-tile c${t.color}${popping.has(t.id) ? ' pop' : ''}${picked && picked.id === t.id ? ' pick' : ''}`}
            style={{ transform: `translate(${t.col * 100}%, ${t.row * 100}%)` }}
            onClick={() => clickTile(t)}
            role="button" aria-label={`方块 颜色${t.color + 1}`}
          />
        ))}
        {over && (
          <div className="gm-over">
            <div className="gm-over-title">{over === 'win' ? 'WIN' : 'GAME OVER'}</div>
            <div className="mono">分数 {score} · 剩余步数 {moves}</div>
            <button onClick={restart}>再来一局</button>
          </div>
        )}
      </div>
      <p className="muted gm-tip mono">点两块相邻方块交换位置，凑成三连即消除；连锁下落会翻倍计分。</p>
    </div>
  )
}
