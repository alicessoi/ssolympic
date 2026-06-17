import { Router } from 'express'
import { db } from '../db.js'
import { awardsRateLimit } from '../middleware/rateLimit.js'

const router = Router()

const SUBJECTS = new Set(['数学', '物理', '化学', '生物', '信息学'])

const SORT_WHITELIST = new Set([
  'academic_year',
  'student_name',
  'cert_date',
  'award_level',
  'instructor_bonus',
  'group_bonus',
])

function buildWhere(filters) {
  const where = []
  const params = {}
  if (filters.subject) {
    if (!SUBJECTS.has(filters.subject)) {
      throw Object.assign(new Error('invalid subject'), { status: 400 })
    }
    where.push('subject = @subject')
    params.subject = filters.subject
  }
  if (filters.academic_year) {
    where.push('academic_year = @academic_year')
    params.academic_year = filters.academic_year
  }
  if (filters.award_level) {
    where.push('award_level = @award_level')
    params.award_level = filters.award_level
  }
  if (filters.award) {
    where.push('award = @award')
    params.award = filters.award
  }
  if (filters.keyword) {
    where.push('(student_name LIKE @kw OR instructor LIKE @kw OR contest_name LIKE @kw)')
    params.kw = `%${filters.keyword}%`
  }
  if (filters.contest) {
    where.push('contest_name = @contest')
    params.contest = filters.contest
  }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params }
}

// 奖牌统一等级：金/银/铜 与 一/二/三 视为同一档
//   一等奖 ↔ 金牌（rank 1，最高）
//   二等奖 ↔ 银牌（rank 2）
//   三等奖 ↔ 铜牌（rank 3，最低）
const AWARD_RANK_SQL = `
  CASE
    WHEN award IN ('一等奖','金牌') THEN 1
    WHEN award IN ('二等奖','银牌') THEN 2
    WHEN award IN ('三等奖','铜牌') THEN 3
    ELSE 4
  END
`

function orderClause(sort, dir) {
  const asc = dir === 'asc' ? 'ASC' : 'DESC'
  if (sort === 'award_level') {
    // 数值越大级别越高：DESC=国家级在前，ASC=校级在前
    return `ORDER BY CASE award_level
      WHEN '国家级' THEN 4
      WHEN '省级' THEN 3
      WHEN '市级' THEN 2
      WHEN '校级' THEN 1
      ELSE 0 END ${asc}, ${AWARD_RANK_SQL} ASC, id DESC`
  }
  if (sort === 'award') {
    // 按奖牌等级排：一/二/三 ↔ 金/银/铜 视为同档
    return `ORDER BY ${AWARD_RANK_SQL} ${asc}, academic_year DESC, id DESC`
  }
  // 默认 + 任何其他列：年份 DESC + 奖牌等级 ASC + id DESC
  return `ORDER BY ${sort} ${asc}, academic_year DESC, ${AWARD_RANK_SQL} ASC, id DESC`
}

router.get('/', awardsRateLimit, (req, res) => {
  try {
    const {
      subject,
      academic_year: academicYear,
      award_level: awardLevel,
      award,
      keyword,
      contest,
      page = '1',
      limit = '20',
      sort = 'academic_year',
      dir = 'desc',
    } = req.query

    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 20))
    const sortCol = SORT_WHITELIST.has(sort) ? sort : 'academic_year'

    const { sql: whereSql, params } = buildWhere({
      subject,
      academic_year: academicYear,
      award_level: awardLevel,
      award,
      keyword,
      contest,
    })
    params.limit = limitNum
    params.offset = (pageNum - 1) * limitNum

    const total = db.prepare(`SELECT COUNT(*) AS c FROM awards ${whereSql}`).get(params).c
    const rows = db
      .prepare(
        `SELECT id, academic_year, contest_name, is_olympiad, issuer, award_level, award,
                student_name, instructor, instructor_bonus, subject, group_bonus,
                gender, middle_school, student_grade, cert_date, notes, registration_date
         FROM awards ${whereSql} ${orderClause(sortCol, dir)}
         LIMIT @limit OFFSET @offset`
      )
      .all(params)

    res.json({
      data: rows,
      total,
      page: pageNum,
      limit: limitNum,
      nextPage: pageNum * limitNum < total ? pageNum + 1 : null,
    })
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: 'bad_request', message: e.message })
    console.error(e)
    res.status(500).json({ error: 'server_error', message: e.message })
  }
})

router.get('/years', awardsRateLimit, (req, res) => {
  try {
    const { subject } = req.query
    const params = {}
    let where = ''
    if (subject) {
      if (!SUBJECTS.has(subject)) {
        return res.status(400).json({ error: 'bad_request', message: 'invalid subject' })
      }
      where = 'WHERE subject = @subject'
      params.subject = subject
    }
    const rows = db
      .prepare(
        `SELECT academic_year, COUNT(*) AS c FROM awards ${where}
         GROUP BY academic_year ORDER BY academic_year DESC`
      )
      .all(params)
    res.json({ data: rows })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'server_error', message: e.message })
  }
})

router.get('/contests', awardsRateLimit, (req, res) => {
  try {
    const { subject, academic_year: academicYear } = req.query
    const params = {}
    const where = []
    if (subject) {
      if (!SUBJECTS.has(subject)) {
        return res.status(400).json({ error: 'bad_request', message: 'invalid subject' })
      }
      where.push('subject = @subject')
      params.subject = subject
    }
    if (academicYear) {
      where.push('academic_year = @academic_year')
      params.academic_year = academicYear
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    // 排序：按 contest_name 末尾 4 位数字（年份）倒序，无年份时退回按记录数倒序
    const rows = db
      .prepare(
        `SELECT contest_name, COUNT(*) AS c FROM awards ${whereSql}
         GROUP BY contest_name
         ORDER BY
           CASE WHEN SUBSTR(contest_name, -5, 1) = '）'
                THEN CAST(SUBSTR(contest_name, -5, 4) AS INTEGER)
                ELSE NULL END DESC NULLS LAST,
           contest_name ASC`
      )
      .all(params)
    res.json({ data: rows })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'server_error', message: e.message })
  }
})

export default router
