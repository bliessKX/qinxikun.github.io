import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as RPointerEvent } from 'react'

/* 星露谷 · 农场模拟（纯前端 v4）—— 原生 JS + CSS + localStorage。
 * v4 升级：地图 14×10 → 26×17（442 格）+ 动态格子铺满视窗；
 *          成片树林、多栋村舍、5 位村民、鸡鸭鹅家畜（喂食→产蛋→卖钱）。
 * 保留：矿洞 10×8 大地图 / 天气四季 / 建造升级 / 体力 / 钓鱼 / v3 全部玩法。 */

const COLS = 26, ROWS = 17
const SAVE_KEY = 'stardew.save.v4'
const SEASONS = ['春', '夏', '秋', '冬']
const DAYS_PER_SEASON = 14

const RIVER_C = 23
const BRIDGE = { r: 7, c: RIVER_C }
const POND = { r0: 14, c0: 24, h: 2, w: 2 }
const CAVE = { r: 0, c: 3 }
const QUEST_WEED = 3

/* 村舍：第一栋是玩家的（可升级），其余是村民的家 */
const HOUSES: { r: number; c: number; name: string; icon: string }[] = [
  { r: 1, c: 11, name: '我的家', icon: '🏠' },
  { r: 1, c: 5,  name: '艾米的小屋', icon: '🛖' },
  { r: 1, c: 18, name: '铁匠铺', icon: '🔨' },
  { r: 2, c: 21, name: '村长宅邸', icon: '🏡' },
]
const HOUSE = HOUSES[0]

/* 村民：每个人都有专属对话 */
const NPCS: { r: number; c: number; name: string; title: string; color: string }[] = [
  { r: 2, c: 5,  name: '艾米',   title: '花店姑娘', color: '#e07ba8' },
  { r: 2, c: 12, name: '老约翰', title: '村长',     color: '#9b59b6' },
  { r: 2, c: 18, name: '巴克',   title: '铁匠',     color: '#c9802e' },
  { r: 9, c: 20, name: '莉娜',   title: '旅行商人', color: '#4d87bd' },
  { r: 15, c: 12, name: '小豆',  title: '邻家小孩', color: '#7bc96f' },
]

/* 家畜：喂食花费 2💰，睡一觉产蛋 */
type AnimalKind = 'chicken' | 'duck' | 'goose'
const ANIMALS: { r: number; c: number; kind: AnimalKind; name: string; icon: string; egg: string; eggName: string; price: number }[] = [
  { r: 14, c: 6,  kind: 'chicken', name: '芦花鸡', icon: '🐔', egg: 'prod:鸡蛋',   eggName: '鸡蛋',   price: 12 },
  { r: 14, c: 7,  kind: 'chicken', name: '芦花鸡', icon: '🐔', egg: 'prod:鸡蛋',   eggName: '鸡蛋',   price: 12 },
  { r: 14, c: 8,  kind: 'chicken', name: '白羽鸡', icon: '🐓', egg: 'prod:鸡蛋',   eggName: '鸡蛋',   price: 12 },
  { r: 15, c: 6,  kind: 'duck',    name: '麻鸭',   icon: '🦆', egg: 'prod:鸭蛋',   eggName: '鸭蛋',   price: 20 },
  { r: 15, c: 7,  kind: 'duck',    name: '麻鸭',   icon: '🦆', egg: 'prod:鸭蛋',   eggName: '鸭蛋',   price: 20 },
  { r: 15, c: 8,  kind: 'goose',   name: '大白鹅', icon: '🪿', egg: 'prod:鹅蛋',   eggName: '鹅蛋',   price: 32 },
  { r: 15, c: 9,  kind: 'goose',   name: '大白鹅', icon: '🪿', egg: 'prod:鹅蛋',   eggName: '鹅蛋',   price: 32 },
]

const MCOLS = 10, MROWS = 8

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
  0: [['sunny', 40], ['cloudy', 25], ['rain', 25], ['storm', 10]],
  1: [['sunny', 45], ['cloudy', 20], ['rain', 20], ['storm', 15]],
  2: [['sunny', 35], ['cloudy', 40], ['rain', 20], ['storm', 5]],
  3: [['sunny', 30], ['cloudy', 30], ['snow', 40]],
}
function rollWeather(season: number): WeatherId {
  const table = WEATHER_TABLE[season] ?? WEATHER_TABLE[0]
  const tot = table.reduce((a, [, w]) => a + w, 0)
  let x = Math.random() * tot
  for (const [id, w] of table) { if ((x -= w) <= 0) return id }
  return 'sunny'
}

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

const HOUSE_LEVELS = [
  { name: '旧帐篷', icon: '⛺', cost: null as null | { wood: number; stone: number; iron: number; gold: number } },
  { name: '木屋',   icon: '🛖', cost: { wood: 25, stone: 15, iron: 0, gold: 0 },   bonus: '体力上限 +30，睡觉全恢复' },
  { name: '石屋',   icon: '🏠', cost: { wood: 50, stone: 50, iron: 5, gold: 0 },   bonus: '体力上限 +30，作物售价 +15%' },
  { name: '大宅',   icon: '🏰', cost: { wood: 90, stone: 80, iron: 10, gold: 5 },  bonus: '体力上限 +50，售价 +15%，每天补贴 30💰' },
]
const UPGRADES = {
  pick: { name: '铁镐', icon: '⚒️', cost: { wood: 10, stone: 0, iron: 5, gold: 0 }, desc: '矿洞敲击力 ×2' },
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
  fedAnimals: string[]
}

