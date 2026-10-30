import Groq from 'groq-sdk'
import { z } from 'zod'
import { getConfig } from '../config.js'
import { ApiError } from '../lib/errors.js'
import { getLogger } from '../lib/logger.js'
import { estimateTokens, resolveAiLimits } from '../lib/tokens.js'
import {
  ANALYSIS_SYSTEM_PROMPT,
  BATCH_SYSTEM_PROMPT,
  CHAT_SYSTEM_PROMPT,
  buildAnalysisPrompt,
  buildBatchPrompt,
  buildChatContextBlock,
  buildSynthesisPrompt,
  chatStyleInstruction,
} from '../prompts.js'

let client = null
let clientFingerprint = ''

export function isAiConfigured() {
  return Boolean(getConfig().groqApiKey)
}

function getClient() {
  const config = getConfig()
  if (!config.groqApiKey) {
    throw new ApiError(
      503,
      'AI_NOT_CONFIGURED',
      'AI features are not configured. Add a GROQ_API_KEY to the server environment and restart.',
    )
  }
  const fingerprint = `${config.groqApiKey}:${config.groqApiBase}`
  if (!client || clientFingerprint !== fingerprint) {
    client = new Groq({
      apiKey: config.groqApiKey,
      baseURL: config.groqApiBase,
      timeout: config.aiTimeoutMs,
      maxRetries: 1,
    })
    clientFingerprint = fingerprint
  }
  return client
}

const severitySchema = z.enum(['low', 'medium', 'high'])
const scoreSchema = z.coerce
  .number()
  .min(0)
  .max(100)
  .transform((value) => Math.round(value))
const filePathSchema = z.string().min(1).max(300)
const itemSchema = z.object({
  title: z.string().min(1).max(160),
  detail: z.string().min(1).max(1500),
  files: z.array(filePathSchema).max(5).optional(),
})
const techSchema = z.object({
  name: z.string().min(1).max(80),
  purpose: z.string().min(1).max(300),
})

const moneySchema = z.number().min(0).max(1_000_000_000)
const valuationSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/),
  sellingPrice: moneySchema,
  buildPrice: moneySchema,
  range: z.object({
    low: moneySchema,
    typical: moneySchema,
    high: moneySchema,
  }),
  suggestedAsk: moneySchema,
  suggestedAskReasoning: z.string().min(20).max(2000),
  buildScope: z.string().min(10).max(2000),
  factors: z
    .array(
      z.object({
        factor: z.string().min(1).max(160),
        impact: z.enum(['positive', 'negative']),
        detail: z.string().min(1).max(1000),
      }),
    )
    .min(1)
    .max(10),
  missingFeatures: z
    .array(
      z.object({
        title: z.string().min(1).max(160),
        detail: z.string().min(1).max(1000),
        estimatedValue: moneySchema,
      }),
    )
    .max(8),
  improvements: z
    .array(
      z.object({
        title: z.string().min(1).max(160),
        detail: z.string().min(1).max(1000),
        priceImpact: z.enum(['low', 'medium', 'high']),
      }),
    )
    .min(1)
    .max(8),
  assumptions: z.array(z.string().min(1).max(400)).min(1).max(8),
  confidence: z.enum(['low', 'medium', 'high']),
})

const onboardingSchema = z.object({
  prerequisites: z.array(z.string().min(1).max(300)).max(8),
  steps: z.array(itemSchema).max(8),
  keyFiles: z.array(filePathSchema).max(8),
})

const layerSchema = z.object({
  name: z.string().min(1).max(80),
  responsibility: z.string().min(1).max(600),
  components: z.array(z.string().min(1).max(120)).max(10),
})

const analysisSchema = z.object({
  summary: z.string().min(20).max(2000),
  architecture: z.string().min(10).max(4000),
  layers: z.array(layerSchema).max(8).nullish(),
  techStack: z.array(techSchema).max(20),
  strengths: z.array(itemSchema).min(1).max(8),
  weaknesses: z.array(itemSchema).min(1).max(8),
  securityConcerns: z.array(itemSchema.extend({ severity: severitySchema })).max(8),
  recommendations: z
    .array(itemSchema.extend({ priority: severitySchema }))
    .min(1)
    .max(10),
  scores: z.object({
    overall: scoreSchema,
    codeQuality: scoreSchema,
    architecture: scoreSchema,
    maintainability: scoreSchema,
    documentation: scoreSchema,
    security: scoreSchema,
    testing: scoreSchema,
  }),
  complexity: z.enum(['low', 'moderate', 'high']),
  onboardingEffort: z.enum(['low', 'moderate', 'high']),
  tags: z.array(z.string().min(1).max(40)).min(1).max(12),
  onboarding: onboardingSchema.nullish(),
  valuation: valuationSchema,
})

const batchFindingsSchema = z.object({
  scopeSummary: z.string().min(10).max(2000),
  architectureNotes: z.string().max(4000),
  techStack: z.array(techSchema).max(16),
  strengths: z.array(itemSchema).max(6),
  weaknesses: z.array(itemSchema).max(6),
  securityConcerns: z.array(itemSchema.extend({ severity: severitySchema })).max(6),
  recommendations: z.array(itemSchema.extend({ priority: severitySchema })).max(7),
  filesReviewed: z.array(z.string()).max(40),
})

const CONTEXT_ERROR_PATTERN =
  /context[_ ]length|maximum context|prompt is too long|reduce the length|exceeds? the (?:model'?s? )?(?:maximum|context)|input is too large/i

function providerDetail(error) {
  return [error?.code, error?.error?.code, error?.message, error?.error?.message]
    .filter(Boolean)
    .join(' ')
}

export function isContextLengthError(error) {
  if (error instanceof ApiError) return error.code === 'AI_CONTEXT_TOO_LARGE'
  if (error?.status === 413) return true
  return (
    /context_length_exceeded|tokens_exceeded|request_too_large/i.test(providerDetail(error)) ||
    CONTEXT_ERROR_PATTERN.test(providerDetail(error))
  )
}

function providerRequestLimit(error) {
  const detail = providerDetail(error)
  const patterns = [
    /tokens per minute[^)]*\):\s*limit\s*([\d,]+)/i,
    /tokens per minute[^.]*?limit\s*([\d,]+)/i,
    /limit\s*([\d,]+)\s*,\s*requested/i,
    /maximum of\s*([\d,]+)\s*tokens/i,
  ]
  for (const pattern of patterns) {
    const match = detail.match(pattern)
    if (match) {
      const value = Number(match[1].replace(/,/g, ''))
      if (Number.isFinite(value) && value > 0) return value
    }
  }
  return 0
}

