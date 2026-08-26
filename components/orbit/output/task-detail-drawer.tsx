'use client'

import { useState } from 'react'
import { Drawer, Modal } from '../modal'
import { Button } from '@/components/ui/button'
import { useOrbit } from '@/lib/orbit/store'
import { useToast } from '../toast'
import {
  Avatar,
  DifficultyBadge,
  StatusDot,
  Tag,
} from '../primitives'
import {
  STATUS_LABEL,
  STATUS_ORDER,
  isAdminRole,
  type Member,
  type Task,
  type TaskHistoryEntry,
  type TaskStatus,
} from '@/lib/orbit/types'
import { formatDeadlineFull, formatDateTime, googleCalendarUrl, isOverdue } from '@/lib/orbit/utils'
import { cn } from '@/lib/utils'
import {
  Ban,
  CalendarPlus,
  Check,
  ChevronDown,
  FileText,
  GitBranch,
  History as HistoryIcon,
  Link2,
  Pencil,
  Plus,
  Search,
  TriangleAlert,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react'

const HISTORY_FIELD_LABEL: Record<TaskHistoryEntry['field'], string> = {
  assignee: '担当者',
  deadline: '期限',
  startDate: '開始日',
  priority: '優先度',
  status: 'ステータス',
  reviewer: '確認者',
}

function historyValueLabel(
  field: TaskHistoryEntry['field'],
  raw: string,
  members: Member[],
): string {
  if (!raw) return '未設定'
  if (field === 'assignee') {
    return raw
      .split(',')
      .filter(Boolean)
      .map((id) => {
        const m = members.find((mm) => mm.id === id)
        return m ? m.displayName || m.name : id
      })
      .join('、')
  }
  if (field === 'reviewer') {
    const m = members.find((mm) => mm.id === raw)
    return m ? m.displayName || m.name : raw
  }
  return raw
}

export function TaskDetailDrawer({
  taskId,
  onClose,
}: {
  taskId: string | null
  onClose: () => void
}) {
  const {
    tasks,
    currentUser,
    getMember,
    getProject,
    getInput,
    updateTaskStatus,
    updateProgress,
    assignTask,
    updateSchedule,
    updateDependsOn,
    updateReviewer,
    setBlocker,
    addDeliverable,
    removeDeliverable,
    addComment,
    removeComment,
    members,
  } = useOrbit()
  const toast = useToast()
  const [confirmTake, setConfirmTake] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [inputOpen, setInputOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [dependsOpen, setDependsOpen] = useState(false)
  const [dependsQuery, setDependsQuery] = useState('')
  const [reviewerOpen, setReviewerOpen] = useState(false)
  const [blockerOpen, setBlockerOpen] = useState(false)

  const task = tasks.find((t) => t.id === taskId) ?? null
  const open = !!taskId
  const sourceInput = getInput(task?.originalInputId)
  const assignees = (task?.assigneeIds ?? [])
    .map((id) => getMember(id))
    .filter(Boolean) as Member[]
  const dependsOnTasks = (task?.dependsOnIds ?? [])
    .map((id) => tasks.find((t) => t.id === id))
    .filter(Boolean) as Task[]
  const isAdmin = !!currentUser && isAdminRole(currentUser.role)
  const reviewer = getMember(task?.reviewerId ?? null) ?? null

  return (
    <>
      <Drawer open={open} onClose={onClose} labelledBy="task-drawer-title">
        {task && (
          <DrawerBody
            task={task}
            currentUserId={currentUser?.id ?? null}
            isAdmin={isAdmin}
            assignees={assignees}
            dependsOnTasks={dependsOnTasks}
            creator={getMember(task.createdById ?? null) ?? null}
            reviewer={reviewer}
            members={members}
            projectName={getProject(task.projectId)?.name ?? ''}
            hasSourceInput={!!sourceInput}
            onClose={onClose}
            onStatus={(s) => updateTaskStatus(task.id, s)}
            onTake={() => setConfirmTake(true)}
            onOpenAssign={() => setAssignOpen(true)}
            onOpenInput={() => setInputOpen(true)}
            onOpenSchedule={() => setScheduleOpen(true)}
            onOpenDepends={() => setDependsOpen(true)}
            onOpenReviewer={() => setReviewerOpen(true)}
            onOpenBlocker={() => setBlockerOpen(true)}
            onClearBlocker={() => {
              setBlocker(task.id, null)
              toast('ブロックを解除しました')
            }}
            onAddDeliverable={(label, url) => addDeliverable(task.id, label, url)}
            onRemoveDeliverable={(id) => removeDeliverable(task.id, id)}
            onAddComment={(text) => addComment(task.id, text)}
            onRemoveComment={(commentId) => removeComment(task.id, commentId)}
            onProgress={(text) => {
              updateProgress(task.id, text)
              toast('進捗を更新しました')
            }}
          />
        )}
      </Drawer>

      {/* Original input text */}
      <Modal open={inputOpen} onClose={() => setInputOpen(false)} labelledBy="source-input-title">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="source-input-title" className="text-base font-semibold">
            元の入力内容
          </h2>
          <button onClick={() => setInputOpen(false)} aria-label="閉じる">
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>
        {sourceInput ? (
          <>
            <p className="whitespace-pre-wrap rounded-lg border border-border bg-secondary/50 p-3 text-sm leading-relaxed">
              {sourceInput.text}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {formatDateTime(sourceInput.createdAt)} ・ この入力から{sourceInput.generatedTaskIds.length}件のタスクが生成されました
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">元の入力は見つかりませんでした。</p>
        )}
      </Modal>

      {/* Take task confirm */}
      <Modal open={confirmTake} onClose={() => setConfirmTake(false)}>
        <h2 className="text-base font-semibold">このタスクを担当しますか？</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          「{task?.name}」の担当者としてあなたが追加されます。
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" className="h-9" onClick={() => setConfirmTake(false)}>
            キャンセル
          </Button>
          <Button
            className="h-9"
            onClick={() => {
              if (task && currentUser && !task.assigneeIds.includes(currentUser.id)) {
                assignTask(task.id, [...task.assigneeIds, currentUser.id])
                toast('このタスクの担当になりました')
              }
              setConfirmTake(false)
            }}
          >
            担当する
          </Button>
        </div>
      </Modal>

      {/* Admin assign (multi-select) */}
      <Modal open={assignOpen} onClose={() => setAssignOpen(false)}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">担当者を変更</h2>
          <button onClick={() => setAssignOpen(false)} aria-label="閉じる">
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">複数人選べます。</p>
        <div className="flex max-h-80 flex-col gap-1 overflow-auto orbit-scroll">
          <button
            onClick={() => {
              if (task) assignTask(task.id, [])
              toast('担当者を未アサインにしました')
            }}
            className="flex items-center gap-2.5 rounded-lg border border-dashed border-border-strong px-3 py-2 text-sm text-muted-foreground hover:bg-secondary"
          >
            <Avatar member={null} size={28} />
            全員はずす
          </button>
          {members.map((m) => {
            const checked = !!task?.assigneeIds.includes(m.id)
            return (
              <button
                key={m.id}
                onClick={() => {
                  if (!task) return
                  const next = checked
                    ? task.assigneeIds.filter((id) => id !== m.id)
                    : [...task.assigneeIds, m.id]
                  assignTask(task.id, next)
                }}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary',
                  checked && 'bg-primary-muted',
                )}
              >
                <Avatar member={m} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{m.displayName || m.name}</div>
                  <div className="text-xs text-muted-foreground">{m.affiliation}</div>
                </div>
                {checked && <Check className="size-4 shrink-0 text-primary" strokeWidth={3} />}
              </button>
            )
          })}
        </div>
      </Modal>

      {/* Schedule (start date / deadline) edit */}
      <ScheduleModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        task={task}
        onSave={(startDate, deadline) => {
          if (!task) return
          updateSchedule(task.id, startDate, deadline)
          toast('日程を変更しました。管理者に通知されます。')
          setScheduleOpen(false)
        }}
      />

      {/* Dependency (prerequisite tasks) edit */}
      <Modal
        open={dependsOpen}
        onClose={() => {
          setDependsOpen(false)
          setDependsQuery('')
        }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">前提タスクを設定</h2>
          <button
            onClick={() => {
              setDependsOpen(false)
              setDependsQuery('')
            }}
            aria-label="閉じる"
          >
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">
          このタスクを開始する前に完了しておく必要があるタスクを選びます。
        </p>
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={dependsQuery}
            onChange={(e) => setDependsQuery(e.target.value)}
            placeholder="タスク名で検索"
            autoFocus
            className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2.5 text-sm outline-none focus:border-primary"
          />
        </div>
        <div className="flex max-h-80 flex-col gap-1 overflow-auto orbit-scroll">
          {(() => {
            const filtered = tasks
              .filter((t) => t.id !== task?.id)
              .filter((t) => t.name.toLowerCase().includes(dependsQuery.trim().toLowerCase()))
            if (filtered.length === 0) {
              return <p className="px-3 py-2 text-sm text-muted-foreground">該当するタスクがありません。</p>
            }
            return filtered.map((t) => {
              const checked = !!task?.dependsOnIds?.includes(t.id)
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    if (!task) return
                    const cur = task.dependsOnIds ?? []
                    const next = checked ? cur.filter((id) => id !== t.id) : [...cur, t.id]
                    updateDependsOn(task.id, next)
                  }}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary',
                    checked && 'bg-primary-muted',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{STATUS_LABEL[t.status]}</div>
                  </div>
                  {checked && <Check className="size-4 shrink-0 text-primary" strokeWidth={3} />}
                </button>
              )
            })
          })()}
        </div>
      </Modal>

      {/* Reviewer (確認者) select */}
      <Modal open={reviewerOpen} onClose={() => setReviewerOpen(false)}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">確認者を設定</h2>
          <button onClick={() => setReviewerOpen(false)} aria-label="閉じる">
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">
          担当者とは別に、完了確認を行う人を指定できます。
        </p>
        <div className="flex max-h-80 flex-col gap-1 overflow-auto orbit-scroll">
          <button
            onClick={() => {
              if (task) updateReviewer(task.id, null)
              setReviewerOpen(false)
            }}
            className={cn(
              'flex items-center gap-2.5 rounded-lg border border-dashed border-border-strong px-3 py-2 text-sm text-muted-foreground hover:bg-secondary',
              !task?.reviewerId && 'bg-primary-muted',
            )}
          >
            <Avatar member={null} size={28} />
            未設定
          </button>
          {members.map((m) => {
            const checked = task?.reviewerId === m.id
            return (
              <button
                key={m.id}
                onClick={() => {
                  if (task) updateReviewer(task.id, m.id)
                  setReviewerOpen(false)
                }}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary',
                  checked && 'bg-primary-muted',
                )}
              >
                <Avatar member={m} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{m.displayName || m.name}</div>
                  <div className="text-xs text-muted-foreground">{m.affiliation}</div>
                </div>
                {checked && <Check className="size-4 shrink-0 text-primary" strokeWidth={3} />}
              </button>
            )
          })}
        </div>
      </Modal>

      {/* Blocker note */}
      <BlockerModal
        open={blockerOpen}
        onClose={() => setBlockerOpen(false)}
        task={task}
        onSave={(note) => {
          if (!task) return
          setBlocker(task.id, note)
          toast(note ? 'ブロッカーを登録しました' : 'ブロックを解除しました')
          setBlockerOpen(false)
        }}
      />
    </>
  )
}

