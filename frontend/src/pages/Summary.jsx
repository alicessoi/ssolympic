import { useEffect, useState, useMemo } from 'react'
import { api, buildAggregatedRows, pivot } from '../api.js'
import * as XLSX from 'xlsx'

const OLYMPIAD_SUBJECTS = ['数学', '物理', '化学', '生物', '信息学']

function exportXlsx(rows, cols, sheetName, filename) {
  const HEADERS = ['学年', '学科', ...cols, '总人数']
  const data = rows.map(r => [r.year, r.subject, ...cols.map(a => r[a]), r['总人数']])
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...data])
  ws['!cols'] = HEADERS.map(() => ({ wch: 10 }))
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

function summaryExport(filter, yearOptions, category) {
  const { range, year, subject } = filter
  const params = { subject, category }
  if (range === 'last3' || range === 'last5') {
    params.years = lastNYears(yearOptions, range === 'last3' ? 3 : 5).join(',')
  } else if (year) {
    params.year = year
  }
  const rows = buildAggregatedRows(params)
  const out = pivot(rows, category)
  const cols = category === 'league'
    ? ['一等奖', '二等奖', '三等奖']
    : category === 'national'
    ? ['金牌', '银牌', '铜牌']
    : ['一等奖', '二等奖', '三等奖', '金牌', '银牌', '铜牌']
  const sheetName = category === 'league' ? '联赛人数' : category === 'national' ? '国赛人数' : '奖项人数'
  const parts = ['ssoi_汇总', sheetName]
  if (params.years) parts.push(`近${params.years.split(',').length}年`)
  else if (params.year) parts.push(params.year)
  if (params.subject) parts.push(params.subject)
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  exportXlsx(out, cols, sheetName, `${parts.join('_')}_${stamp}.xlsx`)
}

export default function Summary() {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 联赛 / 国赛 两张表，各自带 学年+学科 筛选 + 导出
  // range: '' | 'last3' | 'last5' — 优先级高于单 year
  const [leagueFilter, setLeagueFilter] = useState({ year: '', years: '', subject: '', range: '' })
  const [nationalFilter, setNationalFilter] = useState({ year: '', years: '', subject: '', range: '' })
  const [leagueData, setLeagueData] = useState({ data: [], columns: [] })
  const [nationalData, setNationalData] = useState({ data: [], columns: [] })
  const [leagueLoading, setLeagueLoading] = useState(false)
  const [nationalLoading, setNationalLoading] = useState(false)

  const yearOptions = useMemo(() => {
    if (!summary) return []
    return [...new Set(summary.yearCategoryBySubject.map(r => r.academic_year))].sort().reverse()
  }, [summary])

  useEffect(() => {
    setLeagueLoading(true)
    // 发送到后端：range 优先 → years；否则单 year；都不传则全部
    const { range, year, subject } = leagueFilter
    const params = { subject, category: 'league' }
    if (range === 'last3' || range === 'last5') params.years = lastNYears(yearOptions, range === 'last3' ? 3 : 5).join(',')
    else if (year) params.year = year
    api.awardsByYearSubject(params)
      .then(d => setLeagueData(d))
      .catch(e => setError(e.message))
      .finally(() => setLeagueLoading(false))
  }, [leagueFilter, yearOptions])
  useEffect(() => {
    setNationalLoading(true)
    const { range, year, subject } = nationalFilter
    const params = { subject, category: 'national' }
    if (range === 'last3' || range === 'last5') params.years = lastNYears(yearOptions, range === 'last3' ? 3 : 5).join(',')
    else if (year) params.year = year
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
              onChange={e => setLeagueFilter(f => ({ ...f, year: e.target.value, range: '' }))}
              style={{ marginLeft: 4 }}
            >
              <option value="">全部</option>
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <div style={{ display: 'inline-flex', gap: 4 }}>
            {[
              { v: '', label: '全部' },
              { v: 'last3', label: '近 3 年' },
              { v: 'last5', label: '近 5 年' },
            ].map(b => (
              <button
                key={b.v}
                className={`btn ${leagueFilter.range === b.v ? 'btn-accent' : 'btn-ghost'}`}
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.85rem' }}
                onClick={() => setLeagueFilter(f => ({ ...f, range: b.v, year: '' }))}
                disabled={!b.v && !leagueFilter.range}
              >
                {b.label}
              </button>
            ))}
          </div>
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
              onClick={() => setLeagueFilter({ year: '', years: '', subject: '', range: '' })}
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
              onChange={e => setNationalFilter(f => ({ ...f, year: e.target.value, range: '' }))}
              style={{ marginLeft: 4 }}
            >
              <option value="">全部</option>
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <div style={{ display: 'inline-flex', gap: 4 }}>
            {[
              { v: '', label: '全部' },
              { v: 'last3', label: '近 3 年' },
              { v: 'last5', label: '近 5 年' },
            ].map(b => (
              <button
                key={b.v}
                className={`btn ${nationalFilter.range === b.v ? 'btn-accent' : 'btn-ghost'}`}
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.85rem' }}
                onClick={() => setNationalFilter(f => ({ ...f, range: b.v, year: '' }))}
                disabled={!b.v && !nationalFilter.range}
              >
                {b.label}
              </button>
            ))}
          </div>
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
              onClick={() => setNationalFilter({ year: '', years: '', subject: '', range: '' })}
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
    </div>
  )
}

// 从 yearOptions 取最近 N 年（yearOptions 已按降序排列）
function lastNYears(yearOptions, n) {
  return yearOptions.slice(0, n)
}

// 把 filter 状态转成导出 URL 参数（range 优先 → years；否则单 year）
function exportParams(filter, yearOptions, category) {
  const { range, year, subject } = filter
  const params = { subject, category }
  if (range === 'last3' || range === 'last5') {
    params.years = lastNYears(yearOptions, range === 'last3' ? 3 : 5).join(',')
  } else if (year) {
    params.year = year
  }
  return params
}
