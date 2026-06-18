// 把 SQLite 数据导出为 frontend/src/data.js，让前端构建时打包进 bundle
// 用法：node scripts/dump_static.mjs
import Database from 'better-sqlite3'
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DB_PATH = path.resolve(ROOT, 'backend/data/ssoi.db')
const OUT = path.resolve(ROOT, 'frontend/src/data.js')

const SUBJECT_SQL = `
  CASE
    WHEN contest_name LIKE '%全国中学生生物学%' OR contest_name LIKE '%生物学奥林匹克%' OR contest_name LIKE '%中学生生物学%' THEN '生物'
    WHEN contest_name LIKE '%物理%' AND contest_name NOT LIKE '%生物学%' THEN '物理'
    WHEN contest_name LIKE '%化学%' AND contest_name NOT LIKE '%物理%' AND contest_name NOT LIKE '%生物学%' THEN '化学'
    WHEN contest_name LIKE '%数学%' AND contest_name NOT LIKE '%物理%' AND contest_name NOT LIKE '%生物学%' AND contest_name NOT LIKE '%化学%' THEN '数学'
    WHEN contest_name LIKE '%信息学%' OR contest_name LIKE '%CSP%' OR contest_name LIKE '%NOI%'
         OR contest_name LIKE '%NOIP%' OR contest_name LIKE '%计算机%' OR contest_name LIKE '%程序设计%' THEN '信息学'
    ELSE subject
  END
`
const NATIONAL = new Set(['中国数学奥林匹克', '中国物理奥林匹克', '中国化学奥林匹克', '中国生物学奥林匹克', '全国青少年信息学奥林匹克竞赛'])
const LEAGUE = new Set(['全国中学生数学奥林匹克联赛', '全国中学生物理奥林匹克联赛', '全国中学生化学奥林匹克联赛', '全国中学生生物学奥林匹克联赛', '全国青少年信息学奥林匹克联赛'])
const CATEGORY_SQL = `
  CASE
    WHEN ${[...NATIONAL].map(n => `contest_name LIKE '${n}%'`).join(' OR ')} THEN '国赛'
    WHEN ${[...LEAGUE].map(n => `contest_name LIKE '${n}%'`).join(' OR ')} THEN '联赛'
    ELSE '其他'
  END
`

const CATEGORIES = {
  league:   { level: '省级', cols: ['一等奖', '二等奖', '三等奖'],
              awardMap: { '一等奖': '一等奖', '二等奖': '二等奖', '三等奖': '三等奖' } },
  national: { level: '国家级', cols: ['金牌', '银牌', '铜牌'],
              awardMap: { '金牌': '金牌', '银牌': '银牌', '铜牌': '铜牌',
                          '一等奖': '金牌', '二等奖': '银牌', '三等奖': '铜牌' } },
}

const db = new Database(DB_PATH, { readonly: true })

const awards = db.prepare(`
  SELECT id, academic_year, contest_name, is_olympiad, issuer,
         award_level, award, student_name, instructor, instructor_bonus,
         subject, group_bonus, gender, middle_school, student_grade,
         cert_date, notes, registration_date,
         ${SUBJECT_SQL} AS subj,
         ${CATEGORY_SQL} AS category
  FROM awards
`).all().map(r => ({
  id: r.id,
  academic_year: r.academic_year,
  contest_name: r.contest_name,
  is_olympiad: r.is_olympiad,
  issuer: r.issuer,
  award_level: r.award_level,
  award: r.award,
  student_name: (r.student_name || '').trim(),
  instructor: r.instructor,
  instructor_bonus: r.instructor_bonus,
  subject: r.subj,
  group_bonus: r.group_bonus,
  gender: r.gender,
  middle_school: r.middle_school,
  student_grade: r.student_grade,
  cert_date: r.cert_date,
  notes: r.notes,
  registration_date: r.registration_date,
  category: r.category,
}))

