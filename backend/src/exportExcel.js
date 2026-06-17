import * as XLSX from 'xlsx'
import { readFileSync } from 'node:fs'

// SheetJS ESM interop workaround
const xlsxModule = XLSX.default || XLSX

const HEADERS = [
  '学年', '竞赛名称', '是否奥赛', '发奖部门', '级别', '奖项',
  '学生姓名', '指导老师', '师奖金', '学科', '组奖金',
  '性别', '初中毕业校', '学生年级', '发证时间', '备注', '登记时间',
]

const COL_WIDTHS = [
  { wch: 12 }, { wch: 30 }, { wch: 8 }, { wch: 22 }, { wch: 10 }, { wch: 10 },
  { wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
  { wch: 6 }, { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 },
]

// fields 形如 ['academic_year', 'contest_name', ...]；为空时全量导出
export function rowsToExcelBuffer(rows, fields = null) {
  const cols = fields || HEADERS.map((_, i) => FIELD_KEYS[i])
  const headers = cols.map(f => HEADERS[FIELD_KEYS.indexOf(f)] || f)
  const data = rows.map(r => cols.map(f => r[f] ?? null))
  const ws = xlsxModule.utils.aoa_to_sheet([headers, ...data])
  // 列宽（按实际列数取）
  ws['!cols'] = cols.map((_, i) => COL_WIDTHS[FIELD_KEYS.indexOf(cols[i])] || { wch: 12 })
  const wb = xlsxModule.utils.book_new()
  xlsxModule.utils.book_append_sheet(wb, ws, '获奖记录')
  return xlsxModule.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

const FIELD_KEYS = [
  'academic_year', 'contest_name', 'is_olympiad', 'issuer', 'award_level', 'award',
  'student_name', 'instructor', 'instructor_bonus', 'subject', 'group_bonus',
  'gender', 'middle_school', 'student_grade', 'cert_date', 'notes', 'registration_date',
]

export function timestampFilename(prefix) {
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return `${prefix}_${stamp}.xlsx`
}
