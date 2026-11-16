import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/* 3D 赛车 · 地平线之夜 —— Three.js。
 * 弯道赛道（解析曲率）、氮气加速（里程+金币+漂移充能）、
 * 高速过弯漂移（流光尾迹）、金币收集、第三人称/驾驶舱/俯视三视角、
 * 五款可选跑车（迈巴赫/大黄蜂/保时捷911/野马GT/小米SU7）。
 * ←→/AD 转向，Shift/空格 氮气，C 切视角；触屏：左右按钮转向、N2O 按钮。 */

const LS_KEY = 'racer3d.best.v2'
const ROAD_HALF = 5.6
const LANES = [-3.4, 0, 3.4]
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/* 曲率：解析可积（curveX 为原函数，curveC = dX/ds 为曲率） */
const curveX = (s: number) => -120 * Math.cos(s * 0.0045) + 85.5 * Math.cos(s * 0.00351)
const curveC = (s: number) => 0.54 * Math.sin(s * 0.0045) - 0.3 * Math.sin(s * 0.00351)

interface CarSpec {
  id: string; name: string; tag: string; img: string
  paint: number; stripe?: number; glass: number
  profile: 'luxury' | 'muscle' | 'sport' | 'fastback'
  top: number; acc: number; grip: number
  spoiler: boolean; len: number; wide: number
}

const CARS: CarSpec[] = [
  { id: 'maybach', name: '迈巴赫 S680', tag: '旗舰行政 · 长轴稳如头等舱', img: 'cars/maybach.jpg', paint: 0x17171d, glass: 0x0c1018, profile: 'luxury', top: 0.68, acc: 0.62, grip: 0.55, spoiler: false, len: 5.1, wide: 2.0 },
  { id: 'camaro', name: '大黄蜂 · 科迈罗', tag: '美式肌肉 · 黑色拉条纹', img: 'cars/camaro.jpg', paint: 0xf2c014, stripe: 0x14141a, glass: 0x10131c, profile: 'muscle', top: 0.86, acc: 0.84, grip: 0.72, spoiler: true, len: 4.8, wide: 1.96 },
  { id: 'porsche', name: '保时捷 911', tag: '蛙式经典 · 弯道之王', img: 'cars/porsche.jpg', paint: 0xd03028, glass: 0x0e141e, profile: 'sport', top: 0.9, acc: 0.9, grip: 0.92, spoiler: true, len: 4.5, wide: 1.84 },
  { id: 'mustang', name: '野马 GT', tag: 'V8 心跳 · 白色双条纹', img: 'cars/mustang.jpg', paint: 0x1e3f8f, stripe: 0xe8e6df, glass: 0x0f131c, profile: 'muscle', top: 0.84, acc: 0.86, grip: 0.7, spoiler: true, len: 4.8, wide: 1.94 },
  { id: 'su7', name: '小米 SU7', tag: '纯电轿跑 · 高低可变空气动力', img: 'cars/su7.jpg', paint: 0x2fc6b0, glass: 0x0c121a, profile: 'fastback', top: 0.88, acc: 0.96, grip: 0.8, spoiler: false, len: 5.0, wide: 1.94 },
]

/* React ↔ 场景 桥 */
const bridge = {
  onHud: (_h: { speed: number; nitro: number; coins: number; dist: number; drift: boolean; cam: string }) => {},
  onSelected: (_id: string) => {},
  onDead: (_d: { dist: number; coins: number; best: number; isNew: boolean }) => {},
}

/* ---------- 程序化车辆建模 ---------- */
function profilePts(profile: CarSpec['profile']): Array<[number, number]> {
  switch (profile) {
    case 'luxury': return [[-2.45, 0.34], [-1.5, 0.5], [-0.95, 0.66], [0.2, 0.82], [1.35, 0.8], [2.1, 0.62], [2.45, 0.5]]
    case 'muscle': return [[-2.35, 0.3], [-1.7, 0.42], [-0.85, 0.6], [-0.05, 0.76], [0.9, 0.68], [1.7, 0.62], [2.35, 0.56]]
    case 'sport': return [[-2.3, 0.26], [-1.75, 0.36], [-0.95, 0.5], [-0.3, 0.72], [0.45, 0.74], [1.35, 0.6], [2.1, 0.46], [2.3, 0.4]]
    case 'fastback': return [[-2.5, 0.28], [-1.7, 0.42], [-0.85, 0.56], [0, 0.74], [1.0, 0.68], [1.9, 0.5], [2.5, 0.38]]
  }
}
function topY(pts: Array<[number, number]>, x: number): number {
  for (let i = 0; i < pts.length - 1; i++) {
    if (x >= pts[i][0] && x <= pts[i + 1][0]) {
      const t = (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0])
      return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t
    }
  }
  return pts[pts.length - 1][1]
}

