import jwt from 'jsonwebtoken'

import { config } from '../config.js'

export type TokenPayload = { sub: string; role: string }

export const signToken = (payload: TokenPayload) =>
  jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  })

export const verifyToken = (token: string) =>
  jwt.verify(token, config.JWT_SECRET) as TokenPayload & jwt.JwtPayload
