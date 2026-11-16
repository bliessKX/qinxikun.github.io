import { useCallback, useEffect, useRef, useState } from 'react'
import Phaser from 'phaser'

/* 钓鱼模拟器 —— Phaser 3。零静态资源，贴图运行时生成。
 * 玩法：按住蓄力甩竿（越远越深），等鱼咬钩（浮漂下沉瞬间点按），
 *       收线小游戏（按住上提渔网，把鱼稳定在绿区）成功即入图鉴。
 * 天气：晴 / 多云 / 雨（雨天上钩更快且有雨天限定鱼）。
 * 图鉴：12 种鱼 × 4 档稀有度，捕获记录（次数/最大体型）存 localStorage。 */

const W = 720, H = 440
const SURFACE = 210
const DOCK_X = 110
const ZONE_Y = [235, 310, 385] /* 浅 / 中 / 深 */
const LS_DEX = 'fishing.dex.v1'
const LS_GOLD = 'fishing.gold.v1'

type Rarity = 1 | 2 | 3 | 4
const RARITY = { 1: { label: '常见', color: '#8fd8ec' }, 2: { label: '少见', color: '#7bc96f' }, 3: { label: '稀有', color: '#f0a832' }, 4: { label: '传说', color: '#e06c60' } } as const

interface FishDef { id: string; name: string; emoji: string; zones: number[]; rarity: Rarity; gold: number; base: number; var: number; rainOnly?: boolean }

const FISHES: FishDef[] = [
  { id: 'loach', name: '泥鳅', emoji: '🐟', zones: [0], rarity: 1, gold: 10, base: 14, var: 6 },
  { id: 'silver', name: '小银鱼', emoji: '🐠', zones: [0], rarity: 1, gold: 14, base: 12, var: 5 },
  { id: 'crucian', name: '鲫鱼', emoji: '🐡', zones: [0, 1], rarity: 1, gold: 18, base: 20, var: 8 },
  { id: 'perch', name: '鲈鱼', emoji: '🐟', zones: [1], rarity: 1, gold: 26, base: 26, var: 10 },
  { id: 'koi', name: '锦鲤', emoji: '🎏', zones: [1], rarity: 2, gold: 45, base: 30, var: 12 },
  { id: 'puffer', name: '河豚', emoji: '🐡', zones: [1, 2], rarity: 2, gold: 55, base: 28, var: 10 },
  { id: 'mandarin', name: '鳜鱼', emoji: '🐠', zones: [2], rarity: 2, gold: 62, base: 32, var: 12 },
  { id: 'sturgeon', name: '鲟鱼', emoji: '🐟', zones: [2], rarity: 3, gold: 95, base: 44, var: 16 },
  { id: 'swift', name: '雨燕鱼', emoji: '🌧️', zones: [0, 1, 2], rarity: 3, gold: 85, base: 34, var: 12, rainOnly: true },
  { id: 'moon', name: '月光鱼', emoji: '🌙', zones: [2], rarity: 3, gold: 120, base: 38, var: 10 },
  { id: 'carpking', name: '锦鲤王', emoji: '👑', zones: [1, 2], rarity: 4, gold: 250, base: 50, var: 14 },
  { id: 'dragon', name: '金龙王', emoji: '🐲', zones: [2], rarity: 4, gold: 320, base: 56, var: 18 },
]

type Weather = 0 | 1 | 2 /* 晴 / 多云 / 雨 */
const WEATHERS = [
  { icon: '☀️', label: '晴', boost: 1 },
  { icon: '⛅', label: '多云', boost: 1.25 },
  { icon: '🌧️', label: '雨', boost: 1.7 },
] as const

/* React ↔ Phaser 桥 */
const bridge = {
  onState: (_s: string) => {},
  onWeather: (_w: Weather) => {},
  onGold: (_g: number) => {},
  onCatch: (_f: { id: string; name: string; emoji: string; rarity: Rarity; size: number; gold: number; isNew: boolean }) => {},
  onLose: () => {},
}

type Phase = 'idle' | 'charge' | 'cast' | 'wait' | 'bite' | 'reel' | 'result'

class FishingScene extends Phaser.Scene {
  phase: Phase = 'idle'
  power = 0
  powerDir = 1
  castX = 0
  zone = 0
  weather: Weather = 0
  bobber!: Phaser.Physics.Arcade.Image
  biteMark!: Phaser.GameObjects.Text
  rodLine!: Phaser.GameObjects.Graphics
  ambient: Array<{ img: Phaser.GameObjects.Image; vy: number }> = []
  rainGfx!: Phaser.GameObjects.Graphics
  hint!: Phaser.GameObjects.Text
  /* 收线小游戏 */
  fishPos = 0.5
  fishTarget = 0.5
  fishTimer = 0
  barPos = 0.5
  prog = 0
  reelTime = 12
  caught: FishDef | null = null