// 汇总统计
const byYear = {}
const bySubject = {}
const byAward = {}
const byCategory = {}
const othersByContest = {}
const yearCategoryBySubject = {}
const yearSubjectAward = {}

for (const a of awards) {
  byYear[a.academic_year] = (byYear[a.academic_year] || 0) + 1
  bySubject[a.subject] = (bySubject[a.subject] || 0) + 1
  const ak = `${a.subject}|${a.award_level}|${a.award}`
  byAward[ak] = (byAward[ak] || 0) + 1
  byCategory[`${a.subject}|${a.category}`] = (byCategory[`${a.subject}|${a.category}`] || 0) + 1
  if (a.category === '其他') {
    const k = `${a.subject}|${a.contest_name}`
    othersByContest[k] = (othersByContest[k] || 0) + 1
  }
  if (a.academic_year) {
    const yk = `${a.academic_year}|${a.subject}|${a.category}`
    yearCategoryBySubject[yk] = (yearCategoryBySubject[yk] || 0) + 1

    let displayAward = a.award
    if (a.category === '国赛' && CATEGORIES.national.awardMap[displayAward]) {
      displayAward = CATEGORIES.national.awardMap[displayAward]
    }
    const sak = `${a.academic_year}|${a.subject}|${a.category}|${displayAward}`
    yearSubjectAward[sak] = (yearSubjectAward[sak] || 0) + 1
  }
}

const summary = {
  byYear: Object.entries(byYear).map(([academic_year, c]) => ({ academic_year, c })).sort((a, b) => b.academic_year.localeCompare(a.academic_year)),
  bySubject: Object.entries(bySubject).map(([subject, c]) => ({ subject, c })).sort((a, b) => b.c - a.c),
  byAward: Object.entries(byAward).map(([k, c]) => {
    const [subject, award_level, award] = k.split('|')
    return { subject, award_level, award, c }
  }),
  byCategory: Object.entries(byCategory).map(([k, c]) => {
    const [subject, category] = k.split('|')
    return { subject, category, c }
  }),
  othersByContest: Object.entries(othersByContest).map(([k, c]) => {
    const [subject, contest_name] = k.split('|')
    return { subject, contest_name, c }
  }),
  yearCategoryBySubject: Object.entries(yearCategoryBySubject).map(([k, c]) => {
    const [academic_year, subject, category] = k.split('|')
    return { academic_year, subject, category, c }
  }),
  yearSubjectAward: Object.entries(yearSubjectAward).map(([k, c]) => {
    const [academic_year, subject, category, award] = k.split('|')
    return { academic_year, subject, category, award, c }
  }),
}

// 学年 + 学科去重列表（用于前端下拉）
const years = [...new Set(awards.map(a => a.academic_year).filter(Boolean))].sort().reverse()
const subjects = [...new Set(awards.map(a => a.subject))].filter(Boolean).sort()
const contests = [...new Set(awards.map(a => a.contest_name))].filter(Boolean).sort()

const out = `// 自动生成：node scripts/dump_static.mjs
// 内嵌到 bundle，给 GitHub Pages 静态部署用
export const AWARDS = ${JSON.stringify(awards)}
export const SUMMARY = ${JSON.stringify(summary)}
export const YEARS = ${JSON.stringify(years)}
export const SUBJECTS = ${JSON.stringify(subjects)}
export const CONTESTS = ${JSON.stringify(contests)}
export const CATEGORIES = ${JSON.stringify(CATEGORIES)}
export const CATEGORY_SQL_HINT = ${JSON.stringify({ NATIONAL: [...NATIONAL], LEAGUE: [...LEAGUE] })}
export const GENERATED_AT = ${JSON.stringify(new Date().toISOString())}
`
mkdirSync(path.dirname(OUT), { recursive: true })
writeFileSync(OUT, out)
console.log(`✓ dumped ${awards.length} records → ${OUT}`)
db.close()
