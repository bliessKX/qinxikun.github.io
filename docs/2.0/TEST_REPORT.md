# TEST_REPORT.md — 2.0 验收测试

> 环境：headless Chrome + CDP 直连，Node 22，vite preview（生产构建）

## 结果：26/26 通过（0 失败）

### 路由与渲染
| 用例 | 结果 |
|---|---|
| Home 粒子画布渲染 | PASS |
| 导航 7 项 + 高亮 | PASS |
| Home 最新 3 篇 + 3 工具 | PASS |
| Blog 11 篇全渲染（时间倒序） | PASS |
| BlogPost #/blog/5 正文/目录/原文链接 | PASS |
| 旧 hash #/3 → #/blog/3 兼容跳转 | PASS |
| Knowledge 图谱画布 | PASS |
| Tools 3 卡片 + 收藏按钮 | PASS |
| Lab 3 工作台 + JSON 实时解析 | PASS |
| /projects、/about、/blog/99（404 兜底） | PASS |

### 旧站面透传（真文件 200）
tools/json.html · tools/commands.html · tools/what-to-eat.html · tools/index.html · what-to-eat.html · 404.html · CNAME · robots.txt · ink/index.html — 全 PASS

### 响应式
390px：Home 与 Blog 无横向溢出、卡片单列、顶栏可横滑 — PASS

### 构建
- `tsc --noEmit` 零错误
- `vite build` 通过：JS 206.6KB（gzip 74.9KB）、CSS 10.2KB（gzip 2.8KB）

### 视觉截图（桌面 + 移动）
home / blog / knowledge / home-mobile 四视图人工复核通过：主题统一、无裸样式、无溢出。

## 已知限制

- deploy job 需仓库所有者在 Pages 设置把 Source 切到「GitHub Actions」后才会真正部署（build + 守卫 job 可先行验证）
- 三维图谱 / sql.js / Monaco / Pagefind 为后续版本（见 TODO.md）
