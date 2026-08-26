'use client'

import { useOrbit } from '@/lib/orbit/store'
import { useNav } from '@/lib/orbit/nav'
import { Avatar, Tag } from '@/components/orbit/primitives'
import type { Member } from '@/lib/orbit/types'

function workload(count: number): { label: string; className: string } {
  if (count <= 2) return { label: '稼働少なめ', className: 'text-muted-foreground' }
  if (count <= 5) return { label: '通常', className: 'text-foreground' }
  return { label: 'タスク多め', className: 'text-[var(--status-review-fg)]' }
}

export function AdminMembers() {
  const { members, tasks } = useOrbit()
  const { go } = useNav()

  const activeCount = (m: Member) =>
    tasks.filter((t) => t.assigneeId === m.id && t.status !== 'done').length

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Members</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        メンバーのWill・Judgment・実績の一覧です。稼働状況は目安として表示しています。
      </p>

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Member</th>
                <th className="px-4 py-3 font-medium">Active</th>
                <th className="px-4 py-3 font-medium">Will</th>
                <th className="px-4 py-3 font-medium">Judgment</th>
                <th className="px-4 py-3 font-medium">Fact</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members.map((m) => {
                const count = activeCount(m)
                const wl = workload(count)
                return (
                  <tr
                    key={m.id}
                    onClick={() => go({ name: 'person', id: m.id })}
                    className="cursor-pointer transition-colors hover:bg-accent"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar member={m} size={30} />
                        <div>
                          <div className="font-medium">{m.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {m.role === 'admin' ? '管理者' : m.affiliation}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono tabular-nums">{count}</span>
                    </td>
                    <td className="max-w-[200px] px-4 py-3 text-xs text-muted-foreground">
                      {m.will.length > 0 ? m.will.join(' / ') : '—'}
                    </td>
                    <td className="max-w-[220px] px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {m.judgment.length > 0 ? (
                          m.judgment.slice(0, 3).map((j) => <Tag key={j}>{j}</Tag>)
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>
                    <td className="max-w-[200px] px-4 py-3 text-xs text-muted-foreground">
                      {m.facts.length > 0
                        ? m.facts.slice(0, 2).map((f) => `${f.label} ${f.count}`).join(' / ')
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${wl.className}`}>{wl.label}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
