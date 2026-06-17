import { useEffect, useState, useMemo } from 'react'
import { api } from '../api.js'

const OLYMPIAD_SUBJECTS = ['数学', '物理', '化学', '生物', '信息学']

export default function Summary() {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 联赛 / 国赛 两张表，各自带 学年+学科 筛选 + 导出
  const [leagueFilter, setLeagueFilter] = useState({ year: '', subject: '' })
  const [nationalFilter, setNationalFilter] = useState({ year: '', subject: '' })
  const [leagueData, setLeagueData] = useState({ data: [], columns: [] })
  const [nationalData, setNationalData] = useState({ data: [], columns: [] })
  const [leagueLoading, setLeagueLoading] = useState(false)
  const [nationalLoading, setNationalLoading] = useState(false)
  useEffect(() => {
    setLeagueLoading(true)
    api.awardsByYearSubject({ ...leagueFilter, category: 'league' })
      .then(d => setLeagueData(d))
      .catch(e => setError(e.message))
      .finally(() => setLeagueLoading(false))
  }, [leagueFilter])
  useEffect(() => {
    setNationalLoading(true)
    api.awardsByYearSubject({ ...nationalFilter, category: 'national' })
      .then(d => setNationalData(d))
      .catch(e => setError(e.message))
      .finally(() => setNationalLoading(false))
  }, [nationalFilter])

  const yearOptions = useMemo(() => {
    if (!summary) return []
    return [...new Set(summary.yearCategoryBySubject.map(r => r.academic_year))].sort().reverse()
  }, [summary])

  useEffect(() => {
    api.summary()
      .then(d => setSummary(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="empty">加载中…</div>
  if (error) return <div className="error-msg">{error}</div>
  if (!summary) return null

  return (
    <div>
      <h1 className="page-title">跨学科汇总</h1>

      {/* 联赛（省赛）奖项人数 · 学年 × 学科 */}
      <div className="card">
        <div className="row-spread">
          <h2 className="section-title" style={{ margin: 0 }}>联赛（省赛）奖项人数 · 学年 × 学科</h2>
          <button
            className="btn btn-accent"
            onClick={() => window.open(
              api.awardsByYearSubjectExportUrl({ ...leagueFilter, category: 'league' }),
              '_blank'
            )}
            disabled={!leagueData.data?.length}
          >
            导出
          </button>
        </div>
        <p className="muted" style={{ fontSize: '0.8rem', margin: '0.25rem 0 0.75rem' }}>
          仅统计「省级」记录（联赛），奖项统一为 一/二/三。
        </p>
        <div className="row" style={{ gap: '1rem', alignItems: 'center', marginBottom: '0.75rem' }}>
          <label>学年：
            <select value={leagueFilter.year} onChange={e => setLeagueFilter(f => ({ ...f, year: e.target.value }))} style={{ marginLeft: 4 }}>
              <option value="">全部</option>
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label>学科：
            <select value={leagueFilter.subject} onChange={e => setLeagueFilter(f => ({ ...f, subject: e.target.value }))} style={{ marginLeft: 4 }}>
              <option value="">全部</option>
              {OLYMPIAD_SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          {(leagueFilter.year || leagueFilter.subject) && (
            <button className="btn btn-ghost" onClick={() => setLeagueFilter({ year: '', subject: '' })}>清除</button>
          )}
          <span className="muted" style={{ marginLeft: 'auto', fontSize: '0.85rem' }}>
            {leagueLoading ? '加载中…' : `共 ${leagueData.data?.length || 0} 行`}
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>学年</th>
                <th>学科</th>
                {leagueData.columns?.filter(c => c !== '总人数').map(c => (
                  <th key={c} style={{ textAlign: 'right' }}>{c}</th>
                ))}
                <th style={{ textAlign: 'right' }}>总人数</th>
              </tr>
            </thead>
            <tbody>
              {leagueData.data?.length ? (
                <>
                  {leagueData.data.map((r, i) => (
                    <tr key={i}>
                      <td><strong>{r.year}</strong></td>
                      <td>{r.subject}</td>
                      {leagueData.columns.filter(c => c !== '总人数').map(c => (
                        <td key={c} style={{ textAlign: 'right', color: r[c] === 0 ? '#a0aec0' : undefined }}>
                          {r[c] === 0 ? '—' : r[c]}
                        </td>
                      ))}
                      <td style={{ textAlign: 'right' }}><strong>{r['总人数']}</strong></td>
                    </tr>
                  ))}
                  {(() => {
                    const t = leagueData.columns.reduce(
                      (acc, c) => ({ ...acc, [c]: leagueData.data.reduce((s, r) => s + (r[c] || 0), 0) }),
                      {}
                    )
                    return (
                      <tr style={{ fontWeight: 600, background: 'rgba(49,130,206,0.06)' }}>
                        <td colSpan={2}>合计</td>
                        {leagueData.columns.filter(c => c !== '总人数').map(c => (
                          <td key={c} style={{ textAlign: 'right' }}>{t[c]}</td>
                        ))}
                        <td style={{ textAlign: 'right' }}>{t['总人数']}</td>
                      </tr>
                    )
                  })()}
                </>
              ) : (
                <tr><td colSpan={5} className="empty">{leagueLoading ? '加载中…' : '无数据'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 国赛奖项人数 · 学年 × 学科 */}
      <div className="card">
        <div className="row-spread">
          <h2 className="section-title" style={{ margin: 0 }}>国赛奖项人数 · 学年 × 学科</h2>
          <button
            className="btn btn-accent"
            onClick={() => window.open(
              api.awardsByYearSubjectExportUrl({ ...nationalFilter, category: 'national' }),
              '_blank'
            )}
            disabled={!nationalData.data?.length}
          >
            导出
          </button>
        </div>
        <p className="muted" style={{ fontSize: '0.8rem', margin: '0.25rem 0 0.75rem' }}>
          仅统计「国家级」记录（CMO/CPHO/CChO/CBO/NOI 五项国赛），奖项为 金/银/铜 原始值。
        </p>
        <div className="row" style={{ gap: '1rem', alignItems: 'center', marginBottom: '0.75rem' }}>
          <label>学年：
            <select value={nationalFilter.year} onChange={e => setNationalFilter(f => ({ ...f, year: e.target.value }))} style={{ marginLeft: 4 }}>
              <option value="">全部</option>
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label>学科：
            <select value={nationalFilter.subject} onChange={e => setNationalFilter(f => ({ ...f, subject: e.target.value }))} style={{ marginLeft: 4 }}>
              <option value="">全部</option>
              {OLYMPIAD_SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          {(nationalFilter.year || nationalFilter.subject) && (
            <button className="btn btn-ghost" onClick={() => setNationalFilter({ year: '', subject: '' })}>清除</button>
          )}
          <span className="muted" style={{ marginLeft: 'auto', fontSize: '0.85rem' }}>
            {nationalLoading ? '加载中…' : `共 ${nationalData.data?.length || 0} 行`}
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>学年</th>
                <th>学科</th>
                {nationalData.columns?.filter(c => c !== '总人数').map(c => (
                  <th key={c} style={{ textAlign: 'right' }}>{c}</th>
                ))}
                <th style={{ textAlign: 'right' }}>总人数</th>
              </tr>
            </thead>
            <tbody>
              {nationalData.data?.length ? (
                <>
                  {nationalData.data.map((r, i) => (
                    <tr key={i}>
                      <td><strong>{r.year}</strong></td>
                      <td>{r.subject}</td>
                      {nationalData.columns.filter(c => c !== '总人数').map(c => (
                        <td key={c} style={{ textAlign: 'right', color: r[c] === 0 ? '#a0aec0' : undefined }}>
                          {r[c] === 0 ? '—' : r[c]}
                        </td>
                      ))}
                      <td style={{ textAlign: 'right' }}><strong>{r['总人数']}</strong></td>
                    </tr>
                  ))}
                  {(() => {
                    const t = nationalData.columns.reduce(
                      (acc, c) => ({ ...acc, [c]: nationalData.data.reduce((s, r) => s + (r[c] || 0), 0) }),
                      {}
                    )
                    return (
                      <tr style={{ fontWeight: 600, background: 'rgba(49,130,206,0.06)' }}>
                        <td colSpan={2}>合计</td>
                        {nationalData.columns.filter(c => c !== '总人数').map(c => (
                          <td key={c} style={{ textAlign: 'right' }}>{t[c]}</td>
                        ))}
                        <td style={{ textAlign: 'right' }}>{t['总人数']}</td>
                      </tr>
                    )
                  })()}
                </>
              ) : (
                <tr><td colSpan={5} className="empty">{nationalLoading ? '加载中…' : '无数据'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
