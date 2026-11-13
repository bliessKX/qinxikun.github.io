import { useEffect, useMemo, useState } from 'react'
import { useRise } from '../App'

/* Sprint 5 — 工具中心 v1：
 * 旧工具页原样透传（真文件，零迁移成本），本页做目录 + 收藏 + 最近使用（localStorage）。
 */

interface ToolItem {
  id: string; name: string; desc: string; href: string; tags: string[]; arrow?: string
}

const TOOLS: ToolItem[] = [
  { id: 'flights', name: '实时航班动态', desc: 'AviationStack 实时航班：航显屏式列表、代码共享折叠、延误与空中遥测、原始 JSON。', href: '#/flights', tags: ['API', '实时'], arrow: '→' },
  { id: 'news', name: '新闻检索台', desc: 'Tavily 新闻检索：相关度排序、综述、图集与来源摘要，GitHub 账号核验后可用。', href: '#/news', tags: ['Tavily', '检索'], arrow: '→' },
  { id: 'apis', name: '公共接口台', desc: 'public-apis 实测免 Key 接口：天气预报与图标、每日天文图、汇率、图书检索等，点一个就发请求。', href: '#/apis', tags: ['API', '实测'], arrow: '→' },
  { id: 'json', name: 'JSON 解析与格式化', desc: '格式化 / 校验 / 修复 / 压缩 / 键排序 / 树形视图，5 档示例数据，全本地运行。', href: './tools/json.html', tags: ['JSON', '高频'] },
  { id: 'commands', name: '常用命令速查', desc: 'Git / SVN / Linux / Docker / MySQL / Redis 等 9 类 119 条，搜索 + 整组复制。', href: './tools/commands.html', tags: ['终端', '高频'] },
  { id: 'wheel', name: '今天吃什么', desc: '按时段自动推荐早/中/晚餐，8 种菜系切换的 Canvas 转盘。', href: './tools/what-to-eat.html', tags: ['摸鱼'] },
]

const LS_FAV = 'nice2.favTools'
const LS_RECENT = 'nice2.recentTools'

function readLS(key: string): string[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
}
function writeLS(key: string, v: string[]) {
  try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* 隐私模式忽略 */ }
}

export default function Tools() {
  useRise()
  const [q, setQ] = useState('')
  const [favs, setFavs] = useState<string[]>([])
  const [recent, setRecent] = useState<string[]>([])
  const [favTick, setFavTick] = useState(0) // 触发重渲染

  useEffect(() => {
    document.title = 'Tools — NICE.BLOG 2.0'
    setFavs(readLS(LS_FAV))
    setRecent(readLS(LS_RECENT))
  }, [])

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase()
    if (!kw) return TOOLS
    return TOOLS.filter((t) => (t.name + t.desc + t.tags.join()).toLowerCase().includes(kw))
  }, [q])

  const toggleFav = (id: string) => {
    const next = favs.includes(id) ? favs.filter((f) => f !== id) : [...favs, id]
    setFavs(next); writeLS(LS_FAV, next); setFavTick((t) => t + 1)
  }

  const markRecent = (id: string) => {
    const next = [id, ...recent.filter((r) => r !== id)].slice(0, 3)
    setRecent(next); writeLS(LS_RECENT, next)
  }

  const byId = (id: string) => TOOLS.find((t) => t.id === id)

  return (
    <div className="page">
      <div className="page-head">
        <h1><span className="slash">/</span>tools</h1>
        <p>纯前端零后端：输入的任何内容都不上传。旧工具页原样保留，这里只做统一的目录与个人偏好。</p>
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索工具…"
          aria-label="搜索工具"
          style={{
            marginTop: 18, maxWidth: 420, width: '100%', display: 'block',
            fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--ink)',
            background: 'var(--bg-elev)', border: '1px solid var(--line)',
            borderRadius: 4, padding: '9px 13px',
          }}
        />
      </div>

      {recent.length > 0 && (
        <section className="section" style={{ marginTop: 0, marginBottom: 26 }}>
          <h3>最近使用</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {recent.map((id) => {
              const t = byId(id)
              return t ? <a key={id} className="kg-chip" style={{ textDecoration: 'none', padding: '6px 12px' }} href={t.href} onClick={() => markRecent(id)}>{t.name} {t.arrow ?? '↗'}</a> : null
            })}
          </div>
        </section>
      )}

      <div className="grid c2" key={favTick}>
        {list.map((t) => (
          <div key={t.id} className="card tool-card rise in">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <a className="t-name" href={t.href} onClick={() => markRecent(t.id)}>{t.name} {t.arrow ?? '↗'}</a>
              <button
                onClick={() => toggleFav(t.id)}
                aria-label={favs.includes(t.id) ? '取消收藏' : '收藏'}
                style={{
                  marginLeft: 'auto', background: 'none', border: 'none', fontSize: 15,
                  color: favs.includes(t.id) ? 'var(--amber)' : 'var(--line)',
                }}>★</button>
            </div>
            <div className="t-desc">{t.desc}</div>
            <div className="t-meta">
              {t.tags.map((s) => <span key={s} className="tag">{s}</span>)}
            </div>
          </div>
        ))}
      </div>

      {favs.length > 0 && (
        <p className="muted" style={{ marginTop: 16, fontFamily: 'var(--mono)', fontSize: 11.5 }}>
          已收藏 {favs.length} 项 · 数据仅存本机 localStorage
        </p>
      )}
    </div>
  )
}
