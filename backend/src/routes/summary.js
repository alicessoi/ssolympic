import { Router } from 'express'
import { db } from '../db.js'
import { awardsRateLimit } from '../middleware/rateLimit.js'

const router = Router()

// 从 contest_name 推断学科（数据里有 146 条 subject 字段与 contest_name 不一致，
// 比如 subject=生物 但 contest_name 包含"物理"。这里以 contest_name 为准）
// 注意：用 '%生物学%' 而非 '%生物%' 排除，避免 "全国中学生物理奥林匹克联赛"
// 被 "中+学生+物" 子串误判为生物
const SUBJECT_SQL = `
  CASE
    -- 生物先抓（含"生物学"，避免与物理/化学的"生物"子串冲突）
    WHEN contest_name LIKE '%全国中学生生物学%' OR contest_name LIKE '%生物学奥林匹克%' OR contest_name LIKE '%中学生生物学%' THEN '生物'
    WHEN contest_name LIKE '%物理%' AND contest_name NOT LIKE '%生物学%' THEN '物理'
    WHEN contest_name LIKE '%化学%' AND contest_name NOT LIKE '%物理%' AND contest_name NOT LIKE '%生物学%' THEN '化学'
    WHEN contest_name LIKE '%数学%' AND contest_name NOT LIKE '%物理%' AND contest_name NOT LIKE '%生物学%' AND contest_name NOT LIKE '%化学%' THEN '数学'
    WHEN contest_name LIKE '%信息学%' OR contest_name LIKE '%CSP%' OR contest_name LIKE '%NOI%'
         OR contest_name LIKE '%NOIP%' OR contest_name LIKE '%计算机%' OR contest_name LIKE '%程序设计%' THEN '信息学'
    ELSE subject
  END
`

// 10 项规范赛事名（与 import_xlsx.mjs 的 CONTEST_SYNONYMS 同步）
const NATIONAL_CONTESTS = new Set([
  '中国数学奥林匹克',                  // 数学 国赛（CMO）
  '中国物理奥林匹克',                  // 物理 国赛（CPHO）
  '中国化学奥林匹克',                  // 化学 国赛（CChO）
  '中国生物学奥林匹克',                // 生物 国赛（CBO）
  '全国青少年信息学奥林匹克竞赛',      // 信息学 国赛（NOI）
])
const LEAGUE_CONTESTS = new Set([
  '全国中学生数学奥林匹克联赛',        // 数学 联赛
  '全国中学生物理奥林匹克联赛',        // 物理 联赛
  '全国中学生化学奥林匹克联赛',        // 化学 联赛
  '全国中学生生物学奥林匹克联赛',      // 生物 联赛
  '全国青少年信息学奥林匹克联赛',      // 信息学 联赛（NOIP）
])

// 国赛 / 联赛 / 其他 三级分类（LIKE 前缀匹配，国赛 "（CMO2024）" + 联赛 "（2024）" 都兼容）
const CATEGORY_SQL = `
  CASE
    WHEN ${[...NATIONAL_CONTESTS].map(n => `contest_name LIKE '${n}%'`).join(' OR ')} THEN '国赛'
    WHEN ${[...LEAGUE_CONTESTS].map(n => `contest_name LIKE '${n}%'`).join(' OR ')} THEN '联赛'
    ELSE '其他'
  END
`

