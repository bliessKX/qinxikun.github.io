/**
 * AviationStack /flights 数据层
 *
 * 接口事实（实测 2026-11-13）：
 *  - https://api.apilayer.net/aviationstack/v1/flights 用 query `access_key` 认证；
 *    响应带 Access-Control-Allow-Origin: *，浏览器可直连，无需 JSONP 或代理。
 *  - 免费档约 100 次/月；响应头 X-RateLimit-Remaining-Month 可读（已 expose）。
 *  - 401 → { message: "Unauthorized" }；429/额度耗尽 → error.code。
 *  - `flight_date` 属于 Starter 付费档，故筛选器不提供该参数。
 *
 * 因此页面默认做会话内 5 分钟缓存，避免每次刷新消耗配额；
 * 另内置样本数据，额度耗尽或断网时看板仍可用。
 */
import sample from '../data/flights.sample.json'

export const API_ENDPOINT = 'https://api.apilayer.net/aviationstack/v1/flights'
/** 用户提供的默认 Key。前端 Key 一定会被公开，界面上已标注风险，允许运行时替换。 */
export const DEFAULT_KEY = '0c473c6cc7ccb62c84643eb94e6f6eae'
const KEY_STORAGE = 'nice2.flights.key'
const CACHE_PREFIX = 'nice2.flights.cache.'
const CACHE_TTL = 5 * 60 * 1000

export const FLIGHT_STATUS = [
  { value: 'active', label: '在飞 active' },
  { value: 'scheduled', label: '计划 scheduled' },
  { value: 'landed', label: '已落地 landed' },
  { value: 'cancelled', label: '取消 cancelled' },
  { value: 'incident', label: '异常 incident' },
  { value: 'diverted', label: '备降 diverted' },
] as const

export interface FlightEndpoint {
  airport?: string
  timezone?: string
  iata?: string
  icao?: string
  terminal?: string | null
  gate?: string | null
  baggage?: string | null
  delay?: number | null
  scheduled?: string | null
  estimated?: string | null
  actual?: string | null
  estimated_runway?: string | null
  actual_runway?: string | null
}
export interface FlightLive {
  updated?: string
  latitude?: number
  longitude?: number
  altitude?: number
  direction?: number
  speed_horizontal?: number
  speed_vertical?: number
  is_ground?: boolean
}
export interface FlightRecord {
  flight_date?: string
  flight_status?: string
  departure?: FlightEndpoint
  arrival?: FlightEndpoint
  airline?: { name?: string; iata?: string; icao?: string } | null
  flight?: {
    number?: string; iata?: string; icao?: string
    codeshared?: { airline_name?: string; airline_iata?: string; flight_iata?: string } | null
  } | null
  aircraft?: { registration?: string | null; iata?: string | null; icao?: string | null; icao24?: string | null } | null
  live?: FlightLive | null
}
export interface FlightPagination { limit?: number; offset?: number; count?: number; total?: number }
export interface FlightResponse {
  pagination?: FlightPagination
  data?: FlightRecord[]
  error?: { code?: string; message?: string; info?: string }
  message?: string
}
export interface FlightResult {
  response: FlightResponse
  remaining: number | null
  cached: boolean
  at: number
}

export interface FlightQuery {
  access_key: string
  limit: number
  offset: number
  flight_status?: string
  dep_iata?: string
  arr_iata?: string
  airline_iata?: string
  airline_name?: string
  flight_iata?: string
  flight_number?: string
  min_delay_dep?: string
  max_delay_dep?: string
}

/** 运行时可替换 Key：优先用户设置，否则用内置默认值。 */
export function getKey(): string {
  try { return localStorage.getItem(KEY_STORAGE) || DEFAULT_KEY } catch { return DEFAULT_KEY }
}
export function setKey(key: string) {
  try { localStorage.setItem(KEY_STORAGE, key.trim()) } catch { /* 忽略 */ }
}
export function resetKey() {
  try { localStorage.removeItem(KEY_STORAGE) } catch { /* 忽略 */ }
}

export class FlightError extends Error {
  hint: string
  constructor(message: string, hint: string) { super(message); this.hint = hint; this.name = 'FlightError' }
}

function cacheKeyOf(q: FlightQuery) {
  const { access_key: _k, ...rest } = q
  void _k
  return CACHE_PREFIX + JSON.stringify(rest)
}
function readCache(key: string): FlightResult | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as FlightResult
    if (Date.now() - parsed.at > CACHE_TTL) { sessionStorage.removeItem(key); return null }
    return parsed
  } catch { return null }
}
function writeCache(key: string, value: FlightResult) {
  try { sessionStorage.setItem(key, JSON.stringify(value)) } catch { /* 配额满忽略 */ }
}

const inflight = new Map<string, Promise<FlightResult>>()

/** 请求一次航班数据。force=true 跳过缓存；并发同条件请求合并，避免重复消耗额度。 */
export function fetchFlights(q: FlightQuery, opts: { force?: boolean; signal?: AbortSignal } = {}): Promise<FlightResult> {
  const ck = cacheKeyOf(q)
  if (!opts.force) {
    const hit = readCache(ck)
    if (hit) return Promise.resolve({ ...hit, cached: true })
    const running = inflight.get(ck)
    if (running) return running
  }
  const p = requestFlights(q, opts, ck).finally(() => inflight.delete(ck))
  inflight.set(ck, p)
  return p
}

