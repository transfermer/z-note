[中文](README.md) | Endlish

# Z Note

Z Note is a **lightweight, fully self-hosted personal note-taking system**, designed for users who prioritize **privacy, security, and full control**. You deploy and manage it entirely on your own infrastructure. It supports Markdown editing, category management, tagging, and full-text search—offering a smooth writing experience and clear knowledge organization.

Author's Blog: [https://www.xiaoa.me](https://www.xiaoa.me)

If you find this project helpful, please give it a `Star` ⭐!

![](screenshot.png)

## 🌟 Core Features

### 🔐 Full Data Ownership
- **Self-hosted deployment**: All data resides solely on your own server
- **No third-party dependencies**: No reliance on external cloud services—complete data sovereignty
- **Privacy-first**: Your data never leaves your control

### 📝 Powerful Note-Taking Capabilities
- **Markdown editor**: Real-time preview with rich syntax support
- **Category management**: Flexible categorization for structured knowledge
- **Tag system**: Multi-dimensional tagging for quick note discovery
- **Full-text search**: Powerful search to instantly locate content
- **Data export**: Export notes as Markdown files to avoid vendor lock-in

### 🛡️ Multi-Layer Security
- **Multiple login options**: Username/password or GitHub OAuth (not supported on Cloudflare Pages)
- **Security verification**: Optional image CAPTCHA or Cloudflare Turnstile protection
- **Screen lock**: Prevent unauthorized access with an inactivity lock
- **Access control**: Ideal for long-term use on personal servers or private networks
- **Audit logging**: Comprehensive operation logs for security auditing

### 🔗 Secure Sharing & Backup
- **Read-only sharing**: Share notes with optional password and expiration time
- **WebDAV backup**: Integrate with cloud storage or private NAS for automatic sync (not supported on Cloudflare Pages)
- **Long-term preservation**: Multiple backup strategies ensure data safety

### 🎨 Excellent User Experience
- **Responsive design**: Works seamlessly on desktop and mobile devices
- **Theme switching**: Toggle between light and dark modes
- **Multi-language support**: Switch effortlessly between Chinese and English
- **Keyboard shortcuts**: Boost productivity with hotkeys
- **System monitoring**: Built-in log management with filtering and viewing capabilities

---

## 🚀 Quick Deployment Guide

### Method 1: Deploy on Cloudflare

#### Step 1: Fork This Repository
Please fork this repo—and don’t forget to give it a `Star`! ⭐

#### Step 2: Create a D1 Database
Manually create a D1 database named: `z-note-db`

*Or* create via CLI:
```bash
# Create D1 database
wrangler d1 create z-note-db
```

#### Step 3: Import Database Schema
Manually copy and paste the contents of `d1-init.sql` (*6 tables*) into the D1 console,

*Or* import via CLI:
```bash
# Initialize database with schema and default data
wrangler d1 execute z-note-db --file=d1-init.sql
```

#### Step 4: Create the Project
1. Go to **Cloudflare Dashboard** > **Workers & Pages** > **Create application** > **Deploy a Pages project? Get started**
2. Connect your Git repository
3. Configure **Build settings**:
   - **Framework preset**: `None`
   - **Build command**: `npm install`
   - **Build output directory**: `.` (current directory)
   - **Root directory**: `/` (repository root)

#### Step 5: Configure Environment Bindings (via Dashboard)
1. Go to **Cloudflare Dashboard** > **Workers & Pages** > **z-note**
2. Navigate to **Settings** > **Bindings**
3. Add a **D1 Database** binding:
   - **Variable name**: `DB`
   - **D1 Database**: `z-note-db`
4. Go to **Deployments** > **All deployments**, find the latest deployment, and click **Redeploy**  
   *(Note: After binding a D1 database, you must trigger a new deployment for the binding to take effect)*

#### Step 6: Post-Deployment Steps

1. **Visit your site**: `https://your-project.pages.dev`
2. **Custom domain**: Configure a custom domain if desired
3. **Complete setup**: Follow the onboarding wizard
4. **Start using**: Create your first note!

---

### Method 2: Docker Deployment

#### **One-Command Deployment**
```bash
# Pull the image
docker pull awinds/z-note:latest

mkdir -p /var/z-note/data

# Run container
docker run -d \
  --name z-note \
  -p 9915:9915 \
  -v /var/z-note/data:/app/data \
  -e NODE_ENV=production \
  -e PORT=9915 \
  --restart unless-stopped \
  awinds/z-note:latest
```

#### **Docker Compose Deployment**
```yaml
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

#### **Nginx Reverse Proxy Example**
```nginx
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

---

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgements

Thanks to all contributors of the open-source ecosystem. Z Note leverages the following excellent open-source projects:

- React – UI library  
- TypeScript – Typed JavaScript  
- Vite – Next-gen build tool  
- Hono – Lightweight web framework  
- Tailwind CSS – Utility-first CSS framework  
- SQLite – Embedded database  

---

**Z Note** – A lightweight, self-hosted note-taking system, your personal knowledge management companion 🚀