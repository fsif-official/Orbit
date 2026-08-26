'use client'

import { useState } from 'react'
import type { ParsedTask } from '@/lib/orbit/types'
import { DIFFICULTY_LABEL } from '@/lib/orbit/types'
import { useOrbit } from '@/lib/orbit/store'
import { Card, DifficultyBadge, Tag, Avatar } from '../primitives'
import { cn } from '@/lib/utils'
import { rankCandidates } from '@/lib/orbit/utils'
import { Check, Plus, Sparkles, X } from 'lucide-react'

export function ParsedTaskCard({
  task,
  onChange,
  onToggle,
}: {
  task: ParsedTask
  onChange: (t: ParsedTask) => void
  onToggle: () => void
}) {
  const { projects, members } = useOrbit()
  const [skillDraft, setSkillDraft] = useState('')
  const candidates = rankCandidates(task, members).slice(0, 3)

  const set = <K extends keyof ParsedTask>(key: K, value: ParsedTask[K]) =>
    onChange({ ...task, [key]: value })

  const addSkill = () => {
    const v = skillDraft.trim()
    if (v && !task.skills.includes(v)) set('skills', [...task.skills, v])
    setSkillDraft('')
  }

  return (
    <Card
      className={cn(
        'overflow-hidden transition-opacity',
        !task.approved && 'opacity-55',
      )}
    >
      <div className="flex items-start gap-3 border-b border-border px-4 py-3">
        <input
          value={task.name}
          onChange={(e) => set('name', e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-[15px] font-medium outline-none placeholder:text-muted-foreground focus:underline focus:decoration-border-strong focus:underline-offset-4"
          aria-label="タスク名"
        />
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-md border transition-colors',
            task.approved
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border-strong bg-card text-transparent hover:border-primary',
          )}
          aria-label={task.approved ? '非承認にする' : '承認する'}
          aria-pressed={task.approved}
        >
          <Check className="size-4" strokeWidth={3} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3.5 sm:grid-cols-4">
        <Field label="プロジェクト">
          <select
            value={task.projectId}
            onChange={(e) => set('projectId', e.target.value)}
            className="w-full cursor-pointer rounded-md border border-transparent bg-transparent py-0.5 text-sm outline-none hover:border-border focus:border-border-strong"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="期限">
          <input
            type="date"
            value={task.deadline ?? ''}
            onChange={(e) => set('deadline', e.target.value || null)}
            className="w-full rounded-md border border-transparent bg-transparent py-0.5 text-sm outline-none hover:border-border focus:border-border-strong"
          />
        </Field>

        <Field label="カテゴリ">
          <input
            value={task.category}
            onChange={(e) => set('category', e.target.value)}
            className="w-full rounded-md border border-transparent bg-transparent py-0.5 text-sm outline-none hover:border-border focus:border-border-strong"
          />
        </Field>

        <Field label="難易度">
          <select
            value={task.difficulty}
            onChange={(e) => set('difficulty', e.target.value as ParsedTask['difficulty'])}
            className="w-full cursor-pointer rounded-md border border-transparent bg-transparent py-0.5 text-sm outline-none hover:border-border focus:border-border-strong"
          >
            {DIFFICULTY_LABEL.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>

        <Field label="必要スキル" className="col-span-2 sm:col-span-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {task.skills.map((s) => (
              <Tag
                key={s}
                onRemove={() =>
                  set(
                    'skills',
                    task.skills.filter((x) => x !== s),
                  )
                }
              >
                {s}
              </Tag>
            ))}
            <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-border-strong px-1.5 py-0.5">
              <input
                value={skillDraft}
                onChange={(e) => setSkillDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing || e.keyCode === 229) return
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addSkill()
                  }
                }}
                placeholder="追加"
                className="w-14 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground"
                aria-label="スキルを追加"
              />
              <button
                type="button"
                onClick={addSkill}
                className="text-muted-foreground hover:text-foreground"
                aria-label="スキルを追加"
              >
                <Plus className="size-3" />
              </button>
            </span>
          </div>
        </Field>

        {candidates.length > 0 && (
          <Field label="おすすめ担当" className="col-span-2 sm:col-span-4">
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles className="size-3.5 shrink-0 text-primary" />
              {candidates.map(({ member, matches }) => (
                <span
                  key={member.id}
                  title={`一致: ${matches.join('、')}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-primary/25 bg-primary/5 px-1.5 py-0.5 text-xs font-medium text-foreground"
                >
                  <Avatar member={member} size={18} />
                  {member.name}
                  <span className="text-[10px] font-normal text-muted-foreground">
                    {matches.length}件一致
                  </span>
                </span>
              ))}
            </div>
          </Field>
        )}
      </div>
    </Card>
  )
}

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <div className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  )
}
