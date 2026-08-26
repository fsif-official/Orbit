'use client'

import { useState } from 'react'
import type { Task, TaskStatus } from '@/lib/orbit/types'
import { STATUS_COLOR, STATUS_LABEL, STATUS_ORDER, isAdminRole } from '@/lib/orbit/types'
import { useOrbit } from '@/lib/orbit/store'
import { useToast } from '../toast'
import { KanbanCard } from './kanban-card'
import { cn } from '@/lib/utils'

export function KanbanBoard({
  tasks,
  onOpenTask,
}: {
  tasks: Task[]
  onOpenTask: (id: string) => void
}) {
  const { updateTaskStatus, currentUser } = useOrbit()
  const toast = useToast()
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overColumn, setOverColumn] = useState<TaskStatus | null>(null)

  const handleDrop = (status: TaskStatus) => {
    if (draggingId) {
      // only an admin can move a card straight to 完了 — see task-detail-drawer
      if (status === 'done' && !(currentUser && isAdminRole(currentUser.role))) {
        toast('「完了」への変更は管理者のみ行えます。「確認待ち」にしてください。')
      } else {
        updateTaskStatus(draggingId, status)
      }
    }
    setDraggingId(null)
    setOverColumn(null)
  }

  return (
    <div className="flex gap-3 overflow-x-auto orbit-scroll pb-4">
      {STATUS_ORDER.map((status) => {
        const columnTasks = tasks.filter((t) => t.status === status)
        return (
          <div
            key={status}
            onDragOver={(e) => {
              e.preventDefault()
              setOverColumn(status)
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setOverColumn(null)
            }}
            onDrop={() => handleDrop(status)}
            className={cn(
              'flex w-[276px] shrink-0 flex-col rounded-xl border transition-colors',
              overColumn === status
                ? 'border-primary/40 bg-primary-muted/40'
                : 'border-border bg-secondary/50',
            )}
          >
            <div className="flex items-center justify-between px-3 py-2.5">
              <span className="inline-flex items-center gap-2 text-sm font-medium">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: STATUS_COLOR[status] }}
                />
                {STATUS_LABEL[status]}
              </span>
              <span className="rounded-md bg-card px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                {columnTasks.length}
              </span>
            </div>
            <div className="flex min-h-[120px] flex-col gap-2 px-2 pb-2">
              {columnTasks.map((task) => (
                <KanbanCard
                  key={task.id}
                  task={task}
                  dragging={draggingId === task.id}
                  onDragStart={(e) => {
                    setDraggingId(task.id)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onClick={() => onOpenTask(task.id)}
                />
              ))}
              {columnTasks.length === 0 && (
                <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                  ここにドロップ
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
