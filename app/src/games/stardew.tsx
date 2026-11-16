import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as RPointerEvent } from 'react'

/* 星露谷 · 农场模拟（纯前端 v3）—— 原生 JS + CSS + localStorage。
 * 相对 v2 的升级：
 *   - 农场扩建 14×10：东侧竖河 + 小桥，河边钓鱼（河鱼与塘鱼不同）；
 *   - 矿洞 2.0：10×8 可走动大地图（岩壁/矿石血量/梯子下层/出口），层数越深矿越好；
 *   - 天气系统：晴/多云/雨/雷暴/下雪，雨天自动浇地、雷暴劈作物、冬天雪覆盖；
 *   - 四季轮转：每季 14 天，春草多 / 夏晴晒 / 秋价高 / 冬雪封田；
 *   - 建造线：斧头砍树得木头，木+石升级房子 4 级，铁矿打造铁镐/铁斧/铁锄；
 *   - 体力系统：干活消耗体力，睡觉恢复，房子越好体力上限越高。
 * 全部状态自动存 localStorage，刷新不丢。 */

const COLS = 14, ROWS = 10, TILE = 52
const SAVE_KEY = 'stardew.save.v3'
const SEASONS = ['春', '夏', '秋', '冬']
const DAYS_PER_SEASON = 14

const RIVER_C = 10                            // 河所在的列（竖河）
const BRIDGE = { r: 4, c: RIVER_C }           // 小桥
const POND = { r0: 8, c0: 12, h: 2, w: 2 }    // 右下角池塘
const CAVE = { r: 0, c: 1 }                   // 矿洞入口
const HOUSE = { r: 0, c: 5 }                  // 房子
const NPC = { r: 0, c: COLS - 1 }             // 村民
const QUEST_WEED = 3

const MCOLS = 10, MROWS = 8                   // 矿洞地图尺寸

type Ground = 'grass' | 'soil' | 'water' | 'bridge'
type CropId = 'radish' | 'potato' | 'strawberry' | 'pumpkin'
const CROPS: Record<CropId, { name: string; emoji: string; stages: string[]; sell: number }> = {
  radish:     { name: '萝卜',   emoji: '🥕', stages: ['🌱', '🌿', '🥕'],        sell: 30 },
  potato:     { name: '土豆',   emoji: '🥔', stages: ['🌱', '🌿', '🥔'],        sell: 45 },
  strawberry: { name: '草莓',   emoji: '🍓', stages: ['🌱', '🌿', '🌸', '🍓'], sell: 80 },
  pumpkin:    { name: '南瓜',   emoji: '🎃', stages: ['🌱', '🌿', '🌾', '🎃'],  sell: 120 },
}
type ToolId = 'hoe' | 'axe' | 'water' | 'seed' | 'harvest' | 'weed' | 'clear' | 'net' | 'sieve'
const TOOLS: { id: ToolId; name: string; icon: string; key: string }[] = [
  { id: 'hoe',     name: '锄头',   icon: '⛏️', key: '1' },
  { id: 'axe',     name: '斧头',   icon: '🪓', key: '2' },
  { id: 'water',   name: '水壶',   icon: '💧', key: '3' },
  { id: 'seed',    name: '播种',   icon: '🌱', key: '4' },
  { id: 'harvest', name: '收获',   icon: '🌾', key: '5' },
  { id: 'weed',    name: '除草',   icon: '🍂', key: '6' },
  { id: 'clear',   name: '铲除',   icon: '❌', key: '7' },
  { id: 'net',     name: '捕虫网', icon: '🦋', key: '8' },
  { id: 'sieve',   name: '捕虾篓', icon: '🦐', key: '9' },
]

type WeatherId = 'sunny' | 'cloudy' | 'rain' | 'storm' | 'snow'
const WEATHERS: Record<WeatherId, { name: string; icon: string }> = {
  sunny: { name: '晴', icon: '☀️' }, cloudy: { name: '多云', icon: '⛅' },
  rain: { name: '下雨', icon: '🌧️' }, storm: { name: '雷暴雨', icon: '⛈️' },
  snow: { name: '下雪', icon: '🌨️' },
}
const WEATHER_TABLE: Record<number, [WeatherId, number][]> = {
  0: [['sunny', 40], ['cloudy', 25], ['rain', 25], ['storm', 10]],          // 春：多雨催芽
  1: [['sunny', 45], ['cloudy', 20], ['rain', 20], ['storm', 15]],          // 夏：烈日与雷雨
  2: [['sunny', 35], ['cloudy', 40], ['rain', 20], ['storm', 5]],           // 秋：天高云淡
  3: [['sunny', 30], ['cloudy', 30], ['snow', 40]],                         // 冬：雪
}
function rollWeather(season: number): WeatherId {
  const table = WEATHER_TABLE[season] ?? WEATHER_TABLE[0]
  const tot = table.reduce((a, [, w]) => a + w, 0)
  let x = Math.random() * tot
  for (const [id, w] of table) { if ((x -= w) <= 0) return id }
  return 'sunny'
}

/* 矿洞地块 */
type MineType = 'floor' | 'wall' | 'rock' | 'copper' | 'iron' | 'gold' | 'geode' | 'ladder' | 'exit'
const MINE_LOOT: Partial<Record<MineType, { name: string; gold: number; icon: string; hp: number }>> = {
  rock:   { name: '石头', gold: 2,   icon: '🪨', hp: 2 },
  copper: { name: '铜矿', gold: 15,  icon: '🟤', hp: 2 },
  iron:   { name: '铁矿', gold: 35,  icon: '⛓️', hp: 3 },
  gold:   { name: '金矿', gold: 80,  icon: '🟡', hp: 3 },
  geode:  { name: '晶洞', gold: 120, icon: '💎', hp: 4 },
}
interface MineTile { type: MineType; hp: number }
interface Mine { level: number; grid: MineTile[][]; px: number; py: number }

/* 房子 4 级 + 工具升级 */
const HOUSE_LEVELS = [
  { name: '旧帐篷', icon: '⛺', cost: null as null | { wood: number; stone: number; iron: number; gold: number } },
  { name: '木屋',   icon: '🛖', cost: { wood: 25, stone: 15, iron: 0, gold: 0 },   bonus: '体力上限 +30，睡觉全恢复' },
  { name: '石屋',   icon: '🏠', cost: { wood: 50, stone: 50, iron: 5, gold: 0 },   bonus: '体力上限 +30，作物售价 +15%' },
  { name: '大宅',   icon: '🏰', cost: { wood: 90, stone: 80, iron: 10, gold: 5 },  bonus: '体力上限 +50，售价 +15%，每天补贴 30💰' },
]
const UPGRADES = {
  pick: { name: '铁镐', icon: '⚒️', cost: { wood: 10, stone: 0, iron: 5, gold: 0 }, desc: '矿洞敲击力 ×2（一击碎石，矿石减半击）' },
  axe:  { name: '铁斧', icon: '🪚', cost: { wood: 8,  stone: 0, iron: 3, gold: 0 }, desc: '砍树力 ×2（两斧放倒大树）' },
  hoe:  { name: '铁锄', icon: '🥄', cost: { wood: 8,  stone: 0, iron: 4, gold: 0 }, desc: '锄地一次翻 3×3' },
}

interface Crop { id: CropId; stage: number; wateredToday: boolean }
interface Tile { ground: Ground; watered: boolean; crop: Crop | null; weed: boolean; butterfly?: boolean; tree: number }
interface Save {
  tiles: Tile[][]; day: number; season: number; year: number; gold: number
  inv: Record<string, number>
  player: { gx: number; gy: number; face: string }
  weedsCleared: number; questDone: boolean
  mine: Mine | null
  energy: number; maxEnergy: number
  houseLv: number
  upgrades: { pick: boolean; axe: boolean; hoe: boolean }
  weather: WeatherId
}

