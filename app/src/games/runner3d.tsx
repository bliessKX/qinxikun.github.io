import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

/* 数据流跑酷 —— Three.js 无尽跑酷。
 * 三条数据轨道，玩家左右切换；障碍从远处迎面涌来，
 * 速度随里程提升，撞上即终局；最高分存 localStorage。
 * 全部几何体程序生成，零贴图资源。 */

const LANE_X = [-2.4, 0, 2.4]
const SPAWN_Z = -80
const PLAYER_Z = 0
const LS_KEY = 'nice2.games.runner3d.best'

export default function Runner3D() {
  const hostRef = useRef<HTMLDivElement>(null)
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(() => { try { return Number(localStorage.getItem(LS_KEY)) || 0 } catch { return 0 } })
  const [over, setOver] = useState(false)
  const [started, setStarted] = useState(false)
  const [runId, setRunId] = useState(0)

  useEffect(() => {
    document.title = '数据流跑酷 — NICE.BLOG 2.0'

    const host = hostRef.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(host.clientWidth || 720, 420)
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#0b0e14')
    scene.fog = new THREE.Fog('#0b0e14', 24, 95)

    const camera = new THREE.PerspectiveCamera(62, (host.clientWidth || 720) / 420, 0.1, 120)
    camera.position.set(0, 3.1, 7)
    camera.lookAt(0, 0.6, -8)

    scene.add(new THREE.AmbientLight('#c9cfdd', 0.95))
    const key = new THREE.DirectionalLight('#f0a832', 1.4)
    key.position.set(4, 8, 4)
    scene.add(key)

    /* 地面：深色长板 + 两侧霓虹边线 */
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 200),
      new THREE.MeshStandardMaterial({ color: '#1a2130', roughness: 0.9 }),
    )
    road.rotation.x = -Math.PI / 2
    road.position.z = -60
    scene.add(road)

    const laneLineMat = new THREE.LineBasicMaterial({ color: '#4dd8e6', transparent: true, opacity: 0.55 })
    for (const x of [LANE_X[0] + 1.2, LANE_X[2] - 1.2]) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, 0.02, 10), new THREE.Vector3(x, 0.02, -110),
      ])
      scene.add(new THREE.Line(geo, laneLineMat))
    }
    /* 车道分隔虚线：滚动制造速度感 */
    const dashes = new THREE.Group()
    const dashMat = new THREE.MeshBasicMaterial({ color: '#232b3b' })
    for (const x of [-1.2, 1.2]) {
      for (let z = 10; z > -110; z -= 4) {
        const d = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 1.6), dashMat)
        d.position.set(x, 0.02, z)
        dashes.add(d)
      }
    }
    scene.add(dashes)

    /* 玩家：琥珀发光方块 + 线框描边 */
    const player = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 1.1, 1.1),
      new THREE.MeshStandardMaterial({ color: '#f0a832', emissive: '#f0a832', emissiveIntensity: 0.55 }),
    )
    player.position.set(0, 0.55, PLAYER_Z)
    scene.add(player)
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(player.geometry),
      new THREE.LineBasicMaterial({ color: '#e8e3d8' }),
    )
    player.add(edges)

    /* 障碍：暗面红芯墙 */
    const obstacleMat = new THREE.MeshStandardMaterial({ color: '#1a2130', emissive: '#e06c60', emissiveIntensity: 0.25, roughness: 0.6 })
    const obstacles: THREE.Mesh[] = []

    type Particle = { mesh: THREE.Mesh; vx: number; vy: number; life: number }
    const particles: Particle[] = []
    const particleMat = new THREE.MeshBasicMaterial({ color: '#f0a832' })

    const state = {
      lane: 1,
      speed: 14,
      dist: 0,
      running: false,
      dead: false,
      nextSpawn: 0,
      shift: 0, /* 平滑换轨偏移 */
    }

    const spawn = () => {
      const obs = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.7, 0.9), obstacleMat)
      obs.position.set(LANE_X[Math.floor(Math.random() * 3)], 0.85, SPAWN_Z)
      scene.add(obs)
      obstacles.push(obs)
      /* 轨道顶端的小灯 */
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.3), particleMat)
      tip.position.set(obs.position.x, 1.9, obs.position.z)
      scene.add(tip)
      obstacles.push(tip as unknown as THREE.Mesh)
      ;(obs as any)._tip = tip
    }

    const burst = (x: number, y: number, z: number) => {
      for (let i = 0; i < 26; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), particleMat)
        m.position.set(x, y, z)
        scene.add(m)
        particles.push({ mesh: m, vx: (Math.random() - 0.5) * 10, vy: Math.random() * 8, life: 1 })
      }
    }

    const die = () => {
      state.dead = true; state.running = false
      burst(player.position.x, 0.8, PLAYER_Z)
      player.visible = false
      const finalScore = Math.floor(state.dist)
      setOver(true)
      setScore(finalScore)
      try {
        const prev = Number(localStorage.getItem(LS_KEY)) || 0
        if (finalScore > prev) { localStorage.setItem(LS_KEY, String(finalScore)); setBest(finalScore) }
      } catch { /* 隐私模式忽略 */ }
    }

    /* 输入：键盘 + 触摸滑动 */
    const onKey = (e: KeyboardEvent) => {
      if (state.dead) return
      if (!state.running && (e.code === 'Space' || e.code === 'Enter')) { state.running = true; setStarted(true); return }
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') state.lane = Math.max(0, state.lane - 1)
      if (e.code === 'ArrowRight' || e.code === 'KeyD') state.lane = Math.min(2, state.lane + 1)
    }
    window.addEventListener('keydown', onKey)
    let touchX = 0
    const onTouchStart = (e: TouchEvent) => { touchX = e.touches[0].clientX }
    const onTouchEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - touchX
      if (Math.abs(dx) < 24) {
        if (!state.running && !state.dead) { state.running = true; setStarted(true) }
        return
      }
      if (dx > 0) state.lane = Math.min(2, state.lane + 1)
      else state.lane = Math.max(0, state.lane - 1)
    }
    const canvas = renderer.domElement
    canvas.addEventListener('touchstart', onTouchStart, { passive: true })
    canvas.addEventListener('touchend', onTouchEnd, { passive: true })
    const onCanvasClick = () => { if (!state.running && !state.dead) { state.running = true; setStarted(true) } }
    canvas.addEventListener('pointerdown', onCanvasClick)

    const onResize = () => {
      const w = host.clientWidth || 720
      renderer.setSize(w, 420)
      camera.aspect = w / 420
      camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', onResize)

    /* 主循环 */
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      if (state.running && !state.dead) {
        state.speed = Math.min(14 + state.dist / 60, 34)
        state.dist += state.speed * dt
        if (Math.floor(state.dist) % 5 === 0) setScore(Math.floor(state.dist))

        /* 换轨插值 */
        const targetX = LANE_X[state.lane]
        player.position.x += (targetX - player.position.x) * Math.min(1, dt * 14)
        player.rotation.y = (targetX - player.position.x) * -0.35
        player.position.y = 0.55 + Math.sin(now / 260) * 0.05

        /* 障碍推进 */
        state.nextSpawn -= dt
        if (state.nextSpawn <= 0) {
          state.nextSpawn = Math.max(0.55, 1.5 - state.dist / 400) + Math.random() * 0.5
          spawn()
        }
        for (let i = obstacles.length - 1; i >= 0; i--) {
          const o = obstacles[i]
          o.position.z += state.speed * dt
          if (o.position.z > 12) {
            scene.remove(o)
            const tip = (o as any)._tip
            if (tip) { scene.remove(tip); const ti = obstacles.indexOf(tip); if (ti >= 0) obstacles.splice(ti, 1) }
            obstacles.splice(i, 1)
            continue
          }
          /* 碰撞：同一车道且 z 穿过玩家 */
          if (!(o as any)._tip && Math.abs(o.position.z - PLAYER_Z) < 1.0 && Math.abs(o.position.x - player.position.x) < 1.25) {
            die()
          }
        }
        /* 车道虚线滚动 */
        dashes.children.forEach((d) => {
          d.position.z += state.speed * dt
          if (d.position.z > 10) d.position.z -= 120
        })
      }
      /* 爆炸粒子 */
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.life -= dt * 1.4
        if (p.life <= 0) { scene.remove(p.mesh); particles.splice(i, 1); continue }
        p.vy -= 20 * dt
        p.mesh.position.x += p.vx * dt
        p.mesh.position.y += p.vy * dt
        p.mesh.position.z += (p.vy > 0 ? 2 : -2) * dt
        p.mesh.rotation.x += dt * 6
        const m = p.mesh.material as THREE.MeshBasicMaterial
        m.opacity = Math.max(p.life, 0)
        m.transparent = true
      }

      renderer.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchend', onTouchEnd)
      canvas.removeEventListener('pointerdown', onCanvasClick)
      renderer.dispose()
      obstacles.forEach((o) => { o.geometry.dispose() })
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else if (mat) mat.dispose()
      })
      host.removeChild(renderer.domElement)
    }
  }, [runId])

  const restart = () => {
    setOver(false); setStarted(false); setScore(0); setRunId((i) => i + 1)
  }

  return (
    <div className="runner3d">
      <div className="gm-hud">
        <span>里程 <b className="mono">{score} m</b></span>
        <span>最高 <b className="mono">{best} m</b></span>
      </div>
      <div ref={hostRef} className="runner-host">
        {!started && !over && (
          <div className="gm-over runner-mask">
            <div className="gm-over-title mono">DATA RUNNER</div>
            <div className="mono">←→ / AD 切换轨道 · 触屏左右滑动</div>
            <div className="mono muted">点一下或按空格开始</div>
          </div>
        )}
        {over && (
          <div className="gm-over runner-mask">
            <div className="gm-over-title mono">SIGNAL LOST</div>
            <div className="mono">本次 {score} m · 最高 {best} m</div>
            <button onClick={restart}>重新接入</button>
          </div>
        )}
      </div>
      <p className="muted gm-tip mono">在三条数据轨道间切换，避开迎面涌来的防火墙方块；里程越远速度越快。</p>
    </div>
  )
}
