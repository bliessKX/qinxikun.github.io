import { useEffect } from 'react'
import { Link } from 'react-router-dom'

export default function NotFound() {
  useEffect(() => { document.title = '404 — NICE.BLOG 2.0' }, [])
  return (
    <div className="page nf">
      <div className="code">404</div>
      <p>这个地址没有对应的内容。</p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link className="btn" to="/">回首页</Link>
        <Link className="btn ghost" to="/blog">看笔记</Link>
        <Link className="btn ghost" to="/tools">用工具</Link>
      </div>
    </div>
  )
}
