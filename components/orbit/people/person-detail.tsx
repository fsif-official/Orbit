'use client'

import { useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useNav } from '@/lib/orbit/nav'
import { Avatar, StatusBadge, DifficultyBadge, SectionLabel } from '@/components/orbit/primitives'
import { CalendarView } from '@/components/orbit/output/calendar-view'
import { TaskDetailDrawer } from '@/components/orbit/output/task-detail-drawer'
import { formatDeadlineFull } from '@/lib/orbit/utils'
import { cn } from '@/lib/utils'
import { ArrowLeft, Plus, Target, Sparkles, Activity, X } from 'lucide-react'

type Tab = 'overview' | 'calendar'

export function PersonDetail({ id }: { id: string }) {
  const { getMember, tasks, currentUser, updateWill, updateJudgment, getProject } = useOrbit()
  const { go } = useNav()
  const [tab, setTab] = useState<Tab>('overview')
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const member = getMember(id)

  if (!member) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-muted-foreground">メンバーが見つかりません。</p>
      </div>
    )
  }

  const mine = tasks.filter((t) => t.assigneeId === member.id)
  const active = mine.filter((t) => t.status !== 'done').length
  const history = mine
    .slice()
    .sort((a, b) => (b.completedDate ?? '').localeCompare(a.completedDate ?? ''))

  const isSelf = currentUser?.id === member.id
  const isAdmin = currentUser?.role === 'admin'

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <button
        onClick={() => go({ name: 'output' })}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        ワークスペースへ戻る
      </button>

      {/* Header */}
      <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
        <Avatar member={member} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">{member.name}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {member.role === 'admin' ? '管理者' : member.affiliation}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums">{active}</p>
          <p className="text-xs text-muted-foreground">進行中のタスク</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-5 flex items-center gap-1 border-b border-border">
        {(
          [
            ['overview', 'Overview'],
            ['calendar', 'Calendar'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'calendar' && (
        <div className="mt-5">
          <CalendarView tasks={mine} onOpenTask={setOpenTaskId} />
        </div>
      )}

      {tab === 'overview' && (
        <>
      {/* Talent sections */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <TalentCard
          icon={<Target className="size-4 text-primary" />}
          title="Will"
          subtitle="本人がやりたいこと"
        >
          <EditableTags
            tags={member.will}
            editable={isSelf}
            onChange={(next) => updateWill(member.id, next)}
            emptyText="まだ登録されていません"
            placeholder="やりたいことを追加"
          />
        </TalentCard>

        <TalentCard
          icon={<Sparkles className="size-4 text-primary" />}
          title="Judgment"
          subtitle="管理者による認識"
        >
          <EditableTags
            tags={member.judgment}
            editable={isAdmin}
            onChange={(next) => updateJudgment(member.id, next)}
            emptyText="まだ登録されていません"
            placeholder="評価を追加"
            variant="judgment"
          />
        </TalentCard>

        <TalentCard
          icon={<Activity className="size-4 text-primary" />}
          title="Fact"
          subtitle="活動実績"
        >
          {member.facts.length ? (
            <ul className="flex flex-col gap-2">
              {member.facts.map((f) => (
                <li key={f.label} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{f.label}</span>
                  <span className="text-muted-foreground">{f.count}件</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">まだ実績がありません</p>
          )}
        </TalentCard>
      </div>

      {/* Task history */}
      <div className="mt-6">
        <SectionLabel>タスク履歴</SectionLabel>
        <div className="mt-2 overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50 text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">タスク</th>
                <th className="px-4 py-2.5 font-medium">プロジェクト</th>
                <th className="px-4 py-2.5 font-medium">難易度</th>
                <th className="px-4 py-2.5 font-medium">ステータス</th>
                <th className="px-4 py-2.5 font-medium">完了日</th>
              </tr>
            </thead>
            <tbody>
              {history.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => setOpenTaskId(t.id)}
                  className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-secondary/50"
                >
                  <td className="px-4 py-3 font-medium text-foreground">{t.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{getProject(t.projectId)?.name}</td>
                  <td className="px-4 py-3">
                    <DifficultyBadge difficulty={t.difficulty} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">
                    {t.status === 'done' ? formatDeadlineFull(t.completedDate ?? null) : '—'}
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    担当タスクがありません。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}

      <TaskDetailDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
    </div>
  )
}

function TalentCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary-muted">
          {icon}
        </span>
        <div>
          <p className="text-sm font-semibold leading-none">{title}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

function EditableTags({
  tags,
  editable,
  onChange,
  emptyText,
  placeholder,
  variant = 'will',
}: {
  tags: string[]
  editable: boolean
  onChange: (next: string[]) => void
  emptyText: string
  placeholder: string
  variant?: 'will' | 'judgment'
}) {
  const [adding, setAdding] = useState(false)
  const [value, setValue] = useState('')

  const commit = () => {
    const v = value.trim()
    if (v && !tags.includes(v)) onChange([...tags, v])
    setValue('')
    setAdding(false)
  }

  const chipCls =
    variant === 'judgment'
      ? 'bg-violet-50 text-violet-700 border-violet-200'
      : 'bg-primary-muted text-accent-foreground border-transparent'

  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.length === 0 && !adding && (
        <span className="text-sm text-muted-foreground">{emptyText}</span>
      )}
      {tags.map((t) => (
        <span
          key={t}
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium ${chipCls}`}
        >
          {t}
          {editable && (
            <button
              onClick={() => onChange(tags.filter((x) => x !== t))}
              className="opacity-60 hover:opacity-100"
              aria-label={`${t} を削除`}
            >
              <X className="size-3" />
            </button>
          )}
        </span>
      ))}
      {editable &&
        (adding ? (
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') {
                setValue('')
                setAdding(false)
              }
            }}
            placeholder={placeholder}
            className="h-6 w-32 rounded-md border border-primary bg-card px-1.5 text-xs outline-none"
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-0.5 rounded-md border border-dashed border-border-strong px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-secondary"
          >
            <Plus className="size-3" />
            追加
          </button>
        ))}
    </div>
  )
}
