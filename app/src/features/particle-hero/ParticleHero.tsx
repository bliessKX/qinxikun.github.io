import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

/* Sprint 3 — Home 3D Hero 的 v1 实现：Canvas 2D 粒子技术网络。
 * 计划书要求 R3F，今日裁剪为 Canvas 2D（理由见 TECH_STACK_DECISIONS.md §2）。
 * 组件接口按「场景组件」设计，后续替换 R3F 不伤页面结构。
 *
 * 行为：
 *  - 技术节点漂浮，距离内连线，形成网络感
 *  - 鼠标视差：网络整体随光标轻移
 *  - 节点悬停高亮 + 放大，点击跳转知识图谱并带上分类过滤
 *  - prefers-reduced-motion：只渲染静态一帧
 *  - 页面不可见暂停 rAF；DPR 自适应
 */

const TECHS = [
  'Java', 'Spring Boot', 'Spring Cloud', 'Shiro', 'MyBatis', 'MySQL',
  'Redis', 'RabbitMQ', 'TCP/UDP', 'JDK 21', 'Python', 'LangGraph',
  'Spring AI', 'RAG', 'React', 'Vite', 'Nginx', 'Docker', 'Linux', 'Maven',
]

interface Node {
  x: number; y: number; vx: number; vy: number; r: number
  label: string; hot: boolean
}

export default function ParticleHero() {
  const ref = useRef<HTMLCanvasElement>(null)
  const nav = useNavigate()

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2)
    let nodes: Node[] = []
    let raf = 0
    let running = true
    const mouse = { x: -9999, y: -9999, px: 0, py: 0 }
    let hover: Node | null = null

    function resize() {
      if (!canvas || !ctx) return
      const rect = canvas.getBoundingClientRect()
      W = rect.width; H = rect.height
      canvas.width = W * dpr
      canvas.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      seed()
      if (reduced) draw()
    }

    function seed() {
      // 按面积配节点数，移动端自动减少
      const count = Math.max(14, Math.min(TECHS.length, Math.floor((W * H) / 26000)))
      nodes = TECHS.slice(0, count).map((label, i) => ({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        r: 2.2 + Math.random() * 2.4,
        label,
        hot: i < 4,
      }))
    }

    function draw() {
      if (!ctx) return
      ctx.clearRect(0, 0, W, H)

      // 视差偏移量：光标相对中心的比例 × 幅度
      const dx = mouse.px * 14, dy = mouse.py * 10

      // 连线：距离阈值内透明度渐变
      const LINK = Math.min(170, Math.max(120, W / 8))
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j]
          const d = Math.hypot(a.x - b.x, a.y - b.y)
          if (d < LINK) {
            const o = (1 - d / LINK) * 0.34
            const hl = (hover === a || hover === b) && (a === hover || b === hover)
            ctx.strokeStyle = hl
              ? `rgba(240,168,50,${o + 0.3})`
              : `rgba(77,216,230,${o * 0.55})`
            ctx.lineWidth = hl ? 1.1 : 0.6
            ctx.beginPath()
            ctx.moveTo(a.x + dx * (a.r / 5), a.y + dy * (a.r / 5))
            ctx.lineTo(b.x + dx * (b.r / 5), b.y + dy * (b.r / 5))
            ctx.stroke()
          }
        }
      }

      // 节点
      for (const n of nodes) {
        const x = n.x + dx * (n.r / 5), y = n.y + dy * (n.r / 5)
        const r = n === hover ? n.r * 1.9 : n.r
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fillStyle = n === hover ? '#f0a832' : n.hot ? 'rgba(240,168,50,0.85)' : 'rgba(77,216,230,0.7)'
        ctx.fill()
        // 标签：悬停或热点节点常显
        if (n === hover || (n.hot && W > 700)) {
          ctx.font = '11px "JetBrains Mono", monospace'
          ctx.fillStyle = n === hover ? '#f0a832' : 'rgba(138,147,166,0.9)'
          ctx.fillText(n.label, x + r + 6, y + 3.5)
        }
      }
    }

    function step() {
      if (!running) return
      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy
        if (n.x < 10 || n.x > W - 10) n.vx *= -1
        if (n.y < 10 || n.y > H - 10) n.vy *= -1
      }
      draw()
      raf = requestAnimationFrame(step)
    }

    function onMove(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect()
      mouse.x = e.clientX - rect.left
      mouse.y = e.clientY - rect.top
      mouse.px = (mouse.x / W - 0.5) * 2
      mouse.py = (mouse.y / H - 0.5) * 2
      // 悬停检测
      hover = null
      for (const n of nodes) {
        const x = n.x + mouse.px * 14 * (n.r / 5)
        const y = n.y + mouse.py * 10 * (n.r / 5)
        if (Math.hypot(mouse.x - x, mouse.y - y) < n.r + 9) { hover = n; break }
      }
      canvas!.style.cursor = hover ? 'pointer' : 'default'
      if (reduced) draw()
    }
    function onLeave() { mouse.px = 0; mouse.py = 0; hover = null }
    function onClick() {
      if (hover) nav('/knowledge?focus=' + encodeURIComponent(hover.label))
    }
    function onVis() {
      running = !document.hidden && !reduced
      if (running) raf = requestAnimationFrame(step)
      else cancelAnimationFrame(raf)
    }

    resize()
    window.addEventListener('resize', resize)
    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('mouseleave', onLeave)
    canvas.addEventListener('click', onClick)
    document.addEventListener('visibilitychange', onVis)
    if (!reduced) raf = requestAnimationFrame(step)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('mouseleave', onLeave)
      canvas.removeEventListener('click', onClick)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [nav])

  return (
    <section className="hero rise in" aria-label="技术领域网络">
      <canvas ref={ref} aria-hidden="true" />
      <div className="hero-copy">
        <div className="hero-kicker">$ whoami — full stack developer</div>
        <h2>
          把真实项目里踩过的坑，<br />
          沉淀成<em>可交互</em>的知识。
        </h2>
        <p>博客 · 工具 · 知识图谱 · 实验室 —— 每个结论都来自实际验证，不是抄来的。</p>
        <div className="hero-cta">
          <a className="btn" href="#/blog">阅读笔记</a>
          <a className="btn ghost" href="#/knowledge">探索知识图谱</a>
        </div>
      </div>
      <div className="hero-hint">hover node · click to explore</div>
    </section>
  )
}
