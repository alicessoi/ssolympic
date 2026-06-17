import './env.js'  // 必须先于任何业务模块：加载 .env
import express from 'express'
import cookieParser from 'cookie-parser'
import { dirname, resolve, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

import { ensureAdmin } from './db.js'
import authRoutes from './routes/auth.js'
import awardsRoutes from './routes/awards.js'
import summaryRoutes from './routes/summary.js'
import exportRoutes from './routes/export.js'
import healthzRoutes from './routes/healthz.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BACKEND_DIR = resolve(__dirname, '..')

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-me-in-env') {
  console.error('✗ JWT_SECRET 未设置或为占位值 — 请编辑 .env 后重启')
  process.exit(1)
}

const PORT = parseInt(process.env.PORT, 10) || 3001

ensureAdmin()

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '256kb' }))
app.use(cookieParser())

app.use('/api/auth', authRoutes)
app.use('/api/awards', awardsRoutes)
app.use('/api/summary', summaryRoutes)
app.use('/api/export', exportRoutes)
app.use('/api/healthz', healthzRoutes)

// 静态托管前端构建产物（生产模式）— 必须在 404 之前
const distDir = isAbsolute(process.env.FRONTEND_DIST || '')
  ? process.env.FRONTEND_DIST
  : resolve(BACKEND_DIR, process.env.FRONTEND_DIST || '../frontend/dist')

if (existsSync(distDir)) {
  app.use(express.static(distDir))
  // SPA fallback：HashRouter 实际不需要，但留个安全网处理非 hash 直链刷新
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(resolve(distDir, 'index.html'))
  })
  console.log(`✓ 托管前端静态目录 ${distDir}`)
} else {
  console.log(`ℹ 未找到前端 dist（${distDir}），仅运行 API 模式 — 开发期通过 vite 访问 :5173`)
}

app.use((req, res) => {
  res.status(404).json({ error: 'not_found', path: req.path })
})

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'server_error', message: err.message })
})

app.listen(PORT, () => {
  console.log(`✓ listening on :${PORT}`)
})