import { useEffect } from 'react'
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
import NotFound from './pages/NotFound'
import articles from './data/articles.json'

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
