import Database from 'better-sqlite3'
import bcrypt from 'bcrypt'
import { dirname, resolve, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BACKEND_DIR = resolve(__dirname, '..')

// 解析 DB 路径：绝对路径直接用，相对路径相对 backend/
export const DB_PATH = process.env.DB_PATH
  ? (isAbsolute(process.env.DB_PATH) ? process.env.DB_PATH : resolve(BACKEND_DIR, process.env.DB_PATH))
  : resolve(BACKEND_DIR, 'data/ssoi.db')

mkdirSync(dirname(DB_PATH), { recursive: true })

export const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

const SCHEMA = `
CREATE TABLE IF NOT EXISTS awards (
  id INTEGER PRIMARY KEY,
  academic_year TEXT,
  contest_name TEXT NOT NULL,
  is_olympiad TEXT,
  issuer TEXT,
  award_level TEXT,
  award TEXT,
  student_name TEXT NOT NULL,
  instructor TEXT,
  instructor_bonus INTEGER,
  subject TEXT NOT NULL,
  group_bonus INTEGER,
  gender TEXT,
  middle_school TEXT,
  student_grade TEXT,
  cert_date TEXT,
  notes TEXT,
  registration_date TEXT
);
CREATE INDEX IF NOT EXISTS idx_subject ON awards(subject);
CREATE INDEX IF NOT EXISTS idx_year ON awards(academic_year);
CREATE INDEX IF NOT EXISTS idx_level ON awards(award_level);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`

db.exec(SCHEMA)

// 自检：若 awards 表为空，提示运行 import
const count = db.prepare('SELECT COUNT(*) AS c FROM awards').get().c
if (count === 0) {
  console.warn('⚠ awards 表为空 — 请运行: npm run import')
}

// 自检：确保 admin 账户存在
export function ensureAdmin() {
  const username = process.env.ADMIN_USERNAME || 'admin'
  const password = process.env.ADMIN_PASSWORD
  if (!password || password === 'change-on-first-login') {
    console.warn('⚠ ADMIN_PASSWORD 未设置或为默认值，admin 账户未创建（请编辑 .env 后重启）')
    return
  }
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (exists) return
  const hash = bcrypt.hashSync(password, 10)
  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, hash, 'admin')
  console.log(`✓ admin 用户 "${username}" 已创建`)
}

console.log(`✓ SQLite 已就绪 (${DB_PATH})`)
