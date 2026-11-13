import { useEffect, useMemo, useRef, useState } from 'react'
import { useRise } from '../App'
import {
  QUOTA_LIMIT, GithubRateLimitError, consumeQuota, currentUser, githubRateLimit,
  remainingQuota, signOut, verifyGithub,
  type GithubRateLimit, type GithubUser,
} from '../lib/github-auth'
import {
  NewsError, hostOf, imageUrl, loadNewsSample, publishedLabel,
  resetNewsKey, searchNews, setCustomNewsKey,
  type NewsQuery, type NewsResponse,
} from '../lib/news'

const INITIAL: NewsQuery = {
  query: '', topic: 'news', timeRange: 'week', depth: 'advanced', maxResults: 8,
}

/** 限流恢复倒计时：只重渲染自己，不带动整页每秒刷新。 */
function Countdown({ until }: { until: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!until) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [until])
  if (!until) return <span>一小时内会恢复</span>
  const left = Math.max(0, until - now)
  if (left <= 0) return <span>窗口已重置，点「核验并登录」重试</span>
  const mm = Math.floor(left / 60000)
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0')
  const at = new Date(until).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  return <span>{mm} 分 {ss} 秒后（{at}）可再用</span>
}

/* ------------------------------------------------------------- 结果条目 */

function ResultItem({ r, onImageFail }: {
  r: NonNullable<NewsResponse['results']>[number]
  onImageFail: (url: string) => void
}) {
  const thumb = imageUrl((r.images || [])[0])
  const score = typeof r.score === 'number' ? r.score : 0
  const favicon = r.favicon || ''
  return (
    <li className="news-item">
      <div className="news-score">
        <b>{score ? score.toFixed(2) : '—'}</b>
        <div className="news-scorebar" aria-hidden="true"><i style={{ height: `${Math.max(2, score * 100)}%` }} /></div>
        <span>相关度</span>
      </div>
      <div className="news-item-main">
        <div className="news-meta">
          {favicon && <img src={favicon} alt="" className="news-favicon" onError={(e) => { e.currentTarget.style.display = 'none' }} />}
          <span className="mono">{hostOf(r.url)}</span>
          {publishedLabel(r.published_date) && <span>· {publishedLabel(r.published_date)}</span>}
        </div>
        <h3><a href={r.url} target="_blank" rel="noopener noreferrer">{r.title || r.url}</a></h3>
        <p>{r.content || '这条结果没有摘要，点标题看原文。'}</p>
      </div>
      {thumb && (
        <a className="news-thumb" href={r.url} target="_blank" rel="noopener noreferrer" aria-label="打开原文">
          <img src={thumb} alt="" loading="lazy" onError={() => onImageFail(thumb)} />
        </a>
      )}
    </li>
  )
}

/* ----------------------------------------------------------------- 页面 */