function buildCar(spec: CarSpec, trafficPaint?: number): { g: THREE.Group; wheels: THREE.Group[]; flames: THREE.Mesh[] } {
  const g = new THREE.Group()
  const scale = spec.len / 4.8
  const pts = profilePts(spec.profile)
  const paint = trafficPaint ?? spec.paint
  /* 车身：侧轮廓挤出（带倒角圆润漆面） */
  const shape = new THREE.Shape()
  shape.moveTo(pts[0][0], 0.16)
  for (const [x, y] of pts) shape.lineTo(x, y)
  shape.lineTo(pts[pts.length - 1][0], 0.16)
  shape.closePath()
  const geo = new THREE.ExtrudeGeometry(shape, { depth: spec.wide - 0.16, bevelEnabled: true, bevelSize: 0.09, bevelThickness: 0.07, bevelSegments: 2, steps: 1 })
  geo.rotateY(-Math.PI / 2)
  geo.computeBoundingBox()
  const bb = geo.boundingBox!
  geo.translate(-(bb.max.x + bb.min.x) / 2, 0, -(bb.max.z + bb.min.z) / 2)
  const body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: paint, metalness: 0.75, roughness: 0.28 }))
  body.scale.set(scale, 1, 1)
  g.add(body)
  /* 座舱玻璃 */
  const cabShape = new THREE.Shape()
  const cabPts: Array<[number, number]> = [[-0.85, 0.52], [-0.15, 0.74], [0.75, 0.64], [1.3, 0.5]]
  cabShape.moveTo(cabPts[0][0], cabPts[0][1])
  for (const [x, y] of cabPts) cabShape.lineTo(x, y)
  cabShape.lineTo(1.3, 0.42); cabShape.lineTo(-0.85, 0.42); cabShape.closePath()
  const cabGeo = new THREE.ExtrudeGeometry(cabShape, { depth: spec.wide - 0.5, bevelEnabled: false })
  cabGeo.rotateY(-Math.PI / 2)
  cabGeo.computeBoundingBox()
  const cb = cabGeo.boundingBox!
  cabGeo.translate(-(cb.max.x + cb.min.x) / 2, 0, -(cb.max.z + cb.min.z) / 2)
  const cab = new THREE.Mesh(cabGeo, new THREE.MeshStandardMaterial({ color: spec.glass, metalness: 0.9, roughness: 0.12 }))
  cab.scale.set(scale, 1, 1)
  g.add(cab)
  /* 引擎盖拉条纹（大黄蜂/野马） */
  if (spec.stripe !== undefined) {
    const sm = new THREE.MeshStandardMaterial({ color: spec.stripe, metalness: 0.5, roughness: 0.4 })
    for (const [x0, x1] of [[-2.2, -0.8], [-0.4, 1.1], [1.4, 2.2]]) {
      const xm = ((x0 + x1) / 2) * scale, w = (x1 - x0) * scale, y = topY(pts, (x0 + x1) / 2) + 0.02
      for (const off of [-0.24, 0.24]) {
        const st = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, w), sm)
        st.position.set(off * (spec.wide / 1.9), y, xm)
        g.add(st)
      }
    }
  }
  /* 车轮 */
  const wheels: THREE.Group[] = []
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x101014, roughness: 0.9 })
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc8, metalness: 0.95, roughness: 0.2 })
  const wz = spec.len * 0.31
  for (const sx of [-(spec.wide / 2 - 0.14), spec.wide / 2 - 0.14]) {
    for (const sz of [-wz, wz]) {
      const wg = new THREE.Group()
      wg.position.set(sx, 0.34, sz * scale)
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 14), tireMat)
      tire.rotation.z = Math.PI / 2
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.26, 10), rimMat)
      rim.rotation.z = Math.PI / 2
      wg.add(tire, rim)
      g.add(wg); wheels.push(wg)
    }
  }
  /* 车灯 */
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff2b0, emissiveIntensity: 1.6 })
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff2014, emissiveIntensity: 1.8 })
  for (const off of [-(spec.wide / 2 - 0.3), spec.wide / 2 - 0.3]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.08), headMat)
    hl.position.set(off, topY(pts, pts[0][0] + 0.3) - 0.02, pts[0][0] * scale + 0.06)
    g.add(hl)
  }
  const tl = new THREE.Mesh(new THREE.BoxGeometry(spec.wide - 0.4, 0.09, 0.06), tailMat)
  tl.position.set(0, topY(pts, pts[pts.length - 1][0] - 0.2) - 0.05, pts[pts.length - 1][0] * scale - 0.06)
  g.add(tl)
  /* 尾翼 */
  if (spec.spoiler) {
    const wm = new THREE.MeshStandardMaterial({ color: 0x14141a, metalness: 0.6, roughness: 0.4 })
    const wing = new THREE.Mesh(new THREE.BoxGeometry(spec.wide - 0.3, 0.05, 0.3), wm)
    const wy = topY(pts, pts[pts.length - 1][0] - 0.15) + 0.14
    wing.position.set(0, wy, pts[pts.length - 1][0] * scale - 0.18)
    for (const off of [-(spec.wide / 2 - 0.4), spec.wide / 2 - 0.4]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.08), wm)
      post.position.set(off, wy - 0.08, pts[pts.length - 1][0] * scale - 0.18)
      g.add(post)
    }
    g.add(wing)
  }
  /* 氮气尾焰 */
  const flames: THREE.Mesh[] = []
  for (const off of [-0.5, 0.5]) {
    const fl = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.9, 8),
      new THREE.MeshBasicMaterial({ color: 0x66d8ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    fl.rotation.x = Math.PI / 2
    fl.position.set(off, 0.34, pts[pts.length - 1][0] * scale + 0.5)
    fl.visible = false
    g.add(fl); flames.push(fl)
  }
  return { g, wheels, flames }
}

