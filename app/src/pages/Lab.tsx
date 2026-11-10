import { useEffect, useState } from 'react'
import { useRise } from '../App'

/* Sprint 7（v1 降级版）— 技术实验室：
 * 今日交付 JSON 工作台 + 正则测试器 + 时间戳/Base64 工具（纯前端、零依赖）。
 * sql.js / Monaco / Mermaid 完整版见 TECH_STACK_DECISIONS.md §2 的升级路径。
 */

const SAMPLE = '{"site":"NICE.BLOG","version":2,"stack":["React","Vite","TS"],"ok":true}'

function tryJson(text: string): { ok: boolean; out: string } {
  try {
    const v = JSON.parse(text)
    return { ok: true, out: JSON.stringify(v, null, 2) }
  } catch (e) {
    return { ok: false, out: (e as Error).message }
  }
}

export default function Lab() {
  useRise()
  const [input, setInput] = useState(SAMPLE)
  const [result, setResult] = useState<{ ok: boolean; out: string }>(() => tryJson(SAMPLE))
  const [re, setRe] = useState('\\d{4}-\\d{2}-\\d{2}')
  const [reText, setReText] = useState('上线于 2026-11-10，共 11 篇文章')
  const [stamp, setStamp] = useState(() => String(Math.floor(Date.now() / 1000)))
  const [b64, setB64] = useState('')
  const [b64Text, setB64Text] = useState('NICE.BLOG 2.0')

  useEffect(() => { document.title = 'Lab — NICE.BLOG 2.0' }, [])

  return (
    <div className="page">
      <div className="page-head">
        <h1><span className="slash">/</span>lab</h1>
        <p>在线开发工作台 v1 —— 全部计算在本机完成，输入不离开浏览器。SQLite 沙箱与 Monaco 编辑器在后续版本加入。</p>
      </div>

      <div className="lab-grid">
        <div className="card lab-card rise">
          <h4>JSON 工作台</h4>
          <div className="l-desc">解析 + 格式化，错误直接给浏览器原始报错位置。</div>
          <div className="lab-io">
            <textarea value={input} onChange={(e) => { setInput(e.target.value); setResult(tryJson(e.target.value)) }} aria-label="JSON 输入" />
            <pre className={result.ok ? '' : 'err'} aria-live="polite">{result.out}</pre>
          </div>
          <div className="lab-tools">
            <button className="kg-chip" onClick={() => { const c = result.ok ? JSON.stringify(JSON.parse(input)) : input; setInput(c); setResult(tryJson(c)) }}>压缩</button>
            <button className="kg-chip" onClick={() => { setInput(SAMPLE); setResult(tryJson(SAMPLE)) }}>载入示例</button>
          </div>
        </div>

        <div className="card lab-card rise">
          <h4>正则测试器</h4>
          <div className="l-desc">实时匹配，所有命中高亮列出。</div>
          <div className="lab-io" style={{ gridTemplateColumns: '1fr' }}>
            <textarea value={re} onChange={(e) => setRe(e.target.value)} style={{ minHeight: 54 }} aria-label="正则表达式" />
            <textarea value={reText} onChange={(e) => setReText(e.target.value)} style={{ minHeight: 96 }} aria-label="测试文本" />
          </div>
          {(() => {
            try {
              const re2 = new RegExp(re, 'g')
              const hits = [...reText.matchAll(re2)].map((m) => m[0])
              return (
                <pre style={{ marginTop: 10, color: hits.length ? 'var(--green)' : 'var(--muted)' }} aria-live="polite">
                  {hits.length ? hits.length + ' 个匹配：' + hits.join('  ') : '无匹配'}
                </pre>
              )
            } catch (e) { return <pre className="err" style={{ marginTop: 10 }}>{(e as Error).message}</pre> }
          })()}
        </div>

        <div className="card lab-card rise">
          <h4>时间戳 / Base64</h4>
          <div className="l-desc">双向转换，常查常新。</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
            <input value={stamp} onChange={(e) => setStamp(e.target.value)} aria-label="Unix 时间戳"
              style={{ flex: '1 1 140px', fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--ink)', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 4, padding: '7px 10px' }} />
            <span className="muted mono" style={{ fontSize: 12 }}>{isNaN(+stamp) ? '无效' : new Date(+stamp * 1000).toLocaleString('zh-CN')}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
            <input value={b64Text} onChange={(e) => { setB64Text(e.target.value); try { setB64(btoa(unescape(encodeURIComponent(e.target.value)))) } catch { setB64('?') } }}
              aria-label="Base64 源文本"
              style={{ flex: '1 1 140px', fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--ink)', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 4, padding: '7px 10px' }} />
            <span className="muted mono" style={{ fontSize: 12, wordBreak: 'break-all', flex: '1 1 180px' }}>{b64}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
