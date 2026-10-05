// Cloudflare Pages Functions 完整應用實現
import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { nanoid } from 'nanoid'

// Web Crypto based JWT helpers for Cloudflare Workers
async function generateToken(payload: any, secret?: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' }
  const jwtSecret = secret || 'default-secret'
  const encoder = new TextEncoder()
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const data = headerB64 + '.' + payloadB64
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(jwtSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return data + '.' + signatureB64
}

async function verifyToken(token: string, secret?: string): Promise<any> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [headerB64, payloadB64, signatureB64] = parts
    const jwtSecret = secret || 'default-secret'
    const encoder = new TextEncoder()
    const data = headerB64 + '.' + payloadB64
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(jwtSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )
    const signature = Uint8Array.from(atob(signatureB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
    const isValid = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(data))
    if (!isValid) return null
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')))
    return payload
  } catch (error) {
    return null
  }
}

function generateSessionId(): string {
  return nanoid()
}

// Password hashing using Web Crypto with salt and iterations
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  
  // Generate a random salt
  const salt = crypto.getRandomValues(new Uint8Array(16))
  
  // Import the password as a key
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  
  // Derive a key using PBKDF2 with 100,000 iterations
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    passwordKey,
    256
  )
  
  // Combine salt and hash
  const hashArray = new Uint8Array(derivedBits)
  const combined = new Uint8Array(salt.length + hashArray.length)
  combined.set(salt)
  combined.set(hashArray, salt.length)
  
  // Convert to base64
  return btoa(String.fromCharCode(...combined))
}

async function comparePassword(password: string, stored: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder()
    
    // Decode the stored hash
    const combined = Uint8Array.from(atob(stored), c => c.charCodeAt(0))
    const salt = combined.slice(0, 16)
    const storedHash = combined.slice(16)
    
    // Import the password as a key
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    )
    
    // Derive the same key
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      passwordKey,
      256
    )
    
    const hashArray = new Uint8Array(derivedBits)
    
    // Compare hashes
    if (hashArray.length !== storedHash.length) return false
    
    let result = 0
    for (let i = 0; i < hashArray.length; i++) {
      result |= hashArray[i] ^ storedHash[i]
    }
    
    return result === 0
  } catch (error) {
    return false
  }
}

// Define the environment and variables types for Hono
type Bindings = {
  DB?: any
  JWT_SECRET?: string
}

