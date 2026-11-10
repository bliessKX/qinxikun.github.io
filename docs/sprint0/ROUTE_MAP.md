# ROUTE_MAP.md — URL 迁移映射表

> 原则：旧 URL 一律不失效。React 站采用 **HashRouter**（评估结论见 TECH_STACK_DECISIONS.md §3），
> 旧静态页通过 `public/` 原样透传，新旧路径并行。

## 旧 → 新映射

| 旧 URL（必须继续可用） | 2.0 中的归宿 | 方式 |
|---|---|---|
| `/index.html` | React Home | `public/index.html` 不存在时由 SPA `index.html` 接管；构建产物根即 SPA |
| `/#/1` … `/#/11` | 对应笔记详情 | 新路由显式注册裸数字 hash → 按旧站排序（时间倒序）指向第 N 篇，**旧分享链接无损** |
| `/tools/json.html` | 工具页 | `public/tools/json.html` 原样透传，零改动 |
| `/tools/commands.html` | 工具页 | 同上 |
| `/tools/what-to-eat.html` | 工具页 | 同上 |
| `/tools/index.html` | 工具目录 | 同上 |
| `/what-to-eat.html` | 旧跳转页 | 原样保留（跳到 tools/what-to-eat.html） |
| `/404.html` | 404 兜底 | 保留；同时作为 SPA 深层路由回退参考（见下） |
| `/assets/*` | 静态资产 | `public/assets/*` 原样透传 |
| `/ink/index.html` | 原型 | `public/ink/*` 原样透传 |

## 2.0 新路由表（HashRouter）

| 路由 | 页面 |
|---|---|
| `#/` | Home（3D Hero + 精选） |
| `#/blog` | Blog 列表 |
| `#/blog/:n` | 笔记详情（n = 时间倒序序号，兼容裸 `#/n`） |
| `#/tools` | Tools 中心（目录 + 收藏/最近使用，localStorage） |
| `#/knowledge` | 知识图谱（Canvas 2D 力导向） |
| `#/lab` | Lab 工作台（v1） |
| `#/projects` | 项目展示 |
| `#/about` | 关于 |

## GitHub Pages 深层路由说明

HashRouter 下所有页面路由都在 `#` 之后，服务器永远只收到 `/`，**天然无刷新 404 问题**，
无需 404.html 回退 hack。旧静态工具页是真文件，Pages 直接命中。两者互不干扰。
