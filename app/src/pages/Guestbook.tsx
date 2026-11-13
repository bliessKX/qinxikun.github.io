import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useRise } from '../App'
import { GUESTBOOK_ENABLED, GISCUS, isGiscusConfigured } from '../lib/backend'

export default function Guestbook() {
  useRise()
  const ready = isGiscusConfigured()

  useEffect(() => { document.title = '留言板 — NICE.BLOG 2.0' }, [])

  useEffect(() => {
    if (!GUESTBOOK_ENABLED || !ready) return
    const host = document.getElementById('giscus-host')
    if (!host) return
    const s = document.createElement('script')
    s.src = 'https://giscus.app/client.js'
    s.async = true
    s.crossOrigin = 'anonymous'
    const attrs: Record<string, string> = {
      'data-repo': GISCUS.repo,
      'data-repo-id': GISCUS.repoId,
      'data-category': GISCUS.category,
      'data-category-id': GISCUS.categoryId,
      'data-mapping': 'specific',
      'data-term': GISCUS.term,
      'data-reactions-enabled': '1',
      'data-emit-metadata': '0',
      'data-input-position': 'top',
      'data-theme': GISCUS.theme,
      'data-lang': GISCUS.lang,
      'data-loading': 'lazy',
    }
    Object.entries(attrs).forEach(([k, v]) => s.setAttribute(k, v))
    // replaceChildren 兼容 StrictMode 双调用：容器内始终只有一个 script
    host.replaceChildren(s)
    return () => { host.replaceChildren() }
  }, [ready])

  return (
    <div className="page gb">
      <div className="page-head">
        <h1><span className="slash">/</span>guestbook</h1>
        <p>留个言、提个问题，或者单纯路过打个招呼。</p>
      </div>

      {!GUESTBOOK_ENABLED ? (
        <div className="gb-panel rise">
          <div className="gb-panel-h mono">// OFFLINE</div>
          <p>留言板暂未开放。笔记、工具与知识图谱不受影响，照常使用。</p>
          <Link className="btn ghost" to="/">回首页</Link>
        </div>
      ) : !ready ? (
        <div className="gb-panel rise">
          <div className="gb-panel-h mono">// SETUP REQUIRED</div>
          <p>留言板已挂载，还缺 Giscus 参数。到 <a href="https://giscus.app" target="_blank" rel="noopener">giscus.app</a> 生成后填进 <code>app/.env.local</code>：</p>
          <ul className="gb-keys mono">
            <li>VITE_GISCUS_REPO=owner/repo</li>
            <li>VITE_GISCUS_REPO_ID=…</li>
            <li>VITE_GISCUS_CATEGORY=Announcements</li>
            <li>VITE_GISCUS_CATEGORY_ID=…</li>
          </ul>
          <p className="muted">仓库需先开启 Discussions 并授权 Giscus App。配置完成前本页不加载任何第三方脚本。</p>
        </div>
      ) : (
        <>
          <div className="gb-notice rise">
            <span className="tag amber">github</span>
            留言由 GitHub Discussions 承载：需 GitHub 账号，内容与用户名公开可见。不想公开可用 <a href="mailto:iceio@outlook.com">邮件</a>。
          </div>
          <div id="giscus-host" className="gb-board rise" />
        </>
      )}
    </div>
  )
}
