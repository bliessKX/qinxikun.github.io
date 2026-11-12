/**
 * NICE.BLOG 2.0 · 访问统计的数据层
 *
 * 【能力边界，务必如实理解】
 * localStorage 按「域名 + 浏览器」隔离：JS 跑在访客各自的浏览器里，
 * A 写的数据 B 永远读不到。因此纯前端只能记录「本设备」的访问行为，
 * 无法汇总全站访客。真实全站统计必须有一个中心化接收端（第三方统计
 * 脚本 / 自建计数 API）。本模块把数据源收敛为 loadVisits() 一个函数，
 * 将来接后端只需把它换成 fetch(...)，上层的 buildSnapshot 与看板不用改。
 *
 * 两种数据源：
 *   live  — 本机真实埋点（路由变化时由 App 调用 trackVisit）
 *   demo  — 确定性生成的演示数据（默认），同一天刷新不会乱跳
 */
import articles from '../data/articles.json'

export type SourceKey = 'direct' | 'search' | 'internal' | 'social' | 'other'
export type DeviceKey = 'desktop' | 'mobile' | 'tablet'

export interface VisitEvent {
  ts: number
  path: string
  ref: SourceKey
  referrer: string
  session: string
  device: DeviceKey
  browser: string
  /** 在该页面停留的秒数；真实埋点用「距下一次导航的间隔」近似 */
  dwell: number
}

const KEY_VISITS = 'nice2.analytics.visits.v1'
const KEY_VISITOR = 'nice2.analytics.visitor.v1'
const KEY_SESSION = 'nice2.analytics.session.v1'
export const MAX_EVENTS = 6000

export const SOURCE_META: Record<SourceKey, { label: string; color: string }> = {
  direct: { label: '直接访问', color: '#f0a832' },
  search: { label: '搜索引擎', color: '#4dd8e6' },
  internal: { label: '站内跳转', color: '#7bc96f' },
  social: { label: '社交分享', color: '#b98ae0' },
  other: { label: '其他来源', color: '#8a93a6' },
}

export const DEVICE_META: Record<DeviceKey, { label: string; color: string }> = {
  desktop: { label: '桌面端', color: '#f0a832' },
  mobile: { label: '移动端', color: '#4dd8e6' },
  tablet: { label: '平板', color: '#7bc96f' },
}

export const PAGE_LABELS: Record<string, string> = {
  '/': '首页',
  '/blog': '文章列表',
  '/tools': '工具中心',
  '/knowledge': '知识图谱',
  '/lab': '技术实验室',
  '/projects': '项目',
  '/about': '关于',
  '/stats': '访问统计',
}

export function pathLabel(path: string): string {
  if (PAGE_LABELS[path]) return PAGE_LABELS[path]
  const m = path.match(/^\/blog\/(\d+)$/)
  if (m) {
    const a = (articles as Array<{ n: number; short: string }>).find((x) => x.n === Number(m[1]))
    return a ? `文章 · ${a.short}` : `文章 · ${m[1]}`
  }
  return path || '/'
}

/* ---------------------------------------------------------------- 工具 */

function safeGet(store: Storage, key: string): string | null {
  try { return store.getItem(key) } catch { return null }
}
function safeSet(store: Storage, key: string, value: string) {
  try { store.setItem(key, value) } catch { /* 隐私模式 / 配额满，静默降级 */ }
}

function uid(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().slice(0, 12)
  } catch { /* fallthrough */ }
  return Math.random().toString(36).slice(2, 14)
}

