import { useEffect, useRef, useState } from 'react'
import { useRise } from '../App'
import {
  APIS, CATEGORIES, CITIES, aqiLabel, flatFields, runApi, weatherOf,
  type ApiDef, type ApiResult, type Glyph,
} from '../lib/publicApis'

/* ------------------------------------------------------- WMO 天气线条图标 */

function WeatherGlyph({ glyph, size = 72 }: { glyph: Glyph; size?: number }) {
  const sun = (
    <g stroke="var(--amber)" strokeWidth="2.2" strokeLinecap="round" fill="none">
      <circle cx="26" cy="24" r="8" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
        const rad = (a - 90) * Math.PI / 180
        return <line key={a} x1={26 + 12 * Math.cos(rad)} y1={24 + 12 * Math.sin(rad)}
          x2={26 + 16 * Math.cos(rad)} y2={24 + 16 * Math.sin(rad)} />
      })}
    </g>
  )
  const cloud = (
    <path d="M14 44 h30 a8 8 0 0 0 1-16 a12 12 0 0 0-22-3 a9 9 0 0 0-9 19 z"
      fill="none" stroke="var(--cyan)" strokeWidth="2.2" strokeLinejoin="round" />
  )
  const smallCloud = (
    <path d="M12 46 h28 a7 7 0 0 0 1-14 a10 10 0 0 0-19-2 a8 8 0 0 0-10 16 z"
      fill="none" stroke="var(--cyan)" strokeWidth="2.2" strokeLinejoin="round" />
  )
  return (
    <svg className="api-glyph" viewBox="0 0 64 64" width={size} height={size}
      role="img" aria-label={`${glyph} 天气图标`}>
      {glyph === 'sun' && <g>{sun}</g>}
      {glyph === 'partly' && <g><g transform="translate(-4 -6) scale(.82)">{sun}</g>{smallCloud}</g>}
      {glyph === 'cloud' && <g>{cloud}</g>}
      {glyph === 'fog' && (
        <g stroke="var(--muted)" strokeWidth="2.2" strokeLinecap="round">
          <line x1="12" y1="24" x2="52" y2="24" /><line x1="16" y1="34" x2="48" y2="34" />
          <line x1="12" y1="44" x2="52" y2="44" />
        </g>
      )}
      {glyph === 'rain' && (
        <g>{cloud}
          <g stroke="var(--cyan)" strokeWidth="2.2" strokeLinecap="round">
            <line x1="22" y1="50" x2="18" y2="58" /><line x1="32" y1="50" x2="28" y2="58" />
            <line x1="42" y1="50" x2="38" y2="58" />
          </g>
        </g>
      )}
      {glyph === 'snow' && (
        <g>{cloud}
          <g stroke="var(--cyan)" strokeWidth="2" strokeLinecap="round">
            <line x1="22" y1="53" x2="22" y2="59" /><line x1="19" y1="56" x2="25" y2="56" />
            <line x1="40" y1="53" x2="40" y2="59" /><line x1="37" y1="56" x2="43" y2="56" />
          </g>
        </g>
      )}
      {glyph === 'storm' && (
        <g>{cloud}
          <path d="M32 48 l-6 8 h6 l-3 8 10-11 h-6 l4-5 z" fill="var(--amber)" stroke="none" />
        </g>
      )}
    </svg>
  )
}

/* ------------------------------------------------------------- 可视化视图 */

interface Daily {
  time?: string[]
  weather_code?: number[]
  temperature_2m_max?: number[]
  temperature_2m_min?: number[]
}
function ForecastStrip({ daily }: { daily: Daily }) {
  const days = daily.time || []
  const max = daily.temperature_2m_max || []
  const min = daily.temperature_2m_min || []
  const codes = daily.weather_code || []
  if (!days.length) return null
  const hi = Math.max(...max), lo = Math.min(...min)
  const span = Math.max(1, hi - lo)
  return (
    <div className="api-forecast">
      {days.map((d, i) => {
        const top = ((max[i] ?? hi) - lo) / span
        const bottom = ((min[i] ?? lo) - lo) / span
        const label = new Date(d + 'T00:00:00').toLocaleDateString('zh-CN', { weekday: 'short' })
        const w = weatherOf(codes[i] ?? 0)
        return (
          <div className="api-fc-col" key={d}>
            <span className="api-fc-day">{label}</span>
            <WeatherGlyph glyph={w.glyph} size={26} />
            <div className="api-fc-bar">
              <i style={{ bottom: `${bottom * 100}%`, height: `${Math.max(9, (top - bottom) * 100)}%` }} />
            </div>
            <b>{Math.round(max[i] ?? 0)}°</b>
            <span>{Math.round(min[i] ?? 0)}°</span>
          </div>
        )
      })}
    </div>
  )
}

