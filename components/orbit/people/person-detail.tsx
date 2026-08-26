'use client'

import { useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useNav } from '@/lib/orbit/nav'
import { Avatar, StatusBadge, DifficultyBadge, SectionLabel } from '@/components/orbit/primitives'
import { CalendarView } from '@/components/orbit/output/calendar-view'
import { TaskDetailDrawer } from '@/components/orbit/output/task-detail-drawer'
import { Modal } from '@/components/orbit/modal'
import { Button } from '@/components/ui/button'
import { formatDeadlineFull } from '@/lib/orbit/utils'
import { isAdminRole } from '@/lib/orbit/types'
import { AVATAR_PALETTE } from '@/lib/orbit/remote'
import { cn } from '@/lib/utils'
import { ArrowLeft, Plus, Target, Sparkles, Activity, X, Pencil, Check, CalendarOff } from 'lucide-react'

type Tab = 'overview' | 'growth' | 'calendar'

const ROLE_LABEL: Record<string, string> = { 代表: '代表', 班長: '班長' }

export function PersonDetail({ id }: { id: string }) {
  const {
    getMember,
    visibleTasks: tasks,
    members,
    currentUser,
    updateWill,
    updateJudgment,
    getProject,
    updateDisplayName,
    toggleUnavailableDate,
    updateAvatar,
  } = useOrbit()
  const { go } = useNav()
  const [tab, setTab] = useState<Tab>('overview')
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [initialsDraft, setInitialsDraft] = useState('')
  const member = getMember(id)

  if (!member) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-muted-foreground">メンバーが見つかりません。</p>
      </div>
    )
  }

  const mine = tasks.filter((t) => t.assigneeIds.includes(member.id))
  const active = mine.filter((t) => t.status !== 'done').length
  const completed = mine.filter((t) => t.status === 'done')
  const history = mine
    .slice()
    .sort((a, b) => (b.completedDate ?? '').localeCompare(a.completedDate ?? ''))
  const categoryTally = new Map<string, number>()
  completed.forEach((t) => {
    if (!t.category) return
    categoryTally.set(t.category, (categoryTally.get(t.category) ?? 0) + 1)
  })
  const topCategories = Array.from(categoryTally.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3)

  // 人材育成: skills required by open work that the member doesn't have
  // yet, what that skill would unlock, and who already has it
  const openTasks = tasks.filter((t) => t.status !== 'done')
  const skillDemand = new Map<string, typeof tasks>()
  openTasks.forEach((t) => {
    t.skills.forEach((s) => {
      if (!skillDemand.has(s)) skillDemand.set(s, [])
      skillDemand.get(s)!.push(t)
    })
  })
  const missingSkills = Array.from(skillDemand.entries())
    .filter(([s]) => !member.skills.includes(s))
    .sort((a, b) => b[1].length - a[1].length)
  const mentorsFor = (skill: string) =>
    members.filter((m) => m.id !== member.id && m.skills.includes(skill))

  const isSelf = currentUser?.id === member.id
  const isAdmin = !!currentUser && isAdminRole(currentUser.role)
  const displayName = member.displayName || member.name

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
        <div className="relative shrink-0">
          <Avatar member={member} size={56} />
          {isSelf && (
            <button
              onClick={() => {
                setInitialsDraft(member.initials)
                setAvatarOpen(true)
              }}
              className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:text-foreground"
              aria-label="アイコンを変更"
            >
              <Pencil className="size-2.5" />
            </button>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {editingName ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing || e.keyCode === 229) return
                  if (e.key === 'Enter') {
                    updateDisplayName(member.id, nameDraft.trim())
                    setEditingName(false)
                  }
                  if (e.key === 'Escape') setEditingName(false)
                }}
                placeholder={member.name}
                className="h-8 w-48 rounded-md border border-primary bg-card px-2 text-lg font-semibold outline-none"
              />
              <button
                onClick={() => {
                  updateDisplayName(member.id, nameDraft.trim())
                  setEditingName(false)
                }}
                className="rounded-md p-1 text-primary hover:bg-secondary"
                aria-label="保存"
              >
                <Check className="size-4" />
              </button>
            </div>
          ) : (
            <h1 className="flex items-center gap-1.5 text-xl font-semibold tracking-tight">
              {displayName}
              {member.displayName && (
                <span className="text-xs font-normal text-muted-foreground">({member.name})</span>
              )}
              {isSelf && (
                <button
                  onClick={() => {
                    setNameDraft(member.displayName ?? member.name)
                    setEditingName(true)
                  }}
                  className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  aria-label="表示名を編集"
                >
                  <Pencil className="size-3.5" />
                </button>
              )}
            </h1>
          )}
          <p className="mt-0.5 text-sm text-muted-foreground">
            {ROLE_LABEL[member.role] ?? member.affiliation}
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
            ...(isSelf ? [['growth', '人材育成']] : []),
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

      {tab === 'growth' && (
        <div className="mt-5 flex flex-col gap-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <SectionLabel>足りないスキル</SectionLabel>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              今、進行中・未着手のタスクが求めているスキルのうち、あなたがまだ持っていないものです。
              身につけると担当できるタスクが増えます。
            </p>
            {missingSkills.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                今のところ、不足しているスキルはありません。
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {missingSkills.slice(0, 6).map(([skill, unlocked]) => {
                  const mentors = mentorsFor(skill)
                  return (
                    <li key={skill} className="rounded-lg border border-border/60 bg-secondary/30 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-md bg-primary-muted px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                          {skill}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {unlocked.length}件のタスクで求められています
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        身につけるとできるようになるタスク：
                        {unlocked
                          .slice(0, 3)
                          .map((t) => t.name)
                          .join('、')}
                        {unlocked.length > 3 && ` 他${unlocked.length - 3}件`}
                      </p>
                      {mentors.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">
                            すでにできる人：
                          </span>
                          {mentors.slice(0, 5).map((m) => (
                            <button
                              key={m.id}
                              onClick={() => go({ name: 'person', id: m.id })}
                              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5 text-xs hover:bg-secondary"
                            >
                              <Avatar member={m} size={16} />
                              {m.displayName || m.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === 'calendar' && (
        <div className="mt-5 flex flex-col gap-4">
          {isSelf && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <CalendarOff className="size-4 text-muted-foreground" />
                <SectionLabel>稼働できない日</SectionLabel>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                指定した日はアサイン検討時の参考として表示されます。
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {(member.unavailableDates ?? [])
                  .slice()
                  .sort()
                  .map((d) => (
                    <span
                      key={d}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/60 px-1.5 py-0.5 text-xs font-medium"
                    >
                      {d}
                      <button
                        onClick={() => toggleUnavailableDate(member.id, d)}
                        className="opacity-60 hover:opacity-100"
                        aria-label={`${d} を削除`}
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                <input
                  type="date"
                  onChange={(e) => {
                    if (e.target.value) toggleUnavailableDate(member.id, e.target.value)
                    e.target.value = ''
                  }}
                  className="h-7 rounded-md border border-dashed border-border-strong bg-card px-2 text-xs outline-none focus:border-primary"
                />
              </div>
            </div>
          )}
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

      {/* Achievements */}
      <div className="mt-6">
        <SectionLabel>実績</SectionLabel>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-2xl font-semibold tabular-nums">{completed.length}</p>
            <p className="text-xs text-muted-foreground">完了タスク数</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-2xl font-semibold tabular-nums">{member.judgment.length}</p>
            <p className="text-xs text-muted-foreground">認定スキル数</p>
          </div>
          <div className="col-span-2 rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">得意カテゴリ</p>
            {topCategories.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {topCategories.map(([cat, count]) => (
                  <span
                    key={cat}
                    className="inline-flex items-center gap-1 rounded-md bg-primary-muted px-1.5 py-0.5 text-xs font-medium text-accent-foreground"
                  >
                    {cat}
                    <span className="text-[10px] opacity-70">{count}件</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">まだ実績がありません</p>
            )}
          </div>
        </div>
      </div>

      {/* Task history */}
      <div className="mt-4">
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

      <Modal open={avatarOpen} onClose={() => setAvatarOpen(false)}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">アイコンを変更</h2>
          <button onClick={() => setAvatarOpen(false)} aria-label="閉じる">
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>
        <div className="flex items-center gap-3">
          <Avatar
            member={{ ...member, initials: (initialsDraft || member.initials).toUpperCase() }}
            size={48}
          />
          <input
            value={initialsDraft}
            onChange={(e) => setInitialsDraft(e.target.value.slice(0, 2))}
            maxLength={2}
            placeholder={member.initials}
            className="h-9 w-20 rounded-md border border-border bg-card px-2 text-center text-sm uppercase outline-none focus:border-primary"
            aria-label="イニシャル（2文字まで）"
          />
        </div>
        <p className="mb-1.5 mt-4 text-xs font-medium text-muted-foreground">カラー</p>
        <div className="flex flex-wrap gap-2">
          {AVATAR_PALETTE.map((color) => (
            <button
              key={color}
              onClick={() => {
                updateAvatar(member.id, color, initialsDraft || member.initials)
                setAvatarOpen(false)
              }}
              className={cn(
                'size-8 rounded-full ring-2 ring-offset-2 ring-offset-card transition-transform hover:scale-110',
                member.avatarColor === color ? 'ring-primary' : 'ring-transparent',
              )}
              style={{ backgroundColor: color }}
              aria-label={`色を選択 ${color}`}
            />
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" className="h-9" onClick={() => setAvatarOpen(false)}>
            キャンセル
          </Button>
          <Button
            className="h-9"
            onClick={() => {
              updateAvatar(member.id, member.avatarColor, initialsDraft || member.initials)
              setAvatarOpen(false)
            }}
          >
            保存
          </Button>
        </div>
      </Modal>
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
