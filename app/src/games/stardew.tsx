import { useEffect, useMemo, useRef, useState } from 'react'

/* 星露谷 · 农场模拟（纯前端 MVP）—— 原生 JS + CSS + localStorage。
 * 核心是「网格 Tilemap + 集中状态管理」：
 *   - 地图是一张 ROWS×COLS 的瓦片二维数组，每格记录 地表(草地/土壤) + 是否浇水 + 作物(种类/生长阶段/今日是否浇过水)。
 *   - 所有操作（翻地/播种/浇水/收获/铲除）都走不可变更新，由 React 统一渲染。
 *   - 时间以「天」推进：睡觉进入次日，浇过水的作物长一级，四季轮回，年份递增。
 *   - 进度默认自动存 localStorage，刷新不丢。 */

const COLS = 10, ROWS = 8
const SAVE_KEY = 'stardew.save.v1'
const SEASONS = ['春', '夏', '秋', '冬']
const DAYS_PER_SEASON = 14

type CropId = 'radish' | 'potato' | 'strawberry' | 'pumpkin'
const CROPS: Record<CropId, { name: string; emoji: string; stages: string[]; sell: number }> = {
  radish:     { name: '萝卜',   emoji: '🥕', stages: ['🌱', '🌿', '🥕'],            sell: 30 },
  potato:     { name: '土豆',   emoji: '🥔', stages: ['🌱', '🌿', '🥔'],            sell: 45 },
  strawberry: { name: '草莓',   emoji: '🍓', stages: ['🌱', '🌿', '🌸', '🍓'],     sell: 80 },
  pumpkin:    { name: '南瓜',   emoji: '🎃', stages: ['🌱', '🌿', '🌾', '🎃'],      sell: 120 },
}
type ToolId = 'hoe' | 'water' | 'seed' | 'harvest' | 'clear'
const TOOLS: { id: ToolId; name: string; icon: string }[] = [
  { id: 'hoe', name: '锄头', icon: '⛏️' },
  { id: 'water', name: '水壶', icon: '💧' },
  { id: 'seed', name: '播种', icon: '🌱' },
  { id: 'harvest', name: '收获', icon: '🌾' },
  { id: 'clear', name: '铲除', icon: '❌' },
]

interface Crop { id: CropId; stage: number; wateredToday: boolean }
interface Tile { ground: 'grass' | 'soil'; watered: boolean; crop: Crop | null }
interface Save { tiles: Tile[][]; day: number; season: number; year: number; gold: number; inv: Record<string, number> }

function emptyFarm(): Tile[][] {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => ({ ground: 'grass', watered: false, crop: null })))
}

function loadSave(): Save | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Save
    if (!Array.isArray(s.tiles) || s.tiles.length !== ROWS) return null
    return s
  } catch { return null }
}

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
  const msgTimer = useRef<number>(0)

  useEffect(() => { document.title = '星露谷 · 农场 — NICE.BLOG 2.0' }, [])

  /* 自动存档：任意状态变化即写 localStorage */
  useEffect(() => {
    const data: Save = { tiles, day, season, year, gold, inv }
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)) } catch { /* 隐私模式忽略 */ }
  }, [tiles, day, season, year, gold, inv])

  const flash = (text: string) => {
    setMsg(text)
    window.clearTimeout(msgTimer.current)
    msgTimer.current = window.setTimeout(() => setMsg(''), 1600)
  }

  const updateTile = (r: number, c: number, fn: (t: Tile) => Tile) =>
    setTiles((prev) => prev.map((row, ri) => ri !== r ? row : row.map((t, ci) => ci !== c ? t : fn(t))))

  const useTool = (r: number, c: number) => {
    const t = tiles[r][c]
    switch (tool) {
      case 'hoe':
        if (t.ground === 'grass') updateTile(r, c, (x) => ({ ...x, ground: 'soil', watered: false }))
        else flash('这块已经翻好地了')
        break
      case 'water':
        if (t.ground === 'soil') updateTile(r, c, (x) => ({ ...x, watered: true, crop: x.crop ? { ...x.crop, wateredToday: true } : null }))
        else flash('只有土壤能浇水')
        break
      case 'seed':
        if (t.ground === 'soil' && !t.crop) updateTile(r, c, (x) => ({ ...x, crop: { id: seed, stage: 0, wateredToday: false } }))
        else flash('要先翻地、且这块没种东西')
        break
      case 'harvest': {
        if (t.crop && t.crop.stage >= CROPS[t.crop.id].stages.length - 1) {
          const crop = t.crop
          const gain = CROPS[crop.id].sell
          setGold((g) => g + gain)
          setInv((prev) => ({ ...prev, [crop.id]: (prev[crop.id] ?? 0) + 1 }))
          updateTile(r, c, (x) => ({ ...x, crop: null, watered: false }))
          flash(`收获 ${CROPS[crop.id].name} +${gain}💰`)
        } else flash('还没成熟，记得每天浇透水')
        break
      }
      case 'clear':
        if (t.crop) updateTile(r, c, (x) => ({ ...x, crop: null, watered: false }))
        else flash('这块没有作物')
        break
    }
  }

  const sleepDay = () => {
    /* 浇过水的作物次日长一级；所有浇水状态归零 */
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
    flash('睡了一觉，新的一天开始了 ☀️')
  }

  const reset = () => {
    if (!window.confirm('确定重置农场？所有进度会清空。')) return
    setTiles(emptyFarm()); setDay(1); setSeason(0); setYear(1); setGold(200); setInv({}); setMsg('')
  }

  const invList = Object.entries(inv).filter(([, n]) => n > 0)

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
          <button key={tl.id} className={tool === tl.id ? 'on' : ''} onClick={() => setTool(tl.id)}>{tl.icon} {tl.name}</button>
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

      <div className="sd-map" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
        {tiles.map((row, r) => row.map((t, c) => {
          const mature = t.crop && t.crop.stage >= CROPS[t.crop.id].stages.length - 1
          const cls = [
            'sd-tile', t.ground, t.watered ? 'watered' : '', mature ? 'mature' : '',
          ].join(' ').trim()
          const content = t.crop ? CROPS[t.crop.id].stages[t.crop.stage] : ''
          return (
            <div key={`${r}-${c}`} className={cls} onClick={() => useTool(r, c)} title={`${r + 1},${c + 1}`}>
              {content}
              {t.watered && !t.crop && <span className="sd-badge">💧</span>}
            </div>
          )
        }))}
      </div>

      <div className="sd-msg mono">{msg}</div>

      <div className="sd-inv mono">
        <span>背包：</span>
        {invList.length === 0 && <span>空空如也</span>}
        {invList.map(([id, n]) => <span key={id}>{CROPS[id as CropId].emoji} ×<b>{n}</b></span>)}
      </div>

      <p className="game-sub" style={{ maxWidth: 560 }}>
        玩法：① 选「锄头」把草地翻成土壤 → ② 选「播种」种下作物 → ③ 每天用「水壶」浇水（浇过水次日才生长）→ ④ 作物成熟后用「收获」换成金币。
        没浇水的那天作物不会长。进度自动存本地，刷新不丢。
      </p>
    </div>
  )
}
