import db from '../../server/index.js'

let settingsCache: Record<string, string> = {}

export function getSetting(key: string): string | undefined {
  if (settingsCache[key]) {
    return settingsCache[key]
  }

  try {
    const result = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any
    const value = result?.value
    
    if (value) {
      settingsCache[key] = value
    }
    
    return value
  } catch (error) {
    console.error('Error getting setting:', error)
    return undefined
  }
}

export function setSetting(key: string, value: string) {
  try {
    db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value=excluded.value,
        updated_at=excluded.updated_at
    `).run(key, value, Date.now())
    
    // 更新快取
    settingsCache[key] = value
  } catch (error) {
    console.error('Error setting value:', error)
    throw error
  }
}

export function getSettings(prefix?: string) {
  try {
    const rows = prefix
      ? db.prepare(`
          SELECT key, value FROM settings
          WHERE key LIKE ?
        `).all(`${prefix}%`)
      : db.prepare('SELECT key, value FROM settings').all()

    const settings = (rows as any[]).reduce<Record<string, string>>((acc, r: any) => {
      acc[r.key] = r.value
      settingsCache[r.key] = r.value
      return acc
    }, {})
    
    return settings
  } catch (error) {
    console.error('Error getting settings:', error)
    return {}
  }
}

export function clearSettingsCache(): void {
  settingsCache = {}
}
