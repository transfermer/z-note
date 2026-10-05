/**
 * 資料庫表結構定義
 * 統一管理所有資料庫表的建立語句和預設資料
 */

export const DATABASE_SCHEMA = `
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

export const DEFAULT_SETTINGS: Record<string, string> = {
  'language': 'zh'
};

export const DEFAULT_CATEGORIES = [
  {
    id: 'default',
    name: '預設',
    created_at: () => Date.now()
  }
];

export const DEFAULT_NOTES = [
  {
    id: 'z-note-welcome',
    title: 'Z Note',
    content: `# Z Note

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
無成本安全高可用性 \`Cloudflare Pages\` 部署

## 🙏 致謝

感謝所有開源專案的貢獻者，Z Note 使用了以下優秀的開源專案：

- React - 使用者介面庫
- TypeScript - 型別安全的 JavaScript
- Vite - 現代化的構建工具
- Hono - 輕量級 Web 框架
- Tailwind CSS - 實用優先的 CSS 框架
- D1 - Cloudflare 分散式資料庫

---
**Z Note** - 輕量級自託管筆記系統，您的個人知識管理夥伴 🚀`,
    tags: '',
    category_id: 'default',
    created_at: () => Date.now(),
    updated_at: () => Date.now()
  }
];

export const DEFAULT_SHARES = [
  {
    id: 'z-note',
    note_id: 'z-note-welcome',
    password: null,
    expires_at: null,
    created_at: () => Date.now()
  }
];

export async function initializeDefaultData(
  adapter: any,
  isNewDatabase: boolean
): Promise<void> {
  if (isNewDatabase) {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await adapter.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES (?, ?, ?)
      `).run(key, value, Date.now())
    }

    for (const category of DEFAULT_CATEGORIES) {
      await adapter.prepare(`
        INSERT INTO categories (id, name, created_at)
        VALUES (?, ?, ?)
      `).run(category.id, category.name, category.created_at())
    }

    for (const note of DEFAULT_NOTES) {
      await adapter.prepare(`
        INSERT INTO notes (id, title, content, tags, category_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        note.id,
        note.title,
        note.content,
        note.tags,
        note.category_id,
        note.created_at(),
        note.updated_at()
      )
    }

    for (const share of DEFAULT_SHARES) {
      await adapter.prepare(`
        INSERT INTO shares (id, note_id, password, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        share.id,
        share.note_id,
        share.password,
        share.expires_at,
        share.created_at()
      )
    }
  } else {
    // 檢查並補充缺失項（簡化版）
  }
}
