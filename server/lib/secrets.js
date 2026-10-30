const TOKEN_PATTERNS = [
  [
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    '[REDACTED PRIVATE KEY]',
  ],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '[REDACTED TOKEN]'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, '[REDACTED TOKEN]'],
  [/\bgsk_[A-Za-z0-9]{20,}\b/g, '[REDACTED TOKEN]'],
  [/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g, '[REDACTED TOKEN]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED ACCESS KEY]'],
  [/\bASIA[0-9A-Z]{16}\b/g, '[REDACTED ACCESS KEY]'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, '[REDACTED TOKEN]'],
  [/\bAIza[0-9A-Za-z_-]{30,}\b/g, '[REDACTED KEY]'],
  [/\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{10,}\b/g, '[REDACTED KEY]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED JWT]'],
]

const ASSIGNMENT_PATTERN =
  /\b(api[_-]?key|secret|token|password|passwd|pwd|client[_-]?secret|access[_-]?key|private[_-]?key)\b(\s*[:=]\s*)(["']?)([A-Za-z0-9+/=_\-.]{8,})\3/gi

const SAFE_VALUE =
  /^(?:process\.env|import\.meta\.env|os\.environ|\$\{|\$[A-Za-z_]|example|placeholder|changeme|dummy|test[_-]?key|your[_-]?|redacted|null|undefined|true|false)/i

export function redactSecrets(text) {
  const input = String(text ?? '')
  if (!input) return { text: '', count: 0 }
  let count = 0
  let output = input
  for (const [pattern, replacement] of TOKEN_PATTERNS) {
    output = output.replace(pattern, () => {
      count += 1
      return replacement
    })
  }
  output = output.replace(ASSIGNMENT_PATTERN, (match, name, separator, quote, value) => {
    if (SAFE_VALUE.test(value)) return match
    count += 1
    return `${name}${separator}${quote}[REDACTED]${quote}`
  })
  return { text: output, count }
}

export function isSensitivePath(path) {
  const normalized = String(path || '').toLowerCase()
  const filename = normalized.split('/').pop()
  if (filename === '.env' || filename.startsWith('.env.')) return true
  if (
    [
      '.npmrc',
      '.netrc',
      '.pypirc',
      'credentials',
      'credentials.json',
      'secrets.json',
      'secrets.yml',
      'secrets.yaml',
      'id_rsa',
      'id_dsa',
      'id_ecdsa',
      'id_ed25519',
    ].includes(filename)
  ) {
    return true
  }
  if (/\.(pem|key|p12|pfx|jks|keystore|asc|ppk)$/.test(filename)) return true
  if (/(^|\/)secrets?\.(json|ya?ml|toml|ini|txt)$/.test(normalized)) return true
  if (/(^|\/)terraform\.tfstate(\.|$)/.test(filename)) return true
  return /\.tfvars$/.test(filename)
}
