import NavBar from './NavBar.jsx'

export default function Layout({ children }) {
  return (
    <div className="app">
      <NavBar />
      <main className="main-content">{children}</main>
      <footer className="footer">
        双十中学五大学科竞赛管理系统 · v1 · {new Date().getFullYear()}
      </footer>
    </div>
  )
}