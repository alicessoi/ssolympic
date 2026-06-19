import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api.js'
import { SUBJECTS } from '../subjects.js'
import FilterBar from '../components/FilterBar.jsx'
import AwardTable from '../components/AwardTable.jsx'
import ExportButton from '../components/ExportButton.jsx'

export default function Subject() {
  const { slug } = useParams()
  const subject = useMemo(() => SUBJECTS.find(s => s.slug === slug), [slug])

  const [filters, setFilters] = useState({ subject: subject?.name, page: 1, limit: 20, sort: 'academic_year', dir: 'desc' })
  const [years, setYears] = useState([])
  const [contests, setContests] = useState([])
  const [data, setData] = useState({ data: [], total: 0, page: 1 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setFilters({ subject: subject?.name, page: 1, limit: 20, sort: 'academic_year', dir: 'desc' })
  }, [subject?.name])

  useEffect(() => {
    if (!subject) return
    api.years(subject.name).then(d => setYears(d.data || [])).catch(() => setYears([]))
  }, [subject?.name])

  // 赛事下拉随学年联动：换学年时重新拉赛事列表
  useEffect(() => {
    if (!subject) return
    api.contests(subject.name, filters.academic_year)
      .then(d => setContests(d.data || []))
      .catch(() => setContests([]))
  }, [subject?.name, filters.academic_year])

  useEffect(() => {
    if (!subject) return
    setLoading(true)
    setError('')
    api.awards(filters)
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [filters, subject?.name])

  if (!subject) return <div className="empty">未知学科</div>

  const onSort = (key) => {
    setFilters(f => ({
      ...f,
      sort: key,
      dir: f.sort === key && f.dir === 'asc' ? 'desc' : 'asc',
      page: 1,
    }))
  }

  const onPage = (p) => setFilters(f => ({ ...f, page: p }))

  const onReset = () => setFilters({ subject: subject.name, page: 1, limit: 20, sort: 'academic_year', dir: 'desc' })

  return (
    <div>
      <h1 className="page-title">{subject.emoji} {subject.name} · 历年获奖记录</h1>

      <FilterBar
        filters={filters}
        years={years}
        contests={contests}
        onChange={(patch) => setFilters(f => {
          // 学年变了，赛事下拉联动刷新；清掉旧赛事避免"学年+赛事"组合无结果
          const merged = { ...f, ...patch, page: 1 }
          if (patch.academic_year !== undefined && patch.academic_year !== f.academic_year) {
            merged.contest = ''
          }
          return merged
        })}
        onReset={onReset}
      />

      <div className="row-spread">
        <span className="muted">共 {data.total} 条记录 · 第 {data.page} 页</span>
        <ExportButton filters={filters} label="导出当前结果" />
      </div>

      {error && <div className="error-msg">{error}</div>}
      {loading
        ? <div className="empty">加载中…</div>
        : <AwardTable
            rows={data.data}
            total={data.total}
            page={data.page}
            limit={filters.limit}
            sort={filters.sort}
            dir={filters.dir}
            onSort={onSort}
            onPage={onPage}
          />}
    </div>
  )
}