function isThroughputLimitError(error) {
  return /tokens per minute|\bTPM\b/i.test(providerDetail(error)) || error?.error?.type === 'tokens'
}

function isJsonValidationError(error) {
  if (error?.status !== 400) return false
  const detail = providerDetail(error)
  return (
    /json_validate_failed/i.test(detail) ||
    /failed to (?:validate|generate) json/i.test(detail) ||
    /does not match the expected schema/i.test(detail)
  )
}

function providerErrorCode(error) {
  const direct = error?.error?.code || error?.code
  if (direct) return direct
  // groq-sdk surfaces the raw response body in `message` for some 400s.
  const match = String(error?.message || '').match(/"code"\s*:\s*"([^"]+)"/)
  return match ? match[1] : null
}

function describeContextProblem(limits, estimatedTokens) {
  if (!limits) {
    return 'The repository context exceeds the model context window. Reduce AI_MAX_FILES or AI_MAX_FILE_TOKENS, or configure a larger-context GROQ_MODEL.'
  }
  return (
    `The repository context still exceeds the model limit after prioritization and batching. ` +
    `Model ${limits.model} is configured for about ${limits.inputTokenLimit} input tokens per request, ` +
    `and the smallest request needed about ${estimatedTokens || limits.inputTokenLimit} tokens. ` +
    `Lower AI_MAX_FILE_TOKENS or AI_MAX_FILES, verify AI_CONTEXT_WINDOW matches the model's real limit, ` +
    `or set GROQ_MODEL to a larger-context model.`
  )
}

function providerError(error, { limits, estimatedTokens, analysisMode, requestLimit } = {}) {
  if (error instanceof ApiError) return error
  const status = error?.status
  getLogger().warn(
    {
      provider: 'groq',
      errorName: error?.name || null,
      status: status ?? null,
      errorCode: error?.code || null,
      errorMessage: String(error?.message || '').slice(0, 300),
    },
    'AI provider error',
  )
  const limit = requestLimit || providerRequestLimit(error)
  if (isThroughputLimitError(error)) {
    // Groq reports tokens-per-minute violations as HTTP 413, which is easy to
    // mistake for a context-window error. Surface it as throttling instead.
    return new ApiError(
      429,
      'AI_RATE_LIMITED',
      `Groq rejected the request because it exceeds the account's tokens-per-minute allowance${
        limit ? ` (${limit} tokens per minute)` : ''
      }${estimatedTokens ? `; the request needed about ${estimatedTokens} tokens` : ''}.`,
      {
        provider: 'groq',
        model: limits?.model ?? null,
        tokensPerMinute: limit || null,
        estimatedRequestTokens: estimatedTokens ?? null,
        inputTokenLimit: limits?.inputTokenLimit ?? null,
        contextWindow: limits?.contextWindow ?? null,
        mode: analysisMode ?? null,
        suggestion:
          'Wait for the token-per-minute window to reset, lower AI_MAX_INPUT_TOKENS and AI_MAX_FILE_TOKENS, or use a Groq plan with a higher tokens-per-minute allowance.',
      },
    )
  }
  if (isContextLengthError(error)) {
    return new ApiError(
      422,
      'AI_CONTEXT_TOO_LARGE',
      describeContextProblem(limits, estimatedTokens),
      {
        model: limits?.model ?? null,
        contextWindow: limits?.contextWindow ?? null,
        inputTokenLimit: limits?.inputTokenLimit ?? null,
        estimatedRequestTokens: estimatedTokens ?? null,
        mode: analysisMode ?? null,
        suggestion:
          'Lower AI_MAX_FILE_TOKENS / AI_MAX_FILES, or configure a larger-context GROQ_MODEL such as openai/gpt-oss-120b.',
      },
    )
  }
  if (status === 401 || status === 403) {
    return new ApiError(
      503,
      'AI_AUTH_FAILED',
      'The configured Groq API key was rejected. Verify GROQ_API_KEY.',
    )
  }
  if (status === 429) {
    return new ApiError(
      429,
      'AI_RATE_LIMITED',
      'The AI provider is rate limiting requests. Please retry shortly.',
    )
  }
  if (
    error?.name === 'APIConnectionTimeoutError' ||
    error?.name === 'TimeoutError' ||
    /timed out|timeout/i.test(error?.message || '')
  ) {
    return new ApiError(
      504,
      'AI_TIMEOUT',
      'The AI provider took too long to respond. Please try again.',
    )
  }
  if (status === 400) {
    if (isJsonValidationError(error)) {
      return new ApiError(
        502,
        'AI_INVALID_JSON',
        'The AI model returned malformed JSON, so the provider rejected the response. Please run the analysis again; if it keeps happening, raise AI_MAX_OUTPUT_TOKENS.',
        {
          provider: 'groq',
          model: limits?.model ?? null,
          mode: analysisMode ?? null,
          suggestion:
            'Increase AI_MAX_OUTPUT_TOKENS (for example 4096) so the JSON analysis has more room to finish.',
        },
      )
    }
    return new ApiError(
      502,
      'AI_BAD_REQUEST',
      'The AI provider rejected the request. Check the configured model.',
      {
        provider: 'groq',
        model: limits?.model ?? null,
        providerCode: providerErrorCode(error),
        mode: analysisMode ?? null,
      },
    )
  }
  return new ApiError(
    502,
    'AI_UNAVAILABLE',
    'The AI provider is temporarily unavailable. Please try again.',
  )
}

function assertLimitsUsable(limits) {
  const instructions = estimateTokens(ANALYSIS_SYSTEM_PROMPT)
  if (limits.inputTokenLimit <= instructions + 200) {
    throw new ApiError(
      422,
      'AI_LIMITS_TOO_SMALL',
      `The configured input token limit (${limits.inputTokenLimit}) is too small for the analysis instructions alone (~${instructions} tokens). Increase AI_MAX_INPUT_TOKENS, use a larger-context GROQ_MODEL, or verify AI_CONTEXT_WINDOW.`,
      {
        model: limits.model,
        contextWindow: limits.contextWindow,
        inputTokenLimit: limits.inputTokenLimit,
        instructionTokens: instructions,
      },
    )
  }
}