const key = (r: number, c: number) => `${r}-${c}`
const isPond = (r: number, c: number) => r >= POND.r0 && r < POND.r0 + POND.h && c >= POND.c0 && c < POND.c0 + POND.w
const isRiver = (r: number, c: number) => c === RIVER_C && r !== BRIDGE.r
const isBridge = (r: number, c: number) => r === BRIDGE.r && c === RIVER_C
const isCave = (r: number, c: number) => r === CAVE.r && c === CAVE.c
const isHouse = (r: number, c: number) => r === HOUSE.r && c === HOUSE.c
const isNpc = (r: number, c: number) => r === NPC.r && c === NPC.c

const TREE_INIT = 3
function emptyFarm(): Tile[][] {
  const g: Tile[][] = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => ({
      ground: (isPond(r, c) || isRiver(r, c) ? 'water' : isBridge(r, c) ? 'bridge' : 'grass') as Ground,
      watered: false, crop: null, weed: false, tree: 0,
    })))
  /* 撒 5 棵树（避开特殊地块） */
  let placed = 0, guard = 0
  while (placed < 5 && guard++ < 200) {
    const r = Math.floor(Math.random() * ROWS), c = Math.floor(Math.random() * COLS)
    const t = g[r][c]
    if (t.ground === 'grass' && !isCave(r, c) && !isHouse(r, c) && !isNpc(r, c) && t.tree === 0) {
      t.tree = TREE_INIT; placed++
    }
  }
  return g
}

function genMineFloor(level: number): Mine {
  const grid: MineTile[][] = Array.from({ length: MROWS }, (_, r) =>
    Array.from({ length: MCOLS }, (_, c) => {
      const wall = r === 0 || c === 0 || r === MROWS - 1 || c === MCOLS - 1
      return { type: wall ? 'wall' : 'floor', hp: 0 }
    }))
  /* 内部零散岩壁簇 */
  for (let i = 0; i < 3; i++) {
    const r = 1 + Math.floor(Math.random() * (MROWS - 2)), c = 1 + Math.floor(Math.random() * (MCOLS - 2))
    if (grid[r][c].type === 'floor') grid[r][c].type = 'wall'
    const [[dr, dc]] = [[0, 1], [1, 0], [0, -1]].sort(() => Math.random() - 0.5)
    const rr = r + dr, cc = c + dc
    if (grid[rr]?.[cc] && grid[rr][cc].type === 'floor') grid[rr][cc].type = 'wall'
  }
  /* 出口固定底部中间；玩家出生在出口上方 */
  const exitR = MROWS - 2, exitC = MCOLS >> 1
  grid[exitR][exitC] = { type: 'exit', hp: 0 }
  /* 矿石按层数加权 */
  const pool: MineType[] = ['rock', 'rock', 'rock', 'rock']
  if (level >= 1) pool.push('copper', 'copper')
  if (level >= 2) pool.push('iron', 'iron')
  if (level >= 3) pool.push('gold', 'geode')
  if (level >= 5) pool.push('gold', 'gold', 'geode')
  let nodes = 0, guard = 0
  const target = 16
  while (nodes < target && guard++ < 500) {
    const r = 1 + Math.floor(Math.random() * (MROWS - 2)), c = 1 + Math.floor(Math.random() * (MCOLS - 2))
    if (grid[r][c].type !== 'floor') continue
    const type = pool[Math.floor(Math.random() * pool.length)]
    grid[r][c] = { type, hp: MINE_LOOT[type]?.hp ?? 1 }
    nodes++
  }
  /* 一部梯子 */
  guard = 0
  for (;;) {
    const r = 1 + Math.floor(Math.random() * (MROWS - 2)), c = 1 + Math.floor(Math.random() * (MCOLS - 2))
    if (grid[r][c].type === 'floor') { grid[r][c] = { type: 'ladder', hp: 0 }; break }
    if (guard++ > 300) break
  }
  return { level, grid, px: exitR - 1, py: exitC }
}

function normalizeTile(t: any): Tile {
  const g: Ground = ['soil', 'water', 'bridge'].includes(t?.ground) ? t.ground : 'grass'
  return {
    ground: g, watered: !!t?.watered,
    crop: t?.crop ? { id: t.crop.id, stage: t.crop.stage | 0, wateredToday: !!t.crop.wateredToday } : null,
    weed: !!t?.weed,
    tree: Math.max(0, (t?.tree | 0) || 0),
  }
}

function loadSave(): Save | null {
  try {
    let raw = localStorage.getItem(SAVE_KEY)
    if (!raw) {
      /* v2 老档迁移：农场扩建了，保留金币/天数/背包等标量，地块重新生成 */
      const old = localStorage.getItem('stardew.save.v2')
      if (old) {
        const s = JSON.parse(old)
        raw = JSON.stringify({
          tiles: emptyFarm(), day: s.day, season: s.season, year: s.year,
          gold: s.gold, inv: s.inv, weedsCleared: s.weedsCleared, questDone: s.questDone,
        })
      }
    }
    if (!raw) return null
    const s = JSON.parse(raw)
    if (!Array.isArray(s?.tiles) || s.tiles.length !== ROWS || s.tiles[0]?.length !== COLS) return null
    return {
      tiles: s.tiles.map((row: any[]) => row.map(normalizeTile)),
      day: s.day | 0 || 1, season: s.season | 0 || 0, year: s.year | 0 || 1,
      gold: (s.gold ?? 200) | 0, inv: s.inv ?? {},
      player: s.player ?? { gx: 5, gy: 5, face: 'down' },
      weedsCleared: s.weedsCleared | 0 || 0, questDone: !!s.questDone,
      mine: null, /* v3 矿洞结构不同，进洞时重新生成 */
      energy: s.energy ?? 100, maxEnergy: s.maxEnergy ?? 100,
      houseLv: Math.min(3, Math.max(0, s.houseLv | 0)),
      upgrades: { pick: !!s.upgrades?.pick, axe: !!s.upgrades?.axe, hoe: !!s.upgrades?.hoe },
      weather: WEATHERS[s.weather] ? s.weather : 'sunny',
    }
  } catch { return null }
}