  constructor() { super('fishing') }

  makeTextures() {
    const g = this.add.graphics()
    g.fillStyle(0x22303f, 1)
    g.fillEllipse(12, 6, 24, 9)
    g.fillTriangle(20, 6, 26, 2, 26, 10)
    g.generateTexture('sil', 28, 12)
    g.clear()
    g.fillStyle(0xe06c60, 1); g.fillCircle(5, 5, 5)
    g.fillStyle(0xe8e3d8, 1); g.fillRect(0, 4, 10, 2)
    g.generateTexture('bobber', 10, 10)
    g.destroy()
  }

  create() {
    this.makeTextures()
    /* 天空 */
    const sky = this.add.graphics()
    sky.fillGradientStyle(0x2a4260, 0x2a4260, 0x4d87bd, 0x4d87bd, 1)
    sky.fillRect(0, 0, W, SURFACE)
    /* 水体 */
    const water = this.add.graphics()
    water.fillStyle(0x1d3a52, 1); water.fillRect(0, SURFACE, W, H - SURFACE)
    water.fillStyle(0x234a63, 1); water.fillRect(0, ZONE_Y[1] - 18, W, ZONE_Y[2] - ZONE_Y[1] + 18)
    water.fillStyle(0x1a2f42, 1); water.fillRect(0, ZONE_Y[2] - 18, W, H - ZONE_Y[2] + 18)
    /* 波光 */
    for (let i = 0; i < 26; i++) {
      const gl = this.add.image(Math.random() * W, SURFACE + 6 + Math.random() * (H - SURFACE - 10), 'sil')
        .setAlpha(0.12).setScale(0.4 + Math.random() * 0.5)
      this.tweens.add({ targets: gl, x: '+=14', duration: 1600 + Math.random() * 1600, yoyo: true, repeat: -1 })
      gl.setDepth(0)
    }
    /* 码头 */
    const dock = this.add.graphics()
    dock.fillStyle(0x5a3d24, 1); dock.fillRect(0, SURFACE - 14, DOCK_X, 10)
    dock.fillStyle(0x3a2c44, 1)
    for (let x = 8; x < DOCK_X; x += 22) dock.fillRect(x, SURFACE - 4, 6, 14)
    dock.setDepth(5)
    /* 钓鱼人（简笔像素小人） */
    const hero = this.add.graphics()
    hero.fillStyle(0xf0a832, 1); hero.fillRect(56, SURFACE - 46, 14, 22)
    hero.fillStyle(0xe8e3d8, 1); hero.fillRect(58, SURFACE - 58, 10, 12)
    hero.fillStyle(0x0b0e14, 1); hero.fillRect(63, SURFACE - 55, 2, 2)
    hero.setDepth(5)
    /* 环境鱼群剪影 */
    for (let i = 0; i < 12; i++) {
      const zi = Math.floor(Math.random() * 3)
      const img = this.add.image(Math.random() * W, ZONE_Y[zi] + (Math.random() - 0.5) * 26, 'sil')
        .setAlpha(0.5).setDepth(1)
      this.tweens.add({ targets: img, x: Math.random() < 0.5 ? '-=140' : '+=140', duration: 4200 + Math.random() * 3800, yoyo: true, repeat: -1, onYoyo: () => img.setFlipX(!img.flipX), onRepeat: () => img.setFlipX(!img.flipX) })
      this.ambient.push({ img, vy: 0 })
    }
    /* 浮漂 / 咬钩提示 */
    this.bobber = this.physics.add.image(70, SURFACE + 6, 'bobber').setVisible(false).setDepth(6)
    this.biteMark = this.add.text(0, 0, '❗', { fontSize: '22px', color: '#f0a832' }).setOrigin(0.5).setVisible(false).setDepth(9)
    this.rodLine = this.add.graphics().setDepth(6)
    this.rainGfx = this.add.graphics().setDepth(8)
    this.hint = this.add.text(W / 2, 64, '', { fontFamily: 'Consolas, monospace', fontSize: '16px', color: '#e8e3d8' }).setOrigin(0.5).setDepth(9)

    /* 输入 */
    this.input.on('pointerdown', () => this.onDown())
    this.input.on('pointerup', () => this.onUp())

    /* 天气：每回合随机 */
    this.pickWeather()
    this.setIdle()
  }