function extractJson(text) {
  let value = String(text || '').trim()
  value = value
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim()
  const start = value.indexOf('{')
  const end = value.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(value.slice(start, end + 1))
  } catch {
    return null
  }
}

function text(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function pickSeverity(value) {
  return ['low', 'medium', 'high'].includes(value) ? value : 'medium'
}

function pickLevel(value) {
  return ['low', 'moderate', 'high'].includes(value) ? value : 'moderate'
}

function clampScore(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(100, Math.round(number)))
}

function normalizeFilePaths(raw, limit = 5) {
  return list(raw)
    .map((path) => (typeof path === 'string' ? path.trim() : ''))
    .filter(Boolean)
    .map((path) => path.slice(0, 300))
    .slice(0, limit)
}

function normalizeItem(entry) {
  if (!entry || typeof entry !== 'object') return null
  const title = text(entry.title)
  const detail = text(entry.detail)
  if (!title || !detail) return null
  const item = { title: title.slice(0, 160), detail: detail.slice(0, 1500) }
  const files = normalizeFilePaths(entry.files)
  if (files.length) item.files = files
  return item
}

function normalizeOnboarding(raw) {
  if (!raw || typeof raw !== 'object') return null
  const prerequisites = list(raw.prerequisites)
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
    .map((entry) => entry.slice(0, 300))
    .slice(0, 8)
  const steps = list(raw.steps).map(normalizeItem).filter(Boolean).slice(0, 8)
  const keyFiles = normalizeFilePaths(raw.keyFiles, 8)
  if (!prerequisites.length && !steps.length && !keyFiles.length) return null
  return { prerequisites, steps, keyFiles }
}

function normalizeLayers(raw) {
  return list(raw)
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const name = text(entry.name).slice(0, 80)
      const responsibility = text(entry.responsibility).slice(0, 600)
      if (!name || !responsibility) return null
      const components = list(entry.components)
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean)
        .map((value) => value.slice(0, 120))
        .slice(0, 10)
      return { name, responsibility, components }
    })
    .filter(Boolean)
    .slice(0, 8)
}

function restrictFiles(item, allowed) {
  if (!item || !Array.isArray(item.files) || !item.files.length) return item
  const files = item.files.filter((path) => allowed.has(path))
  if (files.length) return { ...item, files }
  const next = { ...item }
  delete next.files
  return next
}

function restrictFindings(items, allowed) {
  return list(items).map((item) => restrictFiles(item, allowed))
}

function sanitizeCitations(analysis, files) {
  if (!analysis) return analysis
  const allowed = new Set(list(files).map((file) => file.path))
  return {
    ...analysis,
    strengths: restrictFindings(analysis.strengths, allowed),
    weaknesses: restrictFindings(analysis.weaknesses, allowed),
    securityConcerns: restrictFindings(analysis.securityConcerns, allowed),
    recommendations: restrictFindings(analysis.recommendations, allowed),
    onboarding: analysis.onboarding
      ? {
          ...analysis.onboarding,
          steps: restrictFindings(analysis.onboarding.steps, allowed),
          keyFiles: list(analysis.onboarding.keyFiles).filter((path) => allowed.has(path)),
        }
      : analysis.onboarding,
  }
}

function normalizeTechStack(raw, limit = 16) {
  return list(raw)
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const name = text(entry.name)
      if (!name) return null
      return {
        name: name.slice(0, 80),
        purpose: text(entry.purpose, 'Referenced in the repository.').slice(0, 300),
      }
    })
    .filter(Boolean)
    .slice(0, limit)
}

function parseMoney(value) {
  let number = null
  if (typeof value === 'number') {
    number = value
  } else if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.]/g, '')
    if (cleaned && cleaned !== '.') number = Number(cleaned)
  }
  if (!Number.isFinite(number)) return null
  return Math.round(Math.min(1_000_000_000, Math.max(0, number)))
}

function normalizeValuation(raw) {
  if (!raw || typeof raw !== 'object') return null

  const sellingPrice = parseMoney(raw.sellingPrice)
  const buildPrice = parseMoney(raw.buildPrice)
  const rangeRaw = raw.range && typeof raw.range === 'object' ? raw.range : {}
  const low = parseMoney(rangeRaw.low)
  const typical = parseMoney(rangeRaw.typical)
  const high = parseMoney(rangeRaw.high)
  const suggestedAsk = parseMoney(raw.suggestedAsk)
  if (
    [sellingPrice, buildPrice, low, typical, high, suggestedAsk].some((value) => value === null)
  ) {
    return null
  }

  const lowValue = Math.min(low, typical, high)
  const highValue = Math.max(low, typical, high)
  const typicalValue = Math.min(highValue, Math.max(lowValue, typical))

  const factors = list(raw.factors)
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const factor = text(entry.factor).slice(0, 160)
      const detail = text(entry.detail).slice(0, 1000)
      const impact = entry.impact === 'positive' || entry.impact === 'negative' ? entry.impact : ''
      return factor && detail && impact ? { factor, impact, detail } : null
    })
    .filter(Boolean)
    .slice(0, 10)

  const missingFeatures = list(raw.missingFeatures)
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const title = text(entry.title).slice(0, 160)
      const detail = text(entry.detail).slice(0, 1000)
      const estimatedValue = parseMoney(entry.estimatedValue)
      return title && detail && estimatedValue !== null ? { title, detail, estimatedValue } : null
    })
    .filter(Boolean)
    .slice(0, 8)

  const improvements = list(raw.improvements)
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const title = text(entry.title).slice(0, 160)
      const detail = text(entry.detail).slice(0, 1000)
      const priceImpact = ['low', 'medium', 'high'].includes(entry.priceImpact)
        ? entry.priceImpact
        : ''
      return title && detail && priceImpact ? { title, detail, priceImpact } : null
    })
    .filter(Boolean)
    .slice(0, 8)

  const assumptions = list(raw.assumptions)
    .map((entry) => text(entry).slice(0, 400))
    .filter(Boolean)
    .slice(0, 8)

  const currency = text(raw.currency, 'USD').toUpperCase()
  return {
    currency: /^[A-Z]{3}$/.test(currency) ? currency : 'USD',
    sellingPrice,
    buildPrice,
    range: { low: lowValue, typical: typicalValue, high: highValue },
    suggestedAsk,
    suggestedAskReasoning: text(raw.suggestedAskReasoning).slice(0, 2000),
    buildScope: text(raw.buildScope).slice(0, 2000),
    factors,
    missingFeatures,
    improvements,
    assumptions,
    confidence: ['low', 'medium', 'high'].includes(raw.confidence) ? raw.confidence : 'low',
  }
}

