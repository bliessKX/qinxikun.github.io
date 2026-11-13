/**
 * /apis 公共接口台的数据层。
 *
 * 来源：public-apis/public-apis（52 个分类，README 356 KB）。
 * 清单里标注「No Auth」不等于浏览器能用——很多没有 CORS 或端点已失效。
 * 下面 15 个都是 2026-11-13 实测：免 Key、HTTPS、CORS 可直连，
 * 或端点本身是 <img> 可直接加载的图片。
 */
export interface City {
  name: string; lat: number; lon: number; wttr: string
}

/** 城市预设：坐标喂 Open-Meteo，英文名喂 wttr.in。 */
export const CITIES: City[] = [
  { name: '深圳', lat: 22.5431, lon: 114.0579, wttr: 'Shenzhen' },
  { name: '北京', lat: 39.9042, lon: 116.4074, wttr: 'Beijing' },
  { name: '上海', lat: 31.2304, lon: 121.4737, wttr: 'Shanghai' },
  { name: '中国香港', lat: 22.3193, lon: 114.1694, wttr: 'Hong+Kong' },
  { name: '东京', lat: 35.6762, lon: 139.6503, wttr: 'Tokyo' },
  { name: '伦敦', lat: 51.5072, lon: -0.1276, wttr: 'London' },
  { name: '纽约', lat: 40.7128, lon: -74.0060, wttr: 'New+York' },
]

export type ApiKind = 'weather' | 'air' | 'hko' | 'picture' | 'photo' | 'text' | 'json'
export interface ApiCtx { city: City; q: string }
export interface ApiDef {
  id: string
  name: string
  category: string
  desc: string
  kind: ApiKind
  auth: string
  cors: string
  build: (ctx: ApiCtx) => string
  extract?: (data: unknown) => { imageUrl?: string; title?: string; text?: string }
  hint?: string
}
export const CATEGORIES = ['天气', '图片与动物', '趣味', '数据'] as const

export const APIS: ApiDef[] = [
  {
    id: 'open-meteo', name: 'Open-Meteo', category: '天气',
    desc: '全球天气预报，当前实况 + 7 日预报，非商业用途免费。',
    kind: 'weather', auth: 'No', cors: 'Yes',
    build: ({ city }) => `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=7`,
  },
  {
    id: 'air-quality', name: 'Open-Meteo 空气质量', category: '天气',
    desc: '当前 US AQI 与 PM2.5，同一坐标体系。',
    kind: 'air', auth: 'No', cors: 'Yes',
    build: ({ city }) => `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${city.lat}&longitude=${city.lon}&current=us_aqi,pm2_5,pm10`,
  },
  {
    id: 'wttr-png', name: 'wttr.in 天气图', category: '天气',
    desc: '服务端直接渲染的终端风天气图（PNG），适合贴在任何页面。',
    kind: 'picture', auth: 'No', cors: 'Yes',
    build: ({ city }) => `https://wttr.in/${city.wttr}_0pq.png`,
  },
  {
    id: 'hko', name: '中国香港天文台', category: '天气',
    desc: '开放数据：分区实时气温、湿度与警告信息。',
    kind: 'hko', auth: 'No', cors: 'Yes',
    build: () => 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=tc',
  },
  {
    id: 'geocoding', name: 'Open-Meteo 地理编码', category: '天气',
    desc: '输入城市名拿经纬度，可把关键词接到上面的天气接口。',
    kind: 'json', auth: 'No', cors: 'Yes', hint: '关键词',
    build: ({ q }) => `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q || 'Shenzhen')}&count=5&language=zh&format=json`,
  },
  {
    id: 'nasa-apod', name: 'NASA 每日天文图', category: '图片与动物',
    desc: 'Astronomy Picture of the Day，带标题与说明（DEMO_KEY 限流 30 次/小时）。',
    kind: 'photo', auth: 'DEMO_KEY', cors: 'Yes',
    build: () => 'https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY',
    extract: (d) => {
      const x = d as { title?: string; explanation?: string; url?: string; media_type?: string }
      return { imageUrl: x.media_type === 'image' ? x.url : undefined, title: x.title, text: x.explanation }
    },
  },
  {
    id: 'dog-ceo', name: 'Dog CEO', category: '图片与动物',
    desc: 'Stanford Dogs 数据集里的一张随机狗图。',
    kind: 'photo', auth: 'No', cors: 'Yes',
    build: () => 'https://dog.ceo/api/breeds/image/random',
    extract: (d) => ({ imageUrl: (d as { message?: string }).message, title: '今日一狗' }),
  },
  {
    id: 'thecatapi', name: 'TheCatAPI', category: '图片与动物',
    desc: '随机猫图，无 Key 也可用（有共享限流）。',
    kind: 'photo', auth: 'No', cors: 'Yes',
    build: () => 'https://api.thecatapi.com/v1/images/search',
    extract: (d) => {
      const arr = d as Array<{ url?: string }>
      return { imageUrl: arr?.[0]?.url, title: '今日一猫' }
    },
  },
  {
    id: 'cat-fact', name: 'Cat Facts', category: '趣味',
    desc: '一条随机猫知识。',
    kind: 'text', auth: 'No', cors: 'Yes',
    build: () => 'https://catfact.ninja/fact',
    extract: (d) => ({ text: (d as { fact?: string }).fact, title: '猫知识' }),
  },
  {
    id: 'chuck', name: 'Chuck Norris Jokes', category: '趣味',
    desc: '一条随机冷笑话。',
    kind: 'text', auth: 'No', cors: 'Yes',
    build: () => 'https://api.chucknorris.io/jokes/random',
    extract: (d) => ({ text: (d as { value?: string }).value, title: '冷笑话' }),
  },
  {
    id: 'advice', name: 'Advice Slip', category: '趣味',
    desc: '一条随机建议。',
    kind: 'text', auth: 'No', cors: 'Yes',
    build: () => 'https://api.adviceslip.com/advice',
    extract: (d) => ({ text: (d as { slip?: { advice?: string } }).slip?.advice, title: '今日建议' }),
  },
  {
    id: 'frankfurter', name: 'Frankfurter', category: '数据',
    desc: '欧洲央行参考汇率，无需 Key。',
    kind: 'json', auth: 'No', cors: 'Yes',
    build: () => 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=CNY, EUR, JPY',
  },
  {
    id: 'agify', name: 'Agify', category: '数据',
    desc: '按名字估算年龄，可改关键词试不同名字。',
    kind: 'json', auth: 'No', cors: 'Yes', hint: '名字',
    build: ({ q }) => `https://api.agify.io/?name=${encodeURIComponent(q || 'alex')}`,
  },
  {
    id: 'openlibrary', name: 'Open Library', category: '数据',
    desc: '开放图书目录检索，可改关键词。',
    kind: 'json', auth: 'No', cors: 'Yes', hint: '书名',
    build: ({ q }) => `https://openlibrary.org/search.json?q=${encodeURIComponent(q || 'java')}&limit=5`,
  },
  {
    id: 'ipify', name: 'ipify', category: '数据',
    desc: '返回当前公网 IP。',
    kind: 'json', auth: 'No', cors: 'Yes',
    build: () => 'https://api.ipify.org?format=json',
  },
]

