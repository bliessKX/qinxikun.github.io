import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'

/* 3D 物理叠塔 —— Rapier 真实刚体 + Three.js 渲染。
 * 吊臂来回摆动，按空格/点按放下方块；落点偏移的部分会被物理切割成碎块掉落，
 * 塔越叠越高、越窄，直到对不齐为止。层数计分，最高纪录存 localStorage。 */

const LS_KEY = 'stack3d.best.v1'
const BLOCK_H = 1
const START_SIZE = 3.4
const SWING = 6.5

interface Block { body: RAPIER.RigidBody; mesh: THREE.Mesh; w: number; d: number }

export default function Stack3D() {
  const hostRef = useRef<HTMLDivElement>(null)
  const [layers, setLayers] = useState(0)
  const [best, setBest] = useState(() => { try { return Number(localStorage.getItem(LS_KEY)) || 0 } catch { return 0 } })
  const [over, setOver] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    document.title = '3D 物理叠塔 — NICE.BLOG 2.0'
    let disposed = false
    let raf = 0
    let world: RAPIER.World | null = null

    const run = async () => {
      await RAPIER.init()
      if (disposed) return
      setReady(true)

      const host = hostRef.current!
      const renderer = new THREE.WebGLRenderer({ antialias: true })
      renderer.setSize(host.clientWidth || 720, 460)
      host.appendChild(renderer.domElement)
      const camera = new THREE.PerspectiveCamera(55, (host.clientWidth || 720) / 460, 0.1, 200)
      camera.position.set(9, 7, 12)
      camera.lookAt(0, 1, 0)

      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0x0b0e14)
      scene.add(new THREE.AmbientLight(0xffffff, 0.55))
      const sun = new THREE.DirectionalLight(0xffffff, 1.1)
      sun.position.set(8, 14, 6)
      scene.add(sun)

      /* 地台 */
      const ground = new THREE.Mesh(new THREE.BoxGeometry(START_SIZE + 2, 1.2, START_SIZE + 2), new THREE.MeshLambertMaterial({ color: 0x2a4260 }))
      ground.position.y = -0.6
      scene.add(ground)

      world = new RAPIER.World({ x: 0, y: -24, z: 0 })

      const blocks: Block[] = []
      const mkMesh = (w: number, h: number, d: number, color: number) =>
        new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }))
      const mkBody = (x: number, y: number, z: number, w: number, h: number, d: number, dynamic: boolean) => {
        const desc = dynamic ? RAPIER.RigidBodyDesc.dynamic() : RAPIER.RigidBodyDesc.kinematicPositionBased()
        const body = world!.createRigidBody(desc.setTranslation(x, y, z))
        world!.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setFriction(0.9).setRestitution(0.05), body)
        return body
      }

      /* 基座块 */
      const base: Block = { body: mkBody(0, 0, 0, START_SIZE, BLOCK_H, START_SIZE, false), mesh: mkMesh(START_SIZE, BLOCK_H, START_SIZE, 0x3f6d9e), w: START_SIZE, d: START_SIZE }
      base.body.setBodyType(RAPIER.RigidBodyType.Fixed, true)
      blocks.push(base)
      scene.add(base.mesh)

      let topW = START_SIZE, topD = START_SIZE, topX = 0, topZ = 0, topY = BLOCK_H / 2
      let layer = 0
      let axis: 'x' | 'z' = 'x'
      let dir = 1, speed = 1.5
      let current: Block | null = null
      let settle = 0
      const state = { phase: 'moving' as 'moving' | 'settling' | 'over' }

      const spawnNext = () => {
        layer++
        setLayers(layer)
        speed = Math.min(1.5 + layer * 0.14, 4.2)
        dir = Math.random() < 0.5 ? 1 : -1
        axis = layer % 2 === 1 ? 'x' : 'z'
        const hue = (0.55 + layer * 0.045) % 1
        const color = new THREE.Color().setHSL(hue, 0.6, 0.5).getHex()
        const y = topY + BLOCK_H
        const body = mkBody(axis === 'x' ? -dir * SWING : topX, y, axis === 'z' ? -dir * SWING : topZ, topW, BLOCK_H, topD, false)
        const mesh = mkMesh(topW, BLOCK_H, topD, color)
        scene.add(mesh)
        current = { body, mesh, w: topW, d: topD }
        state.phase = 'moving'
      }
      spawnNext()

      const drop = () => {
        if (state.phase !== 'moving' || !current) return
        const t = current.body.translation()
        world!.removeRigidBody(current.body)
        const isX = axis === 'x'
        const body = mkBody(t.x, t.y, t.z, isX ? current.w : current.w, BLOCK_H, current.d, true)
        current.body = body
        state.phase = 'settling'
        settle = 0
      }

      const finish = () => {
        state.phase = 'over'
        setOver(true)
        setLayers((l) => {
          if (l > best) { setBest(l); try { localStorage.setItem(LS_KEY, String(l)) } catch { /* ignore */ } }
          return l
        })
      }

      /* 落定切割：与顶层对齐，重合部分保留，出界部分变碎块掉落 */
      const chop = () => {
        if (!current) return
        const t = current.body.translation()
        const isX = axis === 'x'
        const prevAxisPos = isX ? topX : topZ
        const prevAxisSize = isX ? topW : topD
        const curAxisPos = isX ? t.x : t.z
        const offset = curAxisPos - prevAxisPos
        const overlap = prevAxisSize - Math.abs(offset)
        const y = t.y
        world!.removeRigidBody(current.body)
        scene.remove(current.mesh)
        if (overlap <= 0.22) {
          /* 完全没对上：整块变碎块坠落 */
          const debris = mkBody(t.x, y, t.z, current.w, BLOCK_H, current.d, true)
          debris.applyImpulse({ x: (isX ? 1 : 0) * Math.sign(offset) * 2.2, y: 0, z: (isX ? 0 : 1) * Math.sign(offset) * 2.2 }, true)
          blocks.push({ body: debris, mesh: current.mesh, w: current.w, d: current.d })
          scene.add(current.mesh)
          current = null
          finish()
          return
        }
        /* 保留重合部分 */
        const keepSize = overlap
        const keepCenter = prevAxisPos + offset / 2
        const nx = isX ? keepCenter : t.x, nz = isX ? t.z : keepCenter
        const w = isX ? keepSize : current.w, d = isX ? current.d : keepSize
        const body = mkBody(nx, y, nz, w, BLOCK_H, d, true)
        body.setBodyType(RAPIER.RigidBodyType.Fixed, true)
        const mesh = mkMesh(w, BLOCK_H, d, current.mesh.material instanceof THREE.MeshLambertMaterial ? current.mesh.material.color.getHex() : 0x888888)
        mesh.position.set(nx, y, nz)
        scene.add(mesh)
        blocks.push({ body, mesh, w, d })
        topW = w; topD = d; topX = nx; topZ = nz; topY = y
        /* 出界部分：碎块掉落（碎块中心 = 当前方块边缘向内收半个碎块宽度） */
        const debrisSize = Math.abs(offset)
        if (debrisSize > 0.12) {
          const isX2 = isX
          const edge = curAxisPos + Math.sign(offset) * prevAxisSize / 2
          const dCenter = edge - Math.sign(offset) * debrisSize / 2
          const dw = isX2 ? debrisSize : current.w, dd = isX2 ? current.d : debrisSize
          const dx = isX2 ? dCenter : t.x
          const dz = isX2 ? t.z : dCenter
          const debris = mkBody(dx, y, dz, dw, BLOCK_H, dd, true)
          debris.applyImpulse({ x: (isX2 ? 1 : 0) * Math.sign(offset) * 2.4, y: 0.4, z: (isX2 ? 0 : 1) * Math.sign(offset) * 2.4 }, true)
          const dm = mkMesh(dw, BLOCK_H, dd, 0x232b3b)
          scene.add(dm)
          blocks.push({ body: debris, mesh: dm, w: dw, d: dd })
        }
        current = null
        window.setTimeout(() => { if (state.phase !== 'over') spawnNext() }, 350)
      }

      /* 输入 */
      const canvas = renderer.domElement
      const onDown = () => { if (state.phase === 'moving') drop() }
      canvas.addEventListener('pointerdown', onDown)
      const onKey = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); onDown() } }
      window.addEventListener('keydown', onKey)
      const onResize = () => {
        const w = host.clientWidth || 720
        renderer.setSize(w, 460)
        camera.aspect = w / 460
        camera.updateProjectionMatrix()
      }
      window.addEventListener('resize', onResize)

      /* 主循环 */
      let last = performance.now()
      const loop = (now: number) => {
        const dt = Math.min((now - last) / 1000, 0.05); last = now
        if (world) {
          if (state.phase === 'moving' && current) {
            const t = current.body.translation()
            const isX = axis === 'x'
            let v = (isX ? t.x : t.z) + dir * speed * dt
            if (v > SWING) { v = SWING; dir = -1 }
            if (v < -SWING) { v = -SWING; dir = 1 }
            current.body.setNextKinematicTranslation(isX ? { x: v, y: t.y, z: t.z } : { x: t.x, y: t.y, z: v })
          }
          world.step()
          /* 同步网格 & 清理坠出视野的碎块 */
          for (let i = blocks.length - 1; i >= 0; i--) {
            const b = blocks[i]
            const t = b.body.translation()
            b.mesh.position.set(t.x, t.y, t.z)
            const r = b.body.rotation()
            b.mesh.quaternion.set(r.x, r.y, r.z, r.w)
            if (t.y < topY - 14) { world.removeRigidBody(b.body); scene.remove(b.mesh); blocks.splice(i, 1) }
          }
          if (state.phase === 'settling' && current) {
            settle += dt
            const lv = current.body.linvel()
            if (settle > 0.45 && Math.abs(lv.y) < 0.6 || settle > 1.6) chop()
          }
          /* 相机随塔升高 */
          const camY = topY + 5.2
          camera.position.y += (camY - camera.position.y) * Math.min(1, dt * 2.4)
          camera.lookAt(0, topY - 1.2, 0)
        }
        renderer.render(scene, camera)
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)

      return () => {
        cancelAnimationFrame(raf)
        window.removeEventListener('keydown', onKey)
        window.removeEventListener('resize', onResize)
        canvas.removeEventListener('pointerdown', onDown)
        renderer.dispose()
        host.removeChild(renderer.domElement)
        world?.free()
        world = null
      }
    }
    let cleanup: (() => void) | undefined
    run().then((fn) => { if (fn) cleanup = fn })
    return () => { disposed = true; cleanup?.() }
  }, [])

  const restart = () => window.location.reload()

  return (
    <div className="stack3d">
      <div className="gm-hud">
        <span>层数 <b className="mono">{layers}</b></span>
        <span>最高 <b className="mono">{best}</b></span>
        <span className="gm-hud-ops"><button onClick={restart}>重开</button></span>
      </div>
      <div ref={hostRef} className="stack-host" />
      {!ready && !over && <div className="runner-mask gm-over"><div className="mono">物理引擎加载中…</div></div>}
      {ready && !over && <div className="stack-tip mono">空格 / 点按屏幕 放下方块</div>}
      {over && (
        <div className="runner-mask gm-over">
          <div className="gm-over-title">TOWER DOWN</div>
          <div className="mono">叠了 {layers} 层</div>
          <button onClick={restart}>再来一局</button>
        </div>
      )}
      <p className="game-sub">吊臂来回摆动，看准时机放下方块。落点偏移的部分会被真实物理切成碎块掉下去，塔越叠越窄——考验手稳。</p>
    </div>
  )
}