function normalizeAnalysis(raw) {
  if (!raw || typeof raw !== 'object') return null
  const scores = raw.scores && typeof raw.scores === 'object' ? raw.scores : {}
  return {
    summary: text(raw.summary).slice(0, 2000),
    architecture: text(raw.architecture).slice(0, 4000),
    layers: normalizeLayers(raw.layers) || null,
    techStack: normalizeTechStack(raw.techStack),
    strengths: list(raw.strengths).map(normalizeItem).filter(Boolean).slice(0, 6),
    weaknesses: list(raw.weaknesses).map(normalizeItem).filter(Boolean).slice(0, 6),
    securityConcerns: list(raw.securityConcerns)
      .map((entry) => {
        const base = normalizeItem(entry)
        return base ? { ...base, severity: pickSeverity(entry?.severity) } : null
      })
      .filter(Boolean)
      .slice(0, 6),
    recommendations: list(raw.recommendations)
      .map((entry) => {
        const base = normalizeItem(entry)
        return base ? { ...base, priority: pickSeverity(entry?.priority) } : null
      })
      .filter(Boolean)
      .slice(0, 7),
    scores: {
      overall: clampScore(scores.overall),
      codeQuality: clampScore(scores.codeQuality),
      architecture: clampScore(scores.architecture),
      maintainability: clampScore(scores.maintainability),
      documentation: clampScore(scores.documentation),
      security: clampScore(scores.security),
      testing: clampScore(scores.testing),
    },
    complexity: pickLevel(raw.complexity),
    onboardingEffort: pickLevel(raw.onboardingEffort),
    tags: list(raw.tags)
      .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
      .filter(Boolean)
      .map((tag) => tag.slice(0, 40))
      .slice(0, 10),
    onboarding: normalizeOnboarding(raw.onboarding),
    valuation: normalizeValuation(raw.valuation),
  }
}

function validateAnalysis(raw) {
  const normalized = normalizeAnalysis(raw)
  if (!normalized) return null
  const parsed = analysisSchema.safeParse(normalized)
  return parsed.success ? parsed.data : null
}

function normalizeBatchFindings(raw) {
  if (!raw || typeof raw !== 'object') return null
  const normalized = {
    scopeSummary: text(raw.scopeSummary).slice(0, 2000),
    architectureNotes: text(raw.architectureNotes).slice(0, 4000),
    techStack: normalizeTechStack(raw.techStack, 12),
    strengths: list(raw.strengths).map(normalizeItem).filter(Boolean).slice(0, 5),
    weaknesses: list(raw.weaknesses).map(normalizeItem).filter(Boolean).slice(0, 5),
    securityConcerns: list(raw.securityConcerns)
      .map((entry) => {
        const base = normalizeItem(entry)
        return base ? { ...base, severity: pickSeverity(entry?.severity) } : null
      })
      .filter(Boolean)
      .slice(0, 5),
    recommendations: list(raw.recommendations)
      .map((entry) => {
        const base = normalizeItem(entry)
        return base ? { ...base, priority: pickSeverity(entry?.priority) } : null
      })
      .filter(Boolean)
      .slice(0, 6),
    filesReviewed: list(raw.filesReviewed)
      .map((path) => (typeof path === 'string' ? path.trim() : ''))
      .filter(Boolean)
      .map((path) => path.slice(0, 300))
      .slice(0, 40),
  }
  const parsed = batchFindingsSchema.safeParse(normalized)
  return parsed.success ? parsed.data : null
}

function validationIssue(raw, schema) {
  const parsed = schema.safeParse(raw || {})
  if (parsed.success) return ''
  return parsed.error.issues[0]?.message || 'the response did not match the required JSON shape'
}

function repairPreface(issue, kind = 'analysis') {
  return `The previous response could not be validated as the required JSON ${kind}. Validation error: ${issue}. Return ONLY the corrected JSON object with every required field, based strictly on the repository data below.\n\n`
}

function completionText(completion) {
  return String(completion?.choices?.[0]?.message?.content || '')
}

function messagesTokens(messages) {
  return messages.reduce((sum, message) => sum + estimateTokens(message?.content) + 4, 0)
}

function messagesChars(messages) {
  return messages.reduce((sum, message) => sum + String(message?.content ?? '').length, 0)
}

function createStats() {
  return {
    modelCalls: 0,
    contextRetries: 0,
    jsonRetries: 0,
    providerRequestLimit: 0,
    estimatedInputTokens: 0,
    inputChars: 0,
    usage: { promptTokens: null, completionTokens: null },
  }
}

function recordUsage(stats, completion) {
  const prompt = completion?.usage?.prompt_tokens
  const completionTokens = completion?.usage?.completion_tokens
  if (typeof prompt === 'number')
    stats.usage.promptTokens = (stats.usage.promptTokens || 0) + prompt
  if (typeof completionTokens === 'number') {
    stats.usage.completionTokens = (stats.usage.completionTokens || 0) + completionTokens
  }
}

async function rawComplete(messages, options) {
  const config = getConfig()
  return getClient().chat.completions.create({
    model: config.groqModel,
    messages,
    temperature: options.temperature,
    max_completion_tokens: options.maxTokens,
    ...(options.json ? { response_format: { type: 'json_object' } } : {}),
    // gpt-oss models spend part of max_completion_tokens on hidden reasoning.
    // Low effort keeps that budget available for the JSON payload instead of
    // letting the response get truncated mid-object.
    ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
  })
}

function jsonCompletionOptions(limits, temperature) {
  const config = getConfig()
  const options = { temperature, maxTokens: limits.maxOutputTokens, json: true }
  if (/^openai\/gpt-oss/i.test(String(config.groqModel))) options.reasoningEffort = 'low'
  return options
}