type Variables = {
  db: any
  user?: any
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// D1 wrapper helpers
function dbPrepare(rawDb: any, sql: string) {
  return {
    async get(...params: any[]) {
      const stmt = rawDb.prepare(sql)
      if (params.length > 0) {
        const r = await stmt.bind(...params).first()
        return r || null
      }
      const r = await stmt.first()
      return r || null
    },
    async all(...params: any[]) {
      const stmt = rawDb.prepare(sql)
      const r = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all()
      return r.results || []
    },
    async run(...params: any[]) {
      const stmt = rawDb.prepare(sql)
      const r = params.length > 0 ? await stmt.bind(...params).run() : await stmt.run()
      return { changes: r.changes || 0, lastInsertRowid: r.meta?.last_row_id ?? null }
    }
  }
}

function createDbWrapper(env: Bindings) {
  const raw = env?.DB
  if (!raw) throw new Error('D1 binding not found (env.DB)')
  return {
    prepare(sql: string) {
      return dbPrepare(raw, sql)
    },
    async isInstalled() {
      try {
        const r = await raw.prepare('SELECT value FROM settings WHERE key = ?').bind('system.installed').first()
        return r?.value === '1'
      } catch (error) {
        // If table doesn't exist, system is not installed
        return false
      }
    }
  }
}

// 資料庫schema
const DATABASE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT,
    content TEXT,
    tags TEXT,
    category_id TEXT,
    created_at INTEGER,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS shares (
    id TEXT PRIMARY KEY,
    note_id TEXT,
    password TEXT,
    expires_at INTEGER,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS trash (
    id TEXT PRIMARY KEY,
    title TEXT,
    content TEXT,
    tags TEXT,
    category_id TEXT,
    created_at INTEGER,
    updated_at INTEGER,
    deleted_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    details TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at INTEGER NOT NULL
  );
`;

// 獲取當前環境的基礎URL
function getBaseUrl(c: any): { apiUrl: string, frontendUrl: string } {
  const host = c.req.header('host') || 'localhost:9915'
  const protocol = c.req.header('x-forwarded-proto') || 
                   c.req.header('cf-visitor') ? 'https' : 
                   (host.includes('localhost') ? 'http' : 'https')
  
  // Cloudflare Pages環境
  const baseUrl = `${protocol}://${host}`
  return {
    apiUrl: baseUrl,
    frontendUrl: baseUrl
  }
}

// 中介軟體：初始化資料庫
app.use('*', async (c, next) => {
  try {
    const db = createDbWrapper(c.env)
    c.set('db', db)
    await next()
  } catch (err) {
    console.error('D1 binding not found:', err)
    return c.json({ error: 'D1 binding not found' }, 500)
  }
})

// 認證中介軟體
const requireAuth = async (c: any, next: any) => {
  const token = getCookie(c, 'auth_token')
  const sessionId = getCookie(c, 'session_id')
  
  if (!token || !sessionId) {
    return c.json({ error: 'UNAUTHORIZED', reason: 'missing_cookies' }, 401)
  }

  const payload = await verifyToken(token)
  if (!payload) {
    return c.json({ error: 'UNAUTHORIZED', reason: 'invalid_token' }, 401)
  }

  c.set('user', payload)
  await next()
}

// 安裝檢查中介軟體
const requireInstallation = async (c: any, next: any) => {
  // 跳過安裝相關的API
  if (c.req.path.startsWith('/api/install') || c.req.path === '/api/settings/public') {
    await next()
    return
  }
  
  const db = c.get('db') as any
  const isInstalled = await db.isInstalled()
  if (!isInstalled) {
    return c.json({ error: 'NOT_INSTALLED', redirect: '/install' }, 503)
  }
  await next()
}

// 防止重複安裝中介軟體
const preventReinstall = async (c: any, next: any) => {
  const db = c.get('db') as any
  const isInstalled = await db.isInstalled()
  if (isInstalled) {
    return c.json({ error: 'ALREADY_INSTALLED' }, 400)
  }
  await next()
}

// 健康檢查
app.get('/api/health', (c) => {
  return c.json({ 
    status: 'ok', 
    platform: 'cloudflare-pages',
    database: 'd1',
    timestamp: new Date().toISOString()
  })
})

// 安裝狀態檢查
app.get('/api/install/status', async (c) => {
  const db = c.get('db') as any
  try {
    const isInstalled = await db.isInstalled()
    return c.json({ installed: isInstalled })
  } catch (error) {
    return c.json({ installed: false, error: 'Database check failed' })
  }
})

// 日誌記錄輔助函式
async function logAction(db: any, params: {
  user_id: string
  action: string
  target_type?: string
  target_id?: string
  details?: any
  ip_address?: string
  user_agent?: string
}): Promise<void> {
  try {
    const id = nanoid()
    const created_at = Date.now()
    
    await db.prepare(`
      INSERT INTO logs (id, user_id, action, target_type, target_id, details, ip_address, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.user_id,
      params.action,
      params.target_type || null,
      params.target_id || null,
      params.details ? JSON.stringify(params.details) : null,
      params.ip_address || null,
      params.user_agent || null,
      created_at
    )
  } catch (error) {
    console.error('Failed to log action:', error)
  }
}

// 獲取日誌列表
app.get('/api/logs', requireAuth, async (c) => {
  const db = c.get('db') as any
  
  try {
    const page = parseInt(c.req.query('page') || '1')
    const limit = parseInt(c.req.query('limit') || '50')
    const action = c.req.query('action')
    const targetType = c.req.query('target_type')
    const startDate = c.req.query('start_date')
    const endDate = c.req.query('end_date')
    
    const offset = (page - 1) * limit
    
    let whereClause = 'WHERE 1=1'
    const queryParams: any[] = []
    
    if (action) {
      whereClause += ' AND action = ?'
      queryParams.push(action)
    }
    
    if (targetType) {
      whereClause += ' AND target_type = ?'
      queryParams.push(targetType)
    }
    
    if (startDate) {
      whereClause += ' AND created_at >= ?'
      queryParams.push(parseInt(startDate))
    }
    
    if (endDate) {
      whereClause += ' AND created_at <= ?'
      queryParams.push(parseInt(endDate))
    }
    
    // 獲取總數
    const totalResult = await db.prepare(`SELECT COUNT(*) as count FROM logs ${whereClause}`).get(...queryParams) as any
    const total = totalResult?.count || 0
    
    // 獲取日誌列表
    const logs = await db.prepare(`
      SELECT * FROM logs ${whereClause} 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `).all(...queryParams, limit, offset)
    
    // 解析details欄位
    const parsedLogs = logs.map((log: any) => ({
      ...log,
      details: log.details ? JSON.parse(log.details) : null
    }))
    
    return c.json({
      logs: parsedLogs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    })
  } catch (error) {
    console.error('Error fetching logs:', error)
    return c.json({ error: 'Failed to fetch logs' }, 500)
  }
})

// 清理舊日誌
app.delete('/api/logs/cleanup', requireAuth, async (c) => {
  const db = c.get('db') as any
  
  try {
    const { days = 90 } = await c.req.json()
    const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000)
    
    const result = await db.prepare('DELETE FROM logs WHERE created_at < ?').run(cutoffTime)
    
    return c.json({ 
      ok: true, 
      deletedCount: result.changes || 0,
      message: `Deleted logs older than ${days} days`
    })
  } catch (error) {
    console.error('Error cleaning up logs:', error)
    return c.json({ error: 'Failed to cleanup logs' }, 500)
  }
})

// 安裝介面
app.post('/api/install', preventReinstall, async (c) => {
  const db = c.get('db') as any
  
  try {
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

    // 初始化資料庫結構
    const statements = DATABASE_SCHEMA.split(';').filter(stmt => stmt.trim())
    for (const stmt of statements) {
      if (stmt.trim()) {
        await db.prepare(stmt).run()
      }
    }

    // 生成密碼雜湊
    const passwordHash = await hashPassword(adminPassword)

    // 設定基本配置
    const settings = [
      ['site.title', siteTitle.trim()],
      ['site.logo', '/logo.png'],
      ['site.favicon', '/favicon.png'],
      ['site.avatar_prefix', 'https://www.gravatar.com/avatar/'],
      ['admin.email', adminEmail.trim()],
      ['admin.password_hash', passwordHash],
      ['login.enable_captcha', '0'],
      ['login.enable_turnstile', '0'],
      ['login.turnstile_site_key', ''],
      ['login.turnstile_secret_key', ''],
      ['login.enable_github', '0'],
      ['github.client_id', ''],
      ['github.client_secret', ''],
      ['lockscreen.enabled', '0'],
      ['lockscreen.password', ''],
      ['webdav.url', ''],
      ['webdav.user', ''],
      ['webdav.password', ''],
      ['upload.max_file_size', '10'],
      ['language', 'zh'],
      ['system.installed', '1']
    ]

    for (const [key, value] of settings) {
      await db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(key, value, Date.now())
    }

    // 初始化預設分類
    await db.prepare('INSERT OR REPLACE INTO categories (id, name, created_at) VALUES (?, ?, ?)').run('default', '預設', Date.now())

    // 初始化預設筆記
    const noteContent = `# Z Note

Z Note 是一款**輕量級、可完全自託管的個人筆記系統**，由您自行部署和管理，專為注重**隱私、安全與可控性**的使用者設計。系統支援 Markdown 編輯、分類管理、標籤系統和全文檢索，提供流暢的寫作體驗與清晰的知識結構。

## 🌟 核心優勢

### 🔐 完全的資料控制權
- **自託管部署**：所有資料僅儲存在您自己的伺服器中
- **無第三方依賴**：不依賴任何雲服務，確保完全的資料所有權
- **隱私保護**：資料永遠不會離開您的控制範圍

### 📝 強大的筆記功能
- **Markdown 編輯**：實時預覽的 Markdown 編輯器，支援豐富的語法
- **分類管理**：靈活的分類系統，構建清晰的知識結構
- **標籤系統**：多維度標籤管理，快速定位相關筆記
- **全文檢索**：強大的搜尋功能，快速找到所需內容
- **資料匯出**：筆記可匯出為 Markdown 檔案，避免資料鎖定

### 🛡️ 多層安全保護
- **多種登入方式**：帳號密碼登入、GitHub OAuth 登入
- **安全驗證**：可選圖片驗證碼或 Cloudflare Turnstile 防護
- **鎖屏保護**：支援鎖屏功能，防止未授權訪問
- **訪問控制**：適合在個人伺服器或私有環境中長期使用
- **操作審計**：完整的日誌系統記錄所有使用者操作，提供安全審計功能

### 🔗 安全分享與備份
- **只讀分享**：支援筆記分享，可設定訪問密碼與過期時間控制
- **WebDAV 備份**：與雲端儲存或私有 NAS 整合，實現資料自動同步
- **長期儲存**：多種備份方式確保資料安全

### 🎨 優秀的使用者體驗
- **響應式設計**：在桌面和移動裝置上均可獲得良好體驗
- **主題切換**：支援深色/淺色主題切換
- **多語言支援**：中英文介面無縫切換
- **鍵盤快捷鍵**：提高操作效率
- **系統監控**：內建日誌管理系統，支援操作記錄檢視和過濾

## ⚙️ 配置說明

### 功能配置

系統提供了豐富的配置選項，包括：

- **站點設定**：站點標題、Logo、圖示等
- **安全配置**：GitHub OAuth、驗證碼設定
- **備份配置**：WebDAV 自動備份
- **鎖屏設定**：鎖屏密碼和超時時間
- **日誌管理**：操作日誌記錄、檢視和清理設定

所有配置都可以透過 Web 介面進行管理，無需修改配置檔案。

## 🚀 部署

### 本地部署
支援 \`npm start\` 直接執行

### Docker部署
支援 \`docker\` 一鍵部署

### Cloudflare Pages部署
無成本安全可用性高 \`Cloudflare Pages\` 部署

## 🙏 致謝

感謝所有開源專案的貢獻者，Z Note 使用了以下優秀的開源專案：

- React - 使用者介面庫
- TypeScript - 型別安全的 JavaScript
- Vite - 現代化的構建工具
- Hono - 輕量級 Web 框架
- Tailwind CSS - 實用優先的 CSS 框架
- D1 - Cloudflare 分散式資料庫

---
**Z Note** - 輕量級自託管筆記系統，您的個人知識管理夥伴 🚀`

    await db.prepare('INSERT OR REPLACE INTO notes (id, title, content, tags, category_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      'z-note-welcome', 'Z Note', noteContent, '', 'default', Date.now(), Date.now()
    )

    // 初始化預設分享
    await db.prepare('INSERT OR REPLACE INTO shares (id, note_id, password, expires_at, created_at) VALUES (?, ?, ?, ?, ?)').run(
      'z-note', 'z-note-welcome', null, null, Date.now()
    )

    return c.json({ success: true, message: 'Installation completed' })
  } catch (error) {
    console.error('Installation error:', error)
    return c.json({ error: 'Installation failed' }, 500)
  }
})

// 登入介面
app.post('/api/login', requireInstallation, async (c) => {
  const db = c.get('db') as any
  
  try {
    const { email, password, captcha, turnstileToken } = await c.req.json()

    if (!email || !password) {
      return c.json({ ok: false, reason: 'missing_credentials' }, 400)
    }

    // 獲取驗證設定
    const enableCaptcha = await db.prepare('SELECT value FROM settings WHERE key = ?').get('login.enable_captcha') as any
    const enableTurnstile = await db.prepare('SELECT value FROM settings WHERE key = ?').get('login.enable_turnstile') as any
    const turnstileSecretKey = await db.prepare('SELECT value FROM settings WHERE key = ?').get('login.turnstile_secret_key') as any

    // 驗證碼驗證
    if (enableCaptcha?.value === '1') {
      const savedCaptcha = getCookie(c, 'captcha')
      if (!captcha || !savedCaptcha || captcha.toLowerCase() !== savedCaptcha.toLowerCase()) {
        return c.json({ ok: false, error: 'captcha_invalid' }, 400)
      }
      // 清除驗證碼cookie
      deleteCookie(c, 'captcha', { path: '/' })
    }

    // Turnstile驗證
    if (enableTurnstile?.value === '1' && turnstileSecretKey?.value) {
      if (!turnstileToken) {
        return c.json({ ok: false, error: 'turnstile_required' }, 400)
      }

      const turnstileResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret: turnstileSecretKey.value,
          response: turnstileToken,
          remoteip: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown'
        })
      })

      const turnstileResult = await turnstileResponse.json()
      if (!turnstileResult.success) {
        return c.json({ ok: false, error: 'turnstile_failed' }, 400)
      }
    }

    // 獲取管理員資訊
    const adminEmail = await db.prepare('SELECT value FROM settings WHERE key = ?').get('admin.email') as any
    const adminPasswordHash = await db.prepare('SELECT value FROM settings WHERE key = ?').get('admin.password_hash') as any

    if (!adminEmail || !adminPasswordHash) {
      return c.json({ ok: false, reason: 'admin_not_configured' }, 500)
    }

    // 驗證郵箱
    if (email !== adminEmail.value) {
      // 記錄失敗的登入嘗試
      await logAction(db, {
        user_id: 'unknown',
        action: 'login',
        target_type: 'user',
        details: { success: false, reason: 'email_incorrect', email },
        ip_address: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown',
        user_agent: c.req.header('user-agent') || 'unknown'
      })
      return c.json({ ok: false, error: 'email_incorrect' }, 401)
    }

    // 驗證密碼
    const isValidPassword = await comparePassword(password, adminPasswordHash.value)
    if (!isValidPassword) {
      // 記錄失敗的登入嘗試
      await logAction(db, {
        user_id: adminEmail.value,
        action: 'login',
        target_type: 'user',
        details: { success: false, reason: 'invalid_password' },
        ip_address: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown',
        user_agent: c.req.header('user-agent') || 'unknown'
      })
      return c.json({ ok: false, error: 'invalid_credentials' }, 401)
    }

    // 生成JWT token和session ID
    const token = await generateToken({
      userId: 'admin',
      email: adminEmail.value,
      role: 'admin'
    })
    const sessionId = generateSessionId()

    // 設定cookies - Cloudflare Pages 使用 HTTPS
    setCookie(c, 'auth_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7天
      domain: undefined
    })
    setCookie(c, 'session_id', sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7天
      domain: undefined
    })

    // 記錄成功的登入
    await logAction(db, {
      user_id: adminEmail.value,
      action: 'login',
      target_type: 'user',
      details: { success: true, method: 'password' },
      ip_address: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown',
      user_agent: c.req.header('user-agent') || 'unknown'
    })

    return c.json({ ok: true, email: adminEmail.value })
  } catch (error) {
    console.error('Login error:', error)
    return c.json({ ok: false, reason: 'server_error' }, 500)
  }
})

