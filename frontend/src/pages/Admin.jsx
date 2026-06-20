import { useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { useAuth } from '../auth.jsx'
import { api } from '../api.js'
import { SUBJECTS } from '../subjects.js'

// 模板列：与 data.js 的字段一一对应
const TEMPLATE_COLUMNS = [
  { key: 'academic_year', label: '学年', required: true, example: '2024-2025' },
  { key: 'contest_name', label: '赛事', required: true, example: '全国高中数学联赛' },
  { key: 'is_olympiad', label: '是否奥赛', required: false, example: '奥' },
  { key: 'issuer', label: '主办方', required: false, example: '中国科协' },
  { key: 'award_level', label: '级别', required: true, example: '省级', enum: ['国家级', '省级', '市级', '校级'] },
  { key: 'award', label: '奖项', required: true, example: '一等奖' },
  { key: 'student_name', label: '学生姓名', required: true, example: '张三' },
  { key: 'instructor', label: '指导教师', required: false, example: '李老师' },
  { key: 'subject', label: '学科', required: true, enum: SUBJECTS.map(s => s.name) },
  { key: 'gender', label: '性别', required: false, example: '男' },
  { key: 'middle_school', label: '初中学校', required: false, example: '双十中学' },
  { key: 'student_grade', label: '年级', required: false, example: '24级' },
  { key: 'cert_date', label: '证书日期', required: false, example: '2024.12' },
  { key: 'notes', label: '备注', required: false, example: '' },
  { key: 'registration_date', label: '登记日期', required: false, example: '2024.12.28' },
  { key: 'category', label: '类别', required: true, enum: ['国赛', '联赛'] },
]

const HEADER_TO_KEY = Object.fromEntries(TEMPLATE_COLUMNS.map(c => [c.label, c.key]))

function templateDefaults(category) {
  if (category === '国赛') return { award_level: '国家级', category: '国赛', is_olympiad: '奥' }
  if (category === '联赛') return { award_level: '省级', category: '联赛', is_olympiad: '奥' }
  return {}
}

function downloadTemplate(category) {
  const headers = TEMPLATE_COLUMNS.map(c => c.label)
  const sampleRow = TEMPLATE_COLUMNS.map(c => {
    if (c.example != null) return c.example
    if (c.enum) return c.enum[0]
    return ''
  })
  const sampleRow2 = TEMPLATE_COLUMNS.map(c => {
    if (c.key === 'academic_year') return '2023-2024'
    if (c.key === 'student_name') return '李四'
    if (c.key === 'award' && category === '国赛') return '金牌'
    if (c.key === 'award' && category === '联赛') return '二等奖'
    if (c.key === 'contest_name' && category === '国赛') return '中国数学奥林匹克（CMO2024）'
    if (c.key === 'contest_name' && category === '联赛') return '全国中学生数学奥林匹克联赛（2023）'
    if (c.key === 'issuer' && category === '国赛') return '中国科协青少年工作部、中国数学会'
    if (c.key === 'issuer' && category === '联赛') return '福建省教育厅、福建省科协'
    if (c.example != null) return c.example
    if (c.enum) return c.enum[0]
    return ''
  })
  const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow, sampleRow2])
  ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length * 2 + 2, 14) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, `${category}数据模板`)
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ssoi_${category}数据模板.xlsx`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// 把 XLSX 行解析为结构化对象 + 校验结果
function parseRows(rows) {
  const parsed = []
  const errors = []
  rows.forEach((raw, idx) => {
    const row = {}
    for (const [label, key] of Object.entries(HEADER_TO_KEY)) {
      const v = raw[label]
      row[key] = v == null ? null : (typeof v === 'string' ? v.trim() : v)
    }
    // 空行：所有字段都为空，跳过
    const allEmpty = TEMPLATE_COLUMNS.every(c => row[c.key] == null || row[c.key] === '')
    if (allEmpty) return
    const rowErrors = []
    for (const col of TEMPLATE_COLUMNS) {
      if (col.required && (row[col.key] == null || row[col.key] === '')) {
        rowErrors.push(`「${col.label}」不能为空`)
      }
      if (col.enum && row[col.key] != null && row[col.key] !== '' && !col.enum.includes(row[col.key])) {
        rowErrors.push(`「${col.label}」取值 ${row[col.key]} 不合法，应为 ${col.enum.join('/')}`)
      }
    }
    if (rowErrors.length) errors.push({ idx: idx + 2, errors: rowErrors, student: row.student_name || '?' })
    parsed.push({ row, lineNo: idx + 2 })
  })
  return { parsed, errors }
}

function validateCategory(parsedRows, expectedCategory) {
  const mismatched = []
  for (const { row, lineNo } of parsedRows) {
    if (row.category && row.category !== expectedCategory) {
      mismatched.push({ lineNo, student: row.student_name, got: row.category })
    }
  }
  return mismatched
}

function downloadUpdatedDataJs() {
  const ov = (() => {
    try {
      return JSON.parse(localStorage.getItem('ssoi_awards_overrides') || '[]')
    } catch { return [] }
  })()
  if (!ov.length) {
    alert('当前无覆盖数据（import 后才会有）。')
    return
  }
  // 给出基于 overrides 的最小 JS 片段，供管理员手工并入 data.js
  const lines = [
    '// 由 /admin 页面导出，覆盖下列获奖记录。',
    '// 把下面这段 push 进 data.js 的 AWARDS 数组后重新部署即可生效。',
    'export const AWARD_OVERRIDES = ' + JSON.stringify(ov, null, 2) + ';',
  ]
  const blob = new Blob([lines.join('\n\n') + '\n'], { type: 'text/javascript' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  a.download = `ssoi_award_overrides_${stamp}.js`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function Admin() {
  const { user, loading } = useAuth()
  const [overridesCount, setOverridesCount] = useState(0)
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState([])
  const [parseErrors, setParseErrors] = useState([])
  const [categoryMismatch, setCategoryMismatch] = useState([])
  const [expectedCategory, setExpectedCategory] = useState('国赛')
  const [importResult, setImportResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    setOverridesCount(api._overridesCount())
  }, [])

  if (loading) return <div className="card empty">加载中…</div>
  if (!user) return <Navigate to="/login" replace />

  const refreshCount = () => setOverridesCount(api._overridesCount())

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportResult(null)
    setFileName(file.name)
    setBusy(true)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json(ws, { defval: '' })
      const { parsed: p, errors } = parseRows(json)
      setParsed(p)
      setParseErrors(errors)
      setCategoryMismatch(validateCategory(p, expectedCategory))
    } catch (err) {
      setParseErrors([{ idx: 0, errors: [`文件解析失败：${err.message}`], student: '?' }])
      setParsed([])
    } finally {
      setBusy(false)
    }
  }

  // 用户切换「期望类别」时，重新比对已解析行
  const handleCategoryChange = (cat) => {
    setExpectedCategory(cat)
    setCategoryMismatch(validateCategory(parsed, cat))
  }

  const handleConfirm = async () => {
    if (!parsed.length) return
    setBusy(true)
    try {
      const rows = parsed.map(p => p.row)
      const result = await api._applyOverrides(rows)
      setImportResult(result)
      refreshCount()
    } finally {
      setBusy(false)
    }
  }

  const handleReset = () => {
    setParsed([])
    setParseErrors([])
    setCategoryMismatch([])
    setImportResult(null)
    setFileName('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleClearOverrides = async () => {
    if (!confirm('确定要清除全部已导入的覆盖数据吗？此操作不可撤销。')) return
    await api._clearOverrides()
    refreshCount()
    handleReset()
  }

  const totalIssues = parseErrors.length + categoryMismatch.length
  // 仅校验类错误（必填字段缺失、取值非法）阻断导入；类别不一致属于提示信息，可继续。
  const canImport = parsed.length > 0 && parseErrors.length === 0 && !busy

  return (
    <div>
      <h1 className="page-title">数据导入（{user.username}）</h1>

      <div className="card">
        <h3 className="section-title" style={{ marginTop: 0 }}>① 下载模板</h3>
        <p className="muted" style={{ marginBottom: '0.75rem' }}>
          提供国赛 / 联赛两种模板，按表头填写后上传即可。模板中已预填示例行，可直接替换。
        </p>
        <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => downloadTemplate('国赛')}>
            下载国赛数据模板 (.xlsx)
          </button>
          <button className="btn btn-secondary" onClick={() => downloadTemplate('联赛')}>
            下载省赛数据模板 (.xlsx)
          </button>
        </div>
      </div>

      <div className="card">
        <h3 className="section-title" style={{ marginTop: 0 }}>② 上传并预览</h3>
        <div className="form-row">
          <div className="field">
            <label>本次导入类别</label>
            <select
              value={expectedCategory}
              onChange={e => handleCategoryChange(e.target.value)}
            >
              <option value="国赛">国赛</option>
              <option value="联赛">联赛</option>
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 260 }}>
            <label>选择 Excel 文件</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFile}
              disabled={busy}
            />
          </div>
        </div>

        {fileName && (
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            已选择：<code>{fileName}</code>
          </p>
        )}

        {parseErrors.length > 0 && (
          <div className="import-alert import-alert-error">
            <strong>解析/校验失败 {parseErrors.length} 行：</strong>
            <ul>
              {parseErrors.slice(0, 10).map((e, i) => (
                <li key={i}>
                  第 {e.idx} 行（{e.student}）：{e.errors.join('；')}
                </li>
              ))}
              {parseErrors.length > 10 && <li>…还有 {parseErrors.length - 10} 行</li>}
            </ul>
          </div>
        )}

        {categoryMismatch.length > 0 && (
          <div className="import-alert import-alert-warn">
            <strong>{categoryMismatch.length} 行的「类别」与本次选择的「{expectedCategory}」不一致：</strong>
            <ul>
              {categoryMismatch.slice(0, 10).map((m, i) => (
                <li key={i}>
                  第 {m.lineNo} 行（{m.student}）：类别 = 「{m.got}」
                </li>
              ))}
              {categoryMismatch.length > 10 && <li>…还有 {categoryMismatch.length - 10} 行</li>}
            </ul>
            <p className="muted" style={{ margin: '0.25rem 0 0' }}>
              可修改 Excel 后重新上传，或直接以「{expectedCategory}」为准继续导入。
            </p>
          </div>
        )}

        {parsed.length > 0 && (
          <>
            <p style={{ margin: '0.5rem 0' }}>
              解析成功 <strong>{parsed.length}</strong> 条记录（{totalIssues > 0 ? `另有 ${totalIssues} 项问题` : '无校验问题'}）。
              预览前 10 条：
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>学年</th>
                    <th>学科</th>
                    <th>赛事</th>
                    <th>级别</th>
                    <th>奖项</th>
                    <th>学生</th>
                    <th>指导教师</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.slice(0, 10).map(({ row, lineNo }) => (
                    <tr key={lineNo}>
                      <td>{lineNo}</td>
                      <td>{row.academic_year}</td>
                      <td>{row.subject}</td>
                      <td title={row.contest_name}>{row.contest_name}</td>
                      <td>{row.award_level}</td>
                      <td>{row.award}</td>
                      <td>{row.student_name}</td>
                      <td>{row.instructor || <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.length > 10 && (
              <p className="muted" style={{ marginTop: '0.5rem' }}>
                …还有 {parsed.length - 10} 行未在预览中显示
              </p>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h3 className="section-title" style={{ marginTop: 0 }}>③ 确认导入</h3>
        <p className="muted" style={{ marginBottom: '0.75rem' }}>
          系统按「学年+赛事+学生+奖项+级别」作为唯一键，重复行将覆盖原有数据，新行将追加。
          导入后立即在汇总/学科/学生页可见，数据保存在浏览器 localStorage。
        </p>
        <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-accent" disabled={!canImport} onClick={handleConfirm}>
            {busy ? '处理中…' : `确认导入 ${parsed.length || ''} 条`.trim()}
          </button>
          <button className="btn btn-ghost" disabled={busy} onClick={handleReset}>
            重置
          </button>
        </div>

        {importResult && (
          <div className="import-alert import-alert-success">
            导入完成：新增 <strong>{importResult.added}</strong> 条 ·
            覆盖 <strong>{importResult.updated}</strong> 条 · 覆盖层现有 <strong>{importResult.total}</strong> 条。
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="section-title" style={{ marginTop: 0 }}>已导入数据管理</h3>
        <p>
          当前浏览器中已导入 <strong>{overridesCount}</strong> 条覆盖记录。
          清除后所有页面将回到初始数据。
        </p>
        <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" disabled={overridesCount === 0} onClick={downloadUpdatedDataJs}>
            导出覆盖层 JS 片段
          </button>
          <button className="btn btn-ghost" disabled={overridesCount === 0} onClick={handleClearOverrides}>
            清除全部覆盖
          </button>
        </div>
        <p className="muted" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
          注意：localStorage 仅保存在本浏览器。如需让其他访客也看到更新，
          请使用「导出覆盖层 JS 片段」得到 <code>AWARD_OVERRIDES</code> 数据，
          由管理员手工合并进 <code>data.js</code> 后重新部署。
        </p>
      </div>
    </div>
  )
}