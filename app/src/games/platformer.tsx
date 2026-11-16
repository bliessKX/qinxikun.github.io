import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as RPointerEvent } from 'react'
import Phaser from 'phaser'

/* 平台跳跃 —— Phaser 3 横版闯关。
 * 全部贴图运行时 Graphics 生成，零静态资源。
 * 方向键/WASD 移动，空格/↑ 跳；触屏：左右按钮移动、点按右侧跳。
 * 收金币加分，踩尖刺损命，到达旗帜过关（3 关，逐渐加长）。 */

const W = 720, H = 420

const LEVELS: Array<{ plats: Array<[number, number, number]>, coins: Array<[number, number]>, spikes: Array<[number, number]>, flag: [number, number] }> = [
  {
    plats: [[0, 360, 240], [300, 320, 130], [490, 280, 140], [660, 220, 120]],
    coins: [[330, 280], [380, 280], [520, 240], [560, 240], [690, 180]],
    spikes: [[240, 384], [430, 384], [620, 384]],
    flag: [700, 170],
  },
  {
    plats: [[0, 360, 160], [220, 300, 100], [380, 240, 100], [540, 300, 90], [660, 200, 110]],
    coins: [[250, 260], [410, 200], [450, 200], [570, 260], [690, 160]],
    spikes: [[180, 384], [340, 384], [500, 384], [620, 384]],
    flag: [710, 150],
  },
  {
    plats: [[0, 360, 120], [180, 320, 80], [320, 270, 70], [450, 220, 70], [580, 270, 70], [690, 200, 90]],
    coins: [[210, 280], [350, 230], [480, 180], [610, 230], [720, 160]],
    spikes: [[140, 384], [280, 384], [400, 384], [520, 384], [640, 384]],
    flag: [730, 150],
  },
]

/* React ↔ Phaser 桥 */
const bridge = {
  onScore: (_s: number) => {},
  onLevel: (_l: number) => {},
  onLives: (_l: number) => {},
  onWin: () => {},
  onDead: () => {},
}

class PlatformerScene extends Phaser.Scene {
  player!: Phaser.Physics.Arcade.Sprite
  plats!: Phaser.Physics.Arcade.StaticGroup
  coins!: Phaser.Physics.Arcade.StaticGroup
  spikes!: Phaser.Physics.Arcade.StaticGroup
  flagBox!: Phaser.Physics.Arcade.StaticGroup
  level = 0
  score = 0
  lives = 3
  touchLeft = false
  touchRight = false
  touchJump = false
  jumpCd = 0

  constructor() { super('platformer') }

  makeTextures() {
    const g = this.add.graphics()
    /* 砖块平台 */
    g.fillStyle(0x2a4260, 1); g.fillRect(0, 0, 32, 16)
    g.fillStyle(0x3f6d9e, 1); g.fillRect(0, 0, 32, 4)
    g.generateTexture('brick', 32, 16)
    /* 玩家：琥珀方块+眼睛 */
    g.clear()
    g.fillStyle(0xf0a832, 1); g.fillRect(0, 0, 20, 24)
    g.fillStyle(0x0b0e14, 1); g.fillRect(12, 6, 4, 5); g.fillRect(5, 6, 4, 5)
    g.generateTexture('hero', 20, 24)
    /* 金币 */
    g.clear()
    g.fillStyle(0xf0d048, 1); g.fillCircle(8, 8, 7)
    g.fillStyle(0xf0a832, 1); g.fillCircle(8, 8, 4)
    g.generateTexture('coin', 16, 16)
    /* 尖刺 */
    g.clear()
    g.fillStyle(0xe06c60, 1)
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(i * 8, 12); g.lineTo(i * 8 + 4, 0); g.lineTo(i * 8 + 8, 12); g.closePath(); g.fillPath() }
    g.generateTexture('spike', 32, 12)
    /* 旗帜 */
    g.clear()
    g.fillStyle(0x7bc96f, 1); g.fillRect(0, 0, 4, 40)
    g.fillStyle(0x4dd8e6, 1); g.beginPath(); g.moveTo(4, 2); g.lineTo(24, 8); g.lineTo(4, 16); g.closePath(); g.fillPath()
    g.generateTexture('flag', 24, 40)
    g.destroy()
  }

  loadLevel(idx: number) {
    this.level = idx
    const L = LEVELS[idx]
    this.plats?.destroy(true)
    this.coins?.destroy(true)
    this.spikes?.destroy(true)
    this.flagBox?.destroy(true)
    this.plats = this.physics.add.staticGroup()
    this.coins = this.physics.add.staticGroup()
    this.spikes = this.physics.add.staticGroup()
    this.flagBox = this.physics.add.staticGroup()
    for (const [x, y, w] of L.plats) {
      for (let bx = 0; bx < w; bx += 32) this.plats.create(x + bx + 16, y + 8, 'brick')
    }
    for (const [x, y] of L.coins) this.coins.create(x, y, 'coin')
    for (const [x, y] of L.spikes) this.spikes.create(x, y, 'spike')
    this.flagBox.create(L.flag[0], L.flag[1], 'flag')
    this.physics.add.collider(this.player, this.plats)
    this.physics.add.overlap(this.player, this.coins, (_p, c) => {
      const coin = c as Phaser.Physics.Arcade.Sprite
      coin.destroy()
      this.score += 10
      bridge.onScore(this.score)
      this.tweens.add({ targets: this.add.text(coin.x, coin.y - 6, '+10', { fontFamily: 'Consolas', fontSize: '13px', color: '#f0d048' }), y: coin.y - 30, alpha: 0, duration: 500, onComplete: (t) => (t.targets[0] as Phaser.GameObjects.Text).destroy() })
    })
    this.physics.add.overlap(this.player, this.spikes, () => this.hurt())
    this.physics.add.overlap(this.player, this.flagBox, () => this.pass())
    bridge.onLevel(idx + 1)
  }

  create() {
    this.makeTextures()
    this.score = 0; this.lives = 3
    bridge.onScore(0); bridge.onLives(3)

    this.player = this.physics.add.sprite(40, 320, 'hero')
    this.player.setCollideWorldBounds(true)
    this.player.setGravityY(900)

    this.loadLevel(0)

    const kb = this.input.keyboard!
    kb.on('keydown-SPACE', () => this.tryJump())
    kb.on('keydown-UP', () => this.tryJump())

    /* 触屏控制由 React 按钮写入 bridge 触发 */
    ;(window as unknown as Record<string, unknown>).__pfTouch = (dir: 'l' | 'r' | 'j', down: boolean) => {
      if (dir === 'l') this.touchLeft = down
      if (dir === 'r') this.touchRight = down
      if (dir === 'j') this.touchJump = down
    }
  }

  tryJump() {
    if (!this.player.body.touching.down && this.jumpCd > 0) return
    if (this.player.body.touching.down) {
      this.player.setVelocityY(-470)
      this.jumpCd = 220
    }
  }

  hurt() {
    if (this.lives <= 0) return
    this.lives -= 1
    bridge.onLives(this.lives)
    this.cameras.main.shake(120, 0.008)
    this.player.setPosition(40, 320).setVelocity(0, 0)
    if (this.lives <= 0) { bridge.onDead(); this.scene.restart() }
  }

  pass() {
    if (this.level >= LEVELS.length - 1) { bridge.onWin(); this.scene.restart(); return }
    this.loadLevel(this.level + 1)
    this.player.setPosition(40, 320).setVelocity(0, 0)
  }

  update(_t: number, delta: number) {
    this.jumpCd = Math.max(0, this.jumpCd - delta)
    const kb = this.input.keyboard!
    const left = this.touchLeft || kb.addKey('A').isDown || this.input.keyboard!.addKey('LEFT').isDown
    const right = this.touchRight || kb.addKey('D').isDown || this.input.keyboard!.addKey('RIGHT').isDown
    this.player.setVelocityX(left && !right ? -190 : right && !left ? 190 : 0)
    if (this.touchJump || kb.addKey('SPACE').isDown || kb.addKey('UP').isDown || kb.addKey('W').isDown) this.tryJump()
  }
}

