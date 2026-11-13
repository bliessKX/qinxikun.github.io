import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useRise } from '../App'
import {
  FLIGHT_STATUS, FlightError, STATUS_LABEL,
  dateOf, delayOf, fetchFlights, getKey, groupFlights, hhmm, loadSample,
  resetKey, setKey, statusTone, summarize,
  type FlightEndpoint, type FlightGroup, type FlightLive,
  type FlightQuery, type FlightRecord, type FlightResult,
} from '../lib/flights'

const fmt = new Intl.NumberFormat('zh-CN')
const upper = (v: string) => v.trim().toUpperCase()

interface FormState {
  flight_status: string; dep_iata: string; arr_iata: string
  airline_iata: string; flight_iata: string; min_delay_dep: string; limit: number
}
const INITIAL: FormState = {
  flight_status: 'active', dep_iata: '', arr_iata: '',
  airline_iata: '', flight_iata: '', min_delay_dep: '', limit: 50,
}

/* ------------------------------------------------------------- 详情区块 */

function EndpointBlock({ title, e }: { title: string; e?: FlightEndpoint }) {
  const rows: Array<[string, string]> = [
    ['机场', e?.airport || '—'],
    ['IATA / ICAO', `${e?.iata || '—'} / ${e?.icao || '—'}`],
    ['时区', e?.timezone || '—'],
    ['航站楼 / 登机口', `${e?.terminal || '—'} / ${e?.gate || '—'}`],
    ['计划', hhmm(e?.scheduled)],
    ['预计', hhmm(e?.estimated)],
    ['实际', hhmm(e?.actual)],
    ['预计 / 实际上跑道', `${hhmm(e?.estimated_runway)} / ${hhmm(e?.actual_runway)}`],
    ['延误', e?.delay != null ? `${e.delay} 分` : '—'],
  ]
  return (
    <div className="flt-endpoint">
      <div className="flt-endpoint-title">{title}</div>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
    </div>
  )
}

function LiveBlock({ live }: { live: FlightLive }) {
  const alt = Math.round(live.altitude ?? 0)
  const speed = Math.round(live.speed_horizontal ?? 0)
  const pct = Math.min(100, Math.max(3, alt / 12000 * 100))
  return (
    <div className="flt-livebox">
      <div className="flt-live-head">
        <span className="flt-live-pulse" aria-hidden="true" />
        实时遥测 · {live.updated ? live.updated.slice(11, 19) + ' UTC' : '时间未知'}
      </div>
      <div className="flt-live-stats">
        <span>高度 <b>{fmt.format(alt)} m</b></span>
        <span>地速 <b>{fmt.format(speed)} km/h</b></span>
        <span>航向 <b>{Math.round(live.direction ?? 0)}°</b></span>
        <span>垂直速度 <b>{Math.round(live.speed_vertical ?? 0)} m/s</b></span>
        <span>位置 <b>{live.latitude?.toFixed(3) ?? '—'}, {live.longitude?.toFixed(3) ?? '—'}</b></span>
      </div>
      <div className="flt-altbar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
    </div>
  )
}