export interface ApiResult {
  /** 结果属于哪个接口：切换瞬间避免「新组件配旧结果」的竞态渲染 */
  apiId: string
  ok: boolean
  status: number
  ms: number
  bytes: number
  url: string
  data?: unknown
  imageUrl?: string
  title?: string
  text?: string
  error?: string
}

/** 统一请求：记录状态码、耗时、响应大小，并按接口类型抽出展示字段。 */
export async function runApi(api: ApiDef, ctx: ApiCtx): Promise<ApiResult> {
  const url = api.build(ctx)
  const t0 = performance.now()
  try {
    const res = await fetch(url, { headers: { Accept: '*/*' } })
    const ms = Math.round(performance.now() - t0)
    if (api.kind === 'picture') {
      const buf = await res.arrayBuffer()
      return {
        apiId: api.id, ok: res.ok, status: res.status, ms, bytes: buf.byteLength, url,
        imageUrl: res.ok ? url : undefined,
        title: `${ctx.city.name} · 终端天气图`,
        error: res.ok ? undefined : `接口返回 ${res.status}`,
      }
    }
    const data = await res.json()
    const extra = api.extract?.(data) || {}
    return {
      apiId: api.id, ok: res.ok, status: res.status, ms,
      bytes: JSON.stringify(data).length, url, data, ...extra,
      error: res.ok ? undefined : `接口返回 ${res.status}`,
    }
  } catch (e) {
    return {
      apiId: api.id, ok: false, status: 0, ms: Math.round(performance.now() - t0), bytes: 0, url,
      error: (e as Error).name === 'TypeError' ? '接口没连上，可能被网络或 CORS 拦了。' : (e as Error).message,
    }
  }
}

/* ------------------------------------------------------------ 天气 WMO 码 */

export type Glyph = 'sun' | 'partly' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm'
export function weatherOf(code: number): { label: string; glyph: Glyph } {
  if (code === 0) return { label: '晴', glyph: 'sun' }
  if (code <= 2) return { label: '少云', glyph: 'partly' }
  if (code === 3) return { label: '阴', glyph: 'cloud' }
  if (code === 45 || code === 48) return { label: '雾', glyph: 'fog' }
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { label: '雨', glyph: 'rain' }
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return { label: '雪', glyph: 'snow' }
  if (code >= 95) return { label: '雷雨', glyph: 'storm' }
  return { label: '多云', glyph: 'cloud' }
}

export function aqiLabel(aqi: number): { label: string; tone: string } {
  if (aqi <= 50) return { label: '优', tone: 'good' }
  if (aqi <= 100) return { label: '良', tone: 'mid' }
  if (aqi <= 150) return { label: '轻度污染', tone: 'warn' }
  return { label: '污染', tone: 'bad' }
}

/** 从任意 JSON 里挑出适合列表展示的标量字段。 */
export function flatFields(data: unknown, limit = 12): Array<[string, string]> {
  const out: Array<[string, string]> = []
  const walk = (v: unknown, prefix: string, depth: number) => {
    if (out.length >= limit || depth > 2) return
    if (v === null || v === undefined) return
    if (Array.isArray(v)) {
      if (v.length === 0) return
      walk(v[0], `${prefix}[0]`, depth + 1)
      return
    }
    if (typeof v === 'object') {
      Object.entries(v as Record<string, unknown>).forEach(([k, val]) => walk(val, prefix ? `${prefix}.${k}` : k, depth + 1))
      return
    }
    out.push([prefix, String(v)])
  }
  walk(data, '', 0)
  return out
}
