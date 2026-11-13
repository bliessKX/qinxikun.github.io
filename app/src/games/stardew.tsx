import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/* 星露谷 · 农场模拟（纯前端 v2）—— 原生 JS + CSS + localStorage。
 * 相对 v1 的升级：
 *   - 可操控的像素农夫：WASD / 方向键自由走动，点击格子会先「走过去」再执行操作；
 *   - 动作动画：锄地挥动、浇水水花、除草尘土、收获弹出，角色带行走帧动画；
 *   - 真实地面：草地/土壤/水域分层纹理（噪点 + 犁沟 + 湿润反光）；
 *   - 杂草系统：每天冒出杂草，用「除草」清除并计入任务；
 *   - NPC 对话：走到村民旁边按 E / 点击对话，含每日问候与清除杂草任务；
 *   - 钓鱼小游戏：站水边按 F，经典「保持鱼儿在抓取区内」节奏玩法；
 *   - 矿洞挖掘：走到洞口按 M 进入，敲击岩石掉矿，踩梯子下一层。
 * 全部状态自动存 localStorage，刷新不丢。 */

const COLS = 10, ROWS = 8, TILE = 56
const SAVE_KEY = 'stardew.save.v2'
const SEASONS = ['春', '夏', '秋', '冬']
const DAYS_PER_SEASON = 14
const POND_W = 2, POND_H = 2                 // 右下角 2×2 池塘
const POND_R0 = ROWS - POND_H, POND_C0 = COLS - POND_W
const CAVE = { r: 0, c: 0 }                 // 左上角矿洞入口
const NPC = { r: 0, c: COLS - 1 }           // 右上角村民
const QUEST_WEED = 3                         // 清除杂草任务目标

type Ground = 'grass' | 'soil' | 'water'
type CropId = 'radish' | 'potato' | 'strawberry' | 'pumpkin'
const CROPS: Record<CropId, { name: string; emoji: string; stages: string[]; sell: number }> = {
  radish:     { name: '萝卜',   emoji: '🥕', stages: ['🌱', '🌿', '🥕'],        sell: 30 },
  potato:     { name: '土豆',   emoji: '🥔', stages: ['🌱', '🌿', '🥔'],        sell: 45 },
  strawberry: { name: '草莓',   emoji: '🍓', stages: ['🌱', '🌿', '🌸', '🍓'], sell: 80 },
  pumpkin:    { name: '南瓜',   emoji: '🎃', stages: ['🌱', '🌿', '🌾', '🎃'],  sell: 120 },
}
type ToolId = 'hoe' | 'water' | 'seed' | 'harvest' | 'weed' | 'clear'
const TOOLS: { id: ToolId; name: string; icon: string; key: string }[] = [
  { id: 'hoe',     name: '锄头', icon: '⛏️', key: '1' },
  { id: 'water',   name: '水壶', icon: '💧', key: '2' },
  { id: 'seed',    name: '播种', icon: '🌱', key: '3' },
  { id: 'harvest', name: '收获', icon: '🌾', key: '4' },
  { id: 'weed',    name: '除草', icon: '🍂', key: '5' },
  { id: 'clear',   name: '铲除', icon: '❌', key: '6' },
]

type MineType = 'stone' | 'copper' | 'iron' | 'gold' | 'geode' | 'ladder'
const MINE_LOOT: Record<Exclude<MineType, 'ladder'>, { name: string; gold: number; icon: string }> = {
  stone:  { name: '石头', gold: 2,   icon: '🪨' },
  copper: { name: '铜矿', gold: 15,  icon: '🟤' },
  iron:   { name: '铁矿', gold: 35,  icon: '⛓️' },
  gold:   { name: '金矿', gold: 80,  icon: '🟡' },
  geode:  { name: '晶洞', gold: 120, icon: '💎' },
}

interface Crop { id: CropId; stage: number; wateredToday: boolean }
interface Tile { ground: Ground; watered: boolean; crop: Crop | null; weed: boolean }
interface MineNode { type: MineType; broken: boolean }
interface Mine { level: number; nodes: MineNode[] }
interface Save {
  tiles: Tile[][]; day: number; season: number; year: number; gold: number
  inv: Record<string, number>
  player: { gx: number; gy: number; face: string }
  weedsCleared: number; questDone: boolean
  mine: Mine | null
}

