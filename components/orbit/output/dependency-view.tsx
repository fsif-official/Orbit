'use client'

// 依存関係 (dependency tree) view — separate from the existing ワークフロー
// kanban board. Renders tasks as nodes connected by branches to the
// prerequisite tasks set on Task.dependsOnIds ("このタスクを開始するために
// このワークが必要"). Layout is a simple leveled DAG: a task's level is
// 1 + max(level of its prerequisites among the visible task set); tasks
// with no (visible) prerequisites sit at level 0.
import { useMemo } from 'react'
import type { Task } from '@/lib/orbit/types'
import { STATUS_COLOR, STATUS_LABEL } from '@/lib/orbit/types'
import { DifficultyBadge } from '../primitives'
import { GitBranch } from 'lucide-react'

const CARD_W = 220
const CARD_H = 68
const COL_GAP = 72
const ROW_GAP = 16

export function DependencyView({
  tasks,
  onOpenTask,
}: {
  tasks: Task[]
  onOpenTask: (id: string) => void
}) {
  const taskIds = useMemo(() => new Set(tasks.map((t) => t.id)), [tasks])

  const levels = useMemo(() => {
    const levelOf = new Map<string, number>()
    const visiting = new Set<string>()
    const resolve = (t: Task): number => {
      if (levelOf.has(t.id)) return levelOf.get(t.id)!
      const deps = (t.dependsOnIds ?? []).filter((id) => taskIds.has(id) && id !== t.id)
      if (deps.length === 0 || visiting.has(t.id)) {
        levelOf.set(t.id, 0)
        return 0
      }
      visiting.add(t.id)
      const maxDepLevel = Math.max(
        ...deps.map((id) => {
          const depTask = tasks.find((x) => x.id === id)
          return depTask ? resolve(depTask) : 0
        }),
      )
      visiting.delete(t.id)
      const lvl = maxDepLevel + 1
      levelOf.set(t.id, lvl)
      return lvl
    }
    tasks.forEach(resolve)
    return levelOf
  }, [tasks, taskIds])

  const { columns, positions, maxRows } = useMemo(() => {
    const cols = new Map<number, Task[]>()
    tasks.forEach((t) => {
      const lvl = levels.get(t.id) ?? 0
      if (!cols.has(lvl)) cols.set(lvl, [])
      cols.get(lvl)!.push(t)
    })
    const pos = new Map<string, { x: number; y: number }>()
    let rows = 0
    Array.from(cols.entries())
      .sort((a, b) => a[0] - b[0])
      .forEach(([lvl, list]) => {
        rows = Math.max(rows, list.length)
        list.forEach((t, i) => {
          pos.set(t.id, {
            x: lvl * (CARD_W + COL_GAP),
            y: i * (CARD_H + ROW_GAP),
          })
        })
      })
    return { columns: cols, positions: pos, maxRows: rows }
  }, [tasks, levels])

  const maxLevel = columns.size > 0 ? Math.max(...columns.keys()) : 0
  const svgWidth = (maxLevel + 1) * (CARD_W + COL_GAP)
  const svgHeight = Math.max(maxRows, 1) * (CARD_H + ROW_GAP)

  const edges = useMemo(() => {
    const out: { from: string; to: string }[] = []
    tasks.forEach((t) => {
      ;(t.dependsOnIds ?? []).forEach((depId) => {
        if (taskIds.has(depId) && depId !== t.id) out.push({ from: depId, to: t.id })
      })
    })
    return out
  }, [tasks, taskIds])

  const hasAnyDependency = edges.length > 0

  if (tasks.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
        表示できるタスクがありません
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {!hasAnyDependency && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          <GitBranch className="size-3.5 shrink-0" />
          まだ前提タスクが設定されていません。タスク詳細から「前提タスク」を編集できます。
        </div>
      )}
      <div className="relative overflow-auto orbit-scroll rounded-xl border border-border bg-secondary/30 p-6">
        <div
          className="relative"
          style={{ width: svgWidth, height: svgHeight, minWidth: '100%' }}
        >
          <svg
            className="pointer-events-none absolute left-0 top-0"
            width={svgWidth}
            height={svgHeight}
          >
            {edges.map(({ from, to }, i) => {
              const a = positions.get(from)
              const b = positions.get(to)
              if (!a || !b) return null
              const x1 = a.x + CARD_W
              const y1 = a.y + CARD_H / 2
              const x2 = b.x
              const y2 = b.y + CARD_H / 2
              const midX = (x1 + x2) / 2
              return (
                <path
                  key={`${from}-${to}-${i}`}
                  d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke="var(--border-strong)"
                  strokeWidth={1.5}
                  markerEnd="url(#dep-arrow)"
                />
              )
            })}
            <defs>
              <marker
                id="dep-arrow"
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L8,4 L0,8 z" fill="var(--border-strong)" />
              </marker>
            </defs>
          </svg>

          {tasks.map((t) => {
            const p = positions.get(t.id)
            if (!p) return null
            return (
              <button
                key={t.id}
                onClick={() => onOpenTask(t.id)}
                className="absolute flex flex-col justify-between rounded-lg border border-border bg-card px-3 py-2 text-left shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-colors hover:border-border-strong"
                style={{ left: p.x, top: p.y, width: CARD_W, height: CARD_H }}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: STATUS_COLOR[t.status] }}
                  />
                  <span className="truncate text-sm font-medium">{t.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">{STATUS_LABEL[t.status]}</span>
                  <DifficultyBadge difficulty={t.difficulty} />
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
