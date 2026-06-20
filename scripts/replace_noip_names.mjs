// 用 ssoi-web 的真实姓名替换 ssoi-mgmt data.js 中 NOIP 1995-2014 的占位符姓名。
// 替换规则：占位符 "NOIP{year}高中组{award}-{NN}" → ssoi-web awards.json 中同 (year, award) 的第 NN 个姓名。

import fs from 'node:fs'
import path from 'node:path'

const awardsPath = '/Users/zengyiqing/Documents/test/ssoi-web/src/data/awards.json'
const dataPath = '/Users/zengyiqing/Documents/test/ssoi-mgmt/frontend/src/data.js'

// 1. 从 ssoi-web 提取 (year, award) → [names]
const source = JSON.parse(fs.readFileSync(awardsPath, 'utf8'))
const nameMap = new Map() // key: "year|award" -> ordered array of names
for (const r of source) {
  if (!r.contest || !r.contest.startsWith('NOIP') || !r.contest.includes('提高')) continue
  const year = r.contest.replace(/NOIP(\d+)提高/, '$1')
  const yInt = parseInt(year)
  if (yInt < 1995 || yInt > 2014) continue
  const k = `${year}|${r.pride}`
  if (!nameMap.has(k)) nameMap.set(k, [])
  nameMap.get(k).push(r.name)
}
console.log('源数据姓名总数：', [...nameMap.values()].reduce((s, a) => s + a.length, 0))

// 2. 读 data.js，识别占位符
let txt = fs.readFileSync(dataPath, 'utf8')
const placeholderRe = /"student_name":"(NOIP(\d{4})高中组([一-龥]+)-(\d+))"/g

let replaced = 0
let missing = []
txt = txt.replace(placeholderRe, (m, name, year, award, idx) => {
  const k = `${year}|${award}`
  const list = nameMap.get(k)
  if (!list) {
    missing.push({ name, reason: '源数据中找不到该年/奖项' })
    return m
  }
  const i = parseInt(idx) - 1
  if (i < 0 || i >= list.length) {
    missing.push({ name, reason: `序号 ${idx} 越界（源数据中仅 ${list.length} 人）` })
    return m
  }
  replaced++
  return `"student_name":"${list[i]}"`
})

console.log('替换成功：', replaced)
console.log('失败：', missing.length)
if (missing.length) console.log(missing)

fs.writeFileSync(dataPath, txt)
console.log('已写入', dataPath)