const key = (r: number, c: number) => `${r}-${c}`
const isPond = (r: number, c: number) => r >= POND_R0 && r < POND_R0 + POND_H && c >= POND_C0 && c < POND_C0 + POND_W
const isCave = (r: number, c: number) => r === CAVE.r && c === CAVE.c
const isNpc = (r: number, c: number) => r === NPC.r && c === NPC.c
const samePos = (a: { r: number; c: number }, b: { gx: number; gy: number }) => a.r === b.gx && a.c === b.gy

function emptyFarm(): Tile[][] {
  return Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => ({
      ground: (isPond(r, c) ? 'water' : 'grass') as Ground,
      watered: false, crop: null, weed: false,
    })))
}

function genMine(level: number): Mine {
  const types: MineType[] = ['stone', 'stone', 'stone']
  if (level >= 1) types.push('copper', 'copper')
  if (level >= 2) types.push('iron', 'iron')
  if (level >= 3) types.push('gold')
  if (level >= 2) types.push('geode')
  const nodes: MineNode[] = Array.from({ length: 24 }, () => ({
    type: types[Math.floor(Math.random() * types.length)], broken: false,
  }))
  nodes[Math.floor(Math.random() * nodes.length)] = { type: 'ladder', broken: false }
  return { level, nodes }
}

function normalizeTile(t: any): Tile {
  return {
    ground: t?.ground === 'soil' || t?.ground === 'water' ? t.ground : 'grass',
    watered: !!t?.watered,
    crop: t?.crop ? { id: t.crop.id, stage: t.crop.stage | 0, wateredToday: !!t.crop.wateredToday } : null,
    weed: !!t?.weed,
  }
}

function loadSave(): Save | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY) || localStorage.getItem('stardew.save.v1')
    if (!raw) return null
    const s = JSON.parse(raw)
    if (!Array.isArray(s?.tiles) || s.tiles.length !== ROWS) return null
    return {
      tiles: s.tiles.map((row: any[]) => row.map(normalizeTile)),
      day: s.day | 0 || 1, season: s.season | 0 || 0, year: s.year | 0 || 1,
      gold: (s.gold ?? 200) | 0, inv: s.inv ?? {},
      player: s.player ?? { gx: 4, gy: 4, face: 'down' },
      weedsCleared: s.weedsCleared | 0 || 0, questDone: !!s.questDone,
      mine: s.mine ?? null,
    }
  } catch { return null }
}