  pickWeather() {
    const r = Math.random()
    this.weather = (r < 0.45 ? 0 : r < 0.75 ? 1 : 2) as Weather
    bridge.onWeather(this.weather)
  }

  setIdle() {
    this.phase = 'idle'
    this.bobber.setVisible(false); this.biteMark.setVisible(false)
    this.hint.setText('按住屏幕蓄力，松手甩竿')
    bridge.onState('idle')
  }

  onDown() {
    if (this.phase === 'idle') { this.phase = 'charge'; this.power = 0.08; this.powerDir = 1 }
    else if (this.phase === 'wait') return
    else if (this.phase === 'bite') this.hooked()
  }

  onUp() {
    if (this.phase === 'charge') this.cast()
    else if (this.phase === 'bite') this.missBite()
  }

  cast() {
    this.phase = 'cast'
    const dist = 60 + this.power * 520
    this.castX = Phaser.Math.Clamp(DOCK_X + 30 + dist, DOCK_X + 40, W - 24)
    this.zone = this.castX < 300 ? 0 : this.castX < 500 ? 1 : 2
    this.bobber.setVisible(true).setPosition(this.castX, SURFACE - 10)
    this.physics.add.existing(this.bobber)
    /* 抛物线落水 */
    this.tweens.add({ targets: this.bobber, x: this.castX, duration: 30 })
    const peak = SURFACE - 46 - this.power * 60
    this.bobber.setVelocity(0, 0)
    this.tweens.chain({
      targets: this.bobber,
      tweens: [
        { y: peak, duration: 300, ease: 'Quad.easeOut' },
        { y: SURFACE + 8, duration: 260, ease: 'Quad.easeIn', onComplete: () => this.startWait() },
      ],
    })
    this.hint.setText('')
    bridge.onState('wait')
  }

  startWait() {
    this.phase = 'wait'
    const boost = WEATHERS[this.weather].boost
    const deepBias = this.zone === 2 ? 0.75 : this.zone === 1 ? 1 : 1.2
    const wait = (1800 + Math.random() * 4200) / (boost * deepBias)
    this.time.delayedCall(wait, () => {
      if (this.phase !== 'wait') return
      this.phase = 'bite'
      this.biteMark.setPosition(this.bobber.x, SURFACE - 26).setVisible(true)
      this.tweens.add({ targets: this.bobber, y: SURFACE + 22, duration: 120, yoyo: true, repeat: 3 })
      this.time.delayedCall(1100, () => { if (this.phase === 'bite') this.missBite(true) })
    })
    /* 太久没动静 → 鱼群散了 */
    this.time.delayedCall(14000, () => { if (this.phase === 'wait') { this.setIdle(); bridge.onLose() } })
  }

  missBite(silent = false) {
    this.tweens.killTweensOf(this.bobber)
    this.bobber.setPosition(this.bobber.x, SURFACE + 8)
    if (!silent) this.hint.setText('跑了…再试一次')
    else this.hint.setText('鱼群散了，重新甩竿')
    this.time.delayedCall(700, () => { if (this.phase !== 'idle') this.setIdle() })
  }

  hooked() {
    this.phase = 'reel'
    this.biteMark.setVisible(false)
    /* 按深度与天气抽鱼 */
    const pool = FISHES.filter((f) => f.zones.includes(this.zone) && (!f.rainOnly || this.weather === 2))
    const weight = (f: FishDef) => (f.rarity === 1 ? 10 : f.rarity === 2 ? 4.5 : f.rarity === 3 ? 1.4 : 0.45) * (this.weather === 2 ? 1.15 : 1)
    const total = pool.reduce((s, f) => s + weight(f), 0)
    let roll = Math.random() * total
    this.caught = pool.find((f) => (roll -= weight(f)) <= 0) ?? pool[0]
    this.fishPos = 0.5; this.fishTarget = 0.5; this.barPos = 0.5; this.prog = 0; this.reelTime = 12
    this.hint.setText('按住上提渔网，把鱼稳定在绿区！')
    bridge.onState('reel')
  }

  finishCatch() {
    const f = this.caught!
    const size = Math.round((f.base + Math.random() * f.var) * 10) / 10
    const gold = Math.round(f.gold * (0.8 + (size - f.base) / f.var * 0.4))
    bridge.onCatch({ id: f.id, name: f.name, emoji: f.emoji, rarity: f.rarity, size, gold, isNew: false })
    this.caught = null
    this.phase = 'result'
    this.time.delayedCall(1400, () => this.setIdle())
  }

