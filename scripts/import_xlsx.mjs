/**
 * 从 2.xlsx 导入数据到 SQLite
 *
 * 处理的 7 个数据坑：
 *  1. 2018-2019 学年 sheet 缺表头 → 硬编码表头
 *  2. 2024-2025 学年 sheet 缺"组别"列 → 用 contest 名称关键词推断
 *  3. 列数不一致 → 对齐到 18 字段规范
 *  4. 姓名/老师前后空格 → .trim()
 *  5. 2018-2019 初中毕业校全空 → schema 允许 null
 *  6. 空行（student_name 为空）→ 过滤
 *  7. "国家级一等奖" 合并字符串 → 拆分 award_level + award
 *  8. 跨 sheet 重复（同年同学生同赛事多份）→ 按 key 保留首条
 *     key = (student_name, academic_year, contest_name, subject, award_level, award)
 *  9. 物理 联赛 国家级 误标修正：物理 联赛 2015/2018 的 4+2 条国家级记录
 *     重命名为 中国物理奥林匹克（CPHO<year>）
 * 10. 学生名去重后缀：去掉末尾 "-1"/"-2"（源 xlsx 早期导入的去重标记）
 * 11. 学科推断顺序：物理 > 化学 > 生物（避免"学生物理"被"生物"误匹配）
 * 12. 过滤：award_level=市级/校级 记录不入库
 * 13. 跨学科活动（科学创新/数学文化节）不入库
 * 14. 中文数字年份前缀（如"二〇二一年"）通过正则剥离后再走同义词归一化
 * 15. 过滤：award 为空（只有"国家级"/"省级"级别名但无具体奖项）的记录不入库
 *
 * 用法：node scripts/import_xlsx.mjs
 * 依赖：xlsx, better-sqlite3, bcrypt （从 backend/node_modules 提升）
 */