export default function News() {
  useRise()
  const [user, setUser] = useState<GithubUser | null>(() => currentUser())
  const [loginDraft, setLoginDraft] = useState('')
  const [loginError, setLoginError] = useState('')
  const [rate, setRate] = useState<GithubRateLimit | null>(null)
  const [rateLimitError, setRateLimitError] = useState<{ text: string; resetAt: number } | null>(null)
  const [loggingIn, setLoggingIn] = useState(false)
  const [quotaTick, setQuotaTick] = useState(0)
  const [keyOpen, setKeyOpen] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')
  const [form, setForm] = useState<NewsQuery>(INITIAL)
  const [result, setResult] = useState<NewsResponse | null>(null)
  const [source, setSource] = useState<'live' | 'sample'>('sample')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<NewsError | null>(null)
  const [jsonOpen, setJsonOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set())
  const booted = useRef(false)

  useEffect(() => { document.title = 'News — NICE.BLOG 2.0' }, [])
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    setResult(loadNewsSample())
  }, [])
  useEffect(() => {
    let alive = true
    const read = () => { githubRateLimit().then((r) => { if (alive && r) setRate(r) }) }
    read()
    const t = window.setInterval(read, 120000) // /rate_limit 不计入配额，两分钟刷新一次
    return () => { alive = false; window.clearInterval(t) }
  }, [])

  const remaining = user ? remainingQuota(user.login) : 0
  void quotaTick // 触发重渲染以刷新剩余额度
  function patch<K extends keyof NewsQuery>(k: K, v: NewsQuery[K]) {
    setForm((s) => ({ ...s, [k]: v }))
  }
  const markImageFail = (url: string) => setFailedImages((prev) => new Set(prev).add(url))

  const useSample = () => {
    setResult(loadNewsSample()); setSource('sample'); setError(null); setFailedImages(new Set())
  }

  const doLogin = async () => {
    setLoggingIn(true); setLoginError(''); setRateLimitError(null)
    try {
      const u = await verifyGithub(loginDraft)
      setUser(u); setQuotaTick((t) => t + 1); setLoginDraft('')
    } catch (e) {
      if (e instanceof GithubRateLimitError) {
        setRateLimitError({ text: e.message, resetAt: e.resetAt })
        setLoginError(e.message)
      } else {
        setLoginError((e as Error).message)
      }
    } finally { setLoggingIn(false) }
  }

  const run = async () => {
    if (!user) { setLoginError('先用 GitHub 账号核验，再开始检索。'); return }
    if (remainingQuota(user.login) <= 0) {
      setError(new NewsError('这个账号的 1000 次额度用完了。', '换个 GitHub 账号核验，或等额度重置。'))
      return
    }
    setLoading(true); setError(null); setFailedImages(new Set())
    try {
      const r = await searchNews(form)
      setResult(r); setSource('live')
      consumeQuota(user.login); setQuotaTick((t) => t + 1)
    } catch (e) {
      setError(e instanceof NewsError ? e : new NewsError('出了点问题。', '再检索一次，或看示例结果。'))
    } finally { setLoading(false) }
  }

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(result ?? {}, null, 2))
      setCopied(true); setTimeout(() => setCopied(false), 1800)
    } catch { setCopied(false) }
  }

  const results = result?.results || []
  const gallery = useMemo(() => (result?.images || [])
    .map(imageUrl)
    .filter((u) => u && !failedImages.has(u)), [result, failedImages])
  const credits = result?.usage?.credits

  return (
    <div className="page news">
      <div className="page-head">
        <h1><span className="slash">/</span>news</h1>
        <p>新闻检索台。输入一个词，拿回按相关度排好的来源、摘要与图集。检索前先用 GitHub 账号核验，每个账号 1000 次额度。</p>
      </div>

      {!user ? (
        <section className="news-gate">
          <div className="news-gate-head">先用 GitHub 账号核验，再开始检索</div>
          <p>核验只确认账号存在，不读取任何私有资料。额度按账号记在本机。</p>
          <div className="news-gate-form">
            <span className="news-at">@</span>
            <input value={loginDraft} onChange={(e) => setLoginDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); doLogin() } }}
              placeholder="github 用户名" aria-label="GitHub 用户名" spellCheck={false} />
            <button className="btn" type="button" onClick={doLogin} disabled={loggingIn}>
              {loggingIn ? '核验中…' : '核验并登录'}
            </button>
          </div>
          {loginError && (
            <div className="news-gate-err" role="alert">
              {loginError}{rateLimitError && <> · <Countdown until={rateLimitError.resetAt} /></>}
            </div>
          )}
          {rate && (
            <div className="news-ratelimit">
              {rate.remaining > 0 ? (
                <>GitHub 接口剩余 <b>{rate.remaining}</b> / {rate.limit} 次 · 窗口 {new Date(rate.resetAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 重置</>
              ) : (
                <><span className="warn">REST 接口限流中 · </span><Countdown until={rate.resetAt} /><span className="muted"> · 头像核验不受影响，可直接登录</span></>
              )}
            </div>
          )}
          <button type="button" className="news-link" onClick={useSample}>先看示例结果 →</button>
        </section>
      ) : (
        <section className="news-account">
          {user.avatar_url && <img src={user.avatar_url} alt="" className="news-avatar" />}
          <div className="news-account-name">
            <b>@{user.login}</b>
            <span>核验于 {new Date(user.verifiedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}</span>
          </div>
          <div className="news-quota">剩余 <b>{remaining}</b> / {QUOTA_LIMIT} 次</div>
          <button type="button" className="btn ghost" onClick={() => setKeyOpen((v) => !v)}>
            {keyOpen ? '收起 Key' : '自定义 Key'}
          </button>
          <button type="button" className="btn ghost" onClick={() => { signOut(); setUser(null); setLoginError('') }}>退出</button>
        </section>
      )}

      {keyOpen && (
        <div className="news-keypanel">
          <label className="news-keyfield">
            <span>自定义 Tavily Key</span>
            <input type="password" value={keyDraft} spellCheck={false} placeholder="留空使用内置 Key"
              onChange={(e) => setKeyDraft(e.target.value)} aria-label="自定义 Tavily Key" />
          </label>
          <button type="button" className="btn" onClick={() => {
            if (keyDraft.trim()) setCustomNewsKey(keyDraft); else resetNewsKey()
            setKeyDraft(''); setKeyOpen(false)
          }}>保存</button>
          <button type="button" className="btn ghost" onClick={() => {
            resetNewsKey(); setKeyDraft(''); setKeyOpen(false)
          }}>清除自定义</button>
          <p>留空即用内置 Key；填入只存本机 localStorage，可随时清除。</p>
        </div>
      )}

      <form className="news-prompt rise" onSubmit={(e) => { e.preventDefault(); run() }}>
        <span className="news-caret" aria-hidden="true">&gt;</span>
        <input value={form.query} onChange={(e) => patch('query', e.target.value)}
          placeholder="输入要搜的新闻，例如：深圳 人工智能" aria-label="搜索关键词" />
        <button className="btn" type="submit" disabled={loading || !user || remaining <= 0}>
          {loading ? '检索中…' : '检索'}
        </button>
      </form>

      <div className="news-options">
        <label>范围
          <select value={form.topic} onChange={(e) => patch('topic', e.target.value as NewsQuery['topic'])}>
            <option value="news">新闻</option><option value="general">全网</option>
          </select>
        </label>
        <label>时间
          <select value={form.timeRange} onChange={(e) => patch('timeRange', e.target.value as NewsQuery['timeRange'])}>
            <option value="any">不限</option><option value="day">一天内</option>
            <option value="week">一周内</option><option value="month">一月内</option><option value="year">一年内</option>
          </select>
        </label>
        <label>深度
          <select value={form.depth} onChange={(e) => patch('depth', e.target.value as NewsQuery['depth'])}>
            <option value="advanced">深度</option><option value="basic">快速</option>
          </select>
        </label>
        <label>条数
          <select value={form.maxResults} onChange={(e) => patch('maxResults', Number(e.target.value))}>
            <option value={5}>5</option><option value={8}>8</option>
            <option value={12}>12</option><option value={20}>20</option>
          </select>
        </label>
        <button type="button" className="btn ghost" onClick={useSample}>示例结果</button>
        <button type="button" className="btn ghost" onClick={() => setJsonOpen((v) => !v)}>
          {jsonOpen ? '收起 JSON' : '原始 JSON'}
        </button>
      </div>

      <div className="news-status" aria-live="polite">
        <span className={`news-signal ${loading ? 'busy' : error ? 'err' : ''}`} aria-hidden="true" />
        <b>{loading ? '正在检索…' : error ? '检索没成功' : `已返回 · ${results.length} 条`}</b>
        <span className="news-sep">/</span>
        <span>{source === 'sample' ? '离线示例' : '实时检索'}</span>
        {result?.response_time && <><span className="news-sep">/</span><span>{result.response_time}s</span></>}
        {typeof credits === 'number' && <><span className="news-sep">/</span><span>{credits} credits</span></>}
        <span className="news-sep">/</span>
        <span>{user ? `剩余 ${remaining} 次` : '未登录'}</span>
      </div>

      {error && (
        <div className="news-error" role="alert">
          <div><b>{error.message}</b><p>{error.hint}</p></div>
          <div className="news-error-actions">
            <button type="button" className="btn ghost" onClick={() => run()}>再试一次</button>
            <button type="button" className="btn ghost" onClick={useSample}>看示例结果</button>
          </div>
        </div>
      )}

      {result?.answer && (
        <section className="news-answer">
          <span>综述</span>
          <p>{result.answer}</p>
        </section>
      )}

      {gallery.length > 0 && (
        <section className="news-gallery" aria-label="相关图片">
          <div className="news-gallery-head">图集 · {gallery.length} 张</div>
          <div className="news-gallery-strip">
            {gallery.map((u, i) => (
              <a key={u + i} href={u} target="_blank" rel="noopener noreferrer">
                <img src={u} alt="相关图片" loading="lazy" onError={() => markImageFail(u)} />
              </a>
            ))}
          </div>
        </section>
      )}

      {results.length > 0 ? (
        <ol className="news-list">
          {results.map((r, i) => (
            <ResultItem key={(r.id || r.url || '') + i} r={r} onImageFail={markImageFail} />
          ))}
        </ol>
      ) : (
        <div className="news-empty">
          <b>还没有结果。</b>
          <p>{user ? '写个关键词点「检索」，或先看示例结果。' : '先用 GitHub 账号核验，再开始检索。'}</p>
          <button type="button" className="btn ghost" onClick={useSample}>看示例结果</button>
        </div>
      )}

      {jsonOpen && (
        <section className="news-json-wrap" aria-label="原始响应 JSON">
          <div className="news-json-head">
            <span>原始响应 · {source === 'sample' ? '示例' : '接口'}</span>
            <button type="button" onClick={copyJson}>{copied ? '已复制' : '复制 JSON'}</button>
          </div>
          <pre className="news-json">{JSON.stringify(result ?? {}, null, 2)}</pre>
        </section>
      )}

      <section className="section news-about">
        <h3>检索说明</h3>
        <p>结果由 Tavily 提供，新闻范围走 <code>news</code> 索引，按相关度排列；深度检索会附带一段综述。图集来自响应的 <code>images</code> 字段，加载不到的图片自动略过。</p>
        <p>每个 GitHub 账号 1000 次检索额度，额度记录在本机；账号核验走 GitHub 公开头像端点，不消耗 REST 配额，因此限流时仍可直接登录。数据源 <code>app/src/lib/news.ts</code>，鉴权 <code>app/src/lib/github-auth.ts</code>。</p>
      </section>
    </div>
  )
}
