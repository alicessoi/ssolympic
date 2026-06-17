import { Router } from 'express'
import { db } from '../db.js'
import { signToken, verifyPassword, setAuthCookie, clearAuthCookie, getUserFromRequest } from '../auth.js'
import { loginRateLimit } from '../middleware/rateLimit.js'

const router = Router()

router.post('/login', loginRateLimit, (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password) {
    return res.status(400).json({ error: 'bad_request', message: '用户名和密码必填' })
  }
  const user = db.prepare('SELECT id, username, password_hash, role FROM users WHERE username = ?').get(username)
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'invalid_credentials', message: '用户名或密码错误' })
  }
  const token = signToken(user)
  setAuthCookie(res, token)
  res.json({ ok: true, user: { username: user.username, role: user.role } })
})

router.post('/logout', (req, res) => {
  clearAuthCookie(res)
  res.json({ ok: true })
})

router.get('/me', (req, res) => {
  const user = getUserFromRequest(req)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  res.json({ user: { username: user.username, role: user.role } })
})

export default router
