'use client'

import type { Task } from '@/lib/orbit/types'
import { DIFFICULTY_LABEL } from '@/lib/orbit/types'
import { KanbanCard } from './kanban-card'

export function DifficultyBoard({
  tasks,
  onOpenTask,
}: {
  tasks: Task[]
  onOpenTask: (id: string) => void
}) {
  return (
    <div className="flex gap-3 overflow-x-auto orbit-scroll pb-4">
      {DIFFICULTY_LABEL.map((difficulty) => {
        const columnTasks = tasks.filter((t) => t.difficulty === difficulty)
        return (
          <div
            key={difficulty}
            className="flex w-[276px] shrink-0 flex-col rounded-xl border border-border bg-secondary/50"
          >
            <div className="flex items-center justify-between px-3 py-2.5">
              <span className="text-sm font-medium">{difficulty}</span>
              <span className="rounded-md bg-card px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                {columnTasks.length}
              </span>
            </div>
            <div className="flex min-h-[120px] flex-col gap-2 px-2 pb-2">
              {columnTasks.map((task) => (
                <KanbanCard
                  key={task.id}
                  task={task}
                  onDragStart={() => {}}
                  onClick={() => onOpenTask(task.id)}
                />
              ))}
              {columnTasks.length === 0 && (
                <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                  該当なし
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
