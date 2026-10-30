import { useQuery } from '@tanstack/react-query'
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import { Activity, BarChart3, Languages, PieChart, ScanSearch } from 'lucide-react'
import { api, errorMessage } from '../lib/api.js'
import { formatDate, formatNumber, languageColor, pluralize } from '../lib/format.js'
import { usePageTitle } from '../lib/hooks.js'
import { EmptyState, ErrorState, LoadingState, PageHeader, StatCard } from '../components/ui.jsx'

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
)

const ACCENT = '#78bdd2'
const MINT = '#79c2b2'
const GRID = 'rgba(148, 180, 196, 0.09)'
const MUTED = '#879caa'

const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  color: MUTED,
  plugins: {
    legend: { labels: { color: MUTED, boxWidth: 10, boxHeight: 10, usePointStyle: true } },
    tooltip: { backgroundColor: '#08111a', borderColor: '#1a3040', borderWidth: 1 },
  },
  scales: {
    x: { grid: { color: GRID }, ticks: { color: MUTED } },
    y: { grid: { color: GRID }, ticks: { color: MUTED } },
  },
}

function ChartCard({ title, icon: Icon, hint, children }) {
  return (
    <section className="card chart-card">
      <div className="card__header">
        <div className="card__title">
          <Icon size={16} aria-hidden="true" />
          {title}
        </div>
        {hint ? <span className="hint">{hint}</span> : null}
      </div>
      <div className="card__body">
        <div className="chart-frame">{children}</div>
      </div>
    </section>
  )
}

export default function AnalyticsPage() {
  usePageTitle('Analytics')
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard'),
  })

  if (isLoading) {
    return (
      <div className="page">
        <LoadingState label="Crunching your analytics…" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="page">
        <ErrorState
          title="Could not load analytics"
          message={errorMessage(error)}
          onRetry={() => refetch()}
        />
      </div>
    )
  }

  const trend = data.scoreTrend || []
  const languages = data.languages || []
  const usage = data.usage
  const stats = data.stats

  const trendData = {
    labels: trend.map((point) => formatDate(point.createdAt)),
    datasets: [
      {
        label: 'Overall score',
        data: trend.map((point) => point.overall),
        borderColor: ACCENT,
        backgroundColor: 'rgba(120,189,210,0.16)',
        pointBackgroundColor: '#04070a',
        pointBorderColor: ACCENT,
        pointRadius: 3,
        borderWidth: 2,
        tension: 0.32,
        fill: true,
      },
    ],
  }

  const languageData = {
    labels: languages.map((entry) => entry.language),
    datasets: [
      {
        data: languages.map((entry) => entry.count),
        backgroundColor: languages.map((entry) => languageColor(entry.language)),
        borderColor: '#04070a',
        borderWidth: 2,
      },
    ],
  }

  const quotaData = {
    labels: ['Analyses', 'Chat messages'],
    datasets: [
      {
        label: 'Used',
        data: [usage?.analysis?.used ?? 0, usage?.chat?.used ?? 0],
        backgroundColor: ACCENT,
        borderRadius: 6,
      },
      {
        label: 'Remaining',
        data: [usage?.analysis?.remaining ?? 0, usage?.chat?.remaining ?? 0],
        backgroundColor: 'rgba(121,194,178,0.45)',
        borderRadius: 6,
      },
    ],
  }

  const savedData = {
    labels: ['Saved', 'Not saved'],
    datasets: [
      {
        data: [stats.saved, Math.max(0, stats.total - stats.saved)],
        backgroundColor: [MINT, 'rgba(135,156,170,0.35)'],
        borderColor: '#04070a',
        borderWidth: 2,
      },
    ],
  }

  const doughnutOptions = {
    ...baseOptions,
    scales: {},
    cutout: '62%',
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow={
          <>
            Analytics<span className="accent">·</span> Your workspace
          </>
        }
        title="How your repositories are trending"
        description="Charts are built from your saved analyses and the server-side rolling quota. No third-party analytics service is involved."
      />

      <div className="stat-grid">
        <StatCard
          label="Reports generated"
          value={formatNumber(stats.total)}
          icon={ScanSearch}
          accent="accent"
          hint={`${stats.recentAnalyses} in the last 30 days`}
        />
        <StatCard
          label="Average score"
          value={data.averageScore === null ? '—' : data.averageScore}
          icon={Activity}
          accent="mint"
          hint={pluralize(trend.length, 'scored analysis', 'scored analyses')}
        />
        <StatCard
          label="Languages covered"
          value={formatNumber(languages.length)}
          icon={Languages}
          accent="violet"
          hint={languages[0]?.language ? `Most analyzed: ${languages[0].language}` : 'No data yet'}
        />
        <StatCard
          label="Chat messages"
          value={formatNumber(stats.chatMessages)}
          icon={BarChart3}
          accent="amber"
          hint={pluralize(stats.conversations, 'conversation')}
        />
      </div>

      <div className="chart-grid">
        <ChartCard
          title="Score trend"
          icon={Activity}
          hint={pluralize(trend.length, 'analysis', 'analyses')}
        >
          {trend.length ? (
            <Line
              data={trendData}
              options={{
                ...baseOptions,
                scales: { ...baseOptions.scales, y: { ...baseOptions.scales.y, min: 0, max: 100 } },
              }}
            />
          ) : (
            <EmptyState
              icon={ScanSearch}
              title="No scored analyses yet"
              description="Analyze a repository to start plotting your score history."
            />
          )}
        </ChartCard>

        <ChartCard title="Languages analyzed" icon={PieChart} hint={`Top ${languages.length}`}>
          {languages.length ? (
            <Doughnut data={languageData} options={doughnutOptions} />
          ) : (
            <p className="hint">Language distribution appears after your first analysis.</p>
          )}
        </ChartCard>

        <ChartCard
          title="Rolling 24h quota"
          icon={BarChart3}
          hint={`${usage?.windowHours ?? 24}h window`}
        >
          <Bar
            data={quotaData}
            options={{
              ...baseOptions,
              scales: {
                x: { stacked: true, grid: { color: GRID }, ticks: { color: MUTED } },
                y: {
                  stacked: true,
                  beginAtZero: true,
                  grid: { color: GRID },
                  ticks: { color: MUTED },
                },
              },
            }}
          />
        </ChartCard>

        <ChartCard title="Report library" icon={PieChart} hint={`${stats.total} total`}>
          {stats.total ? (
            <Doughnut data={savedData} options={doughnutOptions} />
          ) : (
            <p className="hint">Save analyses to build a library and see this breakdown.</p>
          )}
        </ChartCard>
      </div>
    </div>
  )
}
