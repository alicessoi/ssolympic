import { useEffect, useState, useMemo } from 'react'
import { api, buildAggregatedRows, pivot } from '../api.js'
import * as XLSX from 'xlsx'

const OLYMPIAD_SUBJECTS = ['数学', '物理', '化学', '生物', '信息学']

function exportXlsx(rows, keys, headers, sheetName, filename) {
  const data = rows.map(r => keys.map(k => r[k]))
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data])
  ws['!cols'] = headers.map(() => ({ wch: 10 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function leagueSpec() {
  return {
    keys: ['year', 'subject', '一等奖', '二等奖', '三等奖', '总人数'],
    headers: ['学年', '学科', '一等奖', '二等奖', '三等奖', '总人数'],
  }
}
function nationalSpec() {
  return {
    keys: ['year', 'subject', '金牌', '银牌', '铜牌', '总人数'],
    headers: ['学年', '学科', '金牌', '银牌', '铜牌', '总人数'],
  }
}

function summaryExport(filter, yearOptions, category) {
  const { year, subject } = filter
  const params = { subject, category }
  if (year) params.year = year
  const rows = buildAggregatedRows(params)
  const out = pivot(rows, category)
  const spec = category === 'league' ? leagueSpec() : nationalSpec()
  const sheetName = category === 'league' ? '联赛人数' : '国赛人数'
  const parts = ['ssoi_汇总', sheetName]
  if (params.year) parts.push(params.year)
  if (params.subject) parts.push(params.subject)
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  exportXlsx(out, spec.keys, spec.headers, sheetName, `${parts.join('_')}_${stamp}.xlsx`)
}

function summaryExportSubject(n, category) {
  const allYears = [...new Set(api._allAwards().map(a => a.academic_year).filter(Boolean))].sort().reverse()
  const years = n ? allYears.slice(0, n) : allYears
  api.subjectAwardAggregate({ years, category }).then(out => {
    const spec = category === 'league' ? leagueSpec() : nationalSpec()
    const subjectKeys = ['subject', ...spec.keys.slice(2)]
    const subjectHeaders = ['学科', ...spec.headers.slice(2)]
    const sheetName = category === 'league' ? '联赛人数_近N年' : '国赛人数_近N年'
    const d = new Date()
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    const nLabel = n ? `${n}年` : '全部'
    exportXlsx(out.data, subjectKeys, subjectHeaders, sheetName, `ssoi_${sheetName}_${nLabel}_${stamp}.xlsx`)
  })
}

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

  // 近 N 年聚合（学科 × 奖项），共享 N 筛选
  const [nYears, setNYears] = useState(5)
  const [leagueNAgg, setLeagueNAgg] = useState({ data: [], columns: [] })
  const [nationalNAgg, setNationalNAgg] = useState({ data: [], columns: [] })
  const [leagueNAggLoading, setLeagueNAggLoading] = useState(false)
  const [nationalNAggLoading, setNationalNAggLoading] = useState(false)

  const yearOptions = useMemo(() => {
    if (!summary) return []
    return [...new Set(summary.yearCategoryBySubject.map(r => r.academic_year))].sort().reverse()
  }, [summary])

  useEffect(() => {
    setLeagueLoading(true)
    const { year, subject } = leagueFilter
    const params = { subject, category: 'league' }
    if (year) params.year = year
    api.awardsByYearSubject(params)
      .then(d => setLeagueData(d))
      .catch(e => setError(e.message))
      .finally(() => setLeagueLoading(false))
  }, [leagueFilter, yearOptions])
  useEffect(() => {
    setNationalLoading(true)
    const { year, subject } = nationalFilter
    const params = { subject, category: 'national' }
    if (year) params.year = year
    api.awardsByYearSubject(params)
      .then(d => setNationalData(d))
      .catch(e => setError(e.message))
      .finally(() => setNationalLoading(false))
  }, [nationalFilter, yearOptions])

  useEffect(() => {
    api.summary()
      .then(d => setSummary(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // 近 N 年聚合：根据 nYears 取最近 N 个有数据的学年
  const recentYears = useMemo(() => {
    if (!yearOptions.length) return []
    return nYears ? yearOptions.slice(0, nYears) : yearOptions
  }, [yearOptions, nYears])

  useEffect(() => {
    if (!recentYears.length) return
    setLeagueNAggLoading(true)
    api.subjectAwardAggregate({ years: recentYears, category: 'league' })
      .then(d => setLeagueNAgg(d))
      .catch(e => setError(e.message))
      .finally(() => setLeagueNAggLoading(false))
  }, [recentYears])
  useEffect(() => {
    if (!recentYears.length) return
    setNationalNAggLoading(true)
    api.subjectAwardAggregate({ years: recentYears, category: 'national' })
      .then(d => setNationalNAgg(d))
      .catch(e => setError(e.message))
      .finally(() => setNationalNAggLoading(false))
  }, [recentYears])

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
            onClick={() => summaryExport(leagueFilter, yearOptions, 'league')}
            disabled={!leagueData.data?.length}
          >
            导出
          </button>
        </div>
        <p className="muted" style={{ fontSize: '0.8rem', margin: '0.25rem 0 0.75rem' }}>
          仅统计「省级」记录（联赛），奖项统一为 一/二/三。
        </p>
        <div className="row" style={{ gap: '1rem', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <label>学年：
            <select
              value={leagueFilter.year}
              onChange={e => setLeagueFilter(f => ({ ...f, year: e.target.value }))}
              style={{ marginLeft: 4 }}
            >
              <option value="">全部</option>
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label>学科：
            <select
              value={leagueFilter.subject}
              onChange={e => setLeagueFilter(f => ({ ...f, subject: e.target.value }))}
              style={{ marginLeft: 4 }}
            >
              <option value="">全部</option>
              {OLYMPIAD_SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          {(leagueFilter.year || leagueFilter.subject || leagueFilter.range) && (
            <button
              className="btn btn-ghost"
              onClick={() => setLeagueFilter({ year: '', subject: '' })}
            >
              清除
            </button>
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
            onClick={() => summaryExport(nationalFilter, yearOptions, 'national')}
            disabled={!nationalData.data?.length}
          >
            导出
          </button>
        </div>
        <p className="muted" style={{ fontSize: '0.8rem', margin: '0.25rem 0 0.75rem' }}>
          仅统计「国家级」记录（CMO/CPHO/CChO/CBO/NOI 五项国赛），奖项为 金/银/铜 原始值。
        </p>
        <div className="row" style={{ gap: '1rem', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <label>学年：
            <select
              value={nationalFilter.year}
              onChange={e => setNationalFilter(f => ({ ...f, year: e.target.value }))}
              style={{ marginLeft: 4 }}
            >
              <option value="">全部</option>
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label>学科：
            <select
              value={nationalFilter.subject}
              onChange={e => setNationalFilter(f => ({ ...f, subject: e.target.value }))}
              style={{ marginLeft: 4 }}
            >
              <option value="">全部</option>
              {OLYMPIAD_SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          {(nationalFilter.year || nationalFilter.subject || nationalFilter.range) && (
            <button
              className="btn btn-ghost"
              onClick={() => setNationalFilter({ year: '', subject: '' })}
            >
              清除
            </button>
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

      {/* 近 N 年聚合：共享的 N 筛选器 */}
      <div className="card" style={{ background: 'transparent', border: 'none', padding: 0 }}>
        <div className="row" style={{ alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <strong>近 N 年聚合：</strong>
          <label>近
            <select
              value={nYears ?? 'all'}
              onChange={e => setNYears(e.target.value === 'all' ? null : Number(e.target.value))}
              style={{ margin: '0 4px' }}
            >
              <option value="3">3</option>
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="all">全部</option>
            </select>
            年
          </label>
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            取最近 {nYears ?? '全部'} 个有数据的学年，统计每个学科的累计获奖数。
          </span>
        </div>
      </div>

      {/* 联赛（近 N 年）奖项人数 · 学科 × 奖项 */}
      <div className="card">
        <div className="row-spread">
          <h2 className="section-title" style={{ margin: 0 }}>联赛（近 N 年）奖项人数 · 学科 × 奖项</h2>
          <button
            className="btn btn-accent"
            onClick={() => summaryExportSubject(nYears, 'league')}
            disabled={!leagueNAgg.data?.length}
          >
            导出
          </button>
        </div>
        <p className="muted" style={{ fontSize: '0.8rem', margin: '0.25rem 0 0.75rem' }}>
          仅统计「省级」记录，按近 N 年聚合，每个学科 1 行。
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>学科</th>
                {leagueNAgg.columns?.filter(c => c !== '总人数').map(c => (
                  <th key={c} style={{ textAlign: 'right' }}>{c}</th>
                ))}
                <th style={{ textAlign: 'right' }}>总人数</th>
              </tr>
            </thead>
            <tbody>
              {leagueNAgg.data?.length ? (
                <>
                  {leagueNAgg.data.map((r, i) => (
                    <tr key={i}>
                      <td><strong>{r.subject}</strong></td>
                      {leagueNAgg.columns.filter(c => c !== '总人数').map(c => (
                        <td key={c} style={{ textAlign: 'right', color: r[c] === 0 ? '#a0aec0' : undefined }}>
                          {r[c] === 0 ? '—' : r[c]}
                        </td>
                      ))}
                      <td style={{ textAlign: 'right' }}><strong>{r['总人数']}</strong></td>
                    </tr>
                  ))}
                  {(() => {
                    const t = leagueNAgg.columns.reduce(
                      (acc, c) => ({ ...acc, [c]: leagueNAgg.data.reduce((s, r) => s + (r[c] || 0), 0) }),
                      {}
                    )
                    return (
                      <tr style={{ fontWeight: 600, background: 'rgba(49,130,206,0.06)' }}>
                        <td>合计</td>
                        {leagueNAgg.columns.filter(c => c !== '总人数').map(c => (
                          <td key={c} style={{ textAlign: 'right' }}>{t[c]}</td>
                        ))}
                        <td style={{ textAlign: 'right' }}>{t['总人数']}</td>
                      </tr>
                    )
                  })()}
                </>
              ) : (
                <tr><td colSpan={5} className="empty">{leagueNAggLoading ? '加载中…' : '无数据'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 国赛（近 N 年）奖项人数 · 学科 × 奖项 */}
      <div className="card">
        <div className="row-spread">
          <h2 className="section-title" style={{ margin: 0 }}>国赛（近 N 年）奖项人数 · 学科 × 奖项</h2>
          <button
            className="btn btn-accent"
            onClick={() => summaryExportSubject(nYears, 'national')}
            disabled={!nationalNAgg.data?.length}
          >
            导出
          </button>
        </div>
        <p className="muted" style={{ fontSize: '0.8rem', margin: '0.25rem 0 0.75rem' }}>
          仅统计「国家级」记录（CMO/CPHO/CChO/CBO/NOI），按近 N 年聚合，每个学科 1 行。
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>学科</th>
                {nationalNAgg.columns?.filter(c => c !== '总人数').map(c => (
                  <th key={c} style={{ textAlign: 'right' }}>{c}</th>
                ))}
                <th style={{ textAlign: 'right' }}>总人数</th>
              </tr>
            </thead>
            <tbody>
              {nationalNAgg.data?.length ? (
                <>
                  {nationalNAgg.data.map((r, i) => (
                    <tr key={i}>
                      <td><strong>{r.subject}</strong></td>
                      {nationalNAgg.columns.filter(c => c !== '总人数').map(c => (
                        <td key={c} style={{ textAlign: 'right', color: r[c] === 0 ? '#a0aec0' : undefined }}>
                          {r[c] === 0 ? '—' : r[c]}
                        </td>
                      ))}
                      <td style={{ textAlign: 'right' }}><strong>{r['总人数']}</strong></td>
                    </tr>
                  ))}
                  {(() => {
                    const t = nationalNAgg.columns.reduce(
                      (acc, c) => ({ ...acc, [c]: nationalNAgg.data.reduce((s, r) => s + (r[c] || 0), 0) }),
                      {}
                    )
                    return (
                      <tr style={{ fontWeight: 600, background: 'rgba(49,130,206,0.06)' }}>
                        <td>合计</td>
                        {nationalNAgg.columns.filter(c => c !== '总人数').map(c => (
                          <td key={c} style={{ textAlign: 'right' }}>{t[c]}</td>
                        ))}
                        <td style={{ textAlign: 'right' }}>{t['总人数']}</td>
                      </tr>
                    )
                  })()}
                </>
              ) : (
                <tr><td colSpan={5} className="empty">{nationalNAggLoading ? '加载中…' : '无数据'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
