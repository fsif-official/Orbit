export type TaskStatus = 'todo' | 'progress' | 'review' | 'fix' | 'done'

export type Difficulty = '新人歓迎' | '少し経験必要' | '経験者向け'

export type Role = 'member' | 'admin'

export type Priority = '高' | '中' | '低'

export const PRIORITIES: Priority[] = ['高', '中', '低']

export const DEPARTMENTS = [
  '運営',
  '広報',
  '開発',
  'デザイン',
  '渉外',
  'イベント',
  'リサーチ',
  '未分類',
] as const

export type Department = (typeof DEPARTMENTS)[number]

export interface ProgressEntry {
  id: string
  text: string
  at: string // ISO datetime
  byId: string
}

// A single natural-language input, before it is split into tasks
export interface TaskInput {
  id: string
  text: string
  createdById: string
  createdAt: string // ISO datetime
  generatedTaskIds: string[]
}

export interface Member {
  id: string
  name: string
  affiliation: string
  role: Role
  avatarColor: string
  initials: string
  will: string[]
  judgment: string[]
  facts: { label: string; count: number }[]
  skills: string[]
  email?: string
  // whether this member should receive an email when a new task is
  // registered and needs approval — see store.tsx's notifyRecipients
  notify?: boolean
}

export interface Project {
  id: string
  name: string
  description: string
  // project "kind" (e.g. コンテンツ開発) — drives which template tasks get
  // auto-created for it, see store.tsx's projectTemplates
  type?: string
}

// A template task an admin defines for a Project type (store.tsx's
// projectTemplates), auto-created whenever a new project of that type
// is added.
export interface ProjectTemplateTask {
  id: string
  name: string
  department: Department
  category: string
  skills: string[]
  difficulty: Difficulty
  priority: Priority
}

export interface Task {
  id: string
  name: string
  description?: string
  projectId: string
  department: Department
  assigneeIds: string[]
  deadline: string | null // YYYY-MM-DD
  dueTime?: string | null // HH:MM, optional time-of-day on top of deadline
  category: string
  skills: string[]
  difficulty: Difficulty
  priority: Priority
  status: TaskStatus
  role?: string
  completedDate?: string | null
  lastActivity?: string // YYYY-MM-DD, for "no progress" detection
  // provenance
  originalInputId?: string
  createdById?: string
  createdAt?: string // ISO datetime
  // progress tracking
  progress?: string // latest progress snapshot
  progressHistory: ProgressEntry[]
  // tasks created from an INPUT submission start out awaiting an admin's
  // approval, and are hidden from the normal workspace views until then
  pendingApproval?: boolean
}

// Result of natural-language parsing, before approval
export interface ParsedTask {
  id: string
  name: string
  projectId: string
  department: Department
  deadline: string | null
  dueTime?: string | null
  category: string
  skills: string[]
  difficulty: Difficulty
  priority: Priority
  assigneeIds: string[]
  approved: boolean
}

export const STATUS_ORDER: TaskStatus[] = [
  'todo',
  'progress',
  'review',
  'fix',
  'done',
]

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: '未着手',
  progress: '進行中',
  review: '確認待ち',
  fix: '修正中',
  done: '完了',
}

export const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: 'var(--status-todo)',
  progress: 'var(--status-progress)',
  review: 'var(--status-review)',
  fix: 'var(--status-fix)',
  done: 'var(--status-done)',
}

export const DIFFICULTY_LABEL: Difficulty[] = [
  '新人歓迎',
  '少し経験必要',
  '経験者向け',
]

// Priority accent line color (used on card left edge). Uses CSS vars so it
// adapts to dark mode.
export const PRIORITY_LINE: Record<Priority, string> = {
  高: 'var(--priority-high)',
  中: 'var(--priority-medium)',
  低: 'var(--priority-low)',
}