router.get('/', awardsRateLimit, (req, res) => {
  try {
    const byYear = db
      .prepare(
        `SELECT academic_year, subject, COUNT(*) AS c FROM awards
         WHERE academic_year IS NOT NULL
         GROUP BY academic_year, subject
         ORDER BY academic_year DESC`
      )
      .all()

    const bySubject = db
      .prepare(
        `SELECT subject, COUNT(*) AS c FROM awards GROUP BY subject ORDER BY c DESC`
      )
      .all()

    const byAward = db
      .prepare(
        `SELECT subject, award_level, award, COUNT(*) AS c FROM awards
         WHERE award_level IS NOT NULL
         GROUP BY subject, award_level, award
         ORDER BY subject, c DESC`
      )
      .all()

    // 国赛/联赛/其他 按推断学科聚合（别名避免与原 subject/category 列同名冲突）
    const byCategory = db
      .prepare(
        `SELECT ${SUBJECT_SQL} AS subj, ${CATEGORY_SQL} AS cat, COUNT(*) AS c
         FROM awards
         GROUP BY subj, cat
         ORDER BY subj, cat`
      )
      .all()
      .map(r => ({ subject: r.subj, category: r.cat, c: r.c }))

    // 各 category 下的赛事名（用于前端展示 "其他" 里都有啥）
    const othersByContest = db
      .prepare(
        `SELECT ${SUBJECT_SQL} AS subj, contest_name, COUNT(*) AS c
         FROM awards
         WHERE ${CATEGORY_SQL} = '其他'
         GROUP BY subj, contest_name
         ORDER BY subj, c DESC`
      )
      .all()
      .map(r => ({ subject: r.subj, contest_name: r.contest_name, c: r.c }))

    // 学年 × 学科 × category 三维聚合（前端用 yearCategoryBySubject 摊平）
    const yearCategoryBySubject = db
      .prepare(
        `SELECT academic_year, ${SUBJECT_SQL} AS subj, ${CATEGORY_SQL} AS cat, COUNT(*) AS c
         FROM awards
         WHERE academic_year IS NOT NULL
         GROUP BY academic_year, subj, cat
         ORDER BY academic_year DESC, subj, cat`
      )
      .all()
      .map(r => ({ academic_year: r.academic_year, subject: r.subj, category: r.cat, c: r.c }))

    // 学年 × 学科 × 级别 × 奖项 四维聚合
    // 国赛：金牌/银牌/铜牌 映射到 一等奖/二等奖/三等奖（前端表头统一）
    // 联赛：直接用 一等奖/二等奖/三等奖
    const yearSubjectAward = db
      .prepare(
        `SELECT academic_year, ${SUBJECT_SQL} AS subj,
                CASE
                  WHEN award_level = '国家级' THEN '国赛'
                  WHEN award_level = '省级' THEN '联赛'
                  ELSE '其他'
                END AS cat,
                CASE
                  WHEN award IN ('金牌','一等奖') THEN '一等奖'
                  WHEN award IN ('银牌','二等奖') THEN '二等奖'
                  WHEN award IN ('铜牌','三等奖') THEN '三等奖'
                  ELSE COALESCE(award, '未填')
                END AS award_norm,
                COUNT(*) AS c
         FROM awards
         WHERE academic_year IS NOT NULL
         GROUP BY academic_year, subj, cat, award_norm
         ORDER BY academic_year DESC, subj, cat, award_norm`
      )
      .all()
      .map(r => ({
        academic_year: r.academic_year,
        subject: r.subj,
        category: r.cat,
        award: r.award_norm,
        c: r.c,
      }))

    res.json({ byYear, bySubject, byAward, byCategory, othersByContest, yearCategoryBySubject, yearSubjectAward })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'server_error', message: e.message })
  }
})

// 筛选：学年 + 学科 + 类别（联赛/国赛/全部）
// 统计：每个 (学年, 学科) 组合的 一/二/三/金/银/铜 原始奖项计数（不归一化）
// 用途：汇总页"按年度+学科筛奖项人数" + 导出（联赛 / 国赛 分两张表）
const FILTER_SUBJECTS = new Set(['数学', '物理', '化学', '生物', '信息学'])
const CATEGORIES = {
  // 联赛：DB 中存"一/二/三"为主，按原始值聚合
  league:   { level: '省级', cols: ['一等奖', '二等奖', '三等奖'], label: '联赛',
              awardMap: { '一等奖': '一等奖', '二等奖': '二等奖', '三等奖': '三等奖' } },
  // 国赛：DB 中 87 条是"一/二/三"（import 归一化遗留）+ 2 条"银牌"
  // 聚合时把"一/二/三"映射回"金/银/铜"展示
  national: { level: '国家级', cols: ['金牌', '银牌', '铜牌'], label: '国赛',
              awardMap: { '金牌': '金牌', '银牌': '银牌', '铜牌': '铜牌',
                          '一等奖': '金牌', '二等奖': '银牌', '三等奖': '铜牌' } },
}

function buildAggregatedRows(filters) {
  const { year, years, subject, category } = filters
  const where = ['academic_year IS NOT NULL']
  const params = {}
  if (years) {
    // years: 逗号分隔的学年列表（如 "2022-2023,2023-2024,2024-2025"）
    const list = String(years).split(',').map(s => s.trim()).filter(Boolean)
    if (list.length) {
      const placeholders = list.map((_, i) => `@y${i}`).join(', ')
      where.push(`academic_year IN (${placeholders})`)
      list.forEach((y, i) => { params[`y${i}`] = y })
    }
  } else if (year) {
    where.push('academic_year = @year')
    params.year = year
  }
  if (subject) {
    where.push('subject = @subject')
    params.subject = subject
  }
  if (category && CATEGORIES[category]) {
    where.push('award_level = @level')
    params.level = CATEGORIES[category].level
  }
  const whereSql = `WHERE ${where.join(' AND ')}`
  const rows = db
    .prepare(
      `SELECT academic_year, subject, award, COUNT(*) AS c
       FROM awards ${whereSql}
       GROUP BY academic_year, subject, award
       ORDER BY academic_year DESC, subject, award`
    )
    .all(params)
  return rows
}

