import { api } from '../api.js'

export default function ExportButton({ filters, label = '导出 Excel' }) {
  const handleClick = () => {
    const url = api.exportUrl(filters)
    window.open(url, '_blank')
  }
  return (
    <button className="btn btn-accent" onClick={handleClick}>
      {label}
    </button>
  )
}