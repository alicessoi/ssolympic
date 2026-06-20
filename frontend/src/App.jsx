import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth.jsx'
import Layout from './components/Layout.jsx'
import Home from './pages/Home.jsx'
import Login from './pages/Login.jsx'
import Subject from './pages/Subject.jsx'
import Summary from './pages/Summary.jsx'
import Student from './pages/Student.jsx'
import Announcements from './pages/Announcements.jsx'
import Help from './pages/Help.jsx'
import Admin from './pages/Admin.jsx'

export { SUBJECTS } from './subjects.js'

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
            <Route path="/student" element={<Student />} />
            <Route path="/announcements" element={<Announcements />} />
            <Route path="/help" element={<Help />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </Layout>
      </Router>
    </AuthProvider>
  )
}