/* ---------- 粒子池（漂移流光 / 氮气尾迹 / 碎屑） ---------- */
interface PItem { m: THREE.Mesh; vx: number; vy: number; vz: number; life: number; max: number; grow: number }
class ParticlePool {
  items: PItem[] = []
  constructor(scene: THREE.Scene, n: number, geo: THREE.BufferGeometry) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }))
      m.visible = false
      scene.add(m)
      this.items.push({ m, vx: 0, vy: 0, vz: 0, life: 0, max: 1, grow: 0 })
    }
  }
  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, color: number, sx: number, sy: number, sz: number, grow = 0) {
    const it = this.items.find((p) => p.life <= 0)
    if (!it) return
    it.m.position.set(x, y, z)
    it.m.visible = true
    it.m.scale.set(sx, sy, sz)
    ;(it.m.material as THREE.MeshBasicMaterial).color.setHex(color)
    it.vx = vx; it.vy = vy; it.vz = vz; it.life = life; it.max = life; it.grow = grow
  }
  update(dt: number) {
    for (const it of this.items) {
      if (it.life <= 0) continue
      it.life -= dt
      if (it.life <= 0) { it.m.visible = false; continue }
      it.m.position.x += it.vx * dt
      it.m.position.y += it.vy * dt
      it.m.position.z += it.vz * dt
      if (it.grow) it.m.scale.multiplyScalar(1 + it.grow * dt)
      ;(it.m.material as THREE.MeshBasicMaterial).opacity = 0.9 * (it.life / it.max)
    }
  }
}

type Screen = 'select' | 'run' | 'dead'

