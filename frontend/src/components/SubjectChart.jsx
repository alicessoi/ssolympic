import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts'
import { useState } from 'react'

const COLORS = ['#3182CE', '#ed8936', '#38a169', '#805ad5', '#e53e3e', '#319795', '#d69e2e']

export default function SubjectChart({ data, valueKey = 'c', nameKey = 'name', title }) {
  const [view, setView] = useState('bar')
  const safe = Array.isArray(data) ? data : []

  return (
    <div className="card">
      <div className="row-spread">
        <h3 className="section-title" style={{ margin: 0 }}>{title}</h3>
        <div className="view-switch">
          <button className={view === 'bar' ? 'active' : ''} onClick={() => setView('bar')}>柱状图</button>
          <button className={view === 'pie' ? 'active' : ''} onClick={() => setView('pie')}>饼图</button>
        </div>
      </div>
      <div style={{ width: '100%', height: 320 }}>
        {safe.length === 0 ? (
          <div className="empty">暂无数据</div>
        ) : view === 'bar' ? (
          <ResponsiveContainer>
            <BarChart data={safe} margin={{ top: 10, right: 20, left: 0, bottom: 50 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey={nameKey} angle={-25} textAnchor="end" interval={0} fontSize={12} />
              <YAxis allowDecimals={false} fontSize={12} />
              <Tooltip />
              <Bar dataKey={valueKey} fill="var(--primary)" radius={[4, 4, 0, 0]}>
                {safe.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer>
            <PieChart>
              <Pie data={safe} dataKey={valueKey} nameKey={nameKey} outerRadius={110} label>
                {safe.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}