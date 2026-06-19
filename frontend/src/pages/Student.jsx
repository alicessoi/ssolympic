import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { api } from '../api.js'
import { SUBJECTS } from '../subjects.js'

const SUBJECT_MAP = Object.fromEntries(SUBJECTS.map(s => [s.name, s]))
const AWARD_RANK = { '金牌': 1, '一等奖': 1, '银牌': 2, '二等奖': 2, '铜牌': 3, '三等奖': 3 }

function bestAward(awards) {
  const ranked = awards
    .filter(a => a.award && AWARD_RANK[a.award] != null)
    .sort((a, b) => AWARD_RANK[a.award] - AWARD_RANK[b.award])
  return ranked[0] || null
}

export default function Student() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = (searchParams.get('q') || '').trim()
  const [input, setInput] = useState(query)

  useEffect(() => { setInput(query) }, [query])

  const handleSearch = (e) => {
    e?.preventDefault()
    const v = input.trim()
    if (v) setSearchParams({ q: v })
    else setSearchParams({})
  }

  const handleClear = () => {
    setInput('')
    setSearchParams({})
  }

  const matches = useMemo(() => {
    if (!query) return []
    return api._allAwards().filter(r => (r.student_name || '').includes(query))
  }, [query])

  const byStudent = useMemo(() => {
    const map = new Map()
    for (const r of matches) {
      if (!map.has(r.student_name)) map.set(r.student_name, [])
      map.get(r.student_name).push(r)
    }
    return [...map.entries()]
      .map(([name, awards]) => {
        awards.sort((a, b) => (a.academic_year || '').localeCompare(b.academic_year || ''))
        const bySubject = {}
        for (const a of awards) bySubject[a.subject] = (bySubject[a.subject] || 0) + 1
        const byLevel = {}
        for (const a of awards) byLevel[a.award_level] = (byLevel[a.award_level] || 0) + 1
        return { name, awards, bySubject, byLevel, best: bestAward(awards) }
      })
      .sort((a, b) => b.awards.length - a.awards.length)
  }, [matches])

  return (
    <div>
      <h1 className="page-title">跨学科学生查询</h1>

      <form className="card" onSubmit={handleSearch}>
        <div className="row" style={{ alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="text-input"
            placeholder="输入学生姓名（支持模糊匹配，如：张 / 李四）"
            value={input}
            onChange={e => setInput(e.target.value)}
            style={{ flex: 1, minWidth: 220 }}
            autoFocus
          />
          <button type="submit" className="btn btn-accent">查询</button>
          {query && <button type="button" className="btn btn-ghost" onClick={handleClear}>清除</button>}
        </div>
        <p className="muted" style={{ fontSize: '0.85rem', margin: '0.5rem 0 0' }}>
          支持模糊匹配（姓名中包含输入字符串即命中），跨数学/物理/化学/生物/信息学五大学科。
        </p>
      </form>

      {!query && (
        <div className="card">
          <p className="muted">输入学生姓名，跨学科查询其所有获奖记录。</p>
        </div>
      )}

      {query && (
        <>
          <div className="card">
            <h2 className="section-title" style={{ marginTop: 0 }}>
              查询结果：「{query}」
            </h2>
            <p style={{ margin: '0.25rem 0' }}>
              匹配到 <strong>{byStudent.length}</strong> 位学生 · 共 <strong>{matches.length}</strong> 条获奖记录
            </p>
            {byStudent.length > 1 && (
              <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>
                多位学生姓名包含「{query}」，下方按匹配数从高到低展示。
              </p>
            )}
          </div>

          {byStudent.length === 0 && (
            <div className="card empty">未找到姓名中包含「{query}」的记录。</div>
          )}

          {byStudent.map(({ name, awards, bySubject, byLevel, best }) => (
            <div key={name} className="card">
              <div className="row-spread">
                <h3 className="section-title" style={{ margin: 0 }}>
                  {name}
                  <span className="muted" style={{ fontSize: '0.9rem', fontWeight: 400, marginLeft: 8 }}>
                    共 {awards.length} 项
                  </span>
                </h3>
                <Link to={`/subject/${SUBJECT_MAP[best?.subject]?.slug || 'math'}`} className="btn btn-ghost">
                  查看学科页
                </Link>
              </div>
              <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap', margin: '0.5rem 0' }}>
                {Object.entries(bySubject)
                  .sort((a, b) => b[1] - a[1])
                  .map(([subj, n]) => (
                    <span key={subj} className="award-pill">
                      {SUBJECT_MAP[subj]?.emoji} {subj} · {n}
                    </span>
                  ))}
                {best && (
                  <span className="award-pill award-国家级">
                    最高奖项：{best.award}（{best.contest_name}）
                  </span>
                )}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>学年</th>
                      <th>学科</th>
                      <th>赛事</th>
                      <th>级别</th>
                      <th>奖项</th>
                    </tr>
                  </thead>
                  <tbody>
                    {awards.map(a => (
                      <tr key={a.id}>
                        <td><strong>{a.academic_year}</strong></td>
                        <td>{SUBJECT_MAP[a.subject]?.emoji} {a.subject}</td>
                        <td title={a.contest_name}>{a.contest_name}</td>
                        <td>
                          {a.award_level ? (
                            <span className={`award-pill award-${a.award_level}`}>{a.award_level}</span>
                          ) : <span className="muted">—</span>}
                        </td>
                        <td>{a.award || <span className="muted">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
