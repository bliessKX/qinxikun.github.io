import { Suspense, lazy } from 'react'
import type { ComponentType, LazyExoticComponent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useRise } from '../App'

/* /games 游戏大厅：每款游戏独立懒加载 chunk，
 * Phaser / Matter / Three 三大引擎只在玩对应游戏时才下发。 */

export interface GameMeta {
  id: string
  name: string
  desc: string
  stack: string
  cat: '逻辑' | '街机' | '物理' | '3D' | '体感'
  glyph: string
}

export const GAMES: GameMeta[] = [
  { id: 'stardew', name: '星露谷 · 农场', desc: '纯前端农场模拟：网格 Tilemap 上翻地、播种、浇水、收获，四季轮回、背包金币，进度存本地。', stack: '原生 JS + CSS', cat: '模拟', glyph: '🌾' },
  { id: 'happy', name: '开心消消乐', desc: '动物图片版三消：交换相邻动物凑成三个相同即消除，连锁下落翻倍计分，卡死自动重排。', stack: '原生 JS + CSS', cat: '逻辑', glyph: '🐾' },
  { id: 'shooter', name: '星河突击', desc: '太空射击：驾驶战机迎击俯冲的敌机编队，击落得分，被击中扣命，撑过一波又一波。', stack: 'Phaser 3', cat: '街机', glyph: '▲' },
  { id: 'slingshot', name: '弹弓堡垒', desc: '愤怒的小鸟式物理弹射：拉开弹弓轰塌木架，把据守的目标全部击落，三关难度递进。', stack: 'Matter.js', cat: '物理', glyph: '➤' },
  { id: 'runner3d', name: '数据流跑酷', desc: '3D 无尽跑酷：在三条数据轨道间左右切换，躲避迎面而来的防火墙方块，越跑越快。', stack: 'Three.js', cat: '3D', glyph: '◱' },
  { id: 'balloon', name: '体感打气球', desc: '打开摄像头，用头部的移动控制飞针去顶飘起来的气球；没有摄像头时自动退化为鼠标模式。', stack: 'MediaPipe + Canvas', cat: '体感', glyph: '◎' },
]

const GAME_COMPONENTS: Record<string, LazyExoticComponent<ComponentType>> = {
  stardew: lazy(() => import('../games/stardew')),
  happy: lazy(() => import('../games/happy')),
  shooter: lazy(() => import('../games/shooter')),
  slingshot: lazy(() => import('../games/slingshot')),
  runner3d: lazy(() => import('../games/runner3d')),
  balloon: lazy(() => import('../games/balloon')),
}

function GameShell() {
  const { id } = useParams()
  const meta = GAMES.find((g) => g.id === id)
  const Comp = GAME_COMPONENTS[id || '']
  if (!meta || !Comp) {
    return (
      <div className="page">
        <div className="page-head">
          <h1><span className="slash">/</span>games</h1>
          <p className="mono">未找到这个游戏 · <Link to="/games">返回大厅</Link></p>
        </div>
      </div>
    )
  }
  return (
    <div className="page game-page">
      <div className="game-top">
        <Link to="/games" className="game-back">← 大厅</Link>
        <h1><span className="game-glyph">{meta.glyph}</span>{meta.name}</h1>
        <span className="tag">{meta.stack}</span>
        <p className="game-sub">{meta.desc}</p>
      </div>
      <Comp />
    </div>
  )
}

export default function Games() {
  useRise()
  const { id } = useParams()
  if (id) return <GameShell />

  return (
    <div className="page">
      <div className="page-head">
        <h1><span className="slash">/</span>games</h1>
        <p>游戏大厅 —— 农场模拟、动物三消、2D 物理弹射、3D 跑酷、摄像头体感，全部浏览器本地运行，断网也能玩。</p>
      </div>
      <div className="gm-grid">
        {GAMES.map((g) => (
          <Link key={g.id} to={`/games/${g.id}`} className="card gm-card rise">
            <div className="gm-glyph" aria-hidden>{g.glyph}</div>
            <div className="gm-body">
              <div className="gm-name">{g.name}</div>
              <div className="gm-desc">{g.desc}</div>
              <div className="gm-meta">
                <span className="tag">{g.cat}</span>
                <span className="tag">{g.stack}</span>
              </div>
            </div>
            <div className="gm-play">PLAY ▸</div>
          </Link>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 20, fontFamily: 'var(--mono)', fontSize: 11.5 }}>
        {GAMES.length} 款游戏 · 每款独立分包，点开才下载对应引擎
      </p>
    </div>
  )
}
