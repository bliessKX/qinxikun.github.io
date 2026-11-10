import { useMemo, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useRise } from '../App'
import articles from '../data/articles.json'

export default function Blog() {
  useRise()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  useEffect(() => { document.title = 'Blog — NICE.BLOG 2.0' }, [])

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase()
    if (!kw) return articles
    return articles.filter((a) =>
      a.title.toLowerCase().includes(kw) ||
      a.cat.toLowerCase().includes(kw) ||
      a.paras.join(' ').toLowerCase().includes(kw))
  }, [q])

  return (
    <div className="page">
      <div className="page-head">
        <h1><span className="slash">/</span>blog</h1>
        <p>{articles.length} 篇真实项目笔记 —— 每个结论都经过现场验证。搜索同时匹配标题、分类与正文。</p>
        <input
          value={q}
          onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {})}
          placeholder="搜索：Spring、索引、装饰器…"
          aria-label="搜索文章"
          style={{
            marginTop: 18, maxWidth: 420, width: '100%', display: 'block',
            fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--ink)',
            background: 'var(--bg-elev)', border: '1px solid var(--line)',
            borderRadius: 4, padding: '9px 13px',
          }}
        />
      </div>

      {list.length === 0 && (
        <div className="kg-empty">没有匹配「{q}」的笔记。换个关键词试试，比如 MySQL、Agent、分页。</div>
      )}

      <div className="grid c2">
        {list.map((a) => (
          <Link key={a.id} className="card clickable article-card rise" to={'/blog/' + a.n}>
            <div className="a-top">
              <span className="tag amber">{a.cat}</span>
              <span className="a-date">{a.date}</span>
            </div>
            <h4>{a.title}</h4>
            <div className="a-sum">{a.paras[0]}</div>
            <div style={{ marginTop: 10, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>
              {a.toc.length} 节 · #{String(a.n).padStart(2, '0')}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
