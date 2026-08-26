'use client'

import type { Task } from '@/lib/orbit/types'
import { useOrbit } from '@/lib/orbit/store'
import { Avatar, DifficultyBadge } from '../primitives'
import { formatDeadline, isOverdue } from '@/lib/orbit/utils'
import { cn } from '@/lib/utils'
import { TriangleAlert } from 'lucide-react'

export function KanbanCard({
  task,
  onClick,
  onDragStart,
  dragging,
}: {
  task: Task
  onClick: () => void
  onDragStart: (e: React.DragEvent) => void
  dragging?: boolean
}) {
  const { getMember, getProject } = useOrbit()
  const assignee = getMember(task.assigneeId)
  const project = getProject(task.projectId)
  const overdue = isOverdue(task)

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className={cn(
        'group cursor-pointer rounded-lg border border-border bg-card p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all hover:border-border-strong hover:shadow-[0_2px_8px_rgba(16,24,40,0.07)]',
        dragging && 'opacity-40',
      )}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <span className="size-1.5 shrink-0 rounded-full bg-primary/60" />
        <span className="truncate text-[11px] text-muted-foreground">{project?.name}</span>
      </div>

      <p className="text-sm font-medium leading-snug text-pretty">{task.name}</p>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {assignee ? (
            <>
              <Avatar member={assignee} size={20} />
              <span className="text-xs text-muted-foreground">{assignee.name}</span>
            </>
          ) : (
            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
              未アサイン
            </span>
          )}
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 text-[11px]',
            overdue ? 'font-medium text-destructive' : 'text-muted-foreground',
          )}
        >
          {overdue && <TriangleAlert className="size-3" />}
          {formatDeadline(task.deadline)}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="truncate text-[11px] text-muted-foreground">{task.category}</span>
        <DifficultyBadge difficulty={task.difficulty} />
      </div>
    </div>
  )
}
