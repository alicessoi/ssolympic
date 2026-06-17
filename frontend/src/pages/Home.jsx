import { Link } from 'react-router-dom'
import { SUBJECTS } from '../App.jsx'

export default function Home() {
  return (
    <div className="home-page">
      <section className="hero">
        <h1>双十中学五大学科竞赛管理系统</h1>
        <p>数学 · 物理 · 化学 · 生物 · 信息学 — 历年获奖记录一站式查询</p>
      </section>

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
        <p>
          本系统收录 2015–2025 学年间双十中学五大学科竞赛的获奖记录，
          数据来源为校内登记的 Excel 名册，由 <code>scripts/import_xlsx.mjs</code> 一键导入。
        </p>
        <p style={{ marginTop: '0.5rem' }}>
          公开访问者可查询、筛选、导出全部数据；后续将开放 CRUD、批量导入、公告等功能（需登录）。
        </p>
      </div>

      <figure className="home-bottom-art">
        <img src="/fhxq.jpg" alt="双十中学校区手绘图" />
      </figure>
    </div>
  )
}