  update(_t: number, delta: number) {
    const dt = delta / 1000
    /* 蓄力条 */
    if (this.phase === 'charge') {
      this.power += this.powerDir * dt * 0.9
      if (this.power >= 1) { this.power = 1; this.powerDir = -1 }
      if (this.power <= 0.05) { this.power = 0.05; this.powerDir = 1 }
    }
    /* 鱼竿线 & 浮漂连线 */
    this.rodLine.clear()
    this.rodLine.lineStyle(1.5, 0xe8e3d8, 0.55)
    if (this.bobber.visible) this.rodLine.lineBetween(70, SURFACE - 40, this.bobber.x, this.bobber.y)
    else if (this.phase === 'charge') {
      const tx = 70 + 30 + this.power * 520 * 0.35, ty = SURFACE - 40 - this.power * 40
      this.rodLine.lineBetween(70, SURFACE - 40, tx, ty)
    }
    /* 蓄力条 UI */
    if (this.phase === 'charge') {
      this.rodLine.fillStyle(0x232b3b, 0.9); this.rodLine.fillRect(W / 2 - 90, 84, 180, 12)
      this.rodLine.fillStyle(0x4dd8e6, 1); this.rodLine.fillRect(W / 2 - 88, 86, 176 * this.power, 8)
    }
    /* 收线小游戏 */
    if (this.phase === 'reel') {
      this.fishTimer -= dt
      if (this.fishTimer <= 0) {
        this.fishTimer = 0.7 + Math.random() * 1.1
        this.fishTarget = 0.1 + Math.random() * 0.8
      }
      this.fishPos += (this.fishTarget - this.fishPos) * Math.min(1, dt * 2.4)
      if (Math.random() < 0.02) this.fishTarget = 0.1 + Math.random() * 0.8
      const hold = this.input.activePointer.isDown
      this.barPos += (hold ? -0.85 : 0.75) * dt
      this.barPos = Phaser.Math.Clamp(this.barPos, 0.06, 0.94)
      const inBar = Math.abs(this.fishPos - this.barPos) < 0.16
      this.prog = Phaser.Math.Clamp(this.prog + (inBar ? 0.42 : -0.5) * dt, 0, 1)
      this.reelTime -= dt
      /* 渔井 UI */
      const bx = W / 2, byTop = 110, bh = 220
      this.rodLine.fillStyle(0x232b3b, 0.85); this.rodLine.fillRect(bx - 26, byTop, 52, bh)
      this.rodLine.fillStyle(0x2f5a3a, 1); this.rodLine.fillRect(bx - 24, byTop + (0.94 - this.barPos - 0.16) * bh, 48, 0.32 * bh)
      this.rodLine.fillStyle(0x4dd8e6, 1)
      this.rodLine.fillCircle(bx, byTop + (1 - this.fishPos) * bh, 9)
      this.rodLine.fillStyle(0xf0a832, 1)
      this.rodLine.fillRect(bx + 40, byTop + bh * (1 - this.prog), 10, bh * this.prog)
      if (this.prog >= 1) this.finishCatch()
      else if (this.reelTime <= 0) { bridge.onLose(); this.hint.setText('鱼挣脱了…'); this.phase = 'result'; this.caught = null; this.time.delayedCall(1200, () => this.setIdle()) }
    }
    /* 雨 */
    if (this.weather === 2 && Math.random() < 0.5) {
      const x = Math.random() * W, y = Math.random() * SURFACE
      this.rainGfx.lineStyle(1, 0x8fd8ec, 0.4)
      this.rainGfx.lineBetween(x, y, x - 3, y + 12)
      this.time.delayedCall(90, () => this.rainGfx.clear())
    }
  }
}

/* ---------- React 外壳：HUD / 图鉴 / 结算 ---------- */
interface DexEntry { count: number; max: number }
type Dex = Record<string, DexEntry>
function loadDex(): Dex { try { return JSON.parse(localStorage.getItem(LS_DEX) ?? '{}') } catch { return {} } }

