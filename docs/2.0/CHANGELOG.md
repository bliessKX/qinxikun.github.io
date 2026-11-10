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
