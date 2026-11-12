import { useEffect, useMemo, useState } from 'react'
import {
  Alert, Button, Card, ConfigProvider, Dropdown, Empty, Popconfirm, Progress,
  Segmented, Statistic, Table, Tag, Tooltip, theme,
} from 'antd'
import { App as AntApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import type { ColumnsType } from 'antd/es/table'
import { useRise } from '../App'
import {
  buildSnapshot, clearVisits, exportVisits, loadVisits, pathLabel,
  DEVICE_META, SOURCE_META,
  type AnalyticsSnapshot, type TrendPoint, type VisitEvent,
} from '../lib/analytics'

/** antd 暗色算法 + 站点 CRT 琥珀终端 token，只作用于本页。 */
const THEME = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#f0a832',
    colorInfo: '#4dd8e6',
    colorSuccess: '#7bc96f',
    colorError: '#e06c60',
    colorBgBase: '#0b0e14',
    colorBgContainer: '#121722',
    colorBgElevated: '#161d2b',
    colorBorder: '#232b3b',
    colorBorderSecondary: '#1a2130',
    colorText: '#e8e3d8',
    colorTextSecondary: '#8a93a6',
    colorTextTertiary: '#6b7488',
    borderRadius: 6,
    fontFamily: "-apple-system, 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', sans-serif",
    fontFamilyCode: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
  },
  components: {
    Table: { headerBg: '#121722', rowHoverBg: '#161d2b', borderColor: '#232b3b' },
  },
}

const fmt = new Intl.NumberFormat('zh-CN')
const ftime = (ts: number) => new Date(ts).toLocaleString('zh-CN', {
  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
})

