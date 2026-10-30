import { Router } from 'express'
import swaggerUi from 'swagger-ui-express'
import { openapiSpec } from '../openapi.js'

const router = Router()

// Swagger UI ships an inline bootstrap script, so this scoped policy overrides the global
// production CSP for the documentation pages only.
function docsCsp(req, res, next) {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  )
  next()
}

router.get('/openapi.json', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300')
  res.json(openapiSpec)
})

router.use(
  '/docs',
  docsCsp,
  swaggerUi.serve,
  swaggerUi.setup(openapiSpec, {
    customSiteTitle: 'DevScope AI API docs',
    swaggerOptions: { persistAuthorization: false, displayRequestDuration: true },
  }),
)

export default router
