export default function FilterBar({ filters, years, contests, onChange, onReset }) {
  const update = (patch) => onChange({ ...filters, ...patch })

  return (
    <div className="card">
      <div className="form-row">
        <div className="field">
          <label>学年</label>
          <select
            value={filters.academic_year || ''}
            onChange={e => update({ academic_year: e.target.value })}
          >
            <option value="">全部</option>
            {years.map(y => <option key={y.academic_year || 'null'} value={y.academic_year || ''}>{y.academic_year || '未知'} ({y.c})</option>)}
          </select>
        </div>
        <div className="field">
          <label>赛事</label>
          <select
            value={filters.contest || ''}
            onChange={e => update({ contest: e.target.value })}
          >
            <option value="">全部</option>
            {contests.map(c => <option key={c.contest_name} value={c.contest_name}>{c.contest_name} ({c.c})</option>)}
          </select>
        </div>
        <div className="field">
          <label>奖项级别</label>
          <select
            value={filters.award_level || ''}
            onChange={e => update({ award_level: e.target.value })}
          >
            <option value="">全部</option>
            <option>国家级</option>
            <option>省级</option>
          </select>
        </div>
        <div className="field">
          <label>奖项</label>
          <select
            value={filters.award || ''}
            onChange={e => update({ award: e.target.value })}
          >
            <option value="">全部</option>
            <option>一等奖</option>
            <option>二等奖</option>
            <option>三等奖</option>
          </select>
        </div>
        <div className="field" style={{ flex: 1, minWidth: 200 }}>
          <label>学生姓名</label>
          <input
            type="text"
            placeholder="输入学生姓名查询其获奖记录"
            value={filters.keyword || ''}
            onChange={e => update({ keyword: e.target.value })}
          />
        </div>
        <div className="field">
          <button className="btn btn-ghost" onClick={onReset}>重置</button>
        </div>
      </div>
    </div>
  )
}