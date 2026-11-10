import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import articles from '../data/articles.json'

export default function BlogPost() {
  const { n } = useParams()
  const idx = Number(n) - 1
  const a = articles[idx]

  useEffect(() => {
    if (a) document.title = a.title + ' — NICE.BLOG 2.0'
  }, [a])

  if (!a || Number.isNaN(idx)) {
    return (
      <div className="page nf">
        <div className="code">404</div>
        <p>这一篇不存在。共 {articles.length} 篇，序号 1–{articles.length}。</p>
        <Link className="btn" to="/blog">回博客列表</Link>
      </div>
    )
  }

  const prev = articles[idx - 1]
  const next = articles[idx + 1]

  return (
    <div className="page post">
      <div className="crumb">
        <Link to="/">home</Link><span className="sep">//</span>
        <Link to="/blog">blog</Link><span className="sep">//</span>
        {String(a.n).padStart(2, '0')}
      </div>
      <h1>{a.title}</h1>
      <div className="p-meta">
        <span className="tag amber">{a.cat}</span>
        <span>{a.date}</span>
        <span>{a.toc.length} 节</span>
        <span>{a.paras.length} 段</span>
      </div>

      <div className="p-toc">
        <div className="h">目录</div>
        <ol>{a.toc.map((t, i) => <li key={i}>{t}</li>)}</ol>
      </div>

      <div className="p-body">
        {a.paras.map((p, i) => <p key={i}>{p}</p>)}
      </div>

      <div className="p-foot">
        <a className="btn" href={a.url} target="_blank" rel="noopener">阅读 CSDN 原文 ↗</a>
        <span className="muted" style={{ fontSize: 12, fontFamily: 'var(--mono)' }}>id: {a.id}</span>
      </div>

      <div className="post-nav">
        {prev
          ? <Link to={'/blog/' + prev.n}>← 较新：{prev.short}</Link>
          : <span />}
        {next && <Link to={'/blog/' + next.n}>较旧：{next.short} →</Link>}
      </div>
    </div>
  )
}
