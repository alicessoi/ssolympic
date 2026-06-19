import { AWARDS, SUMMARY, YEARS, SUBJECTS, CONTESTS, CATEGORIES } from './data.js'

// 所有 API 同步返回数据（data.js 内嵌），用 Promise.resolve 包装保持原调用方式不变
const isStatic = true

function filterAwards(filters = {}) {
  let rows = AWARDS
  if (filters.subject) rows = rows.filter(r => r.subject === filters.subject)
  if (filters.academic_year) rows = rows.filter(r => r.academic_year === filters.academic_year)
  if (filters.award_level) rows = rows.filter(r => r.award_level === filters.award_level)
  if (filters.award) rows = rows.filter(r => r.award === filters.award)
  if (filters.contest) rows = rows.filter(r => r.contest_name === filters.contest)
  if (filters.keyword) {
    const kw = String(filters.keyword)
    rows = rows.filter(r => (r.student_name || '').includes(kw))
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

const AWARD_RANK = { '一等奖': 1, '金牌': 1, '二等奖': 2, '银牌': 2, '三等奖': 3, '铜牌': 3 }

function applySort(rows, sort, dir) {
  const sign = dir === 'asc' ? 1 : -1
  const cmpStr = (a, b) => sign * String(a).localeCompare(String(b))
  const cmpNum = (a, b) => sign * ((a ?? 0) - (b ?? 0))
  return [...rows].sort((x, y) => {
    if (sort === 'award') return (AWARD_RANK[x.award] ?? 9) - (AWARD_RANK[y.award] ?? 9)
    if (sort === 'award_level') {
      const lv = { '国家级': 4, '省级': 3, '市级': 2, '校级': 1 }
      return (lv[x.award_level] ?? 0) - (lv[y.award_level] ?? 0)
    }
    return cmpStr(x[sort], y[sort])
  })
}

export const api = {
  awards(params = {}) {
    const { page = 1, limit = 50, sort = 'academic_year', dir = 'desc', ...filters } = params
    const all = applySort(filterAwards(filters), sort, dir)
    const start = (page - 1) * limit
    return Promise.resolve({
      data: all.slice(start, start + limit),
      total: all.length,
      page, limit,
      nextPage: start + limit < all.length ? page + 1 : null,
    })
  },
  years(subject) {
    const rows = AWARDS.filter(a => !subject || a.subject === subject)
    const counts = new Map()
    for (const r of rows) if (r.academic_year) counts.set(r.academic_year, (counts.get(r.academic_year) || 0) + 1)
    const years = [...counts.entries()].map(([academic_year, c]) => ({ academic_year, c }))
    years.sort((a, b) => b.academic_year.localeCompare(a.academic_year))
    return Promise.resolve({ data: years })
  },
  contests(subject, academicYear) {
    let rows = AWARDS
    if (subject) rows = rows.filter(r => r.subject === subject)
    if (academicYear) rows = rows.filter(r => r.academic_year === academicYear)
    const counts = new Map()
    for (const r of rows) if (r.contest_name) counts.set(r.contest_name, (counts.get(r.contest_name) || 0) + 1)
    const contests = [...counts.entries()].map(([contest_name, c]) => ({ contest_name, c }))
    contests.sort((a, b) => a.contest_name.localeCompare(b.contest_name))
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
  subjectAwardAggregate({ years, category } = {}) {
    const cfg = CATEGORIES[category]
    if (!cfg) return Promise.resolve({ data: [], columns: [] })
    const rows = buildAggregatedRows({ years: years ? years.join(',') : undefined, category })
    const map = new Map()
    for (const r of rows) {
      const displayCol = cfg.awardMap[r.award]
      if (!displayCol) continue
      if (!map.has(r.subject)) {
        const row = { subject: r.subject }
        for (const a of cfg.cols) row[a] = 0
        row['总人数'] = 0
        map.set(r.subject, row)
      }
      const row = map.get(r.subject)
      row[displayCol] = (row[displayCol] || 0) + r.c
      row['总人数'] += r.c
    }
    return Promise.resolve({
      data: [...map.values()],
      columns: [...cfg.cols, '总人数'],
    })
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