/* ------------------------------------------------------------ 趋势双系列图 */
function TrendChart({ data }: { data: TrendPoint[] }) {
  const [hover, setHover] = useState(-1)
  const W = 900, H = 246, L = 46, R = 14, T = 14, B = 30
  const plotW = W - L - R, plotH = H - T - B
  // 轴上限取 4 的倍数且至少为 4，避免只有 1 条数据时刻度重复成「1 1 1 0」
  const maxPv = Math.max(4, Math.ceil(Math.max(0, ...data.map((d) => d.pv)) / 4) * 4)
  const maxUv = Math.max(4, Math.ceil(Math.max(0, ...data.map((d) => d.uv)) / 4) * 4)
  const step = plotW / Math.max(1, data.length)
  const bw = Math.max(2, Math.min(30, step * 0.58))
  const xOf = (i: number) => L + step * i + step / 2
  const yPv = (v: number) => T + plotH - (v / maxPv) * plotH
  const yUv = (v: number) => T + plotH - (v / maxUv) * plotH
  const line = data.map((d, i) => `${i ? 'L' : 'M'} ${xOf(i).toFixed(1)} ${yUv(d.uv).toFixed(1)}`).join(' ')
  const gridCount = 4

  return (
    <div className="stats-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="访问量趋势图：柱状为浏览量，折线为独立访客"
        style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id="statsBar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f0a832" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#b9822a" stopOpacity="0.35" />
          </linearGradient>
        </defs>
        {Array.from({ length: gridCount + 1 }, (_, i) => {
          const y = T + (plotH / gridCount) * i
          const v = Math.round(maxPv * (1 - i / gridCount))
          return (
            <g key={i}>
              <line x1={L} y1={y} x2={W - R} y2={y} stroke="#232b3b" strokeWidth="1" strokeDasharray="3 5" />
              <text x={L - 9} y={y + 4} textAnchor="end" fill="#6b7488" fontSize="10" fontFamily="monospace">{v}</text>
            </g>
          )
        })}
        {data.map((d, i) => (
          <g key={d.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)}>
            <rect x={L + step * i} y={T} width={step} height={plotH} fill="transparent" />
            <rect x={xOf(i) - bw / 2} y={yPv(d.pv)} width={bw} height={Math.max(1, T + plotH - yPv(d.pv))}
              rx="2" fill={hover === i ? '#ffc861' : 'url(#statsBar)'} />
          </g>
        ))}
        <path d={line} fill="none" stroke="#4dd8e6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
        {data.map((d, i) => (data.length <= 14 || i % 3 === 0) && (
          <text key={d.key} x={xOf(i)} y={H - 9} textAnchor="middle" fill="#6b7488" fontSize="10" fontFamily="monospace">{d.label}</text>
        ))}
      </svg>
      {hover >= 0 && (
        <div className="stats-tip" style={{ left: `${(xOf(hover) / W) * 100}%` }}>
          <b>{data[hover].key}</b>
          <span><i className="dot amber" /> 浏览量 {data[hover].pv}</span>
          <span><i className="dot cyan" /> 独立访客 {data[hover].uv}</span>
        </div>
      )}
      <div className="stats-legend">
        <span><i className="sw amber" /> 浏览量 PV</span>
        <span><i className="sw cyan" /> 独立访客 UV</span>
        <span className="muted">悬停柱子查看当日明细</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ 24 小时分布 */
function HourChart({ hours, peak }: { hours: number[]; peak: number }) {
  const max = Math.max(1, ...hours)
  return (
    <div className="stats-hours">
      <div className="bars">
        {hours.map((n, h) => (
          <Tooltip key={h} title={`${String(h).padStart(2, '0')}:00 – ${String(h).padStart(2, '0')}:59 · ${n} 次访问`}>
            <div className={`hbar ${h === peak ? 'peak' : ''}`} style={{ height: `${Math.max(3, (n / max) * 100)}%` }} />
          </Tooltip>
        ))}
      </div>
      <div className="hlabels">
        {hours.map((_, h) => <span key={h}>{h % 3 === 0 ? String(h).padStart(2, '0') : ''}</span>)}
      </div>
      <div className="stats-legend"><span className="muted">访问高峰：{String(peak).padStart(2, '0')}:00 前后</span></div>
    </div>
  )
}

/* ------------------------------------------------------------------ 页面 */
function StatsBody() {
  useRise()
  const { message } = AntApp.useApp()
  // 记住数据源偏好：跳到别的页面再回来不重置
  const [source, setSource] = useState<'demo' | 'live'>(() => {
    try { return localStorage.getItem('nice2.stats.source') === 'live' ? 'live' : 'demo' } catch { return 'demo' }
  })
  const [days, setDays] = useState<number>(14)
  const [tick, setTick] = useState(0)

  useEffect(() => { document.title = 'Stats — NICE.BLOG 2.0' }, [])

  const visits = useMemo(() => loadVisits(source), [source, tick])
  const s: AnalyticsSnapshot = useMemo(() => buildSnapshot(visits, days, source), [visits, days, source])

  const refresh = () => setTick((t) => t + 1)
  const doExport = (format: 'json' | 'csv') => {
    exportVisits(s.visits, format)
    message.success(`已导出 ${fmt.format(s.visits.length)} 条记录（${format.toUpperCase()}）`)
  }
  const doClear = () => {
    clearVisits(); refresh(); message.success('本设备访问记录已清空')
  }

  const columns: ColumnsType<VisitEvent> = [
    {
      title: '时间', dataIndex: 'ts', width: 156,
      render: (ts: number) => <span className="mono" style={{ fontSize: 12 }}>{ftime(ts)}</span>,
    },
    {
      title: '访问页面', dataIndex: 'path',
      render: (p: string) => (
        <span>{pathLabel(p)} <span className="mono muted" style={{ fontSize: 11 }}>{p}</span></span>
      ),
    },
    {
      title: '来源', dataIndex: 'ref', width: 108,
      render: (r: keyof typeof SOURCE_META) => (
        <Tag style={{ background: 'transparent', color: SOURCE_META[r]?.color, borderColor: (SOURCE_META[r]?.color || '#888') + '66', fontFamily: 'var(--mono)', fontSize: 11 }}>
          {SOURCE_META[r]?.label || r}
        </Tag>
      ),
    },
    {
      title: '设备', dataIndex: 'device', width: 88,
      render: (d: keyof typeof DEVICE_META) => <span className="muted" style={{ fontSize: 12 }}>{DEVICE_META[d]?.label || d}</span>,
    },
    {
      title: '停留', dataIndex: 'dwell', width: 74,
      render: (d: number) => <span className="mono" style={{ fontSize: 12 }}>{d > 0 ? `${d}s` : '—'}</span>,
    },
  ]

  return (
    <div className="page stats">
      <div className="page-head">
        <h1><span className="slash">/</span>stats</h1>
        <p>站点访问看板 —— 浏览量、独立访客、时段分布与页面热度。纯前端实现，数据不出浏览器。</p>
      </div>

      <Alert
        className="stats-alert"
        type={source === 'demo' ? 'warning' : 'info'}
        showIcon
        message={source === 'demo' ? '演示数据' : '本设备真实记录'}
        description={source === 'demo'
          ? '静态站没有中心化计数端，无法采集全站访客。当前图表为确定性生成的模拟数据（非真实访问量），用于展示看板形态。切到「本设备记录」可查看本机埋点。'
          : '以下数据来自本浏览器 localStorage 埋点，仅统计这台设备的访问行为，不代表站点整体流量。'}
      />

      <div className="stats-ctl">
        <Segmented
          value={source}
          onChange={(v) => {
            const next = v as 'demo' | 'live'
            setSource(next)
            try { localStorage.setItem('nice2.stats.source', next) } catch { /* 忽略 */ }
          }}
          options={[{ label: '演示数据', value: 'demo' }, { label: '本设备记录', value: 'live' }]}
        />
        <Segmented
          value={days}
          onChange={(v) => setDays(Number(v))}
          options={[{ label: '近 7 天', value: 7 }, { label: '近 14 天', value: 14 }, { label: '近 30 天', value: 30 }]}
        />
        <div className="ctl-right">
          <Button size="small" onClick={refresh}>刷新</Button>
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'json', label: '导出 JSON' },
                { key: 'csv', label: '导出 CSV' },
              ],
              onClick: ({ key }) => doExport(key as 'json' | 'csv'),
            }}
          >
            <Button size="small">导出 ▾</Button>
          </Dropdown>
          {source === 'live' && (
            <Popconfirm title="清空本设备的访问记录？" description="此操作不可撤销，演示数据不受影响。"
              onConfirm={doClear} okText="清空" cancelText="取消" okButtonProps={{ danger: true }}>
              <Button size="small" danger>清空</Button>
            </Popconfirm>
          )}
        </div>
      </div>

      {source === 'live' && s.total === 0 ? (
        <Card className="stats-card"><Empty description="这台设备还没有访问记录，先去逛几页再回来，或切到演示数据看看看板形态。" /></Card>
      ) : (
        <>
          <div className="stats-kpis">
            <Card className="stats-card rise" size="small">
              <Statistic title={`浏览量 PV · 近 ${days} 天`} value={s.total} formatter={(v) => fmt.format(Number(v))} />
              <div className="kpi-foot">日均 {fmt.format(s.avgDaily)} 次</div>
            </Card>
            <Card className="stats-card rise" size="small">
              <Statistic title="独立访客 UV" value={s.visitors} formatter={(v) => fmt.format(Number(v))} />
              <div className="kpi-foot">按会话去重</div>
            </Card>
            <Card className="stats-card rise" size="small">
              <Statistic title="今日访问" value={s.today}
                suffix={s.yesterday === 0
                  ? <span className="delta up">新增</span>
                  : <span className={`delta ${s.todayDelta >= 0 ? 'up' : 'down'}`}>{s.todayDelta >= 0 ? '↑' : '↓'} {Math.abs(s.todayDelta).toFixed(1)}%</span>} />
              <div className="kpi-foot">较昨日 {s.yesterday} 次</div>
            </Card>
            <Card className="stats-card rise" size="small">
              <Statistic title="平均停留" value={s.avgDuration || '—'} suffix={s.avgDuration ? 's' : ''} />
              <div className="kpi-foot">跳出率 {s.bounceRate.toFixed(1)}%</div>
            </Card>
          </div>

          <Card className="stats-card rise" size="small" title={`访问趋势 · 近 ${days} 天`} style={{ marginTop: 16 }}>
            <TrendChart data={s.trend} />
          </Card>

          <div className="stats-two" style={{ marginTop: 16 }}>
            <Card className="stats-card rise" size="small" title="24 小时访问分布">
              <HourChart hours={s.hours} peak={s.peakHour} />
            </Card>
            <Card className="stats-card rise" size="small" title="热门页面 TOP 8">
              <div className="stats-rank">
                {s.paths.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />}
                {s.paths.map((p, i) => (
                  <div className="rank-row" key={p.path}>
                    <div className="rank-head">
                      <span className="rank-n mono">{String(i + 1).padStart(2, '0')}</span>
                      <span className="rank-name" title={p.name}>{p.name}</span>
                      <span className="rank-val mono">{p.count} <em>{p.pct.toFixed(1)}%</em></span>
                    </div>
                    <Progress percent={p.pct} showInfo={false} size="small" strokeColor="#f0a832" trailColor="#232b3b" />
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="stats-two" style={{ marginTop: 16 }}>
            <Card className="stats-card rise" size="small" title="来源渠道">
              <div className="stats-rank">
                {s.sources.map((x) => (
                  <div className="rank-row" key={x.key}>
                    <div className="rank-head">
                      <span className="rank-name">{x.label}</span>
                      <span className="rank-val mono">{x.count} <em>{x.pct.toFixed(1)}%</em></span>
                    </div>
                    <Progress percent={x.pct} showInfo={false} size="small" strokeColor={x.color} trailColor="#232b3b" />
                  </div>
                ))}
              </div>
            </Card>
            <Card className="stats-card rise" size="small" title="设备分布">
              <div className="stats-rank">
                {s.devices.map((x) => (
                  <div className="rank-row" key={x.key}>
                    <div className="rank-head">
                      <span className="rank-name">{x.label}</span>
                      <span className="rank-val mono">{x.count} <em>{x.pct.toFixed(1)}%</em></span>
                    </div>
                    <Progress percent={x.pct} showInfo={false} size="small" strokeColor={x.color} trailColor="#232b3b" />
                  </div>
                ))}
              </div>
              <div className="stats-legend"><span className="muted">Visitor ID：{source === 'live' ? '本机稳定标识' : '演示会话'}</span></div>
            </Card>
          </div>

          <Card className="stats-card rise" size="small" title="最近访问明细" style={{ marginTop: 16 }}>
            <Table<VisitEvent>
              rowKey={(r) => `${r.ts}-${r.session}-${r.path}`}
              columns={columns}
              dataSource={s.recent}
              size="small"
              pagination={{ pageSize: 6, size: 'small', showSizeChanger: false }}
              scroll={{ x: 620 }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" /> }}
            />
          </Card>
        </>
      )}

      <Card className="stats-card stats-note" size="small" title="想要真实的全站访问量？" style={{ marginTop: 16 }}>
        <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
          纯静态站无法统计全站访客，这不是代码能绕过的限制：<code>localStorage</code> 按浏览器隔离，
          每个访客只写进自己的存储。要拿到真实数据，需要一个所有访客共用的接收端：
        </p>
        <ul className="stats-solutions">
          <li><b>第三方统计</b> —— 不蒜子 / 百度统计 / Cloudflare Web Analytics / GA，加一段外部脚本即可，最简单，但明细在对方后台。</li>
          <li><b>自建计数 API</b> —— Cloudflare Workers KV、Supabase 或云函数 + 数据库，数据自己掌握，能喂满上面所有图表。</li>
          <li><b>本页已预留接口</b> —— 数据源收敛在 <code>src/lib/analytics.ts</code> 的 <code>loadVisits()</code>，接后端时替换这一个函数，看板无需改动。</li>
        </ul>
      </Card>
    </div>
  )
}

export default function Stats() {
  return (
    <ConfigProvider theme={THEME} locale={zhCN}>
      <AntApp>
        <StatsBody />
      </AntApp>
    </ConfigProvider>
  )
}
