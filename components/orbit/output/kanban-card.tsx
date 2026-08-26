'use client'

import type { Task } from '@/lib/orbit/types'
import { PRIORITY_LINE } from '@/lib/orbit/types'
import { useOrbit } from '@/lib/orbit/store'
import { useNav } from '@/lib/orbit/nav'
import { Avatar, DifficultyBadge, DepartmentTag } from '../primitives'
import { formatDeadline, deadlineLevel } from '@/lib/orbit/utils'
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
  const { go } = useNav()
  const assignees = task.assigneeIds.map((id) => getMember(id)).filter(Boolean) as Array<
    NonNullable<ReturnType<typeof getMember>>
  >
  const project = getProject(task.projectId)
  const deadline = deadlineLevel(task)
  const urgent = deadline.level === 'overdue' || deadline.level === 'today'
  const soon = deadline.level === 'soon' || deadline.level === 'near'

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      style={{ borderLeftColor: PRIORITY_LINE[task.priority], borderLeftWidth: 3 }}
      className={cn(
        'group cursor-pointer rounded-lg border border-border bg-card p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all hover:border-border-strong hover:shadow-[0_2px_8px_rgba(16,24,40,0.07)]',
        urgent && 'border-danger-border bg-danger-muted/40',
        !urgent && soon && 'border-warning-border bg-warning-muted/30',
        dragging && 'opacity-40',
      )}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <span className="size-1.5 shrink-0 rounded-full bg-primary/60" />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            go({ name: 'project', id: task.projectId })
          }}
          className="truncate text-[11px] text-muted-foreground hover:text-foreground hover:underline"
        >
          {project?.name}
        </button>
        <span className="ml-auto shrink-0">
          <DepartmentTag name={task.department} />
        </span>
      </div>

      <p className="text-sm font-medium leading-snug text-pretty">{task.name}</p>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {assignees.length > 0 ? (
            <div className="flex min-w-0 items-center gap-1">
              <div className="flex shrink-0 -space-x-1.5">
                {assignees.slice(0, 3).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      go({ name: 'person', id: m.id })
                    }}
                    className="rounded-full ring-2 ring-card hover:z-10"
                  >
                    <Avatar member={m} size={20} />
                  </button>
                ))}
              </div>
              <span className="truncate text-xs text-muted-foreground">
                {assignees.map((m) => m.displayName || m.name).join('、')}
              </span>
            </div>
          ) : (
            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
              未アサイン
            </span>
          )}
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 text-[11px]',
            urgent ? 'font-medium text-destructive' : soon ? 'font-medium text-warning' : 'text-muted-foreground',
          )}
        >
          {urgent && <TriangleAlert className="size-3" />}
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
