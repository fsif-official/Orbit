'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useOrbit } from '@/lib/orbit/store'
import { STATUS_LABEL, STATUS_ORDER } from '@/lib/orbit/types'
import type { Task } from '@/lib/orbit/types'
import { formatDeadline, isOverdue } from '@/lib/orbit/utils'
import { Avatar, StatusBadge, DifficultyBadge, ProjectTag } from '@/components/orbit/primitives'

export function ListView({
  tasks,
  onOpenTask,
}: {
  tasks: Task[]
  onOpenTask: (id: string) => void
}) {
  const { projects, members } = useOrbit()
  const [query, setQuery] = useState('')
  const [projectFilter, setProjectFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [assigneeFilter, setAssigneeFilter] = useState('all')

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (query && !t.name.toLowerCase().includes(query.toLowerCase())) return false
      if (projectFilter !== 'all' && t.projectId !== projectFilter) return false
      if (statusFilter !== 'all' && t.status !== statusFilter) return false
      if (assigneeFilter !== 'all') {
        if (assigneeFilter === 'unassigned' ? t.assigneeId !== null : t.assigneeId !== assigneeFilter)
          return false
      }
      return true
    })
  }, [tasks, query, projectFilter, statusFilter, assigneeFilter])

  const selectCls =
    'h-9 rounded-lg border border-border bg-card px-2.5 text-sm text-foreground outline-none focus:border-primary'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="タスクを検索"
            className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        </div>
        <select className={selectCls} value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="all">プロジェクト: すべて</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select className={selectCls} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">ステータス: すべて</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select className={selectCls} value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
          <option value="all">担当: すべて</option>
          <option value="unassigned">未アサイン</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50 text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">タスク</th>
              <th className="px-4 py-2.5 font-medium">担当</th>
              <th className="px-4 py-2.5 font-medium">プロジェクト</th>
              <th className="px-4 py-2.5 font-medium">期限</th>
              <th className="px-4 py-2.5 font-medium">ステータス</th>
              <th className="px-4 py-2.5 font-medium">カテゴリ</th>
              <th className="px-4 py-2.5 font-medium">難易度</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => {
              const assignee = members.find((m) => m.id === t.assigneeId)
              const project = projects.find((p) => p.id === t.projectId)
              const overdue = isOverdue(t)
              return (
                <tr
                  key={t.id}
                  onClick={() => onOpenTask(t.id)}
                  className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-secondary/50"
                >
                  <td className="px-4 py-3 font-medium text-foreground">{t.name}</td>
                  <td className="px-4 py-3">
                    {assignee ? (
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Avatar member={assignee} size={22} />
                        {assignee.name}
                      </span>
                    ) : (
                      <span className="text-amber-600">未アサイン</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{project && <ProjectTag name={project.name} />}</td>
                  <td className={`px-4 py-3 tabular-nums ${overdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {formatDeadline(t.deadline)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{t.category}</td>
                  <td className="px-4 py-3">
                    <DifficultyBadge difficulty={t.difficulty} />
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  条件に一致するタスクがありません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
