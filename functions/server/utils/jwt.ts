// Node implementation moved here as archive; functions should use Workers-compatible jwt
import jwt from 'jsonwebtoken'
import crypto from 'crypto'

const JWT_SECRET = process.env.JWT_SECRET || (typeof globalThis !== 'undefined' && (globalThis as any).JWT_SECRET) || 'c390ea6f-8888-4cc2-b34e-a33ef10a313d'

export interface JWTPayload {
  userId: string
  email: string
  role: string
  iat?: number
  exp?: number
}

export function generateToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d', issuer: 'z-note', audience: 'z-note-users' })
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { issuer: 'z-note', audience: 'z-note-users' }) as JWTPayload
    return decoded
  } catch (error) {
    return null
  }
}

export function generateSessionId(): string { return crypto.randomBytes(32).toString('hex') }
