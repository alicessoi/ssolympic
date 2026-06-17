export default function Help() {
  return (
    <div>
      <h1 className="page-title">使用帮助</h1>
      <div className="card">
        <h3 className="section-title">如何查询</h3>
        <ul style={{ paddingLeft: '1.5rem' }}>
          <li>在顶部导航选择学科（数学/物理/化学/生物/信息学）进入单学科页。</li>
          <li>通过筛选条件（学年/奖项级别/奖项/关键词）缩小范围。</li>
          <li>点击表头切换排序；通过分页浏览全部结果。</li>
          <li>点击「导出 Excel」将当前筛选结果下载为 .xlsx 文件。</li>
        </ul>
      </div>
      <div className="card">
        <h3 className="section-title">汇总页</h3>
        <p>汇总页展示全部五学科数据，可按学科、年度、奖项维度查看柱状图/饼图。</p>
      </div>
      <div className="card">
        <h3 className="section-title">登录</h3>
        <p>v1 版本登录为管理员入口，用于后续 CRUD、批量导入、公告发布等写操作（v2 开放）。</p>
        <p className="muted" style={{ marginTop: '0.5rem' }}>默认管理员用户名: <code>admin</code>，初始密码见部署文档。</p>
      </div>
      <div className="card">
        <h3 className="section-title">数据来源</h3>
        <p>所有记录源自校内登记的 Excel 名册，由 <code>scripts/import_xlsx.mjs</code> 导入 SQLite。</p>
      </div>
    </div>
  )
}