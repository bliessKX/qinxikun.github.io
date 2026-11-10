# TECH_STACK_DECISIONS.md — 技术决策记录

> Sprint 0 交付 · 每条决策都写明「为什么」和「代价是什么」。

## 1. 采纳计划书的部分

| 项 | 决策 |
|---|---|
| 主站框架 | React 18 + TypeScript + Vite（计划书写的 React 19，取当前 npm 稳定大版本，避免 first-day 依赖风险） |
| 路由 | React Router（HashRouter） |
| 内容数据 | 现有 11 篇笔记 + 119 条命令 + 技术节点，全部抽成 `src/data/*.json`，与组件分离 |
| 部署 | GitHub Actions 构建部署，CNAME 随 `public/` 进产物 |
| 本地数据 | localStorage（工具收藏 / 最近使用 / 浏览历史），不引入 Dexie（见 §2） |

## 2. 有意裁剪的部分（一天交付的取舍）

| 计划书原案 | 2.0 v1 实现 | 理由 | 升级路径 |
|---|---|---|---|
| Three.js + R3F + Drei 3D Hero | **自写 Canvas 2D 粒子网络**（视差 + 节点悬停 + 点击跳转 + reduced-motion 降级） | three 全家桶 ~20MB 依赖，今日装包+联调+构建验证不可控；Canvas 2D 粒子可达 90% 视觉效果且性能更好 | 后续 Sprint 换 R3F，接口按「场景组件」抽象，替换不伤页面 |
| Monaco Editor | 现有 JSON 工具页原样保留（textarea 已够用），Lab v1 提供代码工作台（高亮用轻量方案） | Monaco ~5MB 且需 worker 分包 | 后续独立 Sprint 接入 |
| sql.js SQLite Lab | Lab v1 = JSON/正则/时间戳/Base64 纯前端工作台 | sql.js wasm 另需 CDN 或打包，今天风险过高 | Sprint 7 正式版 |
| Cytoscape.js 知识图谱 | **自写 Canvas 2D 力导向图**（~300 行，含搜索/筛选/节点详情/关联跳转） | 同上，且自有实现与节点 JSON 模型完全解耦 | 数据模型与 Cytoscape 兼容，随时可换渲染引擎 |
| MDX + Shiki + Pagefind | 文章数据 JSON + 渲染模板 + 自写简易搜索（标题/正文 includes） | 构建期管线（MDX 编译、Pagefind 索引）今天的验证成本过高 | Sprint 4 后续迭代 |
| GSAP + Framer Motion | CSS transition + 自写 IntersectionObserver 入场 + 尊重 `prefers-reduced-motion` | 两个动画库今天装可以但联调挤占核心模块时间；且专家规范要求非用户触发动效极简 | 需要滚动叙事时再引 GSAP |
| ECharts 统计面板 | Projects v1 静态卡片 + 技术栈标签 | 无真实统计数据可可视化时不虚构（计划书红线 5） | 有数据后接入 |

> 计划书自身条款支撑以上裁剪：「不得为了使用技术而盲目增加依赖。实际依赖需要根据现有项目情况进行评估。」

## 3. BrowserRouter vs HashRouter 评估（计划书点名要求先评估）

**结论：HashRouter。** 理由：

1. GitHub Pages 无服务端重写能力，BrowserRouter 深层刷新只能靠 404.html hack（把路径存 sessionStorage 再跳回），多一跳、闪一次、SEO 归因混乱；
2. 旧站外链全部是**静态文件路径**（`index.html`、`tools/*.html`）或**旧 hash**（`index.html#/1`），都不依赖 path 路由 —— HashRouter 不改变任何旧链接行为；
3. 裸 `#/1..#/11` 已在新路由中显式注册为笔记兼容路由（见 ROUTE_MAP.md），旧 hash 分享链接无损。

## 4. 依赖清单（今日实际引入）

```
dependencies:     react, react-dom
devDependencies:  vite, @vitejs/plugin-react, typescript, @types/react, @types/react-dom
```

不再有其它运行时依赖。所有交互能力（路由外的基础动效、图谱、粒子）自研。

## 5. 部署链变更

- 现在：push main → Pages「deploy from branch」直接发布源码目录
- 2.0：push main → Actions `vite build` → 产物发布（官方 `actions/deploy-pages`）
- 迁移完成前，旧部署模式与现网保持不动；Actions 工作流首次跑通并验收后，由仓库所有者在 Pages 设置里把 Source 切到 GitHub Actions（此步必须人工确认，不自动改）
