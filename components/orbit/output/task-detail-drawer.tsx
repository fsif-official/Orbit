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
  type Task,
  type TaskStatus,
} from '@/lib/orbit/types'
import { formatDeadlineFull, isOverdue } from '@/lib/orbit/utils'
import { cn } from '@/lib/utils'
import { TriangleAlert, UserPlus, X } from 'lucide-react'

export function TaskDetailDrawer({
  taskId,
  onClose,
}: {
  taskId: string | null
  onClose: () => void
}) {
  const { tasks, currentUser, getMember, getProject, updateTaskStatus, assignTask, members } =
    useOrbit()
  const toast = useToast()
  const [confirmTake, setConfirmTake] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)

  const task = tasks.find((t) => t.id === taskId) ?? null
  const open = !!taskId

  return (
    <>
      <Drawer open={open} onClose={onClose} labelledBy="task-drawer-title">
        {task && (
          <DrawerBody
            task={task}
            currentUserId={currentUser?.id ?? null}
            isAdmin={currentUser?.role === 'admin'}
            assignee={getMember(task.assigneeId) ?? null}
            projectName={getProject(task.projectId)?.name ?? ''}
            onClose={onClose}
            onStatus={(s) => updateTaskStatus(task.id, s)}
            onTake={() => setConfirmTake(true)}
            onOpenAssign={() => setAssignOpen(true)}
          />
        )}
      </Drawer>

      {/* Take task confirm */}
      <Modal open={confirmTake} onClose={() => setConfirmTake(false)}>
        <h2 className="text-base font-semibold">このタスクを担当しますか？</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          「{task?.name}」の担当者としてあなたが登録されます。
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" className="h-9" onClick={() => setConfirmTake(false)}>
            キャンセル
          </Button>
          <Button
            className="h-9"
            onClick={() => {
              if (task && currentUser) {
                assignTask(task.id, currentUser.id)
                toast('このタスクの担当になりました')
              }
              setConfirmTake(false)
            }}
          >
            担当する
          </Button>
        </div>
      </Modal>

      {/* Admin assign */}
      <Modal open={assignOpen} onClose={() => setAssignOpen(false)}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">担当者を変更</h2>
          <button onClick={() => setAssignOpen(false)} aria-label="閉じる">
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>
        <div className="flex max-h-80 flex-col gap-1 overflow-auto orbit-scroll">
          <button
            onClick={() => {
              if (task) assignTask(task.id, null)
              setAssignOpen(false)
              toast('担当者を未アサインにしました')
            }}
            className="flex items-center gap-2.5 rounded-lg border border-dashed border-border-strong px-3 py-2 text-sm text-muted-foreground hover:bg-secondary"
          >
            <Avatar member={null} size={28} />
            未アサインにする
          </button>
          {members.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                if (task) assignTask(task.id, m.id)
                setAssignOpen(false)
                toast(`${m.name} をアサインしました`)
              }}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary',
                task?.assigneeId === m.id && 'bg-primary-muted',
              )}
            >
              <Avatar member={m} size={28} />
              <div className="min-w-0">
                <div className="font-medium">{m.name}</div>
                <div className="text-xs text-muted-foreground">{m.affiliation}</div>
              </div>
            </button>
          ))}
        </div>
      </Modal>
    </>
  )
}

function DrawerBody({
  task,
  currentUserId,
  isAdmin,
  assignee,
  projectName,
  onClose,
  onStatus,
  onTake,
  onOpenAssign,
}: {
  task: Task
  currentUserId: string | null
  isAdmin: boolean
  assignee: ReturnType<typeof Object> | null
  projectName: string
  onClose: () => void
  onStatus: (s: TaskStatus) => void
  onTake: () => void
  onOpenAssign: () => void
}) {
  const overdue = isOverdue(task)
  const canChangeStatus = isAdmin || task.assigneeId === currentUserId

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
        <h2 id="task-drawer-title" className="text-lg font-semibold tracking-tight text-balance">
          {task.name}
        </h2>
        {task.description && (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {task.description}
          </p>
        )}

        <dl className="mt-5 space-y-0.5">
          <Row label="プロジェクト">
            <span className="inline-flex items-center gap-1.5 text-sm">
              <span className="size-1.5 rounded-full bg-primary/60" />
              {projectName}
            </span>
          </Row>
          <Row label="担当者">
            {assignee ? (
              <span className="inline-flex items-center gap-2 text-sm">
                <Avatar member={assignee as never} size={22} />
                {(assignee as { name: string }).name}
              </span>
            ) : (
              <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                未アサイン
              </span>
            )}
          </Row>
          <Row label="期限">
            <span className={cn('inline-flex items-center gap-1.5 text-sm', overdue && 'text-destructive')}>
              {overdue && <TriangleAlert className="size-3.5" />}
              {formatDeadlineFull(task.deadline)}
            </span>
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
          <Row label="必要スキル">
            <div className="flex flex-wrap gap-1.5">
              {task.skills.map((s) => (
                <Tag key={s}>{s}</Tag>
              ))}
            </div>
          </Row>
        </dl>

        {/* Status changer */}
        {canChangeStatus && (
          <div className="mt-6">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              ステータスを変更
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_ORDER.map((s) => (
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
        ) : task.assigneeId === null ? (
          <Button className="h-9 w-full" onClick={onTake}>
            <UserPlus className="size-4" />
            このタスクを担当する
          </Button>
        ) : task.assigneeId === currentUserId ? (
          <p className="text-center text-xs text-muted-foreground">
            あなたが担当しています。上のボタンでステータスを更新できます。
          </p>
        ) : (
          <p className="text-center text-xs text-muted-foreground">
            {(assignee as { name?: string })?.name} が担当しています。
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
