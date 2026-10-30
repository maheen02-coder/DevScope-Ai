import { Router } from 'express'
import { getConfig } from '../config.js'
import { ApiError } from '../lib/errors.js'
import { setSessionCookie } from '../lib/session.js'
import { findUserById } from '../services/users.js'
import {
  OAUTH_STATE_COOKIE,
  configurePassport,
  isProviderConfigured,
  issueOauthState,
  oauthProviderIds,
  readOauthState,
} from '../oauth.js'

const router = Router()
const passport = configurePassport()

const labels = { github: 'GitHub', google: 'Google' }

function frontendUrl() {
  const config = getConfig()
  return config.frontendOrigins[0] || `http://localhost:${config.port}`
}

function validProvider(req, res, next) {
  const { provider } = req.params
  if (!oauthProviderIds.includes(provider)) {
    return next(new ApiError(404, 'NOT_FOUND', 'Unknown OAuth provider.'))
  }
  if (!isProviderConfigured(provider)) {
    return next(
      new ApiError(
        503,
        'OAUTH_NOT_CONFIGURED',
        `${labels[provider] || provider} sign-in is not configured on this deployment.`,
      ),
    )
  }
  configurePassport()
  return next()
}

router.get('/providers', (req, res) => {
  res.json({
    providers: oauthProviderIds.map((id) => ({
      id,
      label: labels[id],
      configured: isProviderConfigured(id),
    })),
  })
})

router.get('/oauth/:provider', validProvider, (req, res, next) => {
  const { provider } = req.params
  const config = getConfig()
  const { state, token } = issueOauthState(provider)
  res.cookie(OAUTH_STATE_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/api/auth/oauth',
    maxAge: 10 * 60_000,
  })
  const scope = provider === 'github' ? ['user:email'] : ['profile', 'email']
  passport.authenticate(provider, { session: false, state, scope })(req, res, next)
})

router.get('/oauth/:provider/callback', validProvider, (req, res, next) => {
  const { provider } = req.params
  const config = getConfig()
  const statePayload = readOauthState(req.cookies?.[OAUTH_STATE_COOKIE])
  res.clearCookie(OAUTH_STATE_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/api/auth/oauth',
  })

  if (
    !statePayload ||
    statePayload.provider !== provider ||
    statePayload.state !== String(req.query.state || '')
  ) {
    res.redirect(`${frontendUrl()}/login?oauth=state`)
    return
  }

  passport.authenticate(provider, { session: false }, (error, info) => {
    if (error) {
      const reason = /email/i.test(error.message || '') ? 'email' : 'failed'
      res.redirect(`${frontendUrl()}/login?oauth=${reason}`)
      return
    }
    const user = info?.userId ? findUserById(info.userId) : null
    if (!user) {
      res.redirect(`${frontendUrl()}/login?oauth=failed`)
      return
    }
    setSessionCookie(res, user)
    res.redirect(`${frontendUrl()}/dashboard?oauth=success`)
  })(req, res, next)
})

export default router
