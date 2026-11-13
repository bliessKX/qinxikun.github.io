import { useEffect, lazy, Suspense } from 'react'
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Blog from './pages/Blog'
import BlogPost from './pages/BlogPost'
import Tools from './pages/Tools'
import Knowledge from './pages/Knowledge'
import Lab from './pages/Lab'
import Projects from './pages/Projects'
import About from './pages/About'
import Guestbook from './pages/Guestbook'
import NotFound from './pages/NotFound'
import articles from './data/articles.json'
import { trackVisit } from './lib/analytics'

/* antd 体积较大，统计页按需加载：访问其它页面不下载这部分代码 */
const Stats = lazy(() => import('./pages/Stats'))

/** 入场编排：给 .rise 元素做一次 IntersectionObserver 淡入 */
export function useRise() {
  const loc = useLocation()
  useEffect(() => {
    const els = document.querySelectorAll('.rise:not(.in)')
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && e.target.classList.add('in')),
      { threshold: 0.08 },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [loc.pathname])
}

/** 本设备 PV 埋点：随 App 挂载一次，路由变化时写一条 localStorage 记录。
 *  trackVisit 内部对「同会话 + 同路径 + 800ms 内」去重，StrictMode 双调用安全。 */
function VisitTracker() {
  const { pathname } = useLocation()
  useEffect(() => { trackVisit(pathname) }, [pathname])
  return null
}

function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    /* 必须块体：表达式体若隐式返回非函数值会被 React 当成 effect cleanup，
       在卸载时抛 destroy is not a function（本站实际踩过的坑） */
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  return (
    <Layout>
      <ScrollTop />
      <VisitTracker />
      <LegacyHashCompat />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/:n" element={<BlogPost />} />
        <Route path="/tools" element={<Tools />} />
        <Route path="/knowledge" element={<Knowledge />} />
        <Route path="/lab" element={<Lab />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/about" element={<About />} />
        <Route path="/guestbook" element={<Guestbook />} />
        <Route path="/stats" element={
          <Suspense fallback={<div className="page"><div className="page-head"><p className="mono">/stats · 载入看板…</p></div></div>}>
            <Stats />
          </Suspense>
        } />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  )
}

/** 旧站 hash 兼容：#/3 → #/blog/3。
 *  兼容导航必须放在这个「永不卸载」的顶层组件里做：
 *  若放进 Routes 内部的 redirect 路由（无论 <Navigate> 还是 effect 里
 *  navigate），路由树重算与组件卸载会竞态，实测整树崩掉（白屏）。
 *  本组件随 App 挂载一次，StrictMode 双调用第二次时 pathname 已变，安全。 */
function LegacyHashCompat() {
  const loc = useLocation()
  const nav = useNavigate()
  useEffect(() => {
    const m = loc.pathname.match(/^\/(\d+)$/)
    if (!m) return
    const n = Number(m[1])
    nav(n >= 1 && n <= articles.length ? '/blog/' + n : '/', { replace: true })
  }, [loc.pathname, nav])
  return null
}
