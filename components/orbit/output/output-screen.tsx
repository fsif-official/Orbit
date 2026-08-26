'use client'

import { useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useNav } from '@/lib/orbit/nav'
import { KanbanBoard } from './kanban-board'
import { CalendarView } from './calendar-view'
import { ListView } from './list-view'
import { PeopleView } from './people-view'
import { ProjectView } from './project-view'
import { DifficultyBoard } from './difficulty-board'
import { TaskDetailDrawer } from './task-detail-drawer'
import { cn } from '@/lib/utils'
import { Columns3, LayoutList, CalendarDays, GaugeCircle, Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Target = 'all' | 'people' | 'projects'
type View = 'workflow' | 'list' | 'calendar' | 'difficulty'

export function OutputScreen() {
  const { tasks } = useOrbit()
  const { go } = useNav()
  const [target, setTarget] = useState<Target>('all')
  const [view, setView] = useState<View>('workflow')
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)

  const showViewAxis = target === 'all'

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
          </Segment>

          {showViewAxis && (
            <Segment label="表示">
              <Seg active={view === 'workflow'} onClick={() => setView('workflow')}>
                <Columns3 className="size-3.5" />
                ワークフロー
              </Seg>
              <Seg active={view === 'list'} onClick={() => setView('list')}>
                <LayoutList className="size-3.5" />
                リスト
              </Seg>
              <Seg active={view === 'calendar'} onClick={() => setView('calendar')}>
                <CalendarDays className="size-3.5" />
                カレンダー
              </Seg>
              <Seg active={view === 'difficulty'} onClick={() => setView('difficulty')}>
                <GaugeCircle className="size-3.5" />
                難易度
              </Seg>
            </Segment>
          )}
        </div>
      </div>

      {tasks.length === 0 ? (
        <EmptyState onInput={() => go({ name: 'input' })} />
      ) : (
        <>
          {target === 'people' && <PeopleView />}
          {target === 'projects' && <ProjectView />}
          {target === 'all' && view === 'workflow' && (
            <KanbanBoard tasks={tasks} onOpenTask={setOpenTaskId} />
          )}
          {target === 'all' && view === 'list' && (
            <ListView tasks={tasks} onOpenTask={setOpenTaskId} />
          )}
          {target === 'all' && view === 'calendar' && (
            <CalendarView tasks={tasks} onOpenTask={setOpenTaskId} />
          )}
          {target === 'all' && view === 'difficulty' && (
            <DifficultyBoard tasks={tasks} onOpenTask={setOpenTaskId} />
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
