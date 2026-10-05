// Cloudflare Pages Functions 中介軟體
export async function onRequest(context: any) {
  const { request, env, next } = context

  // 設定全域性環境變數，供D1介面卡使用
  if (env.DB) {
    globalThis.DB = env.DB
    globalThis.CF_PAGES = true
    globalThis.JWT_SECRET = env.JWT_SECRET || 'c390ea6f-8888-4cc2-b34e-a33ef10a313d'
  }

  return next()
}