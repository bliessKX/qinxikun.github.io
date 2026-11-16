import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

/* 3D 赛车 —— Three.js 公路竞速。
 * ←→/AD 或触屏滑动换道，躲开车流；速度随里程渐增，
 * 撞车即终点。里程计分，最高纪录存 localStorage。 */

const LS_KEY = 'racer3d.best.v1'
const ROAD_W = 9
const LANE_X = [-3, 0, 3]

export default function Racer3D() {
  const hostRef = useRef<HTMLDivElement>(null)
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(() => { try { return Number(localStorage.getItem(LS_KEY)) || 0 } catch { return 0 } })
  const [dead, setDead] = useState(false)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    document.title = '3D 赛车 — NICE.BLOG 2.0'
    const host = hostRef.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(host.clientWidth || 720, 420)
    host.appendChild(renderer.domElement)
    const camera = new THREE.PerspectiveCamera(70, (host.clientWidth || 720) / 420, 0.1, 300)
    camera.position.set(0, 3.2, 8)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0b0e14)
    scene.fog = new THREE.Fog(0x0b0e14, 40, 120)

    /* 路面 + 边线 + 中线虚线 */
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_W + 2.4, 260),
      new THREE.MeshBasicMaterial({ color: 0x1a2130 }),
    )
    road.rotation.x = -Math.PI / 2; road.position.z = -100
    scene.add(road)
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0xf0a832 })
    for (const x of [-(ROAD_W / 2 + 0.2), ROAD_W / 2 + 0.2]) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 260), edgeMat)
      line.rotation.x = -Math.PI / 2; line.position.set(x, 0.02, -100)
      scene.add(line)
    }
    const dashMat = new THREE.MeshBasicMaterial({ color: 0x4a5265 })
    const dashes: THREE.Mesh[] = []
    for (let i = 0; i < 24; i++) {
      for (const x of [-1.5, 1.5]) {
        const d = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 2.4), dashMat)
        d.rotation.x = -Math.PI / 2
        d.position.set(x, 0.02, -i * 6)
        scene.add(d); dashes.push(d)
      }
    }
    /* 路外草地色块 */
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(220, 260), new THREE.MeshBasicMaterial({ color: 0x10182b }))
    grass.rotation.x = -Math.PI / 2; grass.position.set(0, -0.05, -100)
    scene.add(grass)

    /* 玩家车（车身+车顶+尾灯） */
    const car = new THREE.Group()
    const bodyMat = new THREE.MeshBasicMaterial({ color: 0xf0a832 })
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 2.4), bodyMat)
    body.position.y = 0.45
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.42, 1.1), new THREE.MeshBasicMaterial({ color: 0x232b3b }))
    cab.position.set(0, 0.86, -0.15)
    car.add(body, cab)
    for (const sx of [-0.55, 0.55]) for (const sz of [-1.0, 1.0]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.2, 10), new THREE.MeshBasicMaterial({ color: 0x0b0e14 }))
      wheel.rotation.z = Math.PI / 2
      wheel.position.set(sx, 0.28, sz)
      car.add(wheel)
    }
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 0.06), new THREE.MeshBasicMaterial({ color: 0xe06c60 }))
    tail.position.set(0, 0.5, 1.22)
    car.add(tail)
    car.position.set(0, 0, 6)
    scene.add(car)

    /* 车流 */
    const traffic: THREE.Group[] = []
    const TRAFFIC_COLORS = [0x4d87bd, 0x7bc96f, 0xe06c60, 0x8fd8ec, 0x5a3d24]
    const mkCar = () => {
      const g = new THREE.Group()
      const c = TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)]
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 2.4), new THREE.MeshBasicMaterial({ color: c }))
      b.position.y = 0.45
      const cb = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.4, 1.0), new THREE.MeshBasicMaterial({ color: 0x232b3b }))
      cb.position.set(0, 0.84, 0.2)
      g.add(b, cb)
      return g
    }

    const state = { lane: 1, speed: 22, dist: 0, running: false, dead: false, nextSpawn: 1.2 }
    const die = () => {
      state.dead = true; state.running = false
      setDead(true)
      setScore((s) => {
        const finalScore = Math.floor(state.dist)
        if (finalScore > best) { setBest(finalScore); try { localStorage.setItem(LS_KEY, String(finalScore)) } catch { /* ignore */ } }
        return s
      })
    }

    /* 输入 */
    const onKey = (e: KeyboardEvent) => {
      if (state.dead) return
      if (!state.running && (e.code === 'Space' || e.code === 'Enter')) { state.running = true; setStarted(true); return }
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') state.lane = Math.max(0, state.lane - 1)
      if (e.code === 'ArrowRight' || e.code === 'KeyD') state.lane = Math.min(2, state.lane + 1)
    }
    window.addEventListener('keydown', onKey)
    let tx = 0
    const canvas = renderer.domElement
    const ts = (e: TouchEvent) => { tx = e.touches[0].clientX }
    const te = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - tx
      if (Math.abs(dx) < 22) { if (!state.running && !state.dead) { state.running = true; setStarted(true) } ; return }
      if (dx > 0) state.lane = Math.min(2, state.lane + 1)
      else state.lane = Math.max(0, state.lane - 1)
    }
    canvas.addEventListener('touchstart', ts, { passive: true })
    canvas.addEventListener('touchend', te, { passive: true })
    const clickStart = () => { if (!state.running && !state.dead) { state.running = true; setStarted(true) } }
    canvas.addEventListener('pointerdown', clickStart)

    const onResize = () => {
      const w = host.clientWidth || 720
      renderer.setSize(w, 420)
      camera.aspect = w / 420
      camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', onResize)

    let raf = 0, last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now
      if (state.running && !state.dead) {
        state.speed = Math.min(22 + state.dist / 55, 44)
        state.dist += state.speed * dt
        if (Math.floor(state.dist) % 4 === 0) setScore(Math.floor(state.dist))

        const targetX = LANE_X[state.lane]
        car.position.x += (targetX - car.position.x) * Math.min(1, dt * 10)
        car.rotation.z = (car.position.x - targetX) * 0.06

        dashes.forEach((d) => { d.position.z += state.speed * dt; if (d.position.z > 10) d.position.z -= 144 })

        /* 车流生成 */
        state.nextSpawn -= dt
        if (state.nextSpawn <= 0) {
          state.nextSpawn = Math.max(0.5, 1.7 - state.dist / 500) + Math.random() * 0.4
          const g = mkCar()
          g.position.set(LANE_X[Math.floor(Math.random() * 3)], 0, -120)
          scene.add(g); traffic.push(g)
        }
        for (let i = traffic.length - 1; i >= 0; i--) {
          const t = traffic[i]
          t.position.z += state.speed * dt
          if (t.position.z > 14) { scene.remove(t); traffic.splice(i, 1); continue }
          if (Math.abs(t.position.z - car.position.z) < 2.3 && Math.abs(t.position.x - car.position.x) < 1.25) die()
        }
        camera.position.z = 8
        camera.lookAt(car.position.x * 0.4, 0.8, -30)
      }
      renderer.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
      canvas.removeEventListener('touchstart', ts)
      canvas.removeEventListener('touchend', te)
      canvas.removeEventListener('pointerdown', clickStart)
      renderer.dispose()
      host.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div className="racer3d">
      <div className="gm-hud">
        <span>里程 <b className="mono">{score} m</b></span>
        <span>最高 <b className="mono">{best} m</b></span>
      </div>
      <div ref={hostRef} className="runner-host" />
      {!started && !dead && (
        <div className="runner-mask gm-over"><div className="gm-over-title mono">3D RACER</div>
          <div className="mono">←→ / AD / 滑动屏幕换道，点按开始</div></div>
      )}
      {dead && (
        <div className="runner-mask gm-over"><div className="gm-over-title">GAME OVER</div>
          <div className="mono">跑了 {score} m</div><button onClick={() => window.location.reload()}>再来一局</button></div>
      )}
      <p className="game-sub">高速路上车流滚滚：←→/AD 或滑动换道躲避，速度会越来越快，看你能跑多远。</p>
    </div>
  )
}
