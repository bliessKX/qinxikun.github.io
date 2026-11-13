import { useEffect, useRef, useState } from 'react'
import Phaser from 'phaser'

/* 星河突击 —— Phaser 3 太空射击。
 * 全部贴图运行时用 Graphics.generateTexture 生成，零静态资源。
 * 玩法：←→/AD 移动，空格或点击射击；敌机编队左右压进 + 随机俯冲，
 *       击落敌机得分，每 5 波提速；被撞或中弹扣命，3 命通关无尽模式。 */

const W = 720, H = 480

const PALETTE = {
  bg: 0x0b0e14,
  amber: 0xf0a832,
  cyan: 0x4dd8e6,
  green: 0x7bc96f,
  red: 0xe06c60,
  dim: 0x232b3b,
  ink: 0xe8e3d8,
}

function makeTextures(scene: Phaser.Scene) {
  const g = scene.add.graphics()
  /* 玩家战机：三角 */
  g.fillStyle(PALETTE.amber, 1)
  g.beginPath(); g.moveTo(18, 0); g.lineTo(0, 32); g.lineTo(36, 32); g.closePath(); g.fillPath()
  g.fillStyle(PALETTE.cyan, 1)
  g.fillRect(15, 26, 6, 6)
  g.generateTexture('player', 36, 32)
  /* 敌机：倒三角 + 底触角 */
  g.clear()
  g.fillStyle(PALETTE.red, 1)
  g.beginPath(); g.moveTo(16, 28); g.lineTo(0, 4); g.lineTo(32, 4); g.closePath(); g.fillPath()
  g.fillStyle(PALETTE.red, 1)
  g.fillRect(14, 0, 4, 8)
  g.generateTexture('enemy', 32, 32)
  /* 俯冲敌机 */
  g.clear()
  g.fillStyle(PALETTE.cyan, 1)
  g.beginPath(); g.moveTo(16, 26); g.lineTo(0, 4); g.lineTo(32, 4); g.closePath(); g.fillPath()
  g.generateTexture('diver', 32, 32)
  /* 子弹 */
  g.clear()
  g.fillStyle(PALETTE.cyan, 1); g.fillRect(0, 0, 4, 12)
  g.generateTexture('bullet', 4, 12)
  g.clear()
  g.fillStyle(PALETTE.red, 1); g.fillRect(0, 0, 4, 10)
  g.generateTexture('ebullet', 4, 10)
  /* 星尘 */
  g.clear()
  g.fillStyle(0xffffff, 0.5); g.fillRect(0, 0, 2, 2)
  g.generateTexture('star', 2, 2)
  g.destroy()
}

/* React ↔ Phaser 的回调桥：React 挂载前写入，场景 create 时读取。 */
const bridge = { onGameOver: (_score: number, _wave: number) => {} }

class ShooterScene extends Phaser.Scene {
  player!: Phaser.Physics.Arcade.Image
  bullets!: Phaser.Physics.Arcade.Group
  ebullets!: Phaser.Physics.Arcade.Group
  enemies!: Phaser.Physics.Arcade.Group
  stars!: Phaser.Physics.Arcade.Group
  cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  score = 0
  lives = 3
  wave = 1
  canFire = 0
  enemyDir = 1
  enemySpeed = 40
  fireCd = 900 /* 敌方编队开火间隔 ms */
  nextFire = 0
  nextDive = 0
  infoText!: Phaser.GameObjects.Text
  bannerText!: Phaser.GameObjects.Text
  running = false

  constructor() { super('shooter') }

