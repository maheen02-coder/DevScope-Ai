import { getConfig } from '../config.js'
import { verifySessionToken, clearSessionCookie } from '../lib/session.js'
import { findUserById } from '../services/users.js'
import { unauthorized } from '../lib/errors.js'

export function requireAuth(req, res, next) {
  const config = getConfig()
  const token = req.cookies?.[config.cookieName]
  if (!token) {
    return next(unauthorized('Authentication required.'))
  }
  const payload = verifySessionToken(token)
  if (!payload) {
    clearSessionCookie(res)
    return next(unauthorized('Your session has expired. Please sign in again.', 'SESSION_EXPIRED'))
  }
  const user = findUserById(payload.sub)
  if (!user || user.token_version !== payload.v) {
    clearSessionCookie(res)
    return next(
      unauthorized('Your session is no longer valid. Please sign in again.', 'SESSION_EXPIRED'),
    )
  }
  req.user = user
  next()
}
