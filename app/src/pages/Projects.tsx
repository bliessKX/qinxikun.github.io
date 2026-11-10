import { useEffect } from 'react'
import { useRise } from '../App'
import projects from '../data/projects.json'

export default function Projects() {
  useRise()
  useEffect(() => { document.title = 'Projects — NICE.BLOG 2.0' }, [])
  return (
    <div className="page">
      <div className="page-head">
        <h1><span className="slash">/</span>projects</h1>
        <p>只列真实做过、能讲清细节的项目。展示数据不含任何不可公开的信息。</p>
      </div>
      <div className="grid c2">
        {projects.map((p) => (
          <div key={p.id} className="card proj-card rise">
            <h4>{p.name} <span className="tag amber" style={{ marginLeft: 8 }}>{p.status}</span></h4>
            <div className="p-desc">{p.desc}</div>
            <div>{p.stack.map((s) => <span key={s} className="tag">{s}</span>)}</div>
            {p.link && <div style={{ marginTop: 12 }}><a href={p.link}>→ 打开</a></div>}
          </div>
        ))}
      </div>
    </div>
  )
}
