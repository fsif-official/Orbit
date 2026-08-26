'use client'

import { useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { Avatar, Tag, ProjectTag, DifficultyBadge } from '@/components/orbit/primitives'
import { rankCandidates, matchSkills, formatDeadline } from '@/lib/orbit/utils'
import { useToast } from '@/components/orbit/toast'
import { Button } from '@/components/ui/button'
import { ChevronDown, Sparkles, Info } from 'lucide-react'
import type { Task, Member } from '@/lib/orbit/types'

export function AdminAssignments() {
  const { visibleTasks: tasks, members, getProject, assignTask } = useOrbit()
  const unassigned = tasks.filter((t) => t.assigneeIds.length === 0 && t.status !== 'done')
  const [selectedId, setSelectedId] = useState<string | null>(unassigned[0]?.id ?? null)

  const selected = tasks.find((t) => t.id === selectedId) ?? null

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Assignments</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        未アサインのタスクに担当者を割り当てます。Orbitは候補を提案しますが、最終判断は管理者が行います。
      </p>

      {unassigned.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm font-medium">未アサインのタスクはありません</p>
          <p className="mt-1 text-xs text-muted-foreground">すべてのタスクに担当者が設定されています。</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
          {/* Task list */}
          <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3 text-xs font-medium text-muted-foreground">
              未アサイン {unassigned.length}件
            </div>
            <ul className="divide-y divide-border">
              {unassigned.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setSelectedId(t.id)}
                    className={`w-full px-4 py-3 text-left transition-colors ${
                      t.id === selectedId ? 'bg-accent' : 'hover:bg-accent/60'
                    }`}
                  >
                    <div className="text-sm font-medium">{t.name}</div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <ProjectTag name={getProject(t.projectId)?.name ?? ''} />
                      <span className="text-xs text-muted-foreground">{formatDeadline(t.deadline)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Detail + candidates */}
          {selected && <MatchPanel key={selected.id} task={selected} members={members} assignTask={assignTask} projectName={getProject(selected.projectId)?.name ?? ''} />}
        </div>
      )}
    </div>
  )
}

function MatchPanel({
  task,
  members,
  assignTask,
  projectName,
}: {
  task: Task
  members: Member[]
  assignTask: (id: string, memberIds: string[]) => void
  projectName: string
}) {
  const toast = useToast()
  const ranked = rankCandidates(task, members)
  const rankedIds = new Set(ranked.map((r) => r.member.id))
  const others = members.filter((m) => !rankedIds.has(m.id))
  const [showOthers, setShowOthers] = useState(false)

  function handleAssign(m: Member) {
    assignTask(task.id, [...task.assigneeIds, m.id])
    toast(`${m.displayName || m.name} をアサインしました`)
  }

  return (
    <div>
      {/* Task header */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">{task.name}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ProjectTag name={projectName} />
              <span className="text-xs text-muted-foreground">期限：{formatDeadline(task.deadline)}</span>
              <DifficultyBadge difficulty={task.difficulty} />
            </div>
          </div>
        </div>
        <div className="mt-4">
          <div className="text-xs font-medium text-muted-foreground">必要スキル</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {task.skills.map((s) => (
              <Tag key={s}>{s}</Tag>
            ))}
          </div>
        </div>
      </div>

      {/* Recommended candidates */}
      <div className="mt-5 flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">おすすめ担当</h3>
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info className="size-3.5" />
        スキルの一致・本人のWill・過去の実績にもとづく提案です。点数評価ではありません。
      </p>

      <div className="mt-3 space-y-3">
        {ranked.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center text-xs text-muted-foreground">
            スキルが一致する候補が見つかりませんでした。下から任意のメンバーを選択できます。
          </div>
        )}
        {ranked.map(({ member, matches }) => (
          <CandidateCard key={member.id} member={member} matches={matches} onAssign={() => handleAssign(member)} recommended />
        ))}
      </div>

      {/* Other members */}
      {others.length > 0 && (
        <div className="mt-5">
          <button
            onClick={() => setShowOthers((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDown className={`size-3.5 transition-transform ${showOthers ? 'rotate-180' : ''}`} />
            その他のメンバーから選ぶ（{others.length}）
          </button>
          {showOthers && (
            <div className="mt-3 space-y-3">
              {others.map((member) => (
                <CandidateCard
                  key={member.id}
                  member={member}
                  matches={matchSkills(task, member)}
                  onAssign={() => handleAssign(member)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CandidateCard({
  member,
  matches,
  onAssign,
  recommended,
}: {
  member: Member
  matches: string[]
  onAssign: () => void
  recommended?: boolean
}) {
  return (
    <div
      className={`rounded-lg border bg-card p-4 ${
        recommended ? 'border-border' : 'border-border/60'
      }`}
    >
      <div className="flex items-start gap-3">
        <Avatar member={member} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{member.displayName || member.name}</span>
            {member.role === '一般' && (
              <span className="text-xs text-muted-foreground">{member.affiliation}</span>
            )}
          </div>

          {/* Matched skills */}
          {matches.length > 0 ? (
            <div className="mt-2">
              <div className="text-[11px] font-medium text-muted-foreground">
                一致したスキル（{matches.length}）
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {matches.map((s) => (
                  <Tag
                    key={s}
                    className="border-primary/30 bg-primary/10 text-primary"
                  >
                    {s}
                  </Tag>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-2 text-[11px] text-muted-foreground">一致したスキルはありません</div>
          )}

          {/* Will */}
          {member.will.length > 0 && (
            <div className="mt-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/70">Will：</span>
              {member.will.join(' / ')}
            </div>
          )}

          {/* Fact */}
          {member.facts.length > 0 && (
            <div className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/70">実績：</span>
              {member.facts.slice(0, 2).map((f) => `${f.label} ${f.count}件`).join(' / ')}
            </div>
          )}
        </div>
        <Button size="sm" onClick={onAssign} className="shrink-0">
          アサイン
        </Button>
      </div>
    </div>
  )
}
