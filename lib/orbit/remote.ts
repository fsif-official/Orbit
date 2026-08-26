// Wires the app to the real "database": three Google Sheets tabs
// (Members / Projects / Tasks) published as CSV for reads, and a Google
// Apps Script Web App for writes. See gas/README.md for the sheet schema
// and deployment steps. All of this is optional — when the env vars below
// aren't set (e.g. local dev), the app falls back to the local seed data
// exactly as before.
import type {
  Department,
  Difficulty,
  Member,
  ParsedTask,
  Priority,
  Project,
  Role,
  Task,
  TaskStatus,
} from './types'
import { STATUS_LABEL } from './types'

// NEXT_PUBLIC_ vars are inlined at build time by Next.js. They must be
// referenced by their literal full name (not a dynamic key) to be inlined.
const MEMBERS_CSV_URL = process.env.NEXT_PUBLIC_MEMBERS_CSV
const PROJECTS_CSV_URL = process.env.NEXT_PUBLIC_PROJECTS_CSV
const TASKS_CSV_URL = process.env.NEXT_PUBLIC_TASKS_CSV
const GAS_URL = process.env.NEXT_PUBLIC_GAS_URL

export const isRemoteConfigured = !!(
  MEMBERS_CSV_URL &&
  PROJECTS_CSV_URL &&
  TASKS_CSV_URL &&
  GAS_URL
)

// ---- CSV parsing ------------------------------------------------------

// Small state-machine CSV parser (handles quoted fields, embedded commas /
// newlines, and doubled "" quote escaping) — Google Sheets' published CSV
// output needs this; a naive split(',') breaks on any quoted field.
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (c === '\r') {
      // skip; \r\n handled by the following \n
    } else {
      field += c
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

// Parses CSV text into an array of header-keyed row objects.
function parseCsvAsRecords(text: string): Record<string, string>[] {
  const rows = parseCsv(text)
  if (rows.length === 0) return []
  const headers = rows[0].map((h) => h.trim())
  return rows.slice(1).map((r) => {
    const rec: Record<string, string> = {}
    headers.forEach((h, i) => {
      rec[h] = (r[i] ?? '').trim()
    })
    return rec
  })
}

async function fetchCsvRecords(url: string): Promise<Record<string, string>[]> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`CSV fetch failed (${res.status}): ${url}`)
  const text = await res.text()
  return parseCsvAsRecords(text)
}

