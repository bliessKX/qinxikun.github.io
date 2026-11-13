/**
 * 新闻检索的 GitHub 账号核验门禁 + 每账号 1000 次配额。
 *
 * 【能力边界】这不是 OAuth 授权。GitHub 标准 web flow 换 token 必须带
 * client_secret 并走服务端回调，纯静态站放不住 secret。这里用公开 API
 * 核验账号存在、建立本地会话，满足「先登录再搜索」的门槛与按账号计数。
 * 需要强身份认证时，只替换本模块为 Supabase / Cloudflare Workers OAuth，
 * 页面组件不用改。
 */
const USER_KEY = 'nice2.news.github.user.v1'
const QUOTA_KEY = 'nice2.news.quota.v1'
export const QUOTA_LIMIT = 1000

export interface GithubUser {
  login: string
  name: string
  avatar_url: string
  html_url: string
  verifiedAt: number
}

function get(k: string): string | null {
  try { return localStorage.getItem(k) } catch { return null }
}
function put(k: string, v: string) {
  try { localStorage.setItem(k, v) } catch { /* 隐私模式忽略 */ }
}
function del(k: string) {
  try { localStorage.removeItem(k) } catch { /* 忽略 */ }
}

export function currentUser(): GithubUser | null {
  const raw = get(USER_KEY)
  if (!raw) return null
  try {
    const u = JSON.parse(raw) as GithubUser
    return u && u.login ? u : null
  } catch { return null }
}

/** 核验 GitHub 账号：调公开 users API，不读取任何私有数据。 */
export async function verifyGithub(input: string): Promise<GithubUser> {
  const login = input.trim().replace(/^@/, '')
  if (!/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(login)) {
    throw new Error('用户名格式不对，填 GitHub 主页 @ 后面那串。')
  }
  const res = await fetch('https://api.github.com/users/' + encodeURIComponent(login), {
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (res.status === 404) throw new Error('没找到这个账号，检查拼写再试。')
  if (res.status === 403) throw new Error('GitHub 接口限流了，等几分钟再试。')
  if (!res.ok) throw new Error('GitHub 暂时没响应，稍后再试。')
  const j = await res.json()
  const user: GithubUser = {
    login: j.login,
    name: j.name || j.login,
    avatar_url: j.avatar_url || '',
    html_url: j.html_url || 'https://github.com/' + j.login,
    verifiedAt: Date.now(),
  }
  put(USER_KEY, JSON.stringify(user))
  return user
}

export function signOut() { del(USER_KEY) }

function quotaMap(): Record<string, number> {
  try { return JSON.parse(get(QUOTA_KEY) || '{}') || {} } catch { return {} }
}
export function usedQuota(login: string): number { return quotaMap()[login] || 0 }
export function remainingQuota(login: string): number {
  return Math.max(0, QUOTA_LIMIT - usedQuota(login))
}
/** 记录一次成功检索，返回该账号累计次数。 */
export function consumeQuota(login: string): number {
  const m = quotaMap()
  m[login] = (m[login] || 0) + 1
  put(QUOTA_KEY, JSON.stringify(m))
  return m[login]
}
export function clearQuota(login: string) {
  const m = quotaMap()
  delete m[login]
  put(QUOTA_KEY, JSON.stringify(m))
}