export function dayKey(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function classifyReferrer(raw: string, sameOrigin: string): SourceKey {
  if (!raw) return 'direct'
  try {
    const u = new URL(raw)
    if (u.host === sameOrigin) return 'internal'
    const h = u.hostname
    if (/google|baidu|bing|sogou|so\.com|duckduckgo|yandex/.test(h)) return 'search'
    if (/weibo|zhihu|twitter|x\.com|facebook|weixin|qq\.com|douyin|bilibili|juejin|github/.test(h)) return 'social'
    return 'other'
  } catch { return 'other' }
}

function detectDevice(): DeviceKey {
  const w = window.innerWidth
  const ua = navigator.userAgent
  if (/iPad|Tablet|PlayBook|Silk/.test(ua) || (w >= 700 && w < 1100 && /Mobile/.test(ua))) return 'tablet'
  if (/Mobi|Android|iPhone|Windows Phone/.test(ua) || w < 700) return 'mobile'
  return 'desktop'
}

function detectBrowser(): string {
  const ua = navigator.userAgent
  if (/Edg\//.test(ua)) return 'Edge'
  if (/OPR\//.test(ua)) return 'Opera'
  if (/Firefox\//.test(ua)) return 'Firefox'
  if (/Chrome\//.test(ua)) return 'Chrome'
  if (/Safari\//.test(ua)) return 'Safari'
  return '其他'
}

/* ------------------------------------------------- 真实埋点（本设备） */

/** 生成/复用一个稳定的访客标识（仅本机有意义）。 */
export function visitorId(): string {
  let v = safeGet(localStorage, KEY_VISITOR)
  if (!v) { v = uid(); safeSet(localStorage, KEY_VISITOR, v) }
  return v
}

/** 每个标签页会话一个 id，用来近似 UV（会话数）。 */
export function sessionId(): string {
  let s = safeGet(sessionStorage, KEY_SESSION)
  if (!s) { s = uid(); safeSet(sessionStorage, KEY_SESSION, s) }
  return s
}

export function readVisits(): VisitEvent[] {
  try {
    const raw = localStorage.getItem(KEY_VISITS)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? (arr as VisitEvent[]).filter((e) => e && typeof e.ts === 'number') : []
  } catch { return [] }
}

/**
 * 记录一次 PV。App 在路由变化时调用。
 * 去重：同一会话里 800ms 内对同一路径的重复触发（StrictMode 双调用、
 * 重复点击同一导航）只算一次。
 */
export function trackVisit(path: string): void {
  const list = readVisits()
  const ts = Date.now()
  const sid = sessionId()
  const last = list[list.length - 1]
  if (last && last.session === sid && last.path === path && ts - last.ts < 800) return

  // 用「距下一次导航的间隔」给上一条事件补一个近似停留时长
  if (last && last.session === sid && ts - last.ts > 0 && ts - last.ts < 30 * 60 * 1000) {
    last.dwell = Math.min(1800, Math.round((ts - last.ts) / 1000))
  }

  const referrer = document.referrer || ''
  const ev: VisitEvent = {
    ts,
    path: path || '/',
    ref: last && last.session === sid ? 'internal' : classifyReferrer(referrer, location.host),
    referrer,
    session: sid,
    device: detectDevice(),
    browser: detectBrowser(),
    dwell: 0,
  }
  visitorId()
  list.push(ev)
  const trimmed = list.length > MAX_EVENTS ? list.slice(-MAX_EVENTS) : list
  try { localStorage.setItem(KEY_VISITS, JSON.stringify(trimmed)) } catch { /* 忽略 */ }
}

export function clearVisits(): void {
  try { localStorage.removeItem(KEY_VISITS) } catch { /* 忽略 */ }
}

export function exportVisits(visits: VisitEvent[], format: 'json' | 'csv'): void {
  let text = ''
  let mime = 'application/json;charset=utf-8'
  if (format === 'json') {
    text = JSON.stringify(visits, null, 2)
  } else {
    const head = '时间,路径,页面,来源,设备,浏览器,会话,停留秒数'
    const rows = visits.map((v) => [
      new Date(v.ts).toLocaleString('zh-CN'), v.path, pathLabel(v.path),
      SOURCE_META[v.ref]?.label || v.ref, DEVICE_META[v.device]?.label || v.device,
      v.browser, v.session, v.dwell,
    ].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(','))
    text = '\uFEFF' + [head, ...rows].join('\r\n')
    mime = 'text/csv;charset=utf-8'
  }
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `nice-blog-visits-${dayKey(Date.now())}.${format}`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* ------------------------------------------------- 演示数据（确定性） */

/** mulberry32：同一 seed 永远产出同一序列，保证刷新后图表不跳。 */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
function pick<T>(r: () => number, items: Array<[T, number]>): T {
  const total = items.reduce((s, [, w]) => s + w, 0)
  let x = r() * total
  for (const [item, w] of items) { x -= w; if (x <= 0) return item }
  return items[items.length - 1][0]
}

const PAGE_WEIGHTS: Array<[string, number]> = [
  ['/', 24], ['/blog', 15], ['/blog/1', 7], ['/blog/2', 5], ['/blog/3', 5],
  ['/blog/4', 3], ['/blog/5', 3], ['/tools', 9], ['/knowledge', 8],
  ['/lab', 6], ['/projects', 5], ['/about', 3], ['/stats', 4],
]
const SOURCE_WEIGHTS: Array<[SourceKey, number]> = [
  ['direct', 42], ['search', 28], ['internal', 14], ['social', 10], ['other', 6],
]
const REFERRER_SAMPLE: Record<SourceKey, string> = {
  direct: '', search: 'https://www.google.com/', internal: location.origin + '/',
  social: 'https://github.com/', other: 'https://example.com/',
}
const DEVICE_WEIGHTS: Array<[DeviceKey, number]> = [['desktop', 66], ['mobile', 29], ['tablet', 5]]
const BROWSER_WEIGHTS: Array<[string, number]> = [['Chrome', 58], ['Edge', 20], ['Safari', 12], ['Firefox', 7], ['其他', 3]]
/** 24 小时访问权重：早高峰 / 午后 / 晚间三段，深夜走低 */
const HOUR_WEIGHTS = [
  2, 1, 1, 1, 1, 2, 4, 7, 12, 18, 22, 20,
  16, 18, 21, 23, 22, 19, 17, 20, 24, 22, 14, 7,
]

/**
 * 生成最近 `days` 天的演示访问流。以「日期字符串」为 seed，
 * 因此历史每天的数据恒定，只有新的一天会追加，趋势看起来才像真的。
 */
export function generateDemo(days = 60): VisitEvent[] {
  const out: VisitEvent[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const baseTs = today.getTime()

  for (let d = days - 1; d >= 0; d--) {
    const date = new Date(baseTs - d * 86400000)
    const key = dayKey(date.getTime())
    const r = rng(hash('nice2.demo.' + key))
    const weekday = date.getDay()
    const weekend = weekday === 0 || weekday === 6
    // 缓步增长 + 周末回落 + 每月 8 号的内容爆发 + 随机波动
    const growth = 88 + (days - 1 - d) * 0.55
    const spike = date.getDate() === 8 ? 1.75 : 1
    const pv = Math.max(24, Math.round(growth * (weekend ? 0.76 : 1) * spike * (0.78 + r() * 0.48)))

    // 把当天 PV 分给若干会话，每个会话连续浏览 1–4 页
    const sessions: string[] = []
    const perSession = 1.7 + r() * 0.7
    for (let s = 0; s < Math.ceil(pv / perSession); s++) sessions.push(`demo-${key}-${s}`)
    let si = 0
    let left = 1 + Math.floor(r() * 4)

    for (let i = 0; i < pv; i++) {
      const hour = pick(r, HOUR_WEIGHTS.map((w, h) => [h, w] as [number, number]))
      const ts = date.getTime() + hour * 3600000 + Math.floor(r() * 3600000)
      const ref = pick(r, SOURCE_WEIGHTS)
      out.push({
        ts,
        path: pick(r, PAGE_WEIGHTS),
        ref,
        referrer: REFERRER_SAMPLE[ref],
        session: sessions[Math.min(si, sessions.length - 1)],
        device: pick(r, DEVICE_WEIGHTS),
        browser: pick(r, BROWSER_WEIGHTS),
        dwell: Math.round(45 + r() * 380),
      })
      left--
      if (left <= 0) { si++; left = 1 + Math.floor(r() * 4) }
    }
  }
  return out.sort((a, b) => a.ts - b.ts)
}

/* ------------------------------------------------------------ 聚合快照 */

export interface TrendPoint { key: string; label: string; pv: number; uv: number }
export interface RankRow { name: string; path: string; count: number; pct: number }
export interface Slice { key: string; label: string; count: number; color: string; pct: number }

export interface AnalyticsSnapshot {
  source: 'live' | 'demo'
  visits: VisitEvent[]
  days: number
  total: number
  visitors: number
  today: number
  yesterday: number
  todayDelta: number
  avgDaily: number
  avgDuration: number
  bounceRate: number
  trend: TrendPoint[]
  hours: number[]
  paths: RankRow[]
  sources: Slice[]
  devices: Slice[]
  recent: VisitEvent[]
  peakHour: number
}

export function buildSnapshot(visits: VisitEvent[], days: number, source: 'live' | 'demo'): AnalyticsSnapshot {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const todayStart = now.getTime()
  const rangeStart = todayStart - (days - 1) * 86400000
  const scoped = visits.filter((v) => v.ts >= rangeStart && v.ts < todayStart + 86400000)

  const trend: TrendPoint[] = []
  const dayMap = new Map<string, { pv: number; sessions: Set<string> }>()
  for (let d = days - 1; d >= 0; d--) {
    const k = dayKey(todayStart - d * 86400000)
    dayMap.set(k, { pv: 0, sessions: new Set() })
  }
  scoped.forEach((v) => {
    const bucket = dayMap.get(dayKey(v.ts))
    if (bucket) { bucket.pv++; bucket.sessions.add(v.session) }
  })
  dayMap.forEach((v, k) => trend.push({ key: k, label: k.slice(5).replace('-', '/'), pv: v.pv, uv: v.sessions.size }))

  const sessionsInRange = new Set(scoped.map((v) => v.session))
  const total = scoped.length
  const today = trend[trend.length - 1]?.pv || 0
  const yesterday = trend[trend.length - 2]?.pv || 0
  const todayDelta = yesterday ? (today - yesterday) / yesterday * 100 : (today ? 100 : 0)

  const hours = Array(24).fill(0) as number[]
  scoped.forEach((v) => { hours[new Date(v.ts).getHours()]++ })

  const pathCounts = new Map<string, number>()
  scoped.forEach((v) => pathCounts.set(v.path, (pathCounts.get(v.path) || 0) + 1))
  const paths: RankRow[] = [...pathCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([path, count]) => ({ path, name: pathLabel(path), count, pct: total ? count / total * 100 : 0 }))

  const sliceOf = (counts: Map<string, number>, meta: Record<string, { label: string; color: string }>): Slice[] =>
    [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({
      key, label: meta[key]?.label || key, color: meta[key]?.color || '#8a93a6',
      count, pct: total ? count / total * 100 : 0,
    }))

  const srcCounts = new Map<string, number>()
  const devCounts = new Map<string, number>()
  scoped.forEach((v) => {
    srcCounts.set(v.ref, (srcCounts.get(v.ref) || 0) + 1)
    devCounts.set(v.device, (devCounts.get(v.device) || 0) + 1)
  })

  const dwellEvents = scoped.filter((v) => v.dwell > 0)
  const avgDuration = dwellEvents.length
    ? Math.round(dwellEvents.reduce((s, v) => s + v.dwell, 0) / dwellEvents.length) : 0

  // 单页会话占比 ≈ 跳出率
  const sessionPv = new Map<string, number>()
  scoped.forEach((v) => sessionPv.set(v.session, (sessionPv.get(v.session) || 0) + 1))
  const sessionCount = sessionPv.size || 1
  const bounces = [...sessionPv.values()].filter((n) => n === 1).length
  const bounceRate = bounces / sessionCount * 100

  return {
    source, visits: scoped, days, total, visitors: sessionsInRange.size,
    today, yesterday, todayDelta,
    avgDaily: Math.round(total / days), avgDuration, bounceRate,
    trend, hours, paths, sources: sliceOf(srcCounts, SOURCE_META), devices: sliceOf(devCounts, DEVICE_META),
    recent: [...scoped].sort((a, b) => b.ts - a.ts).slice(0, 12),
    peakHour: hours.indexOf(Math.max(...hours)),
  }
}

/** 数据源唯一入口：将来接后端时，把这里换成 fetch 返回值即可。 */
export function loadVisits(source: 'live' | 'demo'): VisitEvent[] {
  return source === 'demo' ? generateDemo(60) : readVisits()
}