function retryTargetTokens(stats, primaryTokens) {
  const observed = Number(stats.providerRequestLimit) || 0
  const target = observed > 0 ? Math.floor(observed * 0.85) : Math.floor(primaryTokens * 0.55)
  return Math.max(256, target)
}

async function completeWithRetry({
  buildMessages,
  options,
  stats,
  limits,
  analysisMode,
  enableShrink = true,
}) {
  const primary = buildMessages(false, 0)
  const primaryTokens = messagesTokens(primary)

  stats.modelCalls += 1
  stats.estimatedInputTokens += primaryTokens
  stats.inputChars += messagesChars(primary)

  try {
    const completion = await rawComplete(primary, options)
    recordUsage(stats, completion)
    return { completion, shrunk: false, targetTokens: 0 }
  } catch (error) {
    const requestLimit = providerRequestLimit(error)
    if (requestLimit > 0) {
      stats.providerRequestLimit = stats.providerRequestLimit
        ? Math.min(stats.providerRequestLimit, requestLimit)
        : requestLimit
    }
    if (!isContextLengthError(error) || !enableShrink) {
      if (isJsonValidationError(error)) {
        // Malformed or truncated JSON is usually transient: give the model more
        // output room and a deterministic temperature before surfacing it.
        const tpmLimited = Number(stats.providerRequestLimit) > 0
        const bumpedTokens = Math.min(
          options.maxTokens + 1024,
          6000,
          tpmLimited ? stats.providerRequestLimit - primaryTokens : 6000,
        )
        if (bumpedTokens > options.maxTokens) {
          stats.jsonRetries += 1
          stats.modelCalls += 1
          stats.estimatedInputTokens += primaryTokens
          stats.inputChars += messagesChars(primary)
          try {
            const completion = await rawComplete(primary, {
              ...options,
              temperature: 0,
              maxTokens: bumpedTokens,
            })
            recordUsage(stats, completion)
            return { completion, shrunk: false, targetTokens: 0 }
          } catch (retryError) {
            throw providerError(retryError, {
              limits,
              estimatedTokens: primaryTokens,
              analysisMode,
              requestLimit: providerRequestLimit(retryError),
            })
          }
        }
      }
      throw providerError(error, {
        limits,
        estimatedTokens: primaryTokens,
        analysisMode,
        requestLimit,
      })
    }

    // Build the fallback only after the provider rejected the primary request,
    // and size it to the limit the provider actually reported.
    const targetTokens = retryTargetTokens(stats, primaryTokens)
    const fallback = buildMessages(true, targetTokens)
    const fallbackTokens = messagesTokens(fallback)
    if (fallbackTokens >= primaryTokens) {
      throw providerError(error, {
        limits,
        estimatedTokens: primaryTokens,
        analysisMode,
        requestLimit,
      })
    }

    stats.contextRetries += 1
    stats.modelCalls += 1
    stats.estimatedInputTokens += fallbackTokens
    stats.inputChars += messagesChars(fallback)

    try {
      const completion = await rawComplete(fallback, options)
      recordUsage(stats, completion)
      return { completion, shrunk: true, targetTokens }
    } catch (retryError) {
      throw providerError(retryError, {
        limits,
        estimatedTokens: fallbackTokens,
        analysisMode,
      })
    }
  }
}