const key = (r: number, c: number) => `${r}-${c}`
const isPond = (r: number, c: number) => r >= POND.r0 && r < POND.r0 + POND.h && c >= POND.c0 && c < POND.c0 + POND.w
const isRiver = (r: number, c: number) => c === RIVER_C && r !== BRIDGE.r
const isBridge = (r: number, c: number) => r === BRIDGE.r && c === RIVER_C
const isCave = (r: number, c: number) => r === CAVE.r && c === CAVE.c
const isHouse = (r: number, c: number) => HOUSES.some((h) => h.r === r && h.c === c)
const isNpc = (r: number, c: number) => NPCS.some((n) => n.r === r && n.c === c)
const isAnimal = (r: number, c: number) => ANIMALS.some((a) => a.r === r && a.c === c)
const houseAt = (r: number, c: number) => HOUSES.find((h) => h.r === r && h.c === c)
const npcAt = (r: number, c: number) => NPCS.find((n) => n.r === r && n.c === c)
const animalAt = (r: number, c: number) => ANIMALS.find((a) => a.r === r && a.c === c)

const TREE_INIT = 3
function emptyFarm(): Tile[][] {
  const g: Tile[][] = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => ({
      ground: (isPond(r, c) || isRiver(r, c) ? 'water' : isBridge(r, c) ? 'bridge' : 'grass') as Ground,
      watered: false, crop: null, weed: false, tree: 0,
    })))
  const blocked = (r: number, c: number) =>
    isCave(r, c) || isHouse(r, c) || isNpc(r, c) || isAnimal(r, c) || isBridge(r, c) ||
    g[r][c].ground === 'water' || (r >= 4 && r <= 13 && c >= 7 && c <= 19) /* 中间留给农田 */
  /* 成片树林：顶行、左侧、底部、河对岸 */
  const forests = [
    [0, 4, 0, 22], [0, 2, 4, 5], [15, 16, 1, 5], [12, 16, 20, 22], [2, 5, 24, 25],
  ] as const
  for (const [r0, r1, c0, c1] of forests) {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (!blocked(r, c) && Math.random() < 0.72) g[r][c].tree = TREE_INIT
    }
  }
  /* 零散点缀 */
  for (let i = 0; i < 14; i++) {
    const r = Math.floor(Math.random() * ROWS), c = Math.floor(Math.random() * COLS)
    if (g[r]?.[c] && !blocked(r, c)) g[r][c].tree = TREE_INIT
  }
  return g
}

function genMineFloor(level: number): Mine {
  const grid: MineTile[][] = Array.from({ length: MROWS }, (_, r) =>
    Array.from({ length: MCOLS }, (_, c) => {
      const wall = r === 0 || c === 0 || r === MROWS - 1 || c === MCOLS - 1
      return { type: wall ? 'wall' : 'floor', hp: 0 }
    }))
  for (let i = 0; i < 3; i++) {
    const r = 1 + Math.floor(Math.random() * (MROWS - 2)), c = 1 + Math.floor(Math.random() * (MCOLS - 2))
    if (grid[r][c].type === 'floor') grid[r][c].type = 'wall'
    const [[dr, dc]] = [[0, 1], [1, 0], [0, -1]].sort(() => Math.random() - 0.5)
    const rr = r + dr, cc = c + dc
    if (grid[rr]?.[cc] && grid[rr][cc].type === 'floor') grid[rr][cc].type = 'wall'
  }
  const exitR = MROWS - 2, exitC = MCOLS >> 1
  grid[exitR][exitC] = { type: 'exit', hp: 0 }
  const pool: MineType[] = ['rock', 'rock', 'rock', 'rock']
  if (level >= 1) pool.push('copper', 'copper')
  if (level >= 2) pool.push('iron', 'iron')
  if (level >= 3) pool.push('gold', 'geode')
  if (level >= 5) pool.push('gold', 'gold', 'geode')
  let nodes = 0, guard = 0
  while (nodes < 16 && guard++ < 500) {
    const r = 1 + Math.floor(Math.random() * (MROWS - 2)), c = 1 + Math.floor(Math.random() * (MCOLS - 2))
    if (grid[r][c].type !== 'floor') continue
    const type = pool[Math.floor(Math.random() * pool.length)]
    grid[r][c] = { type, hp: MINE_LOOT[type]?.hp ?? 1 }
    nodes++
  }
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
      const old = localStorage.getItem('stardew.save.v3')
      if (old) {
        const s = JSON.parse(old)
        /* v3 尺寸不同，地块重新生成，标量保留 */
        raw = JSON.stringify({
          tiles: emptyFarm(), day: s.day, season: s.season, year: s.year,
          gold: s.gold, inv: s.inv, weedsCleared: s.weedsCleared, questDone: s.questDone,
          energy: s.energy, maxEnergy: s.maxEnergy, houseLv: s.houseLv,
          upgrades: s.upgrades, weather: s.weather,
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
      player: s.player ?? { gx: 8, gy: 8, face: 'down' },
      weedsCleared: s.weedsCleared | 0 || 0, questDone: !!s.questDone,
      mine: null,
      energy: s.energy ?? 100, maxEnergy: s.maxEnergy ?? 100,
      houseLv: Math.min(3, Math.max(0, s.houseLv | 0)),
      upgrades: { pick: !!s.upgrades?.pick, axe: !!s.upgrades?.axe, hoe: !!s.upgrades?.hoe },
      weather: WEATHERS[s.weather] ? s.weather : 'sunny',
      fedAnimals: Array.isArray(s.fedAnimals) ? s.fedAnimals : [],
    }
  } catch { return null }
}

/* ---------------- 钓鱼小游戏 ---------------- */
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
        <div className="sd-fish-foot mono">{s.won ? '🎉 上钩了！' : s.lost ? '💨 鱼跑了…' : '稳住节奏…'}</div>
      </div>
    </div>
  )
}