async function requestFlights(q: FlightQuery, opts: { force?: boolean; signal?: AbortSignal }, ck: string): Promise<FlightResult> {
  const url = new URL(API_ENDPOINT)
  Object.entries(q).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== '') url.searchParams.set(k, String(v))
  })

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  const onAbort = () => ctrl.abort()
  opts.signal?.addEventListener('abort', onAbort, { once: true })

  let res: Response
  try {
    res = await fetch(url.toString(), { signal: ctrl.signal, headers: { Accept: 'application/json' } })
  } catch (e) {
    throw new FlightError(
      (e as Error).name === 'AbortError' ? '接口 15 秒没回。' : '接口没连上。',
      '重试一次，或点「载入样本」继续看板。',
    )
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onAbort)
  }

  const remainingHeader = res.headers.get('X-RateLimit-Remaining-Month') || res.headers.get('RateLimit-Remaining')
  const remaining = remainingHeader ? Number(remainingHeader) : null

  let json: FlightResponse
  try { json = await res.json() } catch { throw new FlightError('接口返回的不是 JSON。', '稍后重试，或载入样本数据。') }

  if (res.status === 401 || json.message === 'Unauthorized') {
    throw new FlightError('这个 Key 没被接受。', '在「Key」里换一个，或点「载入样本」继续看板。')
  }
  if (res.status === 429 || json.error?.code === 'usage_limit_reached' || json.error?.code === 'rate_limit') {
    throw new FlightError('本月调用额度用完了。', '点「载入样本」看离线数据，或等额度重置。')
  }
  if (!res.ok || json.error) {
    throw new FlightError(json.error?.info || json.error?.message || `接口返回 ${res.status}。`, '检查筛选参数，或载入样本数据。')
  }
  if (!Array.isArray(json.data)) {
    throw new FlightError('响应里没有 data 数组。', '载入样本数据，或稍后重试。')
  }

  const result: FlightResult = { response: json, remaining, cached: false, at: Date.now() }
  writeCache(ck, result)
  return result
}

/** 离线样本：不消耗调用额度，覆盖延误 / live 遥测 / 代码共享 / 深圳航线。 */
export function loadSample(): FlightResult {
  return {
    response: sample as FlightResponse,
    remaining: null,
    cached: false,
    at: Date.now(),
  }
}

/* ------------------------------------------------------------ 数据整理 */

export interface FlightGroup {
  key: string
  primary: FlightRecord
  members: FlightRecord[]
  mainNumber: string
  airlineNames: string[]
}

/**
 * 同一物理航班常被多家代码共享航司重复返回（样例里 SYD→AKL 的 NZ106 出现 5 次）。
 * 按「出发/到达/计划时刻/主航班号/机号」聚合成一组，默认只显示一条。
 */
export function groupFlights(data: FlightRecord[]): FlightGroup[] {
  const map = new Map<string, FlightRecord[]>()
  data.forEach((f) => {
    const cs = f.flight?.codeshared
    const key = [
      f.departure?.iata || '', f.arrival?.iata || '', f.departure?.scheduled || '',
      cs?.flight_iata || f.flight?.iata || '', f.aircraft?.icao24 || '',
    ].join('|')
    const arr = map.get(key) || []
    arr.push(f)
    map.set(key, arr)
  })
  return [...map.entries()].map(([key, members]) => {
    // 无 codeshared 的那条才是承运人主记录；否则取第一条
    const primary = members.find((m) => !m.flight?.codeshared) || members[0]
    const mainNumber = (primary.flight?.codeshared?.flight_iata || primary.flight?.iata || '—').toUpperCase()
    return {
      key, primary, members, mainNumber,
      airlineNames: [...new Set(members.map((m) => m.airline?.name).filter(Boolean) as string[])],
    }
  })
}

export function visibleRows(groups: FlightGroup[], showCodeshares: boolean) {
  return showCodeshares ? groups.flatMap((g) => g.members) : groups.map((g) => g.primary)
}

export interface FlightSummary {
  total: number
  airborne: number
  delayed: number
  avgDelay: number
  topDep: string
  topDepCount: number
}
export function summarize(rows: FlightRecord[]): FlightSummary {
  const airborne = rows.filter((r) => r.live && !r.live.is_ground).length
  const delays = rows.map((r) => r.departure?.delay ?? 0).filter((n) => n > 0)
  const depCount = new Map<string, number>()
  rows.forEach((r) => {
    const k = r.departure?.iata || '—'
    depCount.set(k, (depCount.get(k) || 0) + 1)
  })
  const [topDep, topDepCount] = [...depCount.entries()].sort((a, b) => b[1] - a[1])[0] || ['—', 0]
  return {
    total: rows.length, airborne, delayed: delays.length,
    avgDelay: delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : 0,
    topDep, topDepCount,
  }
}

/** 接口时刻字符串里的 HH:mm 已是机场本地时间，不做时区换算（aviationstack 的既有行为）。 */
export function hhmm(s?: string | null): string {
  return s && s.length >= 16 ? s.slice(11, 16) : '—'
}
export function dateOf(s?: string | null): string {
  return s ? s.slice(0, 10) : '—'
}
export function delayOf(r: FlightRecord): number {
  return Math.max(r.departure?.delay ?? 0, r.arrival?.delay ?? 0)
}
export const STATUS_LABEL: Record<string, string> = {
  active: '在飞', scheduled: '计划', landed: '已落地', cancelled: '取消', incident: '异常', diverted: '备降',
}
/** 状态色只表达航班状态；延误是另一维度，由界面上的 flt-delay 单独着色。 */
export function statusTone(status?: string, _delay = 0): 'ok' | 'warn' | 'bad' | 'live' {
  void _delay
  if (status === 'cancelled' || status === 'incident' || status === 'diverted') return 'bad'
  if (status === 'landed') return 'ok'
  return 'live'
}