function analysisMessages(context, files, { repairIssue = '' } = {}) {
  const prompt = buildAnalysisPrompt(context, files)
  return [
    { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
    { role: 'user', content: repairIssue ? `${repairPreface(repairIssue)}${prompt}` : prompt },
  ]
}

function compactContext(context) {
  return {
    ...context,
    readme: null,
    tree: {
      ...context.tree,
      paths: (context.tree?.paths || []).slice(0, 30),
    },
  }
}

function shrinkFiles(files) {
  if (files.length <= 1) return files
  return files.slice(0, Math.ceil(files.length / 2))
}

function withAdjustedCoverage(context, files) {
  if (!context.report) return context
  return {
    ...context,
    report: { ...context.report, analyzed: files.map(fileDescriptor) },
  }
}

function droppedEntries(files, kept) {
  const keptPaths = new Set(kept.map((file) => file.path))
  return files
    .filter((file) => !keptPaths.has(file.path))
    .map((file) => ({ path: file.path, reason: 'request_token_limit' }))
}

function fitSelection(files, targetTokens, build) {
  let selected = files.slice()
  let compact = false
  let last = build(selected, compact)

  while (messagesTokens(last.messages) > targetTokens && selected.length > 1) {
    selected = shrinkFiles(selected)
    last = build(selected, compact)
  }
  if (messagesTokens(last.messages) > targetTokens && !compact) {
    compact = true
    last = build(selected, compact)
  }
  while (messagesTokens(last.messages) > targetTokens && selected.length > 1) {
    selected = selected.slice(0, Math.max(1, Math.floor(selected.length / 2)))
    last = build(selected, compact)
  }

  return { ...last, files: selected, dropped: droppedEntries(files, selected) }
}

function fitAnalysisFiles(context, files, targetTokens, repairIssue = '') {
  return fitSelection(files, targetTokens, (selected, compact) => {
    const source = withAdjustedCoverage(compact ? compactContext(context) : context, selected)
    return { source, messages: analysisMessages(source, selected, { repairIssue }) }
  })
}

function fitBatchFiles(context, batch, targetTokens, batchNumber, total, repairIssue = '') {
  return fitSelection(batch, targetTokens, (selected, compact) => {
    const source = withAdjustedCoverage(compact ? compactContext(context) : context, selected)
    return { source, messages: batchMessages(source, selected, batchNumber, total, repairIssue) }
  })
}

function fitSynthesis(context, findings, coverage, targetTokens, repairIssue = '') {
  const attempts = [
    { compact: false, material: findings },
    { compact: true, material: compactFindings(findings) },
    { compact: true, material: compactFindings(findings).slice(0, 2) },
    { compact: true, material: compactFindings(findings).slice(0, 1) },
  ]
  let last = null
  for (const attempt of attempts) {
    const source = attempt.compact ? compactContext(context) : context
    const prompt = buildSynthesisPrompt(source, attempt.material, coverage)
    const messages = [
      { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
      {
        role: 'user',
        content: repairIssue ? `${repairPreface(repairIssue)}${prompt}` : prompt,
      },
    ]
    last = { messages, compact: attempt.compact, material: attempt.material }
    if (messagesTokens(messages) <= targetTokens) return last
  }
  return last
}

async function analyzeSingle(context, limits, stats) {
  const allFiles = context.files
  let files = allFiles
  let source = withAdjustedCoverage(context, allFiles)

  const first = await completeWithRetry({
    buildMessages: (shrunk, targetTokens) => {
      if (shrunk) {
        const fitted = fitAnalysisFiles(context, allFiles, targetTokens)
        files = fitted.files
        source = fitted.source
      }
      return analysisMessages(source, files)
    },
    options: jsonCompletionOptions(limits, 0.15),
    stats,
    limits,
    analysisMode: 'single',
  })

  let raw = extractJson(completionText(first.completion))
  let analysis = validateAnalysis(raw)

  if (!analysis) {
    const issue = validationIssue(normalizeAnalysis(raw), analysisSchema)
    const repaired = await completeWithRetry({
      buildMessages: () => analysisMessages(source, files, { repairIssue: issue }),
      options: jsonCompletionOptions(limits, 0),
      stats,
      limits,
      analysisMode: 'single',
      enableShrink: false,
    })
    raw = extractJson(completionText(repaired.completion))
    analysis = validateAnalysis(raw)
  }

  if (!analysis) {
    throw new ApiError(
      502,
      'AI_INVALID_RESPONSE',
      'The AI returned an unreadable analysis. Please run it again.',
    )
  }

  return {
    analysis,
    files,
    mode: 'single',
    batches: 0,
    batchFailures: [],
    omitted: first.shrunk ? droppedEntries(allFiles, files) : [],
  }
}

function planBatches(files, { perBatchBudget, maxBatches }) {
  const batches = []
  const omitted = []
  let current = []
  let currentTokens = 0

  const flush = () => {
    if (!current.length) return
    batches.push(current)
    current = []
    currentTokens = 0
  }

  for (const file of files) {
    const cost = (file.estimatedTokens || 0) + 25
    if (cost > perBatchBudget) {
      omitted.push({ path: file.path, reason: 'file_exceeds_request_budget' })
      continue
    }
    if (current.length && currentTokens + cost > perBatchBudget) flush()
    if (!current.length && batches.length >= maxBatches) {
      omitted.push({ path: file.path, reason: 'max_batches' })
      continue
    }
    current.push(file)
    currentTokens += cost
  }
  flush()

  return { batches, omitted }
}

function batchMessages(context, files, batch, total, repairIssue = '') {
  const prompt = buildBatchPrompt(context, files, { batch, total })
  return [
    { role: 'system', content: BATCH_SYSTEM_PROMPT },
    {
      role: 'user',
      content: repairIssue ? `${repairPreface(repairIssue, 'batch findings')}${prompt}` : prompt,
    },
  ]
}

function mergeOmitted(report, extra) {
  const items = [...(report?.omitted || []), ...extra]
  const counts = { ...(report?.omittedCounts || {}) }
  for (const entry of extra) {
    counts[entry.reason] = (counts[entry.reason] || 0) + 1
  }
  return {
    items: items.slice(0, 60),
    counts,
    total: (report?.omittedTotal || 0) + extra.length,
  }
}

function fileDescriptor(file) {
  return {
    path: file.path,
    size: file.size ?? null,
    language: file.language || null,
    truncated: Boolean(file.truncated),
    estimatedTokens: file.estimatedTokens ?? null,
  }
}

function compactFindings(findings) {
  return findings.map((entry) => ({
    batch: entry.batch,
    files: entry.files.slice(0, 8),
    scopeSummary: entry.scopeSummary.slice(0, 400),
    architectureNotes: entry.architectureNotes.slice(0, 400),
    techStack: entry.techStack.slice(0, 6),
    strengths: entry.strengths.slice(0, 3),
    weaknesses: entry.weaknesses.slice(0, 3),
    securityConcerns: entry.securityConcerns.slice(0, 3),
    recommendations: entry.recommendations.slice(0, 3),
  }))
}

async function analyzeBatched(context, limits, stats) {
  const totalHint = Math.max(1, limits.maxBatches)
  const probeTokens = messagesTokens([
    { role: 'system', content: BATCH_SYSTEM_PROMPT },
    { role: 'user', content: buildBatchPrompt(context, [], { batch: 1, total: totalHint }) },
  ])
  const perBatchBudget = limits.inputTokenLimit - probeTokens - 300

  if (perBatchBudget < 300) {
    throw new ApiError(
      422,
      'AI_CONTEXT_TOO_LARGE',
      `The repository metadata and README alone need about ${probeTokens} tokens, which leaves no room for source files within the ${limits.inputTokenLimit}-token input budget. Lower AI_MAX_README_TOKENS, reduce the file tree, or configure a larger-context model.`,
      {
        model: limits.model,
        contextWindow: limits.contextWindow,
        inputTokenLimit: limits.inputTokenLimit,
        estimatedRequestTokens: probeTokens,
        mode: 'batched',
        suggestion: 'Lower AI_MAX_README_TOKENS, or set GROQ_MODEL to a larger-context model.',
      },
    )
  }

  const { batches, omitted } = planBatches(context.files, {
    perBatchBudget,
    maxBatches: limits.maxBatches,
  })

  const synthesisBudget =
    messagesTokens([
      { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
      { role: 'user', content: buildSynthesisPrompt(context, [], context.report) },
    ]) + 1500
  let plannedTokens = synthesisBudget
  while (batches.length) {
    const last = batches[batches.length - 1]
    const cost = probeTokens + last.reduce((sum, file) => sum + (file.estimatedTokens || 0) + 25, 0)
    if (plannedTokens + cost <= limits.totalInputTokenLimit) break
    batches.pop()
    for (const file of last) {
      omitted.push({ path: file.path, reason: 'total_token_budget' })
    }
  }

  if (!batches.length) {
    throw new ApiError(
      422,
      'AI_CONTEXT_TOO_LARGE',
      `None of the ${context.files.length} selected files fit the per-request budget of about ${Math.max(0, perBatchBudget)} tokens, and the total token budget of ${limits.totalInputTokenLimit} is exhausted. Lower AI_MAX_FILE_TOKENS or configure a larger-context model.`,
      {
        model: limits.model,
        contextWindow: limits.contextWindow,
        inputTokenLimit: limits.inputTokenLimit,
        totalInputTokenLimit: limits.totalInputTokenLimit,
        estimatedRequestTokens: probeTokens,
        mode: 'batched',
        suggestion: 'Lower AI_MAX_FILE_TOKENS or set GROQ_MODEL to a larger-context model.',
      },
    )
  }

  const findings = []
  const usedFiles = []
  const batchFailures = []

  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index]
    const batchNumber = index + 1
    const total = batches.length
    let used = batch
    let source = withAdjustedCoverage(context, batch)

    // Once a tokens-per-minute limit is known, size later batches to it up
    // front instead of spending a rejected request to discover it again.
    const knownTarget = stats.providerRequestLimit > 0 ? retryTargetTokens(stats, 0) : 0
    if (knownTarget > 0) {
      const fitted = fitBatchFiles(context, batch, knownTarget, batchNumber, total)
      used = fitted.files
      source = fitted.source
    }

    try {
      const first = await completeWithRetry({
        buildMessages: (shrunk, targetTokens) => {
          if (shrunk) {
            const fitted = fitBatchFiles(context, batch, targetTokens, batchNumber, total)
            used = fitted.files
            source = fitted.source
          }
          return batchMessages(source, used, batchNumber, total)
        },
        options: jsonCompletionOptions(limits, 0.15),
        stats,
        limits,
        analysisMode: 'batched',
      })
      omitted.push(...droppedEntries(batch, used))

      let raw = extractJson(completionText(first.completion))
      let parsed = normalizeBatchFindings(raw)

      if (!parsed) {
        const issue = validationIssue(raw, batchFindingsSchema)
        const repaired = await completeWithRetry({
          buildMessages: () => batchMessages(source, used, batchNumber, total, issue),
          options: jsonCompletionOptions(limits, 0),
          stats,
          limits,
          analysisMode: 'batched',
          enableShrink: false,
        })
        raw = extractJson(completionText(repaired.completion))
        parsed = normalizeBatchFindings(raw)
      }

      if (!parsed) {
        throw new ApiError(
          502,
          'AI_INVALID_RESPONSE',
          `The AI returned unreadable batch findings for batch ${batchNumber}.`,
        )
      }

      const allowed = new Set(used.map((file) => file.path))
      const reviewed = parsed.filesReviewed.filter((path) => allowed.has(path))
      findings.push({
        batch: batchNumber,
        files: (reviewed.length ? reviewed : used.map((file) => file.path)).slice(0, 40),
        ...parsed,
        strengths: restrictFindings(parsed.strengths, allowed),
        weaknesses: restrictFindings(parsed.weaknesses, allowed),
        securityConcerns: restrictFindings(parsed.securityConcerns, allowed),
        recommendations: restrictFindings(parsed.recommendations, allowed),
        filesReviewed: reviewed,
      })
      usedFiles.push(...used)
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.code === 'AI_CONTEXT_TOO_LARGE' || error.code === 'AI_INVALID_RESPONSE')
      ) {
        const reason =
          error.code === 'AI_CONTEXT_TOO_LARGE' ? 'batch_context_limit' : 'batch_invalid_response'
        batchFailures.push({
          batch: batchNumber,
          reason,
          files: batch.map((file) => file.path).slice(0, 12),
        })
        for (const file of batch) omitted.push({ path: file.path, reason })
        continue
      }
      throw error
    }
  }

  if (!findings.length) {
    if (batchFailures.some((failure) => failure.reason === 'batch_context_limit')) {
      throw new ApiError(
        422,
        'AI_CONTEXT_TOO_LARGE',
        `Every batch still exceeded the model's input limit after batching and context retries. ${describeContextProblem(limits, probeTokens)}`,
        {
          model: limits.model,
          contextWindow: limits.contextWindow,
          inputTokenLimit: limits.inputTokenLimit,
          mode: 'batched',
          batchFailures,
        },
      )
    }
    throw new ApiError(
      502,
      'AI_INVALID_RESPONSE',
      'The AI returned unreadable findings for every batch. Please run it again.',
    )
  }

  const analysisFiles = usedFiles.map(fileDescriptor)
  const mergedOmitted = mergeOmitted(context.report, omitted)
  const coverage = {
    ...(context.report || {}),
    analyzed: analysisFiles,
    analyzedTotal: analysisFiles.length,
    omitted: mergedOmitted.items,
    omittedCounts: mergedOmitted.counts,
    omittedTotal: mergedOmitted.total,
    mode: 'batched',
    batches: batches.length,
    batchFailures,
  }

  let material = findings
  let compactSynthesis = false
  if (stats.providerRequestLimit > 0) {
    const fitted = fitSynthesis(context, findings, coverage, retryTargetTokens(stats, 0))
    material = fitted.material
    compactSynthesis = fitted.compact
  }
  const synthesisMessages = (repairIssue = '') => {
    const source = compactSynthesis ? compactContext(context) : context
    const prompt = buildSynthesisPrompt(source, material, coverage)
    return [
      { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
      { role: 'user', content: repairIssue ? `${repairPreface(repairIssue)}${prompt}` : prompt },
    ]
  }

  const first = await completeWithRetry({
    buildMessages: (shrunk, targetTokens) => {
      if (shrunk) {
        const fitted = fitSynthesis(context, findings, coverage, targetTokens)
        material = fitted.material
        compactSynthesis = fitted.compact
      }
      return synthesisMessages()
    },
    options: jsonCompletionOptions(limits, 0.15),
    stats,
    limits,
    analysisMode: 'batched',
  })
  let raw = extractJson(completionText(first.completion))
  let analysis = validateAnalysis(raw)

  if (!analysis) {
    const issue = validationIssue(normalizeAnalysis(raw), analysisSchema)
    const repaired = await completeWithRetry({
      buildMessages: () => synthesisMessages(issue),
      options: jsonCompletionOptions(limits, 0),
      stats,
      limits,
      analysisMode: 'batched',
      enableShrink: false,
    })
    raw = extractJson(completionText(repaired.completion))
    analysis = validateAnalysis(raw)
  }

  if (!analysis) {
    throw new ApiError(
      502,
      'AI_INVALID_RESPONSE',
      'The AI returned an unreadable synthesis. Please run it again.',
    )
  }

  return {
    analysis,
    files: usedFiles,
    mode: 'batched',
    batches: batches.length,
    batchFailures,
    omitted,
  }
}