export default function Platformer() {
  const hostRef = useRef<HTMLDivElement>(null)
  const [score, setScore] = useState(0)
  const [level, setLevel] = useState(1)
  const [lives, setLives] = useState(3)
  const [win, setWin] = useState(false)

  useEffect(() => {
    document.title = '平台跳跃 — NICE.BLOG 2.0'
    bridge.onScore = setScore
    bridge.onLevel = setLevel
    bridge.onLives = setLives
    bridge.onWin = () => setWin(true)
    bridge.onDead = () => setWin(false)
    const game = new Phaser.Game({
      type: Phaser.AUTO, width: W, height: H, parent: hostRef.current!,
      backgroundColor: '#0b0e14',
      physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: PlatformerScene,
    })
    ;(window as unknown as Record<string, unknown>).__pfGame = game
    return () => { game.destroy(true) }
  }, [])

  const hold = (dir: 'l' | 'r' | 'j', down: boolean) => {
    const w = window as unknown as { __pfTouch?: (d: 'l' | 'r' | 'j', b: boolean) => void }
    w.__pfTouch?.(dir, down)
  }
  const padProps = (dir: 'l' | 'r' | 'j') => ({
    onPointerDown: (e: RPointerEvent<HTMLButtonElement>) => { e.preventDefault(); hold(dir, true) },
    onPointerUp: () => hold(dir, false),
    onPointerLeave: () => hold(dir, false),
    onPointerCancel: () => hold(dir, false),
  })

  return (
    <div className="platformer">
      <div className="gm-hud">
        <span>分数 <b className="mono">{score}</b></span>
        <span>关卡 <b className="mono">{level}/3</b></span>
        <span>生命 <b className="mono">{'◆'.repeat(Math.max(lives, 0))}</b></span>
        {win && <span className="gm-chain">🏆 三关全通！</span>}
      </div>
      <div ref={hostRef} className="pf-host" />
      {/* 触屏虚拟键：仅触控设备显示 */}
      <div className="pf-pad">
        <div className="pf-dpad">
          <button type="button" className="pf-btn pf-l" {...padProps('l')} aria-label="向左">◀</button>
          <button type="button" className="pf-btn pf-r" {...padProps('r')} aria-label="向右">▶</button>
        </div>
        <button type="button" className="pf-btn pf-j" {...padProps('j')} aria-label="跳跃">⬆ 跳</button>
      </div>
      <p className="game-sub">←→/AD 移动，空格/↑ 跳跃；收集金币、躲开红色尖刺、抵达绿色旗帜过关，共 3 关。手机用屏幕左右键与跳跃键。</p>
    </div>
  )
}
