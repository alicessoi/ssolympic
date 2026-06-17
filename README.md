# 双十中学五大学科竞赛管理网站 (ssoi-mgmt)

> v1 — 全栈 Web 系统：5 学科独立查询 + 跨学科汇总（表格/图表）+ Excel 导出 + 登录骨架。
> 数据源：`../ssdata/2.xlsx`。

## 技术栈

- 前端：Vite + React 18 + React Router v6 (HashRouter) + recharts
- 后端：Node 20 + Express + better-sqlite3 + JWT + bcrypt
- 数据导入：Node 脚本（`scripts/import_xlsx.mjs`）+ SheetJS
- 单进程部署：后端同时托管前端静态文件

## 快速开始

```bash
# 1. 安装依赖（根目录用 npm workspaces 一次装完）
npm install

# 2. 准备 .env
cp .env.example .env
# 编辑 .env：把 JWT_SECRET 改成长随机串，ADMIN_PASSWORD 改成你要的初始密码

# 3. 导入 Excel 数据到 SQLite
npm run import

# 4. 开发模式（前后端一起启）
npm run dev
# → 前端 http://localhost:5173
# → 后端 http://localhost:3001

# 5. 生产模式（单进程）
npm run build
npm start
# → http://localhost:3001（同时是 API 和前端）
```

## 部署到校园内网

- `npm run build` 一次，构建产物在 `frontend/dist/`
- 把整个项目（除 `node_modules/`）拷到内网服务器
- 服务器上 `npm install --production`（只装生产依赖）
- 启动：`JWT_SECRET=<长随机串> ADMIN_PASSWORD=<强密码> node backend/src/server.js`
- 反向代理（Nginx/Caddy）把 :80/:443 转 :3001 即可
- **Windows 部署前置**：`better-sqlite3` 是 native 模块，需先装
  [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
  或 `npm install -g windows-build-tools`，再 `npm install`

## 目录结构

```
ssoi-mgmt/
├── package.json              # workspaces: backend, frontend
├── .env.example
├── scripts/
│   └── import_xlsx.mjs       # Excel → SQLite 一站式
├── backend/
│   ├── package.json
│   ├── src/
│   │   ├── server.js         # Express 入口 + 静态托管
│   │   ├── db.js             # SQLite 初始化 + schema
│   │   ├── auth.js           # JWT/bcrypt/cookie
│   │   ├── exportExcel.js
│   │   ├── middleware/
│   │   │   ├── rateLimit.js
│   │   │   └── requireAuth.js
│   │   └── routes/
│   │       ├── auth.js
│   │       ├── awards.js
│   │       ├── summary.js
│   │       ├── export.js
│   │       └── healthz.js
│   └── data/                 # ssoi.db 落盘处（gitignore）
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── api.js
        ├── auth.jsx
        ├── theme.css
        ├── styles.css
        ├── components/       # FilterBar, AwardTable, SubjectChart, ExportButton, NavBar, Layout
        └── pages/            # Home, Login, Subject, Summary, Announcements, Help
```

## API 速查

| Method | Path | 说明 |
|---|---|---|
| `GET`  | `/api/healthz` | 健康检查 + 总记录数 |
| `POST` | `/api/auth/login` | 登录拿 JWT cookie |
| `POST` | `/api/auth/logout` | 登出清 cookie |
| `GET`  | `/api/auth/me` | 当前登录用户 |
| `GET`  | `/api/awards?subject=&academic_year=&award_level=&award=&keyword=&page=&limit=&sort=` | 列表 + 筛选 + 排序 |
| `GET`  | `/api/awards/years?subject=` | 某学科可选学年 |
| `GET`  | `/api/summary?academic_year=` | 跨学科聚合（byYear / bySubject / byAward） |
| `GET`  | `/api/export?...` | Excel 下载（与 /api/awards 同筛选） |

读接口匿名可访问；写接口（v1 仅 `/api/auth/*`）需登录。后续 CRUD 模块在 v2 加入。

## 主题色

沿用双十校园信息化系统配色（与 `../ssoi-web` 保持一致）：

- 主色 `--primary: #3182CE`（深蓝）
- 辅色 `--secondary: #2c5282`（深蓝加深）
- 强调 `--accent: #ed8936`（橙）
- 背景 `--bg: #f7fafc`
- 文本 `--text: #2d3748`
- 边框 `--border: #e2e8f0`

## 数据规范

数据库单表 `awards`，字段：academic_year / contest_name / is_olympiad / issuer / award_level / award / student_name / instructor / instructor_bonus / subject / group_bonus / gender / middle_school / student_grade / cert_date / notes / registration_date。

导入脚本处理 `2.xlsx` 的 7 个数据坑（缺表头、缺学科列、级别字段重名、空行过滤、姓名 trim、合并奖项字符串拆分等），详见 `scripts/import_xlsx.mjs` 顶部注释。