export const VALUATION_DISCLAIMER =
  'AI estimate from model knowledge of typical software markets, not an appraisal or verified market data. There is no guarantee of sale at any price; actual prices depend on buyers, negotiation, IP ownership, and independent code review.'

export async function analyzeRepository(context) {
  const config = getConfig()
  const limits = context.limits || resolveAiLimits(config, context.depth)
  assertLimitsUsable(limits)

  if (
    !context.files.length &&
    (context.report?.candidateFiles || 0) > 0 &&
    (context.report?.omittedTotal || 0) > 0
  ) {
    throw new ApiError(
      422,
      'AI_CONTEXT_TOO_LARGE',
      `None of the ${context.report.candidateFiles} candidate files fit the configured per-file or total token budget. Increase AI_MAX_FILE_TOKENS / AI_MAX_FILES, or reduce AI_MAX_README_TOKENS so more room remains for source files.`,
      {
        model: limits.model,
        contextWindow: limits.contextWindow,
        inputTokenLimit: limits.inputTokenLimit,
        totalInputTokenLimit: limits.totalInputTokenLimit,
        candidateFiles: context.report.candidateFiles,
        omitted: context.report.omittedCounts || {},
        suggestion: 'Increase AI_MAX_FILE_TOKENS / AI_MAX_FILES, or lower AI_MAX_README_TOKENS.',
      },
    )
  }

  const startedAt = Date.now()
  const stats = createStats()
  const fullPromptTokens = messagesTokens(analysisMessages(context, context.files))
  const mode = fullPromptTokens <= limits.inputTokenLimit ? 'single' : 'batched'

  const result =
    mode === 'single'
      ? await analyzeSingle(context, limits, stats)
      : await analyzeBatched(context, limits, stats)

  const analysis = sanitizeCitations(result.analysis, result.files)
  const analyzed = result.files.map(fileDescriptor)
  const mergedOmitted = mergeOmitted(context.report, result.omitted)
  const coverage = {
    ...(context.report || {}),
    analyzed,
    analyzedTotal: analyzed.length,
    omitted: mergedOmitted.items,
    omittedCounts: mergedOmitted.counts,
    omittedTotal: mergedOmitted.total,
    mode: result.mode,
    batches: result.batches,
    batchFailures: result.batchFailures,
    contextRetries: stats.contextRetries,
    jsonRetries: stats.jsonRetries,
    providerRequestLimit: stats.providerRequestLimit || null,
    modelCalls: stats.modelCalls,
    estimatedInputTokens: stats.estimatedInputTokens,
  }

  return {
    analysis,
    model: limits.model,
    usage: { ...stats.usage },
    meta: {
      durationMs: Date.now() - startedAt,
      depth: context.depth || 'standard',
      mode: result.mode,
      batches: result.batches,
      modelCalls: stats.modelCalls,
      contextRetries: stats.contextRetries,
      jsonRetries: stats.jsonRetries,
      providerRequestLimit: stats.providerRequestLimit || null,
      batchFailures: result.batchFailures,
      estimatedInputTokens: stats.estimatedInputTokens,
      inputChars: stats.inputChars,
      filesAnalyzed: analyzed.length,
      files: analyzed,
      coverage,
      valuation: analysis.valuation
        ? {
            currency: analysis.valuation.currency,
            method: 'ai-estimate',
            disclaimer: VALUATION_DISCLAIMER,
          }
        : null,
      generatedAt: new Date().toISOString(),
    },
  }
}

