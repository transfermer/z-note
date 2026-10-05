中文 | [English](README_EN.md)

# Z Note

Z Note 是一款**輕量級、可完全自託管的個人筆記系統**，由您自行部署和管理，專為注重**隱私、安全與可控性**的使用者設計。系統支援 Markdown 編輯、分類管理、標籤系統和全文檢索，提供流暢的寫作體驗與清晰的知識結構。

如果專案對你有所幫助，麻煩給個 `Star` 。

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
- **多種登入方式**：帳號密碼登入、GitHub OAuth 登入（不支援Cloudflare Pages）
- **安全驗證**：可選圖片驗證碼或 Cloudflare Turnstile 防護
- **鎖屏保護**：支援鎖屏功能，防止未授權訪問
- **訪問控制**：適合在個人伺服器或私有環境中長期使用
- **操作審計**：完整的日誌系統記錄所有使用者操作，提供安全審計功能

### 🔗 安全分享與備份
- **只讀分享**：支援筆記分享，可設定訪問密碼與過期時間控制
- **WebDAV 備份**：與雲端儲存或私有 NAS 整合，實現資料自動同步（不支援Cloudflare Pages）
- **長期儲存**：多種備份方式確保資料安全

### 🎨 優秀的使用者體驗
- **響應式設計**：在桌面和移動裝置上均可獲得良好體驗
- **主題切換**：支援深色/淺色主題切換
- **多語言支援**：中英文介面無縫切換
- **鍵盤快捷鍵**：提高操作效率
- **系統監控**：內建日誌管理系統，支援操作記錄檢視和過濾

## 🚀 快速部署指南

### 方法一：Cloudflare部署

#### 步驟 1: Fock 本專案
`Fock` 本專案同時請幫忙點個 `Star`

#### 步驟 2: 建立 D1 資料庫
手動建立 D1 資料庫，資料庫名：`z-note-db`

*或* 指令碼建立：
```bash
# 建立 D1 資料庫
wrangler d1 create z-note-db
```

#### 步驟 3: 匯入資料表結構
手動複製 `d1-init.sql` (*6張表*) 在 D1 資料庫控制檯匯入 

*或* 指令碼匯入：
```bash
# 使用架構和預設資料初始化資料庫
wrangler d1 execute z-note-db --file=d1-init.sql
```

#### 步驟 4: 建立專案
1. 前往 **Cloudflare 控制檯** > **Workers和Pages** > **建立應用程式** > **想要部署 Pages？開始使用**
2. 連線你的 Git 倉庫
3. 配置 **構建設定**：
   - **框架預設**: `None`
   - **構建命令**: `npm install`
   - **構建輸出目錄**: `.`（當前目錄）
   - **根目錄**: `/`（倉庫根目錄）

#### 步驟 5: 配置環境變數（控制檯）
1. 前往 **Cloudflare 控制檯** > **Workers和Pages** > **z-note**
2. 前往 **設定** > **繫結** 
5. 新增 **D1資料庫**：
   - **變數名**: `DB`
   - **D1 資料庫**: `z-note-db`
6. 導航到 **部署** > **所有部署**，最新的部署... `重試部署`（d1資料庫繫結後必須重新部署）


#### 步驟 6: 部署後操作

1. **訪問你的站點**: `https://your-project.pages.dev`
2. **自定義域**：設定自定義域
2. **完成設定**: 按照安裝嚮導操作
3. **開始使用**: 建立你的第一個筆記！

---

### 方法二：Docker部署

#### **一鍵部署**
```bash
# 拉取映象
docker pull awinds/z-note:latest

mkdir -p /var/z-note/data

# 執行容器
docker run -d \
  --name z-note \
  -p 9915:9915 \
  -v /var/z-note/data:/app/data \
  -e NODE_ENV=production \
  -e PORT=9915 \
  --restart unless-stopped \
  awinds/z-note:latest
```
#### **Docker Compose部署**
```
# docker-compose.yml
version: "3.9"

services:
  z-note:
    image: awinds/z-note:latest
    container_name: z-note
    ports:
      - "9915:9915"
    volumes:
      - /var/z-note/data:/app/data
    environment:
      NODE_ENV: production
      PORT: 9915
    restart: unless-stopped
```
#### **nginx反代**
```
server {
    listen 443 ssl;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:9915;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```


## 📄 許可證

本專案採用 MIT 許可證。

## 🙏 致謝

感謝所有開源專案的貢獻者，Z Note 使用了以下優秀的開源專案：

- React - 使用者介面庫
- TypeScript - 型別安全的 JavaScript
- Vite - 現代化的構建工具
- Hono - 輕量級 Web 框架
- Tailwind CSS - 實用優先的 CSS 框架
- SQLite - 嵌入式資料庫

---

**Z Note** - 輕量級自託管筆記系統，您的個人知識管理夥伴 🚀
