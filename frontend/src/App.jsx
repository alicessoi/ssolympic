import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth.jsx'
import Layout from './components/Layout.jsx'
import Home from './pages/Home.jsx'
import Login from './pages/Login.jsx'
import Subject from './pages/Subject.jsx'
import Summary from './pages/Summary.jsx'
import Announcements from './pages/Announcements.jsx'
import Help from './pages/Help.jsx'

export const SUBJECTS = [
  { slug: 'math', name: '数学', emoji: '📐', desc: 'CMO / 联赛 / 预赛' },
  { slug: 'physics', name: '物理', emoji: '⚛️', desc: 'CPhO / 复赛 / 决赛' },
  { slug: 'chemistry', name: '化学', emoji: '🧪', desc: 'CChO / 预赛 / 国决' },
  { slug: 'biology', name: '生物', emoji: '🧬', desc: 'CBO / 联赛 / 国赛' },
  { slug: 'informatics', name: '信息学', emoji: '💻', desc: 'NOI / NOIP / CSP' },
]

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/subject/:slug" element={<Subject />} />
            <Route path="/summary" element={<Summary />} />
            <Route path="/announcements" element={<Announcements />} />
            <Route path="/help" element={<Help />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </Layout>
      </Router>
    </AuthProvider>
  )
}