import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { SUBJECTS } from '../subjects.js'

export default function Home() {
  const navigate = useNavigate()
  const [name, setName] = useState('')

  const handleStudentSearch = (e) => {
    e.preventDefault()
    const v = name.trim()
    if (v) navigate(`/student?q=${encodeURIComponent(v)}`)
  }

  return (
    <div className="home-page">
      <section className="hero">
        <h1>厦门双十中学五大学科竞赛管理系统</h1>
        <p>数学 · 物理 · 化学 · 生物 · 信息学 — 历年获奖记录一站式查询</p>
      </section>

      <h2 className="section-title">学生查询</h2>
      <form className="card" onSubmit={handleStudentSearch}>
        <div className="row" style={{ alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="text-input"
            placeholder="输入学生姓名，跨学科查询其所有获奖记录"
            value={name}
            onChange={e => setName(e.target.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
          <button type="submit" className="btn btn-accent">查询</button>
        </div>
        <p className="muted" style={{ fontSize: '0.85rem', margin: '0.5rem 0 0' }}>
          支持模糊匹配；或在 <Link to="/student">学生查询页</Link> 进一步筛选。
        </p>
      </form>

      <h2 className="section-title">学科入口</h2>
      <div className="subject-grid">
        {SUBJECTS.map(s => (
          <Link key={s.slug} to={`/subject/${s.slug}`} className="subject-card">
            <div className="emoji">{s.emoji}</div>
            <div className="name">{s.name}</div>
            <div className="desc">{s.desc}</div>
          </Link>
        ))}
      </div>

      <h2 className="section-title">跨学科汇总</h2>
      <div className="card">
        <p className="muted" style={{ marginBottom: '0.75rem' }}>
          按学年、奖项、级别对全部五大学科数据进行交叉分析，支持表格与图表切换、Excel 导出。
        </p>
        <Link to="/summary" className="btn">进入汇总页 →</Link>
      </div>

      <h2 className="section-title">关于本系统</h2>
      <div className="card">
        <p style={{ marginTop: '0.5rem' }}>
          公开访问者可查询、筛选、导出全部数据；后续将开放 CRUD、批量导入、公告等功能（需登录）。
        </p>
      </div>

      <figure className="home-bottom-art">
        <img src="./campus-art.jpg" alt="双十中学校区手绘图" />
      </figure>
    </div>
  )
}