# CHANGELOG.md — NICE.BLOG 2.0（Sprint 0–9 单日交付版）

> 日期：2026-11-10 · 范围：Sprint 0 审计 + React 主站全量搭建 + 旧站迁移

## 新增

- `app/` — React 18 + TypeScript + Vite 主站：
  - 路由：`#/` Home · `#/blog` · `#/blog/:n` · `#/tools` · `#/knowledge` · `#/lab` · `#/projects` · `#/about` · 404
  - 兼容路由：旧站 `#/1..#/11` 自动落对应笔记（时间倒序序号不变）
  - Home：Canvas 2D 粒子技术网络（视差/悬停/点击进图谱/reduced-motion 降级）
  - Blog：11 篇笔记 JSON 化（`scripts/extract-articles.cjs` 自动抽取），列表/详情/搜索/上下篇
  - Knowledge：自研 Canvas 力导向图谱（23 技术 + 11 文章 + 3 工具 / 33 边），搜索/筛选/详情/拖拽
  - Tools：统一目录 + 收藏/最近使用（localStorage）
  - Lab v1：JSON 工作台 / 正则测试器 / 时间戳·Base64
  - Projects / About：真实脱敏内容
  - 设计系统：深蓝黑 × 琥珀 × 冷青「CRT 终端」主题，蓝图网格底纹，JetBrains Mono 标题
- `.github/workflows/deploy.yml` — Actions 构建 + 遗留面守卫（CNAME/404/旧工具页缺失即失败）+ Pages 部署
- `app/public/` — 旧站全部静态资源原样透传（tools/ 4 页、ink/、assets/、404、CNAME、旧跳转页）+ robots.txt
- `docs/sprint0/` — 五份审计与决策文档

## 修改

- `README.md` — 2.0 架构与开发指引
- `.gitignore` — app/node_modules、app/dist

## 未动

- 仓库根 `index.html`、`tools/*`、`404.html`、`what-to-eat.html`、`CNAME`、`ink/`、`assets/` 全部原样保留（回滚保障 + branch 部署兼容）

## 关键修复（开发期实测踩坑）

1. `useEffect(() => window.scrollTo(0,0))` 表达式体把返回值交给 React 当 cleanup，卸载时整树崩（destroy is not a function）→ 改块体
2. Knowledge 页漏调 `useRise()`，`.rise` 停留透明态整块隐身 → 补上
3. favicon 缺失 404 → data-URI 内联

---

## 2026-11-13 — 留言板（渐进增强 / 可降级）

- 新增 `#/guestbook`：留言由 GitHub Discussions + Giscus 承载，无需自建服务器、数据库或后端接口。
- 新增 `app/src/pages/Guestbook.tsx`、`app/src/lib/backend.ts`、`app/src/vite-env.d.ts`、`app/.env.example`。
- `App.tsx` 加路由；`global.css` 加 `.gb-*` 样式（沿用 CRT 琥珀终端色板）。
- `Layout.tsx`：顶部 NAV 用 `guestbook` 顶替 `stats`（stats 保留在 footer），NAV 仍 8 项不挤窄屏；footer 加「留言板」。
- `About.tsx`：修正「零追踪」文案，注明留言区由 GitHub Discussions 承载、内容与用户名公开。
- `README.md` 加启用步骤；`.gitignore` 忽略 `app/.env.local`。

**兜底设计**：`VITE_GUESTBOOK_ENABLED=off` → 导航项、footer 入口、Giscus 脚本三者一起消失，站点回到纯静态版本；留言数据留在 GitHub Discussions，不丢。Giscus 参数未配置时页面显示配置引导，不加载任何第三方脚本。

**配置修正（同日）**：
- 核实仓库全名为 `bliessKX/qinxikun.github.io`（此前模板误写 `qinxikun/...`）；`repoId = R_kgDOUiLIzQ`，Discussions 已开启。
- 新增 `app/.env`（提交进仓库）：GitHub Actions 构建 `npm run build` 不读被 gitignore 的 `.env.local`，只填本地会导致线上停在配置引导页。`.env` 作线上默认，`.env.local` 作本地覆盖（Vite 优先级更高）。
- 修正线上地址：`https://qxkk.dpdns.org/2.0/#/guestbook`（`deploy.yml` 把 2.0 挂到 `/2.0/`，旧文档写成 `/#/guestbook`）。
- `README.md` 补两处配置说明。

**分类建议更正**：此前写「选 General、勿用 Announcements」是错的。giscus 官方推荐 **Announcements 类型**分类 —— 仅维护者/giscus 能创建 discussion，访客仍可在已有帖下回复，正好配合本站 `mapping=specific`（固定一个留言簿）防乱开帖。`isGiscusConfigured()` 增加对 `category` 非空校验，避免只填 ID 导致脚本参数缺失。

**配置完成**：最终选定 `General`，`categoryId = DIC_kwDOUiLIzc4DLAwS`，`repoId = R_kgDOUiLIzQ`，均已写入 `app/.env` 与 `.env.example`。因本站用 `mapping=specific` 固定单个 discussion，分类开放也不会乱开帖。`npm run build` 产物已确认包含该 categoryId。
