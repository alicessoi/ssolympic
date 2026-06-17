const BASE = ''

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })
  if (!res.ok) {
    let body
    try { body = await res.json() } catch { body = { message: res.statusText } }
    const err = new Error(body.message || `HTTP ${res.status}`)
    err.status = res.status
    err.body = body
    throw err
  }
  const ct = res.headers.get('content-type') || ''
  return ct.includes('application/json') ? res.json() : res.blob()
}

function qs(params) {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') u.set(k, v)
  }
  return u.toString()
}

export const api = {
  awards(params) {
    return request('/api/awards?' + qs(params))
  },
  years(subject) {
    return request('/api/awards/years?' + qs({ subject }))
  },
  contests(subject, academicYear) {
    return request('/api/awards/contests?' + qs({ subject, academic_year: academicYear }))
  },
  summary() {
    return request('/api/summary')
  },
  awardsByYearSubject(params) {
    return request('/api/summary/awards-by-year-subject?' + qs(params))
  },
  awardsByYearSubjectExportUrl(params) {
    return '/api/summary/awards-by-year-subject/export?' + qs(params)
  },
  exportUrl(params) {
    return '/api/export?' + qs(params)
  },
  login(username, password) {
    return request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
  },
  logout() {
    return request('/api/auth/logout', { method: 'POST' })
  },
  me() {
    return request('/api/auth/me')
  },
}

export { request }