function splitTags(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

// ---- domain mapping -----------------------------------------------------
// Sheet columns follow the alpha design doc's Members/Projects/Tasks
// schema. A handful of extra columns beyond the doc (department, category,
// skills, difficulty, priority, completed_date, last_activity,
// progress_note, original_input_id) carry the richer fields this UI grew
// during the mock phase — see gas/README.md for the full column list.

const AVATAR_PALETTE = ['#6366f1', '#db2777', '#059669', '#d97706', '#0ea5e9', '#8b5cf6', '#e11d48', '#0891b2']

function colorForId(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}

function initialsForName(name: string): string {
  const cleaned = name.replace(/^（例）/, '').trim()
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return cleaned.slice(0, 2).toUpperCase()
}

// 代表・班長 both map to the app's 'admin' role. Full project-scoped 班長
// permissions (design doc §3) aren't implemented yet — a 班長 currently
// gets full admin access, not just their own project_ids.
function roleFromSheet(role: string): Role {
  return role === '一般' ? 'member' : 'admin'
}

function mapMemberRow(r: Record<string, string>, projectsById: Map<string, Project>): Member {
  const projectIds = splitTags(r.project_ids)
  const will = splitTags(r.will_tags)
  const judgment = splitTags(r.judgment_tags)
  const affiliation =
    projectIds.length > 0
      ? projectIds.map((pid) => projectsById.get(pid)?.name ?? pid).join(' / ')
      : r.role === '代表'
        ? '運営'
        : ''
  return {
    id: r.id,
    name: r.name,
    affiliation,
    role: roleFromSheet(r.role),
    avatarColor: colorForId(r.id),
    initials: initialsForName(r.name),
    // Fact (past-performance) matching is explicitly out of scope for the
    // alpha (cold start, no history yet) — always empty.
    facts: [],
    will,
    judgment,
    // Talent matching (design doc §7) scores on will+judgment tags; skills
    // is derived from the same two so the existing matching UI keeps working.
    skills: [...will, ...judgment],
    email: r.email || undefined,
    notify: /^(true|1|yes)$/i.test((r.notify_new_task || '').trim()),
  }
}

function mapProjectRow(r: Record<string, string>): Project {
  return { id: r.id, name: r.name, description: r.description ?? '' }
}

const STATUS_FROM_LABEL: Record<string, TaskStatus> = Object.fromEntries(
  (Object.entries(STATUS_LABEL) as [TaskStatus, string][]).map(([k, v]) => [v, k]),
)

function statusFromSheet(status: string): TaskStatus {
  // "サポート必要" (support-needed) exists in the design doc's status list
  // but isn't one of this UI's five kanban columns — fold it into progress.
  return STATUS_FROM_LABEL[status] ?? 'progress'
}

function mapTaskRow(r: Record<string, string>): Task {
  return {
    id: r.id,
    name: r.title,
    description: r.description ?? '',
    projectId: r.project_id,
    department: (r.department || '未分類') as Department,
    assigneeId: r.assignee_id || null,
    deadline: r.due_date || null,
    category: r.category || '',
    skills: splitTags(r.skills),
    difficulty: (r.difficulty || '新人歓迎') as Difficulty,
    priority: (r.priority || '中') as Priority,
    status: statusFromSheet(r.status),
    completedDate: r.completed_date || null,
    lastActivity: r.last_activity || r.created_at || undefined,
    originalInputId: r.original_input_id || undefined,
    createdById: r.creator_id || undefined,
    createdAt: r.created_at || undefined,
    progress: r.progress_note || undefined,
    progressHistory: [],
    pendingApproval: r.approval_status === '承認待ち',
  }
}

export interface RemoteData {
  members: Member[]
  projects: Project[]
  tasks: Task[]
}

export async function fetchRemoteData(): Promise<RemoteData> {
  if (!MEMBERS_CSV_URL || !PROJECTS_CSV_URL || !TASKS_CSV_URL) {
    throw new Error('Remote CSV URLs are not configured')
  }
  const [memberRows, projectRows, taskRows] = await Promise.all([
    fetchCsvRecords(MEMBERS_CSV_URL),
    fetchCsvRecords(PROJECTS_CSV_URL),
    fetchCsvRecords(TASKS_CSV_URL),
  ])
  const projects = projectRows.map(mapProjectRow)
  const projectsById = new Map(projects.map((p) => [p.id, p]))
  const members = memberRows.map((r) => mapMemberRow(r, projectsById))
  const tasks = taskRows.map(mapTaskRow)
  return { members, projects, tasks }
}

// ---- writes (Google Apps Script Web App) ---------------------------------

export interface CreateTaskPayload {
  tempId: string
  title: string
  description?: string
  projectId: string
  department: string
  category: string
  skills: string[]
  difficulty: Difficulty
  priority: Priority
  deadline: string | null
  creatorId?: string
  originalInputId?: string
  pendingApproval?: boolean
}

async function postToGas<T = unknown>(action: string, payload: Record<string, unknown>): Promise<T> {
  if (!GAS_URL) throw new Error('GAS Web App URL is not configured')
  const res = await fetch(GAS_URL, {
    method: 'POST',
    // text/plain avoids a CORS preflight (Apps Script doesn't handle
    // OPTIONS); the body is still JSON, parsed server-side with JSON.parse.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload }),
  })
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || `GAS action "${action}" failed`)
  return json.result as T
}

export const remoteApi = {
  createTasks: (tasks: CreateTaskPayload[]) =>
    postToGas<{ tempId: string; id: string }[]>('createTasks', { tasks }),
  updateTaskStatus: (taskId: string, status: TaskStatus) =>
    postToGas('updateTaskStatus', { taskId, status: STATUS_LABEL[status] }),
  assignTask: (taskId: string, assigneeId: string | null) =>
    postToGas('assignTask', { taskId, assigneeId }),
  updatePriority: (taskId: string, priority: Priority) =>
    postToGas('updatePriority', { taskId, priority }),
  updateProgress: (taskId: string, text: string) =>
    postToGas('updateProgress', { taskId, text }),
  updateWill: (memberId: string, will: string[]) => postToGas('updateWill', { memberId, will }),
  updateJudgment: (memberId: string, judgment: string[]) =>
    postToGas('updateJudgment', { memberId, judgment }),
  approveTask: (taskId: string) => postToGas('approveTask', { taskId }),
  createProject: (name: string, description: string) =>
    postToGas<{ id: string }>('createProject', { name, description }),
  removeMember: (memberId: string) => postToGas('removeMember', { memberId }),
  updateNotify: (memberId: string, notify: boolean) =>
    postToGas('updateNotify', { memberId, notify }),
}

// re-exported for the parser fallback in input-screen.tsx, which needs to
// turn ParsedTask rows into CreateTaskPayload rows.
export function toCreatePayload(tempId: string, p: ParsedTask, creatorId?: string, originalInputId?: string): CreateTaskPayload {
  return {
    tempId,
    title: p.name,
    projectId: p.projectId,
    department: p.department,
    category: p.category,
    skills: p.skills,
    difficulty: p.difficulty,
    priority: p.priority,
    deadline: p.deadline,
    creatorId,
    originalInputId,
    pendingApproval: true,
  }
}
