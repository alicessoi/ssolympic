import { Router } from 'express'
import { db } from '../db.js'
import { rowsToExcelBuffer, timestampFilename } from '../exportExcel.js'
import { getUserFromRequest } from '../auth.js'

const router = Router()

const SUBJECTS = new Set(['数学', '物理', '化学', '生物', '信息学'])

// 公开导出字段：只导出表格可见列，不暴露指导老师/奖金/性别/初中校/备注等敏感字段
const PUBLIC_FIELDS = [
  'academic_year', 'contest_name', 'student_name', 'award_level', 'award',
]
// 管理员导出全部 17 字段
const ADMIN_FIELDS = [
  'academic_year', 'contest_name', 'is_olympiad', 'issuer', 'award_level', 'award',
  'student_name', 'instructor', 'instructor_bonus', 'subject', 'group_bonus',
  'gender', 'middle_school', 'student_grade', 'cert_date', 'notes', 'registration_date',
]

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
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params }
}

function filenameFromFilters(filters) {
  const parts = ['ssoi_导出']
  if (filters.subject) parts.push(filters.subject)
  if (filters.academic_year) parts.push(filters.academic_year)
  if (filters.award_level) parts.push(filters.award_level)
  const stamp = timestampFilename('').replace(/\.xlsx$/, '').replace(/^_/, '')
  const stem = parts.join('_')
  return `${stem}_${stamp}.xlsx`
}

// HTTP header 仅 ASCII；中文走 filename* (RFC 5987)
function asciiFallback(name) {
  return name.replace(/[^\x20-\x7E]/g, '_')
}

router.get('/', (req, res) => {
  try {
    const filters = {
      subject: req.query.subject,
      academic_year: req.query.academic_year,
      award_level: req.query.award_level,
      award: req.query.award,
      keyword: req.query.keyword,
    }
    const { sql: whereSql, params } = buildWhere(filters)
    // 未登录/非管理员只导出表格可见列（5 个）；管理员导出全部 17 个
    const user = getUserFromRequest(req)
    const isAdmin = user?.role === 'admin'
    const fields = isAdmin ? ADMIN_FIELDS : PUBLIC_FIELDS
    const rows = db
      .prepare(
        `SELECT ${fields.join(', ')}
         FROM awards ${whereSql}
         ORDER BY academic_year DESC, id ASC`
      )
      .all(params)

    const buf = rowsToExcelBuffer(rows, fields)
    const filename = filenameFromFilters(filters)
    const asciiName = asciiFallback(filename)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    )
    res.send(buf)
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: 'bad_request', message: e.message })
    console.error(e)
    res.status(500).json({ error: 'server_error', message: e.message })
  }
})

export default router