export default function Racer3D() {
  const hostRef = useRef<HTMLDivElement>(null)
  const [hud, setHud] = useState({ speed: 0, nitro: 0.35, coins: 0, dist: 0, drift: false, cam: '第三人称' })
  const [screen, setScreen] = useState<Screen>('select')
  const [carId, setCarId] = useState('camaro')
  const [hint, setHint] = useState(false)
  const [result, setResult] = useState({ dist: 0, coins: 0, best: 0, isNew: false })
  const [best, setBest] = useState(() => { try { return Number(localStorage.getItem(LS_KEY)) || 0 } catch { return 0 } })

  useEffect(() => {
    document.title = '3D 赛车 — NICE.BLOG 2.0'
    bridge.onHud = (h) => setHud(h)
    bridge.onSelected = () => { setScreen('run'); setHint(true); setTimeout(() => setHint(false), 3400) }
    bridge.onDead = (d) => { setResult(d); setScreen('dead') }

    const host = hostRef.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(host.clientWidth || 720, 420)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    host.appendChild(renderer.domElement)
    const camera = new THREE.PerspectiveCamera(68, (host.clientWidth || 720) / 420, 0.1, 400)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x141a2c)
    scene.fog = new THREE.Fog(0x141a2c, 55, 185)
    /* 环境反射（金属漆面） */
    const pmrem = new THREE.PMREMGenerator(renderer)
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    /* 灯光 */
    scene.add(new THREE.HemisphereLight(0x8fb0d8, 0x241f2c, 0.7))
    const sunLight = new THREE.DirectionalLight(0xffc890, 1.5)
    sunLight.position.set(-28, 42, -55)
    scene.add(sunLight)

    /* 远景：落日 + 山影 */
    const sunDisk = new THREE.Mesh(new THREE.CircleGeometry(30, 32), new THREE.MeshBasicMaterial({ color: 0xff9a5c, fog: false, transparent: true, opacity: 0.95 }))
    sunDisk.position.set(0, 44, -335)
    scene.add(sunDisk)
    const mkMountain = (x: number, z: number, w: number, h: number, c: number) => {
      const s = new THREE.Shape()
      s.moveTo(-w / 2, 0); s.lineTo(0, h); s.lineTo(w / 2, 0); s.closePath()
      const m = new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshBasicMaterial({ color: c, fog: false }))
      m.position.set(x, 0, z)
      scene.add(m)
    }
    mkMountain(-70, -300, 150, 46, 0x232c48)
    mkMountain(75, -305, 180, 58, 0x1d2540)
    mkMountain(0, -315, 220, 36, 0x2a3452)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 500), new THREE.MeshBasicMaterial({ color: 0x121926 }))
    ground.rotation.x = -Math.PI / 2
    ground.position.set(0, -0.06, -180)
    scene.add(ground)

    /* 路面分块（随曲率横向偏移） */
    const roadMat = new THREE.MeshBasicMaterial({ color: 0x1d2430 })
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0xf0a832 })
    const SEG = 8, N_SEG = 24
    const segs: THREE.Group[] = []
    for (let i = 0; i < N_SEG; i++) {
      const grp = new THREE.Group()
      const z = 14 - i * SEG
      const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, SEG), roadMat)
      road.rotation.x = -Math.PI / 2
      grp.add(road)
      for (const ex of [-ROAD_HALF, ROAD_HALF]) {
        const line = new THREE.Mesh(new THREE.PlaneGeometry(0.16, SEG), edgeMat)
        line.rotation.x = -Math.PI / 2
        line.position.set(ex, 0.02, 0)
        grp.add(line)
      }
      grp.position.set(0, 0, z)
      scene.add(grp)
      segs.push(grp)
    }
    /* 虚线 */
    const dashMat = new THREE.MeshBasicMaterial({ color: 0x8a92a4 })
    const dashes: THREE.Mesh[] = []
    for (let i = 0; i < 30; i++) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 2.6), dashMat)
      d.rotation.x = -Math.PI / 2
      d.position.set(0, 0.02, -i * 5.6 + 14)
      scene.add(d)
      dashes.push(d)
    }
    /* 护栏柱 + 路灯 + 行道树 */
    const postMat = new THREE.MeshStandardMaterial({ color: 0x9aa2b2, roughness: 0.6 })
    const posts: THREE.Mesh[] = []
    for (let i = 0; i < 44; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), postMat)
      p.position.set(0, 0.25, -i * 8 + 14)
      p.userData.side = i % 2 === 0 ? 1 : -1
      scene.add(p)
      posts.push(p)
    }
    const lights: THREE.Group[] = []
    for (let i = 0; i < 8; i++) {
      const lg = new THREE.Group()
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.4, 6), postMat)
      pole.position.y = 2.2
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.08), postMat)
      arm.position.set(-0.8, 4.4, 0)
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffd890 }))
      bulb.position.set(-1.5, 4.32, 0)
      lg.add(pole, arm, bulb)
      lg.position.set(0, 0, -i * 44 + 14)
      lg.userData.side = i % 2 === 0 ? 1 : -1
      scene.add(lg)
      lights.push(lg)
    }
    const treeMat = new THREE.MeshStandardMaterial({ color: 0x1d3324, roughness: 1 })
    const trees: THREE.Group[] = []
    for (let i = 0; i < 16; i++) {
      const tg = new THREE.Group()
      const h = 2.4 + Math.random() * 2.4
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.9 + Math.random() * 0.5, h, 7), treeMat)
      cone.position.y = h / 2 + 0.4
      tg.add(cone)
      tg.position.set(0, 0, -i * 22 + 14)
      tg.userData.side = i % 2 === 0 ? 1 : -1
      tg.userData.dist = 4 + (i % 4) * 2.2
      scene.add(tg)
      trees.push(tg)
    }

    /* 玩家车 */
    let player = buildCar(CARS[1])
    let spec = CARS[1]
    scene.add(player.g)

    /* 车流 / 金币 */
    const traffic: Array<{ s: number; lane: number; spd: number; g: THREE.Group; missed: boolean }> = []
    const coins: Array<{ s: number; lane: number; g: THREE.Group }> = []
    const TRAFFIC_COLORS = [0x4d87bd, 0x7bc96f, 0xc04a5a, 0x8a7fae, 0x5a6a7a, 0xc78f4a]

    /* 粒子池 */
    const streaks = new ParticlePool(scene, 70, new THREE.BoxGeometry(0.05, 0.05, 1.6))
    const puffs = new ParticlePool(scene, 50, new THREE.BoxGeometry(0.2, 0.2, 0.2))

    /* 状态 */
    const st = {
      running: false, dead: false,
      d: 0, px: 0, speed: 0,
      nitro: 0.35, nitroOn: false,
      coins: 0, drift: false,
      touchSteer: 0,
      cam: 0, camNames: ['第三人称', '驾驶舱', '俯视'],
      spawnT: 1.6, coinT: 3, shake: 0, fov: 68, crashT: 0,
    }

    const reset = () => {
      st.dead = false; st.d = 0; st.px = 0; st.speed = 0; st.nitro = 0.35; st.nitroOn = false
      st.coins = 0; st.spawnT = 1.6; st.coinT = 3; st.shake = 0; st.crashT = 0
      for (const t of traffic) scene.remove(t.g)
      traffic.length = 0
      for (const c of coins) scene.remove(c.g)
      coins.length = 0
      player.g.visible = true
      player.g.rotation.set(0, 0, 0)
    }
    const selectCar = (id: string) => {
      const next = CARS.find((c) => c.id === id) ?? CARS[1]
      if (next.id !== spec.id) {
        scene.remove(player.g)
        player.g.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose() } })
        spec = next
        player = buildCar(spec)
        scene.add(player.g)
      }
      reset()
      st.running = true
      bridge.onSelected(id)
    }
    window.__rcSelect = selectCar
    window.__rcReset = () => { reset(); st.running = false }

    const die = () => {
      if (st.dead) return
      st.dead = true; st.running = false
      st.crashT = 0
      st.shake = 0.9
      for (let i = 0; i < 26; i++) {
        puffs.spawn(
          player.g.position.x, 0.6 + Math.random() * 1.2, player.g.position.z + (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 9, 3 + Math.random() * 5, (Math.random() - 0.5) * 9,
          0.9 + Math.random() * 0.5, Math.random() < 0.5 ? 0xffa040 : 0x8a8a92, 1.6, 1.6, 1.6, 2.4,
        )
      }
      const dist = Math.floor(st.d)
      const isNew = dist > best
      if (isNew) { setBest(dist); try { localStorage.setItem(LS_KEY, String(dist)) } catch { /* ignore */ } }
      bridge.onDead({ dist, coins: st.coins, best: Math.max(dist, best), isNew })
    }

    /* 输入 */
    const keys: Record<string, boolean> = {}
    const onKey = (e: KeyboardEvent, down: boolean) => {
      keys[e.code] = down
      if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault()
      if (down && e.code === 'KeyC') st.cam = (st.cam + 1) % 3
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'Space') st.nitroOn = down
    }
    const kd = (e: KeyboardEvent) => onKey(e, true)
    const ku = (e: KeyboardEvent) => onKey(e, false)
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)

    /* 触屏桥：左右转向 / N2O / 视角 */
    window.__rcTouch = (act: 'l' | 'r' | 'n' | 'c', down: boolean) => {
      if (act === 'l') st.touchSteer = down ? -1 : (st.touchSteer === -1 ? 0 : st.touchSteer)
      if (act === 'r') st.touchSteer = down ? 1 : (st.touchSteer === 1 ? 0 : st.touchSteer)
      if (act === 'n') st.nitroOn = down
      if (act === 'c' && down) st.cam = (st.cam + 1) % 3
    }
    const onResize = () => {
      const w = host.clientWidth || 720
      renderer.setSize(w, 420)
      camera.aspect = w / 420
      camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', onResize)

    /* ---------- 主循环 ---------- */
    let raf = 0, last = performance.now(), hudT = 0
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now
      const t = now / 1000

      if (st.running && !st.dead) {
        /* 转向 & 离心力 */
        const steer = st.touchSteer || (keys.ArrowLeft || keys.KeyA ? -1 : keys.ArrowRight || keys.KeyD ? 1 : 0)
        const c0 = curveC(st.d)
        const maxSpeed = 30 + spec.top * 20
        let target = Math.min(28 + st.d / 85, maxSpeed)
        if (st.nitroOn && st.nitro > 0) { target = maxSpeed + 12; st.nitro = Math.max(0, st.nitro - 0.32 * dt) }
        /* 漂移判定：高速 + 弯道 + 转向 */
        st.drift = steer !== 0 && Math.abs(c0) > 0.09 && st.speed > 24
        if (st.drift) st.nitro = Math.min(1, st.nitro + 0.12 * dt)
        st.speed += (target - st.speed) * Math.min(1, dt * (0.9 + spec.acc * 1.1))
        st.d += st.speed * dt
        st.nitro = Math.min(1, st.nitro + 0.018 * dt) /* 里程累计充能 */
        const steerSpd = (7.5 + st.speed * 0.07) * (0.8 + spec.grip * 0.4)
        st.px += steer * steerSpd * dt
        st.px -= c0 * (7 + st.speed * 0.22) * dt /* 弯道离心力 */
        if (Math.abs(st.px) > ROAD_HALF - 0.9) {
          st.speed *= 1 - 1.6 * dt
          st.shake = Math.max(st.shake, 0.25)
          if (Math.random() < 0.5) puffs.spawn(st.px, 0.3, 2, (Math.random() - 0.5) * 3, 1.5, 4 + Math.random() * 3, 0.5, 0x6a5a44, 1.2, 1.2, 1.2, 1.5)
        }
        st.px = clamp(st.px, -ROAD_HALF - 2.4, ROAD_HALF + 2.4)

        /* 车体姿态 */
        const P = player
        P.g.position.set(st.px, 0, 0)
        const yaw = Math.atan(c0) + steer * (st.drift ? 0.42 : 0.14)
        P.g.rotation.y = yaw + (st.drift ? Math.sin(t * 18) * 0.03 : 0)
        P.g.rotation.z = -steer * 0.06 - c0 * 0.08
        for (const w of P.wheels) w.rotation.x += st.speed * dt * 3
        /* 氮气尾焰 & 速度流光 */
        const boosting = st.nitroOn && st.nitro > 0
        for (const fl of P.flames) { fl.visible = boosting; if (boosting) fl.scale.set(0.8 + Math.random() * 0.5, 0.8 + Math.random() * 0.5, 1 + Math.random() * 1.6) }
        if (boosting) {
          st.fov += (78 - st.fov) * Math.min(1, dt * 5)
          for (let i = 0; i < 2; i++) {
            streaks.spawn(st.px + (Math.random() - 0.5) * 7, 0.4 + Math.random() * 2.2, -30 - Math.random() * 60, 0, 0, 130, 0.5, Math.random() < 0.5 ? 0x66d8ff : 0x9fd0ff, 1, 1, 1.4)
          }
        } else st.fov += (68 - st.fov) * Math.min(1, dt * 4)
        if (st.drift) {
          streaks.spawn(P.g.position.x - steer * 0.8, 0.28, 1.4, -steer * 6, 0.6, 9, 0.45, Math.random() < 0.5 ? 0xffa845 : 0x5fe0ff, 1.6, 1, 1, 0.6)
          streaks.spawn(P.g.position.x + steer * 0.5, 0.28, 1.8, steer * 3, 0.4, 7, 0.4, 0xd0f4ff, 1.2, 1, 1, 0.5)
        }

        /* 路面 / 虚线 / 景物随曲率偏移 */
        const xOff = (s: number) => curveX(s) - curveX(st.d)
        for (const seg of segs) {
          const sz = seg.position.z
          seg.position.x = xOff(st.d - sz)
          seg.rotation.y = Math.atan(curveC(st.d - sz))
        }
        for (const d of dashes) {
          d.position.z += st.speed * dt
          if (d.position.z > 16) d.position.z -= 168
          d.position.x = xOff(st.d - d.position.z)
          d.rotation.y = Math.atan(curveC(st.d - d.position.z))
        }
        for (const p of posts) {
          p.position.z += st.speed * dt
          if (p.position.z > 16) p.position.z -= 352
          p.position.x = xOff(st.d - p.position.z) + p.userData.side * (ROAD_HALF + 0.9)
        }
        for (const lg of lights) {
          lg.position.z += st.speed * dt
          if (lg.position.z > 18) lg.position.z -= 352
          lg.position.x = xOff(st.d - lg.position.z) + lg.userData.side * (ROAD_HALF + 1.6)
          lg.rotation.y = -Math.atan(curveC(st.d - lg.position.z)) * 0.4
        }
        for (const tg of trees) {
          tg.position.z += st.speed * dt
          if (tg.position.z > 20) tg.position.z -= 352
          tg.position.x = xOff(st.d - tg.position.z) + tg.userData.side * (ROAD_HALF + tg.userData.dist)
        }
        sunDisk.position.x = curveX(st.d + 335) * 0.3

        /* 金币生成 & 收集 */
        st.coinT -= dt
        if (st.coinT <= 0) {
          st.coinT = 4.5 + Math.random() * 4
          const lane = Math.floor(Math.random() * 3)
          for (let i = 0; i < 6; i++) {
            const cg = new THREE.Group()
            const cm = new THREE.Mesh(
              new THREE.CylinderGeometry(0.42, 0.42, 0.08, 14),
              new THREE.MeshStandardMaterial({ color: 0xf0c040, emissive: 0xc09020, emissiveIntensity: 0.8, metalness: 0.9, roughness: 0.25 }),
            )
            cm.rotation.x = Math.PI / 2
            cg.add(cm)
            scene.add(cg)
            coins.push({ s: st.d + 130 + i * 4.2, lane, g: cg })
          }
        }
        for (let i = coins.length - 1; i >= 0; i--) {
          const c = coins[i]
          const z = -(c.s - st.d)
          if (z > 18) { scene.remove(c.g); coins.splice(i, 1); continue }
          if (z < -160) continue
          const cx = LANES[c.lane] + xOff(c.s)
          c.g.position.set(cx, 0.75 + Math.sin(t * 3 + c.s) * 0.08, z)
          c.g.rotation.y += dt * 4
          if (Math.abs(c.s - st.d) < 1.6 && Math.abs(cx - st.px) < 1.15) {
            scene.remove(c.g); coins.splice(i, 1)
            st.coins += 1
            st.nitro = Math.min(1, st.nitro + 0.06)
            puffs.spawn(cx, 1, z, 0, 2.4, 0, 0.4, 0xffe070, 1.4, 1.4, 1.4, 1)
          }
        }

        /* 车流生成 & 碰撞 */
        st.spawnT -= dt
        if (st.spawnT <= 0) {
          st.spawnT = Math.max(0.75, 1.9 - st.d / 900) + Math.random() * 0.5
          const lane = Math.floor(Math.random() * 3)
          const clash = traffic.some((tc) => tc.lane === lane && tc.s - st.d > 100 && tc.s - st.d < 140)
          if (!clash) {
            const fake: CarSpec = { ...spec, profile: 'fastback', len: 4.6, wide: 1.9, spoiler: false, stripe: undefined }
            const { g } = buildCar(fake, TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)])
            scene.add(g)
            traffic.push({ s: st.d + 135, lane, spd: 13 + Math.random() * 7, g, missed: false })
          }
        }
        for (let i = traffic.length - 1; i >= 0; i--) {
          const tc = traffic[i]
          tc.s += tc.spd * dt
          const z = -(tc.s - st.d)
          if (z > 22) { scene.remove(tc.g); traffic.splice(i, 1); continue }
          if (z < -150) continue
          const tx = LANES[tc.lane] + xOff(tc.s)
          tc.g.position.set(tx, 0, z)
          tc.g.rotation.y = Math.atan(curveC(tc.s)) * 0.6
          const dx = Math.abs(tx - st.px)
          if (z > -2.8 && z < 2.8) {
            if (dx < 1.35) { die(); break }
            if (dx < 2.3 && !tc.missed) { tc.missed = true; st.nitro = Math.min(1, st.nitro + 0.04) }
          }
        }

        /* 摄像机 */
        st.shake = Math.max(0, st.shake - dt * 1.8)
        const shk = st.shake
        if (st.cam === 0) {
          camera.position.set(st.px * 0.55 + (Math.random() - 0.5) * shk, 3.2, 8.8)
          camera.lookAt(st.px * 0.4, 1.0, -26)
        } else if (st.cam === 1) {
          P.g.visible = false
          camera.position.set(st.px + (Math.random() - 0.5) * shk, 1.5, 1.0)
          camera.lookAt(st.px + Math.atan(curveC(st.d + 14)) * 22, 1.1, -30)
        } else {
          camera.position.set(st.px + (Math.random() - 0.5) * shk, 15, 7)
          camera.lookAt(st.px, 0, -6)
        }
        if (st.cam !== 1) P.g.visible = true
        camera.fov = st.fov
        camera.updateProjectionMatrix()

        /* HUD 节流刷新 */
        hudT -= dt
        if (hudT <= 0) {
          hudT = 0.08
          bridge.onHud({
            speed: Math.round(st.speed * 4.4),
            nitro: st.nitro,
            coins: st.coins,
            dist: Math.floor(st.d),
            drift: st.drift,
            cam: st.camNames[st.cam],
          })
        }
      } else if (st.dead) {
        /* 撞毁打转 */
        st.crashT += dt
        player.g.rotation.y += dt * 6 * Math.max(0, 1 - st.crashT)
        st.shake = Math.max(0, st.shake - dt)
        camera.position.x += (Math.random() - 0.5) * st.shake
      } else {
        /* 选车库：展示台旋转 */
        player.g.visible = true
        player.g.position.set(0, 0, 4)
        player.g.rotation.y = Math.sin(t * 0.5) * 0.7 + 0.4
        camera.position.set(4.6, 2.6, 10.5)
        camera.lookAt(0, 0.7, 3)
        camera.fov = 55
        camera.updateProjectionMatrix()
      }

      streaks.update(dt)
      puffs.update(dt)
      renderer.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      window.removeEventListener('resize', onResize)
      delete window.__rcSelect
      delete window.__rcReset
      delete window.__rcTouch
      renderer.dispose()
      host.removeChild(renderer.domElement)
    }
  }, [])

  const touch = (act: 'l' | 'r' | 'n' | 'c', down: boolean) => {
    const w = window as unknown as { __rcTouch?: (a: 'l' | 'r' | 'n' | 'c', b: boolean) => void }
    w.__rcTouch?.(act, down)
  }
  const holdProps = (act: 'l' | 'r' | 'n') => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => { e.preventDefault(); touch(act, true) },
    onPointerUp: () => touch(act, false),
    onPointerLeave: () => touch(act, false),
    onPointerCancel: () => touch(act, false),
  })
  const go = (id: string) => { setCarId(id); window.__rcSelect?.(id) }
  const toGarage = () => { window.__rcReset?.(); setScreen('select') }

  return (
    <div className="racer3d">
      <div className="gm-hud">
        <span>里程 <b className="mono">{hud.dist} m</b></span>
        <span>💰 <b className="mono">{hud.coins}</b></span>
        <span className="rc-speed"><b className="mono">{hud.speed}</b> km/h</span>
        <span>最高 <b className="mono">{best} m</b></span>
        {hud.drift && <span className="rc-drift">DRIFT!</span>}
        <span className="gm-hud-ops"><button onClick={() => touch('c', true)}>🎥 {hud.cam}</button></span>
      </div>
      <div className="rc-nitro-wrap">
        <span className="rc-nitro-label mono">N₂O</span>
        <div className="rc-nitro"><i style={{ width: `${Math.round(hud.nitro * 100)}%` }} /></div>
      </div>
      <div ref={hostRef} className="runner-host" />

      {screen === 'select' && (
        <div className="runner-mask rc-select-mask">
          <div className="rc-select">
            <div className="rc-select-title mono">GARAGE · 选一台座驾</div>
            <div className="rc-grid">
              {CARS.map((c) => (
                <button key={c.id} className={`rc-card${c.id === carId ? ' on' : ''}`} onClick={() => go(c.id)}>
                  <img src={`${import.meta.env.BASE_URL}${c.img}`} alt={c.name} loading="lazy" />
                  <div className="rc-card-info">
                    <b>{c.name}</b>
                    <i>{c.tag}</i>
                    <div className="rc-stats mono">
                      <span>极速<i style={{ width: `${Math.round(c.top * 100)}%` }} /></span>
                      <span>加速<i style={{ width: `${Math.round(c.acc * 100)}%` }} /></span>
                      <span>操控<i style={{ width: `${Math.round(c.grip * 100)}%` }} /></span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <p className="mono rc-tip">点击卡片直接发车 · 弯道漂移 / 氮气 / 金币等你解锁</p>
          </div>
        </div>
      )}

      {screen === 'run' && (
        <>
          <div className="rc-touch">
            <div className="rc-steer">
              <button type="button" className="rc-btn" {...holdProps('l')} aria-label="左转">◀</button>
              <button type="button" className="rc-btn" {...holdProps('r')} aria-label="右转">▶</button>
            </div>
            <button type="button" className="rc-btn rc-n2o" {...holdProps('n')} aria-label="氮气">N₂O</button>
          </div>
          {hint && (
            <div className="runner-mask gm-over rc-start">
              <div className="gm-over-title mono">FORZA NIGHT</div>
              <div className="mono">←→ / AD 转向 · Shift/空格 氮气 · C 换视角<br />高速入弯会甩尾漂移，小心离心力！</div>
            </div>
          )}
        </>
      )}

      {screen === 'dead' && (
        <div className="runner-mask gm-over">
          <div className="gm-over-title">CRASHED!</div>
          <div className="mono">里程 {result.dist} m · 金币 {result.coins} {result.isNew && <span className="rc-new">新纪录!</span>}</div>
          <div className="rc-again">
            <button onClick={() => go(carId)}>再开一局</button>
            <button onClick={toGarage}>回车库换车</button>
          </div>
        </div>
      )}
      <p className="game-sub">弯道 + 离心力：高速转向过弯会触发<b>漂移</b>（车尾甩出流光尾迹并持续给氮气充能）。吃金币、贴近车流擦身而过都能攒 N₂O；Shift 释放氮气冲刺。C 键在第三人称 / 驾驶舱 / 俯视间切换。</p>
    </div>
  )
}

declare global {
  interface Window {
    __rcSelect?: (id: string) => void
    __rcReset?: () => void
    __rcTouch?: (act: 'l' | 'r' | 'n' | 'c', down: boolean) => void
  }
}
