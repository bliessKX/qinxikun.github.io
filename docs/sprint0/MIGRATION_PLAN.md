# MIGRATION_PLAN.md — 迁移执行计划（今日版）

> 计划书 10 个 Sprint 对应到今天的工作包。原则不变：旧站全程在线、旧 URL 全部可达、
> 每个 work 包结束都有可构建版本。

## 今日工作包（按执行顺序）

| # | 工作包 | 覆盖计划书 Sprint | 验收标准 |
|---|---|---|---|
| W1 | Sprint 0 审计文档 ×5 | Sprint 0 | 文档入库，数据可复核 |
| W2 | Vite+React+TS 骨架，`public/` 承载旧站全部静态文件 | Sprint 1 | `npm run build` 通过；产物含 tools/*.html、CNAME、404.html |
| W3 | 设计系统（深色科技主题 token + 布局 + 导航） | Sprint 2 | 全局样式变量化，移动端可用，动效尊重 reduced-motion |
| W4 | Home（Canvas 粒子 Hero + 精选内容） | Sprint 3 | 首屏 <2s 出文本，粒子可交互，WebGL 无关（Canvas2D 无兼容风险） |
| W5 | Blog：11 篇笔记 JSON 化 + 列表/详情 + `#/n` 兼容路由 | Sprint 4 | 11 篇全部渲染，旧 hash 链接跳转正确，原文链接逐篇可达 |
| W6 | Knowledge：技术节点 JSON + Canvas 力导向图 | Sprint 6（2D 部分） | 节点无悬空链接，搜索/筛选/详情可用 |
| W7 | Tools 集成（旧页透传 + 收藏/最近使用）+ Lab v1 | Sprint 5 + 7 降级版 | 4 个旧工具页线上可访问，收藏本地持久化 |
| W8 | Projects + About（脱敏口径） | Sprint 8 | 内容真实、无隐私泄露 |
| W9 | Actions 部署 + 全站回归（桌面/移动）+ robots.txt | Sprint 9 | 线上全部路由 + 旧 URL 逐条 200 |

**不在今天范围**（计划书 Sprint 6 的 3D 图谱、Sprint 7 的 sql.js/Monaco/Mermaid 完整版、
ECharts 面板）：理由与升级路径见 TECH_STACK_DECISIONS.md §2。

## 回滚方案

- 迁移期间 `main` 分支不动，全部工作在 `devlops` 进行
- 2.0 产物上线 = Actions 首跑成功 + 人工把 Pages Source 切到 Actions；不切则旧站原样在线
- 任何阶段发现旧 URL 失效：立即停止推进，先修 ROUTE_MAP 再继续