// GitHub OAuth
app.get('/api/auth/github', requireInstallation, async (c) => {
  const db = c.get('db') as any
  
  try {
    const enableGithub = await db.prepare('SELECT value FROM settings WHERE key = ?').get('login.enable_github') as any
    if (!enableGithub || enableGithub.value !== '1') {
      return c.json({ error: 'GitHub login not enabled' }, 400)
    }

    const clientIdRow = await db.prepare('SELECT value FROM settings WHERE key = ?').get('github.client_id') as any
    if (!clientIdRow || !clientIdRow.value) {
      return c.json({ error: 'GitHub client ID not configured' }, 500)
    }

    const { apiUrl, frontendUrl } = getBaseUrl(c)
    const redirectUri = `${apiUrl}/api/auth/github/callback`
    const state = nanoid(32)
    
    // 儲存 state 和前端URL 到 cookie 用於驗證和重定向
    setCookie(c, 'github_oauth_state', state, {
      httpOnly: true,
      maxAge: 600, // 10 分鐘
      path: '/'
    })
    
    setCookie(c, 'github_oauth_frontend', frontendUrl, {
      httpOnly: true,
      maxAge: 600, // 10 分鐘
      path: '/'
    })

    const authUrl = new URL('https://github.com/login/oauth/authorize')
    authUrl.searchParams.set('client_id', clientIdRow.value)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('scope', 'user:email')
    authUrl.searchParams.set('state', state)

    return c.redirect(authUrl.toString())
  } catch (error) {
    console.error('GitHub OAuth init error:', error)
    return c.json({ error: 'OAuth initialization failed' }, 500)
  }
})