/* ---------------- 钓鱼小游戏（塘 / 河两种鱼池） ---------------- */
function Fishing({ kind, onCatch, onClose }: { kind: 'pond' | 'river'; onCatch: (name: string, gold: number) => void; onClose: () => void }) {
  const FISH = kind === 'pond'
    ? [{ name: '鲈鱼', gold: 30, w: 40 }, { name: '鲑鱼', gold: 60, w: 25 }, { name: '河豚', gold: 90, w: 18 }, { name: '传说之鱼', gold: 200, w: 4 }]
    : [{ name: '小银鱼', gold: 25, w: 42 }, { name: '锦鲤', gold: 55, w: 28 }, { name: '娃娃鱼', gold: 120, w: 18 }, { name: '河流传说', gold: 260, w: 4 }]
  const [s, setS] = useState({ fish: 0.5, fishV: 0.22, bar: 0.5, prog: 0, time: 22, won: false, lost: false, hold: false })
  const st = useRef(s); st.current = s
  const pick = useCallback(() => {
    const tot = FISH.reduce((a, f) => a + f.w, 0); let x = Math.random() * tot
    for (const f of FISH) { if ((x -= f.w) <= 0) return f } return FISH[0]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    let raf = 0, last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now
      const cur = st.current
      if (cur.won || cur.lost) return
      let fish = cur.fish + cur.fishV * dt
      let fv = cur.fishV
      if (fish > 0.96) { fish = 0.96; fv = -cur.fishV }
      else if (fish < 0.04) { fish = 0.04; fv = -cur.fishV }
      if (Math.random() < 0.012) fv = (Math.random() - 0.5) * 0.9
      let bar = cur.bar + (cur.hold ? -0.85 : 0.62) * dt
      bar = Math.max(0.08, Math.min(0.92, bar))
      const inBar = Math.abs(fish - bar) < 0.15
      let prog = cur.prog + (inBar ? 0.55 : -0.8) * dt
      let time = cur.time - dt
      const won = prog >= 1, lost = time <= 0
      setS({ fish, fishV: fv, bar, prog: Math.max(0, Math.min(1, prog)), time: Math.max(0, time), won, lost, hold: cur.hold })
      if (won) { const f = pick(); setTimeout(() => onCatch(f.name, f.gold), 350) }
      else if (lost) setTimeout(onClose, 500)
      else raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const setHold = (v: boolean) => setS((p) => ({ ...p, hold: v }))
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === 'Space') { e.preventDefault(); setHold(true) } }
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') { e.preventDefault(); setHold(false) } }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const pct = (n: number) => `${n * 100}%`
  return (
    <div className="sd-modal" onClick={onClose}>
      <div className="sd-fish" onClick={(e) => e.stopPropagation()}>
        <div className="sd-fish-head">
          <b>🎣 {kind === 'pond' ? '池塘垂钓' : '河边垂钓'}</b>
          <span className="mono">⏱ {s.time.toFixed(1)}s</span>
          <button className="sd-x" onClick={onClose}>✕</button>
        </div>
        <p className="sd-fish-tip">按住 <b>空格 / 鼠标</b> 上提渔网，松开下沉，把鱼儿稳定在绿区内填满进度条。</p>
        <div className="sd-fish-track"
          onMouseDown={() => setHold(true)} onMouseUp={() => setHold(false)} onMouseLeave={() => setHold(false)}
          onTouchStart={(e) => { e.preventDefault(); setHold(true) }} onTouchEnd={() => setHold(false)}>
          <div className="sd-fish-bar" style={{ top: pct(s.bar - 0.15), height: '30%' }} />
          <div className="sd-fish-fish" style={{ top: pct(s.fish) }}>🐟</div>
          <div className="sd-fish-prog" style={{ height: pct(s.prog) }} />
        </div>
        <div className="sd-fish-foot mono">
          {s.won ? '🎉 上钩了！' : s.lost ? '💨 鱼跑了…' : '稳住节奏…'}
        </div>
      </div>
    </div>
  )
}

/* ---------------- 矿洞（10×8 可走动大地图） ---------------- */
function MineView({ mine, setMine, onLoot, onSwing, onExit, pickPower }: {
  mine: Mine
  setMine: (m: Mine) => void
  onLoot: (name: string, gold: number, icon: string) => void
  onSwing: (cost: number) => boolean     /* 消耗体力，返回是否允许 */
  onExit: () => void
  pickPower: number
}) {
  const [pos, setPos] = useState({ x: mine.px, y: mine.py })
  const [swing, setSwing] = useState<number | null>(null)
  const [hitFx, setHitFx] = useState(0)
  const posRef = useRef(pos); posRef.current = pos
  const busy = useRef(false)
  const mineRef = useRef(mine); mineRef.current = mine

  const walkable = (r: number, c: number) =>
    r >= 0 && r < MROWS && c >= 0 && c < MCOLS && mine.grid[r][c].type !== 'wall' && mine.grid[r][c].type !== 'rock' &&
    mine.grid[r][c].type !== 'copper' && mine.grid[r][c].type !== 'iron' && mine.grid[r][c].type !== 'gold' && mine.grid[r][c].type !== 'geode'

  /* 分段走路径：先横后竖，遇阻即停 */
  const pathTo = (tr: number, tc: number): [number, number][] => {
    const path: [number, number][] = []
    let { x, y } = posRef.current
    while (y !== tc) {
      y += Math.sign(tc - y)
      if (!walkable(x, y)) { y -= Math.sign(tc - y); break }
      path.push([x, y])
    }
    while (x !== tr) {
      x += Math.sign(tr - x)
      if (!walkable(x, y)) { x -= Math.sign(tr - x); break }
      path.push([x, y])
    }
    return path
  }

  const isOre = (t: MineType) => !!MINE_LOOT[t]
  const adjacent = (r: number, c: number) => Math.abs(r - posRef.current.x) + Math.abs(c - posRef.current.y) === 1

  const smash = (r: number, c: number) => {
    const cur = mineRef.current
    const tile = cur.grid[r][c]
    if (!isOre(tile.type) || tile.hp <= 0) return
    if (!onSwing(3)) return
    setSwing(r * MCOLS + c); setHitFx((n) => n + 1)
    const power = pickPower
    window.setTimeout(() => {
      setSwing(null)
      const grid = cur.grid.map((row) => row.map((t) => ({ ...t })))
      grid[r][c].hp -= 1
      if (grid[r][c].hp <= 0) {
        const loot = MINE_LOOT[tile.type]!
        grid[r][c] = { type: 'floor', hp: 0 }
        setMine({ ...cur, grid })
        onLoot(loot.name, loot.gold, loot.icon)
      } else {
        setMine({ ...cur, grid })
      }
    }, 300)
  }

  const onTileClick = (r: number, c: number) => {
    if (busy.current) return
    const tile = mineRef.current.grid[r][c]
    if (tile.type === 'exit') { onExit(); return }
    if (tile.type === 'wall') return
    if (tile.type === 'ladder') {
      /* 走到梯子格然后下层 */
      const p = pathTo(r, c)
      walkPath(p, () => setMine(genMineFloor(mineRef.current.level + 1)))
      return
    }
    if (isOre(tile.type)) {
      if (adjacent(r, c)) { smash(r, c); return }
      /* 走到矿石相邻的可达格再敲 */
      const spots: [number, number][] = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
        .filter(([rr, cc]) => walkable(rr, cc))
        .sort((a, b) => (Math.abs(a[0] - posRef.current.x) + Math.abs(a[1] - posRef.current.y)) - (Math.abs(b[0] - posRef.current.x) + Math.abs(b[1] - posRef.current.y)))
      for (const [sr, sc] of spots) {
        const p = pathTo(sr, sc)
        if (p.length && p[p.length - 1][0] === sr && p[p.length - 1][1] === sc) {
          walkPath(p, () => smash(r, c)); return
        }
      }
      return
    }
    /* 普通 floor：走过去 */
    const p = pathTo(r, c)
    walkPath(p)
  }

  const walkPath = (p: [number, number][], done?: () => void) => {
    if (!p.length) { done?.(); return }
    busy.current = true
    let i = 0
    const stepNext = () => {
      if (i >= p.length) { busy.current = false; done?.(); return }
      const [x, y] = p[i++]
      setPos({ x, y })
      window.setTimeout(stepNext, 150)
    }
    stepNext()
  }

  return (
    <div className="sd-modal" onClick={onExit}>
      <div className="sd-mine2" onClick={(e) => e.stopPropagation()}>
        <div className="sd-fish-head">
          <b>⛏️ 矿洞 · 第 {mine.level} 层</b>
          <span className="mono">点击地块移动 · 点矿石敲击 · 🔽下层 · 🚪出口</span>
          <button className="sd-x" onClick={onExit}>✕</button>
        </div>
        <div className="sd-mine-grid" style={{ width: MCOLS * 46, height: MROWS * 46 }}>
          {mine.grid.map((row, r) => row.map((t, c) => {
            const mineable = isOre(t.type)
            const cls = ['sd-mtile', `mt-${t.type}`, t.hp > 0 && t.hp < (MINE_LOOT[t.type]?.hp ?? 1) ? 'cracked' : '', swing === r * MCOLS + c ? 'swing' : ''].join(' ').trim()
            const icon = t.type === 'exit' ? '🚪' : t.type === 'ladder' ? '🔽' : MINE_LOOT[t.type]?.icon ?? ''
            return (
              <div key={`${r}-${c}`} className={cls}
                style={{ left: c * 46, top: r * 46, width: 46, height: 46 }}
                onClick={() => onTileClick(r, c)}>
                {mineable && <span className="sd-mhp mono">{t.hp > 0 ? '▪'.repeat(t.hp) : ''}</span>}
                <span className="sd-micon">{icon}</span>
                {hitFx > 0 && swing === r * MCOLS + c && <span className="sd-fx sd-fx-dust" />}
              </div>
            )
          }))}
          {/* 玩家（矿洞小人） */}
          <div className="sd-mplayer" style={{ left: pos.y * 46, top: pos.x * 46 }} />
        </div>
      </div>
    </div>
  )
}

