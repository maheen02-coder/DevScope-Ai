import { buildChatRepositoryContext } from './github.js'
import { chatAboutRepository } from './ai.js'
import { consumeQuota, getQuotaSummary, releaseQuota } from './usage.js'
import { findLatestReportForRepo } from './reports.js'
import { appendChatMessages, getChatHistory } from './chat.js'
import { normalizePreferences } from './users.js'
import { chatTurnTotal } from '../lib/metrics.js'

export function chatStyleForUser(user) {
  try {
    return normalizePreferences(JSON.parse(user.preferences || '{}')).chatStyle
  } catch {
    return 'concise'
  }
}

export async function sendChatTurn({ userId, user, owner, repo, message }) {
  const usageId = consumeQuota(userId, 'chat', `${owner}/${repo}`)

  try {
    const context = await buildChatRepositoryContext(owner, repo)
    const repoFullName = context.repo.fullName
    const latestReport = findLatestReportForRepo(userId, repoFullName, { full: true })
    const history = getChatHistory(userId, repoFullName, 20)

    const result = await chatAboutRepository({
      context,
      latestAnalysis: latestReport?.analysis || null,
      history,
      message,
      chatStyle: chatStyleForUser(user),
    })

    const stored = appendChatMessages(userId, {
      owner: context.repo.owner.login,
      repo: context.repo.name,
      repoFullName,
      messages: [
        { role: 'user', content: message },
        { role: 'assistant', content: result.content },
      ],
    })

    chatTurnTotal.inc({ status: 'success' })

    return {
      messages: stored,
      repo: {
        fullName: context.repo.fullName,
        owner: context.repo.owner.login,
        name: context.repo.name,
        description: context.repo.description,
        language: context.repo.language,
        stars: context.repo.stars,
        htmlUrl: context.repo.htmlUrl,
        defaultBranch: context.repo.defaultBranch,
      },
      repoFullName,
      model: result.model,
      usage: result.usage,
      quota: getQuotaSummary(userId),
    }
  } catch (error) {
    chatTurnTotal.inc({ status: 'error' })
    releaseQuota(usageId)
    throw error
  }
}