app.get('/api/auth/github/callback', async (c) => {
  const db = c.get('db') as any
  
  try {
    const code = c.req.query('code')
    const state = c.req.query('state')
    const savedState = getCookie(c, 'github_oauth_state')
    const frontendUrl = getCookie(c, 'github_oauth_frontend') || getBaseUrl(c).frontendUrl

    if (!code || !state || state !== savedState) {
      return c.redirect(`${frontendUrl}/login?error=oauth_failed`)
    }

    // 清除 state 和 frontend URL cookies
    deleteCookie(c, 'github_oauth_state')
    deleteCookie(c, 'github_oauth_frontend')

    const clientIdRow = await db.prepare('SELECT value FROM settings WHERE key = ?').get('github.client_id') as any
    const clientSecretRow = await db.prepare('SELECT value FROM settings WHERE key = ?').get('github.client_secret') as any

    if (!clientIdRow?.value || !clientSecretRow?.value) {
      return c.redirect(`${frontendUrl}/login?error=oauth_config`)
    }

    // 交換 access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientIdRow.value,
        client_secret: clientSecretRow.value,
        code: code,
      })
    })

    const tokenData = await tokenResponse.json()
    
    if (!tokenData.access_token) {
      return c.redirect(`${frontendUrl}/login?error=oauth_token`)
    }

    // 獲取使用者資訊
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/vnd.github.v3+json',
      }
    })

    const userData = await userResponse.json()

    // 獲取使用者郵箱
    const emailResponse = await fetch('https://api.github.com/user/emails', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/vnd.github.v3+json',
      }
    })

    const emailData = await emailResponse.json()
    const primaryEmail = emailData.find((email: any) => email.primary)?.email || userData.email

    // 檢查是否是管理員郵箱
    const adminEmailRow = await db.prepare('SELECT value FROM settings WHERE key = ?').get('admin.email') as any
    if (!adminEmailRow || primaryEmail !== adminEmailRow.value) {
      return c.redirect(`${frontendUrl}/login?error=email_incorrect`)
    }

    // 生成JWT token
    const token = await generateToken({
      userId: 'admin',
      email: adminEmailRow.value,
      role: 'admin'
    })

    // 生成session ID
    const sessionId = generateSessionId()

    // Cloudflare Pages 使用 HTTPS
    const cookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax' as const,
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 天
      domain: undefined
    }

    // 設定認證cookies
    setCookie(c, 'auth_token', token, cookieOptions)
    setCookie(c, 'session_id', sessionId, cookieOptions)

    // 記錄成功的GitHub登入
    await logAction(db, {
      user_id: adminEmailRow.value,
      action: 'login',
      target_type: 'user',
      details: { success: true, method: 'github', github_user: userData.login },
      ip_address: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown',
      user_agent: c.req.header('user-agent') || 'unknown'
    })

    // 重定向回前端
    return c.redirect(`${frontendUrl}/`)

  } catch (error) {
    console.error('GitHub OAuth callback error:', error)
    const frontendUrl = getCookie(c, 'github_oauth_frontend') || getBaseUrl(c).frontendUrl
    return c.redirect(`${frontendUrl}/login?error=oauth_error`)
  }
})

// 認證檢查
app.get('/api/me', requireInstallation, async (c) => {
  const token = getCookie(c, 'auth_token')
  const sessionId = getCookie(c, 'session_id')

  if (!token || !sessionId) {
    return c.json({ loggedIn: false, reason: 'missing_cookies' }, 401)
  }

  const payload = await verifyToken(token)
  if (!payload) {
    return c.json({ loggedIn: false, reason: 'invalid_token' }, 401)
  }

  return c.json({ 
    loggedIn: true, 
    email: payload.email,
    role: payload.role
  })
})

