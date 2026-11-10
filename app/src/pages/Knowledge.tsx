import { useEffect } from 'react'
import KnowledgeGraph from '../features/knowledge-graph/KnowledgeGraph'
import { useRise } from '../App'

export default function Knowledge() {
  /* 页内有 .rise 元素，必须启动入场观察器 —— 漏掉这行整块会停留在透明态 */
  useRise()
  useEffect(() => { document.title = 'Knowledge — NICE.BLOG 2.0' }, [])
  return (
    <div className="page">
      <div className="page-head">
        <h1><span className="slash">/</span>knowledge</h1>
        <p>把技术、文章、工具连成一张图。数据全部来自真实内容，节点链接指得进去；悬停看邻居，点击看详情，拖拽随意摆。</p>
      </div>
      <KnowledgeGraph />
    </div>
  )
}