function pivot(rows, category) {
  const cfg = category && CATEGORIES[category]
  const cols = cfg ? cfg.cols : ['一等奖', '二等奖', '三等奖', '金牌', '银牌', '铜牌']
  // awardMap 把 DB 中的原始 award 值映射到展示列
  // 国赛：DB 中 87 条是"一/二/三"（import 归一化遗留），要映射成"金/银/铜"
  // 联赛：DB 中主要是"一/二/三"，原样
  const awardMap = cfg ? cfg.awardMap : {
    '一等奖': '一等奖', '二等奖': '二等奖', '三等奖': '三等奖',
    '金牌': '金牌', '银牌': '银牌', '铜牌': '铜牌',
  }
  const map = new Map()
  for (const r of rows) {
    const displayCol = awardMap[r.award]
    if (!displayCol) continue  // 不在展示列范围内的 award 跳过
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
    .sort((a, b) => {
      if (a.year !== b.year) return b.year.localeCompare(a.year)
      return a.subject.localeCompare(b.subject)
    })
    .map(r => {
      for (const a of ['一等奖', '二等奖', '三等奖', '金牌', '银牌', '铜牌']) {
        if (!(a in r)) r[a] = 0
      }
      return r
    })
}

router.get('/awards-by-year-subject', (req, res) => {
  try {
    const { year, years, subject, category } = req.query
    if (subject && !FILTER_SUBJECTS.has(subject)) {
      return res.status(400).json({ error: 'bad_request', message: 'invalid subject' })
    }
    if (category && !CATEGORIES[category]) {
      return res.status(400).json({ error: 'bad_request', message: 'invalid category' })
    }
    const rows = buildAggregatedRows({ year, years, subject, category })
    const out = pivot(rows, category)
    const cols = category && CATEGORIES[category]
      ? CATEGORIES[category].cols
      : ['一等奖', '二等奖', '三等奖', '金牌', '银牌', '铜牌']
    res.json({ data: out, columns: [...cols, '总人数'] })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'server_error', message: e.message })
  }
})

router.get('/awards-by-year-subject/export', async (req, res) => {
  try {
    const { year, years, subject, category } = req.query
    if (subject && !FILTER_SUBJECTS.has(subject)) {
      return res.status(400).json({ error: 'bad_request', message: 'invalid subject' })
    }
    if (category && !CATEGORIES[category]) {
      return res.status(400).json({ error: 'bad_request', message: 'invalid category' })
    }
    const rows = buildAggregatedRows({ year, years, subject, category })
    const out = pivot(rows, category)
    const cols = category && CATEGORIES[category]
      ? CATEGORIES[category].cols
      : ['一等奖', '二等奖', '三等奖', '金牌', '银牌', '铜牌']
    const HEADERS = ['学年', '学科', ...cols, '总人数']
    const data = out.map(r => [r.year, r.subject, ...cols.map(a => r[a]), r['总人数']])
    const xlsx = await import('xlsx')
    const xlsxModule = xlsx.default || xlsx
    const ws = xlsxModule.utils.aoa_to_sheet([HEADERS, ...data])
    ws['!cols'] = HEADERS.map(() => ({ wch: 10 }))
    const wb = xlsxModule.utils.book_new()
    const sheetName = category === 'league' ? '联赛人数'
      : category === 'national' ? '国赛人数'
      : '奖项人数'
    xlsxModule.utils.book_append_sheet(wb, ws, sheetName)
    const buf = xlsxModule.write(wb, { type: 'buffer', bookType: 'xlsx' })

    const parts = ['ssoi_汇总', category === 'league' ? '联赛' : category === 'national' ? '国赛' : '奖项']
    if (years) {
      const n = String(years).split(',').length
      parts.push(`近${n}年`)
    } else if (year) parts.push(year)
    if (subject) parts.push(subject)
    const d = new Date()
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    const filename = `${parts.join('_')}_${stamp}.xlsx`
    const asciiName = filename.replace(/[^\x20-\x7E]/g, '_')
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    )
    res.send(buf)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'server_error', message: e.message })
  }
})

export default router