// 退出登入
app.post('/api/logout', async (c) => {
  const db = c.get('db') as any
  
  // 獲取當前使用者資訊用於日誌記錄
  const token = getCookie(c, 'auth_token')
  let userId = 'unknown'
  
  if (token) {
    const payload = await verifyToken(token)
    if (payload) {
      userId = payload.email || payload.userId || 'admin'
    }
  }
  
  // 記錄登出操作
  await logAction(db, {
    user_id: userId,
    action: 'logout',
    target_type: 'user',
    details: { success: true },
    ip_address: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown',
    user_agent: c.req.header('user-agent') || 'unknown'
  })
  
  deleteCookie(c, 'auth_token', { path: '/' })
  deleteCookie(c, 'session_id', { path: '/' })
  return c.json({ ok: true })
})

// 獲取系統資訊
app.get('/api/system/info', async (c) => {
  const db = c.get('db') as any
  
  try {
    // 獲取資料庫統計資訊
    const notesCount = await db.prepare('SELECT COUNT(*) as count FROM notes').get() as any
    const categoriesCount = await db.prepare('SELECT COUNT(*) as count FROM categories').get() as any
    
    return c.json({
      name: 'Z Note',
      version: '1.0.0',
      platform: 'cloudflare-pages', // 標識為Cloudflare Pages環境
      database: 'd1', // 標識使用D1資料庫
      timestamp: new Date().toISOString(),
      notesCount: notesCount?.count || 0,
      categoriesCount: categoriesCount?.count || 0,
      databaseSize: 'N/A' // D1不提供檔案大小資訊
    })
  } catch (error) {
    return c.json({
      name: 'Z Note',
      version: '1.0.0',
      platform: 'cloudflare-pages',
      database: 'd1',
      timestamp: new Date().toISOString(),
      notesCount: 0,
      categoriesCount: 0,
      databaseSize: 'N/A'
    })
  }
})

// 獲取公共設定
app.get('/api/settings/public', async (c) => {
  const db = c.get('db') as any
  
  try {
    const settings = [
      'login.enable_captcha',
      'login.enable_turnstile', 
      'login.turnstile_site_key',
      'login.enable_github',
      'site.title',
      'site.logo',
      'site.favicon',
      'site.avatar_prefix',
      'upload.max_file_size'
    ]
    
    const result: any = {}
    for (const key of settings) {
      const row = await db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any
      result[key] = row?.value || getDefaultValue(key)
    }
    
    return c.json(result)
  } catch (error) {
    return c.json({
      'login.enable_captcha': '0',
      'login.enable_turnstile': '0',
      'login.turnstile_site_key': '',
      'login.enable_github': '0',
      'site.title': 'Z Note',
      'site.logo': '/logo.png',
      'site.favicon': '/favicon.png',
      'site.avatar_prefix': 'https://www.gravatar.com/avatar/',
      'upload.max_file_size': '10'
    })
  }
})

function getDefaultValue(key: string): string {
  const defaults: { [key: string]: string } = {
    'login.enable_captcha': '0',
    'login.enable_turnstile': '0',
    'login.turnstile_site_key': '',
    'login.enable_github': '0',
    'site.title': 'Z Note',
    'site.logo': '/logo.png',
    'site.favicon': '/favicon.png',
    'site.avatar_prefix': 'https://www.gravatar.com/avatar/',
    'upload.max_file_size': '10'
  }
  return defaults[key] || ''
}

// 獲取所有設定（需要認證）
app.get('/api/settings', requireAuth, async (c) => {
  const db = c.get('db') as any
  
  try {
    const rows = await db.prepare('SELECT key, value FROM settings').all()
    const result: any = {}
    
    for (const row of rows) {
      result[row.key] = row.value
    }
    
    return c.json(result)
  } catch (error) {
    console.error('Error fetching settings:', error)
    return c.json({ error: 'Failed to fetch settings' }, 500)
  }
})

// 更新設定（需要認證）
app.put('/api/settings', requireAuth, async (c) => {
  const db = c.get('db') as any
  const user = c.get('user')
  const updates = await c.req.json()

  const updatedKeys = Object.keys(updates)

  for (const [key, value] of Object.entries(updates)) {
    if (key === 'admin.password') {
      const hash = await hashPassword(String(value))
      await db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run('admin.password_hash', hash, Date.now())
      continue
    }

    await db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(key, String(value), Date.now())
  }

  // 記錄設定更新
  await logAction(db, {
    user_id: user.email || user.userId,
    action: 'update_settings',
    target_type: 'settings',
    details: { updated_keys: updatedKeys },
    ip_address: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown',
    user_agent: c.req.header('user-agent') || 'unknown'
  })

  return c.json({ ok: true })
})

// 更新設定（POST方法，與PUT相同）
app.post('/api/settings', requireAuth, async (c) => {
  const db = c.get('db') as any
  const user = c.get('user')
  const updates = await c.req.json()

  const updatedKeys = Object.keys(updates)

  for (const [key, value] of Object.entries(updates)) {
    if (key === 'admin.password') {
      const hash = await hashPassword(String(value))
      await db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run('admin.password_hash', hash, Date.now())
      continue
    }

    await db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(key, String(value), Date.now())
  }

  // 記錄設定更新
  await logAction(db, {
    user_id: user.email || user.userId,
    action: 'update_settings',
    target_type: 'settings',
    details: { updated_keys: updatedKeys },
    ip_address: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown',
    user_agent: c.req.header('user-agent') || 'unknown'
  })

  return c.json({ ok: true })
})

// Categories
app.get('/api/categories', async (c) => {
  const db = c.get('db') as any
  const rows = await db.prepare('SELECT * FROM categories ORDER BY created_at').all()
  return c.json(rows)
})

