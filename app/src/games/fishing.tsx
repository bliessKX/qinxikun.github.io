import { useEffect, useRef, useState } from 'react'
import Phaser from 'phaser'

/* 钓鱼模拟器 —— Phaser 3。零静态资源，贴图运行时生成。
 * 视觉对标《星露谷物语》钓鱼：黄昏水面 + 木栈桥 + 像素渔夫，
 * 收线小游戏为木质竖条：长按拉杆上升、松手下坠，绿区套住鱼图标涨进度。
 * 动作：蓄力甩竿（竿身后仰→前甩）、咬钩刺鱼、收线拽杆（竿弯+震颤）、
 *       成功收鱼（鱼跃出水面划弧落袋）。
 * 天气：晴 / 多云 / 雨（雨天上钩更快且有雨天限定鱼）。
 * 图鉴：12 种鱼 × 4 档稀有度，捕获记录存 localStorage。 */

const W = 720, H = 440
const SURFACE = 216
const DOCK_X = 118
const ZONE_Y = [240, 312, 384] /* 浅 / 中 / 深 */
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
  t = 0
  /* 场景物件 */
  bobber!: Phaser.GameObjects.Image
  biteMark!: Phaser.GameObjects.Text
  rodGfx!: Phaser.GameObjects.Graphics
  waveGfx!: Phaser.GameObjects.Graphics
  uiGfx!: Phaser.GameObjects.Graphics
  rainGfx!: Phaser.GameObjects.Graphics
  tintRect!: Phaser.GameObjects.Rectangle
  heroGfx!: Phaser.GameObjects.Graphics
  fishIcon!: Phaser.GameObjects.Text
  zoneLabels: Phaser.GameObjects.Text[] = []
  knobRot = 0
  hint!: Phaser.GameObjects.Text
  ambient: Phaser.GameObjects.Image[] = []
  clouds: Phaser.GameObjects.Image[] = []
  lilies: Phaser.GameObjects.Image[] = []
  /* 鱼竿角度（rad，负=上扬） */
  rodAngle = -1.05
  rodTarget = -1.05
  /* 收线小游戏 */
  fishPos = 0.5
  fishTarget = 0.5
  fishTimer = 0
  barPos = 0.5
  prog = 0
  reelTime = 12
  caught: FishDef | null = null
  struggleSeed = 0

  constructor() { super('fishing') }

  makeTextures() {
    const g = this.add.graphics()
    /* 鱼影：纺锤身+尾鳍 */
    g.fillStyle(0x1b2836, 1)
    g.fillEllipse(14, 7, 22, 9)
    g.fillTriangle(23, 7, 27, 3, 27, 11)
    g.fillStyle(0x2a4058, 1)
    g.fillEllipse(13, 6, 16, 6)
    g.generateTexture('sil', 28, 14)
    /* 浮漂：红顶白身 */
    g.clear()
    g.fillStyle(0xe06c60, 1); g.fillCircle(5, 4, 4)
    g.fillStyle(0xf2ede2, 1); g.fillRect(3, 6, 4, 4)
    g.fillStyle(0x0b0e14, 1); g.fillRect(4, 0, 2, 2)
    g.generateTexture('bobber', 10, 11)
    /* 荷叶 */
    g.clear()
    g.fillStyle(0x4e8f4a, 1); g.fillEllipse(9, 6, 18, 10)
    g.fillStyle(0x69b061, 1); g.fillEllipse(9, 5, 14, 7)
    g.fillStyle(0xf2b6c6, 1); g.fillCircle(13, 5, 2)
    g.generateTexture('lily', 18, 12)
    /* 云 */
    g.clear()
    g.fillStyle(0xffffff, 1)
    g.fillEllipse(16, 10, 32, 12); g.fillEllipse(26, 8, 22, 10); g.fillEllipse(8, 9, 18, 9)
    g.generateTexture('cloud', 40, 18)
    /* 气泡 */
    g.clear()
    g.fillStyle(0xbfe6f2, 0.9); g.fillCircle(4, 4, 4)
    g.fillStyle(0xe8f7fc, 1); g.fillCircle(3, 3, 1.6)
    g.generateTexture('bub', 8, 8)
    /* 水花点 */
    g.clear()
    g.fillStyle(0xdff2fa, 1); g.fillCircle(3, 3, 3)
    g.generateTexture('drop', 6, 6)
    g.destroy()
  }

  splash(x: number, y: number, n = 10) {
    const p = this.add.particles(x, y, 'drop', {
      speed: { min: 40, max: 130 }, angle: { min: 200, max: 340 },
      gravityY: 420, lifespan: 520, scale: { start: 1, end: 0 }, alpha: { start: 0.9, end: 0 },
      emitting: false,
    })
    p.explode(n)
    this.time.delayedCall(900, () => p.destroy())
  }

  create() {
    this.makeTextures()
    /* 天空：黄昏渐变 */
    const sky = this.add.graphics()
    sky.fillGradientStyle(0x3d5a80, 0x3d5a80, 0x98c5dd, 0x98c5dd, 1)
    sky.fillRect(0, 0, W, SURFACE)
    /* 远山两层剪影 */
    const hills = this.add.graphics()
    hills.fillStyle(0x5b7ea0, 1)
    hills.beginPath(); hills.moveTo(0, SURFACE - 26)
    for (let x = 0; x <= W; x += 40) hills.lineTo(x, SURFACE - 26 - Math.sin(x * 0.011) * 18 - Math.sin(x * 0.031) * 6)
    hills.lineTo(W, SURFACE); hills.lineTo(0, SURFACE); hills.closePath(); hills.fillPath()
    hills.fillStyle(0x4a6b8a, 1)
    hills.beginPath(); hills.moveTo(0, SURFACE - 10)
    for (let x = 0; x <= W; x += 36) hills.lineTo(x, SURFACE - 10 - Math.sin(x * 0.017 + 2) * 12)
    hills.lineTo(W, SURFACE); hills.lineTo(0, SURFACE); hills.closePath(); hills.fillPath()
    /* 太阳 */
    const sun = this.add.graphics()
    sun.fillStyle(0xf6d389, 0.95); sun.fillCircle(W - 90, 62, 26)
    sun.fillStyle(0xf9e3ab, 0.55); sun.fillCircle(W - 90, 62, 36)
    /* 云（漂移） */
    for (let i = 0; i < 6; i++) {
      const c = this.add.image(Math.random() * W, 26 + Math.random() * 90, 'cloud')
        .setAlpha(0.5 + Math.random() * 0.3).setScale(0.7 + Math.random() * 0.9)
      this.tweens.add({ targets: c, x: '+=56', duration: 9000 + Math.random() * 8000, yoyo: true, repeat: -1 })
      this.clouds.push(c)
    }
    /* 对岸树丛剪影 */
    const bank = this.add.graphics()
    bank.fillStyle(0x3d6b4f, 1); bank.fillRect(0, SURFACE - 8, W, 8)
    for (let i = 0; i < 14; i++) {
      const bx = Math.random() * W, r = 6 + Math.random() * 9
      bank.fillCircle(bx, SURFACE - 10 - Math.random() * 6, r)
    }
    /* 水体：三层渐深 */
    const water = this.add.graphics()
    water.fillStyle(0x2e5c7d, 1); water.fillRect(0, SURFACE, W, ZONE_Y[1] - 20 - SURFACE)
    water.fillStyle(0x26506e, 1); water.fillRect(0, ZONE_Y[1] - 20, W, ZONE_Y[2] - 22 - ZONE_Y[1] + 20)
    water.fillStyle(0x1d3d56, 1); water.fillRect(0, ZONE_Y[2] - 22, W, H - ZONE_Y[2] + 22)
    /* 波光碎影 */
    for (let i = 0; i < 30; i++) {
      const gl = this.add.image(Math.random() * W, SURFACE + 8 + Math.random() * (H - SURFACE - 12), 'sil')
        .setAlpha(0.14).setScale(0.35 + Math.random() * 0.5).setTint(0x9fd4e8)
      this.tweens.add({ targets: gl, x: '+=16', duration: 1800 + Math.random() * 1800, yoyo: true, repeat: -1 })
    }
    /* 环境鱼群 */
    for (let i = 0; i < 12; i++) {
      const zi = Math.floor(Math.random() * 3)
      const img = this.add.image(Math.random() * W, ZONE_Y[zi] + (Math.random() - 0.5) * 26, 'sil')
        .setAlpha(0.45).setDepth(1)
      this.tweens.add({
        targets: img, x: Math.random() < 0.5 ? '-=150' : '+=150', duration: 4400 + Math.random() * 3800,
        yoyo: true, repeat: -1, onYoyo: () => img.setFlipX(!img.flipX), onRepeat: () => img.setFlipX(!img.flipX),
      })
      this.ambient.push(img)
    }
    /* 荷叶漂在水面 */
    for (let i = 0; i < 5; i++) {
      const li = this.add.image(150 + Math.random() * (W - 200), SURFACE + 4 + Math.random() * 8, 'lily')
        .setDepth(2).setAlpha(0.9)
      this.tweens.add({ targets: li, x: '+=10', y: '+=1.5', duration: 2400 + Math.random() * 1600, yoyo: true, repeat: -1 })
      this.lilies.push(li)
    }
    /* 深水气泡 */
    this.time.addEvent({ delay: 700, loop: true, callback: () => {
      if (this.phase === 'result') return
      const x = 140 + Math.random() * (W - 180)
      const b = this.add.image(x, H - 8, 'bub').setAlpha(0.5).setScale(0.5 + Math.random() * 0.6).setDepth(1)
      this.tweens.add({ targets: b, y: ZONE_Y[1] - 10, alpha: 0, duration: 2200 + Math.random() * 1500, onComplete: () => b.destroy() })
    } })
    /* 木栈桥 */
    const dock = this.add.graphics()
    dock.fillStyle(0x6d4a2b, 1); dock.fillRect(0, SURFACE - 16, DOCK_X, 12)
    dock.fillStyle(0x8a6238, 1)
    for (let x = 0; x < DOCK_X; x += 20) dock.fillRect(x + 1, SURFACE - 16, 17, 12)
    dock.fillStyle(0x5a3d24, 1)
    for (let x = 10; x < DOCK_X; x += 34) dock.fillRect(x, SURFACE - 6, 7, 18)
    /* 栈桥上小物：木桶 + 灯笼 */
    dock.fillStyle(0x7a5a34, 1); dock.fillRect(24, SURFACE - 34, 14, 18)
    dock.fillStyle(0x5a3d24, 1); dock.fillRect(24, SURFACE - 36, 14, 4)
    dock.fillStyle(0x4a3c2c, 1); dock.fillRect(22, SURFACE - 30, 3, 8)
    dock.fillStyle(0xf0a832, 1); dock.fillCircle(88, SURFACE - 34, 4)
    dock.fillStyle(0x3a2c1e, 1); dock.fillRect(86, SURFACE - 46, 4, 12)
    dock.setDepth(5)
    /* 渔夫（像素小人：草帽+背带裤） */
    this.heroGfx = this.add.graphics().setDepth(6)
    this.drawHero()
    /* 游戏对象 */
    this.bobber = this.add.image(70, SURFACE + 6, 'bobber').setVisible(false).setDepth(6)
    this.biteMark = this.add.text(0, 0, '❗', { fontSize: '22px', color: '#f0a832' }).setOrigin(0.5).setVisible(false).setDepth(9)
    this.rodGfx = this.add.graphics().setDepth(7)
    this.waveGfx = this.add.graphics().setDepth(3)
    this.uiGfx = this.add.graphics().setDepth(10)
    this.rainGfx = this.add.graphics().setDepth(8)
    this.tintRect = this.add.rectangle(W / 2, H / 2, W, H, 0x1a2634, 0).setDepth(9)
    /* 钓鱼条里的鱼图标 */
    this.fishIcon = this.add.text(0, 0, '🐟', { fontSize: '17px' }).setOrigin(0.5).setVisible(false).setDepth(11)
    this.hint = this.add.text(W / 2, 56, '', { fontFamily: 'Consolas, monospace', fontSize: '15px', color: '#f2ede2', backgroundColor: '#1c2a3acc', padding: { x: 10, y: 5 } })
      .setOrigin(0.5).setDepth(12)
    /* 深度标尺（常驻文本，按阶段显隐） */
    const marks: Array<[string, number]> = [['浅水', ZONE_Y[0]], ['深水', ZONE_Y[1]], ['渊水', ZONE_Y[2]]]
    for (const [label, y] of marks) {
      this.zoneLabels.push(this.add.text(W - 32, y - 8, label, { fontFamily: 'Consolas, monospace', fontSize: '12px', color: '#f2ede2' }).setAlpha(0.55).setDepth(10))
    }

    /* 输入 */
    this.input.on('pointerdown', () => this.onDown())
    this.input.on('pointerup', () => this.onUp())

    this.pickWeather()
    this.setIdle()
  }

  drawHero() {
    const h = this.heroGfx
    h.clear()
    const fy = SURFACE
    /* 腿（背带裤蓝） */
    h.fillStyle(0x3f6d9e, 1); h.fillRect(58, fy - 24, 5, 14); h.fillRect(66, fy - 24, 5, 14)
    h.fillStyle(0x2c3e50, 1); h.fillRect(56, fy - 11, 8, 4); h.fillRect(64, fy - 11, 8, 4)
    /* 身体（格子衫橙） */
    h.fillStyle(0xd97f4e, 1); h.fillRect(55, fy - 40, 19, 18)
    h.fillStyle(0x3f6d9e, 1); h.fillRect(60, fy - 40, 3, 18); h.fillRect(67, fy - 40, 3, 18)
    /* 头 + 草帽 */
    h.fillStyle(0xf0c8a0, 1); h.fillRect(58, fy - 52, 13, 13)
    h.fillStyle(0x0b0e14, 1); h.fillRect(67, fy - 47, 2, 2)
    h.fillStyle(0xd9b45c, 1); h.fillRect(54, fy - 55, 21, 4)
    h.fillStyle(0xe8c877, 1); h.fillRect(59, fy - 60, 11, 5)
  }

  pickWeather() {
    const r = Math.random()
    this.weather = (r < 0.45 ? 0 : r < 0.75 ? 1 : 2) as Weather
    bridge.onWeather(this.weather)
    /* 天气氛围：色罩 */
    this.tintRect.setFillStyle(0x1a2634, this.weather === 2 ? 0.22 : this.weather === 1 ? 0.1 : 0)
  }

  setIdle() {
    this.phase = 'idle'
    this.bobber.setVisible(false); this.biteMark.setVisible(false)
    this.fishIcon.setVisible(false)
    this.hint.setText('按住屏幕蓄力，松手甩竿 🎣')
    this.rodTarget = -1.05
    bridge.onState('idle')
  }

  onDown() {
    if (this.phase === 'idle') { this.phase = 'charge'; this.power = 0.08; this.powerDir = 1; this.hint.setText('') }
    else if (this.phase === 'wait') return
    else if (this.phase === 'bite') this.hooked()
  }

  onUp() {
    if (this.phase === 'charge') this.cast()
    else if (this.phase === 'bite') this.missBite()
  }

  cast() {
    this.phase = 'cast'
    this.rodTarget = 0.75 /* 前甩 */
    const dist = 60 + this.power * 520
    this.castX = Phaser.Math.Clamp(DOCK_X + 30 + dist, DOCK_X + 40, W - 24)
    this.zone = this.castX < 300 ? 0 : this.castX < 500 ? 1 : 2
    this.bobber.setVisible(true).setPosition(76, SURFACE - 52)
    const peak = SURFACE - 46 - this.power * 60
    this.tweens.chain({
      targets: this.bobber,
      tweens: [
        { x: this.castX, y: peak, duration: 340, ease: 'Quad.easeOut' },
        { y: SURFACE + 8, duration: 280, ease: 'Quad.easeIn', onComplete: () => { this.splash(this.castX, SURFACE + 4, 12); this.startWait() } },
      ],
    })
    this.time.delayedCall(360, () => { if (this.phase === 'cast') this.rodTarget = -0.9 })
    bridge.onState('wait')
  }

  startWait() {
    this.phase = 'wait'
    this.rodTarget = -0.9
    const boost = WEATHERS[this.weather].boost
    const deepBias = this.zone === 2 ? 0.75 : this.zone === 1 ? 1 : 1.2
    const wait = (1800 + Math.random() * 4200) / (boost * deepBias)
    this.time.delayedCall(wait, () => {
      if (this.phase !== 'wait') return
      this.phase = 'bite'
      this.rodTarget = -0.45
      this.biteMark.setPosition(this.bobber.x, SURFACE - 30).setVisible(true)
      this.tweens.add({ targets: this.bobber, y: SURFACE + 24, duration: 120, yoyo: true, repeat: 3 })
      this.splash(this.bobber.x, SURFACE + 6, 5)
      this.time.delayedCall(1100, () => { if (this.phase === 'bite') this.missBite(true) })
    })
    this.time.delayedCall(14000, () => { if (this.phase === 'wait') { this.setIdle(); bridge.onLose() } })
  }

  missBite(silent = false) {
    this.tweens.killTweensOf(this.bobber)
    this.bobber.setPosition(this.bobber.x, SURFACE + 8)
    this.rodTarget = -1.05
    if (!silent) this.hint.setText('跑了…再试一次')
    else this.hint.setText('鱼群散了，重新甩竿')
    this.time.delayedCall(700, () => { if (this.phase !== 'idle') this.setIdle() })
  }

  hooked() {
    this.phase = 'reel'
    this.biteMark.setVisible(false)
    this.rodTarget = -0.35 /* 拽鱼拉杆：竿被压弯 */
    const pool = FISHES.filter((f) => f.zones.includes(this.zone) && (!f.rainOnly || this.weather === 2))
    const weight = (f: FishDef) => (f.rarity === 1 ? 10 : f.rarity === 2 ? 4.5 : f.rarity === 3 ? 1.4 : 0.45) * (this.weather === 2 ? 1.15 : 1)
    const total = pool.reduce((s, f) => s + weight(f), 0)
    let roll = Math.random() * total
    this.caught = pool.find((f) => (roll -= weight(f)) <= 0) ?? pool[0]
    this.fishPos = 0.5; this.fishTarget = 0.5; this.barPos = 0.5; this.prog = 0; this.reelTime = 12
    this.struggleSeed = Math.random() * 100
    this.fishIcon.setVisible(true)
    this.hint.setText('长按拉杆上升，让绿区套住鱼！')
    bridge.onState('reel')
  }

  /* 收鱼成功：鱼跃出水面划弧落向渔夫 */
  finishCatch() {
    const f = this.caught!
    const size = Math.round((f.base + Math.random() * f.var) * 10) / 10
    const gold = Math.round(f.gold * (0.8 + (size - f.base) / f.var * 0.4))
    this.splash(this.bobber.x, SURFACE + 4, 16)
    const leaper = this.add.text(this.bobber.x, SURFACE, f.emoji, { fontSize: '30px' }).setOrigin(0.5).setDepth(11)
    this.tweens.chain({
      targets: leaper,
      tweens: [
        { x: (this.bobber.x + 76) / 2, y: SURFACE - 90, angle: -30, duration: 380, ease: 'Quad.easeOut' },
        { x: 80, y: SURFACE - 46, angle: 20, duration: 340, ease: 'Quad.easeIn',
          onComplete: () => { leaper.destroy(); this.splash(80, SURFACE - 20, 6) } },
      ],
    })
    const cheer = this.add.text(W / 2, 100, `钓到了！${f.name}！`, { fontFamily: 'Consolas, monospace', fontSize: '20px', color: RARITY[f.rarity].color, stroke: '#0b0e14', strokeThickness: 4 })
      .setOrigin(0.5).setDepth(12)
    this.tweens.add({ targets: cheer, y: 86, alpha: 0, duration: 1300, onComplete: () => cheer.destroy() })
    bridge.onCatch({ id: f.id, name: f.name, emoji: f.emoji, rarity: f.rarity, size, gold, isNew: false })
    this.caught = null
    this.phase = 'result'
    this.fishIcon.setVisible(false)
    this.rodTarget = -1.2
    this.time.delayedCall(1500, () => this.setIdle())
  }

  update(_t: number, delta: number) {
    this.t += delta / 1000
    const dt = delta / 1000
    /* 蓄力 */
    if (this.phase === 'charge') {
      this.power += this.powerDir * dt * 0.9
      if (this.power >= 1) { this.power = 1; this.powerDir = -1 }
      if (this.power <= 0.05) { this.power = 0.05; this.powerDir = 1 }
      this.rodTarget = -1.05 - this.power * 0.55 /* 竿身后仰 */
    }
    /* 收线小游戏：鱼 AI + 拉杆 */
    if (this.phase === 'reel') {
      this.fishTimer -= dt
      if (this.fishTimer <= 0) {
        this.fishTimer = 0.7 + Math.random() * 1.1
        this.fishTarget = 0.1 + Math.random() * 0.8
      }
      this.fishPos += (this.fishTarget - this.fishPos) * Math.min(1, dt * 2.4)
      if (Math.random() < 0.02) this.fishTarget = 0.1 + Math.random() * 0.8
      const hold = this.input.activePointer.isDown
      this.barPos += (hold ? 0.9 : -0.8) * dt /* 按住上升，松手下坠 */
      this.barPos = Phaser.Math.Clamp(this.barPos, 0.1, 0.9) /* 让绿区始终留在木框内 */
      const inBar = Math.abs(this.fishPos - this.barPos) < 0.16
      this.prog = Phaser.Math.Clamp(this.prog + (inBar ? 0.42 : -0.5) * dt, 0, 1)
      this.reelTime -= dt
      this.knobRot += dt * (inBar ? 5 : 1.6)
      /* 拽杆震颤 */
      this.rodTarget = -0.35 + Math.sin(this.t * 22 + this.struggleSeed) * 0.18
      if (Math.random() < 0.1) this.splash(this.bobber.x + (Math.random() - 0.5) * 30, SURFACE + 6, 2)
      if (this.prog >= 1) { this.finishCatch(); return }
      if (this.reelTime <= 0) {
        bridge.onLose(); this.hint.setText('鱼挣脱了…')
        this.phase = 'result'; this.caught = null; this.fishIcon.setVisible(false)
        this.rodTarget = -1.05
        this.time.delayedCall(1200, () => this.setIdle())
      }
    }
    /* 鱼竿角度缓动 + 绘制 */
    this.rodAngle += (this.rodTarget - this.rodAngle) * Math.min(1, dt * 10)
    const hx = 66, hy = SURFACE - 42, L = 42
    const tx = hx + Math.cos(this.rodAngle) * L, ty = hy + Math.sin(this.rodAngle) * L
    const rg = this.rodGfx
    rg.clear()
    rg.fillStyle(0x8a5a2b, 1)
    rg.lineStyle(3.5, 0xa86f38, 1)
    rg.lineBetween(hx, hy, tx, ty)
    /* 手柄缠线轮 */
    rg.fillStyle(0x5a3d24, 1); rg.fillCircle(hx + 3, hy + 5, 4)
    rg.fillStyle(0xd9cfc0, 1); rg.fillCircle(hx + 3, hy + 5, 2)
    /* 鱼线 */
    rg.lineStyle(1.2, 0xf2ede2, 0.6)
    if (this.bobber.visible && (this.phase === 'wait' || this.phase === 'bite')) {
      /* 收线张力：微弯抖动 */
      const sag = this.phase === 'bite' ? 4 : 10
      const mx = (tx + this.bobber.x) / 2, my = (ty + this.bobber.y) / 2 + sag + Math.sin(this.t * 6) * 2
      rg.beginPath(); rg.moveTo(tx, ty); rg.lineTo(mx, my); rg.lineTo(this.bobber.x, this.bobber.y); rg.strokePath()
    } else if (this.phase === 'reel') {
      /* 拽鱼：绷紧直线 + 高频微颤 */
      const jx = Math.sin(this.t * 40) * 1.5
      rg.lineBetween(tx, ty, this.bobber.x + jx, this.bobber.y)
    } else if (this.phase === 'charge') {
      const ptx = hx + 30 + this.power * 520 * 0.3, pty = hy - this.power * 34
      rg.lineBetween(tx, ty, ptx, pty)
    }
    /* 水面波纹线 */
    const wg = this.waveGfx
    wg.clear()
    wg.lineStyle(2, 0x9fd4e8, 0.5)
    wg.beginPath()
    for (let x = 0; x <= W; x += 14) wg.lineTo(x, SURFACE + Math.sin(this.t * 2.2 + x * 0.045) * 2.4)
    wg.strokePath()
    wg.lineStyle(1, 0x9fd4e8, 0.22)
    wg.beginPath()
    for (let x = 6; x <= W; x += 18) wg.lineTo(x, SURFACE + 9 + Math.sin(this.t * 1.7 + x * 0.05 + 1.3) * 2)
    wg.strokePath()
    /* 雨 */
    if (this.weather === 2) {
      const rgn = this.rainGfx
      rgn.clear()
      rgn.lineStyle(1, 0xa8d4e8, 0.45)
      for (let i = 0; i < 40; i++) {
        const x = (i * 61 + this.t * 320) % (W + 40) - 20
        const y = (i * 37 + this.t * 560) % (SURFACE + 30)
        rgn.lineBetween(x, y, x - 4, y + 13)
      }
      if (Math.random() < 0.25) this.splash(Math.random() * W, SURFACE + 3, 1)
    }
    /* ---------- UI 绘制 ---------- */
    const ui = this.uiGfx
    ui.clear()
    /* 蓄力条（木框） */
    if (this.phase === 'charge') {
      const bx = W / 2 - 96, by = 78, bw = 192, bh = 16
      ui.fillStyle(0x1c2a3a, 0.9); ui.fillRoundedRect(bx - 3, by - 3, bw + 6, bh + 6, 5)
      ui.fillStyle(0x8a5a2b, 1); ui.fillRoundedRect(bx, by, bw, bh, 4)
      ui.fillStyle(0x2f5a3a, 1); ui.fillRect(bx + 2, by + 2, bw - 4, bh - 4)
      const pw = (bw - 6) * this.power
      ui.fillStyle(this.power > 0.8 ? 0xe0b040 : 0x4dd8e6, 1); ui.fillRect(bx + 3, by + 3, pw, bh - 6)
      ui.lineStyle(1, 0x5a3d24, 1); ui.strokeRoundedRect(bx, by, bw, bh, 4)
      ui.fillStyle(0xf2ede2, 1).setAlpha(1)
      /* 分段刻度 */
      for (let i = 1; i < 5; i++) { ui.fillStyle(0x1c2a3a, 0.5); ui.fillRect(bx + (bw / 5) * i, by + 3, 1, bh - 6) }
    }
    /* 星露谷式收线竖条 */
    if (this.phase === 'reel') {
      const bx = W / 2, byTop = 104, bh = 232
      const bw = 46
      /* 木外框（圆角+顶底盖） */
      ui.fillStyle(0x5a3d24, 1); ui.fillRoundedRect(bx - bw / 2 - 6, byTop - 6, bw + 12, bh + 12, 9)
      ui.fillStyle(0xd99c55, 1); ui.fillRoundedRect(bx - bw / 2 - 3, byTop - 3, bw + 6, bh + 6, 7)
      ui.fillStyle(0x14231c, 1); ui.fillRect(bx - bw / 2, byTop, bw, bh)
      ui.fillStyle(0x1e3328, 1); ui.fillRect(bx - bw / 2 + 2, byTop + 2, bw - 4, bh - 4)
      /* 竖导轨纹 */
      ui.fillStyle(0x8a5a2b, 1)
      ui.fillRect(bx - bw / 2 - 6, byTop - 6, 5, bh + 12)
      ui.fillRect(bx + bw / 2 + 1, byTop - 6, 5, bh + 12)
      /* 顶部浮漂帽 / 底部渔线轮 */
      ui.fillStyle(0xe06c60, 1); ui.fillRoundedRect(bx - 9, byTop - 14, 18, 9, 3)
      ui.fillStyle(0xf2ede2, 1); ui.fillRoundedRect(bx - 9, byTop - 8, 18, 4, 2)
      /* 绿色接鱼区 */
      const zy = byTop + (0.94 - this.barPos - 0.16) * bh
      ui.fillStyle(0x64d24b, 1); ui.fillRoundedRect(bx - bw / 2 + 2, zy, bw - 4, 0.32 * bh, 6)
      ui.fillStyle(0x8ee672, 0.85); ui.fillRect(bx - bw / 2 + 5, zy + 3, bw - 10, 4)
      ui.fillStyle(0x3f9e30, 0.6); ui.fillRect(bx - bw / 2 + 2, zy + 0.32 * bh - 3, bw - 4, 3)
      /* 鱼图标 */
      this.fishIcon.setPosition(bx, byTop + (1 - this.fishPos) * bh)
      this.fishIcon.setAngle(Math.sin(this.t * 9) * 12)
      /* 右侧进度轨 */
      const px = bx + bw / 2 + 16, pw = 12
      ui.fillStyle(0x5a3d24, 1); ui.fillRoundedRect(px - 3, byTop - 6, pw + 6, bh + 12, 6)
      ui.fillStyle(0x14231c, 1); ui.fillRect(px, byTop, pw, bh)
      ui.fillStyle(0x64d24b, 1)
      ui.fillRect(px + 2, byTop + bh * (1 - this.prog), pw - 4, bh * this.prog - 2)
      ui.fillStyle(0xf0d048, 1)
      ui.fillRect(px + 2, byTop + bh * (1 - this.prog) - 1, pw - 4, 3)
      /* 渔线轮旋钮 */
      ui.fillStyle(0x8a5a2b, 1); ui.fillCircle(bx - bw / 2 - 10, byTop + bh - 12, 8)
      ui.fillStyle(0xd99c55, 1); ui.fillCircle(bx - bw / 2 - 10, byTop + bh - 12, 5)
      const kx = Math.cos(this.knobRot) * 4, ky = Math.sin(this.knobRot) * 4
      ui.fillStyle(0x5a3d24, 1)
      ui.fillCircle(bx - bw / 2 - 10 + kx, byTop + bh - 12 + ky, 2)
    }
    /* 深度标尺显隐 */
    const showMarks = this.phase === 'idle' || this.phase === 'charge' || this.phase === 'wait'
    for (const zl of this.zoneLabels) zl.setVisible(showMarks)
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
    idle: '🎣 待机', charge: '💪 蓄力中…', wait: '⏳ 等鱼上钩…', bite: '❗ 快点按！', reel: '🥊 拉杆收线！', result: '📦 结算…',
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
      <p className="game-sub">按住蓄力、松手甩竿——甩得越远水越深、鱼越稀有。浮漂猛地下沉时立刻点按刺鱼；收线阶段长按拉杆上升、松手下坠，让绿区套住乱窜的鱼。集齐图鉴试试？</p>
    </div>
  )
}