  create() {
    makeTextures(this)
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.score = 0; this.lives = 3; this.wave = 1
    this.enemyDir = 1; this.enemySpeed = 40; this.fireCd = 900
    this.running = false

    /* 星野背景 */
    this.stars = this.physics.add.group()
    for (let i = 0; i < 60; i++) {
      const s = this.stars.create(Math.random() * W, Math.random() * H, 'star') as Phaser.Physics.Arcade.Image
      s.setVelocityY(20 + Math.random() * 60)
      s.setDepth(-10)
    }

    this.player = this.physics.add.image(W / 2, H - 50, 'player')
    this.player.setDamping(true).setDrag(0.88)
    this.player.setCollideWorldBounds(true)

    this.bullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 30 })
    this.ebullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 40 })
    this.enemies = this.physics.add.group()

    this.infoText = this.add.text(12, 10, '', {
      fontFamily: 'Consolas, monospace', fontSize: '14px', color: '#e8e3d8',
    })
    this.bannerText = this.add.text(W / 2, H / 2 - 40, '', {
      fontFamily: 'Consolas, monospace', fontSize: '28px', color: '#f0a832', align: 'center',
    }).setOrigin(0.5).setDepth(50)
    this.showBanner(`WAVE ${this.wave}`, '按空格或点击开始')
    this.input.keyboard!.on('keydown-SPACE', () => this.startOrRestart())
    this.input.on('pointerdown', () => this.startOrRestart())

    /* 子弹 × 敌机 */
    this.physics.add.overlap(this.bullets, this.enemies, (_b, eObj) => {
      const e = eObj as Phaser.Physics.Arcade.Image
      if (!e.active) return
      e.destroy(); (_b as Phaser.Physics.Arcade.Image).destroy()
      this.addScore(e.texture.key === 'diver' ? 30 : 10)
      /* 爆炸粒子：直接用一个短寿命的星形贴图 */
      const boom = this.add.image(e.x, e.y, 'star').setScale(6).setTint(0xf0a832)
      this.tweens.add({ targets: boom, scale: 0, alpha: 0, duration: 220, onComplete: () => boom.destroy() })
      if (this.enemies.countActive() === 0) this.nextWave()
    })
    /* 敌弹 / 敌机 × 玩家 */
    const hitPlayer = () => this.hitPlayer()
    this.physics.add.overlap(this.player, this.ebullets, (_p, bObj) => {
      const b = bObj as Phaser.Physics.Arcade.Image
      if (!b.active) return
      b.destroy(); hitPlayer()
    })
    this.physics.add.overlap(this.player, this.enemies, (_p, eObj) => {
      const e = eObj as Phaser.Physics.Arcade.Image
      if (!e.active) return
      e.destroy(); hitPlayer()
    })

    this.spawnWave()
    this.updateHUD()
  }

  startOrRestart() {
    if (this.running) return
    if (this.lives <= 0) { this.scene.restart(); return }
    this.running = true
    this.bannerText.setVisible(false)
  }

  showBanner(title: string, sub: string) {
    this.bannerText.setText(`${title}\n${sub}`).setVisible(true)
  }

  addScore(n: number) {
    this.score += n
    this.updateHUD()
  }

  hitPlayer() {
    if (!this.running) return
    this.lives -= 1
    this.updateHUD()
    this.cameras.main.shake(150, 0.01)
    const boom = this.add.image(this.player.x, this.player.y, 'star').setScale(10).setTint(0xe06c60)
    this.tweens.add({ targets: boom, scale: 0, alpha: 0, duration: 300, onComplete: () => boom.destroy() })
    if (this.lives <= 0) {
      this.running = false
      this.player.setActive(false).setVisible(false)
      this.showBanner('GAME OVER', `得分 ${this.score} · 空格重开`)
      bridge.onGameOver(this.score, this.wave)
    }
  }

  spawnWave() {
    const rows = Math.min(2 + Math.floor(this.wave / 2), 4)
    const cols = 8
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const e = this.enemies.create(80 + c * 72, 70 + r * 52, 'enemy') as Phaser.Physics.Arcade.Image
        e.setData('row', r)
      }
    }
    this.enemySpeed = 40 + this.wave * 8
    this.fireCd = Math.max(320, 900 - this.wave * 70)
  }

  nextWave() {
    this.wave += 1
    this.running = false
    this.showBanner(`WAVE ${this.wave}`, '编队全灭 · 空格继续')
    this.time.delayedCall(600, () => {
      this.spawnWave()
      this.updateHUD()
    })
  }

  updateHUD() {
    this.infoText.setText(
      `SCORE ${String(this.score).padStart(6, '0')}   WAVE ${this.wave}   LIVES ${'◆'.repeat(Math.max(this.lives, 0))}`)
  }

  update(_time: number, delta: number) {
    /* 星野循环 */
    this.stars.children.each((s) => {
      const img = s as Phaser.Physics.Arcade.Image
      if (img.y > H) { img.y = 0; img.x = Math.random() * W }
      return true
    })

    if (!this.running) { this.player.setVelocityX(0); return }

    /* 玩家操控 */
    const kb = this.input.keyboard!
    const left = this.cursors.left.isDown || kb.addKey('A').isDown
    const right = this.cursors.right.isDown || kb.addKey('D').isDown
    if (left) this.player.setVelocityX(this.player.body.velocity.x - delta * 2)
    if (right) this.player.setVelocityX(this.player.body.velocity.x + delta * 2)
    if (!left && !right) this.player.setVelocityX(0)
    this.player.x = Phaser.Math.Clamp(this.player.x, 24, W - 24)

    /* 射击 */
    this.canFire -= delta
    if ((this.cursors.space.isDown || this.input.activePointer.isDown) && this.canFire <= 0) {
      this.canFire = 190
      const b = this.bullets.get(this.player.x, this.player.y - 18, 'bullet') as Phaser.Physics.Arcade.Image
      if (b) { b.setActive(true).setVisible(true).setVelocityY(-560) }
    }
    this.bullets.children.each((s) => {
      const b = s as Phaser.Physics.Arcade.Image
      if (b.active && b.y < -20) b.destroy()
      return true
    })
    this.ebullets.children.each((s) => {
      const b = s as Phaser.Physics.Arcade.Image
      if (b.active && b.y > H + 20) b.destroy()
      return true
    })

    /* 敌机编队：整体横移 + 触边反弹下压 + 开火 */
    let minX = W, maxX = 0
    const actives: Phaser.Physics.Arcade.Image[] = []
    this.enemies.children.each((s) => {
      const e = s as Phaser.Physics.Arcade.Image
      if (e.active) { actives.push(e); minX = Math.min(minX, e.x); maxX = Math.max(maxX, e.x) }
      return true
    })
    if (actives.length) {
      if (maxX > W - 30 && this.enemyDir > 0) this.enemyDir = -1
      if (minX < 30 && this.enemyDir < 0) this.enemyDir = 1
      for (const e of actives) e.x += this.enemyDir * this.enemySpeed * delta / 1000
      this.nextFire -= delta
      if (this.nextFire <= 0) {
        this.nextFire = this.fireCd
        const shooter = actives[Phaser.Math.Between(0, actives.length - 1)]
        const b = this.ebullets.get(shooter.x, shooter.y + 20, 'ebullet') as Phaser.Physics.Arcade.Image
        if (b) {
          b.setActive(true).setVisible(true)
          this.physics.moveTo(b, this.player.x, this.player.y + 300, 260)
        }
      }
      /* 俯冲机：随机挑一个直扑玩家 */
      this.nextDive -= delta
      if (this.nextDive <= 0 && actives.length > 4) {
        this.nextDive = 3200 - Math.min(this.wave * 200, 2000)
        const diver = actives[Phaser.Math.Between(0, actives.length - 1)]
        diver.setTexture('diver')
        this.physics.moveTo(diver, this.player.x, this.player.y, 150 + this.wave * 12)
        this.tweens.add({ targets: diver, angle: 180, duration: 400 })
        this.time.delayedCall(2600, () => {
          if (diver.active && diver.y < H) { diver.y = 60; diver.x = Phaser.Math.Between(40, W - 40); diver.setAngle(0) }
        })
      }
      /* 敌机贴底即判负一条命 */
      for (const e of actives) if (e.y > H - 70) { e.destroy(); this.hitPlayer() }
    }
  }
}

export default function Shooter() {
  const hostRef = useRef<HTMLDivElement>(null)
  const [finalScore, setFinalScore] = useState<{ score: number; wave: number } | null>(null)

  useEffect(() => {
    document.title = '星河突击 — NICE.BLOG 2.0'
    bridge.onGameOver = (score, wave) => setFinalScore({ score, wave })
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: W,
      height: H,
      parent: hostRef.current!,
      backgroundColor: '#0b0e14',
      physics: { default: 'arcade', arcade: { debug: false } },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: ShooterScene,
    })
    /* 调试/自检钩子：控制台可查渲染器与场景状态 */
    ;(window as unknown as Record<string, unknown>).__shooterGame = game
    return () => { game.destroy(true) }
  }, [])

  return (
    <div className="shooter">
      <div ref={hostRef} className="shooter-host" />
      {finalScore && (
        <p className="mono muted gm-tip">上次成绩：{finalScore.score} 分 · 到达第 {finalScore.wave} 波</p>
      )}
    </div>
  )
}
