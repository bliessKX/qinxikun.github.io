import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import ParticleHero from '../features/particle-hero/ParticleHero'
import { useRise } from '../App'
import articles from '../data/articles.json'
import projects from '../data/projects.json'

const TOOL_LINKS = [
  { href: './tools/json.html', name: 'JSON 工具', desc: '格式化 · 校验 · 修复 · 树形' },
  { href: './tools/commands.html', name: '命令速查', desc: '9 类 119 条 · 一键复制' },
  { href: './tools/what-to-eat.html', name: '吃什么转盘', desc: '按时段推荐 · 8 种菜系' },
]

export default function Home() {
  useRise()
  useEffect(() => { document.title = 'NICE.BLOG 2.0 — Interactive Developer Platform' }, [])
  const featured = articles.slice(0, 3)

  return (
    <div className="page">
      <ParticleHero />

      <section className="section rise">
        <h3>最新笔记 <Link className="more" to="/blog">全部 {articles.length} 篇 →</Link></h3>
        <div className="grid c3">
          {featured.map((a) => (
            <Link key={a.id} className="card clickable article-card" to={'/blog/' + a.n}>
              <div className="a-top">
                <span className="tag amber">{a.cat}</span>
                <span className="a-date">{a.date}</span>
              </div>
              <h4>{a.short}</h4>
              <div className="a-sum">{a.paras[0]}</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="section rise">
        <h3>在线工具 <Link className="more" to="/tools">工具中心 →</Link></h3>
        <div className="grid c3">
          {TOOL_LINKS.map((t) => (
            <a key={t.href} className="card clickable tool-card" href={t.href}>
              <div className="t-name">{t.name} ↗</div>
              <div className="t-desc">{t.desc}</div>
            </a>
          ))}
        </div>
      </section>

      <section className="section rise">
        <h3>在做的事 <Link className="more" to="/projects">全部项目 →</Link></h3>
        <div className="grid c2">
          {projects.slice(0, 2).map((p) => (
            <div key={p.id} className="card proj-card">
              <h4>{p.name} <span className="tag" style={{ marginLeft: 8 }}>{p.status}</span></h4>
              <div className="p-desc">{p.desc}</div>
              <div>{p.stack.map((s) => <span key={s} className="tag">{s}</span>)}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