export async function chatAboutRepository({
  context,
  latestAnalysis,
  history,
  message,
  chatStyle,
}) {
  const config = getConfig()
  const limits = context.limits || resolveAiLimits(config, 'standard')
  const stats = createStats()

  const priorMessages = history.slice(-16).map((entry) => ({
    role: entry.role === 'assistant' ? 'assistant' : 'user',
    content: String(entry.content || '').slice(0, 4000),
  }))
  const latest = String(message).slice(0, 4000)

  const buildVariant = ({ compact, historyLimit, messageLimit }) => {
    const chatContext = compact
      ? { ...context, readme: null, treePaths: (context.treePaths || []).slice(0, 20) }
      : context
    const systemMessage = `${CHAT_SYSTEM_PROMPT}\n\n${buildChatContextBlock(chatContext, latestAnalysis)}\n\n${chatStyleInstruction(chatStyle)}`
    return [
      { role: 'system', content: systemMessage },
      ...priorMessages.slice(-historyLimit),
      { role: 'user', content: latest.slice(0, messageLimit) },
    ]
  }

  const variants = [
    () => buildVariant({ compact: false, historyLimit: 16, messageLimit: 4000 }),
    () => buildVariant({ compact: true, historyLimit: 6, messageLimit: 4000 }),
    () => buildVariant({ compact: true, historyLimit: 0, messageLimit: 2000 }),
  ]

  let active = variants.findIndex((build) => messagesTokens(build()) <= limits.inputTokenLimit)
  if (active === -1) active = variants.length - 1

  const { completion } = await completeWithRetry({
    buildMessages: (shrunk, targetTokens) => {
      if (shrunk) {
        const fitting = variants.findIndex(
          (build, index) => index > active && messagesTokens(build()) <= targetTokens,
        )
        active = fitting === -1 ? variants.length - 1 : fitting
      }
      return variants[active]()
    },
    options: { temperature: 0.3, maxTokens: Math.min(1100, limits.maxOutputTokens), json: false },
    stats,
    limits,
    analysisMode: 'chat',
  })

  const content = String(completion.choices?.[0]?.message?.content || '').trim()
  if (!content) {
    throw new ApiError(502, 'AI_EMPTY_RESPONSE', 'The AI returned an empty response. Please retry.')
  }

  return {
    content,
    model: limits.model,
    usage: { ...stats.usage },
    meta: {
      estimatedInputTokens: stats.estimatedInputTokens,
      contextRetries: stats.contextRetries,
      contextTruncated: active > 0,
    },
  }
}