app.post('/api/categories', requireAuth, async (c) => {
  const db = c.get('db') as any
  const user = c.get('user')
  const { name } = await c.req.json()
  if (!name) return c.json({ error: 'BAD_REQUEST' }, 400)

  const id = nanoid()
  await db.prepare('INSERT INTO categories (id, name, created_at) VALUES (?, ?, ?)').run(id, name, Date.now())

  // 記錄分類建立
  await logAction(db, {
    user_id: user.email || user.userId,
    action: 'create_category',
    target_type: 'category',
    target_id: id,
    details: { name },
    ip_address: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown',
    user_agent: c.req.header('user-agent') || 'unknown'
  })

  return c.json({ ok: true, id })
})

app.put('/api/categories/:id', requireAuth, async (c) => {
  const db = c.get('db') as any
  const user = c.get('user')
  const id = c.req.param('id')
  const { name } = await c.req.json()
  
  if (!id || !name) return c.json({ error: 'BAD_REQUEST' }, 400)
  if (id === 'default') return c.json({ error: 'CANNOT_EDIT_DEFAULT' }, 400)

  // 獲取舊名稱用於日誌
  const oldCategory = await db.prepare('SELECT * FROM categories WHERE id=?').get(id) as any

  await db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name, id)

  // 記錄分類更新
  await logAction(db, {
    user_id: user.email || user.userId,
    action: 'update_category',
    target_type: 'category',
    target_id: id,
    details: { old_name: oldCategory?.name, new_name: name },
    ip_address: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown',
    user_agent: c.req.header('user-agent') || 'unknown'
  })

  return c.json({ ok: true })
})

app.delete('/api/categories/:id', requireAuth, async (c) => {
  const db = c.get('db') as any
  const user = c.get('user')
  const id = c.req.param('id')
  if (!id) return c.json({ error: 'BAD_REQUEST' }, 400)
  if (id === 'default') return c.json({ error: 'CANNOT_DELETE_DEFAULT' }, 400)

  // 獲取分類資訊用於日誌
  const category = await db.prepare('SELECT * FROM categories WHERE id=?').get(id) as any

  // 將該分類下的筆記轉移到預設分類
  await db.prepare('UPDATE notes SET category_id = ? WHERE category_id = ?').run('default', id)

  // 刪除分類
  await db.prepare('DELETE FROM categories WHERE id = ?').run(id)

  // 記錄分類刪除
  if (category) {
    await logAction(db, {
      user_id: user.email || user.userId,
      action: 'delete_category',
      target_type: 'category',
      target_id: id,
      details: { name: category.name },
      ip_address: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown',
      user_agent: c.req.header('user-agent') || 'unknown'
    })
  }

  return c.json({ ok: true })
})

// Notes
app.get('/api/notes', async (c) => {
  const db = c.get('db') as any
  const categoryId = c.req.query('category')

  const rows = categoryId
    ? await db.prepare('SELECT * FROM notes WHERE category_id=? ORDER BY updated_at DESC').all(categoryId)
    : await db.prepare('SELECT * FROM notes ORDER BY updated_at DESC').all()

  return c.json(rows)
})

app.post('/api/notes', requireAuth, async (c) => {
  const db = c.get('db') as any
  const user = c.get('user')
  const { categoryId } = await c.req.json()

  const noteId = nanoid()
  await db.prepare(`
    INSERT INTO notes
    (id, title, content, tags, category_id, created_at, updated_at)
    VALUES (?, '', '', '', ?, ?, ?)
  `).run(
    noteId,
    categoryId ?? 'default',
    Date.now(),
    Date.now()
  )

  // 記錄筆記建立
  await logAction(db, {
    user_id: user.email || user.userId,
    action: 'create_note',
    target_type: 'note',
    target_id: noteId,
    details: { category_id: categoryId ?? 'default' },
    ip_address: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown',
    user_agent: c.req.header('user-agent') || 'unknown'
  })

  return c.json({ ok: true })
})

app.put('/api/notes/:id', requireAuth, async (c) => {
  const db = c.get('db') as any
  const id = c.req.param('id')
  if (!id) return c.json({ error: 'BAD_REQUEST' }, 400)

  const note = (await c.req.json()) as {
    title: string
    content: string
    tags: string[]
    category_id: string
  }

  await db.prepare(`
    UPDATE notes
    SET title=?, content=?, tags=?, category_id=?, updated_at=?
    WHERE id=?
  `).run(
    note.title,
    note.content,
    note.tags?.join(',') ?? '',
    note.category_id,
    Date.now(),
    id
  )

  return c.json({ ok: true })
})

