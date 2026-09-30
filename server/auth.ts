import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'

import type { UserRole } from './generated/prisma/client.js'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: UserRole
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

const secret = () => {
  const value = process.env.JWT_SECRET
  if (!value || value.length < 32) throw new Error('JWT_SECRET deve possuir pelo menos 32 caracteres.')
  return value
}

export const createToken = (user: AuthUser) =>
  jwt.sign({ name: user.name, email: user.email, role: user.role }, secret(), {
    subject: user.id,
    expiresIn: '8h',
  })

export const requireAuth = (request: Request, response: Response, next: NextFunction) => {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!token) return response.status(401).json({ message: 'Autenticação necessária.' })

  try {
    const payload = jwt.verify(token, secret()) as jwt.JwtPayload
    if (!payload.sub || !payload.email || !payload.role) throw new Error('Token incompleto')
    request.user = {
      id: payload.sub,
      name: String(payload.name ?? ''),
      email: String(payload.email),
      role: payload.role as UserRole,
    }
    next()
  } catch {
    return response.status(401).json({ message: 'Sessão inválida ou expirada.' })
  }
}

export const allow = (...roles: UserRole[]) => (request: Request, response: Response, next: NextFunction) => {
  if (!request.user || !roles.includes(request.user.role)) {
    return response.status(403).json({ message: 'Seu perfil não possui permissão para esta ação.' })
  }
  next()
}
