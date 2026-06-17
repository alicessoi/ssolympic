import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

// 本文件必须被最先 import：在任何业务模块读 process.env 之前加载 .env
const __dirname = dirname(fileURLToPath(import.meta.url))
const BACKEND_DIR = resolve(__dirname, '..')
const ROOT_DIR = resolve(BACKEND_DIR, '..')

dotenv.config({ path: resolve(ROOT_DIR, '.env') })
dotenv.config({ path: resolve(BACKEND_DIR, '.env'), override: false })