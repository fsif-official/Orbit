'use client'

import { useMemo, useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useToast } from '@/components/orbit/toast'
import { Avatar, SectionLabel, Tag } from '@/components/orbit/primitives'
import { Button } from '@/components/ui/button'
import { DEPARTMENTS, DIFFICULTY_LABEL, PRIORITIES } from '@/lib/orbit/types'
import type { Department, Difficulty, Priority, ProjectTemplateTask } from '@/lib/orbit/types'
import { Plus, Trash2 } from 'lucide-react'

export function AdminProjects() {
  const {
    adminProjects: projects,
    adminTasks: visibleTasks,
    members,
    addProject,
    projectTypes,
    projectTemplates,
    setProjectTemplateTasks,
    removeProjectType,
    isFullAdmin,
  } = useOrbit()
  const toast = useToast()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState('')
  const [newType, setNewType] = useState('')

  const handleCreate = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    addProject(trimmed, description.trim(), type || undefined)
    const templateCount = type ? (projectTemplates[type]?.length ?? 0) : 0
    toast(
      templateCount > 0
        ? `「${trimmed}」を作成し、テンプレートの${templateCount}件のタスクを追加しました`
        : `「${trimmed}」を作成しました`,
    )
    setName('')
    setDescription('')
    setType('')
  }

  const projectMembers = (projectId: string) => {
    const ids = Array.from(
      new Set(visibleTasks.filter((t) => t.projectId === projectId).flatMap((t) => t.assigneeIds)),
    )
    return ids.map((id) => members.find((m) => m.id === id)).filter(Boolean) as typeof members
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {isFullAdmin
          ? '新しいプロジェクトを追加します。種類を選ぶと、その種類のテンプレートタスクが自動で作成されます。'
          : '担当プロジェクトの一覧です。新規追加やテンプレート管理は代表など上位の管理者のみ行えます。'}
      </p>

      {isFullAdmin && (
        <div className="mt-6 rounded-lg border border-border bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr]">
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
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">種類</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="h-9 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              >
                <option value="">未設定</option>
                {projectTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Button className="mt-3 h-9" disabled={!name.trim()} onClick={handleCreate}>
            <Plus className="size-4" />
            プロジェクトを追加
          </Button>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">プロジェクト</th>
              <th className="px-4 py-2.5 font-medium">種類</th>
              <th className="px-4 py-2.5 font-medium">概要</th>
              <th className="px-4 py-2.5 font-medium">担当者</th>
              <th className="px-4 py-2.5 font-medium">タスク数</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {projects.map((p) => {
              const pm = projectMembers(p.id)
              return (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3">
                    {p.type ? <Tag>{p.type}</Tag> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.description}</td>
                  <td className="px-4 py-3">
                    {pm.length > 0 ? (
                      <div className="flex -space-x-1.5">
                        {pm.slice(0, 6).map((m) => (
                          <span key={m.id} className="rounded-full ring-2 ring-card" title={m.displayName || m.name}>
                            <Avatar member={m} size={22} />
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">
                    {visibleTasks.filter((t) => t.projectId === p.id).length}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Project-type templates */}
      {isFullAdmin && (
      <div className="mt-10">
        <h2 className="text-base font-semibold">プロジェクトの種類 / テンプレートタスク</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          種類ごとに、新規プロジェクト作成時に自動で追加するタスクを定義できます。
        </p>

        <div className="mt-3 flex items-center gap-1.5">
          <input
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              if (e.key === 'Enter' && newType.trim()) {
                setProjectTemplateTasks(newType.trim(), projectTemplates[newType.trim()] ?? [])
                setNewType('')
              }
            }}
            placeholder="新しい種類名（例：コンテンツ開発）"
            className="h-9 w-64 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary"
          />
          <Button
            variant="outline"
            className="h-9"
            disabled={!newType.trim()}
            onClick={() => {
              setProjectTemplateTasks(newType.trim(), projectTemplates[newType.trim()] ?? [])
              setNewType('')
            }}
          >
            <Plus className="size-4" />
            種類を追加
          </Button>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {projectTypes.map((t) => (
            <TemplateTypeCard
              key={t}
              type={t}
              tasks={projectTemplates[t] ?? []}
              onChange={(tasks) => setProjectTemplateTasks(t, tasks)}
              onRemoveType={() => removeProjectType(t)}
            />
          ))}
          {projectTypes.length === 0 && (
            <p className="text-sm text-muted-foreground">まだ種類が登録されていません。</p>
          )}
        </div>
      </div>
      )}
    </div>
  )
}

function TemplateTypeCard({
  type,
  tasks,
  onChange,
  onRemoveType,
}: {
  type: string
  tasks: ProjectTemplateTask[]
  onChange: (tasks: ProjectTemplateTask[]) => void
  onRemoveType: () => void
}) {
  const [draft, setDraft] = useState({
    name: '',
    department: DEPARTMENTS[0] as Department,
    category: '',
    skills: '',
    difficulty: DIFFICULTY_LABEL[0] as Difficulty,
    priority: '中' as Priority,
  })

  const addTask = () => {
    if (!draft.name.trim()) return
    const newTask: ProjectTemplateTask = {
      id: `tpl-${Math.random().toString(36).slice(2, 9)}`,
      name: draft.name.trim(),
      department: draft.department,
      category: draft.category.trim(),
      skills: draft.skills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      difficulty: draft.difficulty,
      priority: draft.priority,
    }
    onChange([...tasks, newTask])
    setDraft({ ...draft, name: '', category: '', skills: '' })
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <SectionLabel>{type}</SectionLabel>
        <button
          onClick={onRemoveType}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
          種類を削除
        </button>
      </div>

      <ul className="mt-3 flex flex-col gap-1.5">
        {tasks.map((t) => (
          <li
            key={t.id}
            className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-secondary/40 px-3 py-1.5 text-sm"
          >
            <div className="min-w-0 flex-1">
              <span className="font-medium">{t.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {t.department} ・ {t.category} ・ {t.difficulty} ・ 優先度{t.priority}
              </span>
            </div>
            <button
              onClick={() => onChange(tasks.filter((x) => x.id !== t.id))}
              className="shrink-0 text-muted-foreground hover:text-destructive"
              aria-label="削除"
            >
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
        {tasks.length === 0 && (
          <li className="text-xs text-muted-foreground">まだテンプレートタスクがありません。</li>
        )}
      </ul>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6">
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="タスク名"
          className="col-span-2 h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary sm:col-span-2"
        />
        <select
          value={draft.department}
          onChange={(e) => setDraft({ ...draft, department: e.target.value as Department })}
          className="h-8 cursor-pointer rounded-md border border-border bg-background px-1 text-xs outline-none"
        >
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <input
          value={draft.category}
          onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          placeholder="カテゴリ"
          className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
        />
        <select
          value={draft.difficulty}
          onChange={(e) => setDraft({ ...draft, difficulty: e.target.value as Difficulty })}
          className="h-8 cursor-pointer rounded-md border border-border bg-background px-1 text-xs outline-none"
        >
          {DIFFICULTY_LABEL.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          value={draft.priority}
          onChange={(e) => setDraft({ ...draft, priority: e.target.value as Priority })}
          className="h-8 cursor-pointer rounded-md border border-border bg-background px-1 text-xs outline-none"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              優先度{p}
            </option>
          ))}
        </select>
        <input
          value={draft.skills}
          onChange={(e) => setDraft({ ...draft, skills: e.target.value })}
          placeholder="要求スキル（カンマ区切り）"
          className="col-span-2 h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary sm:col-span-3"
        />
        <Button
          variant="outline"
          className="col-span-2 h-8 text-xs sm:col-span-3"
          disabled={!draft.name.trim()}
          onClick={addTask}
        >
          <Plus className="size-3.5" />
          テンプレートタスクを追加
        </Button>
      </div>
    </div>
  )
}
