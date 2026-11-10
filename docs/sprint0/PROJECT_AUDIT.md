# PROJECT_AUDIT.md — Sprint 0 项目审计

> 审计时间：2026-11-10 15:00 · 审计人：执行智能体 · 状态：已完成
> 方法：全仓库文件扫描 + 线上响应头实测 + 内容规模统计，所有数据来自真实检查结果。

## 1. 仓库概况

| 项 | 值 |
|---|---|
| 仓库 | github.com/qinxikun/qinxikun.github.io |
| 站点 | https://qxkk.dpdns.org（自定义域名，CNAME 文件已确认） |
| 总体积 | 11 MB（其中音频 9.2 MB 占绝对大头） |
| 技术形态 | 纯静态 HTML/CSS/JS，零构建、零框架 |
| 唯一外部依赖 | Google Fonts（Noto Serif SC，仅 index.html） |

## 2. 页面与功能清单

| 文件 | 体积 | 功能 | 迁移处置 |
|---|---|---|---|
| `index.html` | 32K | 主页：三栏布局，内联 11 篇笔记数据（NOTES 数组，含 title/short/cat/date/toc/paras），hash 路由 `#/1..#/11`，背景音乐（双源降级） | 内容迁入 React（数据抽成 JSON），URL 兼容 |
| `tools/index.html` | 12K | 工具目录页（3 张卡片） | 原样保留 |
| `tools/json.html` | 52K | JSON 工具：格式化/校验/修复/压缩/排序/转义/树形/全屏，5 档示例 | 原样保留 |
| `tools/commands.html` | 32K | 命令速查：9 分类 119 条命令，搜索/单条复制/整组复制 | 原样保留 |
| `tools/what-to-eat.html` | 24K | 选餐转盘：Canvas 绘制、时段判断、8 菜系 | 原样保留 |
| `what-to-eat.html` | 4K | 旧地址跳转页（meta refresh → tools/） | 原样保留 |
| `404.html` | 4K | 自绘 404 兜底页，5 个入口链接 | 原样保留（兼作 SPA 回退底座） |
| `ink/index.html` | 36K | 早期水墨卷册原型，**无任何页面引用** | 原样保留，不纳入 2.0 信息架构 |

## 3. 资产清单

- `assets/summer-field.wav`（6.1M，合成底乐，主页在用）
- `assets/kun-hero.jpg|webp`、`kun-portrait.png|webp`（约 1.5M，头像/主视觉）
- `assets/summer-rice.webp`（128K）
- `ink/assets/qin-bg.wav`（3.1M，仅 ink 原型使用）
- `assets/_synth_field.py`、`ink/assets/_synth_qin.py`（音频合成脚本，开发工具非站点资源）

## 4. 审计发现的问题

1. **BGM 引用了不存在的文件**：`index.html` 的 TRACKS 数组首选 `assets/daoxiang.mp3`，但仓库中无此文件（实测 `find` 确认），每次进站必发一个 404 请求后回退到 wav。2.0 中直接修正数据源。
2. **无 robots.txt / sitemap.xml**：SEO 基础件缺失，Sprint 9 补。
3. **无 GitHub Actions**：Pages 为「deploy from branch: main / (root)」模式（线上响应头 `Server: GitHub.com` + 无 `.github/` 目录佐证）。引入构建链后**必须**切换为 Actions 部署，这是 Sprint 1 的阻塞项。
4. `.idea/` 已在 .gitignore 且未被 git 跟踪（`git ls-files` 为空），无残留风险。
5. 分支冗余：存在一个历史分支 `devlop`（非 `devlops`），指向早期提交，无引用，可删可留。

## 5. 内容规模

- 笔记：11 篇（id 170422770 … 163942173），每篇含目录（toc）+ 正文段落（paras），全部外链指向 CSDN 原文
- 命令：119 条 / 9 分类（Git 18、Linux 18、Docker 15、SVN 15、MySQL 15、Redis 10、Nginx 10、Maven 9、Java 9）
- 工具：4 个独立页 + 1 目录页
- 文章技术域：Java/Spring/Shiro/JDK、MySQL/Redis、TCP/UDP、Python、LangGraph/Agent/RAG

## 6. 风险与红线（迁移期间全程有效）

- 旧站 URL（`index.html`、`tools/*.html`、`404.html`、根跳转页）迁移后必须继续可访问
- `CNAME` 必须保留在部署产物根目录
- 不虚构 GitHub 数据与访问统计；项目/个人介绍延续既有脱敏口径（nice / iceio@outlook.com，无真实姓名、单位、地名、码仓）
