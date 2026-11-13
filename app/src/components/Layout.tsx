import type { ReactNode } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { GUESTBOOK_ENABLED } from '../lib/backend'

const NAV = [
  { to: '/', label: 'home' },
  { to: '/blog', label: 'blog' },
  { to: '/tools', label: 'tools' },
  { to: '/flights', label: 'flights' },
  { to: '/knowledge', label: 'knowledge' },
  { to: '/lab', label: 'lab' },
  { to: '/projects', label: 'projects' },
  { to: '/guestbook', label: 'guestbook' },
  { to: '/about', label: 'about' },
].filter((n) => n.to !== '/guestbook' || GUESTBOOK_ENABLED)

export default function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const section = pathname.split('/')[1] || ''

  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">
          NICE<span className="dot">.</span>BLOG<sup style={{ fontSize: 9, color: 'var(--muted)' }}>2.0</sup>
        </Link>
        <nav className="nav" aria-label="主导航">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}
              className={() => (n.to === '/' ? (section === '' ? 'on' : '') : n.to.startsWith('/' + section) && section ? 'on' : '')}>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main>{children}</main>

      <footer className="footer">
        <div>NICE.BLOG 2.0 · Interactive Developer Platform</div>
        <div className="f-links">
          <Link to="/stats">访问统计</Link>
          <Link to="/flights">航班动态</Link>
          {GUESTBOOK_ENABLED && <Link to="/guestbook">留言板</Link>}
          <a href="./tools/json.html">JSON 工具</a>
          <a href="./tools/commands.html">命令速查</a>
          <a href="./tools/what-to-eat.html">吃什么转盘</a>
          <a href="mailto:iceio@outlook.com">iceio@outlook.com</a>
        </div>
      </footer>
    </>
  )
}
