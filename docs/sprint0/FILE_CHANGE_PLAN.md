# FILE_CHANGE_PLAN.md — 文件变更计划

> Sprint 0 交付。列出 2.0 改造会新增/修改/保留的每一个路径。
> 红线：迁移完成前不删除任何旧文件；`public/` 内文件一律原样拷贝不修改。

## 新增

```
docs/sprint0/
├── PROJECT_AUDIT.md          ← 本批
├── MIGRATION_PLAN.md         ← 本批
├── ROUTE_MAP.md              ← 本批
├── FILE_CHANGE_PLAN.md       ← 本批
└── TECH_STACK_DECISIONS.md   ← 本批

app/                          ← React 源码根（不与旧站文件混放）
├── package.json
├── vite.config.ts            ← base:'./'，publicDir:'public'
├── tsconfig.json
├── index.html                ← SPA 入口
├── public/                   ← 构建时原样拷入产物根
│   ├── CNAME                 ← 拷自仓库根
│   ├── 404.html              ← 拷自仓库根
│   ├── what-to-eat.html      ← 拷自仓库根（旧跳转页）
│   ├── robots.txt            ← 新写
│   ├── assets/               ← 拷自仓库根（图片/音频，删掉未被引用的合成脚本）
│   ├── tools/                ← 拷自 tools/（4 个工具页 + 目录页，零修改）
│   └── ink/                  ← 拷自 ink/（原型，原样保留）
├── src/
│   ├── main.tsx / App.tsx / router.tsx
│   ├── styles/               ← design tokens + 全局样式
│   ├── components/           ← Layout / Nav / Footer / Hero / 粒子场景
│   ├── pages/                ← Home / Blog / Tools / Knowledge / Lab / Projects / About / NotFound
│   ├── features/
│   │   ├── particle-hero/    ← Canvas 2D 粒子网络（场景组件接口，可后换 R3F）
│   │   └── knowledge-graph/  ← Canvas 2D 力导向图 + 详情面板
│   └── data/
│       ├── articles.json     ← 11 篇笔记（自 index.html NOTES 抽取）
│       ├── commands-meta.json← 9 分类元信息（命令本体仍在工具页，不重复维护）
│       ├── graph-nodes.json  ← 技术节点（文章/工具/技术三类，链接全部真实）
│       └── graph-edges.json  ← 关系边
└── .github/workflows/deploy.yml  ← Actions 构建部署
```

## 修改

| 文件 | 变更 |
|---|---|
| `README.md` | 追加 2.0 架构说明与开发/构建指引 |
| `.gitignore` | 追加 `app/node_modules/`、`app/dist/` |

## 不动的

`index.html`（旧主页源文件保留在仓库根直至 Actions 部署切换验收完成）、
`tools/*`、`what-to-eat.html`、`404.html`、`CNAME`、`ink/*`、`assets/*` ——
全部原样保留，作为 2.0 的 `public/` 数据源与回滚保障。

## 明确删除（验收后另行提交）

无。
