import { getCookie, deleteCookie } from 'hono/cookie'
import type { MiddlewareHandler } from 'hono'
import { verifyToken } from '../utils/jwt.js'

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const token = getCookie(c, 'auth_token')
  const sessionId = getCookie(c, 'session_id')
  
  if (!token || !sessionId) {
    return c.json({ error: 'UNAUTHORIZED' }, 401)
  }

  // 驗證JWT token
  const payload = await verifyToken(token) as any
  if (!payload) {
    // 清除無效的token
    deleteCookie(c, 'auth_token', { path: '/' })
    deleteCookie(c, 'session_id', { path: '/' })
    return c.json({ error: 'INVALID_TOKEN' }, 401)
  }

  // 將使用者資訊新增到上下文中
  c.set('user', payload)
  
  await next()
}
