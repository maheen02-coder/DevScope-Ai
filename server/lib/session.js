import jwt from 'jsonwebtoken'
import { getConfig } from '../config.js'

function durationToMs(value) {
  const match = /^(\d+)\s*(s|m|h|d)?$/i.exec(String(value || '7d').trim())
  if (!match) return 7 * 24 * 60 * 60 * 1000
  const amount = Number(match[1])
  const unit = (match[2] || 's').toLowerCase()
  const multiplier = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]
  return amount * multiplier
}

export function issueSessionToken(user) {
  const config = getConfig()
  return jwt.sign({ sub: user.id, v: user.token_version, typ: 'session' }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.jwtExpiresIn,
    issuer: 'devscope-ai',
    audience: 'devscope-web',
  })
}

export function verifySessionToken(token) {
  const config = getConfig()
  try {
    const payload = jwt.verify(token, config.jwtSecret, {
      algorithms: ['HS256'],
      issuer: 'devscope-ai',
      audience: 'devscope-web',
    })
    if (!payload || payload.typ !== 'session' || typeof payload.sub !== 'string') return null
    return payload
  } catch {
    return null
  }
}

export function setSessionCookie(res, user) {
  const config = getConfig()
  res.cookie(config.cookieName, issueSessionToken(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/',
    maxAge: durationToMs(config.jwtExpiresIn),
  })
}

export function clearSessionCookie(res) {
  const config = getConfig()
  res.clearCookie(config.cookieName, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/',
  })
}
