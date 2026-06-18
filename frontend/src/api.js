import { AWARDS, SUMMARY, YEARS, SUBJECTS, CONTESTS, CATEGORIES } from './data.js'

// 所有 API 同步返回数据（data.js 内嵌），用 Promise.resolve 包装保持原调用方式不变
const isStatic = true

function filterAwards(filters = {}) {
  let rows = AWARDS
  if (filters.subject) rows = rows.filter(r => r.subject === filters.subject)
  if (filters.academic_year) rows = rows.filter(r => r.academic_year === filters.academic_year)
  if (filters.award_level) rows = rows.filter(r => r.award_level === filters.award_level)
  if (filters.award) rows = rows.filter(r => r.award === filters.award)
  if (filters.keyword) {
    const kw = String(filters.keyword)
    rows = rows.filter(r =>
      (r.student_name || '').includes(kw) ||
      (r.instructor || '').includes(kw) ||
      (r.contest_name || '').includes(kw)
    )
  }
  return rows
}

function buildAggregatedRows({ year, years, subject, category }) {
  let rows = AWARDS.filter(a => a.academic_year)
  if (years) {
    const list = String(years).split(',').map(s => s.trim()).filter(Boolean)
    if (list.length) rows = rows.filter(r => list.includes(r.academic_year))
  } else if (year) {
    rows = rows.filter(r => r.academic_year === year)
  }
  if (subject) rows = rows.filter(r => r.subject === subject)
  if (category && CATEGORIES[category]) {
    rows = rows.filter(r => r.award_level === CATEGORIES[category].level)
  }
  // 聚合 (year, subject, award)
  const map = new Map()
  for (const r of rows) {
    const k = `${r.academic_year}|${r.subject}|${r.award}`
    map.set(k, (map.get(k) || 0) + 1)
  }
  return [...map.entries()].map(([k, c]) => {
    const [academic_year, subject, award] = k.split('|')
    return { academic_year, subject, award, c }
  })
}

function pivot(rows, category) {
  const cfg = category && CATEGORIES[category]
  const cols = cfg ? cfg.cols : ['一等奖', '二等奖', '三等奖', '金牌', '银牌', '铜牌']
  const awardMap = cfg ? cfg.awardMap : {
    '一等奖': '一等奖', '二等奖': '二等奖', '三等奖': '三等奖',
    '金牌': '金牌', '银牌': '银牌', '铜牌': '铜牌',
  }
  const map = new Map()
  for (const r of rows) {
    const displayCol = awardMap[r.award]
    if (!displayCol) continue
    const key = `${r.academic_year}|${r.subject}`
    if (!map.has(key)) {
      const row = { year: r.academic_year, subject: r.subject }
      for (const a of cols) row[a] = 0
      row['总人数'] = 0
      map.set(key, row)
    }
    const row = map.get(key)
    row[displayCol] = (row[displayCol] || 0) + r.c
    row['总人数'] += r.c
  }
  return [...map.values()]
    .sort((a, b) => b.year.localeCompare(a.year) || a.subject.localeCompare(b.subject))
    .map(r => {
      for (const a of ['一等奖', '二等奖', '三等奖', '金牌', '银牌', '铜牌']) {
        if (!(a in r)) r[a] = 0
      }
      return r
    })
}

export const api = {
  awards(params = {}) {
    const { page = 1, limit = 50, ...filters } = params
    const all = filterAwards(filters)
    const start = (page - 1) * limit
    return Promise.resolve({
      data: all.slice(start, start + limit),
      total: all.length,
      page, limit,
      nextPage: start + limit < all.length ? page + 1 : null,
    })
  },
  years(subject) {
    const years = [...new Set(AWARDS.filter(a => !subject || a.subject === subject).map(a => a.academic_year))]
      .filter(Boolean).sort().reverse()
    return Promise.resolve({ data: years })
  },
  contests(subject, academicYear) {
    let rows = AWARDS
    if (subject) rows = rows.filter(r => r.subject === subject)
    if (academicYear) rows = rows.filter(r => r.academic_year === academicYear)
    const contests = [...new Set(rows.map(r => r.contest_name))].filter(Boolean).sort()
    return Promise.resolve({ data: contests })
  },
  summary() {
    return Promise.resolve(SUMMARY)
  },
  awardsByYearSubject(params = {}) {
    const { year, years, subject, category } = params
    const rows = buildAggregatedRows({ year, years, subject, category })
    const out = pivot(rows, category)
    const cols = category && CATEGORIES[category]
      ? CATEGORIES[category].cols
      : ['一等奖', '二等奖', '三等奖', '金牌', '银牌', '铜牌']
    return Promise.resolve({ data: out, columns: [...cols, '总人数'] })
  },
  // 静态模式没有 URL；前端用 xlsx 库客户端导出
  awardsByYearSubjectExportUrl() { return null },
  exportUrl() { return null },
  // 静态模式登录为本地 mock
  login(username, password) {
    if (username && password) {
      return Promise.resolve({ user: { username, role: 'admin' }, token: 'static' })
    }
    return Promise.reject(new Error('用户名和密码不能为空'))
  },
  logout() { return Promise.resolve({ ok: true }) },
  me() {
    try {
      const cached = JSON.parse(localStorage.getItem('ssoi_user') || 'null')
      return Promise.resolve(cached ? { user: cached } : { user: null })
    } catch { return Promise.resolve({ user: null }) }
  },
  // 暴露原始数据，供客户端导出
  _allAwards: () => AWARDS,
  _columnsFor: (category) => category && CATEGORIES[category] ? CATEGORIES[category].cols : ['一等奖', '二等奖', '三等奖', '金牌', '银牌', '铜牌'],
}

export { isStatic }
export { filterAwards }
export { buildAggregatedRows, pivot }