/* ---------------- 主组件 ---------------- */
export default function Stardew() {
  const initial = useMemo(loadSave, [])
  const [tiles, setTiles] = useState<Tile[][]>(initial?.tiles ?? emptyFarm())
  const [day, setDay] = useState(initial?.day ?? 1)
  const [season, setSeason] = useState(initial?.season ?? 0)
  const [year, setYear] = useState(initial?.year ?? 1)
  const [gold, setGold] = useState(initial?.gold ?? 200)
  const [inv, setInv] = useState<Record<string, number>>(initial?.inv ?? {})
  const [tool, setTool] = useState<ToolId>('hoe')
  const [seed, setSeed] = useState<CropId>('radish')
  const [msg, setMsg] = useState('')
  const [face, setFace] = useState<string>(initial?.player?.face ?? 'down')
  const [gx, setGx] = useState(initial?.player?.gx ?? 5)
  const [gy, setGy] = useState(initial?.player?.gy ?? 5)
  const [walking, setWalking] = useState(false)
  const [fx, setFx] = useState<{ id: number; x: number; y: number; kind: string }[]>([])
  const [weedsCleared, setWeedsCleared] = useState(initial?.weedsCleared ?? 0)
  const [questDone, setQuestDone] = useState(initial?.questDone ?? false)
  const [mine, setMine] = useState<Mine | null>(initial?.mine ?? null)
  const [mode, setMode] = useState<'farm' | 'fish' | 'mine' | 'talk' | 'build'>('farm')
  const [talkIdx, setTalkIdx] = useState(0)
  const [weather, setWeather] = useState<WeatherId>(initial?.weather ?? 'sunny')
  const [energy, setEnergy] = useState(initial?.energy ?? 100)
  const [maxEnergy, setMaxEnergy] = useState(initial?.maxEnergy ?? 100)
  const [houseLv, setHouseLv] = useState(initial?.houseLv ?? 0)
  const [upgrades, setUpgrades] = useState(initial?.upgrades ?? { pick: false, axe: false, hoe: false })
  const [fishKind, setFishKind] = useState<'pond' | 'river'>('pond')

  const busy = useRef(false)
  const msgTimer = useRef(0)
  const fxId = useRef(0)
  const toolRef = useRef(tool); toolRef.current = tool
  const gxRef = useRef(gx); gxRef.current = gx
  const gyRef = useRef(gy); gyRef.current = gy
  const modeRef = useRef(mode); modeRef.current = mode
  const energyRef = useRef(energy); energyRef.current = energy
  const maxEnergyRef = useRef(maxEnergy); maxEnergyRef.current = maxEnergy
  const houseLvRef = useRef(houseLv); houseLvRef.current = houseLv
  const upgradesRef = useRef(upgrades); upgradesRef.current = upgrades
  const didInit = useRef(false)

  useEffect(() => { document.title = '星露谷 · 农场 — NICE.BLOG 2.0' }, [])

  useEffect(() => {
    const data: Save = {
      tiles, day, season, year, gold, inv,
      player: { gx, gy, face }, weedsCleared, questDone,
      mine: mode === 'mine' ? mine : mine,
      energy, maxEnergy, houseLv, upgrades, weather,
    }
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)) } catch { /* 隐私模式忽略 */ }
  }, [tiles, day, season, year, gold, inv, gx, gy, face, weedsCleared, questDone, mine, mode, energy, maxEnergy, houseLv, upgrades, weather])

  const flash = (text: string) => {
    setMsg(text); window.clearTimeout(msgTimer.current)
    msgTimer.current = window.setTimeout(() => setMsg(''), 1800)
  }
  const addFx = (r: number, c: number, kind: string) => {
    const id = ++fxId.current
    setFx((p) => [...p, { id, x: c * TILE + TILE / 2, y: r * TILE + TILE / 2, kind }])
    window.setTimeout(() => setFx((p) => p.filter((f) => f.id !== id)), 620)
  }
  const updateTile = (r: number, c: number, fn: (t: Tile) => Tile) =>
    setTiles((prev) => prev.map((row, ri) => ri !== r ? row : row.map((t, ci) => ci !== c ? t : fn(t))))

  const spend = (n: number) => {
    if (energyRef.current < n) { flash('😵 太累了，先睡觉或吃点东西吧'); return false }
    setEnergy((e) => e - n)
    return true
  }

  const spawnWeeds = useCallback((n: number) => {
    setTiles((prev) => {
      const flats: [number, number][] = []
      prev.forEach((row, r) => row.forEach((t, c) => {
        if (t.ground === 'grass' && !t.crop && !t.weed && t.tree === 0 && !isCave(r, c) && !isHouse(r, c) && !isNpc(r, c)) flats.push([r, c])
      }))
      if (flats.length === 0) return prev
      const next = prev.map((row) => row.map((t) => ({ ...t })))
      for (let i = 0; i < n && flats.length; i++) {
        const [r, c] = flats.splice(Math.floor(Math.random() * flats.length), 1)[0]
        next[r][c].weed = true
      }
      return next
    })
  }, [])

  const spawnButterflies = useCallback((n: number) => {
    setTiles((prev) => {
      const flats: [number, number][] = []
      prev.forEach((row, r) => row.forEach((t, c) => {
        if (t.ground === 'grass' && !t.crop && !t.weed && t.tree === 0 && !t.butterfly) flats.push([r, c])
      }))
      if (!flats.length) return prev
      const next = prev.map((row) => row.map((t) => ({ ...t })))
      for (let i = 0; i < n && flats.length; i++) {
        const [r, c] = flats.splice(Math.floor(Math.random() * flats.length), 1)[0]
        next[r][c].butterfly = true
      }
      return next
    })
  }, [])

  /* 首次进入：撒杂草与蝴蝶，让世界有点生气 */
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    setTiles((prev) => {
      if (prev.some((row) => row.some((t) => t.weed))) return prev
      const flats: [number, number][] = []
      prev.forEach((row, r) => row.forEach((t, c) => {
        if (t.ground === 'grass' && !t.crop && !t.weed && t.tree === 0) flats.push([r, c])
      }))
      if (!flats.length) return prev
      const next = prev.map((row) => row.map((t) => ({ ...t })))
      for (let i = 0; i < 2 && flats.length; i++) {
        const [r, c] = flats.splice(Math.floor(Math.random() * flats.length), 1)[0]
        next[r][c].weed = true
      }
      return next
    })
    spawnButterflies(2)
  }, [spawnButterflies])

  const sellBoost = () => (houseLvRef.current >= 2 ? 1.15 : 1)
  const seasonBoost = () => (season === 2 ? 1.25 : 1)   // 秋季丰收

  const applyTool = useCallback((r: number, c: number) => {
    const t = tiles[r][c]
    const isWinter = season === 3
    switch (toolRef.current) {
      case 'hoe': {
        if (t.ground === 'grass' && t.tree === 0 && !t.crop) {
          if (!spend(upgradesRef.current.hoe ? 8 : 3)) break
          if (upgradesRef.current.hoe) {
            /* 铁锄 3×3 */
            for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
              const rr = r + dr, cc = c + dc
              const tt = tiles[rr]?.[cc]
              if (tt && tt.ground === 'grass' && tt.tree === 0 && !tt.crop && !isCave(rr, cc) && !isHouse(rr, cc) && !isNpc(rr, cc)) {
                updateTile(rr, cc, (x) => ({ ...x, ground: 'soil', watered: false }))
                if (dr === 0 && dc === 0) addFx(rr, cc, 'dust')
              }
            }
            flash('铁锄翻好 3×3 地 ⛏️')
          } else {
            updateTile(r, c, (x) => ({ ...x, ground: 'soil', watered: false })); addFx(r, c, 'dust'); flash('翻好地了 ⛏️')
          }
        } else flash('这里翻不了地')
        break
      }
      case 'axe': {
        if (t.tree > 0) {
          if (!spend(4)) break
          const power = upgradesRef.current.axe ? 2 : 1
          const left = t.tree - power
          if (left <= 0) {
            const wood = 4 + Math.floor(Math.random() * 3)
            updateTile(r, c, (x) => ({ ...x, tree: 0 })); addFx(r, c, 'dust')
            setInv((p) => ({ ...p, 'mat:木头': (p['mat:木头'] ?? 0) + wood }))
            flash(`🪓 大树放倒！获得木头 ×${wood}`)
          } else {
            updateTile(r, c, (x) => ({ ...x, tree: left })); addFx(r, c, 'dust')
            flash(`砍树中…还差 ${left} 斧`)
          }
        } else flash('这里没有树（拿木头要去砍树）')
        break
      }
      case 'water':
        if (t.ground === 'soil') {
          if (!spend(2)) break
          updateTile(r, c, (x) => ({ ...x, watered: true, crop: x.crop ? { ...x.crop, wateredToday: true } : null })); addFx(r, c, 'water'); flash('浇水完成 💧')
        } else flash('只有土壤能浇水')
        break
      case 'seed':
        if (isWinter) { flash('❄️ 冬天土都冻住了，种不了庄稼'); break }
        if (t.ground === 'soil' && !t.crop && !t.weed) {
          if (!spend(1)) break
          updateTile(r, c, (x) => ({ ...x, crop: { id: seed, stage: 0, wateredToday: false } })); addFx(r, c, 'seed'); flash(`种下 ${CROPS[seed].name}`)
        } else flash('要先翻地、且这块没种东西')
        break
      case 'harvest': {
        if (t.crop && t.crop.stage >= CROPS[t.crop.id].stages.length - 1) {
          const crop = t.crop
          const gain = Math.round(CROPS[crop.id].sell * seasonBoost() * sellBoost())
          setGold((g) => g + gain); setInv((p) => ({ ...p, [crop.id]: (p[crop.id] ?? 0) + 1 }))
          updateTile(r, c, (x) => ({ ...x, crop: null, watered: false })); addFx(r, c, 'pop')
          flash(`收获 ${CROPS[crop.id].name} +${gain}💰`)
        } else flash('还没成熟，记得每天浇透水')
        break
      }
      case 'weed':
        if (t.weed) {
          if (!spend(3)) break
          updateTile(r, c, (x) => ({ ...x, weed: false })); addFx(r, c, 'dust')
          setGold((g) => g + 5); setWeedsCleared((w) => w + 1); flash('除草 +5💰')
        } else flash('这块没有杂草')
        break
      case 'clear':
        if (t.crop) { updateTile(r, c, (x) => ({ ...x, crop: null, watered: false })); flash('铲除了作物') }
        else if (t.ground === 'soil') { updateTile(r, c, (x) => ({ ...x, ground: 'grass', watered: false })); flash('恢复成草地') }
        else flash('没什么可铲的')
        break
      case 'net':
        if (t.butterfly) {
          if (!spend(2)) break
          updateTile(r, c, (x) => ({ ...x, butterfly: false })); addFx(r, c, 'pop')
          setGold((g) => g + 8); setInv((p) => ({ ...p, 'bug:butterfly': (p['bug:butterfly'] ?? 0) + 1 }))
          flash('捉到蝴蝶 +8💰')
        } else flash('这里没有蝴蝶（晴天河边草地上更多）')
        break
      case 'sieve': {
        const nearWater = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].some(([rr, cc]) => tiles[rr]?.[cc]?.ground === 'water')
        if (!nearWater) { flash('要站在水边才捞得到虾'); break }
        if (!spend(3)) break
        addFx(r, c, 'water')
        if (Math.random() < 0.45) {
          setGold((g) => g + 14); setInv((p) => ({ ...p, 'fish:河虾': (p['fish:河虾'] ?? 0) + 1 }))
          flash('捞到河虾 +14💰')
        } else flash('小虾溜走了…再试试')
        break
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles, seed, season])

  /* 移动到目标格（或相邻可站立格）后执行回调 */
  const moveTo = useCallback((r: number, c: number, cb?: () => void) => {
    if (busy.current || modeRef.current !== 'farm') return
    const tr = Math.max(0, Math.min(ROWS - 1, r)), tc = Math.max(0, Math.min(COLS - 1, c))
    if (tr === gxRef.current && tc === gyRef.current) { cb?.(); return }
    const dr = tr - gxRef.current, dc = tc - gyRef.current
    if (Math.abs(dr) > Math.abs(dc)) setFace(dr > 0 ? 'down' : 'up')
    else setFace(dc > 0 ? 'right' : 'left')
    busy.current = true; setWalking(true)
    setGx(tr); setGy(tc)
    window.setTimeout(() => { setWalking(false); busy.current = false; cb?.() }, 210)
  }, [])

  const freeTile = (r: number, c: number) =>
    r >= 0 && r < ROWS && c >= 0 && c < COLS &&
    tiles[r][c].ground !== 'water' && tiles[r][c].tree === 0 &&
    !isCave(r, c) && !isHouse(r, c) && !isNpc(r, c)
  const adjFree = (r: number, c: number): [number, number] => {
    const around = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
    for (const [a, b] of around) if (freeTile(a, b)) return [a, b]
    return [r, c]
  }
  const near = (r: number, c: number) => Math.abs(r - gxRef.current) + Math.abs(c - gyRef.current) <= 1
  const nearAnyWater = () => {
    /* 周围一圈有水即算：区分池塘与河 */
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const r = gxRef.current + dr, c = gyRef.current + dc
      if (tiles[r]?.[c]?.ground === 'water') { if (c === RIVER_C) return 'river' }
    }
    return 'pond'
  }

  const onTileClick = (r: number, c: number) => {
    if (modeRef.current !== 'farm') return
    if (isCave(r, c)) { const [a, b] = adjFree(r, c); moveTo(a, b, () => { setMine((m) => m ?? genMineFloor(1)); setMode('mine') }); return }
    if (isHouse(r, c)) { const [a, b] = adjFree(r, c); moveTo(a, b, () => setMode('build')); return }
    if (isNpc(r, c)) { const [a, b] = adjFree(r, c); moveTo(a, b, () => { setTalkIdx(0); setMode('talk') }); return }
    if (tiles[r][c].ground === 'water') { const [a, b] = adjFree(r, c); moveTo(a, b, () => flash('按 F 开始钓鱼 🎣')); return }
    moveTo(r, c, () => applyTool(r, c))
  }

  const sleepDay = () => {
    if (modeRef.current !== 'farm') return
    const isRain = weather === 'rain' || weather === 'storm'
    const isWinter = season === 3
    /* 雨天自动浇灌；冬天作物不长 */
    const next = tiles.map((row) => row.map((t) => {
      if (t.crop && (t.crop.wateredToday || isRain) && !isWinter) {
        const max = CROPS[t.crop.id].stages.length - 1
        return { ...t, crop: { ...t.crop, stage: Math.min(t.crop.stage + 1, max), wateredToday: false }, watered: false }
      }
      return { ...t, watered: false, crop: t.crop ? { ...t.crop, wateredToday: false } : null }
    }))
    setTiles(next)
    let nd = day + 1, ns = season, ny = year
    if (nd > DAYS_PER_SEASON) { nd = 1; ns = (season + 1) % 4; if (ns === 0) ny++ }
    setDay(nd); setSeason(ns); setYear(ny)
    const nw = rollWeather(ns)
    setWeather(nw)
    /* 体力恢复 + 大宅补贴 */
    setEnergy(maxEnergyRef.current)
    if (houseLvRef.current >= 3) setGold((g) => g + 30)
    /* 杂草：春×2；树重新长；蝴蝶 */
    spawnWeeds((season === 0 ? 4 : 2) + Math.floor(Math.random() * 2))
    spawnButterflies(weather === 'sunny' ? 2 + Math.floor(Math.random() * 2) : 1)
    /* 雷暴劈作物 */
    let stormMsg = ''
    if (weather === 'storm' && Math.random() < 0.4) {
      const hit: [number, number][] = []
      next.forEach((row, r) => row.forEach((t, c) => { if (t.crop) hit.push([r, c]) }))
      if (hit.length) {
        const [hr, hc] = hit[Math.floor(Math.random() * hit.length)]
        setTiles((prev) => prev.map((row, ri) => ri !== hr ? row : row.map((tt, ci) => ci !== hc ? tt : { ...tt, crop: null })))
        stormMsg = ' ⚡昨夜雷暴劈坏了一株庄稼！'
      }
    }
    const wInfo = WEATHERS[nw]
    flash(`${wInfo.icon} 第 ${nd} 天 · ${SEASONS[ns]} · ${wInfo.name}${isRain && !isWinter ? ' · 雨水浇透了田地 💧' : ''}${isWinter ? ' · 田地封冻，庄稼停长' : ''} ${stormMsg}`)
  }

  const reset = () => {
    if (!window.confirm('确定重置农场？矿洞、房子与全部进度会清空。')) return
    setTiles(emptyFarm()); setDay(1); setSeason(0); setYear(1); setGold(200); setInv({})
    setGx(5); setGy(5); setFace('down'); setWeedsCleared(0); setQuestDone(false); setMine(null); setMsg('')
    setEnergy(100); setMaxEnergy(100); setHouseLv(0); setUpgrades({ pick: false, axe: false, hoe: false })
    setWeather('sunny'); spawnWeeds(2)
  }

  const openFish = () => { setFishKind(nearAnyWater()); setMode('fish') }
  const onCatch = (name: string, g: number) => { setGold((x) => x + g); setInv((p) => ({ ...p, [`fish:${name}`]: (p[`fish:${name}`] ?? 0) + 1 })); flash(`钓到 ${name} +${g}💰`); setMode('farm') }
  const onLoot = (name: string, g: number, icon: string) => { setGold((x) => x + g); setInv((p) => ({ ...p, [`ore:${name}`]: (p[`ore:${name}`] ?? 0) + 1 })); flash(`${icon} ${name} +${g}💰`) }

  /* 建造与升级 */
  const matCost = (cost: { wood: number; stone: number; iron: number; gold: number }) =>
    (inv['mat:木头'] ?? 0) >= cost.wood && (inv['ore:石头'] ?? 0) >= cost.stone && (inv['ore:铁矿'] ?? 0) >= cost.iron && gold >= cost.gold
  const payCost = (cost: { wood: number; stone: number; iron: number; gold: number }) => {
    setInv((p) => ({
      ...p,
      'mat:木头': Math.max(0, (p['mat:木头'] ?? 0) - cost.wood),
      'ore:石头': Math.max(0, (p['ore:石头'] ?? 0) - cost.stone),
      'ore:铁矿': Math.max(0, (p['ore:铁矿'] ?? 0) - cost.iron),
    }))
    setGold((g) => g - cost.gold)
  }
  const upgradeHouse = () => {
    const next = HOUSE_LEVELS[houseLv + 1]
    if (!next?.cost) return
    if (!matCost(next.cost)) { flash('材料不够，去砍树、挖矿吧'); return }
    payCost(next.cost)
    const lv = houseLv + 1
    setHouseLv(lv)
    setMaxEnergy(100 + (lv >= 1 ? 30 : 0) + (lv >= 2 ? 30 : 0) + (lv >= 3 ? 50 : 0))
    flash(`${next.icon} 升级成功：${next.name}！`)
  }
  const buyUpgrade = (id: 'pick' | 'axe' | 'hoe') => {
    if (upgrades[id]) return
    const u = UPGRADES[id]
    if (!matCost(u.cost)) { flash('材料不够：需要 铁×' + u.cost.iron + ' 木×' + u.cost.wood); return }
    payCost(u.cost)
    setUpgrades((p) => ({ ...p, [id]: true }))
    flash(`${u.icon} 打造完成：${u.name}！`)
  }

  /* NPC 对话脚本 */
  function talkLines(): string[] {
    const w = WEATHERS[weather]
    if (!questDone) {
      return [
        `（${SEASONS[season]}天的农场真热闹啊，今天${w.name}${w.icon}。）`,
        `小伙子，地里的杂草又冒出来了。帮我清掉 ${QUEST_WEED} 株杂草吧，我送你一笔钱。`,
        weedsCleared >= QUEST_WEED
          ? `（数了数）正好 ${weedsCleared} 株，干得漂亮！这是答谢的 150💰。`
          : `进度：${weedsCleared}/${QUEST_WEED} 株，继续加油～`,
      ]
    }
    return [
      `（${w.icon} ${w.name}天还出来干活，够勤快。）`,
      `矿洞越深矿越好，铁镐能省一半力气——拿 5 块铁矿去房子那升级工具。`,
      `秋天卖粮最划算（+25%），冬天就好好囤木头、下矿吧。`,
    ]
  }
  function advanceTalk() {
    const lines = talkLines()
    if (talkIdx >= lines.length - 1) {
      if (!questDone && weedsCleared >= QUEST_WEED) { setGold((g) => g + 150); setQuestDone(true); flash('村民赠予 150💰') }
      setMode('farm'); return
    }
    setTalkIdx((i) => i + 1)
  }

  /* 走一格（键盘与虚拟方向键共用） */
  const step = (dr: number, dc: number) => {
    if (modeRef.current !== 'farm' || busy.current) return
    const nr = gxRef.current + dr, nc = gyRef.current + dc
    if (!freeTile(nr, nc)) return
    setFace(dr > 0 ? 'down' : dr < 0 ? 'up' : dc > 0 ? 'right' : 'left')
    busy.current = true; setWalking(true); setGx(nr); setGy(nc)
    window.setTimeout(() => { setWalking(false); busy.current = false }, 190)
  }

  const holdProps = (dr: number, dc: number) => {
    let iv = 0
    return {
      onPointerDown: (e: RPointerEvent<HTMLButtonElement>) => {
        e.preventDefault()
        step(dr, dc)
        iv = window.setInterval(() => step(dr, dc), 200)
      },
      onPointerUp: () => window.clearInterval(iv),
      onPointerLeave: () => window.clearInterval(iv),
      onPointerCancel: () => window.clearInterval(iv),
    }
  }

  /* 键盘 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k === 'escape') { setMode('farm'); return }
      if (modeRef.current === 'fish' || modeRef.current === 'mine') { if (k === ' ' || k === 'spacebar') e.preventDefault(); return }
      if (modeRef.current === 'build') { if (k === 'e' || k === 'enter' || k === 'escape') setMode('farm'); return }
      if (modeRef.current === 'talk') { if (k === 'e' || k === 'enter' || k === ' ') { e.preventDefault(); advanceTalk() } return }
      if (['arrowup', 'w'].includes(k)) { e.preventDefault(); step(-1, 0) }
      else if (['arrowdown', 's'].includes(k)) { e.preventDefault(); step(1, 0) }
      else if (['arrowleft', 'a'].includes(k)) { e.preventDefault(); step(0, -1) }
      else if (['arrowright', 'd'].includes(k)) { e.preventDefault(); step(0, 1) }
      else if (k === ' ') { e.preventDefault(); if (near(POND.r0, POND.c0)) openFish(); else applyTool(gxRef.current, gyRef.current) }
      else if (k === 'e') { if (near(NPC.r, NPC.c)) { setTalkIdx(0); setMode('talk') } else if (near(HOUSE.r, HOUSE.c)) setMode('build') }
      else if (k === 'f') { openFish() }
      else if (k === 'm') { if (near(CAVE.r, CAVE.c)) { setMine((m) => m ?? genMineFloor(1)); setMode('mine') } }
      else if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(k)) setTool(TOOLS[+k - 1].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles, applyTool, season])

  const invList = Object.entries(inv).filter(([, n]) => n > 0)
  const px = gy * TILE, py = gx * TILE
  const questLeft = Math.max(0, QUEST_WEED - weedsCleared)
  const energyPct = Math.round((energy / maxEnergy) * 100)
  const nextHouse = HOUSE_LEVELS[houseLv + 1]
  const wInfo = WEATHERS[weather]

  return (
    <div className="sd">
      <div className="sd-bar mono">
        <span>第 <b>{year}</b> 年</span>
        <span className="sd-season">{SEASONS[season]}</span>
        <span>第 <b>{day}</b> / {DAYS_PER_SEASON} 天</span>
        <span className="sd-weather">{wInfo.icon} {wInfo.name}</span>
        <span>💰 <b>{gold}</b></span>
        <span className="sd-enge">⚡ <b>{energy}</b>/{maxEnergy}
          <i className="sd-enge-bar"><i style={{ width: `${energyPct}%` }} /></i>
        </span>
        <span className="sd-bar-ops">
          <button onClick={sleepDay}>🌙 睡觉（下一天）</button>
          <button onClick={reset}>重置</button>
        </span>
      </div>

      <div className="sd-toolsel">
        {TOOLS.map((tl) => (
          <button key={tl.id} className={tool === tl.id ? 'on' : ''} onClick={() => setTool(tl.id)} title={`快捷键 ${tl.key}`}>
            <b className="sd-key">{tl.key}</b> {tl.icon} {tl.name}
          </button>
        ))}
      </div>
      {tool === 'seed' && (
        <div className="sd-seedsel">
          <span className="sd-label">选种子：</span>
          {(Object.keys(CROPS) as CropId[]).map((id) => (
            <button key={id} className={seed === id ? 'on' : ''} onClick={() => setSeed(id)}>
              {CROPS[id].emoji} {CROPS[id].name}（{CROPS[id].sell}💰）
            </button>
          ))}
        </div>
      )}

      <div className="sd-quest mono">
        <span>{questDone ? '✅ 村民的除草委托已完成' : `📋 任务：清除杂草 ${weedsCleared}/${QUEST_WEED}　${questLeft > 0 ? `还差 ${questLeft} 株` : '回去找村民领赏！'}`}</span>
        <span>🪓 木头 ×{inv['mat:木头'] ?? 0} · 🪨 石头 ×{inv['ore:石头'] ?? 0} · ⛓️ 铁 ×{inv['ore:铁矿'] ?? 0} · 🟡 金 ×{inv['ore:金矿'] ?? 0} · 💎 晶洞 ×{inv['ore:晶洞'] ?? 0}</span>
        <span>{upgrades.pick ? '⚒️' : '·'} {upgrades.axe ? '🪚' : '·'} {upgrades.hoe ? '🥄' : '·'} {HOUSE_LEVELS[houseLv].icon} {HOUSE_LEVELS[houseLv].name}</span>
      </div>

      <div className="sd-field-wrap">
        <div className={`sd-field season-${season} weather-${weather}`} style={{ width: COLS * TILE, height: ROWS * TILE }}>
          {tiles.map((row, r) => row.map((t, c) => {
            const mature = t.crop && t.crop.stage >= CROPS[t.crop.id].stages.length - 1
            const cls = ['sd-tile', t.ground, t.watered ? 'watered' : '', mature ? 'mature' : '', t.weed ? 'weed' : '', t.tree > 0 ? 'tree' : ''].join(' ').trim()
            const content = t.crop ? CROPS[t.crop.id].stages[t.crop.stage]
              : t.weed ? '🌿' : t.butterfly ? '🦋' : ''
            return (
              <div key={key(r, c)} className={cls}
                style={{ left: c * TILE, top: r * TILE, width: TILE, height: TILE }}
                onClick={() => onTileClick(r, c)} title={`${r + 1},${c + 1}`}>
                {t.tree > 0 && <span className="sd-tree" data-size={t.tree}>🌳</span>}
                <span className="sd-crop">{content}</span>
                {t.watered && !t.crop && !t.weed && <span className="sd-badge">💧</span>}
              </div>
            )
          }))}

          {/* 小桥 */}
          <div className="sd-bridge" style={{ left: BRIDGE.c * TILE, top: BRIDGE.r * TILE, width: TILE, height: TILE }} title="小桥" />
          {/* 矿洞入口 */}
          <div className="sd-cave" style={{ left: CAVE.c * TILE, top: CAVE.r * TILE, width: TILE, height: TILE }}
            onClick={() => onTileClick(CAVE.r, CAVE.c)} title="矿洞（按 M 进入）">
            <span>🕳️</span><i>M</i>
          </div>
          {/* 房子 */}
          <div className="sd-house" style={{ left: HOUSE.c * TILE, top: HOUSE.r * TILE, width: TILE, height: TILE }}
            onClick={() => onTileClick(HOUSE.r, HOUSE.c)} title="房子（按 E 打开建造）">
            <span>{HOUSE_LEVELS[houseLv].icon}</span><i>E</i>
          </div>
          {/* 村民 NPC */}
          <div className="sd-npc" style={{ left: NPC.c * TILE, top: NPC.r * TILE, width: TILE, height: TILE }}
            onClick={() => onTileClick(NPC.r, NPC.c)} title="村民（按 E 对话）">
            <FarmerSprite npc />
            <i>E</i>
          </div>

          {/* 玩家 */}
          <div className={`sd-char face-${face} ${walking ? 'walking' : ''}`}
            style={{ left: px, top: py, width: TILE, height: TILE }}>
            <div className="sd-char-shadow" />
            <FarmerSprite />
          </div>

          {/* 动作特效 */}
          {fx.map((f) => (
            <span key={f.id} className={`sd-fx sd-fx-${f.kind}`} style={{ left: f.x, top: f.y }} />
          ))}

          {/* 天气层 */}
          <div className="sd-weather-layer" aria-hidden>
            {(weather === 'sunny' || weather === 'cloudy') && (
              <>
                {weather === 'sunny' && <span className="sd-w-sun">☀️</span>}
                <span className="sd-w-cloud" style={{ top: 8, animationDuration: '46s' }}>☁️</span>
                <span className="sd-w-cloud" style={{ top: 44, animationDuration: '64s', animationDelay: '-20s' }}>☁️</span>
                {weather === 'cloudy' && <span className="sd-w-cloud" style={{ top: 26, animationDuration: '38s', animationDelay: '-9s' }}>☁️</span>}
              </>
            )}
            {(weather === 'rain' || weather === 'storm') && (
              <>
                <span className="sd-w-cloud" style={{ top: 4, animationDuration: '52s' }}>☁️</span>
                <i className="sd-w-rain" /><i className="sd-w-rain sd-w-rain2" />
                {weather === 'storm' && <i className="sd-w-bolt" />}
              </>
            )}
            {weather === 'snow' && (<><i className="sd-w-snow" /><i className="sd-w-snow sd-w-snow2" /></>)}
          </div>
        </div>
      </div>

      {/* 触屏虚拟按键 */}
      <div className="sd-pad">
        <div className="sd-dpad">
          <button type="button" className="sd-pad-btn sd-pad-u" {...holdProps(-1, 0)} aria-label="向上走">▲</button>
          <button type="button" className="sd-pad-btn sd-pad-l" {...holdProps(0, -1)} aria-label="向左走">◀</button>
          <button type="button" className="sd-pad-btn sd-pad-r" {...holdProps(0, 1)} aria-label="向右走">▶</button>
          <button type="button" className="sd-pad-btn sd-pad-d" {...holdProps(1, 0)} aria-label="向下走">▼</button>
        </div>
        <button type="button" className="sd-act" aria-label="使用工具"
          onPointerDown={(e) => {
            e.preventDefault()
            if (modeRef.current !== 'farm') return
            applyTool(gxRef.current, gyRef.current)
          }}>🔧</button>
      </div>

      <div className="sd-msg mono">{msg || 'WASD 走动 · 点击格子走过去操作 · E 对话/建造 · F 钓鱼 · M 进矿洞'}</div>

      <div className="sd-inv mono">
        <span>背包：</span>
        {invList.length === 0 && <span>空空如也</span>}
        {invList.map(([id, n]) => {
          const [, name] = id.split(':')
          const icon = id.startsWith('fish:') ? '🐟' : id.startsWith('ore:') ? '⛏️' : id.startsWith('bug:') ? '🦋' : id.startsWith('mat:') ? '🪵' : CROPS[id as CropId]?.emoji ?? '🌾'
          return <span key={id}>{icon} {name} ×<b>{n}</b></span>
        })}
      </div>

      <p className="game-sub" style={{ maxWidth: 640 }}>
        操控：WASD / 方向键走动，点格子角色会先走过去再执行。锄地 → 播种 → 每天浇水 → 收获换钱。
        🪓 砍树得木头、⛏️ 矿洞挖石/铁/金，点房子升级小家、打造铁工具；河边（东侧小河）能钓河鱼，池塘钓塘鱼；
        雨天自动浇地、雷暴会劈庄稼、冬天封田。四季每 14 天轮转：春草多、夏多雷雨、秋售价 +25%、冬下雪。进度自动存本地。
      </p>

      {mode === 'fish' && <Fishing kind={fishKind} onCatch={onCatch} onClose={() => setMode('farm')} />}
      {mode === 'mine' && mine && (
        <MineView mine={mine} setMine={setMine} onLoot={onLoot}
          onSwing={(cost) => spend(cost)}
          pickPower={upgrades.pick ? 2 : 1}
          onExit={() => setMode('farm')} />
      )}
      {mode === 'build' && (
        <div className="sd-modal" onClick={() => setMode('farm')}>
          <div className="sd-build" onClick={(e) => e.stopPropagation()}>
            <div className="sd-fish-head">
              <b>{HOUSE_LEVELS[houseLv].icon} {HOUSE_LEVELS[houseLv].name} · 建造与铁匠铺</b>
              <button className="sd-x" onClick={() => setMode('farm')}>✕</button>
            </div>
            <div className="sd-build-sec">
              <b>🏠 房子升级</b>
              {nextHouse ? (
                <div className="sd-build-item">
                  <span>{nextHouse.icon} <b>{nextHouse.name}</b> — {nextHouse.bonus}</span>
                  <span className="mono">需 🪵{nextHouse.cost!.wood} 🪨{nextHouse.cost!.stone} ⛓️{nextHouse.cost!.iron} 💎{nextHouse.cost!.gold}</span>
                  <button onClick={upgradeHouse}>{matCost(nextHouse.cost!) ? '升级' : '材料不足'}</button>
                </div>
              ) : <div className="sd-build-item mono">已是最高级大宅 🏰，享受每天 30💰 补贴</div>}
            </div>
            <div className="sd-build-sec">
              <b>⚒️ 工具打造（铁矿）</b>
              {(['pick', 'axe', 'hoe'] as const).map((id) => {
                const u = UPGRADES[id]
                const owned = upgrades[id]
                return (
                  <div key={id} className="sd-build-item">
                    <span>{u.icon} <b>{u.name}</b> — {u.desc}</span>
                    <span className="mono">需 🪵{u.cost.wood} ⛓️{u.cost.iron}</span>
                    <button disabled={owned} onClick={() => buyUpgrade(id)}>{owned ? '已拥有' : (matCost(u.cost) ? '打造' : '材料不足')}</button>
                  </div>
                )
              })}
            </div>
            <div className="sd-build-foot mono">💡 矿洞越深矿越好：1 层出铜，2 层出铁，3 层出金与晶洞，5 层以后金矿成串。</div>
          </div>
        </div>
      )}
      {mode === 'talk' && (
        <div className="sd-modal" onClick={() => setMode('farm')}>
          <div className="sd-talk" onClick={(e) => e.stopPropagation()}>
            <div className="sd-talk-npc"><FarmerSprite npc /></div>
            <div className="sd-talk-body">
              <div className="sd-talk-name">村民 · 老约翰</div>
              <p>{talkLines()[talkIdx]}</p>
              <button onClick={advanceTalk}>{talkIdx >= talkLines().length - 1 ? '结束' : '继续 ▸'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* 像素农夫（纯 CSS/SVG，零外部资源，风格与终端统一） */
function FarmerSprite({ npc = false }: { npc?: boolean }) {
  return (
    <div className={`sd-farmer ${npc ? 'is-npc' : ''}`}>
      <div className="f-hat" />
      <div className="f-head" />
      <div className="f-body" />
      <div className="f-arm f-arm-l" />
      <div className="f-arm f-arm-r" />
      <div className="f-leg f-leg-l" />
      <div className="f-leg f-leg-r" />
    </div>
  )
}
