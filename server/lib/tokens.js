const MODEL_CONTEXT_WINDOWS = {
  'openai/gpt-oss-120b': 131_072,
  'openai/gpt-oss-20b': 131_072,
  'openai/gpt-oss-safeguard-20b': 131_072,
  'llama-3.3-70b-versatile': 131_072,
  'llama-3.1-8b-instant': 131_072,
  'meta-llama/llama-4-scout-17b-16e-instruct': 131_072,
  'meta-llama/llama-4-maverick-17b-128e-instruct': 131_072,
  'moonshotai/kimi-k2-instruct': 131_072,
  'qwen/qwen3.8-27b': 131_072,
  'deepseek-r1-distill-llama-70b': 131_072,
  'mixtral-8x7b-32768': 32_768,
  'gemma2-9b-it': 8192,
  'allam-2-7b': 4096,
}

const DEFAULT_CONTEXT_WINDOW = 32_768
const MAX_DERIVED_INPUT_TOKENS = 48_000

// Deliberately conservative: code and English average ~4 chars/token, but JSON,
// punctuation, and non-ASCII text tokenize worse. Overestimating keeps us under
// provider limits instead of discovering them with a 413.
export function estimateTokens(text) {
  const value = String(text ?? '')
  if (!value) return 0
  let nonAscii = 0
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) > 0x7f) nonAscii += 1
  }
  const ascii = value.length - nonAscii
  return Math.ceil(ascii / 3.6 + nonAscii * 1.05)
}

export function estimateTokensForBytes(bytes) {
  const size = Number(bytes)
  if (!Number.isFinite(size) || size <= 0) return 0
  return Math.ceil(size / 3.2)
}

export function trimToTokenBudget(text, maxTokens) {
  const value = String(text ?? '')
  if (!value) return { text: '', truncated: false }
  if (maxTokens <= 0) return { text: '', truncated: true }
  if (estimateTokens(value) <= maxTokens) return { text: value, truncated: false }

  let length = Math.min(value.length, Math.max(0, Math.floor(maxTokens * 3.4)))
  let candidate = value.slice(0, length)
  while (length > 0 && estimateTokens(candidate) > maxTokens) {
    length = Math.floor(length * 0.92)
    candidate = value.slice(0, length)
  }
  return { text: candidate, truncated: true }
}

export function modelContextWindow(model, override) {
  if (override > 0) return override
  const key = String(model || '').toLowerCase()
  return MODEL_CONTEXT_WINDOWS[key] ?? DEFAULT_CONTEXT_WINDOW
}

export function resolveAiLimits(config, depth = 'standard') {
  const contextWindow = modelContextWindow(config.groqModel, config.aiContextWindow)
  const maxOutputTokens = Math.min(
    config.aiMaxOutputTokens,
    Math.max(512, Math.floor(contextWindow * 0.3)),
  )
  const derivedInput = Math.max(0, contextWindow - maxOutputTokens - 2000)
  const inputTokenLimit = Math.max(
    0,
    Math.min(
      derivedInput,
      config.aiMaxInputTokens > 0 ? config.aiMaxInputTokens : MAX_DERIVED_INPUT_TOKENS,
    ),
  )
  const deep = depth === 'deep'
  const maxBatches = Math.max(1, deep ? config.aiMaxBatches : Math.min(2, config.aiMaxBatches))

  return {
    model: config.groqModel,
    contextWindow,
    maxOutputTokens,
    inputTokenLimit,
    totalInputTokenLimit:
      config.aiMaxTotalInputTokens > 0
        ? config.aiMaxTotalInputTokens
        : inputTokenLimit * (maxBatches + 1),
    maxBatches,
    maxFiles: Math.max(1, deep ? config.aiMaxFiles : Math.min(10, config.aiMaxFiles)),
    maxFileTokens: Math.max(
      200,
      deep ? config.aiMaxFileTokens : Math.min(2500, config.aiMaxFileTokens),
    ),
    maxReadmeTokens: Math.max(
      200,
      deep ? config.aiMaxReadmeTokens : Math.min(3000, config.aiMaxReadmeTokens),
    ),
    maxTreePaths: deep ? 200 : 120,
  }
}