function WeatherView({ data, city }: { data: unknown; city: string }) {
  const d = data as {
    current?: Record<string, number | string>
    daily?: Daily
  }
  const cur = d.current || {}
  const code = Number(cur.weather_code ?? 0)
  const w = weatherOf(code)
  return (
    <div className="api-weather">
      <div className="api-weather-main">
        <WeatherGlyph glyph={w.glyph} size={92} />
        <div>
          <div className="api-temp">{Number(cur.temperature_2m ?? 0).toFixed(1)}<em>°C</em></div>
          <div className="api-weather-label">{city} · {w.label} · {String(cur.time ?? '').slice(5, 16).replace('T', ' ')}</div>
        </div>
      </div>
      <div className="api-weather-meta">
        体感 {cur.apparent_temperature ?? '—'}° · 湿度 {cur.relative_humidity_2m ?? '—'}% · 风 {cur.wind_speed_10m ?? '—'} km/h
      </div>
      {d.daily && <ForecastStrip daily={d.daily} />}
    </div>
  )
}

function AirView({ data }: { data: unknown }) {
  const cur = (data as { current?: Record<string, number> })?.current || {}
  const aqi = Number(cur.us_aqi ?? 0)
  const { label, tone } = aqiLabel(aqi)
  return (
    <div className="api-air">
      <div className={`api-aqi ${tone}`}>{aqi}<span>US AQI</span></div>
      <div className="api-air-side">
        <b>{label}</b>
        <p>PM2.5 {cur.pm2_5 ?? '—'} µg/m³ · PM10 {cur.pm10 ?? '—'} µg/m³</p>
      </div>
    </div>
  )
}

function HkoView({ data }: { data: unknown }) {
  const d = (data ?? {}) as {
    temperature?: { data?: Array<{ place?: string; value?: number }> }
    humidity?: { data?: Array<{ place?: string; value?: number }> }
    warningMessage?: string
    updateTime?: string
  }
  const temps = d.temperature?.data || []
  const humid = d.humidity?.data || []
  return (
    <div className="api-hko">
      <div className="api-hko-head">中国香港天文台 · 分区实况 <span>{d.updateTime || ''}</span></div>
      <div className="api-hko-grid">
        {temps.slice(0, 8).map((t, i) => (
          <div key={t.place || i}>
            <span>{t.place || '—'}</span>
            <b>{t.value ?? '—'}°</b>
            <em>湿度 {humid.find((h) => h.place === t.place)?.value ?? '—'}%</em>
          </div>
        ))}
      </div>
      {d.warningMessage && <div className="api-hko-warn">{d.warningMessage}</div>}
    </div>
  )
}

function ImageView({ result }: { result: ApiResult }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [result.imageUrl])
  return (
    <div className="api-image">
      {result.imageUrl && !failed ? (
        <img src={result.imageUrl} alt={result.title || '接口返回的图片'} onError={() => setFailed(true)} />
      ) : (
        <div className="api-image-fallback">这张图加载不到，点「重新请求」换一张。</div>
      )}
      {result.title && <h3>{result.title}</h3>}
      {result.text && <p>{result.text.length > 280 ? result.text.slice(0, 280) + '…' : result.text}</p>}
    </div>
  )
}

function TextView({ result }: { result: ApiResult }) {
  return (
    <div className="api-text">
      <span>{result.title || '响应'}</span>
      <p>{result.text || '这条结果没有文本内容，展开原始响应看看。'}</p>
    </div>
  )
}

function JsonView({ result }: { result: ApiResult }) {
  const fields = flatFields(result.data)
  return (
    <div className="api-fields">
      {fields.length === 0 && <p className="muted">响应里没有可直接展示的字段，展开原始 JSON 看看。</p>}
      {fields.map(([k, v]) => (
        <div key={k}><span className="mono">{k}</span><b>{v.length > 90 ? v.slice(0, 90) + '…' : v}</b></div>
      ))}
    </div>
  )
}

function ApiVisual({ api, result, city }: { api: ApiDef; result: ApiResult; city: string }) {
  switch (api.kind) {
    case 'weather': return <WeatherView data={result.data} city={city} />
    case 'air': return <AirView data={result.data} />
    case 'hko': return <HkoView data={result.data} />
    case 'picture':
    case 'photo': return <ImageView result={result} />
    case 'text': return <TextView result={result} />
    default: return <JsonView result={result} />
  }
}

/* ----------------------------------------------------------------- 页面 */