export default function FishingSim() {
  const hostRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState('idle')
  const [weather, setWeather] = useState<Weather>(0)
  const [gold, setGold] = useState(() => { try { return Number(localStorage.getItem(LS_GOLD)) || 0 } catch { return 0 } })
  const [dex, setDex] = useState<Dex>(loadDex)
  const [card, setCard] = useState<{ id: string; name: string; emoji: string; rarity: Rarity; size: number; gold: number; isNew: boolean } | null>(null)
  const [dexOpen, setDexOpen] = useState(false)
  const [tip, setTip] = useState('')

  useEffect(() => {
    document.title = '钓鱼模拟器 — NICE.BLOG 2.0'
    bridge.onState = setState
    bridge.onWeather = setWeather
    bridge.onCatch = (f) => {
      setDex((prev) => {
        const isNew = !prev[f.id]
        const next: Dex = { ...prev, [f.id]: { count: (prev[f.id]?.count ?? 0) + 1, max: Math.max(prev[f.id]?.max ?? 0, f.size) } }
        try { localStorage.setItem(LS_DEX, JSON.stringify(next)) } catch { /* ignore */ }
        setCard({ ...f, isNew })
        return next
      })
      setGold((g) => {
        const ng = g + f.gold
        try { localStorage.setItem(LS_GOLD, String(ng)) } catch { /* ignore */ }
        return ng
      })
      setTimeout(() => setCard(null), 2200)
    }
    bridge.onLose = () => setTip('')
    const game = new Phaser.Game({
      type: Phaser.AUTO, width: W, height: H, parent: hostRef.current!,
      backgroundColor: '#0b0e14',
      physics: { default: 'arcade', arcade: { debug: false } },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: FishingScene,
    })
    ;(window as unknown as Record<string, unknown>).__fishGame = game
    return () => { game.destroy(true) }
  }, [])

  const discovered = Object.keys(dex).length
  const stateLabel: Record<string, string> = {
    idle: '🎣 待机', charge: '💪 蓄力中…', wait: '⏳ 等鱼上钩…', bite: '❗ 快点按！', reel: '🥊 收线！', result: '📦 ',
  }

  return (
    <div className="fishing">
      <div className="gm-hud">
        <span>{WEATHERS[weather].icon} {WEATHERS[weather].label}</span>
        <span>{stateLabel[state] ?? ''}</span>
        <span>💰 <b className="mono">{gold}</b></span>
        <span>📖 <b className="mono">{discovered}</b>/<i className="mono gm-target">{FISHES.length}</i></span>
        <span className="gm-hud-ops"><button onClick={() => setDexOpen(true)}>图鉴</button></span>
      </div>
      <div ref={hostRef} className="fishing-host" />
      {tip && <div className="gm-msg mono">{tip}</div>}

      {card && (
        <div className="fish-card">
          <div className="fish-card-emoji">{card.emoji}</div>
          <div>
            <b>{card.name}</b>
            {card.isNew && <i className="fish-new">NEW!</i>}
            <div className="mono muted" style={{ color: RARITY[card.rarity].color }}>{RARITY[card.rarity].label} · {card.size}cm · +{card.gold}💰</div>
          </div>
        </div>
      )}

      {dexOpen && (
        <div className="sd-modal" onClick={() => setDexOpen(false)}>
          <div className="fish-dex" onClick={(e) => e.stopPropagation()}>
            <div className="sd-fish-head"><b>📖 鱼类图鉴</b><span className="mono">{discovered}/{FISHES.length}</span><button className="sd-x" onClick={() => setDexOpen(false)}>✕</button></div>
            <div className="fish-dex-grid">
              {FISHES.map((f) => {
                const e = dex[f.id]
                return (
                  <div key={f.id} className={`fish-dex-item${e ? ' got' : ''}`} style={{ borderColor: e ? RARITY[f.rarity].color : undefined }}>
                    <span className="fish-dex-emoji">{e ? f.emoji : '❓'}</span>
                    <b>{e ? f.name : '???'}</b>
                    <i className="mono" style={{ color: RARITY[f.rarity].color }}>{RARITY[f.rarity].label}</i>
                    {e && <span className="mono muted">×{e.count} · 最大 {e.max}cm</span>}
                    {f.rainOnly && <span className="fish-rain">🌧️ 雨期限定</span>}
                  </div>
                )
              })}
            </div>
            <p className="mono muted" style={{ fontSize: 11.5 }}>越深的水域鱼越值钱；雨天上钩更快，还有雨天限定鱼出没。</p>
          </div>
        </div>
      )}
      <p className="game-sub">按住蓄力、松手甩竿——甩得越远水越深、鱼越稀有。浮漂猛地下沉时立刻点按刺鱼，收线阶段按住上提渔网套住鱼。集齐图鉴试试？</p>
    </div>
  )
}
