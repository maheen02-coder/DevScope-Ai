import { getDb } from '../db.js'
import { getConfig } from '../config.js'
import { getQuotaSummary } from './usage.js'
import { getReportStats, serializeReportListItem } from './reports.js'
import { countChatMessages, listConversations } from './chat.js'
import { getGithubStatus } from './github.js'
import { isAiConfigured } from './ai.js'

function parseAnalysis(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function summarizeValuations(rows) {
  const groups = new Map()

  for (const row of rows) {
    const analysis = parseAnalysis(row.analysis)
    const valuation = analysis?.valuation
    const suggestedAsk = Number(valuation?.suggestedAsk)
    if (!valuation || !Number.isFinite(suggestedAsk)) continue

    const currency = String(valuation.currency || 'USD').toUpperCase()
    const group = groups.get(currency) || {
      currency,
      count: 0,
      askSum: 0,
      lowSum: 0,
      highSum: 0,
      buildSum: 0,
      top: null,
    }
    group.count += 1
    group.askSum += suggestedAsk
    group.lowSum += Number(valuation.range?.low) || 0
    group.highSum += Number(valuation.range?.high) || 0
    group.buildSum += Number(valuation.buildPrice) || 0
    if (!group.top || suggestedAsk > group.top.suggestedAsk) {
      group.top = {
        id: row.id,
        repoFullName: row.repo_full_name,
        suggestedAsk: Math.round(suggestedAsk),
      }
    }
    groups.set(currency, group)
  }

  const all = [...groups.values()]
  if (!all.length) {
    return {
      reports: 0,
      currency: null,
      currencies: [],
      mixedCurrencies: false,
      averageSuggestedAsk: null,
      averageBuildPrice: null,
      totalLow: null,
      totalHigh: null,
      topOpportunity: null,
    }
  }

  // Only aggregate within one currency; summing across currencies would be misleading.
  const dominant = all.reduce((best, group) => (group.count > best.count ? group : best), all[0])
  return {
    reports: all.reduce((sum, group) => sum + group.count, 0),
    currency: dominant.currency,
    currencies: all.map((group) => group.currency),
    mixedCurrencies: all.length > 1,
    averageSuggestedAsk: Math.round(dominant.askSum / dominant.count),
    averageBuildPrice: Math.round(dominant.buildSum / dominant.count),
    totalLow: Math.round(dominant.lowSum),
    totalHigh: Math.round(dominant.highSum),
    topOpportunity: dominant.top,
  }
}

export function getDashboard(userId) {
  const config = getConfig()
  const db = getDb()
  const stats = getReportStats(userId)

  const recentRows = db
    .prepare('SELECT * FROM reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 5')
    .all(userId)

  const languages = db
    .prepare(
      `SELECT language, COUNT(*) AS count FROM reports
       WHERE user_id = ? AND language IS NOT NULL
       GROUP BY language ORDER BY count DESC LIMIT 6`,
    )
    .all(userId)

  const trendRows = db
    .prepare(
      `SELECT analysis, created_at, repo_full_name FROM reports
       WHERE user_id = ? ORDER BY created_at DESC LIMIT 14`,
    )
    .all(userId)

  const scoreTrend = trendRows
    .reverse()
    .map((row) => {
      const analysis = parseAnalysis(row.analysis)
      const overall = analysis?.scores?.overall
      return Number.isFinite(overall)
        ? { overall, createdAt: row.created_at, repoFullName: row.repo_full_name }
        : null
    })
    .filter(Boolean)

  const averageScore = scoreTrend.length
    ? Math.round(scoreTrend.reduce((sum, entry) => sum + entry.overall, 0) / scoreTrend.length)
    : null

  const valuationRows = db
    .prepare('SELECT id, repo_full_name, analysis FROM reports WHERE user_id = ?')
    .all(userId)
  const valuation = summarizeValuations(valuationRows)

  const conversations = listConversations(userId)

  return {
    stats: {
      ...stats,
      chatMessages: countChatMessages(userId),
      conversations: conversations.length,
    },
    usage: getQuotaSummary(userId),
    recentReports: recentRows.map(serializeReportListItem),
    languages,
    scoreTrend,
    averageScore,
    valuation,
    conversations: conversations.slice(0, 4),
    systems: {
      ai: { configured: isAiConfigured(), model: config.groqModel },
      github: getGithubStatus(),
    },
  }
}