/* ---------------- 钓鱼小游戏 ---------------- */
function Fishing({ onCatch, onClose }: { onCatch: (name: string, gold: number) => void; onClose: () => void }) {
  const FISH = [
    { name: '鲈鱼', gold: 30, w: 40 }, { name: '鲑鱼', gold: 60, w: 25 },
    { name: '河豚', gold: 90, w: 18 }, { name: '传说之鱼', gold: 200, w: 4 },
  ]
  const [s, setS] = useState({ fish: 0.5, fishV: 0.22, bar: 0.5, prog: 0, time: 22, won: false, lost: false, hold: false })
  const st = useRef(s); st.current = s
  const pick = useCallback(() => {
    const tot = FISH.reduce((a, f) => a + f.w, 0); let x = Math.random() * tot
    for (const f of FISH) { if ((x -= f.w) <= 0) return f } return FISH[0]
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
      if (Math.random() < 0.012) fv = (Math.random() - 0.5) * 0.9            // 突然摆尾
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
  }, [])
  const pct = (n: number) => `${n * 100}%`
  return (
    <div className="sd-modal" onClick={onClose}>
      <div className="sd-fish" onClick={(e) => e.stopPropagation()}>
        <div className="sd-fish-head">
          <b>🎣 钓鱼</b>
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

/* ---------------- 矿洞 ---------------- */
function MineView({ mine, setMine, onLoot, onClose }: {
  mine: Mine; setMine: (m: Mine) => void; onLoot: (name: string, gold: number, icon: string) => void; onClose: () => void
}) {
  const [swing, setSwing] = useState<number | null>(null)
  const hit = (i: number) => {
    if (swing !== null) return
    const node = mine.nodes[i]
    if (node.broken) return
    if (node.type === 'ladder') {
      const next = genMine(mine.level + 1); setMine(next); return
    }
    setSwing(i)
    window.setTimeout(() => {
      setSwing(null)
      const nodes = mine.nodes.map((n, k) => k === i ? { ...n, broken: true } : n)
      setMine({ ...mine, nodes })
      const loot = MINE_LOOT[node.type as Exclude<MineType, 'ladder'>]
      onLoot(loot.name, loot.gold, loot.icon)
    }, 420)
  }
  return (
    <div className="sd-modal" onClick={onClose}>
      <div className="sd-mine" onClick={(e) => e.stopPropagation()}>
        <div className="sd-fish-head">
          <b>⛏️ 矿洞 · 第 {mine.level} 层</b>
          <span className="mono">敲击岩石挖矿，踩梯子深入下一层</span>
          <button className="sd-x" onClick={onClose}>✕</button>
        </div>
        <div className="sd-mine-grid">
          {mine.nodes.map((n, i) => (
            <button key={i} className={`sd-node sd-node-${n.type} ${n.broken ? 'broken' : ''} ${swing === i ? 'swing' : ''}`}
              onClick={() => hit(i)} disabled={n.broken}>
              {n.broken ? '' : n.type === 'ladder' ? '🔽' : MINE_LOOT[n.type as Exclude<MineType, 'ladder'>]?.icon ?? '🪨'}
            </button>
          ))}
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
  const [gx, setGx] = useState(initial?.player?.gx ?? 4)
  const [gy, setGy] = useState(initial?.player?.gy ?? 4)
  const [walking, setWalking] = useState(false)
  const [fx, setFx] = useState<{ id: number; x: number; y: number; kind: string }[]>([])
  const [weedsCleared, setWeedsCleared] = useState(initial?.weedsCleared ?? 0)
  const [questDone, setQuestDone] = useState(initial?.questDone ?? false)
  const [mine, setMine] = useState<Mine | null>(initial?.mine ?? null)
  const [mode, setMode] = useState<'farm' | 'fish' | 'mine' | 'talk'>('farm')
  const [talkIdx, setTalkIdx] = useState(0)
  const [talkDone, setTalkDone] = useState(false)

  const busy = useRef(false)
  const msgTimer = useRef(0)
  const fxId = useRef(0)
  const toolRef = useRef(tool); toolRef.current = tool
  const gxRef = useRef(gx); gxRef.current = gx
  const gyRef = useRef(gy); gyRef.current = gy
  const modeRef = useRef(mode); modeRef.current = mode
  const didInit = useRef(false)

  useEffect(() => { document.title = '星露谷 · 农场 — NICE.BLOG 2.0' }, [])

  useEffect(() => {
    const data: Save = {
      tiles, day, season, year, gold, inv,
      player: { gx, gy, face }, weedsCleared, questDone,
      mine: mode === 'mine' ? mine : mine,
    }
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)) } catch { /* 隐私模式忽略 */ }
  }, [tiles, day, season, year, gold, inv, gx, gy, face, weedsCleared, questDone, mine, mode])

  const flash = (text: string) => {
    setMsg(text); window.clearTimeout(msgTimer.current)
    msgTimer.current = window.setTimeout(() => setMsg(''), 1700)
  }
  const addFx = (r: number, c: number, kind: string) => {
    const id = ++fxId.current
    setFx((p) => [...p, { id, x: c * TILE + TILE / 2, y: r * TILE + TILE / 2, kind }])
    window.setTimeout(() => setFx((p) => p.filter((f) => f.id !== id)), 620)
  }
  const updateTile = (r: number, c: number, fn: (t: Tile) => Tile) =>
    setTiles((prev) => prev.map((row, ri) => ri !== r ? row : row.map((t, ci) => ci !== c ? t : fn(t))))

  const spawnWeeds = useCallback((n: number) => {
    setTiles((prev) => {
      const flats: [number, number][] = []
      prev.forEach((row, r) => row.forEach((t, c) => {
        if (t.ground === 'grass' && !t.crop && !t.weed) flats.push([r, c])
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

  /* 首次进入：若农场还没有杂草，撒两株，让除草任务有得做 */
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    setTiles((prev) => {
      if (prev.some((row) => row.some((t) => t.weed))) return prev
      const flats: [number, number][] = []
      prev.forEach((row, r) => row.forEach((t, c) => { if (t.ground === 'grass' && !t.crop && !t.weed) flats.push([r, c]) }))
      if (!flats.length) return prev
      const next = prev.map((row) => row.map((t) => ({ ...t })))
      for (let i = 0; i < 2 && flats.length; i++) {
        const [r, c] = flats.splice(Math.floor(Math.random() * flats.length), 1)[0]
        next[r][c].weed = true
      }
      return next
    })
  }, [])

  const applyTool = useCallback((r: number, c: number) => {
    const t = tiles[r][c]
    switch (toolRef.current) {
      case 'hoe':
        if (t.ground === 'grass' && !t.crop) { updateTile(r, c, (x) => ({ ...x, ground: 'soil', watered: false })); addFx(r, c, 'dust'); flash('翻好地了 ⛏️') }
        else flash('这里翻不了地')
        break
      case 'water':
        if (t.ground === 'soil') { updateTile(r, c, (x) => ({ ...x, watered: true, crop: x.crop ? { ...x.crop, wateredToday: true } : null })); addFx(r, c, 'water'); flash('浇水完成 💧') }
        else flash('只有土壤能浇水')
        break
      case 'seed':
        if (t.ground === 'soil' && !t.crop && !t.weed) { updateTile(r, c, (x) => ({ ...x, crop: { id: seed, stage: 0, wateredToday: false } })); addFx(r, c, 'seed'); flash(`种下 ${CROPS[seed].name}`) }
        else flash('要先翻地、且这块没种东西')
        break
      case 'harvest': {
        if (t.crop && t.crop.stage >= CROPS[t.crop.id].stages.length - 1) {
          const crop = t.crop, gain = CROPS[crop.id].sell
          setGold((g) => g + gain); setInv((p) => ({ ...p, [crop.id]: (p[crop.id] ?? 0) + 1 }))
          updateTile(r, c, (x) => ({ ...x, crop: null, watered: false })); addFx(r, c, 'pop')
          flash(`收获 ${CROPS[crop.id].name} +${gain}💰`)
        } else flash('还没成熟，记得每天浇透水')
        break
      }
      case 'weed':
        if (t.weed) {
          updateTile(r, c, (x) => ({ ...x, weed: false })); addFx(r, c, 'dust')
          setGold((g) => g + 5); setWeedsCleared((w) => w + 1); flash('除草 +5💰')
        } else flash('这块没有杂草')
        break
      case 'clear':
        if (t.crop) { updateTile(r, c, (x) => ({ ...x, crop: null, watered: false })); flash('铲除了作物') }
        else if (t.ground === 'soil') { updateTile(r, c, (x) => ({ ...x, ground: 'grass', watered: false })); flash('恢复成草地') }
        else flash('没什么可铲的')
        break
    }
  }, [tiles, seed])

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
    r >= 0 && r < ROWS && c >= 0 && c < COLS && tiles[r][c].ground !== 'water' && !isCave(r, c) && !isNpc(r, c)
  const adjFree = (r: number, c: number): [number, number] => {
    const around = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
    for (const [a, b] of around) if (freeTile(a, b)) return [a, b]
    return [r, c]
  }
  const near = (r: number, c: number) => Math.abs(r - gxRef.current) + Math.abs(c - gyRef.current) <= 1

  const onTileClick = (r: number, c: number) => {
    if (modeRef.current !== 'farm') return
    if (isCave(r, c)) { const [a, b] = adjFree(r, c); moveTo(a, b, () => { setMine((m) => m ?? genMine(1)); setMode('mine') }) ; return }
    if (isNpc(r, c)) { const [a, b] = adjFree(r, c); moveTo(a, b, () => { setTalkIdx(0); setTalkDone(false); setMode('talk') }); return }
    if (tiles[r][c].ground === 'water') { const [a, b] = adjFree(r, c); moveTo(a, b, () => flash('按 F 开始钓鱼 🎣')); return }
    moveTo(r, c, () => applyTool(r, c))
  }

  const sleepDay = () => {
    if (modeRef.current !== 'farm') return
    const next = tiles.map((row) => row.map((t) => {
      if (t.crop && t.crop.wateredToday) {
        const max = CROPS[t.crop.id].stages.length - 1
        return { ...t, crop: { ...t.crop, stage: Math.min(t.crop.stage + 1, max), wateredToday: false }, watered: false }
      }
      return { ...t, watered: false, crop: t.crop ? { ...t.crop, wateredToday: false } : null }
    }))
    setTiles(next)
    let nd = day + 1, ns = season, ny = year
    if (nd > DAYS_PER_SEASON) { nd = 1; ns = (season + 1) % 4; if (ns === 0) ny++ }
    setDay(nd); setSeason(ns); setYear(ny)
    spawnWeeds(2 + Math.floor(Math.random() * 2))
    flash('睡了一觉，新的一天 ☀️')
  }

  const reset = () => {
    if (!window.confirm('确定重置农场？矿洞与全部进度会清空。')) return
    setTiles(emptyFarm()); setDay(1); setSeason(0); setYear(1); setGold(200); setInv({})
    setGx(4); setGy(4); setFace('down'); setWeedsCleared(0); setQuestDone(false); setMine(null); setMsg('')
    spawnWeeds(2)
  }

  const openFish = () => { if (near(POND_R0, POND_C0) || near(POND_R0, POND_C0 + 1) || near(POND_R0 + 1, POND_C0) || near(POND_R0 + 1, POND_C0 + 1) || isPond(gxRef.current, gyRef.current)) setMode('fish'); else flash('要到水边才能钓鱼') }
  const openMine = () => { setMine((m) => m ?? genMine(1)); setMode('mine') }
  const openTalk = () => { setTalkIdx(0); setTalkDone(false); setMode('talk') }

  const onCatch = (name: string, g: number) => { setGold((x) => x + g); setInv((p) => ({ ...p, [`fish:${name}`]: (p[`fish:${name}`] ?? 0) + 1 })); flash(`钓到 ${name} +${g}💰`); setMode('farm') }
  const onLoot = (name: string, g: number, icon: string) => { setGold((x) => x + g); setInv((p) => ({ ...p, [`ore:${name}`]: (p[`ore:${name}`] ?? 0) + 1 })); flash(`${icon} ${name} +${g}💰`) }

  /* NPC 对话脚本（提前声明，供键盘事件引用，避免闭包读到过期状态） */
  function talkLines(): string[] {
    const greet = SEASONS[season]
    if (!questDone) {
      return [
        `（${greet}天的农场真热闹啊。）`,
        `小伙子，地里的杂草又冒出来了。帮我清掉 ${QUEST_WEED} 株杂草吧，我送你一笔钱。`,
        weedsCleared >= QUEST_WEED
          ? `（数了数）正好 ${weedsCleared} 株，干得漂亮！这是答谢的 150💰。`
          : `进度：${weedsCleared}/${QUEST_WEED} 株，继续加油～`,
      ]
    }
    return [
      `（${greet}安，农场主。）`,
      `听说矿洞深处有金矿，带把好镐去看看？按 M 进洞，F 去水边钓鱼也不错。`,
      `今天的庄稼要记得浇水，睡一觉才会长大哦。`,
    ]
  }
  function advanceTalk() {
    const lines = talkLines()
    if (talkIdx >= lines.length - 1) {
      if (!questDone && weedsCleared >= QUEST_WEED) { setGold((g) => g + 150); setQuestDone(true); flash('村民赠予 150💰') }
      setMode('farm'); setTalkDone(true); return
    }
    setTalkIdx((i) => i + 1)
  }

  /* 键盘：走动 / 选工具 / 交互 */
  useEffect(() => {
    const step = (dr: number, dc: number) => {
      if (modeRef.current !== 'farm' || busy.current) return
      const nr = gxRef.current + dr, nc = gyRef.current + dc
      if (!freeTile(nr, nc)) return
      setFace(dr > 0 ? 'down' : dr < 0 ? 'up' : dc > 0 ? 'right' : 'left')
      busy.current = true; setWalking(true); setGx(nr); setGy(nc)
      window.setTimeout(() => { setWalking(false); busy.current = false }, 190)
    }
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k === 'escape') { setMode('farm'); return }
      if (modeRef.current === 'fish' || modeRef.current === 'mine') { if (k === ' ' || k === 'spacebar') e.preventDefault(); return }
      if (modeRef.current === 'talk') { if (k === 'e' || k === 'enter' || k === ' ') { e.preventDefault(); advanceTalk() } return }
      if (['arrowup', 'w'].includes(k)) { e.preventDefault(); step(-1, 0) }
      else if (['arrowdown', 's'].includes(k)) { e.preventDefault(); step(1, 0) }
      else if (['arrowleft', 'a'].includes(k)) { e.preventDefault(); step(0, -1) }
      else if (['arrowright', 'd'].includes(k)) { e.preventDefault(); step(0, 1) }
      else if (k === ' ') { e.preventDefault(); if (near(POND_R0, POND_C0)) openFish(); else applyTool(gxRef.current, gyRef.current) }
      else if (k === 'e') { if (near(NPC.r, NPC.c)) openTalk() }
      else if (k === 'f') { openFish() }
      else if (k === 'm') { if (near(CAVE.r, CAVE.c)) openMine() }
      else if (['1', '2', '3', '4', '5', '6'].includes(k)) setTool(TOOLS[+k - 1].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tiles, applyTool, openFish, openMine, openTalk, advanceTalk])

  const invList = Object.entries(inv).filter(([, n]) => n > 0)
  const px = gy * TILE, py = gx * TILE
  const questLeft = Math.max(0, QUEST_WEED - weedsCleared)

  return (
    <div className="sd">
      <div className="sd-bar mono">
        <span>第 <b>{year}</b> 年</span>
        <span className="sd-season">{SEASONS[season]}</span>
        <span>第 <b>{day}</b> / {DAYS_PER_SEASON} 天</span>
        <span>💰 <b>{gold}</b></span>
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
        {questDone
          ? '✅ 村民的除草委托已完成'
          : `📋 任务：清除杂草 ${weedsCleared}/${QUEST_WEED}　${questLeft > 0 ? `还差 ${questLeft} 株` : '回去找村民领赏！'}`}
      </div>

      <div className="sd-field-wrap">
        <div className="sd-field" style={{ width: COLS * TILE, height: ROWS * TILE }}>
          {tiles.map((row, r) => row.map((t, c) => {
            const mature = t.crop && t.crop.stage >= CROPS[t.crop.id].stages.length - 1
            const cls = ['sd-tile', t.ground, t.watered ? 'watered' : '', mature ? 'mature' : '', t.weed ? 'weed' : ''].join(' ').trim()
            const content = t.crop ? CROPS[t.crop.id].stages[t.crop.stage] : t.weed ? '🌿' : ''
            return (
              <div key={key(r, c)} className={cls}
                style={{ left: c * TILE, top: r * TILE, width: TILE, height: TILE }}
                onClick={() => onTileClick(r, c)} title={`${r + 1},${c + 1}`}>
                <span className="sd-crop">{content}</span>
                {t.watered && !t.crop && !t.weed && <span className="sd-badge">💧</span>}
              </div>
            )
          }))}

          {/* 矿洞入口 */}
          <div className="sd-cave" style={{ left: CAVE.c * TILE, top: CAVE.r * TILE, width: TILE, height: TILE }}
            onClick={() => onTileClick(CAVE.r, CAVE.c)} title="矿洞（按 M 进入）">
            <span>🕳️</span><i>M</i>
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
        </div>
      </div>

      <div className="sd-msg mono">{msg || 'WASD 走动 · 点击格子走过去操作 · E 对话 · F 钓鱼 · M 进矿洞'}</div>

      <div className="sd-inv mono">
        <span>背包：</span>
        {invList.length === 0 && <span>空空如也</span>}
        {invList.map(([id, n]) => {
          const [kind, name] = id.split(':')
          const icon = kind === 'fish' ? '🐟' : kind === 'ore' ? '⛏️' : CROPS[id as CropId]?.emoji ?? '🌾'
          return <span key={id}>{icon} {name} ×<b>{n}</b></span>
        })}
      </div>

      <p className="game-sub" style={{ maxWidth: 620 }}>
        操控：WASD / 方向键走动，点格子角色会先走过去再执行。锄头翻地 → 播种 → 水壶每天浇水（浇过次日才长）→ 收获换金币。
        每天冒杂草，用「除草」清掉并推进任务；走到村民旁按 E 对话、水边按 F 钓鱼、洞口按 M 下矿。进度自动存本地。
      </p>

      {mode === 'fish' && <Fishing onCatch={onCatch} onClose={() => setMode('farm')} />}
      {mode === 'mine' && mine && (
        <MineView mine={mine} setMine={setMine} onLoot={onLoot} onClose={() => setMode('farm')} />
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
