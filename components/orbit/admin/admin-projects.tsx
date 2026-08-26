'use client'

import { useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useToast } from '@/components/orbit/toast'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

export function AdminProjects() {
  const { projects, visibleTasks, addProject } = useOrbit()
  const toast = useToast()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const handleCreate = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    addProject(trimmed, description.trim())
    toast(`「${trimmed}」を作成しました`)
    setName('')
    setDescription('')
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
      <p className="mt-1 text-sm text-muted-foreground">新しいプロジェクトを追加します。</p>

      <div className="mt-6 rounded-lg border border-border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              プロジェクト名
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：新歓イベント2027"
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">概要</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="任意"
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>
        <Button className="mt-3 h-9" disabled={!name.trim()} onClick={handleCreate}>
          <Plus className="size-4" />
          プロジェクトを追加
        </Button>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">プロジェクト</th>
              <th className="px-4 py-2.5 font-medium">概要</th>
              <th className="px-4 py-2.5 font-medium">タスク数</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {projects.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{p.description}</td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">
                  {visibleTasks.filter((t) => t.projectId === p.id).length}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
