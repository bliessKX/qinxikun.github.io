/**
 * 新闻检索的 GitHub 账号核验门禁 + 每账号 100 次配额。
 *
 * 【能力边界】这不是 OAuth 授权。GitHub 标准 web flow 换 token 必须带
 * client_secret 并走服务端回调，纯静态站放不住 secret。这里核验账号是否
 * 存在、建立本地会话，满足「先登录再搜索」的门槛与按账号计数。
 * 需要强身份认证时，只替换本模块为 Supabase / Cloudflare Workers OAuth，
 * 页面组件不用改。
 *
 * 【为什么不用 /users/{login} 做主路径】GitHub 未认证 REST 请求是
 * 60 次/小时/按 IP，超限返回 403 或 429，要等到 X-RateLimit-Reset
 * 指示的时刻（最长 1 小时）。代理出口 IP 常被多人共用，很容易打满。
 * 改用 github.com/{login}.png 头像端点：<img> 跨域加载不受 CORS 限制，
 * 也不消耗 API 配额。REST 只作兜底，并能从已 expose 的响应头算出
 * 精确的恢复时间（Retry-After / X-RateLimit-Reset）。
 */
const USER_KEY = 'nice2.news.github.user.v1'
const QUOTA_KEY = 'nice2.news.quota.v1'
export const QUOTA_LIMIT = 100

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

function avatarUrl(login: string): string {
  return `https://github.com/${encodeURIComponent(login)}.png?size=80`
}

type AvatarProbe = 'ok' | 'missing' | 'unreachable'

/** 头像端点探测：存在→302→onload，不存在→404→onerror，8 秒超时视为不可达。 */
function probeAvatar(login: string): Promise<AvatarProbe> {
  return new Promise((resolve) => {
    const img = new Image()
    let done = false
    let timer = 0
    const finish = (state: AvatarProbe) => {
      if (done) return
      done = true
      clearTimeout(timer)
      img.onload = null
      img.onerror = null
      resolve(state)
    }
    timer = window.setTimeout(() => { img.src = ''; finish('unreachable') }, 8000)
    img.onload = () => finish(img.naturalWidth > 0 ? 'ok' : 'missing')
    img.onerror = () => finish('missing')
    img.src = avatarUrl(login)
  })
}

/** 从限流响应头算出恢复时刻，供界面做精确倒计时。 */
export function rateLimitInfo(res: Response): { text: string; resetAt: number } {
  const retry = Number(res.headers.get('Retry-After'))
  const reset = Number(res.headers.get('X-RateLimit-Reset'))
  const resetAt = Number.isFinite(reset) && reset > 0
    ? reset * 1000
    : (retry > 0 ? Date.now() + retry * 1000 : 0)
  const ms = Math.max(0, resetAt - Date.now())
  if (resetAt && ms > 0) {
    const at = new Date(resetAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    return { text: `GitHub 接口限流了，约 ${Math.ceil(ms / 60000)} 分钟后（${at}）恢复。`, resetAt }
  }
  if (retry > 0) return { text: `GitHub 接口限流了，约 ${Math.ceil(retry / 60)} 分钟后恢复。`, resetAt }
  return { text: 'GitHub 接口限流了，一小时内会恢复。', resetAt: 0 }
}

export class GithubRateLimitError extends Error {
  resetAt: number
  constructor(message: string, resetAt: number) {
    super(message)
    this.name = 'GithubRateLimitError'
    this.resetAt = resetAt
  }
}

export interface GithubRateLimit { limit: number; remaining: number; resetAt: number }

/** GET /rate_limit 本身不消耗配额；网络失败时返回 null，界面静默降级。 */
export async function githubRateLimit(): Promise<GithubRateLimit | null> {
  try {
    const res = await fetch('https://api.github.com/rate_limit', {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) return null
    const j = await res.json()
    const core = j?.resources?.core
    if (!core || typeof core.remaining !== 'number') return null
    return {
      limit: core.limit ?? 60,
      remaining: core.remaining,
      resetAt: (core.reset ?? 0) * 1000,
    }
  } catch { return null }
}

/** 核验 GitHub 账号：优先头像端点（零配额），REST 仅兜底。 */
export async function verifyGithub(input: string): Promise<GithubUser> {
  const login = input.trim().replace(/^@/, '')
  if (!/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(login)) {
    throw new Error('用户名格式不对，填 GitHub 主页 @ 后面那串。')
  }

  let displayName = login
  const probe = await probeAvatar(login)
  if (probe !== 'ok') {
    // 头像端点没成功：再问一次 REST，用来区分「账号不存在」与「头像服务异常」
    let res: Response
    try {
      res = await fetch('https://api.github.com/users/' + encodeURIComponent(login), {
        headers: { Accept: 'application/vnd.github+json' },
      })
    } catch {
      throw new Error('GitHub 暂时没响应，稍后再试。')
    }
    if (res.ok) {
      const j = await res.json()
      displayName = j.name || j.login || login
    } else if ((res.status === 403 || res.status === 429) && probe === 'unreachable') {
      // 只是头像端点超时，账号本身未判定 → 才把限流当主因，给出精确恢复时间
      const info = rateLimitInfo(res)
      throw new GithubRateLimitError(info.text, info.resetAt)
    } else {
      // 头像 404 是「账号不存在」的强信号，不被限流覆盖
      throw new Error('没找到这个账号，检查拼写再试。')
    }
  }

  const user: GithubUser = {
    login,
    name: displayName,
    avatar_url: avatarUrl(login),
    html_url: 'https://github.com/' + login,
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
