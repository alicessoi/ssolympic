import rateLimit from 'express-rate-limit'

// /api/awards 限流：每 IP 每分钟 100 次
export const awardsRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: '请求过于频繁，请稍后再试' },
})

// 登录端点更严：每 IP 每分钟 10 次，防爆破
export const loginRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: '登录尝试过于频繁' },
})
