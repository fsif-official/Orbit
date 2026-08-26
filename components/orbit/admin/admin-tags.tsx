'use client'

import { useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { Tag, SectionLabel } from '@/components/orbit/primitives'
import { ADMIN_SECTIONS, DEFAULT_NON_TOP_SECTIONS } from '@/lib/orbit/types'
import type { AdminSection } from '@/lib/orbit/types'
import { Plus, Check } from 'lucide-react'

// dashboard always stays visible (it's the redirect target for a
// disallowed section — see store.tsx's visibleAdminSections), so there's
// nothing useful to toggle for it
const TOGGLEABLE_SECTIONS = ADMIN_SECTIONS.filter((s) => s.key !== 'dashboard')

export function AdminTags() {
  const {
    skillOptions,
    categoryOptions,
    addSkillOption,
    removeSkillOption,
    addCategoryOption,
    removeCategoryOption,
    roleLevels,
    addRoleLevel,
    removeRoleLevel,
    rolePermissions,
    setRolePermissions,
  } = useOrbit()
  // the top (last) role level always has full access — nothing to configure
  const nonTopLevels = roleLevels.slice(0, -1)

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Tags</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        INPUT画面の「要求スキル」「カテゴリ」や、Membersの「役職」で選べる選択肢です。ここで消すまで残り続けます。
      </p>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <TagGroup
          title="要求スキル"
          options={skillOptions}
          onAdd={addSkillOption}
          onRemove={removeSkillOption}
        />
        <TagGroup
          title="カテゴリ"
          options={categoryOptions}
          onAdd={addCategoryOption}
          onRemove={removeCategoryOption}
        />
        <div>
          <TagGroup
            title="権限レベル（一般より上）"
            options={roleLevels}
            onAdd={addRoleLevel}
            onRemove={removeRoleLevel}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            すべてのメンバーの初期値は「一般」です。ここで追加したレベルはAdmin →
            Membersの役職選択に使え、レベルを削除するとそれを持っていたメンバーは
            自動的に「一般」に戻ります。「一般」以外のレベルはすべて管理者画面へのアクセス権を持ちます。
          </p>
        </div>
      </div>

      {nonTopLevels.length > 0 && (
        <div className="mt-6 rounded-lg border border-border bg-card p-4">
          <SectionLabel>権限レベルごとの表示範囲</SectionLabel>
          <p className="mt-1 text-xs text-muted-foreground">
            最上位のレベル（{roleLevels[roleLevels.length - 1]}）は常にすべてのセクションにアクセスできます。
            それ以外のレベルは、管理者画面でどのセクションを見せるか個別に選べます。未設定の場合は
            Members・Tags以外の全セクションが既定で表示されます。
          </p>
          <div className="mt-4 flex flex-col gap-4">
            {nonTopLevels.map((role) => (
              <RolePermissionRow
                key={role}
                role={role}
                sections={rolePermissions[role] ?? DEFAULT_NON_TOP_SECTIONS}
                onChange={(next) => setRolePermissions(role, next)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function RolePermissionRow({
  role,
  sections,
  onChange,
}: {
  role: string
  sections: AdminSection[]
  onChange: (next: AdminSection[]) => void
}) {
  const toggle = (key: AdminSection) => {
    onChange(sections.includes(key) ? sections.filter((s) => s !== key) : [...sections, key])
  }
  return (
    <div>
      <div className="text-sm font-medium">{role}</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {TOGGLEABLE_SECTIONS.map((s) => {
          const checked = sections.includes(s.key)
          return (
            <button
              key={s.key}
              onClick={() => toggle(s.key)}
              className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                checked
                  ? 'border-primary/30 bg-primary-muted text-accent-foreground'
                  : 'border-border text-muted-foreground hover:bg-secondary'
              }`}
            >
              {checked && <Check className="size-3" strokeWidth={3} />}
              {s.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TagGroup({
  title,
  options,
  onAdd,
  onRemove,
}: {
  title: string
  options: string[]
  onAdd: (name: string) => void
  onRemove: (name: string) => void
}) {
  const [draft, setDraft] = useState('')

  const submit = () => {
    const v = draft.trim()
    if (v) onAdd(v)
    setDraft('')
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <SectionLabel>{title}</SectionLabel>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {options.length === 0 && (
          <span className="text-sm text-muted-foreground">選択肢がありません</span>
        )}
        {options.map((o) => (
          <Tag key={o} onRemove={() => onRemove(o)}>
            {o}
          </Tag>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="新しい選択肢を追加"
          className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
        />
        <button
          onClick={submit}
          disabled={!draft.trim()}
          className="flex size-8 shrink-0 items-center justify-center rounded-md border border-dashed border-border-strong text-muted-foreground hover:bg-secondary disabled:opacity-40"
          aria-label="追加"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  )
}
