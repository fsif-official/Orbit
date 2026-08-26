'use client'

import { useOrbit } from '@/lib/orbit/store'
import { useToast } from '@/components/orbit/toast'
import { Avatar, DifficultyBadge, ProjectTag, Tag } from '@/components/orbit/primitives'
import { Button } from '@/components/ui/button'
import { findSimilarTasks, formatDeadline } from '@/lib/orbit/utils'
import { Check, FileClock, ShieldCheck, TriangleAlert } from 'lucide-react'

export function AdminApprovals() {
  const {
    adminPendingTasks: pendingTasks,
    adminTasks: visibleTasks,
    getProject,
    getMember,
    approveTask,
    currentUser,
    isFullAdmin,
  } = useOrbit()
  const toast = useToast()

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Approvals</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        INPUTから登録されたタスクは、承認するまでワークスペースに表示されません。
      </p>

      {pendingTasks.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-border bg-card p-10 text-center">
          <FileClock className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">承認待ちのタスクはありません</p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {pendingTasks.map((t) => {
            const creator = getMember(t.createdById ?? null)
            const approver = creator?.reportsToId ? getMember(creator.reportsToId) : undefined
            // 組織体系(reports_to_id)で承認担当が決まっていれば本人のみ承認可能。
            // 未設定なら従来通り管理者なら誰でも承認できる。
            const canApprove = isFullAdmin || !approver || approver.id === currentUser?.id
            const similar = findSimilarTasks(t, visibleTasks)
            return (
              <div key={t.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <ProjectTag name={getProject(t.projectId)?.name ?? ''} />
                      <span className="text-xs text-muted-foreground">
                        期限：{formatDeadline(t.deadline)}
                      </span>
                      <DifficultyBadge difficulty={t.difficulty} />
                    </div>
                    <h2 className="mt-1.5 text-sm font-semibold">{t.name}</h2>
                    {t.description && (
                      <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {t.skills.map((s) => (
                        <Tag key={s}>{s}</Tag>
                      ))}
                    </div>
                    {creator && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Avatar member={creator} size={18} />
                          {creator.displayName || creator.name} が登録
                        </span>
                        {approver && (
                          <span className="flex items-center gap-1 text-accent-foreground">
                            <ShieldCheck className="size-3.5" />
                            承認担当：{approver.displayName || approver.name}
                          </span>
                        )}
                      </div>
                    )}
                    {similar.length > 0 && (
                      <div className="mt-2.5 rounded-md border border-warning/30 bg-warning-muted px-2.5 py-2">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-warning">
                          <TriangleAlert className="size-3.5 shrink-0" />
                          似たタスクが既にあるかもしれません
                        </div>
                        <ul className="mt-1 flex flex-col gap-0.5">
                          {similar.map(({ task: s }) => (
                            <li key={s.id} className="text-xs text-muted-foreground">
                              ・{s.name}
                              {s.status === 'done' && s.retrospective && (
                                <span className="block pl-3 text-[11px] italic">
                                  {s.retrospective.improve || s.retrospective.bad || s.retrospective.good}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  {canApprove ? (
                    <Button
                      size="sm"
                      className="shrink-0"
                      onClick={() => {
                        approveTask(t.id)
                        toast(`「${t.name}」を承認しました`)
                      }}
                    >
                      <Check className="size-4" />
                      承認する
                    </Button>
                  ) : (
                    <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                      {approver?.displayName || approver?.name}のみ承認できます
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
