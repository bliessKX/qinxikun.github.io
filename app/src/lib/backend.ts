/** 留言板唯一配置入口。
 *  关闭：app/.env.local 设 VITE_GUESTBOOK_ENABLED=off
 *  → 导航、footer 入口与第三方脚本一起消失，站点回到纯静态版本。 */

export const GUESTBOOK_ENABLED = import.meta.env.VITE_GUESTBOOK_ENABLED !== 'off'

/** 在 https://giscus.app 选好仓库与讨论分类后生成，填进 app/.env.local。 */
export const GISCUS = {
  repo: import.meta.env.VITE_GISCUS_REPO ?? '',
  repoId: import.meta.env.VITE_GISCUS_REPO_ID ?? '',
  category: import.meta.env.VITE_GISCUS_CATEGORY ?? 'Announcements',
  categoryId: import.meta.env.VITE_GISCUS_CATEGORY_ID ?? '',
  term: 'NICE.BLOG 留言板',
  theme: 'dark_dimmed',
  lang: 'zh-CN',
} as const

export const isGiscusConfigured = () =>
  Boolean(GISCUS.repo && GISCUS.repoId && GISCUS.category && GISCUS.categoryId)
