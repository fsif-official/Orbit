import * as XLSX from 'xlsx'
import type { Department, Difficulty, Member, ParsedTask, Priority, Project } from './types'
import { DEPARTMENTS, DIFFICULTY_LABEL, PRIORITIES } from './types'

// ExcelファイルはOrbitが出力した形式とは限らず、列の並びや型は保証されない
// （日付がテキストだったりExcelの日付型だったり、列自体が無かったりする）。
// なので位置ではなく「ヘッダー文字列に何が書いてあるか」で列の意味を判断する。
const HEADER_ALIASES: Record<string, string[]> = {
  name: ['タスク名', 'タスク', '件名', '名前', 'title', 'name', 'task'],
  project: ['プロジェクト', 'project'],
  department: ['部門', '部署', 'department'],
  assignee: ['担当', '担当者', 'アサイン', 'assignee', 'assignees'],
  priority: ['優先度', 'priority'],
  difficulty: ['難易度', 'difficulty'],
  category: ['カテゴリ', 'category', '分類'],
  skills: ['必要スキル', '要求スキル', 'スキル', 'skills'],
  startDate: ['開始日', 'startdate', 'start'],
  deadline: ['期限', '締切', '締め切り', 'deadline', 'due'],
}

function normalizeHeader(h: string): string {
  return String(h).trim().toLowerCase()
}

// ヘッダー行から「どの列がどの意味か」を1回だけ判定しておく
function detectColumns(headers: string[]): Partial<Record<keyof typeof HEADER_ALIASES, string>> {
  const result: Partial<Record<keyof typeof HEADER_ALIASES, string>> = {}
  for (const header of headers) {
    const normalized = normalizeHeader(header)
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (result[field as keyof typeof HEADER_ALIASES]) continue
      if (aliases.some((a) => normalizeHeader(a) === normalized)) {
        result[field as keyof typeof HEADER_ALIASES] = header
      }
    }
  }
  return result
}

function splitList(value: unknown): string[] {
  if (value == null) return []
  return String(value)
    .split(/[、,,・\/\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function toDateString(value: unknown): string | null {
  if (value == null || value === '') return null
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const str = String(value).trim()
  if (!str) return null
  // YYYY-MM-DD / YYYY/MM/DD
  let m = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  // M/D or M月D日 — 年が無ければ今年として扱う
  m = str.match(/^(\d{1,2})[/月](\d{1,2})日?/)
  if (m) {
    const year = new Date().getFullYear()
    return `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  }
  return null
}

function matchProject(value: unknown, projects: Project[]): string {
  const str = value == null ? '' : String(value).trim()
  if (str) {
    const found = projects.find((p) => p.name.trim() === str)
    if (found) return found.id
  }
  return projects[0]?.id ?? ''
}

function matchDepartment(value: unknown): Department {
  const str = value == null ? '' : String(value).trim()
  const found = DEPARTMENTS.find((d) => d === str)
  return (found ?? '未分類') as Department
}

function matchPriority(value: unknown): Priority {
  const str = value == null ? '' : String(value).trim()
  const found = PRIORITIES.find((p) => p === str)
  return found ?? '中'
}

function matchDifficulty(value: unknown): Difficulty {
  const str = value == null ? '' : String(value).trim()
  const found = DIFFICULTY_LABEL.find((d) => d === str)
  return found ?? '新人歓迎'
}

function matchAssignees(value: unknown, members: Member[]): string[] {
  const tokens = splitList(value)
  const ids: string[] = []
  for (const token of tokens) {
    const found = members.find(
      (m) => (m.displayName && m.displayName.trim() === token) || m.name.trim() === token,
    )
    if (found && !ids.includes(found.id)) ids.push(found.id)
  }
  return ids
}

export interface ExcelImportResult {
  parsed: ParsedTask[]
  // ヘッダーからタスク名列が判別できなかった行や、値が空だった行の数
  skippedRows: number
  // 「タスク名」列そのものが見つからなかった場合はエラー扱い
  error?: string
}

export async function parseTasksFromExcelFile(
  file: File,
  projects: Project[],
  members: Member[],
): Promise<ExcelImportResult> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  if (wb.SheetNames.length === 0) {
    return { parsed: [], skippedRows: 0, error: 'シートが見つかりませんでした' }
  }
  // Orbitの「全データエクスポート」由来のファイルなら「タスク」シートを優先する
  const sheetName = wb.SheetNames.includes('タスク') ? 'タスク' : wb.SheetNames[0]
  const sheet = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  if (rows.length === 0) {
    return { parsed: [], skippedRows: 0, error: 'データ行が見つかりませんでした' }
  }

  const headers = Object.keys(rows[0])
  const columns = detectColumns(headers)
  if (!columns.name) {
    return {
      parsed: [],
      skippedRows: 0,
      error:
        '「タスク名」の列が見つかりませんでした。ヘッダー行に「タスク名」などの列名を入れてください',
    }
  }

  let skippedRows = 0
  const parsed: ParsedTask[] = []
  for (const row of rows) {
    const nameValue = row[columns.name]
    const name = nameValue == null ? '' : String(nameValue).trim()
    if (!name) {
      skippedRows++
      continue
    }
    parsed.push({
      id: `parsed-${Math.random().toString(36).slice(2, 9)}`,
      name,
      projectId: columns.project ? matchProject(row[columns.project], projects) : (projects[0]?.id ?? ''),
      department: columns.department ? matchDepartment(row[columns.department]) : '未分類',
      startDate: columns.startDate ? toDateString(row[columns.startDate]) : null,
      deadline: columns.deadline ? toDateString(row[columns.deadline]) : null,
      category: columns.category ? String(row[columns.category] ?? '').trim() || '未分類' : '未分類',
      skills: columns.skills ? splitList(row[columns.skills]) : [],
      difficulty: columns.difficulty ? matchDifficulty(row[columns.difficulty]) : '新人歓迎',
      priority: columns.priority ? matchPriority(row[columns.priority]) : '中',
      assigneeIds: columns.assignee ? matchAssignees(row[columns.assignee], members) : [],
      approved: true,
    })
  }

  return { parsed, skippedRows }
}
