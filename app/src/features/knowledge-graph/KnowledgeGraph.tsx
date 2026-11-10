import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import raw from '../../data/graph.json'

/* Sprint 6（2D 部分）— 知识图谱 Canvas 力导向实现。
 * 数据来自 graph.json（节点/边），坐标完全由模拟生成，不写死。
 * 计划书原案 Cytoscape.js，今日裁剪为自研（TECH_STACK_DECISIONS.md §2），
 * 数据模型与 Cytoscape 兼容（nodes/edges），后续可换引擎不动数据。
 */

type NodeType = 'tech' | 'article' | 'tool'
interface GNode {
  id: string; name: string; type: NodeType; category: string
  description: string; url?: string; blog?: number
}
interface XNode extends GNode { x: number; y: number; vx: number; vy: number }

const graph = raw as { nodes: GNode[]; edges: [string, string, string][] }
const TYPE_COLOR: Record<NodeType, string> = {
  tech: '#4dd8e6', article: '#f0a832', tool: '#7bc96f',
}
const TYPE_LABEL: Record<NodeType, string> = {
  tech: '技术', article: '文章', tool: '工具',
}
const CATS = ['全部', ...Array.from(new Set(graph.nodes.map((n) => n.category)))]

export default function KnowledgeGraph() {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('全部')
  const [sel, setSel] = useState<GNode | null>(null)
  const [params] = useSearchParams()
  const nav = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  /* 节点坐标跨 effect 重跑持久化：搜索/选中触发重建时布局不重排 */
  const nodesRef = useRef<XNode[]>([])

  /* 邻接表：用于悬停/选中时高亮邻居 */
  const adj = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const [s, t] of graph.edges) {
      if (!m.has(s)) m.set(s, new Set())
      if (!m.has(t)) m.set(t, new Set())
      m.get(s)!.add(t); m.get(t)!.add(s)
    }
    return m
  }, [])

  useEffect(() => {
    /* hero 跳转带 ?focus=节点名 */
    const focusName = params.get('focus')
    if (focusName) {
      const n = graph.nodes.find((x) => x.name.toLowerCase() === focusName.toLowerCase())
      if (n) { setSel(n); setCat('全部'); setQ(n.name) }
    }
  }, [params])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = 0, H = 0, raf = 0, running = true, frame = 0
    let nodes: XNode[] = []
    /* 区分「点击」与「拖拽」：位移超过阈值才算拖拽，单击直接触发跳转/选中 */
    const drag = { id: null as string | null, ox: 0, oy: 0, moved: false }
    let downX = 0, downY = 0
    let hover: string | null = null
    let mouseX = -9999, mouseY = -9999

    const activeCats = () => (cat === '全部' ? null : new Set(graph.nodes.filter((n) => n.category === cat).map((n) => n.id)))
    let visibleSet = activeCats()

    function isVisible(n: GNode) { return !visibleSet || visibleSet.has(n.id) }

    function seed() {
      // 按类别扇形分区铺开，比纯随机可读
      const cats = Array.from(new Set(nodes.map((n) => n.category)))
      nodes.forEach((n) => {
        const ci = cats.indexOf(n.category)
        const ang = (ci / cats.length) * Math.PI * 2 + Math.random() * 0.7
        const rad = 60 + Math.random() * (Math.min(W, H) / 3.2)
        n.x = W / 2 + Math.cos(ang) * rad
        n.y = H / 2 + Math.sin(ang) * rad
        n.vx = 0; n.vy = 0
      })
    }

    function resize() {
      if (!canvas || !ctx) return
      const rect = canvas.getBoundingClientRect()
      W = rect.width; H = rect.height
      canvas.width = W * dpr; canvas.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      let first = false
      if (!nodesRef.current.length) {
        nodesRef.current = graph.nodes.map((n) => ({ ...n, x: 0, y: 0, vx: 0, vy: 0 }))
        first = true
      }
      nodes = nodesRef.current
      if (first) {
        seed()
        if (reduced) { for (let i = 0; i < 220; i++) tick(true); draw() }
      }
    }

    function tick(silent = false) {
      const vis = nodes.filter(isVisible)
      const k = 0.011, rep = 2600, spring = 0.045, center = 0.0022
      // 斥力
      for (let i = 0; i < vis.length; i++) {
        for (let j = i + 1; j < vis.length; j++) {
          const a = vis[i], b = vis[j]
          let dx = b.x - a.x, dy = b.y - a.y
          let d2 = dx * dx + dy * dy
          if (d2 < 1) { dx = Math.random(); dy = Math.random(); d2 = 2 }
          const f = rep / d2
          const d = Math.sqrt(d2)
          const fx = (dx / d) * f, fy = (dy / d) * f
          a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy
        }
      }
      // 引力（边）
      for (const [s, t] of graph.edges) {
        const a = vis.find((n) => n.id === s), b = vis.find((n) => n.id === t)
        if (!a || !b) continue
        const dx = b.x - a.x, dy = b.y - a.y
        const d = Math.sqrt(dx * dx + dy * dy) || 1
        const f = (d - 150) * spring
        a.vx += (dx / d) * f; a.vy += (dy / d) * f
        b.vx -= (dx / d) * f; b.vy -= (dy / d) * f
      }
      // 向心 + 阻尼 + 积分
      for (const n of vis) {
        n.vx += (W / 2 - n.x) * center
        n.vy += (H / 2 - n.y) * center
        n.vx *= 0.86; n.vy *= 0.86
        if (drag.id !== n.id) { n.x += n.vx; n.y += n.vy }
        n.x = Math.max(30, Math.min(W - 30, n.x))
        n.y = Math.max(30, Math.min(H - 30, n.y))
      }
      if (silent) return
      frame++
      // 能量收敛后降频省电：每帧照跑但 240 帧后隔帧
      return frame > 240 && frame % 2 !== 0
    }

    function draw() {
      if (!ctx) return
      ctx.clearRect(0, 0, W, H)
      const kw = q.trim().toLowerCase()
      const match = (n: GNode) =>
        isVisible(n) && (!kw || n.name.toLowerCase().includes(kw) || n.description.toLowerCase().includes(kw))

      // 边
      for (const [s, t] of graph.edges) {
        const a = nodes.find((n) => n.id === s), b = nodes.find((n) => n.id === t)
        if (!a || !b || !isVisible(a) || !isVisible(b)) continue
        const hl = sel && (s === sel.id || t === sel.id)
        const dim = kw && !match(a) && !match(b)
        ctx.strokeStyle = hl ? 'rgba(240,168,50,0.6)' : dim ? 'rgba(35,43,59,0.35)' : 'rgba(35,43,59,0.9)'
        ctx.lineWidth = hl ? 1.4 : 0.8
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
      }
      // 节点
      for (const n of nodes) {
        if (!isVisible(n)) continue
        const m = match(n)
        const r = n.type === 'article' ? 5.5 : n.type === 'tech' ? 4.5 : 4
        const isSel = sel?.id === n.id
        const isNb = sel && adj.get(sel.id)?.has(n.id)
        ctx.globalAlpha = m || isNb || isSel ? 1 : 0.28
        ctx.beginPath(); ctx.arc(n.x, n.y, isSel ? r * 1.7 : r, 0, Math.PI * 2)
        ctx.fillStyle = TYPE_COLOR[n.type]
        ctx.fill()
        if (isSel) { ctx.strokeStyle = '#f0a832'; ctx.lineWidth = 2; ctx.stroke() }
        // 文章与选中/悬停节点显示名字
        if ((n.type === 'article' && W > 620) || isSel || isNb || (hover === n.id)) {
          ctx.font = (isSel ? '600 ' : '') + '11px "JetBrains Mono", monospace'
          ctx.fillStyle = isSel ? '#f0a832' : 'rgba(232,227,216,0.85)'
          ctx.fillText(n.name, n.x + r + 5, n.y + 3.5)
        }
        ctx.globalAlpha = 1
      }
    }

    function loop() {
      if (!running) return
      const skip = tick()
      if (!skip) draw()
      raf = requestAnimationFrame(loop)
    }

    /* ---------- 交互 ---------- */
    function pick(mx: number, my: number): XNode | null {
      let best: XNode | null = null, bd = 15
      for (const n of nodes) {
        if (!isVisible(n)) continue
        const d = Math.hypot(mx - n.x, my - n.y)
        if (d < bd + 6 && d < bd) { /* 取最近 */ if (!best || d < Math.hypot(mx - best.x, my - best.y)) { best = n; bd = d } }
      }
      return best
    }
    function pos(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
    function onDown(e: PointerEvent) {
      const p = pos(e)
      const n = pick(p.x, p.y)
      downX = p.x; downY = p.y
      if (n) { drag.id = n.id; drag.ox = p.x - n.x; drag.oy = p.y - n.y; drag.moved = false; canvas!.setPointerCapture(e.pointerId) }
    }
    function onMove(e: PointerEvent) {
      const p = pos(e)
      mouseX = p.x; mouseY = p.y
      if (drag.id) {
        if (!drag.moved && Math.hypot(p.x - downX, p.y - downY) > 4) drag.moved = true
        if (drag.moved) {
          const n = nodes.find((x) => x.id === drag.id)
          if (n) { n.x = p.x - drag.ox; n.y = p.y - drag.oy; n.vx = 0; n.vy = 0 }
        }
      } else {
        const n = pick(p.x, p.y)
        hover = n ? n.id : null
        canvas!.style.cursor = n ? 'pointer' : 'default'
      }
    }
    /* 点击节点直达：有站内笔记走路由，有外链开新页，都没有才停留显示详情 */
    function openNode(n: XNode) {
      if (n.blog) nav('/blog/' + n.blog)
      else if (n.url) {
        if (n.url.startsWith('http')) window.open(n.url, '_blank', 'noopener')
        else window.location.href = n.url
      } else {
        setSel({ ...n })
      }
    }
    function onUp(e: PointerEvent) {
      const wasDrag = drag.id !== null && drag.moved
      drag.id = null
      if (wasDrag) return
      const p = pos(e)
      const n = pick(p.x, p.y)
      if (n) openNode(n)
      else setSel(null)
    }
    function onLeave() { hover = null; mouseX = mouseY = -9999 }
    function onVis() {
      running = !document.hidden
      if (running && !reduced) raf = requestAnimationFrame(loop)
      else cancelAnimationFrame(raf)
    }

    resize()
    window.addEventListener('resize', resize)
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointerleave', onLeave)
    document.addEventListener('visibilitychange', onVis)
    if (!reduced) raf = requestAnimationFrame(loop)
    else draw()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [q, cat, sel, adj, nav])

  return (
    <div className="kg-wrap rise">
      <div className="kg-bar">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索节点：Java、MySQL、RAG…" aria-label="搜索知识节点" />
        {CATS.map((c) => (
          <button key={c} className={'kg-chip' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>{c}</button>
        ))}
      </div>
      <div className="kg-stage" ref={wrapRef}>
        <canvas ref={canvasRef} aria-label="知识图谱画布" />
        {sel && (
          <div className="kg-detail">
            <h4>{sel.name} <span className="muted" style={{ fontSize: 11 }}>· {TYPE_LABEL[sel.type]} / {sel.category}</span></h4>
            <div className="d-desc">{sel.description}</div>
            <div className="d-links">
              {sel.blog && <Link to={'/blog/' + sel.blog}>→ 站内笔记</Link>}
              {sel.url && <a href={sel.url} target={sel.url.startsWith('http') ? '_blank' : undefined} rel="noopener">{sel.url.startsWith('http') ? '→ CSDN 原文' : '→ 打开工具'}</a>}
              {adj.get(sel.id) && [...adj.get(sel.id)!].slice(0, 8).map((id) => {
                const n = graph.nodes.find((x) => x.id === id)
                return n ? <button key={id} className="kg-chip" onClick={() => setSel(n)}>{n.name}</button> : null
              })}
            </div>
          </div>
        )}
      </div>
      <div style={{ padding: '10px 16px', borderTop: '1px solid var(--line)', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span><span style={{ color: TYPE_COLOR.tech }}>●</span> 技术 {graph.nodes.filter((n) => n.type === 'tech').length}</span>
        <span><span style={{ color: TYPE_COLOR.article }}>●</span> 文章 {graph.nodes.filter((n) => n.type === 'article').length}</span>
        <span><span style={{ color: TYPE_COLOR.tool }}>●</span> 工具 {graph.nodes.filter((n) => n.type === 'tool').length}</span>
        <span>边 {graph.edges.length} · 拖拽节点 · 点击节点直达笔记与工具</span>
      </div>
    </div>
  )
}
