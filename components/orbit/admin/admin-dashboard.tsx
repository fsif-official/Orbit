'use client'

import { useOrbit } from '@/lib/orbit/store'
import { useNav } from '@/lib/orbit/nav'
import { Avatar, ProjectTag } from '@/components/orbit/primitives'
import { isOverdue, daysSince, formatDeadline } from '@/lib/orbit/utils'
import { STATUS_LABEL } from '@/lib/orbit/types'
import { CircleAlert, Clock, UserX, Activity } from 'lucide-react'

export function AdminDashboard() {
  const { tasks, getProject, setMode } = useOrbit()
  const { go } = useNav()

  const openInOutput = () => {
    setMode('output')
    go({ name: 'output' })
  }

  const inProgress = tasks.filter((t) => t.status === 'progress')
  const waiting = tasks.filter((t) => t.status === 'review')
  const overdue = tasks.filter((t) => isOverdue(t))
  const unassigned = tasks.filter((t) => !t.assigneeId && t.status !== 'done')
  const stale = tasks.filter((t) => {
    const d = daysSince(t.lastActivity)
    return t.status !== 'done' && d !== null && d >= 5
  })

  const metrics = [
    { label: '全タスク', value: tasks.length, tone: 'neutral' as const },
    { label: '進行中', value: inProgress.length, tone: 'neutral' as const },
    { label: '確認待ち', value: waiting.length, tone: 'warn' as const },
    { label: '期限超過', value: overdue.length, tone: 'danger' as const },
    { label: '未アサイン', value: unassigned.length, tone: 'accent' as const },
  ]

  const toneClass: Record<string, string> = {
    neutral: 'text-foreground',
    warn: 'text-[var(--status-review-fg)]',
    danger: 'text-destructive',
    accent: 'text-primary',
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">組織全体のタスク状況と、対応が必要な項目です。</p>

      {/* Metric cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">{m.label}</div>
            <div className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${toneClass[m.tone]}`}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      {/* Attention required */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold">対応が必要</h2>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <AttentionGroup
            title="確認待ち"
            icon={<Clock className="size-4 text-[var(--status-review-fg)]" />}
            tasks={waiting}
            renderMeta={(t) => {
              const d = daysSince(t.lastActivity)
              return d && d > 0 ? `${d}日前から確認待ち` : '確認待ち'
            }}
            onOpen={openInOutput}
            getProject={getProject}
          />
          <AttentionGroup
            title="期限超過"
            icon={<CircleAlert className="size-4 text-destructive" />}
            tasks={overdue}
            renderMeta={(t) => `期限：${formatDeadline(t.deadline)}`}
            onOpen={openInOutput}
            getProject={getProject}
          />
          <AttentionGroup
            title="未アサイン"
            icon={<UserX className="size-4 text-primary" />}
            tasks={unassigned}
            renderMeta={(t) => getProject(t.projectId)?.name ?? ''}
            onOpen={() => go({ name: 'admin', section: 'assignments' })}
            getProject={getProject}
          />
          <AttentionGroup
            title="長期間進捗なし"
            icon={<Activity className="size-4 text-muted-foreground" />}
            tasks={stale}
            renderMeta={(t) => `${daysSince(t.lastActivity)}日間更新なし`}
            onOpen={openInOutput}
            getProject={getProject}
          />
        </div>
      </div>
    </div>
  )
}

function AttentionGroup({
  title,
  icon,
  tasks,
  renderMeta,
  onOpen,
  getProject,
}: {
  title: string
  icon: React.ReactNode
  tasks: import('@/lib/orbit/types').Task[]
  renderMeta: (t: import('@/lib/orbit/types').Task) => string
  onOpen: (id: string) => void
  getProject: (id: string) => import('@/lib/orbit/types').Project | undefined
}) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        {icon}
        <span className="text-sm font-medium">{title}</span>
        <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">{tasks.length}</span>
      </div>
      {tasks.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground">該当なし</div>
      ) : (
        <ul className="divide-y divide-border">
          {tasks.slice(0, 4).map((t) => (
            <li key={t.id}>
              <button
                onClick={() => onOpen(t.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{t.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{renderMeta(t)}</div>
                </div>
                <ProjectTag name={getProject(t.projectId)?.name ?? ''} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