function BlockerModal({
  open,
  onClose,
  task,
  onSave,
}: {
  open: boolean
  onClose: () => void
  task: Task | null
  onSave: (note: string | null) => void
}) {
  const [note, setNote] = useState('')
  const [lastTaskId, setLastTaskId] = useState<string | null>(null)
  if (task && task.id !== lastTaskId && open) {
    setLastTaskId(task.id)
    setNote(task.blocker?.note ?? '')
  }

  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="text-base font-semibold">ブロッカーを登録</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        困っていること・作業が止まっている理由を記録します。管理者画面の Blocked Tasks に表示されます。
      </p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder="例：企業から素材未提出"
        className="mt-3 w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
      />
      <div className="mt-5 flex justify-end gap-2">
        {task?.blocker && (
          <Button variant="ghost" className="h-9 mr-auto text-destructive" onClick={() => onSave(null)}>
            解除する
          </Button>
        )}
        <Button variant="ghost" className="h-9" onClick={onClose}>
          キャンセル
        </Button>
        <Button className="h-9" disabled={!note.trim()} onClick={() => onSave(note)}>
          保存
        </Button>
      </div>
    </Modal>
  )
}

function ScheduleModal({
  open,
  onClose,
  task,
  onSave,
}: {
  open: boolean
  onClose: () => void
  task: Task | null
  onSave: (startDate: string | null, deadline: string | null) => void
}) {
  const [start, setStart] = useState('')
  const [deadline, setDeadline] = useState('')

  // sync drafts whenever the modal opens for a (possibly different) task
  const [lastTaskId, setLastTaskId] = useState<string | null>(null)
  if (task && task.id !== lastTaskId && open) {
    setLastTaskId(task.id)
    setStart(task.startDate ?? '')
    setDeadline(task.deadline ?? '')
  }

  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="text-base font-semibold">日程を変更</h2>
      <p className="mt-1 text-xs text-muted-foreground">変更すると管理者に通知が送られます。</p>
      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">開始日</span>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="h-9 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">期限</span>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="h-9 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary"
          />
        </label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" className="h-9" onClick={onClose}>
          キャンセル
        </Button>
        <Button className="h-9" onClick={() => onSave(start || null, deadline || null)}>
          保存
        </Button>
      </div>
    </Modal>
  )
}

