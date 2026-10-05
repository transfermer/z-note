import { D1DatabaseAdapter, D1PreparedStatement } from '../../server/db/types.js'
import { DATABASE_SCHEMA, initializeDefaultData } from '../../server/db/schema.js'

export class D1Adapter implements D1DatabaseAdapter {
  private db: any = null

  constructor() {
    // 在Cloudflare Pages環境中，D1資料庫透過env.DB訪問
    // 這裡我們先設定為null，在initialize中獲取
  }

  async initialize(): Promise<void> {
    // 在Cloudflare Pages中，資料庫繫結透過環境變數獲取
    // 這需要在請求處理時傳入
    if (typeof globalThis !== 'undefined' && (globalThis as any).DB) {
      this.db = (globalThis as any).DB
    } else {
      throw new Error('D1 database binding not found. Make sure DB is bound in wrangler.toml')
    }

    // 初始化資料庫結構
    await this.initializeSchema()
    
    console.log('D1 database initialized')
  }

  private async initializeSchema(): Promise<void> {
    // 使用共享的資料庫schema
    const statements = DATABASE_SCHEMA.split(';').filter(stmt => stmt.trim())
    for (const stmt of statements) {
      if (stmt.trim()) {
        await this.db.prepare(stmt).run()
      }
    }

    // 檢查是否是新資料庫
    const existingSettings = await this.db.prepare('SELECT COUNT(*) as count FROM settings').first()
    const isNewDatabase = existingSettings.count === 0

    // 使用共享的預設資料初始化函式
    await initializeDefaultData(this, isNewDatabase)
  }

  async exec(sql: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')
    
    // D1不支援exec，需要分別執行每個語句
    const statements = sql.split(';').filter(stmt => stmt.trim())
    for (const stmt of statements) {
      if (stmt.trim()) {
        await this.db.prepare(stmt).run()
      }
    }
  }

  prepare(sql: string): D1PreparedStatement {
    if (!this.db) throw new Error('Database not initialized')
    
    const db = this.db // Capture the database reference
    
    return {
      async get(...params: any[]) {
        const stmt = db.prepare(sql)
        if (params.length > 0) {
          return await stmt.bind(...params).first()
        }
        return await stmt.first()
      },
      async all(...params: any[]) {
        const stmt = db.prepare(sql)
        if (params.length > 0) {
          const result = await stmt.bind(...params).all()
          return result.results || []
        }
        const result = await stmt.all()
        return result.results || []
      },
      async run(...params: any[]) {
        const stmt = db.prepare(sql)
        let result
        if (params.length > 0) {
          result = await stmt.bind(...params).run()
        } else {
          result = await stmt.run()
        }
        return {
          changes: result.changes || 0,
          lastInsertRowid: result.meta?.last_row_id
        }
      }
    }
  }

  async isInstalled(): Promise<boolean> {
    try {
      const result = await this.prepare('SELECT value FROM settings WHERE key = ?').get('system.installed')
      return result?.value === '1'
    } catch (error) {
      return false
    }
  }

  async close(): Promise<void> {
    // D1不需要顯式關閉連線
    this.db = null
  }

  // 設定D1資料庫例項（在請求處理時呼叫）
  setDatabase(db: any): void {
    this.db = db
  }
}
