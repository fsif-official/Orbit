'use client'

import { useMemo, useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useNav } from '@/lib/orbit/nav'
import { KanbanBoard } from './kanban-board'
import { CalendarView } from './calendar-view'
import { ListView } from './list-view'
import { PeopleView } from './people-view'
import { ProjectView } from './project-view'
import { DifficultyBoard } from './difficulty-board'
import { DependencyView } from './dependency-view'
import { TaskDetailDrawer } from './task-detail-drawer'
import { cn } from '@/lib/utils'
import {
  Columns3,
  LayoutList,
  CalendarDays,
  GaugeCircle,
  GitBranch,
  Inbox,
  Archive,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

type Target = 'all' | 'people' | 'projects' | 'archive'
type View = 'workflow' | 'list' | 'calendar' | 'difficulty' | 'dependency'

export function OutputScreen() {
  const { visibleTasks, archivedTasks, projects } = useOrbit()
  const { go } = useNav()
  const [target, setTarget] = useState<Target>('all')
  const [view, setView] = useState<View>('workflow')
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [projectFilter, setProjectFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  // choosing a 表示 (view) always jumps back to the "一覧" target, since the
  // workflow/list/calendar/difficulty/dependency views only apply there
  const selectView = (v: View) => {
    setView(v)
    setTarget('all')
  }

  // project-unit / schedule-unit filtering, applied to the "一覧" target's views
  const filteredTasks = useMemo(() => {
    return visibleTasks.filter((t) => {
      if (projectFilter && t.projectId !== projectFilter) return false
      if (fromDate || toDate) {
        const ref = t.deadline ?? t.startDate
        if (!ref) return false
        if (fromDate && ref < fromDate) return false
        if (toDate && ref > toDate) return false
      }
      return true
    })
  }, [visibleTasks, projectFilter, fromDate, toDate])

  const hasActiveFilter = !!(projectFilter || fromDate || toDate)

  return (
    <div className="mx-auto w-full max-w-[1360px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">ワークスペース</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              登録済みのタスクを組織の視点で確認します。
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Segment label="対象">
            <Seg active={target === 'all'} onClick={() => setTarget('all')}>
              一覧
            </Seg>
            <Seg active={target === 'people'} onClick={() => setTarget('people')}>
              個人
            </Seg>
            <Seg active={target === 'projects'} onClick={() => setTarget('projects')}>
              プロジェクト
            </Seg>
            <Seg active={target === 'archive'} onClick={() => setTarget('archive')}>
              <Archive className="size-3.5" />
              アーカイブ
              {archivedTasks.length > 0 && (
                <span className="rounded-full bg-secondary px-1.5 text-[10px] tabular-nums">
                  {archivedTasks.length}
                </span>
              )}
            </Seg>
          </Segment>

          <Segment label="表示">
            <Seg active={target === 'all' && view === 'workflow'} onClick={() => selectView('workflow')}>
              <Columns3 className="size-3.5" />
              ワークフロー
            </Seg>
            <Seg active={target === 'all' && view === 'list'} onClick={() => selectView('list')}>
              <LayoutList className="size-3.5" />
              リスト
            </Seg>
            <Seg active={target === 'all' && view === 'calendar'} onClick={() => selectView('calendar')}>
              <CalendarDays className="size-3.5" />
              カレンダー
            </Seg>
            <Seg active={target === 'all' && view === 'difficulty'} onClick={() => selectView('difficulty')}>
              <GaugeCircle className="size-3.5" />
              難易度
            </Seg>
            <Seg active={target === 'all' && view === 'dependency'} onClick={() => selectView('dependency')}>
              <GitBranch className="size-3.5" />
              依存関係
            </Seg>
          </Segment>

          {target === 'all' && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="h-8 cursor-pointer rounded-lg border border-border bg-card px-2 text-xs outline-none focus:border-primary"
              >
                <option value="">すべてのプロジェクト</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                title="期間（開始）"
                className="h-8 rounded-lg border border-border bg-card px-2 text-xs outline-none focus:border-primary"
              />
              <span className="text-xs text-muted-foreground">〜</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                title="期間（終了）"
                className="h-8 rounded-lg border border-border bg-card px-2 text-xs outline-none focus:border-primary"
              />
              {hasActiveFilter && (
                <button
                  onClick={() => {
                    setProjectFilter('')
                    setFromDate('')
                    setToDate('')
                  }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                  クリア
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {target === 'archive' ? (
        archivedTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-20 text-center">
            <Archive className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">アーカイブされたタスクはありません</p>
            <p className="mt-1 text-xs text-muted-foreground">
              完了から14日以上経過したタスクが自動でここに移動します。
            </p>
          </div>
        ) : (
          <ListView tasks={archivedTasks} onOpenTask={setOpenTaskId} />
        )
      ) : visibleTasks.length === 0 ? (
        <EmptyState onInput={() => go({ name: 'input' })} />
      ) : (
        <>
          {target === 'people' && <PeopleView />}
          {target === 'projects' && <ProjectView />}
          {target === 'all' && view === 'workflow' && (
            <KanbanBoard tasks={filteredTasks} onOpenTask={setOpenTaskId} />
          )}
          {target === 'all' && view === 'list' && (
            <ListView tasks={filteredTasks} onOpenTask={setOpenTaskId} />
          )}
          {target === 'all' && view === 'calendar' && (
            <CalendarView tasks={filteredTasks} onOpenTask={setOpenTaskId} />
          )}
          {target === 'all' && view === 'difficulty' && (
            <DifficultyBoard tasks={filteredTasks} onOpenTask={setOpenTaskId} />
          )}
          {target === 'all' && view === 'dependency' && (
            <DependencyView tasks={filteredTasks} onOpenTask={setOpenTaskId} />
          )}
        </>
      )}

      <TaskDetailDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
    </div>
  )
}

function Segment({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-secondary/60 p-0.5">
        {children}
      </div>
    </div>
  )
}

function Seg({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors',
        active
          ? 'bg-card text-foreground shadow-[0_1px_2px_rgba(16,24,40,0.06)]'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function EmptyState({ onInput }: { onInput: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-20 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-secondary">
        <Inbox className="size-6 text-muted-foreground" />
      </div>
      <h2 className="text-base font-semibold">まだタスクがありません</h2>
      <p className="mt-1 text-sm text-muted-foreground">最初のタスクを入力してみましょう。</p>
      <Button className="mt-5 h-9" onClick={onInput}>
        タスクを入力
      </Button>
    </div>
  )
}
