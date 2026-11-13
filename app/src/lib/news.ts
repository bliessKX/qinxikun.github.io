/**
 * Tavily /search 数据层（浏览器直连）。
 *
 * 实测 2026-11-13：POST https://api.tavily.com/search 用
 * Authorization: Bearer <key> 认证；OPTIONS 预检返回
 * access-control-allow-origin: * / allow-headers: content-type,authorization，
 * 因此纯前端可直接调用，无需代理或 JSONP。keyless 走 REST 会 401。
 *
 * 官方 @tavily/core 是 Node 向 SDK（读 process.env、配 Node proxy），
 * 浏览器打包有风险；这里用等价的 REST 参数，零新依赖。
 * 参数与 SDK 的对应关系：searchDepth→search_depth、maxResults→max_results、
 * includeAnswer→include_answer、includeImages→include_images 等。
 */
import sample from '../data/news.sample.json'

export const TAVILY_ENDPOINT = 'https://api.tavily.com/search'
/** 内置默认 Key，界面不展示；使用者可在页面填自己的 Key 覆盖。 */
export const DEFAULT_NEWS_KEY = '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'
const KEY_STORAGE = 'nice2.news.key.v1'

export function getNewsKey(): string {
  try { return localStorage.getItem(KEY_STORAGE) || DEFAULT_NEWS_KEY } catch { return DEFAULT_NEWS_KEY }
}
export function setCustomNewsKey(key: string) {
  try { localStorage.setItem(KEY_STORAGE, key.trim()) } catch { /* 忽略 */ }
}
export function resetNewsKey() {
  try { localStorage.removeItem(KEY_STORAGE) } catch { /* 忽略 */ }
}

export interface NewsResult {
  url: string
  title: string
  content: string
  score?: number
  published_date?: string | null
  favicon?: string | null
  images?: Array<string | { url?: string; description?: string }> | null
  raw_content?: string | null
  id?: string
}
export interface NewsResponse {
  query?: string
  answer?: string | null
  images?: Array<string | { url?: string; description?: string }>
  results?: NewsResult[]
  response_time?: number
  usage?: { credits?: number }
  request_id?: string
  detail?: { error?: string }
}
export interface NewsQuery {
  query: string
  topic: 'general' | 'news'
  timeRange: 'any' | 'day' | 'week' | 'month' | 'year'
  depth: 'basic' | 'advanced'
  maxResults: number
}

export class NewsError extends Error {
  hint: string
  constructor(message: string, hint: string) { super(message); this.hint = hint; this.name = 'NewsError' }
}

export async function searchNews(q: NewsQuery, outerSignal?: AbortSignal): Promise<NewsResponse> {
  const key = getNewsKey()
  if (!key) throw new NewsError('还没有可用的 Key。', '在「自定义 Key」里填一个，或先看示例结果。')
  if (!q.query.trim()) throw new NewsError('先写点要搜的内容。', '输入关键词再点检索。')

  const body: Record<string, unknown> = {
    query: q.query.trim(),
    topic: q.topic,
    search_depth: q.depth,
    max_results: q.maxResults,
    include_images: true,
    include_favicon: true,
    include_answer: q.depth === 'advanced',
    include_usage: true,
  }
  // time_range 只在新闻主题下有意义
  if (q.topic === 'news' && q.timeRange !== 'any') body.time_range = q.timeRange

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20000)
  const onAbort = () => ctrl.abort()
  outerSignal?.addEventListener('abort', onAbort, { once: true })

  let res: Response
  try {
    res = await fetch(TAVILY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
  } catch (e) {
    throw new NewsError(
      (e as Error).name === 'AbortError' ? '接口 20 秒没回。' : '接口没连上。',
      '再检索一次，或看示例结果。',
    )
  } finally {
    clearTimeout(timer)
    outerSignal?.removeEventListener('abort', onAbort)
  }

  let json: NewsResponse
  try { json = await res.json() } catch {
    throw new NewsError('接口返回的不是 JSON。', '稍后重试，或看示例结果。')
  }
  const detail = json.detail?.error || ''
  if (res.status === 401 || /unauthorized|invalid api key/i.test(detail)) {
    throw new NewsError('这个 Key 没被接受。', '换一个 Key，或看示例结果。')
  }
  if (res.status === 429 || /rate limit|quota|credits/i.test(detail)) {
    throw new NewsError('调用额度用完了。', '换一个 Key，或等额度重置。')
  }
  if (!res.ok) {
    throw new NewsError(detail || `接口返回 ${res.status}。`, '调整关键词再试，或看示例结果。')
  }
  if (!Array.isArray(json.results)) {
    throw new NewsError('响应里没有结果列表。', '换个关键词，或看示例结果。')
  }
  return json
}

export function imageUrl(img: string | { url?: string } | null | undefined): string {
  if (!img) return ''
  return typeof img === 'string' ? img : img.url || ''
}
export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}
export function publishedLabel(s?: string | null): string {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return ''
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (days <= 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 30) return `${days} 天前`
  return d.toLocaleDateString('zh-CN')
}

/** 离线示例：不消耗额度，用于未登录或接口失败时预览版式。 */
export function loadNewsSample(): NewsResponse {
  return sample as NewsResponse
}