/* ---------------- 矿洞 ---------------- */
function MineView({ mine, setMine, onLoot, onSwing, onExit, pickPower }: {
  mine: Mine; setMine: (m: Mine) => void
  onLoot: (name: string, gold: number, icon: string) => void
  onSwing: (cost: number) => boolean; onExit: () => void; pickPower: number
}) {
  const [pos, setPos] = useState({ x: mine.px, y: mine.py })
  const [swing, setSwing] = useState<number | null>(null)
  const posRef = useRef(pos); posRef.current = pos
  const busy = useRef(false)
  const mineRef = useRef(mine); mineRef.current = mine
  const isOre = (t: MineType) => !!MINE_LOOT[t]
  const walkable = (r: number, c: number) =>
    r >= 0 && r < MROWS && c >= 0 && c < MCOLS && !isOre(mine.grid[r][c].type) && mine.grid[r][c].type !== 'wall'
  const pathTo = (tr: number, tc: number): [number, number][] => {
    const path: [number, number][] = []
    let { x, y } = posRef.current
    while (y !== tc) { y += Math.sign(tc - y); if (!walkable(x, y)) { y -= Math.sign(tc - y); break } path.push([x, y]) }
    while (x !== tr) { x += Math.sign(tr - x); if (!walkable(x, y)) { x -= Math.sign(tr - x); break } path.push([x, y]) }
    return path
  }
  const adjacent = (r: number, c: number) => Math.abs(r - posRef.current.x) + Math.abs(c - posRef.current.y) === 1
  const walkPath = (p: [number, number][], done?: () => void) => {
    if (!p.length) { done?.(); return }
    busy.current = true
    let i = 0
    const next = () => {
      if (i >= p.length) { busy.current = false; done?.(); return }
      const [x, y] = p[i++]; setPos({ x, y }); window.setTimeout(next, 150)
    }
    next()
  }
  const smash = (r: number, c: number) => {
    const cur = mineRef.current
    const tile = cur.grid[r][c]
    if (!isOre(tile.type) || tile.hp <= 0 || !onSwing(3)) return
    setSwing(r * MCOLS + c)
    window.setTimeout(() => {
      setSwing(null)
      const grid = cur.grid.map((row) => row.map((t) => ({ ...t })))
      grid[r][c].hp -= pickPower
      if (grid[r][c].hp <= 0) {
        const loot = MINE_LOOT[tile.type]!
        grid[r][c] = { type: 'floor', hp: 0 }
        setMine({ ...cur, grid }); onLoot(loot.name, loot.gold, loot.icon)
      } else setMine({ ...cur, grid })
    }, 300)
  }
  const onTileClick = (r: number, c: number) => {
    if (busy.current) return
    const tile = mineRef.current.grid[r][c]
    if (tile.type === 'exit') { onExit(); return }
    if (tile.type === 'wall') return
    if (tile.type === 'ladder') { walkPath(pathTo(r, c), () => setMine(genMineFloor(mineRef.current.level + 1))); return }
    if (isOre(tile.type)) {
      if (adjacent(r, c)) { smash(r, c); return }
      const spots: [number, number][] = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
        .filter(([rr, cc]) => walkable(rr, cc))
        .sort((a, b) => (Math.abs(a[0] - posRef.current.x) + Math.abs(a[1] - posRef.current.y)) - (Math.abs(b[0] - posRef.current.x) + Math.abs(b[1] - posRef.current.y)))
      for (const [sr, sc] of spots) {
        const p = pathTo(sr, sc)
        if (p.length && p[p.length - 1][0] === sr && p[p.length - 1][1] === sc) { walkPath(p, () => smash(r, c)); return }
      }
      return
    }
    walkPath(pathTo(r, c))
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
            const cls = ['sd-mtile', `mt-${t.type}`, t.hp > 0 && t.hp < (MINE_LOOT[t.type]?.hp ?? 1) ? 'cracked' : '', swing === r * MCOLS + c ? 'swing' : ''].join(' ').trim()
            const icon = t.type === 'exit' ? '🚪' : t.type === 'ladder' ? '🔽' : MINE_LOOT[t.type]?.icon ?? ''
            return (
              <div key={`${r}-${c}`} className={cls} style={{ left: c * 46, top: r * 46, width: 46, height: 46 }} onClick={() => onTileClick(r, c)}>
                {isOre(t.type) && <span className="sd-mhp mono">{t.hp > 0 ? '▪'.repeat(t.hp) : ''}</span>}
                <span className="sd-micon">{icon}</span>
              </div>
            )
          }))}
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
  const [gx, setGx] = useState(initial?.player?.gx ?? 8)
  const [gy, setGy] = useState(initial?.player?.gy ?? 8)
  const [walking, setWalking] = useState(false)
  const [fx, setFx] = useState<{ id: number; x: number; y: number; kind: string }[]>([])
  const [weedsCleared, setWeedsCleared] = useState(initial?.weedsCleared ?? 0)
  const [questDone, setQuestDone] = useState(initial?.questDone ?? false)
  const [mine, setMine] = useState<Mine | null>(initial?.mine ?? null)
  const [mode, setMode] = useState<'farm' | 'fish' | 'mine' | 'talk' | 'build' | 'house'>('farm')
  const [talkNpc, setTalkNpc] = useState(1)
  const [talkIdx, setTalkIdx] = useState(0)
  const [houseView, setHouseView] = useState(HOUSES[0])
  const [weather, setWeather] = useState<WeatherId>(initial?.weather ?? 'sunny')
  const [energy, setEnergy] = useState(initial?.energy ?? 100)
  const [maxEnergy, setMaxEnergy] = useState(initial?.maxEnergy ?? 100)
  const [houseLv, setHouseLv] = useState(initial?.houseLv ?? 0)
  const [upgrades, setUpgrades] = useState(initial?.upgrades ?? { pick: false, axe: false, hoe: false })
  const [fishKind, setFishKind] = useState<'pond' | 'river'>('pond')
  const [fedAnimals, setFedAnimals] = useState<string[]>(initial?.fedAnimals ?? [])
  const [tile, setTile] = useState(46)
  const wrapRef = useRef<HTMLDivElement>(null)
  const tileRef = useRef(tile); tileRef.current = tile

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
  const fedRef = useRef(fedAnimals); fedRef.current = fedAnimals
  const didInit = useRef(false)

  useEffect(() => { document.title = '星露谷 · 农场 — NICE.BLOG 2.0' }, [])

  /* 动态格子：让地图宽度正好铺满容器（消除黑边和滚动条） */
  useLayoutEffect(() => {
    const calc = () => {
      const wrap = wrapRef.current
      const avail = wrap?.clientWidth ?? window.innerWidth - 32
      setTile(Math.max(22, Math.min(58, Math.floor((avail - 8) / COLS))))
    }
    calc()
    const ro = typeof ResizeObserver !== 'undefined' && wrapRef.current ? new ResizeObserver(calc) : null
    ro?.observe(wrapRef.current!)
    window.addEventListener('resize', calc)
    return () => { ro?.disconnect(); window.removeEventListener('resize', calc) }
  }, [])

  useEffect(() => {
    const data: Save = {
      tiles, day, season, year, gold, inv,
      player: { gx, gy, face }, weedsCleared, questDone, mine,
      energy, maxEnergy, houseLv, upgrades, weather, fedAnimals,
    }
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)) } catch { /* 隐私模式忽略 */ }
  }, [tiles, day, season, year, gold, inv, gx, gy, face, weedsCleared, questDone, mine, energy, maxEnergy, houseLv, upgrades, weather, fedAnimals])

  const flash = (text: string) => {
    setMsg(text); window.clearTimeout(msgTimer.current)
    msgTimer.current = window.setTimeout(() => setMsg(''), 1800)
  }
  const addFx = (r: number, c: number, kind: string) => {
    const id = ++fxId.current, t = tileRef.current
    setFx((p) => [...p, { id, x: c * t + t / 2, y: r * t + t / 2, kind }])
    window.setTimeout(() => setFx((p) => p.filter((f) => f.id !== id)), 620)
  }
  const updateTile = (r: number, c: number, fn: (t: Tile) => Tile) =>
    setTiles((prev) => prev.map((row, ri) => ri !== r ? row : row.map((t, ci) => ci !== c ? t : fn(t))))
  const spend = (n: number) => {
    if (energyRef.current < n) { flash('😵 太累了，先睡觉或吃点东西吧'); return false }
    setEnergy((e) => e - n); return true
  }

  const spawnWeeds = useCallback((n: number) => {
    setTiles((prev) => {
      const flats: [number, number][] = []
      prev.forEach((row, r) => row.forEach((t, c) => {
        if (t.ground === 'grass' && !t.crop && !t.weed && t.tree === 0 && !isCave(r, c) && !isHouse(r, c) && !isNpc(r, c) && !isAnimal(r, c)) flats.push([r, c])
      }))
      if (!flats.length) return prev
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
        if (t.ground === 'grass' && !t.crop && !t.weed && t.tree === 0 && !t.butterfly && !isAnimal(r, c)) flats.push([r, c])
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

  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    spawnWeeds(6); spawnButterflies(4)
  }, [spawnWeeds, spawnButterflies])

  const sellBoost = () => (houseLvRef.current >= 2 ? 1.15 : 1)
  const seasonBoost = () => (season === 2 ? 1.25 : 1)

  const applyTool = useCallback((r: number, c: number) => {
    const t = tiles[r][c]
    const isWinter = season === 3
    switch (toolRef.current) {
      case 'hoe':
        if (t.ground === 'grass' && t.tree === 0 && !t.crop) {
          if (!spend(upgradesRef.current.hoe ? 8 : 3)) break
          if (upgradesRef.current.hoe) {
            for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
              const rr = r + dr, cc = c + dc, tt = tiles[rr]?.[cc]
              if (tt && tt.ground === 'grass' && tt.tree === 0 && !tt.crop && !isCave(rr, cc) && !isHouse(rr, cc) && !isNpc(rr, cc) && !isAnimal(rr, cc)) {
                updateTile(rr, cc, (x) => ({ ...x, ground: 'soil', watered: false }))
                if (dr === 0 && dc === 0) addFx(rr, cc, 'dust')
              }
            }
            flash('铁锄翻好 3×3 地 ⛏️')
          } else { updateTile(r, c, (x) => ({ ...x, ground: 'soil', watered: false })); addFx(r, c, 'dust'); flash('翻好地了 ⛏️') }
        } else flash('这里翻不了地')
        break
      case 'axe':
        if (t.tree > 0) {
          if (!spend(4)) break
          const left = t.tree - (upgradesRef.current.axe ? 2 : 1)
          if (left <= 0) {
            const wood = 4 + Math.floor(Math.random() * 3)
            updateTile(r, c, (x) => ({ ...x, tree: 0 })); addFx(r, c, 'dust')
            setInv((p) => ({ ...p, 'mat:木头': (p['mat:木头'] ?? 0) + wood }))
            flash(`🪓 大树放倒！获得木头 ×${wood}`)
          } else { updateTile(r, c, (x) => ({ ...x, tree: left })); addFx(r, c, 'dust'); flash(`砍树中…还差 ${left} 斧`) }
        } else flash('这里没有树（树林在地图边缘）')
        break
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
      case 'harvest':
        if (t.crop && t.crop.stage >= CROPS[t.crop.id].stages.length - 1) {
          const crop = t.crop, gain = Math.round(CROPS[crop.id].sell * seasonBoost() * sellBoost())
          setGold((g) => g + gain); setInv((p) => ({ ...p, [crop.id]: (p[crop.id] ?? 0) + 1 }))
          updateTile(r, c, (x) => ({ ...x, crop: null, watered: false })); addFx(r, c, 'pop')
          flash(`收获 ${CROPS[crop.id].name} +${gain}💰`)
        } else flash('还没成熟，记得每天浇透水')
        break
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
        } else flash('这里没有蝴蝶（晴天草地更多）')
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
    !isCave(r, c) && !isHouse(r, c) && !isNpc(r, c) && !isAnimal(r, c)
  const adjFree = (r: number, c: number): [number, number] => {
    for (const [a, b] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) if (freeTile(a, b)) return [a, b]
    return [r, c]
  }
  const near = (r: number, c: number) => Math.abs(r - gxRef.current) + Math.abs(c - gyRef.current) <= 1
  const nearAnyWater = () => {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const r = gxRef.current + dr, c = gyRef.current + dc
      if (tiles[r]?.[c]?.ground === 'water' && c === RIVER_C) return 'river'
    }
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const r = gxRef.current + dr, c = gyRef.current + dc
      if (tiles[r]?.[c]?.ground === 'water') return 'pond'
    }
    return 'pond'
  }

  const feedAnimal = (r: number, c: number) => {
    const a = animalAt(r, c)
    if (!a) return
    const id = key(r, c)
    if (fedRef.current.includes(id)) { flash(`${a.icon} ${a.name}今天已经吃饱啦`); return }
    if (gold < 2) { flash('买饲料要 2💰，先去挣钱吧'); return }
    setGold((g) => g - 2)
    setFedAnimals((p) => [...p, id])
    flash(`${a.icon} 喂饱了${a.name}，睡一觉就产蛋 🥚`)
  }
  const sellProduce = () => {
    let total = 0, count = 0
    for (const a of ANIMALS) { const n = inv[a.egg] ?? 0; if (n > 0) { total += n * a.price; count += n } }
    if (count === 0) { flash('还没有蛋可卖，先喂喂鸡鸭鹅'); return }
    setInv((p) => { const n = { ...p }; ANIMALS.forEach((a) => { delete n[a.egg] }); return n })
    setGold((g) => g + total)
    flash(`🛒 卖了 ${count} 枚蛋 +${total}💰`)
  }

  const onTileClick = (r: number, c: number) => {
    if (modeRef.current !== 'farm') return
    if (isCave(r, c)) { const [a, b] = adjFree(r, c); moveTo(a, b, () => { setMine((m) => m ?? genMineFloor(1)); setMode('mine') }); return }
    if (isHouse(r, c)) {
      const h = houseAt(r, c)!
      const [a, b] = adjFree(r, c)
      moveTo(a, b, () => {
        if (h === HOUSE) setMode('build')
        else { setHouseView(h); setMode('house') }
      })
      return
    }
    if (isNpc(r, c)) {
      const idx = NPCS.findIndex((n) => n.r === r && n.c === c)
      const [a, b] = adjFree(r, c)
      moveTo(a, b, () => { setTalkNpc(idx); setTalkIdx(0); setMode('talk') })
      return
    }
    if (isAnimal(r, c)) { const [a, b] = adjFree(r, c); moveTo(a, b, () => feedAnimal(r, c)); return }
    if (tiles[r][c].ground === 'water') { const [a, b] = adjFree(r, c); moveTo(a, b, () => flash('按 F 开始钓鱼 🎣')); return }
    moveTo(r, c, () => applyTool(r, c))
  }

  const sleepDay = () => {
    if (modeRef.current !== 'farm') return
    const isRain = weather === 'rain' || weather === 'storm'
    const isWinter = season === 3
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
    const nw = rollWeather(ns); setWeather(nw)
    setEnergy(maxEnergyRef.current)
    if (houseLvRef.current >= 3) setGold((g) => g + 30)
    /* 家畜产蛋 */
    const produced: string[] = []
    for (const a of ANIMALS) if (fedRef.current.includes(key(a.r, a.c))) produced.push(a.egg)
    if (produced.length) {
      setInv((p) => { const n = { ...p }; produced.forEach((k) => { n[k] = (n[k] ?? 0) + 1 }); return n })
      setFedAnimals([])
    }
    spawnWeeds((season === 0 ? 8 : 4) + Math.floor(Math.random() * 3))
    spawnButterflies(weather === 'sunny' ? 4 + Math.floor(Math.random() * 3) : 2)
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
    flash(`${wInfo.icon} 第 ${nd} 天 · ${SEASONS[ns]} · ${wInfo.name}${produced.length ? ` · 家畜产蛋 ×${produced.length} 🥚` : ''}${isRain && !isWinter ? ' · 雨水浇透了田地 💧' : ''}${isWinter ? ' · 田地封冻' : ''}${stormMsg}`)
  }

  const reset = () => {
    if (!window.confirm('确定重置农场？矿洞、房子与全部进度会清空。')) return
    setTiles(emptyFarm()); setDay(1); setSeason(0); setYear(1); setGold(200); setInv({})
    setGx(8); setGy(8); setFace('down'); setWeedsCleared(0); setQuestDone(false); setMine(null); setMsg('')
    setEnergy(100); setMaxEnergy(100); setHouseLv(0); setUpgrades({ pick: false, axe: false, hoe: false })
    setWeather('sunny'); setFedAnimals([]); spawnWeeds(6)
  }

  const openFish = () => { setFishKind(nearAnyWater()); setMode('fish') }
  const onCatch = (name: string, g: number) => { setGold((x) => x + g); setInv((p) => ({ ...p, [`fish:${name}`]: (p[`fish:${name}`] ?? 0) + 1 })); flash(`钓到 ${name} +${g}💰`); setMode('farm') }
  const onLoot = (name: string, g: number, icon: string) => { setGold((x) => x + g); setInv((p) => ({ ...p, [`ore:${name}`]: (p[`ore:${name}`] ?? 0) + 1 })); flash(`${icon} ${name} +${g}💰`) }

  const matCost = (cost: { wood: number; stone: number; iron: number; gold: number }) =>
    (inv['mat:木头'] ?? 0) >= cost.wood && (inv['ore:石头'] ?? 0) >= cost.stone && (inv['ore:铁矿'] ?? 0) >= cost.iron && gold >= cost.gold
  const payCost = (cost: { wood: number; stone: number; iron: number; gold: number }) => {
    setInv((p) => ({ ...p,
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
    payCost(u.cost); setUpgrades((p) => ({ ...p, [id]: true }))
    flash(`${u.icon} 打造完成：${u.name}！`)
  }

  function talkLines(): string[] {
    const w = WEATHERS[weather]
    const n = NPCS[talkNpc] ?? NPCS[1]
    const common = `（${SEASONS[season]}天的农场，今天${w.name}${w.icon}。）`
    if (n.name === '老约翰' && !questDone) {
      return [common, `小伙子，地里的杂草又冒出来了。帮我清掉 ${QUEST_WEED} 株，我送你 150💰。`,
        weedsCleared >= QUEST_WEED ? `正好 ${weedsCleared} 株，干得漂亮！这是答谢的 150💰。` : `进度：${weedsCleared}/${QUEST_WEED} 株，继续加油～`]
    }
    const lines: Record<string, string[]> = {
      '艾米': [common, '花店的生意靠你了——草莓秋天最值钱，记得多浇水。', '清晨的蝴蝶最多，带上捕虫网去转转吧。'],
      '老约翰': [common, '矿洞越深矿越好，铁镐能省一半力气。', '秋天卖粮最划算，冬天就好好囤木头、下矿吧。'],
      '巴克': [common, '拿 5 块铁矿来，我给你打把铁镐，挖矿快一倍！', '铁斧两下就能放倒大树，盖房子全靠它。'],
      '莉娜': [common, '我走南闯北，见过会下金蛋的鹅——你这鹅也不错。', '鸡鸭鹅每天喂一次，睡一觉就产蛋，记得卖给我。'],
      '小豆': [common, '哥哥！你家的鸡鸭鹅好可爱，我能摸摸吗？', '下雨天蜗牛会爬出来，石头下面也能找到宝贝哦！'],
    }
    return lines[n.name] ?? [common]
  }
  function advanceTalk() {
    const lines = talkLines()
    const n = NPCS[talkNpc]
    if (talkIdx >= lines.length - 1) {
      if (n?.name === '老约翰' && !questDone && weedsCleared >= QUEST_WEED) { setGold((g) => g + 150); setQuestDone(true); flash('村民赠予 150💰') }
      setMode('farm'); return
    }
    setTalkIdx((i) => i + 1)
  }

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
        e.preventDefault(); step(dr, dc)
        iv = window.setInterval(() => step(dr, dc), 200)
      },
      onPointerUp: () => window.clearInterval(iv),
      onPointerLeave: () => window.clearInterval(iv),
      onPointerCancel: () => window.clearInterval(iv),
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k === 'escape') { setMode('farm'); return }
      if (modeRef.current === 'fish' || modeRef.current === 'mine') { if (k === ' ' || k === 'spacebar') e.preventDefault(); return }
      if (modeRef.current === 'build' || modeRef.current === 'house') { if (k === 'e' || k === 'enter' || k === 'escape') setMode('farm'); return }
      if (modeRef.current === 'talk') { if (k === 'e' || k === 'enter' || k === ' ') { e.preventDefault(); advanceTalk() } return }
      if (['arrowup', 'w'].includes(k)) { e.preventDefault(); step(-1, 0) }
      else if (['arrowdown', 's'].includes(k)) { e.preventDefault(); step(1, 0) }
      else if (['arrowleft', 'a'].includes(k)) { e.preventDefault(); step(0, -1) }
      else if (['arrowright', 'd'].includes(k)) { e.preventDefault(); step(0, 1) }
      else if (k === ' ') { e.preventDefault(); if (near(POND.r0, POND.c0)) openFish(); else applyTool(gxRef.current, gyRef.current) }
      else if (k === 'e') {
        const ni = NPCS.findIndex((n) => near(n.r, n.c))
        if (ni >= 0) { setTalkNpc(ni); setTalkIdx(0); setMode('talk') }
        else if (near(HOUSE.r, HOUSE.c)) setMode('build')
      }
      else if (k === 'f') openFish()
      else if (k === 'm') { if (near(CAVE.r, CAVE.c)) { setMine((m) => m ?? genMineFloor(1)); setMode('mine') } }
      else if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(k)) setTool(TOOLS[+k - 1].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles, applyTool, season])

  const invList = Object.entries(inv).filter(([, n]) => n > 0)
  const px = gy * tile, py = gx * tile
  const questLeft = Math.max(0, QUEST_WEED - weedsCleared)
  const energyPct = Math.round((energy / maxEnergy) * 100)
  const nextHouse = HOUSE_LEVELS[houseLv + 1]
  const wInfo = WEATHERS[weather]
  const T = tile

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
        <span>{questDone ? '✅ 村民的除草委托已完成' : `📋 清除杂草 ${weedsCleared}/${QUEST_WEED}　${questLeft > 0 ? `还差 ${questLeft} 株` : '找老约翰领赏！'}`}</span>
        <span>🪓 木 ×{inv['mat:木头'] ?? 0} · 🪨 石 ×{inv['ore:石头'] ?? 0} · ⛓️ 铁 ×{inv['ore:铁矿'] ?? 0} · 🟡 金 ×{inv['ore:金矿'] ?? 0} · 💎 晶洞 ×{inv['ore:晶洞'] ?? 0}</span>
        <span>🐔 家畜 ×{ANIMALS.length} · 🥚 蛋 ×{ANIMALS.reduce((n, a) => n + (inv[a.egg] ?? 0), 0)} · {upgrades.pick ? '⚒️' : '·'} {upgrades.axe ? '🪚' : '·'} {upgrades.hoe ? '🥄' : '·'}</span>
      </div>

      <div className="sd-field-wrap" ref={wrapRef}>
        <div className={`sd-field season-${season} weather-${weather}`} style={{ width: COLS * T, height: ROWS * T }}>
          {tiles.map((row, r) => row.map((t, c) => {
            const mature = t.crop && t.crop.stage >= CROPS[t.crop.id].stages.length - 1
            const cls = ['sd-tile', t.ground, t.watered ? 'watered' : '', mature ? 'mature' : '', t.weed ? 'weed' : '', t.tree > 0 ? 'tree' : ''].join(' ').trim()
            const content = t.crop ? CROPS[t.crop.id].stages[t.crop.stage] : t.weed ? '🌿' : t.butterfly ? '🦋' : ''
            return (
              <div key={key(r, c)} className={cls}
                style={{ left: c * T, top: r * T, width: T, height: T }}
                onClick={() => onTileClick(r, c)} title={`${r + 1},${c + 1}`}>
                {t.tree > 0 && <span className="sd-tree" data-size={t.tree}>🌳</span>}
                <span className="sd-crop">{content}</span>
                {t.watered && !t.crop && !t.weed && <span className="sd-badge">💧</span>}
              </div>
            )
          }))}

          <div className="sd-bridge" style={{ left: BRIDGE.c * T, top: BRIDGE.r * T, width: T, height: T }} title="小桥" />
          {HOUSES.map((h) => (
            <div key={`h-${h.r}-${h.c}`} className={`sd-house ${h === HOUSE ? 'is-mine' : ''}`}
              style={{ left: h.c * T, top: h.r * T, width: T, height: T }}
              onClick={() => onTileClick(h.r, h.c)} title={h.name}>
              <span>{h === HOUSE ? HOUSE_LEVELS[houseLv].icon : h.icon}</span><i>E</i>
            </div>
          ))}
          <div className="sd-cave" style={{ left: CAVE.c * T, top: CAVE.r * T, width: T, height: T }}
            onClick={() => onTileClick(CAVE.r, CAVE.c)} title="矿洞（按 M 进入）">
            <span>🕳️</span><i>M</i>
          </div>
          {/* 家畜围栏 */}
          <div className="sd-pen" style={{ left: 5 * T, top: 13.4 * T, width: 6 * T, height: 3.2 * T }} aria-hidden />
          {ANIMALS.map((a) => {
            const fed = fedAnimals.includes(key(a.r, a.c))
            return (
              <div key={`a-${a.r}-${a.c}`} className={`sd-animal ${fed ? 'fed' : ''}`}
                style={{ left: a.c * T, top: a.r * T, width: T, height: T }}
                onClick={() => onTileClick(a.r, a.c)} title={`${a.name} · 点击喂食（2💰）`}>
                <span>{a.icon}</span>{fed && <i>🥚</i>}
              </div>
            )
          })}
          {/* 村民 */}
          {NPCS.map((n, i) => (
            <div key={`n-${i}`} className="sd-npc" style={{ left: n.c * T, top: n.r * T, width: T, height: T, ['--npc' as string]: n.color }}
              onClick={() => onTileClick(n.r, n.c)} title={`${n.name} · ${n.title}（点击对话）`}>
              <FarmerSprite npc color={n.color} />
              <i>E</i><em>{n.name}</em>
            </div>
          ))}

          <div className={`sd-char face-${face} ${walking ? 'walking' : ''}`}
            style={{ left: px, top: py, width: T, height: T }}>
            <div className="sd-char-shadow" /><FarmerSprite />
          </div>

          {fx.map((f) => (<span key={f.id} className={`sd-fx sd-fx-${f.kind}`} style={{ left: f.x, top: f.y }} />))}

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
              <><span className="sd-w-cloud" style={{ top: 4, animationDuration: '52s' }}>☁️</span>
                <i className="sd-w-rain" /><i className="sd-w-rain sd-w-rain2" />
                {weather === 'storm' && <i className="sd-w-bolt" />}</>
            )}
            {weather === 'snow' && (<><i className="sd-w-snow" /><i className="sd-w-snow sd-w-snow2" /></>)}
          </div>
        </div>
      </div>

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

      <div className="sd-msg mono">{msg || 'WASD 走动 · 点击格子走过去操作 · E 对话/建造 · F 钓鱼 · M 进矿洞 · 点鸡鸭鹅喂食'}</div>

      <div className="sd-inv mono">
        <span>背包：</span>
        {invList.length === 0 && <span>空空如也</span>}
        {invList.map(([id, n]) => {
          const [, name] = id.split(':')
          const icon = id.startsWith('fish:') ? '🐟' : id.startsWith('ore:') ? '⛏️' : id.startsWith('bug:') ? '🦋' : id.startsWith('mat:') ? '🪵' : id.startsWith('prod:') ? '🥚' : CROPS[id as CropId]?.emoji ?? '🌾'
          return <span key={id}>{icon} {name} ×<b>{n}</b></span>
        })}
        <button className="sd-sell" onClick={sellProduce}>🛒 卖蛋</button>
      </div>

      <p className="game-sub" style={{ maxWidth: 720 }}>
        操控：WASD / 方向键走动，点格子角色会先走过去再执行。锄地 → 播种 → 浇水 → 收获换钱。
        地图边缘是成片树林（🪓 砍树得木头），村里有 4 栋房子和 5 位村民（点击对话），
        右下围栏养着鸡鸭鹅：点动物花 2💰 喂食，睡一觉产蛋，背包里「卖蛋」换钱。
        ⛏️ 矿洞挖矿、河边钓鱼、四季天气轮转等玩法全部保留，进度自动存本地。
      </p>

      {mode === 'fish' && <Fishing kind={fishKind} onCatch={onCatch} onClose={() => setMode('farm')} />}
      {mode === 'mine' && mine && (
        <MineView mine={mine} setMine={setMine} onLoot={onLoot}
          onSwing={(cost) => spend(cost)} pickPower={upgrades.pick ? 2 : 1} onExit={() => setMode('farm')} />
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
              ) : <div className="sd-build-item mono">已是最高级大宅 🏰，每天补贴 30💰</div>}
            </div>
            <div className="sd-build-sec">
              <b>⚒️ 工具打造（铁矿）</b>
              {(['pick', 'axe', 'hoe'] as const).map((id) => {
                const u = UPGRADES[id], owned = upgrades[id]
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
      {mode === 'house' && (
        <div className="sd-modal" onClick={() => setMode('farm')}>
          <div className="sd-talk" onClick={(e) => e.stopPropagation()}>
            <div className="sd-talk-npc" style={{ fontSize: 44 }}>{houseView.icon}</div>
            <div className="sd-talk-body">
              <div className="sd-talk-name">{houseView.name}</div>
              <p>邻居的家，门前种着花。村里人喜欢在傍晚聚在这儿聊天。</p>
              <button onClick={() => setMode('farm')}>离开</button>
            </div>
          </div>
        </div>
      )}
      {mode === 'talk' && (
        <div className="sd-modal" onClick={() => setMode('farm')}>
          <div className="sd-talk" onClick={(e) => e.stopPropagation()}>
            <div className="sd-talk-npc"><FarmerSprite npc color={NPCS[talkNpc]?.color} /></div>
            <div className="sd-talk-body">
              <div className="sd-talk-name">{NPCS[talkNpc]?.name} · {NPCS[talkNpc]?.title}</div>
              <p>{talkLines()[talkIdx]}</p>
              <button onClick={advanceTalk}>{talkIdx >= talkLines().length - 1 ? '结束' : '继续 ▸'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* 像素农夫（纯 CSS，零外部资源） */
function FarmerSprite({ npc = false, color }: { npc?: boolean; color?: string }) {
  return (
    <div className={`sd-farmer ${npc ? 'is-npc' : ''}`} style={color ? ({ ['--npc' as string]: color } as React.CSSProperties) : undefined}>
      <div className="f-hat" /><div className="f-head" /><div className="f-body" />
      <div className="f-arm f-arm-l" /><div className="f-arm f-arm-r" />
      <div className="f-leg f-leg-l" /><div className="f-leg f-leg-r" />
    </div>
  )
}
