const VALUATION_DISCLAIMER =
  'AI estimate from model knowledge of typical software markets, not an appraisal or verified market data. There is no guarantee of sale at any price; actual prices depend on buyers, negotiation, IP ownership, and independent code review.'

function money(value, currency = 'USD') {
  if (!Number.isFinite(Number(value))) return '—'
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: /^[A-Z]{3}$/.test(currency) ? currency : 'USD',
      maximumFractionDigits: 0,
    }).format(Number(value))
  } catch {
    return `${Number(value)} ${currency}`
  }
}

function listSection(title, items, formatItem) {
  if (!items?.length) return ''
  return [`## ${title}`, '', ...items.map((item) => `- ${formatItem(item)}`), ''].join('\n')
}

function inlineFiles(files) {
  return Array.isArray(files) && files.length
    ? ` (files: ${files.map((path) => `\`${path}\``).join(', ')})`
    : ''
}

function inlineTokens(values) {
  return Array.isArray(values) && values.length
    ? ` (${values.map((value) => `\`${value}\``).join(', ')})`
    : ''
}

export function buildReportMarkdown(report) {
  const analysis = report?.analysis || {}
  const scores = analysis.scores || {}
  const meta = analysis.meta || {}
  const valuation = analysis.valuation
  const currency = valuation?.currency || 'USD'
  const lines = []

  lines.push(`# ${report?.repoFullName || 'Repository'} — DevScope AI report`, '')
  lines.push(`- **Generated:** ${report?.createdAt || '—'}`)
  lines.push(`- **Depth:** ${report?.depth || 'standard'}`)
  lines.push(`- **Files analyzed:** ${report?.filesAnalyzed ?? 0}`)
  if (report?.model) lines.push(`- **Model:** ${report.model}`)
  lines.push(`- **Overall score:** ${scores.overall ?? '—'}/100`, '')

  lines.push('| Metric | Score |', '| --- | ---: |')
  for (const [key, label] of [
    ['codeQuality', 'Code quality'],
    ['architecture', 'Architecture'],
    ['maintainability', 'Maintainability'],
    ['documentation', 'Documentation'],
    ['security', 'Security'],
    ['testing', 'Testing'],
  ]) {
    lines.push(`| ${label} | ${scores[key] ?? '—'} |`)
  }
  lines.push('')

  if (analysis.summary) lines.push('## Summary', '', analysis.summary, '')
  if (analysis.architecture) lines.push('## Architecture', '', analysis.architecture, '')

  if (analysis.layers?.length) {
    lines.push('## Architecture map', '')
    analysis.layers.forEach((layer, index) => {
      lines.push(
        `${index + 1}. **${layer.name}** — ${layer.responsibility}${inlineTokens(layer.components)}`,
      )
    })
    lines.push('')
  }

  const onboarding = analysis.onboarding
  if (onboarding) {
    const prerequisites = onboarding.prerequisites || []
    const steps = onboarding.steps || []
    const keyFiles = onboarding.keyFiles || []
    if (prerequisites.length || steps.length || keyFiles.length) {
      lines.push('## Onboarding guide', '')
      if (prerequisites.length) {
        lines.push(`**Prerequisites:** ${prerequisites.join('; ')}`, '')
      }
      if (steps.length) {
        steps.forEach((step, index) => {
          lines.push(`${index + 1}. **${step.title}** — ${step.detail}${inlineFiles(step.files)}`)
        })
        lines.push('')
      }
      if (keyFiles.length) {
        lines.push(
          `**Key files to read first:** ${keyFiles.map((path) => `\`${path}\``).join(', ')}`,
          '',
        )
      }
    }
  }

  if (valuation) {
    lines.push('## Valuation (AI estimate)', '')
    lines.push(`- **Potential one-time sale price:** ${money(valuation.sellingPrice, currency)}`)
    lines.push(`- **Freelance build price:** ${money(valuation.buildPrice, currency)}`)
    lines.push(
      `- **Estimated range:** ${money(valuation.range?.low, currency)} – ${money(valuation.range?.high, currency)} (typical ${money(valuation.range?.typical, currency)})`,
    )
    lines.push(`- **Suggested asking price:** ${money(valuation.suggestedAsk, currency)}`)
    lines.push(`- **Confidence:** ${valuation.confidence || 'low'}`, '')
    if (valuation.suggestedAskReasoning) {
      lines.push(`**Why this asking price:** ${valuation.suggestedAskReasoning}`, '')
    }
    if (valuation.buildScope) lines.push(`**Rebuild scope:** ${valuation.buildScope}`, '')
    if (valuation.factors?.length) {
      lines.push(
        listSection(
          'Price factors',
          valuation.factors,
          (item) => `**${item.factor}** (${item.impact}) — ${item.detail}`,
        ),
      )
    }
    if (valuation.missingFeatures?.length) {
      lines.push(
        listSection(
          'Missing features',
          valuation.missingFeatures,
          (item) =>
            `**${item.title}** (${money(item.estimatedValue, currency)} to add) — ${item.detail}`,
        ),
      )
    }
    if (valuation.improvements?.length) {
      lines.push(
        listSection(
          'Improvements',
          valuation.improvements,
          (item) => `**${item.title}** (${item.priceImpact} impact) — ${item.detail}`,
        ),
      )
    }
    if (valuation.assumptions?.length) {
      lines.push(listSection('Assumptions', valuation.assumptions, (item) => item))
    }
    lines.push(`> ${meta.valuation?.disclaimer || VALUATION_DISCLAIMER}`, '')
  }

  if (meta.health) {
    const health = meta.health
    lines.push('## Repository health', '')
    if (health.license) lines.push(`- **License:** ${health.license}`)
    else lines.push('- **License:** not declared')
    if (health.lastPushAt) {
      lines.push(
        `- **Last push:** ${health.lastPushAt}${Number.isFinite(Number(health.daysSincePush)) ? ` (${health.daysSincePush} days ago)` : ''}`,
      )
    }
    lines.push(`- **Maintenance activity:** ${health.activity || 'unknown'}`)
    lines.push(`- **Archived:** ${health.archived ? 'yes' : 'no'}`)
    lines.push(
      `- **Community:** ${health.stars ?? 0} stars, ${health.forks ?? 0} forks, ${health.openIssues ?? 0} open issues`,
      '',
    )
  }

  if (meta.dependencies) {
    const deps = meta.dependencies
    lines.push('## Dependency & license audit', '')
    lines.push(
      `- **Declared dependencies:** ${deps.total ?? 0} (${deps.runtime ?? 0} runtime, ${deps.development ?? 0} development)`,
    )
    lines.push(`- **Manifest license:** ${deps.declaredLicense || 'none declared'}`)
    lines.push(
      `- **Ecosystems:** ${deps.ecosystems?.length ? deps.ecosystems.join(', ') : 'none detected'}`,
      '',
    )
    for (const manifest of deps.manifests || []) {
      lines.push(
        `- **${manifest.path}** (${manifest.ecosystem || 'unknown'}) — ${manifest.runtime} runtime, ${manifest.development} development, license: ${manifest.declaredLicense || 'not declared'}`,
      )
    }
    if (deps.manifests?.length) lines.push('')
    for (const issue of deps.issues || []) {
      lines.push(`- **${issue.label}:** ${issue.detail}`)
    }
    if (deps.issues?.length) lines.push('')
  }

  lines.push(
    listSection(
      'Strengths',
      analysis.strengths,
      (item) => `**${item.title}** — ${item.detail}${inlineFiles(item.files)}`,
    ),
    listSection(
      'Weaknesses',
      analysis.weaknesses,
      (item) => `**${item.title}** — ${item.detail}${inlineFiles(item.files)}`,
    ),
    listSection(
      'Security concerns',
      analysis.securityConcerns,
      (item) => `**${item.title}** (${item.severity}) — ${item.detail}${inlineFiles(item.files)}`,
    ),
    listSection(
      'Recommendations',
      analysis.recommendations,
      (item) =>
        `**${item.title}** (${item.priority} priority) — ${item.detail}${inlineFiles(item.files)}`,
    ),
    listSection('Tech stack', analysis.techStack, (item) => `**${item.name}** — ${item.purpose}`),
  )

  lines.push('---', '', `Exported from DevScope AI on ${new Date().toISOString()}.`, '')
  return lines.join('\n')
}

export function downloadReportMarkdown(report) {
  const markdown = buildReportMarkdown(report)
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  const slug = String(report?.repoFullName || 'devscope-report').replace(/[^A-Za-z0-9._-]+/g, '-')
  anchor.href = url
  anchor.download = `${slug}-devscope-report.md`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
