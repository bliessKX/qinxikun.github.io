import { useEffect } from 'react'
import { useRise } from '../App'

export default function About() {
  useRise()
  useEffect(() => { document.title = 'About — NICE.BLOG 2.0' }, [])
  return (
    <div className="page">
      <div className="page-head">
        <h1><span className="slash">/</span>about</h1>
      </div>
      <div className="post" style={{ maxWidth: 680 }}>
        <div className="p-body rise">
          <p>nice，全栈工程师。日常在 Java 微服务体系里做业务系统，业余用 Python 和 React 做点自己想用的东西。</p>
          <p>写笔记的规矩很简单：只写自己动手验证过的内容。每篇文章背后都有一段真实的排查过程——EXPLAIN 的执行结果、断点里的现场、被 402 拒掉的推送。结论可以错，但不抄。</p>
          <p>这个站本身就是最新的一次实践：React + TypeScript + Vite 构建，纯静态部署，零后端、零追踪、零 Cookie。站内工具全部在本机运行，你的输入不会离开浏览器；唯一例外是启用后的留言板——它由 GitHub Discussions 承载，留言内容与 GitHub 用户名公开可见。</p>
          <p>技术方向：Java 后端（Spring 全家桶、MySQL、Redis）、智能体（LangGraph、RAG）、前端（React、Canvas 可视化）。</p>
          <p style={{ marginTop: 26 }}>合作或交流：<a href="mailto:iceio@outlook.com">iceio@outlook.com</a></p>
        </div>
        <div style={{ marginTop: 34, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a className="btn ghost" href="./tools/index.html">旧版工具目录</a>
          <a className="btn ghost" href="./ink/index.html">早期水墨原型</a>
        </div>
      </div>
    </div>
  )
}
