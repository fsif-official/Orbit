import type { Member, Task } from './types'

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export function formatDeadline(d: string | null): string {
  if (!d) return '未設定'
  const [y, m, day] = d.split('-')
  return `${Number(m)}/${Number(day)}`
}

export function formatDeadlineFull(d: string | null): string {
  if (!d) return '未設定'
  const [y, m, day] = d.split('-')
  return `${y}/${m}/${day}`
}

export function isOverdue(task: Task): boolean {
  if (!task.deadline) return false
  if (task.status === 'done') return false
  return task.deadline < todayStr()
}

export type DeadlineLevel = 'overdue' | 'today' | 'soon' | 'near' | 'none'

// Classify how close a task's deadline is, for color-coded warnings.
export function deadlineLevel(task: Task): {
  level: DeadlineLevel
  label: string
  days: number | null
} {
  if (!task.deadline || task.status === 'done')
    return { level: 'none', label: '', days: null }
  const today = new Date(todayStr()).getTime()
  const due = new Date(task.deadline).getTime()
  const days = Math.round((due - today) / (1000 * 60 * 60 * 24))
  if (days < 0) return { level: 'overdue', label: '期限超過', days }
  if (days === 0) return { level: 'today', label: '本日期限', days }
  if (days <= 1) return { level: 'soon', label: '期限まで1日', days }
  if (days <= 3) return { level: 'near', label: `期限まで${days}日`, days }
  return { level: 'none', label: '', days }
}

export function formatDateTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const m = d.getMonth() + 1
  const day = d.getDate()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${m}/${day} ${hh}:${mm}`
}

export function daysSince(d?: string): number | null {
  if (!d) return null
  const then = new Date(d).getTime()
  const now = new Date(todayStr()).getTime()
  return Math.round((now - then) / (1000 * 60 * 60 * 24))
}

// Simple explainable skill matching — count of overlapping skills. Accepts
// any task-shaped object with a skills list, so this also works for a
// ParsedTask (pre-creation, in the INPUT screen) as well as a saved Task.
export function matchSkills(task: { skills: string[] }, member: Member): string[] {
  return task.skills.filter((s) => member.skills.includes(s))
}

export interface SkillFieldProgress {
  field: string
  held: string[]
  total: string[]
  ratio: number
  acquired: boolean
}

// 要求分野 — a field (デザイン/営業/AI活用...) is never assigned to a member
// directly; it's derived from how much of the field's constituent 要求スキル
// the member already holds. A field with no skills configured yet can't be
// acquired (ratio would be a meaningless 0/0).
export function memberSkillFieldProgress(
  memberSkills: string[],
  skillFieldSkills: Record<string, string[]>,
  threshold: number,
): SkillFieldProgress[] {
  return Object.entries(skillFieldSkills).map(([field, total]) => {
    const held = total.filter((s) => memberSkills.includes(s))
    const ratio = total.length > 0 ? held.length / total.length : 0
    return { field, held, total, ratio, acquired: total.length > 0 && ratio >= threshold }
  })
}

export function memberAcquiredFields(
  memberSkills: string[],
  skillFieldSkills: Record<string, string[]>,
  threshold: number,
): string[] {
  return memberSkillFieldProgress(memberSkills, skillFieldSkills, threshold)
    .filter((p) => p.acquired)
    .map((p) => p.field)
}

// crude tokenizer for Japanese/English mixed task names — splits on
// whitespace and common punctuation, drops very short tokens
function tokenize(name: string): Set<string> {
  return new Set(
    name
      .split(/[\s、。・,.\-()（）「」/]+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2),
  )
}

// Finds existing tasks that look like they might duplicate a newly-parsed
// one — same category and enough name-token overlap. Used at approval time
// to flag "this might already be covered" before an admin approves.
export function findSimilarTasks(
  candidate: { id?: string; name: string; category: string; projectId: string },
  existing: Task[],
  minScore = 0.4,
): { task: Task; score: number }[] {
  const candTokens = tokenize(candidate.name)
  if (candTokens.size === 0) return []
  return existing
    .filter((t) => t.id !== candidate.id)
    .map((t) => {
      const tTokens = tokenize(t.name)
      const overlap = [...candTokens].filter((w) => tTokens.has(w)).length
      const union = new Set([...candTokens, ...tTokens]).size
      let score = union > 0 ? overlap / union : 0
      if (t.category && t.category === candidate.category) score += 0.15
      if (t.projectId === candidate.projectId) score += 0.1
      return { task: t, score }
    })
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
}

export function rankCandidates(
  task: { skills: string[]; assigneeIds?: string[] },
  members: Member[],
): { member: Member; matches: string[] }[] {
  return members
    .filter((m) => !task.assigneeIds?.includes(m.id))
    .map((m) => ({ member: m, matches: matchSkills(task, m) }))
    .filter((c) => c.matches.length > 0)
    .sort((a, b) => b.matches.length - a.matches.length)
}

// Builds a Google Calendar "quick add" URL pre-filled with a task's title,
// date/time, and details, for a personal "add to my calendar" button
// (task-detail-drawer.tsx) — anyone can click it to drop the task into
// their own Google Calendar. This is separate from gas/Code.gs's
// admin-side sync, which creates the event server-side and invites
// assignees; this one needs no backend at all. Returns null when the task
// has no deadline (nothing to add).
export function googleCalendarUrl(
  task: {
    name: string
    startDate?: string | null
    deadline: string | null
    dueTime?: string | null
    description?: string
  },
  extra: { projectName?: string; department?: string; category?: string } = {},
): string | null {
  if (!task.deadline) return null

  const compact = (d: string) => d.replace(/-/g, '')
  const addDays = (d: string, days: number) => {
    const dt = new Date(`${d}T00:00:00Z`)
    dt.setUTCDate(dt.getUTCDate() + days)
    return dt.toISOString().slice(0, 10)
  }
  const pad2 = (n: number) => String(n).padStart(2, '0')

  let dates: string
  if (task.dueTime) {
    // 1-hour timed event, matching gas/Code.gs's sync convention
    const [h, m] = task.dueTime.split(':').map(Number)
    const endTotal = h * 60 + m + 60
    const endDate = endTotal >= 1440 ? addDays(task.deadline, 1) : task.deadline
    const endMinutes = endTotal % 1440
    const start = `${compact(task.deadline)}T${pad2(h)}${pad2(m)}00`
    const end = `${compact(endDate)}T${pad2(Math.floor(endMinutes / 60))}${pad2(endMinutes % 60)}00`
    dates = `${start}/${end}`
  } else {
    const start =
      task.startDate && task.startDate < task.deadline ? task.startDate : task.deadline
    // Google's all-day range end is exclusive, so add one day
    dates = `${compact(start)}/${compact(addDays(task.deadline, 1))}`
  }

  const details = [
    extra.projectName && `プロジェクト: ${extra.projectName}`,
    extra.department && `部門: ${extra.department}`,
    extra.category && `カテゴリ: ${extra.category}`,
    task.description,
    'Orbitから追加',
  ]
    .filter(Boolean)
    .join('\n')

  const params = new URLSearchParams({ action: 'TEMPLATE', text: task.name, dates, details })
  if (task.dueTime) params.set('ctz', 'Asia/Tokyo')

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
