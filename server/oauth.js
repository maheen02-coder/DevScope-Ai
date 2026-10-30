import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import passport from 'passport'
import { Strategy as GitHubStrategy } from 'passport-github2'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { getConfig } from './config.js'
import { resolveOauthUser } from './services/oauth.js'

export const OAUTH_STATE_COOKIE = 'devscope_oauth_state'

export const oauthProviderIds = ['github', 'google']

export function isProviderConfigured(provider) {
  const config = getConfig()
  if (provider === 'github') {
    return Boolean(config.githubOauth.clientId && config.githubOauth.clientSecret)
  }
  if (provider === 'google') {
    return Boolean(config.googleOauth.clientId && config.googleOauth.clientSecret)
  }
  return false
}

export function issueOauthState(provider) {
  const state = crypto.randomBytes(24).toString('hex')
  const token = jwt.sign({ typ: 'oauth_state', provider, state }, getConfig().jwtSecret, {
    algorithm: 'HS256',
    expiresIn: '10m',
    issuer: 'devscope-ai',
    audience: 'devscope-oauth',
  })
  return { state, token }
}

export function readOauthState(token) {
  if (!token) return null
  try {
    const payload = jwt.verify(token, getConfig().jwtSecret, {
      algorithms: ['HS256'],
      issuer: 'devscope-ai',
      audience: 'devscope-oauth',
    })
    return payload?.typ === 'oauth_state' ? payload : null
  } catch {
    return null
  }
}

async function handleProfile(provider, profile, done) {
  try {
    const result = await resolveOauthUser({ provider, profile })
    done(null, { userId: result.userId, created: result.created })
  } catch (error) {
    done(error)
  }
}

const registeredProviders = new Set()

export function configurePassport() {
  const config = getConfig()

  if (isProviderConfigured('github') && !registeredProviders.has('github')) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: config.githubOauth.clientId,
          clientSecret: config.githubOauth.clientSecret,
          callbackURL: `${config.oauthBaseUrl}/api/auth/oauth/github/callback`,
          scope: ['user:email'],
        },
        (accessToken, refreshToken, profile, done) => handleProfile('github', profile, done),
      ),
    )
    registeredProviders.add('github')
  }

  if (isProviderConfigured('google') && !registeredProviders.has('google')) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: config.googleOauth.clientId,
          clientSecret: config.googleOauth.clientSecret,
          callbackURL: `${config.oauthBaseUrl}/api/auth/oauth/google/callback`,
          scope: ['profile', 'email'],
        },
        (accessToken, refreshToken, profile, done) => handleProfile('google', profile, done),
      ),
    )
    registeredProviders.add('google')
  }

  return passport
}

export function resetPassportForTests() {
  registeredProviders.clear()
}
