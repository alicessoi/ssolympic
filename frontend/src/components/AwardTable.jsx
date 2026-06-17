const COLUMNS = [
  { key: 'academic_year', label: '学年' },
  { key: 'contest_name', label: '竞赛名称' },
  { key: 'student_name', label: '学生姓名' },
  { key: 'award_level', label: '级别' },
  { key: 'award', label: '奖项' },
]

function SortHead({ col, sort, dir, onSort }) {
  const active = sort === col.key
  const indicator = active ? (dir === 'asc' ? '↑' : '↓') : ''
  return (
    <th onClick={() => onSort(col.key)}>
      {col.label}
      <span className="sort-indicator">{indicator}</span>
    </th>
  )
}

export default function AwardTable({ rows, total, page, limit, sort, dir, onSort, onPage }) {
  const totalPages = Math.max(1, Math.ceil(total / limit))
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {COLUMNS.map(c => <SortHead key={c.key} col={c} sort={sort} dir={dir} onSort={onSort} />)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={COLUMNS.length} className="empty">无数据</td></tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td>{r.academic_year || <span className="muted">—</span>}</td>
                <td title={r.contest_name}>{r.contest_name}</td>
                <td>{r.student_name}</td>
                <td>
                  {r.award_level ? (
                    <span className={`award-pill award-${r.award_level}`}>{r.award_level}</span>
                  ) : <span className="muted">—</span>}
                </td>
                <td>{r.award || <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <button className="btn btn-ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>上一页</button>
        <span className="page-info">第 {page} / {totalPages} 页 · 共 {total} 条</span>
        <button className="btn btn-ghost" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>下一页</button>
      </div>
    </>
  )
}