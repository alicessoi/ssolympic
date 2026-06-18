import { api, filterAwards } from '../api.js'
import * as XLSX from 'xlsx'

const PUBLIC_FIELDS = [
  { key: 'academic_year', label: '学年', width: 12 },
  { key: 'contest_name', label: '竞赛名称', width: 30 },
  { key: 'student_name', label: '学生姓名', width: 12 },
  { key: 'award_level', label: '级别', width: 10 },
  { key: 'award', label: '奖项', width: 10 },
]
const ADMIN_FIELDS = [
  ...PUBLIC_FIELDS,
  { key: 'is_olympiad', label: '是否奥赛', width: 8 },
  { key: 'issuer', label: '发奖部门', width: 22 },
  { key: 'instructor', label: '指导老师', width: 16 },
  { key: 'instructor_bonus', label: '师奖金', width: 10 },
  { key: 'subject', label: '学科', width: 10 },
  { key: 'group_bonus', label: '组奖金', width: 10 },
  { key: 'gender', label: '性别', width: 6 },
  { key: 'middle_school', label: '初中毕业校', width: 16 },
  { key: 'student_grade', label: '学生年级', width: 10 },
  { key: 'cert_date', label: '发证时间', width: 12 },
  { key: 'notes', label: '备注', width: 10 },
  { key: 'registration_date', label: '登记时间', width: 12 },
]

function isAdmin() {
  try {
    const u = JSON.parse(localStorage.getItem('ssoi_user') || 'null')
    return u && u.role === 'admin'
  } catch { return false }
}

export default function ExportButton({ filters, label = '导出 Excel' }) {
  const handleClick = () => {
    const rows = filterAwards(filters || {})
    const fields = isAdmin() ? ADMIN_FIELDS : PUBLIC_FIELDS
    const headers = fields.map(f => f.label)
    const data = rows.map(r => fields.map(f => r[f.key] ?? null))
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data])
    ws['!cols'] = fields.map(f => ({ wch: f.width }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '获奖记录')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })

    const parts = ['ssoi_导出']
    if (filters?.subject) parts.push(filters.subject)
    if (filters?.academic_year) parts.push(filters.academic_year)
    if (filters?.award_level) parts.push(filters.award_level)
    const d = new Date()
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    const filename = `${parts.join('_')}_${stamp}.xlsx`
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <button className="btn btn-accent" onClick={handleClick}>{label}</button>
  )
}