import Database from 'better-sqlite3'
import * as XLSX from 'xlsx'
import bcrypt from 'bcrypt'
import { readFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const XLSX_PATH = process.env.XLSX_PATH
  ? path.resolve(process.env.XLSX_PATH)
  : path.resolve(ROOT, '../ssdata/2.xlsx')
const XLSX_PATH_3 = process.env.XLSX_PATH_3
  ? path.resolve(process.env.XLSX_PATH_3)
  : path.resolve(ROOT, '../ssdata/3.xlsx')
const DB_PATH_DEFAULT = path.resolve(ROOT, 'backend/data/ssoi.db')
const ENV_PATH = path.resolve(ROOT, '.env')

// --- minimal .env loader
function loadEnv() {
  if (!existsSync(ENV_PATH)) return
  for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (m && !process.env[m[1]]) {
      let v = m[2]
      if (/^['"].*['"]$/.test(v)) v = v.slice(1, -1)
      process.env[m[1]] = v
    }
  }
}
loadEnv()

const DB_PATH = process.env.DB_PATH
  ? path.resolve(ROOT, 'backend', process.env.DB_PATH.replace(/^\.\//, ''))
  : DB_PATH_DEFAULT
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-on-first-login'

// --- schema（与 backend/src/db.js 保持一致）
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

// --- helpers
const trim = v => (v == null ? null : String(v).trim() || null)
const asText = v => {
  if (v == null) return null
  if (typeof v === 'string') return trim(v)
  return String(v).trim() || null
}
const asInt = v => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// --- 赛事名归一化：去掉年份前缀/后缀，让同一类赛事统一名称
//   "2017年中国数学奥林匹克"           → "中国数学奥林匹克"
//   "第31届中国数学奥林匹克竞赛"        → "中国数学奥林匹克竞赛"
//   "第三十四届全国中学生生物学竞赛"     → "全国中学生生物学竞赛"
//   "信息学奥林匹克联赛NOIP2024"        → "信息学奥林匹克联赛NOIP"
//   "非专业级软件能力认证CSP-S2024"     → "非专业级软件能力认证CSP-S"
function normalizeContestName(name) {
  if (!name) return name
  let n = String(name).trim()
  n = n.replace(/[（]/g, '(').replace(/[）]/g, ')')                 // 全角括号 → 半角（让同义词表一份就够）
  n = n.replace(/^\d{4}年/, '')                                    // 开头 YYYY年（如 2022年）
  n = n.replace(/^[〇零一二三四五六七八九二]{2,4}年/, '')             // 开头 中文数字年（如 二〇二一年 / 二一年）
  n = n.replace(/^第[\d一二三四五六七八九十百千零〇两]+届/, '')      // 开头 第X届
  n = n.replace(/[(（]?(NOIP|CSP-S|CSP-J|CSP)(\d{4})[)）]?\s*$/i, '$1') // 结尾 NOIP2024 / CSP-S2024：只剥 2024（含半/全角括号）
  n = n.trim()
  if (CONTEST_SYNONYMS[n]) return CONTEST_SYNONYMS[n]              // 同义词归并
  return n || name                                                 // 归一化后为空则保留原值
}

// --- 同义词：把缩略/拼写差异的赛事名归并到规范名
// 规范名依据 3.xlsx + 校内规范的国赛/联赛官方名称：
//   数学 国赛=中国数学奥林匹克（CMO<年>）       联赛=全国中学生数学奥林匹克联赛
//   物理 国赛=中国物理奥林匹克（CPHO<年>）      联赛=全国中学生物理奥林匹克联赛
//   化学 国赛=中国化学奥林匹克（CChO<年>）      联赛=全国中学生化学奥林匹克联赛
//   生物 国赛=中国生物学奥林匹克（CBO<年>）     联赛=全国中学生生物学奥林匹克联赛
//   信息学 国赛=全国青少年信息学奥林匹克竞赛（NOI<年>）  联赛=全国青少年信息学奥林匹克联赛（NOIP）
// 注：国赛名导入时只归并到不带年份的规范名，applyNationalYearSuffix() 会再补年份后缀
const CONTEST_SYNONYMS = {
  // === 数学 国赛 ===
  '中国数学奥林匹克': '中国数学奥林匹克',
  '中国数学奥林匹克竞赛': '中国数学奥林匹克',
  '全国中国中学生数学奥林匹克竞赛（决赛）': '中国数学奥林匹克',
  '全国中学生数学奥林匹克竞赛（决赛）': '中国数学奥林匹克',
  // === 数学 联赛 ===
  '全国高中数学联赛(福建赛区)': '全国中学生数学奥林匹克联赛',
  '全国高中数学联赛福建赛区': '全国中学生数学奥林匹克联赛',
  '全国高中数学联赛(福建赛区)竞赛': '全国中学生数学奥林匹克联赛',
  '全国高中数学联赛福建赛区竞赛': '全国中学生数学奥林匹克联赛',
  '福建省高中数学竞赛': '全国中学生数学奥林匹克联赛',
  '全国中学生数学奥林匹克竞赛（预赛）': '全国中学生数学奥林匹克联赛',  // 预赛合并到联赛
  // 中文数字"二〇二〇"前缀的数学联赛（2020-2021 sheet 写法）
  '二〇二〇年全国高中数学联赛福建赛区': '全国中学生数学奥林匹克联赛',
  // === 物理 国赛 ===
  '全国中学生物理竞赛决赛': '中国物理奥林匹克',
  '全国中学生物理竞赛（决赛）': '中国物理奥林匹克',
  '全国中学生物理竞赛(决赛)': '中国物理奥林匹克',
  // === 物理 联赛 ===
  '全国中学生物理竞赛（福建赛区）': '全国中学生物理奥林匹克联赛',
  '全国中学生物理竞赛福建赛区': '全国中学生物理奥林匹克联赛',
  '全国中学生物理竞赛（省级赛区）': '全国中学生物理奥林匹克联赛',
  '全国中学生物理竞赛(福建赛区)': '全国中学生物理奥林匹克联赛',
  '全国中学生物理竞赛福建赛区竞赛': '全国中学生物理奥林匹克联赛',
  '全国中学生物理竞赛': '全国中学生物理奥林匹克联赛',
  // === 化学 国赛 ===
  '中国化学奥林匹克（决赛）': '中国化学奥林匹克',
  '中国化学奥林匹克(决赛）': '中国化学奥林匹克',
  '中国化学奥林匹克(决赛)': '中国化学奥林匹克',
  // === 化学 联赛 ===
  '中国化学奥林匹克（初赛）福建赛区': '全国中学生化学奥林匹克联赛',
  '中国化学奥林匹克（初赛）': '全国中学生化学奥林匹克联赛',
  '中国化学奥林匹克竞赛（初赛）': '全国中学生化学奥林匹克联赛',
  '中国化学奥林匹克（福建赛区）竞赛': '全国中学生化学奥林匹克联赛',
  '中国化学奥林匹克福建赛区竞赛': '全国中学生化学奥林匹克联赛',
  // === 生物 国赛 ===
  '全国中学生生物学竞赛': '中国生物学奥林匹克',
  '全国中学生生物学竞赛福建赛区': '中国生物学奥林匹克',
  // === 生物 联赛 ===
  '全国中学生生物学联赛': '全国中学生生物学奥林匹克联赛',
  '全国中学生生物学联赛福建赛区': '全国中学生生物学奥林匹克联赛',
  '全国中学生生物学联赛（福建赛区）': '全国中学生生物学奥林匹克联赛',
  // === 信息学 国赛 ===
  '全国青少年信息学奥林匹克竞赛': '全国青少年信息学奥林匹克竞赛',
  // === 信息学 联赛 ===
  '全国青少年信息学联赛（福建省赛区）': '全国青少年信息学奥林匹克联赛',
  '全国青少年信息学奥林匹克联赛福建赛区竞赛': '全国青少年信息学奥林匹克联赛',
  '信息学奥林匹克联赛NOIP': '全国青少年信息学奥林匹克联赛',
  '全国青少年信息学奥林匹克联赛NOIP': '全国青少年信息学奥林匹克联赛',
}

// 同义词表规范化：把 key 里的全角括号都转半角，与 normalizeContestName 保持一致
// 解决"同义词表 key 是全角、输入已转半角"导致匹配不上的问题
for (const k of Object.keys(CONTEST_SYNONYMS)) {
  const nk = k.replace(/[（]/g, '(').replace(/[）]/g, ')')
  if (nk !== k) {
    CONTEST_SYNONYMS[nk] = CONTEST_SYNONYMS[k]
    delete CONTEST_SYNONYMS[k]
  }
}

// --- 学科推断（有序匹配）
// 顺序关键：必须先 物理 / 化学，后 生物；否则 "学生物理" 会被 "生物" 误匹配（"生"+"物"相邻）
const SUBJECT_RULES = [
  { subject: '物理', kws: ['物理'] },
  { subject: '化学', kws: ['化学'] },
  { subject: '生物', kws: ['生物学', '生物'] },
  { subject: '数学', kws: ['数学', 'Math', 'math', '奥数'] },
  { subject: '信息学', kws: ['信息学', '信息', 'CSP', 'NOIP', 'NOI', 'IOI', 'APIO', 'WC ', 'CTSC', '程序设计', '电脑', '算法', '奥林匹克竞赛（决赛）'] },
]
function inferSubject(contestName) {
  if (!contestName) return null
  const cn = String(contestName)
  for (const r of SUBJECT_RULES) {
    if (r.kws.some(kw => cn.includes(kw))) return r.subject
  }
  return 'UNKNOWN'
}

// --- 合并奖项字符串拆分: "国家级一等奖" → level=国家级, award=一等奖
const LEVELS = ['国家级', '省级', '市级', '校级']
const AWARDS = ['一等奖', '二等奖', '三等奖', '金牌', '银牌', '铜牌', '优胜']
function splitAward(levelStr) {
  if (!levelStr) return { level: null, award: null }
  const s = String(levelStr).trim()
  for (const lvl of LEVELS) {
    if (s.startsWith(lvl)) {
      const rest = s.slice(lvl.length)
      return { level: lvl, award: findAward(rest) || rest || null }
    }
  }
  return { level: null, award: findAward(s) || s }
}
function findAward(s) {
  for (const a of AWARDS) {
    if (s.includes(a)) return a
  }
  return null
}

// --- 从 cert_date (格式 YYYY.M 或 YYYY.MM) 反推学年
//   9-12 月 → YYYY-YYYY+1；1-8 月 → (YYYY-1)-YYYY
function inferAcademicYear(certDate) {
  if (!certDate) return null
  const m = String(certDate).match(/^(\d{4})\.(\d{1,2})/)
  if (!m) return null
  const y = parseInt(m[1], 10)
  const mo = parseInt(m[2], 10)
  if (mo >= 9) return `${y}-${y + 1}`
  return `${y - 1}-${y}`
}

// --- 物理 联赛 国家级 误标修正
//   源数据中 2015 / 2018 学年的物理联赛 sheet 有少量 国家级 记录，
//   实际是 CPHO 国赛成绩（被错记到联赛），需要重命名为 CPHO<year>
//   物理之外的学科历史数据未发现此问题，保持原样
function fixPhysicsLeagueGuoSai(contest, level, academicYear) {
  if (level !== '国家级') return contest
  if (!contest.startsWith('全国中学生物理奥林匹克联赛')) return contest
  // 提取年份：优先从 contest 末尾 "（YYYY）" 取，否则用 academicYear 前 4 位
  const m = contest.match(/（(\d{4})）\s*$/)
  const year = m ? m[1] : (academicYear ? academicYear.slice(0, 4) : null)
  if (!year) return contest
  return `中国物理奥林匹克（CPHO${year}）`
}

// --- 学生名去重后缀
//   源 xlsx 早期导入会带 "王小明-1"/"王小明-2" 这样的去重后缀（同一学生在不同行重复登记）
//   统一规则：去掉末尾 "-1" 或 "-2"，前提是去掉后名字仍 ≥ 1 字符
function stripDuplicateSuffix(name) {
  if (!name) return name
  const s = String(name)
  if (s.length >= 3 && (s.endsWith('-1') || s.endsWith('-2'))) {
    return s.slice(0, -2)
  }
  return s
}

// --- 国赛名补年份后缀（CMO2024 等）
//   输入：未带年份的国赛规范名 + cert_date 或 academic_year
//   输出：'中国数学奥林匹克（CMO2024）'
const NATIONAL_ABBR = {
  '中国数学奥林匹克': 'CMO',
  '中国物理奥林匹克': 'CPHO',
  '中国化学奥林匹克': 'CChO',
  '中国生物学奥林匹克': 'CBO',
  '全国青少年信息学奥林匹克竞赛': 'NOI',
}
function applyNationalYearSuffix(contestName, certDate, academicYear) {
  const abbr = NATIONAL_ABBR[contestName]
  if (!abbr) return contestName
  let year = null
  if (certDate) {
    const m = String(certDate).match(/^(\d{4})/)
    if (m) year = m[1]
  }
  if (!year && academicYear) {
    // 无 cert_date 兜底：默认用 academicYear 前 4 位（国赛多数在 9-12 月）
    // 例外：NOI 办在 7 月（在 academicYear 后半段），用后 4 位
    year = abbr === 'NOI'
      ? String(academicYear).slice(-4)
      : String(academicYear).slice(0, 4)
  }
  return year ? `${contestName}（${abbr}${year}）` : contestName
}

// --- 联赛名补年份后缀（不带缩写）
//   输入：未带年份的联赛规范名 + academic_year
//   输出：'全国中学生数学奥林匹克联赛（2024）'
function applyLeagueYearSuffix(contestName, academicYear) {
  if (!LEAGUE_CONTESTS_FOR_SUFFIX.has(contestName)) return contestName
  if (!academicYear) return contestName
  const year = String(academicYear).slice(0, 4)
  return year ? `${contestName}（${year}）` : contestName
}
const LEAGUE_CONTESTS_FOR_SUFFIX = new Set([
  '全国中学生数学奥林匹克联赛',
  '全国中学生物理奥林匹克联赛',
  '全国中学生化学奥林匹克联赛',
  '全国中学生生物学奥林匹克联赛',
  '全国青少年信息学奥林匹克联赛',
])

// --- 信息学：只保留 联赛(NOIP) 和 国赛(NOI) 两项
// 其他（冬令营 / APIO / CTS / CSP-S / NOI 女生赛 / 厦大邀请赛 等）不入库
const INFO_NATIONAL_WHITELIST = new Set([
  '全国青少年信息学奥林匹克竞赛',
])
const INFO_LEAGUE_WHITELIST = new Set([
  '全国青少年信息学奥林匹克联赛',
])
function isInformaticsAllowed(contestName) {
  for (const n of INFO_NATIONAL_WHITELIST) if (contestName.startsWith(n)) return true
  for (const n of INFO_LEAGUE_WHITELIST)   if (contestName.startsWith(n)) return true
  return false
}

// --- 5 学科国赛/联赛白名单（前缀匹配，兼容带年份后缀的形式）
// 用户要求只保留 5 大学科 × 2 类（国赛/联赛）= 10 项规范赛事
// 数学: CMO + 全国高中数学联赛    物理: CPHO + 物理竞赛(福建)
// 化学: CChO + 化奥初赛(福建)    生物: CBO  + 生奥联赛(福建)
// 信息学: NOI + NOIP
const FIVE_SUBJECT_NATIONAL = [
  '中国数学奥林匹克',
  '中国物理奥林匹克',
  '中国化学奥林匹克',
  '中国生物学奥林匹克',
  '全国青少年信息学奥林匹克竞赛',
]
const FIVE_SUBJECT_LEAGUE = [
  '全国中学生数学奥林匹克联赛',
  '全国中学生物理奥林匹克联赛',
  '全国中学生化学奥林匹克联赛',
  '全国中学生生物学奥林匹克联赛',
  '全国青少年信息学奥林匹克联赛',
]
function isStandardContest(contestName) {
  for (const n of FIVE_SUBJECT_NATIONAL) if (contestName.startsWith(n)) return true
  for (const n of FIVE_SUBJECT_LEAGUE)   if (contestName.startsWith(n)) return true
  return false
}

// 2.xlsx 的非常规表头（2018-2019 缺表头，2024-2025 缺组别等列）
const HARDCODED_HEADERS_2 = {
  '2018-2019学年': {
    dataOffset: 0,
    columns: [
      '序号', '项目', '奥/非奥', '发奖部门', '级别', '名次', '学生姓名',
      '指导老师', '师奖金', '组别', '组奖金', '性别', '初中毕业校',
      '级别', '发证时间', '备注', '登记时间',
    ],
  },
  '2024-2025学年': {
    dataOffset: 1,  // 缺组别列；表头第 0 行，数据从第 1 行起
    columns: [
      '序号', '项目', '奥/非奥', '发奖部门', '级别', '名次', '学生姓名',
      '指导老师', '发证时间', '备注', '子项目/备注',
    ],
  },
}

// 3.xlsx 的非常规表头（多数 sheet 有 2 行 header：第 0 行标题、第 1 行表头）
// 3.xlsx 含 2.xlsx 缺失的 2019-2020/2021-2022/2022-2023/2023-2024 等学年
const HARDCODED_HEADERS_3 = {
  '2018-2019学年': {
    dataOffset: 0,  // 第 0 行就是数据（无标题行/表头行）
    columns: [
      '序号', '项目', '奥/非奥', '发奖部门', '级别', '名次', '学生姓名',
      '指导老师', '师奖金', '组别', '组奖金', '性别', '初中毕业校',
      '级别', '发证时间', '备注', '登记时间',
    ],
  },
  '2019-2020学年': {
    dataOffset: 2,
    columns: [
      '序号', '项目', '奥/非奥', '发奖部门', '级别', '名次', '学生姓名',
      '指导老师', '师奖金', '组别', '组奖金', '性别', '初中毕业校',
      '级别', '发证时间', '备注', '登记时间', '子项目/备注',
    ],
  },
  '2020-2021学年': {
    dataOffset: 2,
    columns: [
      '序号', '项目', '奥/非奥', '发奖部门', '级别', '名次', '学生姓名',
      '指导老师', '师奖金', '组别', '组奖金', '性别', '初中毕业校',
      '级别', '发证时间', '备注', '登记时间', '子项目/备注',
    ],
  },
  '2021-2022学年': {
    dataOffset: 2,
    columns: [
      '序号', '项目', '奥/非奥', '发奖部门', '级别', '名次', '学生姓名',
      '指导老师', '师奖金', '组别', '组奖金', '性别', '初中毕业校',
      '级别', '发证时间', '备注', '登记时间',
    ],
  },
  '2022-2023学年': {
    dataOffset: 2,
    columns: [
      '序号', '项目', '奥/非奥', '发奖部门', '级别', '名次', '学生姓名',
      '指导老师', '师奖金', '组别', '组奖金', '性别', '初中毕业校',
      '级别', '发证时间', '备注', '登记时间',
    ],
  },
  '2023-2024学年': {
    dataOffset: 2,  // 11 列；缺师奖金/组别/性别/初中毕业校/级别/登记时间（无组别，学科从 contest 推断）
    columns: [
      '序号', '项目', '奥/非奥', '发奖部门', '级别', '名次', '学生姓名',
      '指导老师', '发证时间', '备注', '子项目/备注',
    ],
  },
  '2024-2025学年': {
    dataOffset: 1,  // 8 列；缺师奖金/组别/组奖金/性别/初中毕业校/级别/登记时间/发证时间/备注
    columns: [
      '序号', '项目', '奥/非奥', '发奖部门', '级别', '名次', '学生姓名',
      '指导老师',
    ],
  },
}

// === main ===
function main() {
  mkdirSync(path.dirname(DB_PATH), { recursive: true })
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)

  db.exec('DELETE FROM awards') // 幂等：清空后重灌

  const stats = { bySheet: {}, bySubject: {}, unknownRows: [], totalInserted: 0, deduped: 0 }
  const insert = db.prepare(`
    INSERT INTO awards (
      academic_year, contest_name, is_olympiad, issuer, award_level, award,
      student_name, instructor, instructor_bonus, subject, group_bonus,
      gender, middle_school, student_grade, cert_date, notes, registration_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertMany = db.transaction((rows) => {
    for (const r of rows) insert.run(...r)
  })

  // 跨 sheet 去重：按 (学生, 学年, 赛事(去年份后缀), 学科, 级别, 奖项) 保留首条
  // 源数据中，"近几年国赛成绩统计" sheet 与各学年 sheet 在国赛记录上交叉重复
  // 重复记录的 instructor 字段是合并多人版（"唐好杰、黄舰印"），应丢弃
  // 注意：去年份后缀后再 dedup，避免"副指导老师"行（无 cert_date → academicYear 兜底
  // → 年份错位）被错认为不同赛事
  const stripYearSuffix = (n) => String(n || '').replace(/\s*[（(](?:\w*\d{4}|\d{4})[)）]\s*$/, '')
  const seen = new Set()
  const dedupKey = (r) => `${r[6]}|${r[0]}|${stripYearSuffix(r[1])}|${r[9]}|${r[4] || ''}|${r[5] || ''}`
  //              student_name    academic_year contest(无年份) subject   award_level award
  //              ↑ 索引 6        ↑ 0            ↑ 1              ↑ 9      ↑ 4         ↑ 5

  // 依次读 2.xlsx → 3.xlsx（2 优先，3 补充 2 缺失的学年：2019-2020/2021-2022/2022-2023/2023-2024）
  const sources = [
    { path: XLSX_PATH, headers: HARDCODED_HEADERS_2, label: '2.xlsx' },
    { path: XLSX_PATH_3, headers: HARDCODED_HEADERS_3, label: '3.xlsx' },
  ]
  for (const src of sources) {
    if (!existsSync(src.path)) {
      console.log(`  ↳ ${src.label}: 跳过（文件不存在: ${src.path}）`)
      continue
    }
    console.log(`\nReading xlsx: ${src.path}`)
    const buf = readFileSync(src.path)
    const wb = XLSX.read(buf, { cellDates: false, raw: true })
    for (const sheetName of wb.SheetNames) {
      if (sheetName === 'Sheet10') {
        console.log(`  ↳ ${sheetName}: 跳过（参考清单）`)
        continue
      }
      let rows = []
      const tag = `${src.label} / ${sheetName}`
      if (sheetName === '近几年国赛成绩统计') {
        rows = parseGuoSaiSheet(wb.Sheets[sheetName], stats)
      } else {
        const academicYear = sheetName.replace(/学年$/, '')
        rows = parseYearSheet(sheetName, wb.Sheets[sheetName], academicYear, stats, src.headers)
      }
      const before = rows.length
      rows = rows.filter(r => {
        const k = dedupKey(r)
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      stats.deduped += before - rows.length
      if (rows.length) insertMany(rows)
      stats.bySheet[tag] = rows.length
      stats.totalInserted += rows.length
    }
  }

  seedAdmin(db)

  // 报告
  console.log('\n=== 导入报告 ===')
  console.log('数据库:        ', DB_PATH)
  console.log('总插入:        ', stats.totalInserted, '行')
  console.log('跨 sheet 去重: ', stats.deduped, '行（按 学生+学年+赛事+学科+级别+奖项 保留首条）')
  console.log('\n按 sheet:')
  for (const [k, v] of Object.entries(stats.bySheet)) {
    console.log(`  ${k.padEnd(28)} ${v}`)
  }
  console.log('\n按学科:')
  for (const [k, v] of Object.entries(stats.bySubject)) {
    const mark = k === 'UNKNOWN' ? ' ⚠' : ''
    console.log(`  ${k.padEnd(10)} ${v}${mark}`)
  }
  if (stats.unknownRows.length) {
    console.log(`\n⚠ ${stats.unknownRows.length} 行无法识别学科（前 10 条）:`)
    stats.unknownRows.slice(0, 10).forEach(r => {
      console.log(`  · ${r.sheet.padEnd(28)} | ${r.contest} | ${r.student}`)
    })
  } else {
    console.log('\n✓ 全部行都识别出学科')
  }

  db.close()
}

function parseYearSheet(sheetName, ws, academicYear, stats, hardcodedHeaders) {
  if (!ws['!ref']) return []
  const range = XLSX.utils.decode_range(ws['!ref'])
  const rows = []

  // 读/注入表头
  let header
  let dataStartRow
  if (hardcodedHeaders[sheetName]) {
    const cfg = hardcodedHeaders[sheetName]
    header = cfg.columns
    dataStartRow = range.s.r + cfg.dataOffset
  } else {
    header = []
    for (let c = range.s.c; c <= range.e.c; c++) {
      const v = ws[XLSX.utils.encode_cell({ r: range.s.r, c })]
      header.push(v ? String(v.v).trim() : '')
    }
    dataStartRow = range.s.r + 1
  }

  // 列索引（兼容表头有/无重复"级别"的情况）
  const findCol = name => header.indexOf(name)
  const levelFirst = header.indexOf('级别')
  const levelLast = header.lastIndexOf('级别')
  const col = {
    序号: findCol('序号'),
    项目: findCol('项目'),
    奥非奥: findCol('奥/非奥'),
    发奖部门: findCol('发奖部门'),
    级别1: levelFirst,                          // 国家级/省级
    级别2: levelFirst !== levelLast ? levelLast : -1, // 学生年级（仅当存在重复"级别"时）
    名次: findCol('名次'),
    学生姓名: findCol('学生姓名'),
    指导老师: findCol('指导老师'),
    师奖金: findCol('师奖金'),
    组别: findCol('组别'),
    组奖金: findCol('组奖金'),
    性别: findCol('性别'),
    初中毕业校: findCol('初中毕业校'),
    发证时间: findCol('发证时间'),
    备注: findCol('备注'),
    登记时间: findCol('登记时间'),
  }

  const getCell = (r, c) => {
    if (c < 0) return null
    const v = ws[XLSX.utils.encode_cell({ r, c })]
    return v ? v.v : null
  }

  for (let r = dataStartRow; r <= range.e.r; r++) {
    const studentName = stripDuplicateSuffix(trim(getCell(r, col.学生姓名)))
    if (!studentName) continue
    const baseContest = normalizeContestName(asText(getCell(r, col.项目)))
    if (!baseContest) {
      // 极少数行：项目列为空（如 2023-2024 r46 王星州），无法归一化，跳过
      stats.unknownRows.push({ sheet: sheetName, contest: '(空)', student: studentName })
      continue
    }

    const rawContest = applyLeagueYearSuffix(
      applyNationalYearSuffix(
        baseContest,
        asText(getCell(r, col.发证时间)),
        academicYear,
      ),
      academicYear,
    )
    // 物理 联赛 国家级 误标修正：联赛名 → CPHO<year>
    const contest = fixPhysicsLeagueGuoSai(
      rawContest,
      asText(getCell(r, col.级别1)),
      academicYear,
    )
    let subject = asText(getCell(r, col.组别))
    // 归一化：源数据用"信息"/"信息学"两种写法，统一为"信息学"
    if (subject === '信息') subject = '信息学'
    if (!subject) {
      subject = inferSubject(contest)
      if (subject === 'UNKNOWN') {
        subject = '其他'
        stats.unknownRows.push({ sheet: sheetName, contest, student: studentName })
      }
    }
    // 过滤：跨学科活动（科学创新/数学文化节）非五大学科奥赛
    if (subject === '通用' || subject === '其他') continue
    // 过滤：5 大学科只保留 10 项规范赛事（5 国赛 + 5 联赛）
    // 排除东南赛/冬令营/CGMO/希望联盟/福建省高一/冬令营/厦大等
    if (!isStandardContest(contest)) continue
    // 过滤：信息学只保留 联赛(NOIP) + 国赛(NOI)（已被 isStandardContest 涵盖，保留作防御）
    if (subject === '信息学' && !isInformaticsAllowed(contest)) continue
    // 过滤：市级 / 校级 记录（用户已确认只保留国家级 + 省级）
    const level = asText(getCell(r, col.级别1))
    if (level === '市级' || level === '校级') continue
    // 过滤：award 为空（只有"国家级"/"省级"级别名但无具体奖项）的记录不入库
    // 例：2018-2019 化学 联赛部分行 名次(award) 留空
    const awardRaw = asText(getCell(r, col.名次))
    if (!awardRaw) continue

    rows.push([
      academicYear,
      contest,
      asText(getCell(r, col.奥非奥)),
      asText(getCell(r, col.发奖部门)),
      asText(getCell(r, col.级别1)),
      asText(getCell(r, col.名次)),
      studentName,
      trim(getCell(r, col.指导老师)),
      asInt(getCell(r, col.师奖金)),
      subject,
      asInt(getCell(r, col.组奖金)),
      trim(getCell(r, col.性别)),
      asText(getCell(r, col.初中毕业校)),
      col.级别2 >= 0 ? asText(getCell(r, col.级别2)) : null,
      asText(getCell(r, col.发证时间)),
      asText(getCell(r, col.备注)),
      asText(getCell(r, col.登记时间)),
    ])

    stats.bySubject[subject] = (stats.bySubject[subject] || 0) + 1
  }

  return rows
}

function parseGuoSaiSheet(ws, stats) {
  if (!ws['!ref']) return []
  const range = XLSX.utils.decode_range(ws['!ref'])
  const rows = []
  let currentSubject = null

  const getCell = (r, c) => {
    if (c < 0) return null
    const v = ws[XLSX.utils.encode_cell({ r, c })]
    return v ? v.v : null
  }

  for (let r = range.s.r; r <= range.e.r; r++) {
    const c0Raw = getCell(r, 0)
    const c0 = trim(c0Raw)
    const c1 = trim(getCell(r, 1))

    // 段标题: 单格 string 是学科
    if (c0 && !c1 && ['数学', '物理', '化学', '生物', '信息'].includes(c0)) {
      currentSubject = c0 === '信息' ? '信息学' : c0
      continue
    }
    // 表头行
    if (c0 === '序号' && c1 === '项目') continue

    // 数据行: currentSubject 已设, c1 是项目名, c0Raw 是数字序号
    if (currentSubject && c1 && typeof c0Raw === 'number') {
      const studentName = stripDuplicateSuffix(trim(getCell(r, 3)))
      if (!studentName) continue
      const contestBase = normalizeContestName(asText(c1))
      const { level, award } = splitAward(asText(getCell(r, 2)))
      // 过滤：只有级别名（"国家级"/"省级"）但无具体奖项的记录不入库
      // 例：2018-2019 化学 联赛部分行 award 留空
      if (!award) continue
      const instructor = trim(getCell(r, 4))
      const certDateRaw = getCell(r, 5)
      const certDate = certDateRaw != null ? String(certDateRaw) : null
      const academicYear = inferAcademicYear(certDate)
      const contest = applyLeagueYearSuffix(
        applyNationalYearSuffix(contestBase, certDate, academicYear),
        academicYear,
      )
      // 过滤：5 大学科只保留 10 项规范赛事
      if (!isStandardContest(contest)) continue
      // 过滤：信息学只保留 联赛(NOIP) + 国赛(NOI)
      if (currentSubject === '信息学' && !isInformaticsAllowed(contest)) continue

      rows.push([
        academicYear,                  // 从 cert_date 反推学年
        contest,
        '奥',           // 国赛默认都是"奥"
        null,           // issuer
        level,
        award,
        studentName,
        instructor,
        null,           // instructor_bonus
        currentSubject,
        null,           // group_bonus
        null,           // gender
        null,           // middle_school
        null,           // student_grade
        certDate,
        null,           // notes
        null,           // registration_date
      ])
      stats.bySubject[currentSubject] = (stats.bySubject[currentSubject] || 0) + 1
    }
  }

  return rows
}

function seedAdmin(db) {
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD === 'change-on-first-login') {
    console.log('\n⚠ ADMIN_PASSWORD 未设置或为默认值，跳过 admin 创建（请编辑 .env 后重启后端）')
    return
  }
  const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10)
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(ADMIN_USERNAME)
  if (exists) {
    console.log(`\nadmin 用户 "${ADMIN_USERNAME}" 已存在，跳过`)
    return
  }
  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(ADMIN_USERNAME, hash, 'admin')
  console.log(`\n✓ admin 用户 "${ADMIN_USERNAME}" 已创建`)
}

main()