export default function Apis() {
  useRise()
  const [selectedId, setSelectedId] = useState('open-meteo')
  const [cityIdx, setCityIdx] = useState(0)
  const [q, setQ] = useState('')
  const [tick, setTick] = useState(0)
  const [result, setResult] = useState<ApiResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [rawOpen, setRawOpen] = useState(false)
  const lastKey = useRef('')

  useEffect(() => { document.title = 'APIs — NICE.BLOG 2.0' }, [])

  const selected = APIS.find((a) => a.id === selectedId) || APIS[0]
  const city = CITIES[cityIdx]

  useEffect(() => {
    const key = `${selectedId}|${cityIdx}|${tick}`
    if (lastKey.current === key) return
    lastKey.current = key
    let alive = true
    setLoading(true)
    runApi(selected, { city, q }).then((r) => {
      if (!alive) return
      setResult(r); setLoading(false)
    })
    return () => { alive = false }
    // q 输入不自动触发，点「重新请求」时才用最新值
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, cityIdx, tick])

  // 只有「结果属于当前接口」时才渲染：切换瞬间不会拿上一个接口的 data 喂给新组件
  const shown = result && result.apiId === selected.id ? result : null
  const busy = loading || !shown
  const endpoint = shown?.url || selected.build({ city, q })
  const statusOk = shown?.ok && shown.status >= 200 && shown.status < 300

  return (
    <div className="page apis">
      <div className="page-head">
        <h1><span className="slash">/</span>apis</h1>
        <p>从 public-apis 清单里实测筛出的免 Key 接口。点一个就直接发请求：天气画成图标和温度条，图片直接显示，其余给字段和原始响应。</p>
        <div className="api-source">
          来源 <a href="https://github.com/public-apis/public-apis" target="_blank" rel="noopener noreferrer">public-apis/public-apis</a>
          <span> · 52 个分类 · 本页收录 {APIS.length} 个实测可直连</span>
        </div>
      </div>

      <div className="api-toolbar">
        <label>城市
          <select value={cityIdx} onChange={(e) => setCityIdx(Number(e.target.value))}>
            {CITIES.map((c, i) => <option key={c.name} value={i}>{c.name}</option>)}
          </select>
        </label>
        <label>关键词
          <input value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setTick((t) => t + 1) } }}
            placeholder="名字 / 书名 / 城市名" aria-label="接口关键词" />
        </label>
        <button className="btn" type="button" onClick={() => setTick((t) => t + 1)} disabled={loading}>
          {loading ? '请求中…' : '重新请求'}
        </button>
        <span className="api-toolbar-note">标了「关键词」的接口会用这个输入</span>
      </div>

      <div className="api-grid">
        <aside className="api-index" aria-label="接口索引">
          {CATEGORIES.map((cat) => (
            <section className="api-cat" key={cat}>
              <h3>{cat}</h3>
              <ul>
                {APIS.filter((a) => a.category === cat).map((a) => (
                  <li key={a.id}>
                    <button type="button" className={a.id === selectedId ? 'on' : ''}
                      aria-current={a.id === selectedId ? 'true' : undefined}
                      onClick={() => { setSelectedId(a.id); setRawOpen(false) }}>
                      <span>{a.name}</span>
                      <i className="api-dot" aria-hidden="true" />
                    </button>
                    <div className="api-desc">{a.desc}{a.hint && <em> · {a.hint}</em>}</div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </aside>

        <section className="api-console">
          <div className="api-endpoint">
            <span className="api-method">GET</span>
            <code>{endpoint}</code>
          </div>
          <div className="api-status">
            <span className={`api-code ${statusOk ? 'ok' : shown ? 'bad' : ''}`}>{shown?.status || '—'}</span>
            <span>{shown?.ms ?? '—'} ms</span>
            <span>{shown?.bytes ?? '—'} B</span>
            <span className="api-sep">/</span>
            <span>{selected.name}</span>
            <span className="api-sep">/</span>
            <span>Auth {selected.auth}</span>
            <span className="api-sep">/</span>
            <span>CORS {selected.cors}</span>
          </div>

          {busy && <div className="api-loading"><i />正在请求…</div>}
          {!busy && shown && !shown.ok && (
            <div className="api-error" role="alert">
              <b>请求没成功。</b>
              <p>{shown.error || '接口没返回数据'} · 换一个接口，或点「重新请求」再试。</p>
            </div>
          )}
          {!busy && shown?.ok && <ApiVisual api={selected} result={shown} city={city.name} />}

          <div className="api-raw">
            <button type="button" onClick={() => setRawOpen((v) => !v)} aria-expanded={rawOpen}>
              {rawOpen ? '收起原始响应' : '展开原始响应'} <span>{rawOpen ? '−' : '+'}</span>
            </button>
            {rawOpen && <pre>{JSON.stringify(shown?.data ?? {}, null, 2)}</pre>}
          </div>
        </section>
      </div>

      <section className="section api-about">
        <h3>关于这份清单</h3>
        <p>public-apis 收录了 52 类、数千个接口，但「免认证」不等于浏览器能用：不少端点没有 CORS、已改域名或干脆 404（本轮 RainViewer、picsum、frankfurter 旧域名就是例子）。这里只放逐个实测过状态码与响应头的接口，全部无需申请 Key。</p>
        <p>天气图标按 Open-Meteo 的 WMO 天气码本地绘制，不依赖外部图床；wttr.in 那张是服务端渲染的终端风 PNG。带 DEMO_KEY 的 NASA 接口有共享限流，偶尔失败换一个接口即可。</p>
      </section>
    </div>
  )
}