app.delete('/api/notes/:id', requireAuth, async (c) => {
  const db = c.get('db') as any
  const user = c.get('user')
  const id = c.req.param('id')
  if (!id) return c.json({ error: 'BAD_REQUEST' }, 400)

  // 獲取筆記資訊
  const note = await db.prepare('SELECT * FROM notes WHERE id=?').get(id) as any
  if (!note) return c.json({ error: 'NOT_FOUND' }, 404)

  // 移動到回收站
  await db.prepare(`
    INSERT INTO trash (id, title, content, tags, category_id, created_at, updated_at, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    note.id,
    note.title,
    note.content,
    note.tags,
    note.category_id,
    note.created_at,
    note.updated_at,
    Date.now()
  )

  // 從筆記表中刪除
  await db.prepare('DELETE FROM notes WHERE id=?').run(id)
  
  // 記錄筆記刪除
  await logAction(db, {
    user_id: user.email || user.userId,
    action: 'delete_note',
    target_type: 'note',
    target_id: id,
    details: { title: note.title, category_id: note.category_id },
    ip_address: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown',
    user_agent: c.req.header('user-agent') || 'unknown'
  })
  
  return c.json({ ok: true })
})

// Search
app.get('/api/search', async (c) => {
  const db = c.get('db') as any
  const q = c.req.query('q')
  if (!q) return c.json([])

  // Use LIKE search for reliability
  const searchTerm = `%${q}%`
  const rows = await db.prepare(`
    SELECT * FROM notes 
    WHERE title LIKE ? OR content LIKE ? OR tags LIKE ?
    ORDER BY updated_at DESC
  `).all(searchTerm, searchTerm, searchTerm)
  
  return c.json(rows)
})

// Share
app.post('/api/share/:id', requireAuth, async (c) => {
  const db = c.get('db') as any
  const user = c.get('user')
  const id = c.req.param('id')
  if (!id) return c.json({ error: 'BAD_REQUEST' }, 400)

  const body = (await c.req.json()) as {
    password?: string
    expiresAt?: number
  }

  const code = nanoid(8)

  await db.prepare(`
    INSERT INTO shares (id, note_id, password, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    code,
    id,
    body.password ?? null,
    body.expiresAt ?? null,
    Date.now()
  )

  // 記錄分享建立
  await logAction(db, {
    user_id: user.email || user.userId,
    action: 'create_share',
    target_type: 'share',
    target_id: code,
    details: { 
      note_id: id,
      has_password: !!body.password,
      expires_at: body.expiresAt
    },
    ip_address: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown',
    user_agent: c.req.header('user-agent') || 'unknown'
  })

  return c.json({ code })
})

app.get('/api/shares', requireAuth, async (c) => {
  const db = c.get('db') as any
  const noteId = c.req.query('note_id')
  if (!noteId) return c.json({ error: 'BAD_REQUEST' }, 400)

  const shares = await db.prepare('SELECT * FROM shares WHERE note_id=? ORDER BY created_at DESC').all(noteId)

  return c.json(shares)
})

app.delete('/api/shares/:id', requireAuth, async (c) => {
  const db = c.get('db') as any
  const user = c.get('user')
  const id = c.req.param('id')
  if (!id) return c.json({ error: 'BAD_REQUEST' }, 400)

  // 獲取分享資訊用於日誌
  const share = await db.prepare('SELECT * FROM shares WHERE id=?').get(id) as any

  await db.prepare('DELETE FROM shares WHERE id=?').run(id)

  // 記錄分享刪除
  if (share) {
    await logAction(db, {
      user_id: user.email || user.userId,
      action: 'delete_share',
      target_type: 'share',
      target_id: id,
      details: { note_id: share.note_id },
      ip_address: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown',
      user_agent: c.req.header('user-agent') || 'unknown'
    })
  }

  return c.json({ ok: true })
})

app.post('/api/share/:code/view', async (c) => {
  const db = c.get('db') as any
  const code = c.req.param('code')
  if (!code) return c.json({ error: 'BAD_REQUEST' }, 400)

  const body = (await c.req.json()) as { password?: string }

  const share = await db.prepare('SELECT * FROM shares WHERE id=?').get(code) as any

  if (!share) {
    return c.json({ error: 'NOT_FOUND' }, 404)
  }

  if (share.expires_at && Date.now() > share.expires_at) {
    return c.json({ error: 'EXPIRED' }, 403)
  }

  if (share.password && share.password !== body.password) {
    return c.json({ error: 'PASSWORD_REQUIRED' }, 401)
  }

  const note = await db.prepare('SELECT * FROM notes WHERE id=?').get(share.note_id) as any

  // 記錄分享檢視（匿名使用者）
  await logAction(db, {
    user_id: 'anonymous',
    action: 'view_share',
    target_type: 'share',
    target_id: code,
    details: { note_id: share.note_id },
    ip_address: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown',
    user_agent: c.req.header('user-agent') || 'unknown'
  })

  return c.json(note)
})

// Captcha API
app.get('/api/captcha', (c) => {
  // Simple SVG captcha implementation for Cloudflare Pages
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let captchaText = ''
  for (let i = 0; i < 4; i++) {
    captchaText += chars.charAt(Math.floor(Math.random() * chars.length))
  }

  const svg = `<svg width="120" height="40" xmlns="http://www.w3.org/2000/svg">
    <rect width="120" height="40" fill="#f4f4f5"/>
    <text x="60" y="25" font-family="Arial" font-size="18" text-anchor="middle" fill="#333">${captchaText}</text>
    <line x1="10" y1="15" x2="110" y2="25" stroke="#ccc" stroke-width="1"/>
    <line x1="20" y1="30" x2="100" y2="10" stroke="#ccc" stroke-width="1"/>
  </svg>`

  // Save to cookie (5 minutes)
  setCookie(c, 'captcha', captchaText.toLowerCase(), {
    httpOnly: true,
    maxAge: 300,
    path: '/'
  })

  return c.json({ svg })
})

// GitHub OAuth debug endpoint
app.get('/api/auth/github/debug', requireInstallation, async (c) => {
  const db = c.get('db') as any
  
  const enableGithub = await db.prepare('SELECT value FROM settings WHERE key = ?').get('login.enable_github') as any
  const clientId = await db.prepare('SELECT value FROM settings WHERE key = ?').get('github.client_id') as any
  const clientSecret = await db.prepare('SELECT value FROM settings WHERE key = ?').get('github.client_secret') as any
  const { apiUrl, frontendUrl } = getBaseUrl(c)
  const redirectUri = `${apiUrl}/api/auth/github/callback`
  
  return c.json({
    enabled: enableGithub?.value === '1',
    hasClientId: !!clientId?.value,
    hasClientSecret: !!clientSecret?.value,
    clientIdPreview: clientId?.value ? clientId.value.substring(0, 8) + '...' : 'not set',
    redirectUri,
    apiUrl,
    frontendUrl,
    environment: 'cloudflare-pages'
  })
})

// Auth cleanup endpoint
app.post('/api/auth/cleanup', (c) => {
  // Clear all possible auth cookies
  deleteCookie(c, 'auth_token', { path: '/' })
  deleteCookie(c, 'session_id', { path: '/' })
  deleteCookie(c, 'session', { path: '/' })
  return c.json({ ok: true, message: 'Tokens cleared' })
})

// Trash management APIs
app.get('/api/trash', requireAuth, async (c) => {
  const db = c.get('db') as any
  const rows = await db.prepare('SELECT * FROM trash ORDER BY deleted_at DESC').all()
  return c.json(rows)
})

app.post('/api/trash/:id/restore', requireAuth, async (c) => {
  const db = c.get('db') as any
  const user = c.get('user')
  const id = c.req.param('id')
  if (!id) return c.json({ error: 'BAD_REQUEST' }, 400)

  // Get note from trash
  const trashNote = await db.prepare('SELECT * FROM trash WHERE id=?').get(id) as any
  if (!trashNote) return c.json({ error: 'NOT_FOUND' }, 404)

  // Restore to notes table
  await db.prepare(`
    INSERT INTO notes (id, title, content, tags, category_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    trashNote.id,
    trashNote.title,
    trashNote.content,
    trashNote.tags,
    trashNote.category_id,
    trashNote.created_at,
    Date.now() // Update modification time
  )

  // Remove from trash
  await db.prepare('DELETE FROM trash WHERE id=?').run(id)
  
  // 記錄筆記恢復
  await logAction(db, {
    user_id: user.email || user.userId,
    action: 'restore_note',
    target_type: 'note',
    target_id: id,
    details: { title: trashNote.title, category_id: trashNote.category_id },
    ip_address: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown',
    user_agent: c.req.header('user-agent') || 'unknown'
  })
  
  return c.json({ ok: true })
})

app.delete('/api/trash/:id', requireAuth, async (c) => {
  const db = c.get('db') as any
  const user = c.get('user')
  const id = c.req.param('id')
  if (!id) return c.json({ error: 'BAD_REQUEST' }, 400)

  // 獲取筆記資訊用於日誌
  const trashNote = await db.prepare('SELECT * FROM trash WHERE id=?').get(id) as any

  // Permanently delete
  await db.prepare('DELETE FROM trash WHERE id=?').run(id)

  // 記錄永久刪除
  if (trashNote) {
    await logAction(db, {
      user_id: user.email || user.userId,
      action: 'permanent_delete_note',
      target_type: 'note',
      target_id: id,
      details: { title: trashNote.title, category_id: trashNote.category_id },
      ip_address: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown',
      user_agent: c.req.header('user-agent') || 'unknown'
    })
  }

  return c.json({ ok: true })
})

app.delete('/api/trash', requireAuth, async (c) => {
  const db = c.get('db') as any
  // Empty trash
  await db.prepare('DELETE FROM trash').run()
  return c.json({ ok: true })
})

// SEO routes
app.get('/sitemap.xml', (c) => {
  // Get current request domain and protocol
  const host = c.req.header('host') || 'localhost:9915'
  const protocol = c.req.header('x-forwarded-proto') || 
                   c.req.header('cf-visitor') ? 'https' : 
                   (host.includes('localhost') ? 'http' : 'https')
  const baseUrl = `${protocol}://${host}`
  
  // Get current date
  const currentDate = new Date().toISOString().split('T')[0]
  
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
    
    <!-- Homepage -->
    <url>
        <loc>${baseUrl}/</loc>
        <lastmod>${currentDate}</lastmod>
        <changefreq>daily</changefreq>
        <priority>1.0</priority>
        <xhtml:link rel="alternate" hreflang="zh-TW" href="${baseUrl}/" />
        <xhtml:link rel="alternate" hreflang="en" href="${baseUrl}/?lang=en" />
    </url>
    
    <!-- Login page -->
    <url>
        <loc>${baseUrl}/login</loc>
        <lastmod>${currentDate}</lastmod>
        <changefreq>monthly</changefreq>
        <priority>0.8</priority>
        <xhtml:link rel="alternate" hreflang="zh-TW" href="${baseUrl}/login" />
        <xhtml:link rel="alternate" hreflang="en" href="${baseUrl}/login?lang=en" />
    </url>
    
    <!-- Features page -->
    <url>
        <loc>${baseUrl}/features</loc>
        <lastmod>${currentDate}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.7</priority>
        <xhtml:link rel="alternate" hreflang="zh-TW" href="${baseUrl}/features" />
        <xhtml:link rel="alternate" hreflang="en" href="${baseUrl}/features?lang=en" />
    </url>
    
    <!-- Help page -->
    <url>
        <loc>${baseUrl}/help</loc>
        <lastmod>${currentDate}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.6</priority>
        <xhtml:link rel="alternate" hreflang="zh-TW" href="${baseUrl}/help" />
        <xhtml:link rel="alternate" hreflang="en" href="${baseUrl}/help?lang=en" />
    </url>
    
    <!-- Privacy page -->
    <url>
        <loc>${baseUrl}/privacy</loc>
        <lastmod>${currentDate}</lastmod>
        <changefreq>monthly</changefreq>
        <priority>0.5</priority>
        <xhtml:link rel="alternate" hreflang="zh-TW" href="${baseUrl}/privacy" />
        <xhtml:link rel="alternate" hreflang="en" href="${baseUrl}/privacy?lang=en" />
    </url>

    <!-- Copyright page -->
    <url>
        <loc>${baseUrl}/copyright</loc>
        <lastmod>${currentDate}</lastmod>
        <changefreq>monthly</changefreq>
        <priority>0.5</priority>
        <xhtml:link rel="alternate" hreflang="zh-TW" href="${baseUrl}/copyright" />
        <xhtml:link rel="alternate" hreflang="en" href="${baseUrl}/copyright?lang=en" />
    </url>
    
</urlset>`

  return new Response(sitemap, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
    }
  })
})

app.get('/robots.txt', (c) => {
  // Get current request domain and protocol
  const host = c.req.header('host') || 'localhost:9915'
  const protocol = c.req.header('x-forwarded-proto') || 
                   c.req.header('cf-visitor') ? 'https' : 
                   (host.includes('localhost') ? 'http' : 'https')
  const baseUrl = `${protocol}://${host}`
  
  const robots = `User-agent: *
Allow: /

# Static resources
Allow: /assets/
Allow: /favicon.png
Allow: /logo.png
Allow: /manifest.json

# Disallowed paths
Disallow: /api/
Disallow: /admin/
Disallow: /data/

# Sitemap
Sitemap: ${baseUrl}/sitemap.xml`

  return new Response(robots, {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=86400' // Cache for 24 hours
    }
  })
})

// Debug environment endpoint
app.get('/api/debug/env', (c) => {
  const db = c.get('db')
  return c.json({
    hasDB: !!db,
    dbType: 'D1',
    platform: 'cloudflare-pages',
    timestamp: new Date().toISOString(),
    env: {
      hasDB: !!c.env.DB,
      hasJWTSecret: !!c.env.JWT_SECRET
    }
  })
})

export default app