function Detail({ group }: { group: FlightGroup }) {
  const r = group.primary
  return (
    <div className="flt-detail">
      <div className="flt-detail-grid">
        <EndpointBlock title="出发" e={r.departure} />
        <EndpointBlock title="到达" e={r.arrival} />
      </div>
      {r.live && !r.live.is_ground && <LiveBlock live={r.live} />}
      <div className="flt-detail-meta">
        <span>承运人 <b>{r.airline?.name || '—'}</b></span>
        <span>机型 <b>{r.aircraft?.iata || r.aircraft?.icao || '—'}</b></span>
        <span>注册号 <b>{r.aircraft?.registration || '—'}</b></span>
        <span>ICAO24 <b>{r.aircraft?.icao24 || '—'}</b></span>
      </div>
      {group.members.length > 1 && (
        <div className="flt-codeshare">
          <div className="flt-codeshare-head">代码共享 · {group.members.length} 家航司 · 主航班 {group.mainNumber}</div>
          <div className="flt-codeshare-list">
            {group.members.map((m, i) => (
              <span key={i}>{m.airline?.name || '—'} <b>{m.flight?.iata || '—'}</b></span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------- 行 */

function statusText(row: FlightRecord) {
  return STATUS_LABEL[row.flight_status || ''] || row.flight_status || '—'
}

/* ----------------------------------------------------------------- 页面 */

export default function Flights() {
  useRise()
  const [form, setForm] = useState<FormState>(INITIAL)
  const [result, setResult] = useState<FlightResult | null>(null)
  const [source, setSource] = useState<'live' | 'sample'>('live')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<FlightError | null>(null)
  const [needle, setNeedle] = useState('')
  const [onlyAirborne, setOnlyAirborne] = useState(false)
  const [showCodeshares, setShowCodeshares] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [jsonOpen, setJsonOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [keyOpen, setKeyOpen] = useState(false)
  const [fieldsOpen, setFieldsOpen] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')
  const booted = useRef(false)

  useEffect(() => { document.title = 'Flights — NICE.BLOG 2.0' }, [])

  async function run(force: boolean, override?: FormState) {
    const f = override || form
    setLoading(true)
    setError(null)
    try {
      const q: FlightQuery = {
        access_key: getKey(), limit: f.limit, offset: 0,
        flight_status: f.flight_status,
        dep_iata: upper(f.dep_iata), arr_iata: upper(f.arr_iata),
        airline_iata: upper(f.airline_iata), flight_iata: upper(f.flight_iata),
        min_delay_dep: f.min_delay_dep,
      }
      const r = await fetchFlights(q, { force })
      setResult(r)
      setSource('live')
      setExpanded(null)
    } catch (e) {
      setError(e instanceof FlightError ? e : new FlightError('出了点问题。', '载入样本数据，或稍后重试。'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (booted.current) return
    booted.current = true
    run(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const useSample = () => {
    setResult(loadSample()); setSource('sample'); setError(null); setExpanded(null)
  }
  const quick = (patch: Partial<FormState>) => {
    const next = { ...form, ...patch }
    setForm(next)
    run(false, next)
  }
  const clearFilters = () => {
    setForm(INITIAL); setNeedle(''); setOnlyAirborne(false); setShowCodeshares(false);
    run(false, INITIAL)
  }
  const patch = (k: keyof FormState, v: string) => setForm((s) => ({ ...s, [k]: v }))

  const data = result?.response.data || []
  const groups = useMemo(() => groupFlights(data), [data])
  const display = useMemo(() => (
    showCodeshares
      ? groups.flatMap((g) => g.members.map((row, i) => ({ row, group: g, id: `${g.key}#${i}` })))
      : groups.map((g) => ({ row: g.primary, group: g, id: g.key }))
  ), [groups, showCodeshares])
  const needleUp = needle.trim().toUpperCase()
  const rows = useMemo(() => display.filter(({ row }) => {
    if (onlyAirborne && !(row.live && !row.live.is_ground)) return false
    if (!needleUp) return true
    return [row.flight?.iata, row.flight?.icao, row.departure?.iata, row.arrival?.iata,
      row.airline?.name, row.airline?.iata]
      .some((v) => v && v.toUpperCase().includes(needleUp))
  }), [display, needleUp, onlyAirborne])
  const sum = useMemo(() => summarize(rows.map((r) => r.row)), [rows])

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(result?.response ?? {}, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { setCopied(false) }
  }

  return (
    <div className="page flt">
      <div className="page-head">
        <h1><span className="slash">/</span>flights</h1>
        <p>此刻在飞的航班。按航显屏的方式读：航班号、航线、时刻、状态。数据来自 AviationStack，每次实时查询消耗一次月度额度。</p>
      </div>

      {keyOpen && (
        <div className="flt-keypanel">
          <label className="flt-keyfield">
            <span>自定义 access_key</span>
            <input type="password" value={keyDraft} spellCheck={false} placeholder="留空使用内置 Key"
              onChange={(e) => setKeyDraft(e.target.value)} aria-label="自定义 access_key" />
          </label>
          <button type="button" className="btn" onClick={() => {
            if (keyDraft.trim()) setKey(keyDraft); else resetKey()
            setKeyDraft(''); setKeyOpen(false); run(true)
          }}>保存并查询</button>
          <button type="button" className="btn ghost" onClick={() => {
            resetKey(); setKeyDraft(''); setKeyOpen(false); run(true)
          }}>清除自定义</button>
          <p>留空即用内置 Key；填入只存本机 localStorage，可随时清除。</p>
        </div>
      )}

      <form className="flt-controls" onSubmit={(e) => { e.preventDefault(); run(true) }}>
        <button type="button" className="flt-fields-toggle" aria-expanded={fieldsOpen}
          onClick={() => setFieldsOpen((v) => !v)}>
          筛选字段 <span aria-hidden="true">{fieldsOpen ? '−' : '+'}</span>
        </button>
        <div className={`flt-fields ${fieldsOpen ? 'open' : ''}`}>
          <label>状态
            <select value={form.flight_status} onChange={(e) => patch('flight_status', e.target.value)}>
              <option value="">全部</option>
              {FLIGHT_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <label>出发 IATA
            <input value={form.dep_iata} onChange={(e) => patch('dep_iata', e.target.value)} placeholder="例 SZX" maxLength={4} />
          </label>
          <label>到达 IATA
            <input value={form.arr_iata} onChange={(e) => patch('arr_iata', e.target.value)} placeholder="例 HGH" maxLength={4} />
          </label>
          <label>航司 IATA
            <input value={form.airline_iata} onChange={(e) => patch('airline_iata', e.target.value)} placeholder="例 ZH" maxLength={3} />
          </label>
          <label>航班号
            <input value={form.flight_iata} onChange={(e) => patch('flight_iata', e.target.value)} placeholder="例 ZH9502" maxLength={10} />
          </label>
          <label>最小延误
            <select value={form.min_delay_dep} onChange={(e) => patch('min_delay_dep', e.target.value)}>
              <option value="">不限</option><option value="15">15 分+</option>
              <option value="30">30 分+</option><option value="60">60 分+</option>
            </select>
          </label>
          <label>条数
            <select value={form.limit} onChange={(e) => setForm((s) => ({ ...s, limit: Number(e.target.value) }))}>
              <option value={20}>20</option><option value={50}>50</option><option value={100}>100</option>
            </select>
          </label>
        </div>

        <div className="flt-actions">
          <label className="flt-search">
            <span className="flt-sr">本地过滤</span>
            <input value={needle} onChange={(e) => setNeedle(e.target.value)}
              placeholder="本地过滤航班号 / 机场 / 航司…" aria-label="本地过滤" />
          </label>
          <button className="btn" type="submit" disabled={loading}>{loading ? '查询中…' : '查询实时'}</button>
          <button className="btn ghost" type="button" onClick={useSample}>载入样本</button>
          <button className="btn ghost" type="button" onClick={() => setJsonOpen((v) => !v)}>
            {jsonOpen ? '收起 JSON' : '原始 JSON'}
          </button>
          <button className="btn ghost" type="button" onClick={() => setKeyOpen((v) => !v)}>
            {keyOpen ? '收起 Key' : '设置 Key'}
          </button>
        </div>

        <div className="flt-quick">
          <span className="flt-quick-label">快捷筛选</span>
          <button type="button" className={form.dep_iata === 'SZX' ? 'on' : ''}
            onClick={() => quick({ dep_iata: 'SZX', arr_iata: '' })}>深圳出发</button>
          <button type="button" className={form.arr_iata === 'SZX' ? 'on' : ''}
            onClick={() => quick({ dep_iata: '', arr_iata: 'SZX' })}>飞抵深圳</button>
          <button type="button" className={onlyAirborne ? 'on' : ''}
            onClick={() => setOnlyAirborne((v) => !v)}>只看在空中</button>
          <button type="button" onClick={clearFilters}>清除筛选</button>
          <label className="flt-switch">
            <input type="checkbox" checked={showCodeshares} onChange={(e) => setShowCodeshares(e.target.checked)} />
            展开代码共享
          </label>
          <span className="flt-quick-note">同一物理航班常被多家航司重复返回，默认折叠</span>
        </div>
      </form>

      <div className="flt-statusbar" aria-live="polite">
        <span className={`flt-signal ${loading ? 'busy' : error ? 'err' : ''}`} aria-hidden="true" />
        <b>{loading ? '正在取数据…' : error ? '查询没成功' : `已更新 · ${fmt.format(sum.total)} 条`}</b>
        {!loading && !error && result?.cached && <span>命中缓存</span>}
        <span className="flt-sep">/</span>
        <span>{source === 'sample' ? '离线样本' : '实时接口'}</span>
        <span className="flt-sep">/</span>
        <span>本月剩余 <b>{result?.remaining ?? '—'}</b> 次</span>
        <span className="flt-sep">/</span>
        <span>{new Date(result?.at || Date.now()).toLocaleTimeString('zh-CN', { hour12: false })}</span>
      </div>

      {error && (
        <div className="flt-error" role="alert">
          <div><b>{error.message}</b><p>{error.hint}</p></div>
          <div className="flt-error-actions">
            <button type="button" className="btn ghost" onClick={useSample}>载入样本</button>
            <button type="button" className="btn ghost" onClick={() => setKeyOpen(true)}>改 Key</button>
          </div>
        </div>
      )}

      <div className="flt-summary">
        <div><span>本次航班</span><b>{fmt.format(sum.total)}</b><em>条</em></div>
        <div><span>在空中</span><b>{fmt.format(sum.airborne)}</b><em>架有实时遥测</em></div>
        <div><span>平均延误</span><b>{sum.avgDelay}</b><em>分钟 · {sum.delayed} 班延误</em></div>
        <div><span>最繁忙出发</span><b>{sum.topDep}</b><em>{sum.topDepCount} 班</em></div>
      </div>

      {!loading && !error && rows.length === 0 ? (
        <div className="flt-empty">
          <b>这个条件下没有航班。</b>
          <p>放宽筛选，或点「查询实时」换一批数据。</p>
          <button type="button" className="btn ghost" onClick={clearFilters}>清除筛选</button>
          <button type="button" className="btn ghost" onClick={useSample}>载入样本</button>
        </div>
      ) : (
        <div className="flt-board-wrap">
          <table className="flt-board">
            <thead>
              <tr>
                <th scope="col">航班 / 承运人</th>
                <th scope="col">航线</th>
                <th scope="col">计划 → 到达</th>
                <th scope="col">航站楼 · 登机口</th>
                <th scope="col">状态</th>
                <th scope="col"><span className="flt-sr">展开详情</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ row, group, id }) => {
                const delay = delayOf(row)
                const tone = statusTone(row.flight_status, delay)
                const airborne = Boolean(row.live && !row.live.is_ground)
                const isOpen = expanded === id
                return (
                  <Fragment key={id}>
                    <tr className={`flt-row ${isOpen ? 'open' : ''} ${airborne ? 'airborne' : ''}`}>
                      <td data-label="航班">
                        <div className="flt-no">{row.flight?.iata || group.mainNumber}</div>
                        <div className="flt-sub">{row.airline?.name || '—'}</div>
                        {!showCodeshares && group.members.length > 1 && (
                          <div className="flt-share">主航班 {group.mainNumber} · +{group.members.length - 1} 家共享</div>
                        )}
                      </td>
                      <td data-label="航线">
                        <div className="flt-route">
                          <b>{row.departure?.iata || '—'}</b>
                          <span className="flt-route-line" aria-hidden="true" />
                          <b>{row.arrival?.iata || '—'}</b>
                        </div>
                        <div className="flt-sub flt-airports">{row.departure?.airport || '—'} → {row.arrival?.airport || '—'}</div>
                      </td>
                      <td data-label="时刻">
                        <div className="flt-times"><b>{hhmm(row.departure?.scheduled)}</b><span>→</span><b>{hhmm(row.arrival?.scheduled)}</b></div>
                        <div className="flt-sub">{dateOf(row.departure?.scheduled)} · 跑道 {hhmm(row.departure?.estimated_runway)}</div>
                      </td>
                      <td data-label="航站楼">
                        <div className="flt-gate">{[row.departure?.terminal, row.departure?.gate].filter(Boolean).join(' · ') || '—'}</div>
                        <div className="flt-sub">到达 {row.arrival?.terminal || '—'}</div>
                      </td>
                      <td data-label="状态">
                        <span className={`flt-pill ${tone}`}>
                          <i aria-hidden="true" />{statusText(row)}
                          {delay > 0 && <em className={`flt-delay ${delay >= 15 ? 'hi' : ''}`}>延误 {delay} 分</em>}
                        </span>
                        {airborne && (
                          <div className="flt-live-mini">
                            ↑ {fmt.format(Math.round(row.live?.altitude ?? 0))} m · {fmt.format(Math.round(row.live?.speed_horizontal ?? 0))} km/h
                          </div>
                        )}
                      </td>
                      <td>
                        <button type="button" className="flt-expand" aria-expanded={isOpen}
                          aria-label={isOpen ? '收起详情' : `展开 ${row.flight?.iata || '航班'} 详情`}
                          onClick={() => setExpanded(isOpen ? null : id)}>{isOpen ? '−' : '+'}</button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="flt-detail-row"><td colSpan={6}><Detail group={group} /></td></tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {jsonOpen && (
        <section className="flt-json-wrap" aria-label="原始响应 JSON">
          <div className="flt-json-head">
            <span>原始响应 · {source === 'sample' ? '样本' : '接口'}</span>
            <button type="button" onClick={copyJson}>{copied ? '已复制' : '复制 JSON'}</button>
          </div>
          <pre className="flt-json">{JSON.stringify(result?.response ?? {}, null, 2)}</pre>
        </section>
      )}

      <section className="section flt-about">
        <h3>接口说明</h3>
        <p>免费档可用参数：<code>flight_status</code> <code>dep_iata</code> <code>arr_iata</code> <code>airline_iata</code> <code>airline_name</code> <code>flight_iata</code> <code>flight_number</code> <code>min_delay_dep</code> <code>max_delay_dep</code> <code>min_delay_arr</code> <code>max_delay_arr</code> <code>limit</code> <code>offset</code>。<code>flight_date</code> 需要 Starter 套餐，本页不提供。</p>
        <p>时刻按接口原样的机场本地时间显示，未做时区换算。实时结果在会话内缓存 5 分钟；「载入样本」完全离线，不消耗额度。</p>
        <p>数据源：<code>app/src/lib/flights.ts</code> · 样本：<code>app/src/data/flights.sample.json</code></p>
      </section>
    </div>
  )
}
