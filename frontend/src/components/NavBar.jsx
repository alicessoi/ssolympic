import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import { SUBJECTS } from '../App.jsx'

export default function NavBar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  return (
    <nav className="navbar">
      <NavLink to="/" className="nav-brand">双十中学竞赛管理</NavLink>
      <div className="nav-links">
        <NavLink to="/" end>首页</NavLink>
        <div className="nav-subject-group">
          {SUBJECTS.map(s => (
            <NavLink key={s.slug} to={`/subject/${s.slug}`}>{s.name}</NavLink>
          ))}
        </div>
        <NavLink to="/summary">汇总</NavLink>
        <NavLink to="/announcements">公告</NavLink>
        <NavLink to="/help">帮助</NavLink>
        {user ? (
          <span className="nav-user">
            <span>{user.username}</span>
            <button onClick={handleLogout}>退出</button>
          </span>
        ) : (
          <NavLink to="/login">登录</NavLink>
        )}
      </div>
    </nav>
  )
}