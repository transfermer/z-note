import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import type { MiddlewareHandler } from 'hono'
import db from '../../server/index.js'
import { nanoid } from 'nanoid'
import bcrypt from 'bcryptjs'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import {
  getSetting,
  getSettings,
  setSetting
} from './services/settings.js'
import { backupScheduler } from './services/backup-scheduler.js'
import { requireAuth } from './middleware/auth.js'
import svgCaptcha from 'svg-captcha'
import { generateToken, verifyToken, generateSessionId } from './utils/jwt.js'
import { LogService, LOG_ACTIONS } from './services/log-service.js'

const app = new Hono()

/* Installation */

// 檢查是否已安裝
function isInstalled(): boolean {
  const installed = getSetting('system.installed') === '1'
  return installed
}

// 安裝檢查中介軟體
const requireInstallation: MiddlewareHandler = async (c, next) => {
  // 跳過安裝相關的API
  if (c.req.path.startsWith('/api/install') || c.req.path === '/api/settings/public') {
    await next()
    return
  }
  
  if (!isInstalled()) {
    return c.json({ error: 'NOT_INSTALLED', redirect: '/install' }, 503)
  }
  await next()
}

// 防止重複安裝中介軟體
const preventReinstall: MiddlewareHandler = async (c, next) => {
  if (isInstalled()) {
    return c.json({ error: 'ALREADY_INSTALLED' }, 400)
  }
  await next()
}

app.post('/api/install', preventReinstall, async c => {
  const { siteTitle, adminEmail, adminPassword } = await c.req.json()

  // 驗證輸入
  if (!siteTitle?.trim()) {
    return c.json({ error: 'Site title is required' }, 400)
  }

  if (!adminEmail?.trim() || !adminEmail.includes('@')) {
    return c.json({ error: 'Valid admin email is required' }, 400)
  }

  if (!adminPassword || adminPassword.length < 6) {
    return c.json({ error: 'Admin password must be at least 6 characters' }, 400)
  }

  try {
    // 生成密碼雜湊
    const passwordHash = await bcrypt.hash(adminPassword, 10)

    // 設定基本配置
    setSetting('site.title', siteTitle.trim())
    setSetting('site.logo', '/logo.png')
    setSetting('site.favicon', '/favicon.png')
    setSetting('site.avatar_prefix', 'https://www.gravatar.com/avatar/')
    
    setSetting('admin.email', adminEmail.trim())
    setSetting('admin.password_hash', passwordHash)
    
    // 設定預設的登入配置
    setSetting('login.enable_captcha', '0')
    setSetting('login.enable_turnstile', '0')
    setSetting('login.turnstile_site_key', '')
    setSetting('login.turnstile_secret_key', '')
    setSetting('login.enable_github', '0')
    setSetting('github.client_id', '')
    setSetting('github.client_secret', '')
    
    // 設定預設的鎖屏配置
    setSetting('lockscreen.enabled', '0')
    setSetting('lockscreen.password', '')
    
    // 設定預設的WebDAV配置
    setSetting('webdav.url', '')
    setSetting('webdav.user', '')
    setSetting('webdav.password', '')
    
    // 設定預設的上傳配置
    setSetting('upload.max_file_size', '10') // 預設10MB
    
    // 標記為已安裝
    setSetting('system.installed', '1')

    return c.json({ success: true, message: 'Installation completed' })
  } catch (error) {
    return c.json({ error: 'Installation failed' }, 500)
  }
})

// 獲取安裝狀態
app.get('/api/install/status', c => {
  const installed = isInstalled()
  return c.json({ installed })
})

/* Captcha */
app.get('/api/captcha', c => {
  const captcha = svgCaptcha.create({
    size: 4,
    noise: 2,
    background: '#f4f4f5'
  })

  // 儲存到 Cookie（5 分鐘）
  setCookie(c, 'captcha', captcha.text.toLowerCase(), {
    httpOnly: true,
    maxAge: 300,
    path: '/'
  })

  return c.json({
    svg: captcha.data
  })
})

// ... (server/index.ts 內容已歸檔到 functions/server/index.ts)

export default app
