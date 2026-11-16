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
  cat: '逻辑' | '街机' | '物理' | '3D' | '体感' | '模拟' | '棋牌' | '体育'
  glyph: string
  /** 开源游戏：public/ogames/ 下的目录名，用 iframe 内嵌原样运行 */
  embed?: string
  /** 标记为开源精选（来自 sausi-7/games，MIT） */
  open?: boolean
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
  /* ---- 开源精选（sausi-7/games，MIT License，iframe 原样内嵌） ---- */
  { id: 'og-pacman', embed: 'pacman', open: true, name: '吃豆人', desc: '经典街机：在迷宫里吃掉全部豆子，躲开四只幽灵，吃到能量豆可以反杀。', stack: 'Phaser 3 · 开源', cat: '街机', glyph: '🟡' },
  { id: 'og-tetris', embed: 'tetris', open: true, name: '俄罗斯方块', desc: '经典落块消除：旋转拼放七种方块填满整行，行的消除越快得分越高。', stack: 'HTML5 · 开源', cat: '逻辑', glyph: '▦' },
  { id: 'og-sudoku', embed: 'sudoku', open: true, name: '数独', desc: '9×9 数独填字：每行每列每宫 1-9 不重复，多难度可选，考验推理。', stack: 'HTML5 · 开源', cat: '逻辑', glyph: '9️⃣' },
  { id: 'og-chess', embed: 'chess', open: true, name: '国际象棋', desc: '和电脑对弈的国际象棋：完整规则（王车易位、吃过路兵、升变），多档棋力。', stack: 'Phaser 3 · 开源', cat: '棋牌', glyph: '♟️' },
  { id: 'og-ludo', embed: 'ludo', open: true, name: '飞行棋', desc: '四人对战的飞行棋：掷骰子起飞、撞子回家，最先全部抵达终点者胜。', stack: 'HTML5 · 开源', cat: '棋牌', glyph: '🎲' },
  { id: 'og-tictactoe', embed: 'tic-tac-toe', open: true, name: '井字棋', desc: '经典 X/O 三连：人机对战或双人同屏，简单但想赢 AI 也不容易。', stack: 'Phaser 3 · 开源', cat: '棋牌', glyph: '⭕' },
  { id: 'og-mario', embed: 'mario', open: true, name: '蘑菇冒险', desc: '马里奥式横版跳跃：跑跳踩怪、顶砖块吃蘑菇、跃过深坑抵达旗杆。', stack: 'Phaser 3 · 开源', cat: '街机', glyph: '🍄' },
  { id: 'og-doodle', embed: 'doodle-jump', open: true, name: '涂鸦跳跃', desc: '不断向上弹跳：踩着弹簧与浮台一路攀升，掉落底部即结束，看你能跳多高。', stack: 'Phaser 3 · 开源', cat: '街机', glyph: '⬆️' },
  { id: 'og-flappy', embed: 'flappy', open: true, name: '飞翔小鸟', desc: '一点一飞：控制小鸟穿过管道缝隙，手感极简但极易上头。', stack: 'Phaser 3 · 开源', cat: '街机', glyph: '🐤' },
  { id: 'og-cutrope', embed: 'cut-rope', open: true, name: '割绳子', desc: '物理益智：剪断绳索让糖果荡进小怪物的嘴里，利用摆动与机关精准投喂。', stack: 'Phaser 3 · 开源', cat: '逻辑', glyph: '✂️' },
  { id: 'og-candy', embed: 'candy-crush', open: true, name: '糖果消除', desc: '糖果版三消：交换相邻糖果凑成三连消除，连锁与特殊糖果带你拿高分。', stack: 'Phaser 3 · 开源', cat: '逻辑', glyph: '🍬' },
  { id: 'og-crossy', embed: 'crossy-road', open: true, name: '天天过马路', desc: '3D 过马路：一步一步往前跳，躲开车流、跳上浮木过河，走慢了会被老鹰抓走。', stack: 'Three.js · 开源', cat: '街机', glyph: '🐔' },
  { id: 'og-whack', embed: 'whack-a-bug', open: true, name: '打地虫', desc: '限时打地鼠：虫子从洞里冒头就敲，连击有加分，考验眼疾手快。', stack: 'Phaser 3 · 开源', cat: '街机', glyph: '🔨' },
  { id: 'og-breakoid', embed: 'breakoid', open: true, name: '打砖块', desc: '街机打砖块：反弹板控制小球清空砖墙，接住掉落道具火力全开。', stack: 'Phaser 3 · 开源', cat: '街机', glyph: '🕹️' },
  { id: 'og-penalty', embed: 'penalty', open: true, name: '点球大战', desc: '点球对决：选角度力度射门，再切换守门员扑救，五轮定胜负。', stack: 'Phaser 3 · 开源', cat: '体育', glyph: '⚽' },
  { id: 'og-bowling', embed: 'bowling', open: true, name: '保龄球', desc: '十瓶保龄球：瞄准、蓄力、旋转一气呵成，全中 STRIKE 的手感最爽。', stack: 'Phaser 3 · 开源', cat: '体育', glyph: '🎳' },
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
  const Comp = meta?.embed ? undefined : GAME_COMPONENTS[id || '']
  if (!meta || (!Comp && !meta.embed)) {
    return (
      <div className="page">
        <div className="page-head">
          <h1><span className="slash">/</span>games</h1>
          <p className="mono">未找到这个游戏 · <Link to="/games">返回大厅</Link></p>
        </div>
      </div>
    )
  }
  const head = (
    <div className="game-top">
      <Link to="/games" className="game-back">← 大厅</Link>
      <h1><span className="game-glyph">{meta.glyph}</span>{meta.name}</h1>
      <span className="tag">{meta.stack}</span>
      <p className="game-sub">{meta.desc}</p>
    </div>
  )
  if (meta.embed) {
    return (
      <div className="page game-page">
        {head}
        <div className="og-frame">
          <iframe
            src={`${import.meta.env.BASE_URL}ogames/${meta.embed}/index.html`}
            title={meta.name}
            loading="lazy"
            allowFullScreen />
        </div>
        <p className="og-credit mono">
          开源游戏 · 来自 <a href="https://github.com/sausi-7/games" target="_blank" rel="noreferrer">sausi-7/games</a>（MIT License），原样内嵌运行
        </p>
      </div>
    )
  }
  return (
    <div className="page game-page">
      {head}
      {Comp && <Comp />}
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
        <p>游戏大厅 —— 农场模拟、钓鱼、三消、2D 物理弹射、3D 跑酷、摄像头体感，另有吃豆人 / 俄罗斯方块 / 国际象棋等开源精选，全部浏览器本地运行。</p>
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
                {g.open && <span className="tag og-tag">开源</span>}
              </div>
            </div>
            <div className="gm-play">PLAY ▸</div>
          </Link>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 20, fontFamily: 'var(--mono)', fontSize: 11.5 }}>
        {GAMES.length} 款游戏 · 自研款独立分包点开才下载引擎 · 开源精选来自 sausi-7/games（MIT）
      </p>
    </div>
  )
}
