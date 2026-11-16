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
  cat: '逻辑' | '街机' | '物理' | '3D' | '体感' | '模拟'
  glyph: string
}

export const GAMES: GameMeta[] = [
  { id: 'stardew', name: '星露谷 · 农场', desc: '纯前端农场模拟：操控像素农夫在网格田里走动，翻地 / 播种 / 浇水 / 收获，每天除草推进任务，还能捉蝴蝶、水边捞虾、钓鱼、下矿，四季轮回进度存本地。', stack: '原生 JS + CSS', cat: '模拟', glyph: '🌾' },
  { id: 'fishing', name: '钓鱼模拟器', desc: '按住蓄力甩竿、越远水越深，鱼群剪影游动，晴雨天气影响咬钩，12 种鱼四档稀有度全进图鉴，雨燕鱼只在雨天出没。', stack: 'Phaser 3', cat: '模拟', glyph: '🎣' },
  { id: 'happy', name: '开心消消乐', desc: '动物图片版三消：滑动或点选交换相邻动物，凑成三个相同即消除，连锁下落翻倍计分，卡死自动重排。', stack: '原生 JS + CSS', cat: '逻辑', glyph: '🐾' },
  { id: 'snake', name: '贪吃蛇', desc: '经典贪吃蛇：方向键或滑动屏幕转向，吃苹果变长提速，撞墙咬尾即止。', stack: 'Canvas 2D', cat: '逻辑', glyph: '🐍' },
  { id: 'g2048', name: '2048', desc: '滑动合并数字，相同数字相遇翻倍，合成 2048 即胜利，还能继续冲分。', stack: 'Canvas 2D', cat: '逻辑', glyph: '🔢' },
  { id: 'mines', name: '扫雷', desc: '9×9 十颗雷：点按翻开、长按或右键插旗，首击必安全，计时挑战最快排雷。', stack: 'Canvas 2D', cat: '逻辑', glyph: '💣' },
  { id: 'platformer', name: '平台跳跃', desc: '横版闯关：奔跑跳跃收集金币、躲开尖刺、抵达旗帜，三关难度递进，手机有专属虚拟按键。', stack: 'Phaser 3', cat: '街机', glyph: '🧱' },
  { id: 'shooter', name: '星河突击', desc: '太空射击：手指按住哪里战机就飞向哪里，按住自动开火，迎击俯冲敌机编队。', stack: 'Phaser 3', cat: '街机', glyph: '▲' },
  { id: 'slingshot', name: '弹弓堡垒', desc: '愤怒的小鸟式物理弹射：拉开弹弓轰塌木架，把据守的目标全部击落，三关难度递进。', stack: 'Matter.js', cat: '物理', glyph: '➤' },
  { id: 'stack3d', name: '3D 物理叠塔', desc: '吊臂来回摆动，看准时机放下方块；落点偏移的部分被真实刚体切成碎块掉落，塔越叠越窄，考验手稳。', stack: 'Rapier + Three.js', cat: '物理', glyph: '🗼' },
  { id: 'runner3d', name: '数据流跑酷', desc: '3D 无尽跑酷：在三条数据轨道间左右切换，躲避迎面而来的防火墙方块，越跑越快。', stack: 'Three.js', cat: '3D', glyph: '◱' },
  { id: 'racer3d', name: '3D 赛车', desc: '高速路上车流滚滚：左右滑动换道躲避，速度渐增看你能跑多远，撞车即终点。', stack: 'Three.js', cat: '3D', glyph: '🏎️' },
  { id: 'balloon', name: '体感打气球', desc: '打开摄像头，用头部的移动控制飞针去顶飘起来的气球；没有摄像头时手指滑动同样能玩。', stack: 'MediaPipe + Canvas', cat: '体感', glyph: '◎' },
]

const GAME_COMPONENTS: Record<string, LazyExoticComponent<ComponentType>> = {
  stardew: lazy(() => import('../games/stardew')),
  fishing: lazy(() => import('../games/fishing')),
  happy: lazy(() => import('../games/happy')),
  snake: lazy(() => import('../games/snake')),
  g2048: lazy(() => import('../games/g2048')),
  mines: lazy(() => import('../games/mines')),
  platformer: lazy(() => import('../games/platformer')),
  shooter: lazy(() => import('../games/shooter')),
  slingshot: lazy(() => import('../games/slingshot')),
  stack3d: lazy(() => import('../games/stack3d')),
  runner3d: lazy(() => import('../games/runner3d')),
  racer3d: lazy(() => import('../games/racer3d')),
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
