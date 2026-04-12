import { Request, Response, NextFunction } from 'express'
import admin from 'firebase-admin'

const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean)

export interface AuthRequest extends Request {
  uid?: string
  email?: string
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' })
    return
  }

  const token = header.slice(7)
  try {
    const decoded = await admin.auth().verifyIdToken(token)
    const email = decoded.email
    if (!email || !ALLOWED_EMAILS.includes(email)) {
      res.status(403).json({ error: 'Email not authorized' })
      return
    }
    req.uid = decoded.uid
    req.email = email
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}
