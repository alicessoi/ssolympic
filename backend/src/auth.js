import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import { db } from './db.js'

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET || JWT_SECRET === 'change-me-to-a-long-random-string-at-least-32-chars') {
  console.error('✗ JWT_SECRET 未设置或为默认值。请编辑 .env 中的 JWT_SECRET 为长随机字符串。')
  process.exit(1)
}

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h'
const COOKIE_NAME = 'ssoi_token'

export function signToken(user) {
  return jwt.sign(
    { sub: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN, algorithm: 'HS256' }
  )
}

export function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash)
}

export function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: false,           // 内网无 TLS；上线时改为 true
    sameSite: 'lax',         // 不要用 strict，会拦跨页面调用
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  })
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' })
}

export function getUserFromRequest(req) {
  const token = req.cookies?.[COOKIE_NAME]
  if (!token) return null
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    const user = db.prepare('SELECT id, username, role FROM users WHERE username = ?').get(payload.sub)
    return user || null
  } catch {
    return null
  }
}

export function requireAuth(req, res, next) {
  const user = getUserFromRequest(req)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  req.user = user
  next()
}
