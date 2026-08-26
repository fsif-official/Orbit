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

// Simple explainable skill matching — count of overlapping skills.
export function matchSkills(task: Task, member: Member): string[] {
  return task.skills.filter((s) => member.skills.includes(s))
}

export function rankCandidates(
  task: Task,
  members: Member[],
): { member: Member; matches: string[] }[] {
  return members
    .filter((m) => m.id !== task.assigneeId)
    .map((m) => ({ member: m, matches: matchSkills(task, m) }))
    .filter((c) => c.matches.length > 0)
    .sort((a, b) => b.matches.length - a.matches.length)
}