function DrawerBody({
  task,
  currentUserId,
  isAdmin,
  assignees,
  dependsOnTasks,
  creator,
  reviewer,
  members,
  projectName,
  hasSourceInput,
  onClose,
  onStatus,
  onTake,
  onOpenAssign,
  onOpenInput,
  onOpenSchedule,
  onOpenDepends,
  onOpenReviewer,
  onOpenBlocker,
  onClearBlocker,
  onAddDeliverable,
  onRemoveDeliverable,
  onAddComment,
  onRemoveComment,
  onProgress,
}: {
  task: Task
  currentUserId: string | null
  isAdmin: boolean
  assignees: Member[]
  dependsOnTasks: Task[]
  creator: Member | null
  reviewer: Member | null
  members: Member[]
  projectName: string
  hasSourceInput: boolean
  onClose: () => void
  onStatus: (s: TaskStatus) => void
  onTake: () => void
  onOpenAssign: () => void
  onOpenInput: () => void
  onOpenSchedule: () => void
  onOpenDepends: () => void
  onOpenReviewer: () => void
  onOpenBlocker: () => void
  onClearBlocker: () => void
  onAddDeliverable: (label: string, url: string) => void
  onRemoveDeliverable: (id: string) => void
  onAddComment: (text: string) => void
  onRemoveComment: (commentId: string) => void
  onProgress: (text: string) => void
}) {
  const overdue = isOverdue(task)
  const calendarUrl = googleCalendarUrl(task, {
    projectName,
    department: task.department,
    category: task.category,
  })
  const isAssignee = !!currentUserId && task.assigneeIds.includes(currentUserId)
  const canChangeStatus = isAdmin || isAssignee
  const canUpdateProgress = isAdmin || isAssignee
  const canManageBlocker = isAdmin || isAssignee
  const canManageDeliverables = isAdmin || isAssignee
  const [progressDraft, setProgressDraft] = useState('')
  const [deliverableLabel, setDeliverableLabel] = useState('')
  const [deliverableUrl, setDeliverableUrl] = useState('')
  const [commentDraft, setCommentDraft] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)

  // only an admin can move a task to the final 完了 — an assignee's own
  // "done" signal is 確認待ち, which emails the admin for confirmation
  const statusOptions = STATUS_ORDER.filter((s) => s !== 'done' || isAdmin)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          タスク詳細
        </span>
        <button
          onClick={onClose}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="閉じる"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 overflow-auto orbit-scroll px-5 py-4">
        <div className="flex items-center gap-2">
          <h2 id="task-drawer-title" className="text-lg font-semibold tracking-tight text-balance">
            {task.name}
          </h2>
          {task.visibility === '幹部' && (
            <span className="shrink-0 rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
              幹部限定
            </span>
          )}
        </div>
        {task.description && (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {task.description}
          </p>
        )}

        {task.blocker && (
          <div className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5">
            <div className="flex items-start gap-2">
              <Ban className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div>
                <p className="text-sm font-medium text-destructive">ブロック中</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{task.blocker.note}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{task.blocker.since}〜</p>
              </div>
            </div>
            {canManageBlocker && (
              <button
                onClick={onClearBlocker}
                className="shrink-0 whitespace-nowrap text-xs font-medium text-primary hover:underline"
              >
                解除
              </button>
            )}
          </div>
        )}

        <dl className="mt-5 space-y-0.5">
          <Row label="プロジェクト">
            <span className="inline-flex items-center gap-1.5 text-sm">
              <span className="size-1.5 rounded-full bg-primary/60" />
              {projectName}
            </span>
          </Row>
          <Row label="部門">
            <span className="text-sm">{task.department}</span>
          </Row>
          <Row label="担当者">
            {assignees.length > 0 ? (
              <div className="flex flex-col items-end gap-1">
                {assignees.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-2 text-sm">
                    <Avatar member={a} size={22} />
                    {a.displayName || a.name}
                  </span>
                ))}
              </div>
            ) : (
              <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                未アサイン
              </span>
            )}
          </Row>
          <Row label="確認者">
            <span className="inline-flex items-center gap-1.5 text-sm">
              {reviewer ? (
                <span className="inline-flex items-center gap-2">
                  <Avatar member={reviewer} size={22} />
                  {reviewer.displayName || reviewer.name}
                </span>
              ) : (
                <span className="text-muted-foreground">未設定</span>
              )}
              {isAdmin && (
                <button
                  onClick={onOpenReviewer}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="確認者を編集"
                >
                  <Pencil className="size-3.5" />
                </button>
              )}
            </span>
          </Row>
          <Row label="開始日">
            <span className="inline-flex items-center gap-1.5 text-sm">
              {formatDeadlineFull(task.startDate ?? null)}
              {isAdmin && (
                <button
                  onClick={onOpenSchedule}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="日程を編集"
                >
                  <Pencil className="size-3.5" />
                </button>
              )}
            </span>
          </Row>
          <Row label="期限">
            <span className={cn('inline-flex items-center gap-1.5 text-sm', overdue && 'text-destructive')}>
              {overdue && <TriangleAlert className="size-3.5" />}
              {formatDeadlineFull(task.deadline)}
              {task.dueTime && <span className="tabular-nums">　{task.dueTime}</span>}
              {isAdmin && (
                <button
                  onClick={onOpenSchedule}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="日程を編集"
                >
                  <Pencil className="size-3.5" />
                </button>
              )}
            </span>
          </Row>
          <Row label="前提タスク">
            <div className="flex flex-col items-end gap-1">
              {dependsOnTasks.length > 0 ? (
                dependsOnTasks.map((d) => (
                  <span key={d.id} className="inline-flex items-center gap-1.5 text-sm">
                    <GitBranch className="size-3.5 text-muted-foreground" />
                    {d.name}
                  </span>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">なし</span>
              )}
              {isAdmin && (
                <button
                  onClick={onOpenDepends}
                  className="text-xs text-primary hover:underline"
                >
                  編集
                </button>
              )}
            </div>
          </Row>
          <Row label="ステータス">
            <span className="inline-flex items-center gap-1.5 text-sm">
              <StatusDot status={task.status} />
              {STATUS_LABEL[task.status]}
            </span>
          </Row>
          <Row label="カテゴリ">
            <span className="text-sm">{task.category}</span>
          </Row>
          <Row label="難易度">
            <DifficultyBadge difficulty={task.difficulty} />
          </Row>
          <Row label="要求スキル">
            <div className="flex flex-wrap gap-1.5">
              {task.skills.map((s) => (
                <Tag key={s}>{s}</Tag>
              ))}
            </div>
          </Row>
          <Row label="登録者">
            {creator ? (
              <span className="inline-flex items-center gap-2 text-sm">
                <Avatar member={creator} size={22} />
                {creator.displayName || creator.name}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">不明</span>
            )}
          </Row>
        </dl>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {hasSourceInput && (
            <button
              onClick={onOpenInput}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <FileText className="size-3.5" />
              元の入力内容を見る
            </button>
          )}
          {calendarUrl && (
            <a
              href={calendarUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <CalendarPlus className="size-3.5" />
              自分のGoogleカレンダーに追加
            </a>
          )}
          {canManageBlocker && !task.blocker && (
            <button
              onClick={onOpenBlocker}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-destructive"
            >
              <Ban className="size-3.5" />
              ブロッカーを登録
            </button>
          )}
        </div>

        {/* Status changer */}
        {canChangeStatus && (
          <div className="mt-6">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              ステータスを変更
            </div>
            <div className="flex flex-wrap gap-1.5">
              {statusOptions.map((s) => (
                <button
                  key={s}
                  onClick={() => onStatus(s)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                    task.status === s
                      ? 'border-primary bg-primary-muted text-accent-foreground'
                      : 'border-border bg-card text-foreground hover:bg-secondary',
                  )}
                >
                  <StatusDot status={s} />
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
            {!isAdmin && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                「確認待ち」にすると管理者に通知され、確認後「完了」になります。
              </p>
            )}
          </div>
        )}

        {/* Progress */}
        <div className="mt-6">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            進捗
          </div>
          {canUpdateProgress && (
            <div className="mb-3 flex items-start gap-2">
              <textarea
                value={progressDraft}
                onChange={(e) => setProgressDraft(e.target.value)}
                rows={2}
                placeholder="どこまで進んだか記録する"
                className="min-h-[52px] flex-1 resize-none rounded-lg border border-border bg-card px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
              />
              <Button
                className="h-9 shrink-0"
                disabled={!progressDraft.trim()}
                onClick={() => {
                  onProgress(progressDraft)
                  setProgressDraft('')
                }}
              >
                記録
              </Button>
            </div>
          )}
          {task.progressHistory.length > 0 ? (
            <ul className="space-y-2.5">
              {task.progressHistory.map((entry) => (
                <li key={entry.id} className="rounded-lg border border-border bg-secondary/40 px-3 py-2">
                  <p className="text-sm leading-relaxed">{entry.text}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatDateTime(entry.at)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">まだ進捗の記録がありません。</p>
          )}
        </div>

        {/* Deliverables */}
        <div className="mt-6">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            成果物
          </div>
          {(task.deliverables?.length ?? 0) > 0 ? (
            <ul className="mb-3 flex flex-col gap-1.5">
              {task.deliverables!.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2"
                >
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-w-0 items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    <Link2 className="size-3.5 shrink-0" />
                    <span className="truncate">{d.label}</span>
                  </a>
                  {canManageDeliverables && (
                    <button
                      onClick={() => onRemoveDeliverable(d.id)}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label="削除"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-3 text-sm text-muted-foreground">まだ成果物が登録されていません。</p>
          )}
          {canManageDeliverables && (
            <div className="flex flex-col gap-1.5 sm:flex-row">
              <input
                value={deliverableLabel}
                onChange={(e) => setDeliverableLabel(e.target.value)}
                placeholder="名前（例：ポスターPDF）"
                className="h-9 flex-1 rounded-lg border border-border bg-card px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
              />
              <input
                value={deliverableUrl}
                onChange={(e) => setDeliverableUrl(e.target.value)}
                placeholder="URL"
                className="h-9 flex-1 rounded-lg border border-border bg-card px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
              />
              <Button
                variant="outline"
                className="h-9 shrink-0"
                disabled={!deliverableLabel.trim() || !deliverableUrl.trim()}
                onClick={() => {
                  onAddDeliverable(deliverableLabel, deliverableUrl)
                  setDeliverableLabel('')
                  setDeliverableUrl('')
                }}
              >
                <Plus className="size-4" />
                追加
              </Button>
            </div>
          )}
        </div>

        {/* Comments */}
        <div className="mt-6">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            コメント
          </div>
          {(task.comments?.length ?? 0) > 0 ? (
            <ul className="mb-3 flex flex-col gap-2.5">
              {task.comments!.map((c) => {
                const author = members.find((m) => m.id === c.byId)
                const canDelete = isAdmin || c.byId === currentUserId
                return (
                  <li key={c.id} className="rounded-lg border border-border bg-secondary/40 px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {author && <Avatar member={author} size={18} />}
                        <span className="text-xs font-medium">
                          {author?.displayName || author?.name || '不明'}
                        </span>
                        <span className="text-[11px] text-muted-foreground">{formatDateTime(c.at)}</span>
                      </div>
                      {canDelete && (
                        <button
                          onClick={() => onRemoveComment(c.id)}
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label="削除"
                        >
                          <X className="size-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{c.text}</p>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="mb-3 text-sm text-muted-foreground">まだコメントがありません。</p>
          )}
          <div className="flex items-start gap-2">
            <textarea
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              rows={2}
              placeholder="コメントを追加"
              className="min-h-[52px] flex-1 resize-none rounded-lg border border-border bg-card px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
            />
            <Button
              className="h-9 shrink-0"
              disabled={!commentDraft.trim()}
              onClick={() => {
                onAddComment(commentDraft)
                setCommentDraft('')
              }}
            >
              送信
            </Button>
          </div>
        </div>

        {/* Change history */}
        {isAdmin && (task.history?.length ?? 0) > 0 && (
          <div className="mt-6">
            <button
              onClick={() => setHistoryOpen((o) => !o)}
              className="flex w-full items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              <span className="inline-flex items-center gap-1.5">
                <HistoryIcon className="size-3.5" />
                変更履歴
              </span>
              <ChevronDown className={cn('size-3.5 transition-transform', historyOpen && 'rotate-180')} />
            </button>
            {historyOpen && (
              <ul className="mt-2 flex flex-col gap-2">
                {task.history!.map((h) => (
                  <li key={h.id} className="text-xs">
                    <p className="text-muted-foreground">{formatDateTime(h.at)}</p>
                    <p className="mt-0.5">
                      {members.find((m) => m.id === h.byId)?.displayName ||
                        members.find((m) => m.id === h.byId)?.name ||
                        '不明'}
                      が{HISTORY_FIELD_LABEL[h.field]}を「{historyValueLabel(h.field, h.from, members)}」→「
                      {historyValueLabel(h.field, h.to, members)}」に変更
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="border-t border-border px-5 py-3.5">
        {isAdmin ? (
          <Button variant="outline" className="h-9 w-full" onClick={onOpenAssign}>
            <UserPlus className="size-4" />
            担当者を変更
          </Button>
        ) : !isAssignee ? (
          <Button className="h-9 w-full" onClick={onTake}>
            <UserPlus className="size-4" />
            このタスクを担当する
          </Button>
        ) : (
          <p className="text-center text-xs text-muted-foreground">
            あなたが担当しています。上のボタンでステータスを更新できます。
          </p>
        )}
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 py-2.5 last:border-0">
      <dt className="shrink-0 pt-0.5 text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  )
}
