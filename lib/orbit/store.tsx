'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from 'react'
import type {
  AdminSection,
  CareerHistoryEntry,
  Competency,
  DevelopmentPlanEntry,
  EvaluationRecord,
  Member,
  OneOnOneRecord,
  Project,
  ProjectTemplateTask,
  RecurringTaskRule,
  Qualification,
  Role,
  SkillLevel,
  Task,
  TaskComment,
  TaskDeliverable,
  TaskHistoryEntry,
  TaskRetrospective,
  TaskSetTemplate,
  TaskSetTemplateItem,
  TaskStatus,
  TrainingRecord,
  TransferRecord,
  Priority,
  Difficulty,
  TaskInput,
  ParsedTask,
  ProgressEntry,
} from './types'
import {
  canSeeExecTasks,
  BASE_ROLE,
  DEFAULT_NON_TOP_SECTIONS,
  ADMIN_SECTIONS,
  STATUS_LABEL,
} from './types'
import { MEMBERS, PROJECTS, SEED_TASKS, SEED_INPUTS } from './seed'
import {
  colorForId,
  fetchRemoteData,
  fetchSettings,
  initialsForName,
  isDriveConfigured,
  isRemoteConfigured,
  isSettingsConfigured,
  remoteApi,
  toCreatePayload,
} from './remote'
import { daysSince, deadlineLevel } from './utils'

type Mode = 'input' | 'output'
type RemoteStatus = 'idle' | 'loading' | 'ready' | 'error'

// A member auto-certifies a skill after this many completed tasks in the
// same category.
const SKILL_CERT_THRESHOLD = 3

// A 完了 task older than this (by completedDate) is treated as archived —
// hidden from the normal workspace, visible only under the Archive tab.
const ARCHIVE_AFTER_DAYS = 14

const DEFAULT_SKILL_OPTIONS = [
  'デザイン', 'Canva', 'ライティング', 'リサーチ', 'SNS', '広報', 'コミュニケーション',
  'イベント運営', 'メール', 'UI/UX', '実装', '企画', '要件定義', 'プロダクト設計', '校閲',
]
const DEFAULT_CATEGORY_OPTIONS = [
  '未分類', 'デザイン', '渉外', 'イベント', '広報', 'ライティング', '企画', 'リサーチ', '開発', '物品調達',
]

// Admin-defined permission levels above the fixed 一般 baseline (see
// types.ts's BASE_ROLE/isAdminRole) — freely add/removable from Admin →
// Tags, same pattern as skill/category option pools.
const DEFAULT_ROLE_LEVELS = ['班長', '事業責任者', '代表']

function isArchived(t: Task): boolean {
  if (t.status !== 'done' || !t.completedDate) return false
  const d = daysSince(t.completedDate)
  return d !== null && d >= ARCHIVE_AFTER_DAYS
}

interface OrbitState {
  currentUserId: string | null
  tasks: Task[]
  members: Member[]
  projects: Project[]
  inputs: TaskInput[]
  mode: Mode
}

interface OrbitContextValue extends OrbitState {
  currentUser: Member | null
  // tasks with pendingApproval and archived tasks stripped out — what the
  // normal workspace (kanban/list/calendar/people/project views) renders
  visibleTasks: Task[]
  // the admin's approval queue
  pendingTasks: Task[]
  // 完了 tasks old enough to be archived — see Archive tab
  archivedTasks: Task[]
  // whether the app is backed by the live spreadsheet (via GAS/CSV) or the
  // local mock data — surfaced so the UI can show sync state.
  remoteEnabled: boolean
  // whether profile-picture uploads are usable (remote configured AND a
  // Drive folder id is set) — see gas/README.md's DRIVE_FOLDER_ID setup
  driveEnabled: boolean
  remoteStatus: RemoteStatus
  remoteError: string | null
  // true once every configured remote source (spreadsheet + optional
  // Settings sheet) has resolved or given up — see store.tsx's dataReady
  dataReady: boolean
  // manual re-fetch for the header's 情報更新 button — see refreshAll
  refreshing: boolean
  refreshAll: () => void
  skillOptions: string[]
  categoryOptions: string[]
  addSkillOption: (name: string) => void
  removeSkillOption: (name: string) => void
  addCategoryOption: (name: string) => void
  removeCategoryOption: (name: string) => void
  roleLevels: string[]
  addRoleLevel: (name: string) => void
  removeRoleLevel: (name: string) => void
  // per-role-level admin-screen section visibility (see types.ts's
  // AdminSection/DEFAULT_NON_TOP_SECTIONS); the top role level always sees
  // everything (isFullAdmin), so it's not represented here
  rolePermissions: Record<string, AdminSection[]>
  setRolePermissions: (role: string, sections: AdminSection[]) => void
  // admin-screen sections currentUser's role is allowed to see
  visibleAdminSections: AdminSection[]
  projectTemplates: Record<string, ProjectTemplateTask[]>
  projectTypes: string[]
  setProjectTemplateTasks: (type: string, tasks: ProjectTemplateTask[]) => void
  removeProjectType: (type: string) => void
  taskSetTemplates: TaskSetTemplate[]
  addTaskSetTemplate: (name: string, description: string) => void
  updateTaskSetTemplateItems: (templateId: string, items: TaskSetTemplateItem[]) => void
  removeTaskSetTemplate: (templateId: string) => void
  applyTaskSetTemplate: (templateId: string, projectId: string) => void
  recurringRules: RecurringTaskRule[]
  // item 17: ポジション要件 — jobType (role level string) -> required skills
  jobRequirements: Record<string, string[]>
  setJobRequirements: (jobType: string, skills: string[]) => void
  addRecurringRule: (rule: Omit<RecurringTaskRule, 'id' | 'active' | 'lastGeneratedDate'>) => void
  removeRecurringRule: (ruleId: string) => void
  toggleRecurringRule: (ruleId: string) => void
  needsOnboarding: boolean
  completeOnboarding: (will: string[]) => void
  skipOnboarding: () => void
  skillCertifiedEvent: { memberName: string; skill: string } | null
  clearSkillCertifiedEvent: () => void
  login: (userId: string) => void
  logout: () => void
  setMode: (m: Mode) => void
  // Register approved parsed tasks as a single natural-language input.
  addTasksFromInput: (text: string, parsed: ParsedTask[]) => void
  updateTaskStatus: (id: string, status: TaskStatus) => void
  updatePriority: (id: string, priority: Priority) => void
  updateDifficulty: (id: string, difficulty: Difficulty) => void
  updateProgress: (id: string, text: string) => void
  assignTask: (id: string, memberIds: string[]) => void
  updateWill: (memberId: string, will: string[]) => void
  updateJudgment: (memberId: string, judgment: string[]) => void
  approveTask: (id: string) => void
  addProject: (name: string, description: string, type?: string) => void
  removeProject: (projectId: string) => void
  updateProjectMembers: (projectId: string, memberIds: string[]) => void
  updateProjectOwner: (projectId: string, ownerId: string | null) => void
  addMember: (name: string, email: string, affiliation: string, role: string) => void
  removeMember: (memberId: string) => void
  updateNotify: (memberId: string, notify: boolean) => void
  updateEmail: (memberId: string, email: string) => void
  updateMemberProjects: (memberId: string, projectIds: string[]) => void
  // true when currentUser holds the highest-ranked role level (unscoped
  // admin access); false for a lower admin level, scoped to projectIds
  isFullAdmin: boolean
  // Dashboard/Approvals/Assignments/Projects data, filtered to the current
  // user's own projectIds when they're a scoped (non-full) admin
  adminProjects: Project[]
  adminTasks: Task[]
  adminPendingTasks: Task[]
  updateRole: (memberId: string, role: Role) => void
  updateReportsTo: (memberId: string, reportsToId: string | null) => void
  updateMentor: (memberId: string, mentorId: string | null) => void
  // ---- タレントマネジメント ----
  updateSearchProfile: (
    memberId: string,
    profile: { yearsOfExperience: number | null; hasManagementExperience: boolean; desiredAreas: string[] },
  ) => void
  updateCareerHistory: (memberId: string, entries: CareerHistoryEntry[]) => void
  updateQualifications: (memberId: string, entries: Qualification[]) => void
  updateEvaluationHistory: (memberId: string, entries: EvaluationRecord[]) => void
  updateTransferHistory: (memberId: string, entries: TransferRecord[]) => void
  updateSkillLevels: (memberId: string, levels: SkillLevel[]) => void
  updateCompetencies: (memberId: string, competencies: Competency[]) => void
  updateCareerGoals: (
    memberId: string,
    goals: { careerAspiration: string; desiredFutureRole: string; careerPlan: string },
  ) => void
  updateTrainingHistory: (memberId: string, entries: TrainingRecord[]) => void
  updateDevelopmentPlan: (memberId: string, entries: DevelopmentPlanEntry[]) => void
  updateOneOnOnes: (memberId: string, entries: OneOnOneRecord[]) => void
  updateDisplayName: (memberId: string, displayName: string) => void
  toggleUnavailableDate: (memberId: string, date: string) => void
  updateSchedule: (id: string, startDate: string | null, deadline: string | null) => void
  updateDependsOn: (id: string, dependsOnIds: string[]) => void
  updateReviewer: (id: string, reviewerId: string | null) => void
  setBlocker: (id: string, note: string | null) => void
  updateEstimatedHours: (id: string, hours: number | null) => void
  updateActualHours: (id: string, hours: number | null) => void
  updateRetrospective: (id: string, retrospective: TaskRetrospective | null) => void
  addDeliverable: (id: string, label: string, url: string) => void
  removeDeliverable: (id: string, deliverableId: string) => void
  addComment: (id: string, text: string) => void
  removeComment: (id: string, commentId: string) => void
  updateAvatar: (memberId: string, avatarColor: string, initials: string) => void
  uploadAvatarImage: (memberId: string, dataUrl: string, filename: string) => Promise<void>
  notifications: import('./types').NotificationItem[]
  getMember: (id: string | null) => Member | undefined
  getProject: (id: string) => Project | undefined
  getInput: (id: string | undefined) => TaskInput | undefined
  // union of explicitly-assigned members (Project.memberIds) and whoever's
  // actually assigned to one of the project's tasks — the same "who's on
  // this project" definition admin-projects.tsx uses, so the workspace
  // (project-view/project-detail) shows the same assignments as Admin does
  getProjectMembers: (projectId: string) => Member[]
}

const OrbitContext = createContext<OrbitContextValue | null>(null)

const STORAGE_KEY = 'orbit-state-v2'
const TAGS_STORAGE_KEY = 'orbit-tag-options'
const ONBOARDED_STORAGE_KEY = 'orbit-onboarded-ids'
const TEMPLATES_STORAGE_KEY = 'orbit-project-templates'
const ROLE_PERMS_STORAGE_KEY = 'orbit-role-permissions'
const TASK_SET_TEMPLATES_STORAGE_KEY = 'orbit-task-set-templates'
const RECURRING_RULES_STORAGE_KEY = 'orbit-recurring-rules'
// item 17: ポジション要件 — localStorage fallback for when the optional
// Settings sheet isn't configured, same as the other option pools below
const JOB_REQUIREMENTS_STORAGE_KEY = 'orbit-job-requirements'

function loadState(): Partial<OrbitState> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Partial<OrbitState>) : null
  } catch {
    return null
  }
}

function loadTagOptions(): { skills: string[]; categories: string[]; roleLevels?: string[] } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(TAGS_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function loadOnboardedIds(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(ONBOARDED_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function loadProjectTemplates(): Record<string, ProjectTemplateTask[]> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(TEMPLATES_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function loadRolePermissions(): Record<string, AdminSection[]> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(ROLE_PERMS_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function loadTaskSetTemplates(): TaskSetTemplate[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(TASK_SET_TEMPLATES_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function loadRecurringRules(): RecurringTaskRule[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECURRING_RULES_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function loadJobRequirements(): Record<string, string[]> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(JOB_REQUIREMENTS_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function uniq(list: string[]): string[] {
  return Array.from(new Set(list.map((s) => s.trim()).filter(Boolean)))
}

export function OrbitProvider({ children }: { children: React.ReactNode }) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  // when a remote spreadsheet is configured, the local seed data is never
  // actually correct (wrong ids, wrong org) — starting from it anyway just
  // means every reload briefly shows the wrong members/tasks/projects (and
  // can resolve currentUserId, a real remote id, to nobody) until the fetch
  // below replaces it. Start empty instead and let the loading gates in
  // orbit-app.tsx / admin-screen.tsx cover the wait.
  const [tasks, setTasks] = useState<Task[]>(isRemoteConfigured ? [] : SEED_TASKS)
  const [members, setMembers] = useState<Member[]>(isRemoteConfigured ? [] : MEMBERS)
  const [projects, setProjects] = useState<Project[]>(isRemoteConfigured ? [] : PROJECTS)
  const [inputs, setInputs] = useState<TaskInput[]>(SEED_INPUTS)
  const [mode, setModeState] = useState<Mode>('output')
  const [hydrated, setHydrated] = useState(false)
  const [remoteStatus, setRemoteStatus] = useState<RemoteStatus>('idle')
  const [remoteError, setRemoteError] = useState<string | null>(null)
  // mirrors remoteStatus but for the separate, optional Settings-sheet
  // fetch (role levels/permissions/pools) — true immediately when that
  // sheet isn't configured, so dataReady below doesn't wait on it forever
  const [settingsReady, setSettingsReady] = useState(!isSettingsConfigured)
  const [skillOptions, setSkillOptions] = useState<string[]>(DEFAULT_SKILL_OPTIONS)
  const [categoryOptions, setCategoryOptions] = useState<string[]>(DEFAULT_CATEGORY_OPTIONS)
  const [roleLevels, setRoleLevels] = useState<string[]>(DEFAULT_ROLE_LEVELS)
  const [rolePermissions, setRolePermissionsState] = useState<Record<string, AdminSection[]>>({})
  const [projectTemplates, setProjectTemplates] = useState<Record<string, ProjectTemplateTask[]>>({})
  const [taskSetTemplates, setTaskSetTemplates] = useState<TaskSetTemplate[]>([])
  const [recurringRules, setRecurringRules] = useState<RecurringTaskRule[]>([])
  // item 17: ポジション要件 — jobType (role level string) -> required skills
  const [jobRequirements, setJobRequirementsState] = useState<Record<string, string[]>>({})
  const [onboardedIds, setOnboardedIds] = useState<Set<string>>(new Set())
  const [skillCertifiedEvent, setSkillCertifiedEvent] = useState<{
    memberName: string
    skill: string
  } | null>(null)

  const reportRemoteError = useCallback((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[orbit] remote sync failed', err)
    setRemoteError(err instanceof Error ? err.message : String(err))
  }, [])

  // fire a remote write; clears a stale error banner on success, reports on failure
  const runRemote = useCallback(
    (promise: Promise<unknown>) => {
      promise.then(() => setRemoteError(null)).catch(reportRemoteError)
    },
    [reportRemoteError],
  )

  // hydrate from localStorage once (only meaningful without a remote DB —
  // when the spreadsheet is configured it's fetched fresh below and wins)
  useEffect(() => {
    const saved = loadState()
    if (saved) {
      if (saved.currentUserId) setCurrentUserId(saved.currentUserId)
      if (!isRemoteConfigured) {
        if (saved.tasks) setTasks(saved.tasks)
        if (saved.members) setMembers(saved.members)
        if (saved.projects) setProjects(saved.projects)
      }
      if (saved.inputs) setInputs(saved.inputs)
      if (saved.mode) setModeState(saved.mode)
    }
    if (!isSettingsConfigured) {
      const tags = loadTagOptions()
      if (tags) {
        if (tags.skills?.length) setSkillOptions(uniq([...DEFAULT_SKILL_OPTIONS, ...tags.skills]))
        if (tags.categories?.length)
          setCategoryOptions(uniq([...DEFAULT_CATEGORY_OPTIONS, ...tags.categories]))
        if (tags.roleLevels) setRoleLevels(uniq(tags.roleLevels))
      }
      setProjectTemplates(loadProjectTemplates())
      setRolePermissionsState(loadRolePermissions())
      setTaskSetTemplates(loadTaskSetTemplates())
      setRecurringRules(loadRecurringRules())
      setJobRequirementsState(loadJobRequirements())
    }
    setOnboardedIds(new Set(loadOnboardedIds()))
    setHydrated(true)
  }, [])

  // fetch the live spreadsheet (Members/Projects/Tasks) once, when configured
  useEffect(() => {
    if (!isRemoteConfigured) return
    setRemoteStatus('loading')
    fetchRemoteData()
      .then(({ members: m, projects: p, tasks: t }) => {
        setMembers(m)
        setProjects(p)
        setTasks(t)
        setRemoteStatus('ready')
        setRemoteError(null)
      })
      .catch((err) => {
        reportRemoteError(err)
        setRemoteStatus('error')
      })
  }, [reportRemoteError])

  // fetch the optional Settings sheet once, when configured — this is the
  // source of truth for the skill/category/role-level pools and project
  // templates instead of each browser's own localStorage copy
  useEffect(() => {
    if (!isSettingsConfigured) return
    fetchSettings()
      .then((s) => {
        setSkillOptions(s.skillOptions.length ? uniq(s.skillOptions) : DEFAULT_SKILL_OPTIONS)
        setCategoryOptions(
          s.categoryOptions.length ? uniq(s.categoryOptions) : DEFAULT_CATEGORY_OPTIONS,
        )
        setRoleLevels(s.roleLevels.length ? uniq(s.roleLevels) : DEFAULT_ROLE_LEVELS)
        setProjectTemplates(s.projectTemplates)
        setRolePermissionsState(s.rolePermissions)
        setTaskSetTemplates(s.taskSetTemplates)
        setRecurringRules(s.recurringRules)
        setJobRequirementsState(s.jobRequirements)
        setRemoteError(null)
        setSettingsReady(true)
      })
      .catch((err) => {
        reportRemoteError(err)
        // an error still means "stop waiting" — fall back to defaults
        // rather than blocking dataReady forever
        setSettingsReady(true)
      })
  }, [reportRemoteError])

  // manual refresh for the header's 情報更新 button. Deliberately doesn't
  // touch remoteStatus/settingsReady (those flipping to non-ready is what
  // gates the Router/AdminScreen loading screens) — a refresh the user asks
  // for while already looking at data should update in place, not bounce
  // them to a loading screen or off the page they're on.
  const [refreshing, setRefreshing] = useState(false)
  const refreshAll = useCallback(() => {
    if (!isRemoteConfigured && !isSettingsConfigured) return
    setRefreshing(true)
    Promise.all([
      isRemoteConfigured ? fetchRemoteData() : null,
      isSettingsConfigured ? fetchSettings() : null,
    ])
      .then(([remote, settings]) => {
        if (remote) {
          setMembers(remote.members)
          setProjects(remote.projects)
          setTasks(remote.tasks)
        }
        if (settings) {
          setSkillOptions(settings.skillOptions.length ? uniq(settings.skillOptions) : DEFAULT_SKILL_OPTIONS)
          setCategoryOptions(
            settings.categoryOptions.length
              ? uniq(settings.categoryOptions)
              : DEFAULT_CATEGORY_OPTIONS,
          )
          setRoleLevels(settings.roleLevels.length ? uniq(settings.roleLevels) : DEFAULT_ROLE_LEVELS)
          setProjectTemplates(settings.projectTemplates)
          setRolePermissionsState(settings.rolePermissions)
          setTaskSetTemplates(settings.taskSetTemplates)
          setRecurringRules(settings.recurringRules)
          setJobRequirementsState(settings.jobRequirements)
        }
        setRemoteError(null)
      })
      .catch(reportRemoteError)
      .finally(() => setRefreshing(false))
  }, [reportRemoteError])

  // 定期タスク generation check (item 2) — there's no server-side cron in
  // this GAS + static-export architecture, so a due rule is generated
  // client-side whenever any member's browser loads the app on the
  // matching day. Each rule tracks lastGeneratedDate so it only fires once
  // per day regardless of how many times/people load the app that day.
  useEffect(() => {
    if (!hydrated || recurringRules.length === 0) return
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    const dow = now.getDay()
    const dom = now.getDate()

    recurringRules.forEach((rule) => {
      if (!rule.active || rule.lastGeneratedDate === todayStr) return
      const due = rule.frequency === 'weekly' ? rule.dayOfWeek === dow : rule.dayOfMonth === dom
      if (!due) return

      const deadline =
        rule.dueInDays != null
          ? new Date(now.getTime() + rule.dueInDays * 86400000).toISOString().slice(0, 10)
          : null
      const newTask: Task = {
        id: `t-${Math.random().toString(36).slice(2, 9)}`,
        name: rule.name,
        description: '',
        projectId: rule.projectId,
        department: rule.department,
        assigneeIds: [],
        deadline,
        category: rule.category,
        skills: rule.skills,
        difficulty: rule.difficulty,
        priority: rule.priority,
        status: 'todo',
        lastActivity: todayStr,
        createdAt: now.toISOString(),
        progressHistory: [],
        pendingApproval: false,
      }
      setTasks((prev) => [newTask, ...prev])
      setRecurringRules((prev) => {
        const next = prev.map((r) => (r.id === rule.id ? { ...r, lastGeneratedDate: todayStr } : r))
        if (isSettingsConfigured)
          runRemote(remoteApi.updateSetting('recurring_rules', JSON.stringify(next)))
        return next
      })
      if (isRemoteConfigured) {
        remoteApi
          .createTasks([
            {
              tempId: newTask.id,
              title: newTask.name,
              projectId: rule.projectId,
              department: rule.department,
              category: rule.category,
              skills: rule.skills,
              difficulty: rule.difficulty,
              priority: rule.priority,
              deadline,
              pendingApproval: false,
            },
          ])
          .then((mapping) => {
            const realId = mapping[0]?.id
            if (realId) setTasks((prev) => prev.map((t) => (t.id === newTask.id ? { ...t, id: realId } : t)))
          })
          .catch(reportRemoteError)
      }
    })
  }, [hydrated, recurringRules, reportRemoteError, runRemote])

  // keep the skill/category pools growing with whatever actually shows up
  // on tasks (from the sheet or elsewhere), not just manually-added ones
  useEffect(() => {
    const seenSkills = uniq(tasks.flatMap((t) => t.skills))
    const seenCategories = uniq(tasks.map((t) => t.category))
    setSkillOptions((prev) => uniq([...prev, ...seenSkills]))
    setCategoryOptions((prev) => uniq([...prev, ...seenCategories]))
  }, [tasks])

  // same for role levels actually in use on Members (e.g. from the sheet),
  // so a custom level set elsewhere still shows up in this browser's picker
  useEffect(() => {
    const seenRoles = uniq(members.map((m) => m.role).filter((r) => r !== BASE_ROLE))
    if (seenRoles.length === 0) return
    setRoleLevels((prev) => uniq([...prev, ...seenRoles]))
  }, [members])

  // persist (local-only state: current user, input history, UI mode — the
  // task/member/project lists themselves are never the source of truth
  // once a remote DB is configured, so they're skipped from the cache then)
  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          currentUserId,
          inputs,
          mode,
          ...(isRemoteConfigured ? {} : { tasks, members, projects }),
        }),
      )
    } catch {
      /* ignore */
    }
  }, [currentUserId, tasks, members, projects, inputs, mode, hydrated])

  // persist skill/category/role-level option pools (device-local — see
  // gas/README.md; skipped once the Settings sheet is the source of truth)
  useEffect(() => {
    if (!hydrated || isSettingsConfigured) return
    try {
      window.localStorage.setItem(
        TAGS_STORAGE_KEY,
        JSON.stringify({ skills: skillOptions, categories: categoryOptions, roleLevels }),
      )
    } catch {
      /* ignore */
    }
  }, [skillOptions, categoryOptions, roleLevels, hydrated])

  // persist project-type templates (device-local, same caveat as tags)
  useEffect(() => {
    if (!hydrated || isSettingsConfigured) return
    try {
      window.localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(projectTemplates))
    } catch {
      /* ignore */
    }
  }, [projectTemplates, hydrated])

  // persist per-role admin-section permissions (device-local, same caveat)
  useEffect(() => {
    if (!hydrated || isSettingsConfigured) return
    try {
      window.localStorage.setItem(ROLE_PERMS_STORAGE_KEY, JSON.stringify(rolePermissions))
    } catch {
      /* ignore */
    }
  }, [rolePermissions, hydrated])

  // persist task-set templates and recurring-task rules (device-local, same caveat)
  useEffect(() => {
    if (!hydrated || isSettingsConfigured) return
    try {
      window.localStorage.setItem(TASK_SET_TEMPLATES_STORAGE_KEY, JSON.stringify(taskSetTemplates))
    } catch {
      /* ignore */
    }
  }, [taskSetTemplates, hydrated])

  useEffect(() => {
    if (!hydrated || isSettingsConfigured) return
    try {
      window.localStorage.setItem(RECURRING_RULES_STORAGE_KEY, JSON.stringify(recurringRules))
    } catch {
      /* ignore */
    }
  }, [recurringRules, hydrated])

  useEffect(() => {
    if (!hydrated || isSettingsConfigured) return
    try {
      window.localStorage.setItem(JOB_REQUIREMENTS_STORAGE_KEY, JSON.stringify(jobRequirements))
    } catch {
      /* ignore */
    }
  }, [jobRequirements, hydrated])

  // item 17: ポジション要件 — synced via the optional Settings sheet
  // (job_requirements key), same pattern as role_permissions/project_templates
  const setJobRequirements = useCallback(
    (jobType: string, skills: string[]) => {
      setJobRequirementsState((prev) => {
        const next = { ...prev, [jobType]: skills }
        if (isSettingsConfigured)
          runRemote(remoteApi.updateSetting('job_requirements', JSON.stringify(next)))
        return next
      })
    },
    [runRemote],
  )

  const login = useCallback((userId: string) => {
    setCurrentUserId(userId)
    setModeState('output')
  }, [])

  const logout = useCallback(() => {
    setCurrentUserId(null)
  }, [])

  const setMode = useCallback((m: Mode) => setModeState(m), [])

  // these option pools sync to the Settings sheet when configured (see
  // gas/README.md) — each mutator computes the full next list explicitly
  // (rather than an opaque setState updater) so it can push that same
  // value to remoteApi.updateSetting right alongside the local update
  const addSkillOption = useCallback(
    (name: string) => {
      const v = name.trim()
      if (!v || skillOptions.includes(v)) return
      const next = [...skillOptions, v]
      setSkillOptions(next)
      if (isSettingsConfigured) runRemote(remoteApi.updateSetting('skill_options', next.join(',')))
    },
    [skillOptions, runRemote],
  )
  const removeSkillOption = useCallback(
    (name: string) => {
      const next = skillOptions.filter((s) => s !== name)
      setSkillOptions(next)
      if (isSettingsConfigured) runRemote(remoteApi.updateSetting('skill_options', next.join(',')))
    },
    [skillOptions, runRemote],
  )
  const addCategoryOption = useCallback(
    (name: string) => {
      const v = name.trim()
      if (!v || categoryOptions.includes(v)) return
      const next = [...categoryOptions, v]
      setCategoryOptions(next)
      if (isSettingsConfigured) runRemote(remoteApi.updateSetting('category_options', next.join(',')))
    },
    [categoryOptions, runRemote],
  )
  const removeCategoryOption = useCallback(
    (name: string) => {
      const next = categoryOptions.filter((c) => c !== name)
      setCategoryOptions(next)
      if (isSettingsConfigured) runRemote(remoteApi.updateSetting('category_options', next.join(',')))
    },
    [categoryOptions, runRemote],
  )

  const addRoleLevel = useCallback(
    (name: string) => {
      const v = name.trim()
      if (!v || v === BASE_ROLE || roleLevels.includes(v)) return
      const next = [...roleLevels, v]
      setRoleLevels(next)
      if (isSettingsConfigured) runRemote(remoteApi.updateSetting('role_levels', next.join(',')))
    },
    [roleLevels, runRemote],
  )
  // removing a level demotes anyone currently holding it back to 一般 —
  // same "reassign, don't orphan" pattern as removeMember's task unassign
  const removeRoleLevel = useCallback(
    (name: string) => {
      const next = roleLevels.filter((r) => r !== name)
      setRoleLevels(next)
      if (isSettingsConfigured) runRemote(remoteApi.updateSetting('role_levels', next.join(',')))
      setMembers((prev) =>
        prev.map((m) => {
          if (m.role !== name) return m
          if (isRemoteConfigured) runRemote(remoteApi.updateRole(m.id, BASE_ROLE))
          return { ...m, role: BASE_ROLE }
        }),
      )
      setRolePermissionsState((prev) => {
        if (!(name in prev)) return prev
        const nextPerms = { ...prev }
        delete nextPerms[name]
        if (isSettingsConfigured)
          runRemote(remoteApi.updateSetting('role_permissions', JSON.stringify(nextPerms)))
        return nextPerms
      })
    },
    [roleLevels, runRemote],
  )

  const setRolePermissions = useCallback(
    (role: string, sections: AdminSection[]) => {
      setRolePermissionsState((prev) => {
        const next = { ...prev, [role]: sections }
        if (isSettingsConfigured)
          runRemote(remoteApi.updateSetting('role_permissions', JSON.stringify(next)))
        return next
      })
    },
    [runRemote],
  )

  const setProjectTemplateTasks = useCallback(
    (type: string, tasksForType: ProjectTemplateTask[]) => {
      const next = { ...projectTemplates, [type]: tasksForType }
      setProjectTemplates(next)
      if (isSettingsConfigured)
        runRemote(remoteApi.updateSetting('project_templates', JSON.stringify(next)))
    },
    [projectTemplates, runRemote],
  )
  const removeProjectType = useCallback(
    (type: string) => {
      const next = { ...projectTemplates }
      delete next[type]
      setProjectTemplates(next)
      if (isSettingsConfigured)
        runRemote(remoteApi.updateSetting('project_templates', JSON.stringify(next)))
    },
    [projectTemplates, runRemote],
  )

  // 業務テンプレート (item 1) — reusable, on-demand task-set templates
  // (distinct from projectTemplates above, which only auto-apply once at
  // project creation, keyed by project type)
  const addTaskSetTemplate = useCallback(
    (name: string, description: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      const entry: TaskSetTemplate = {
        id: `tst-${Math.random().toString(36).slice(2, 9)}`,
        name: trimmed,
        description: description.trim() || undefined,
        items: [],
      }
      setTaskSetTemplates((prev) => {
        const next = [...prev, entry]
        if (isSettingsConfigured)
          runRemote(remoteApi.updateSetting('task_set_templates', JSON.stringify(next)))
        return next
      })
    },
    [runRemote],
  )
  const updateTaskSetTemplateItems = useCallback(
    (templateId: string, items: TaskSetTemplateItem[]) => {
      setTaskSetTemplates((prev) => {
        const next = prev.map((t) => (t.id === templateId ? { ...t, items } : t))
        if (isSettingsConfigured)
          runRemote(remoteApi.updateSetting('task_set_templates', JSON.stringify(next)))
        return next
      })
    },
    [runRemote],
  )
  const removeTaskSetTemplate = useCallback(
    (templateId: string) => {
      setTaskSetTemplates((prev) => {
        const next = prev.filter((t) => t.id !== templateId)
        if (isSettingsConfigured)
          runRemote(remoteApi.updateSetting('task_set_templates', JSON.stringify(next)))
        return next
      })
    },
    [runRemote],
  )

  // Generates real tasks (in the given project) from a template's items,
  // resolving each item's template-local dependsOn ids into real task ids
  // once the remote createTasks call (when configured) returns them.
  const applyTaskSetTemplate = useCallback(
    (templateId: string, projectId: string) => {
      const template = taskSetTemplates.find((t) => t.id === templateId)
      if (!template || template.items.length === 0) return

      const today = new Date().toISOString().slice(0, 10)
      const tempIdByItemId = new Map(
        template.items.map((item) => [item.id, `t-${Math.random().toString(36).slice(2, 9)}`]),
      )

      const newTasks: Task[] = template.items.map((item) => ({
        id: tempIdByItemId.get(item.id)!,
        name: item.name,
        description: '',
        projectId,
        department: item.department,
        assigneeIds: [],
        deadline: null,
        category: item.category,
        skills: item.skills,
        difficulty: item.difficulty,
        priority: item.priority,
        status: 'todo',
        lastActivity: today,
        createdById: currentUserId ?? undefined,
        createdAt: new Date().toISOString(),
        progressHistory: [],
        pendingApproval: false, // admin-initiated, same as project-type templates
        dependsOnIds: (item.dependsOn ?? [])
          .map((localId) => tempIdByItemId.get(localId))
          .filter((id): id is string => !!id),
      }))

      setTasks((prev) => [...newTasks, ...prev])

      if (isRemoteConfigured) {
        const payloads = newTasks.map((t) => ({
          tempId: t.id,
          title: t.name,
          projectId,
          department: t.department,
          category: t.category,
          skills: t.skills,
          difficulty: t.difficulty,
          priority: t.priority,
          deadline: null,
          creatorId: currentUserId ?? undefined,
          pendingApproval: false,
        }))
        remoteApi
          .createTasks(payloads)
          .then((mapping) => {
            const realId = new Map(mapping.map((m) => [m.tempId, m.id]))
            setTasks((prev) =>
              prev.map((t) =>
                realId.has(t.id)
                  ? {
                      ...t,
                      id: realId.get(t.id)!,
                      dependsOnIds: (t.dependsOnIds ?? []).map((depId) => realId.get(depId) ?? depId),
                    }
                  : t,
              ),
            )
            newTasks.forEach((t) => {
              if (!t.dependsOnIds || t.dependsOnIds.length === 0) return
              const resolvedId = realId.get(t.id)
              if (!resolvedId) return
              const resolvedDeps = t.dependsOnIds.map((depId) => realId.get(depId) ?? depId)
              runRemote(remoteApi.updateDependsOn(resolvedId, resolvedDeps))
            })
            setRemoteError(null)
          })
          .catch(reportRemoteError)
      }
    },
    [taskSetTemplates, currentUserId, reportRemoteError, runRemote],
  )

  // 定期タスク (item 2) — admin-defined recurring generation rules
  const addRecurringRule = useCallback(
    (rule: Omit<RecurringTaskRule, 'id' | 'active' | 'lastGeneratedDate'>) => {
      const entry: RecurringTaskRule = {
        ...rule,
        id: `rr-${Math.random().toString(36).slice(2, 9)}`,
        active: true,
      }
      setRecurringRules((prev) => {
        const next = [...prev, entry]
        if (isSettingsConfigured)
          runRemote(remoteApi.updateSetting('recurring_rules', JSON.stringify(next)))
        return next
      })
    },
    [runRemote],
  )
  const removeRecurringRule = useCallback(
    (ruleId: string) => {
      setRecurringRules((prev) => {
        const next = prev.filter((r) => r.id !== ruleId)
        if (isSettingsConfigured)
          runRemote(remoteApi.updateSetting('recurring_rules', JSON.stringify(next)))
        return next
      })
    },
    [runRemote],
  )
  const toggleRecurringRule = useCallback(
    (ruleId: string) => {
      setRecurringRules((prev) => {
        const next = prev.map((r) => (r.id === ruleId ? { ...r, active: !r.active } : r))
        if (isSettingsConfigured)
          runRemote(remoteApi.updateSetting('recurring_rules', JSON.stringify(next)))
        return next
      })
    },
    [runRemote],
  )

  const addTasksFromInput = useCallback(
    (text: string, parsed: ParsedTask[]) => {
      const inputId = `in-${Math.random().toString(36).slice(2, 9)}`
      const now = new Date().toISOString()
      const today = now.slice(0, 10)
      const createdById = currentUserId ?? undefined

      const newTasks: Task[] = parsed.map((p) => ({
        id: `t-${Math.random().toString(36).slice(2, 9)}`,
        name: p.name,
        description: '',
        projectId: p.projectId,
        department: p.department,
        assigneeIds: p.assigneeIds ?? [],
        startDate: p.startDate ?? null,
        deadline: p.deadline,
        dueTime: p.dueTime ?? null,
        category: p.category,
        skills: p.skills,
        difficulty: p.difficulty,
        priority: p.priority,
        status: 'todo',
        lastActivity: today,
        originalInputId: inputId,
        createdById,
        createdAt: now,
        progressHistory: [],
        pendingApproval: true,
        visibility: p.visibility ?? 'all',
        estimatedHours: p.estimatedHours,
        importance: p.importance,
      }))

      const input: TaskInput = {
        id: inputId,
        text,
        createdById: createdById ?? '',
        createdAt: now,
        generatedTaskIds: newTasks.map((t) => t.id),
      }

      setTasks((prev) => [...newTasks, ...prev])
      setInputs((prev) => [input, ...prev])

      if (isRemoteConfigured) {
        const payloads = newTasks.map((t, i) =>
          toCreatePayload(t.id, parsed[i], createdById, inputId),
        )
        remoteApi
          .createTasks(payloads)
          .then((mapping) => {
            const realId = new Map(mapping.map((m) => [m.tempId, m.id]))
            setTasks((prev) =>
              prev.map((t) => (realId.has(t.id) ? { ...t, id: realId.get(t.id)! } : t)),
            )
            setInputs((prev) =>
              prev.map((inp) =>
                inp.id === inputId
                  ? {
                      ...inp,
                      generatedTaskIds: inp.generatedTaskIds.map(
                        (tid) => realId.get(tid) ?? tid,
                      ),
                    }
                  : inp,
              ),
            )
            setRemoteError(null)
          })
          .catch(reportRemoteError)
      }
    },
    [currentUserId, reportRemoteError],
  )

  // records a field change onto a task's audit trail (Admin → task detail
  // "変更履歴") — a no-op when the value didn't actually change. Capped so
  // a churny task doesn't grow the row without bound.
  const HISTORY_CAP = 50
  const appendHistory = useCallback(
    (t: Task, field: TaskHistoryEntry['field'], from: string, to: string): Task => {
      if (from === to) return t
      const entry: TaskHistoryEntry = {
        id: `h-${Math.random().toString(36).slice(2, 9)}`,
        at: new Date().toISOString(),
        byId: currentUserId ?? '',
        field,
        from,
        to,
      }
      const history = [entry, ...(t.history ?? [])].slice(0, HISTORY_CAP)
      if (isRemoteConfigured) runRemote(remoteApi.updateHistory(t.id, history))
      return { ...t, history }
    },
    [currentUserId, runRemote],
  )

  const updatePriority = useCallback(
    (id: string, priority: Priority) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? appendHistory({ ...t, priority }, 'priority', t.priority, priority) : t)),
      )
      if (isRemoteConfigured) runRemote(remoteApi.updatePriority(id, priority))
    },
    [appendHistory, runRemote],
  )

  const updateDifficulty = useCallback(
    (id: string, difficulty: Difficulty) => {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, difficulty } : t)))
      if (isRemoteConfigured) runRemote(remoteApi.updateDifficulty(id, difficulty))
    },
    [runRemote],
  )

  const updateProgress = useCallback(
    (id: string, text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      const entry: ProgressEntry = {
        id: `pg-${Math.random().toString(36).slice(2, 9)}`,
        text: trimmed,
        at: new Date().toISOString(),
        byId: currentUserId ?? '',
      }
      const today = new Date().toISOString().slice(0, 10)
      setTasks((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                progress: trimmed,
                progressHistory: [entry, ...(t.progressHistory ?? [])],
                lastActivity: today,
              }
            : t,
        ),
      )
      if (isRemoteConfigured) runRemote(remoteApi.updateProgress(id, trimmed))
    },
    [currentUserId, runRemote],
  )

  // Auto-certify: once a member has SKILL_CERT_THRESHOLD completed tasks in
  // the same category, that category is added to their Judgment tags.
  const maybeCertifySkill = useCallback(
    (allTasks: Task[], changedTaskId: string) => {
      const changed = allTasks.find((t) => t.id === changedTaskId)
      if (!changed || changed.assigneeIds.length === 0 || !changed.category) return

      changed.assigneeIds.forEach((assigneeId) => {
        const doneCount = allTasks.filter(
          (t) =>
            t.assigneeIds.includes(assigneeId) &&
            t.status === 'done' &&
            t.category === changed.category,
        ).length
        if (doneCount !== SKILL_CERT_THRESHOLD) return

        const member = members.find((m) => m.id === assigneeId)
        if (!member || member.judgment.includes(changed.category)) return
        const nextJudgment = [...member.judgment, changed.category]
        setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, judgment: nextJudgment } : m)))
        if (isRemoteConfigured) runRemote(remoteApi.updateJudgment(member.id, nextJudgment))
        setSkillCertifiedEvent({ memberName: member.name, skill: changed.category })
      })
    },
    [members, runRemote],
  )

  const updateTaskStatus = useCallback(
    (id: string, status: TaskStatus) => {
      const today = new Date().toISOString().slice(0, 10)
      const updated = tasks.map((t) =>
        t.id === id
          ? appendHistory(
              {
                ...t,
                status,
                lastActivity: today,
                completedDate: status === 'done' ? today : null,
              },
              'status',
              STATUS_LABEL[t.status],
              STATUS_LABEL[status],
            )
          : t,
      )
      setTasks(updated)
      if (status === 'done') maybeCertifySkill(updated, id)
      // entering 確認待ち is the assignee's "I'm done, please confirm" signal
      // — the admin gets emailed (gas/Code.gs) and already sees it surface
      // in the Admin dashboard's 確認待ち panel automatically.
      if (isRemoteConfigured) runRemote(remoteApi.updateTaskStatus(id, status))
    },
    [tasks, maybeCertifySkill, appendHistory, runRemote],
  )

  const assignTask = useCallback(
    (id: string, memberIds: string[]) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === id
            ? appendHistory(
                { ...t, assigneeIds: memberIds },
                'assignee',
                t.assigneeIds.join(','),
                memberIds.join(','),
              )
            : t,
        ),
      )
      if (isRemoteConfigured) runRemote(remoteApi.assignTask(id, memberIds))

      // a newly assigned member who isn't already on the task's project
      // gets added there too (item: プロジェクトの担当者を決めれるように)
      const task = tasks.find((t) => t.id === id)
      if (task) {
        setProjects((prev) =>
          prev.map((p) => {
            if (p.id !== task.projectId) return p
            const existing = new Set(p.memberIds ?? [])
            const additions = memberIds.filter((mid) => !existing.has(mid))
            if (additions.length === 0) return p
            const nextMemberIds = [...(p.memberIds ?? []), ...additions]
            if (isRemoteConfigured) runRemote(remoteApi.updateProjectMembers(p.id, nextMemberIds))
            return { ...p, memberIds: nextMemberIds }
          }),
        )
      }
    },
    [tasks, appendHistory, runRemote],
  )

  const updateWill = useCallback(
    (memberId: string, will: string[]) => {
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, will } : m)))
      if (isRemoteConfigured) runRemote(remoteApi.updateWill(memberId, will))
    },
    [runRemote],
  )

  const updateJudgment = useCallback(
    (memberId: string, judgment: string[]) => {
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, judgment } : m)))
      if (isRemoteConfigured) runRemote(remoteApi.updateJudgment(memberId, judgment))
    },
    [runRemote],
  )

  const approveTask = useCallback(
    (id: string) => {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, pendingApproval: false } : t)))
      if (isRemoteConfigured) runRemote(remoteApi.approveTask(id))
    },
    [runRemote],
  )

  const addProject = useCallback(
    (name: string, description: string, type?: string) => {
      const tempProjectId = `p-${Math.random().toString(36).slice(2, 9)}`
      setProjects((prev) => [...prev, { id: tempProjectId, name, description, type }])

      const templates = type ? projectTemplates[type] ?? [] : []
      const today = new Date().toISOString().slice(0, 10)
      const templateTasks: Task[] = templates.map((t) => ({
        id: `t-${Math.random().toString(36).slice(2, 9)}`,
        name: t.name,
        description: '',
        projectId: tempProjectId,
        department: t.department,
        assigneeIds: [],
        deadline: null,
        category: t.category,
        skills: t.skills,
        difficulty: t.difficulty,
        priority: t.priority,
        status: 'todo',
        lastActivity: today,
        createdById: currentUserId ?? undefined,
        createdAt: new Date().toISOString(),
        progressHistory: [],
        pendingApproval: false, // admin-initiated project setup — no approval needed
      }))
      if (templateTasks.length > 0) setTasks((prev) => [...templateTasks, ...prev])

      if (isRemoteConfigured) {
        remoteApi
          .createProject(name, description, type)
          .then(({ id }) => {
            setProjects((prev) => prev.map((p) => (p.id === tempProjectId ? { ...p, id } : p)))
            if (templateTasks.length > 0) {
              setTasks((prev) =>
                prev.map((t) => (t.projectId === tempProjectId ? { ...t, projectId: id } : t)),
              )
              const payloads = templateTasks.map((t) => ({
                tempId: t.id,
                title: t.name,
                projectId: id,
                department: t.department,
                category: t.category,
                skills: t.skills,
                difficulty: t.difficulty,
                priority: t.priority,
                deadline: null,
                creatorId: currentUserId ?? undefined,
                pendingApproval: false,
              }))
              remoteApi
                .createTasks(payloads)
                .then((mapping) => {
                  const realId = new Map(mapping.map((m) => [m.tempId, m.id]))
                  setTasks((prev) =>
                    prev.map((t) => (realId.has(t.id) ? { ...t, id: realId.get(t.id)! } : t)),
                  )
                })
                .catch(reportRemoteError)
            }
            setRemoteError(null)
          })
          .catch(reportRemoteError)
      }
    },
    [projectTemplates, currentUserId, reportRemoteError],
  )

  // a task can't exist without a project (Task.projectId is required), so
  // unlike removeMember's unassign-in-place, this cascades to delete the
  // project's tasks too, and drops it from any scoped admin's project_ids
  const removeProject = useCallback(
    (projectId: string) => {
      setProjects((prev) => prev.filter((p) => p.id !== projectId))
      setTasks((prev) => prev.filter((t) => t.projectId !== projectId))
      setMembers((prev) =>
        prev.map((m) =>
          m.projectIds?.includes(projectId)
            ? { ...m, projectIds: m.projectIds.filter((id) => id !== projectId) }
            : m,
        ),
      )
      if (isRemoteConfigured) runRemote(remoteApi.removeProject(projectId))
    },
    [runRemote],
  )

  // manual project membership (Admin → Projects) — grown automatically by
  // assignTask too, this covers explicitly adding/removing someone who
  // isn't (yet) assigned to any of the project's tasks
  const updateProjectMembers = useCallback(
    (projectId: string, memberIds: string[]) => {
      setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, memberIds } : p)))
      if (isRemoteConfigured) runRemote(remoteApi.updateProjectMembers(projectId, memberIds))
    },
    [runRemote],
  )

  // 責任者 — the member accountable for the project overall
  const updateProjectOwner = useCallback(
    (projectId: string, ownerId: string | null) => {
      setProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, ownerId: ownerId ?? undefined } : p)),
      )
      if (isRemoteConfigured) runRemote(remoteApi.updateProjectOwner(projectId, ownerId))
    },
    [runRemote],
  )

  const addMember = useCallback(
    (name: string, email: string, affiliation: string, role: string) => {
      const tempId = `m-${Math.random().toString(36).slice(2, 9)}`
      const newMember: Member = {
        id: tempId,
        name,
        affiliation,
        role,
        avatarColor: colorForId(tempId),
        initials: initialsForName(name),
        will: [],
        judgment: [],
        facts: [],
        skills: [],
        email: email || undefined,
      }
      setMembers((prev) => [...prev, newMember])

      if (isRemoteConfigured) {
        remoteApi
          .addMember(name, email, affiliation, role)
          .then(({ id }) => {
            setMembers((prev) => prev.map((m) => (m.id === tempId ? { ...m, id } : m)))
            setRemoteError(null)
          })
          .catch(reportRemoteError)
      }
    },
    [reportRemoteError],
  )

  const removeMember = useCallback(
    (memberId: string) => {
      setMembers((prev) => prev.filter((m) => m.id !== memberId))
      setTasks((prev) =>
        prev.map((t) =>
          t.assigneeIds.includes(memberId)
            ? { ...t, assigneeIds: t.assigneeIds.filter((a) => a !== memberId) }
            : t,
        ),
      )
      setCurrentUserId((prev) => (prev === memberId ? null : prev))
      if (isRemoteConfigured) runRemote(remoteApi.removeMember(memberId))
    },
    [runRemote],
  )

  const updateNotify = useCallback(
    (memberId: string, notify: boolean) => {
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, notify } : m)))
      if (isRemoteConfigured) runRemote(remoteApi.updateNotify(memberId, notify))
    },
    [runRemote],
  )

  const updateEmail = useCallback(
    (memberId: string, email: string) => {
      const trimmed = email.trim()
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, email: trimmed || undefined } : m)),
      )
      if (isRemoteConfigured) runRemote(remoteApi.updateEmail(memberId, trimmed))
    },
    [runRemote],
  )

  // which projects a project-scoped admin (see isFullAdmin) manages
  const updateMemberProjects = useCallback(
    (memberId: string, projectIds: string[]) => {
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, projectIds } : m)),
      )
      if (isRemoteConfigured) runRemote(remoteApi.updateMemberProjects(memberId, projectIds))
    },
    [runRemote],
  )

  const updateRole = useCallback(
    (memberId: string, role: Role) => {
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role } : m)))
      if (isRemoteConfigured) runRemote(remoteApi.updateRole(memberId, role))
    },
    [runRemote],
  )

  const updateReportsTo = useCallback(
    (memberId: string, reportsToId: string | null) => {
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, reportsToId: reportsToId ?? undefined } : m)),
      )
      if (isRemoteConfigured) runRemote(remoteApi.updateReportsTo(memberId, reportsToId))
    },
    [runRemote],
  )

  // item 14: メンター/サポート担当の設定
  const updateMentor = useCallback(
    (memberId: string, mentorId: string | null) => {
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, mentorId: mentorId ?? undefined } : m)),
      )
      if (isRemoteConfigured) runRemote(remoteApi.updateMentor(memberId, mentorId))
    },
    [runRemote],
  )

  // ---- タレントマネジメント（人材DB／スキル管理／人材検索／育成・キャリア）----
  const updateSearchProfile = useCallback(
    (
      memberId: string,
      profile: {
        yearsOfExperience: number | null
        hasManagementExperience: boolean
        desiredAreas: string[]
      },
    ) => {
      setMembers((prev) =>
        prev.map((m) =>
          m.id === memberId
            ? {
                ...m,
                yearsOfExperience: profile.yearsOfExperience ?? undefined,
                hasManagementExperience: profile.hasManagementExperience,
                desiredAreas: profile.desiredAreas,
              }
            : m,
        ),
      )
      if (isRemoteConfigured) runRemote(remoteApi.updateSearchProfile(memberId, profile))
    },
    [runRemote],
  )

  const updateCareerHistory = useCallback(
    (memberId: string, entries: CareerHistoryEntry[]) => {
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, careerHistory: entries } : m)))
      if (isRemoteConfigured) runRemote(remoteApi.updateCareerHistory(memberId, entries))
    },
    [runRemote],
  )

  const updateQualifications = useCallback(
    (memberId: string, entries: Qualification[]) => {
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, qualifications: entries } : m)))
      if (isRemoteConfigured) runRemote(remoteApi.updateQualifications(memberId, entries))
    },
    [runRemote],
  )

  const updateEvaluationHistory = useCallback(
    (memberId: string, entries: EvaluationRecord[]) => {
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, evaluationHistory: entries } : m)),
      )
      if (isRemoteConfigured) runRemote(remoteApi.updateEvaluationHistory(memberId, entries))
    },
    [runRemote],
  )

  const updateTransferHistory = useCallback(
    (memberId: string, entries: TransferRecord[]) => {
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, transferHistory: entries } : m)))
      if (isRemoteConfigured) runRemote(remoteApi.updateTransferHistory(memberId, entries))
    },
    [runRemote],
  )

  const updateSkillLevels = useCallback(
    (memberId: string, levels: SkillLevel[]) => {
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, skillLevels: levels } : m)))
      if (isRemoteConfigured) runRemote(remoteApi.updateSkillLevels(memberId, levels))
    },
    [runRemote],
  )

  const updateCompetencies = useCallback(
    (memberId: string, competencies: Competency[]) => {
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, competencies } : m)))
      if (isRemoteConfigured) runRemote(remoteApi.updateCompetencies(memberId, competencies))
    },
    [runRemote],
  )

  const updateCareerGoals = useCallback(
    (
      memberId: string,
      goals: { careerAspiration: string; desiredFutureRole: string; careerPlan: string },
    ) => {
      setMembers((prev) =>
        prev.map((m) =>
          m.id === memberId
            ? {
                ...m,
                careerAspiration: goals.careerAspiration || undefined,
                desiredFutureRole: goals.desiredFutureRole || undefined,
                careerPlan: goals.careerPlan || undefined,
              }
            : m,
        ),
      )
      if (isRemoteConfigured) runRemote(remoteApi.updateCareerGoals(memberId, goals))
    },
    [runRemote],
  )

  const updateTrainingHistory = useCallback(
    (memberId: string, entries: TrainingRecord[]) => {
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, trainingHistory: entries } : m)))
      if (isRemoteConfigured) runRemote(remoteApi.updateTrainingHistory(memberId, entries))
    },
    [runRemote],
  )

  const updateDevelopmentPlan = useCallback(
    (memberId: string, entries: DevelopmentPlanEntry[]) => {
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, developmentPlan: entries } : m)),
      )
      if (isRemoteConfigured) runRemote(remoteApi.updateDevelopmentPlan(memberId, entries))
    },
    [runRemote],
  )

  const updateOneOnOnes = useCallback(
    (memberId: string, entries: OneOnOneRecord[]) => {
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, oneOnOnes: entries } : m)))
      if (isRemoteConfigured) runRemote(remoteApi.updateOneOnOnes(memberId, entries))
    },
    [runRemote],
  )

  const updateDisplayName = useCallback(
    (memberId: string, displayName: string) => {
      const trimmed = displayName.trim()
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, displayName: trimmed || undefined } : m)),
      )
      if (isRemoteConfigured) runRemote(remoteApi.updateDisplayName(memberId, trimmed))
    },
    [runRemote],
  )

  const toggleUnavailableDate = useCallback(
    (memberId: string, date: string) => {
      const member = members.find((m) => m.id === memberId)
      if (!member) return
      const cur = member.unavailableDates ?? []
      const next = cur.includes(date) ? cur.filter((d) => d !== date) : [...cur, date]
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, unavailableDates: next } : m)))
      if (isRemoteConfigured) runRemote(remoteApi.updateUnavailableDates(memberId, next))
    },
    [members, runRemote],
  )

  const updateSchedule = useCallback(
    (id: string, startDate: string | null, deadline: string | null) => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t
          let next: Task = { ...t, startDate, deadline }
          next = appendHistory(next, 'deadline', t.deadline ?? '', deadline ?? '')
          next = appendHistory(next, 'startDate', t.startDate ?? '', startDate ?? '')
          return next
        }),
      )
      if (isRemoteConfigured) runRemote(remoteApi.updateSchedule(id, startDate, deadline))
    },
    [appendHistory, runRemote],
  )

  const updateDependsOn = useCallback(
    (id: string, dependsOnIds: string[]) => {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, dependsOnIds } : t)))
      if (isRemoteConfigured) runRemote(remoteApi.updateDependsOn(id, dependsOnIds))
    },
    [runRemote],
  )

  // "確認者" — distinct from assigneeIds, pairs with the 確認待ち status so
  // it's clear who's expected to sign off (item 8: 確認者・レビュワー設定)
  const updateReviewer = useCallback(
    (id: string, reviewerId: string | null) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === id
            ? appendHistory({ ...t, reviewerId: reviewerId ?? undefined }, 'reviewer', t.reviewerId ?? '', reviewerId ?? '')
            : t,
        ),
      )
      if (isRemoteConfigured) runRemote(remoteApi.updateReviewer(id, reviewerId))
    },
    [appendHistory, runRemote],
  )

  // "困っている/作業が止まっている" flag, independent of status (item 7:
  // ブロッカー管理) — pass null/empty to clear
  const setBlocker = useCallback(
    (id: string, note: string | null) => {
      const trimmed = note?.trim() || null
      const since = trimmed ? new Date().toISOString().slice(0, 10) : null
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, blocker: trimmed ? { note: trimmed, since: since! } : undefined } : t)),
      )
      if (isRemoteConfigured) runRemote(remoteApi.setBlocker(id, trimmed, since))
    },
    [runRemote],
  )

  // 想定/実績の所要時間（item 5） — powers the Assignments page's
  // per-member 今週の工数 indicator and the INPUT screen's estimate suggestion
  const updateEstimatedHours = useCallback(
    (id: string, hours: number | null) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, estimatedHours: hours ?? undefined } : t)),
      )
      if (isRemoteConfigured) runRemote(remoteApi.updateEstimatedHours(id, hours))
    },
    [runRemote],
  )
  const updateActualHours = useCallback(
    (id: string, hours: number | null) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, actualHours: hours ?? undefined } : t)),
      )
      if (isRemoteConfigured) runRemote(remoteApi.updateActualHours(id, hours))
    },
    [runRemote],
  )

  // 完了時の振り返り（item 3） — pass null to clear
  const updateRetrospective = useCallback(
    (id: string, retrospective: TaskRetrospective | null) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, retrospective: retrospective ?? undefined } : t)),
      )
      if (isRemoteConfigured) runRemote(remoteApi.updateRetrospective(id, retrospective))
    },
    [runRemote],
  )

  // 成果物リンク管理（item 12） — Drive/Canva/GitHub/Figma等へのリンクを
  // タスクに複数紐付ける
  const addDeliverable = useCallback(
    (id: string, label: string, url: string) => {
      const l = label.trim()
      const u = url.trim()
      if (!l || !u) return
      const entry: TaskDeliverable = { id: `dl-${Math.random().toString(36).slice(2, 9)}`, label: l, url: u }
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t
          const next = [...(t.deliverables ?? []), entry]
          if (isRemoteConfigured) runRemote(remoteApi.updateDeliverables(id, next))
          return { ...t, deliverables: next }
        }),
      )
    },
    [runRemote],
  )
  const removeDeliverable = useCallback(
    (id: string, deliverableId: string) => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t
          const next = (t.deliverables ?? []).filter((d) => d.id !== deliverableId)
          if (isRemoteConfigured) runRemote(remoteApi.updateDeliverables(id, next))
          return { ...t, deliverables: next }
        }),
      )
    },
    [runRemote],
  )

  // コメント機能 — a discussion thread on the task, separate from
  // progressHistory (a status-update log, not a conversation)
  const addComment = useCallback(
    (id: string, text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      const entry: TaskComment = {
        id: `cm-${Math.random().toString(36).slice(2, 9)}`,
        text: trimmed,
        byId: currentUserId ?? '',
        at: new Date().toISOString(),
      }
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t
          const next = [...(t.comments ?? []), entry]
          if (isRemoteConfigured) runRemote(remoteApi.updateComments(id, next))
          return { ...t, comments: next }
        }),
      )
    },
    [currentUserId, runRemote],
  )
  const removeComment = useCallback(
    (id: string, commentId: string) => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t
          const next = (t.comments ?? []).filter((c) => c.id !== commentId)
          if (isRemoteConfigured) runRemote(remoteApi.updateComments(id, next))
          return { ...t, comments: next }
        }),
      )
    },
    [runRemote],
  )

  const updateAvatar = useCallback(
    (memberId: string, avatarColor: string, initials: string) => {
      const trimmedInitials = initials.trim().slice(0, 2).toUpperCase()
      // choosing a color+initials avatar supersedes any uploaded picture
      setMembers((prev) =>
        prev.map((m) =>
          m.id === memberId
            ? { ...m, avatarColor, initials: trimmedInitials || m.initials, avatarUrl: undefined }
            : m,
        ),
      )
      if (isRemoteConfigured) runRemote(remoteApi.updateAvatar(memberId, avatarColor, trimmedInitials))
    },
    [runRemote],
  )

  // uploads a resized profile picture (see person-detail.tsx) to the
  // configured Drive folder via GAS, returning a Promise so the UI can
  // show a loading/error state. Shows the raw data URL immediately as an
  // optimistic preview, then swaps in the real Drive-hosted URL.
  const uploadAvatarImage = useCallback(
    (memberId: string, dataUrl: string, filename: string) => {
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, avatarUrl: dataUrl } : m)))
      if (!isDriveConfigured) return Promise.resolve()
      return remoteApi
        .uploadAvatarImage(memberId, dataUrl, filename)
        .then(({ url }) => {
          setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, avatarUrl: url } : m)))
          setRemoteError(null)
        })
        .catch((err) => {
          reportRemoteError(err)
          throw err
        })
    },
    [reportRemoteError],
  )

  const persistOnboarded = useCallback((ids: Set<string>) => {
    try {
      window.localStorage.setItem(ONBOARDED_STORAGE_KEY, JSON.stringify([...ids]))
    } catch {
      /* ignore */
    }
  }, [])

  const completeOnboarding = useCallback(
    (will: string[]) => {
      if (!currentUserId) return
      updateWill(currentUserId, will)
      setOnboardedIds((prev) => {
        const next = new Set(prev)
        next.add(currentUserId)
        persistOnboarded(next)
        return next
      })
    },
    [currentUserId, updateWill, persistOnboarded],
  )

  const skipOnboarding = useCallback(() => {
    if (!currentUserId) return
    setOnboardedIds((prev) => {
      const next = new Set(prev)
      next.add(currentUserId)
      persistOnboarded(next)
      return next
    })
  }, [currentUserId, persistOnboarded])

  const clearSkillCertifiedEvent = useCallback(() => setSkillCertifiedEvent(null), [])

  const getMember = useCallback(
    (id: string | null) => members.find((m) => m.id === id),
    [members],
  )
  const getProject = useCallback(
    (id: string) => projects.find((p) => p.id === id),
    [projects],
  )
  const getInput = useCallback(
    (id: string | undefined) => (id ? inputs.find((i) => i.id === id) : undefined),
    [inputs],
  )

  const currentUser = useMemo(
    () => members.find((m) => m.id === currentUserId) ?? null,
    [members, currentUserId],
  )

  const visibleTasks = useMemo(() => {
    const canSeeExec = currentUser ? canSeeExecTasks(currentUser.role) : false
    return tasks.filter(
      (t) =>
        !t.pendingApproval &&
        !isArchived(t) &&
        (t.visibility !== '幹部' || canSeeExec),
    )
  }, [tasks, currentUser])
  const pendingTasks = useMemo(() => tasks.filter((t) => t.pendingApproval), [tasks])
  const archivedTasks = useMemo(
    () => tasks.filter((t) => !t.pendingApproval && isArchived(t)),
    [tasks],
  )

  const getProjectMembers = useCallback(
    (projectId: string) => {
      const project = projects.find((p) => p.id === projectId)
      const ids = Array.from(
        new Set([
          ...(project?.memberIds ?? []),
          ...visibleTasks.filter((t) => t.projectId === projectId).flatMap((t) => t.assigneeIds),
        ]),
      )
      return ids.map((id) => members.find((m) => m.id === id)).filter(Boolean) as Member[]
    },
    [projects, visibleTasks, members],
  )

  // Every configured role level except the single bottom-most one (see
  // roleLevels — default bottom level is 班長) is full admin, with
  // identical maximal privileges: unrestricted admin-section visibility,
  // project creation/deletion/template management, escalated (重要/
  // 対外公開) task approval authority, and unscoped project/task
  // visibility in adminProjects/adminTasks/adminPendingTasks below.
  // Only the bottom-most tier is scoped to its own project_ids. With a
  // single configured tier, that tier is trivially full admin.
  const isFullAdminMember = useCallback(
    (member: Member | null | undefined) => {
      if (!member || member.role === BASE_ROLE) return false
      if (roleLevels.length <= 1) return true
      return member.role !== roleLevels[0]
    },
    [roleLevels],
  )
  const isFullAdmin = useMemo(() => isFullAdminMember(currentUser), [isFullAdminMember, currentUser])

  // which admin-screen sections the current (non-top) admin role can see —
  // falls back to DEFAULT_NON_TOP_SECTIONS (everything but Members/Tags,
  // matching the old fixed behavior) when no explicit choice was configured
  const visibleAdminSections = useMemo<AdminSection[]>(() => {
    if (isFullAdmin) return ADMIN_SECTIONS.map((s) => s.key)
    if (!currentUser || currentUser.role === BASE_ROLE) return []
    const sections = rolePermissions[currentUser.role] ?? DEFAULT_NON_TOP_SECTIONS
    // dashboard is the redirect target for a disallowed section, so it must
    // always stay reachable to avoid a redirect loop
    return sections.includes('dashboard') ? sections : ['dashboard', ...sections]
  }, [isFullAdmin, currentUser, rolePermissions])

  const adminProjects = useMemo(() => {
    if (isFullAdmin || !currentUser) return projects
    const scope = new Set(currentUser.projectIds ?? [])
    return projects.filter((p) => scope.has(p.id))
  }, [projects, isFullAdmin, currentUser])

  const adminTasks = useMemo(() => {
    if (isFullAdmin || !currentUser) return visibleTasks
    const scope = new Set(currentUser.projectIds ?? [])
    return visibleTasks.filter((t) => scope.has(t.projectId))
  }, [visibleTasks, isFullAdmin, currentUser])

  const adminPendingTasks = useMemo(() => {
    if (isFullAdmin || !currentUser) return pendingTasks
    const scope = new Set(currentUser.projectIds ?? [])
    return pendingTasks.filter((t) => scope.has(t.projectId))
  }, [pendingTasks, isFullAdmin, currentUser])

  const notifications = useMemo(() => {
    if (!currentUser) return []
    const items: import('./types').NotificationItem[] = []
    const isAdmin = currentUser.role !== '一般'
    if (isAdmin) {
      adminPendingTasks.forEach((t) => {
        items.push({
          id: `approval-${t.id}`,
          kind: 'approval',
          title: `承認依頼: ${t.name}`,
          detail: '新しいタスクが承認待ちです',
          taskId: t.id,
        })
      })
      adminTasks
        .filter((t) => t.status === 'review')
        .forEach((t) => {
          items.push({
            id: `review-${t.id}`,
            kind: 'review',
            title: `確認待ち: ${t.name}`,
            detail: '完了の確認が必要です',
            taskId: t.id,
          })
        })
      // item 10: SLA/放置アラート — 確認待ちが3日、進行中タスクの更新が
      // 7日ないと通知。lastActivity は既存の「放置検知」用フィールド
      // (types.ts) をそのまま流用
      adminTasks.forEach((t) => {
        const idle = daysSince(t.lastActivity)
        if (idle === null) return
        if (t.status === 'review' && idle >= 3) {
          items.push({
            id: `stale-review-${t.id}`,
            kind: 'stale',
            title: `確認待ちが${idle}日経過: ${t.name}`,
            detail: '対応が滞っていないか確認してください',
            taskId: t.id,
          })
        } else if (t.status !== 'done' && t.status !== 'review' && idle >= 7) {
          items.push({
            id: `stale-progress-${t.id}`,
            kind: 'stale',
            title: `${idle}日間更新なし: ${t.name}`,
            detail: '進捗を確認してください',
            taskId: t.id,
          })
        }
      })
    }
    visibleTasks
      .filter((t) => t.assigneeIds.includes(currentUser.id) && t.status !== 'done')
      .forEach((t) => {
        const dl = deadlineLevel(t)
        if (dl.level === 'overdue' || dl.level === 'today' || dl.level === 'soon' || dl.level === 'near') {
          items.push({
            id: `deadline-${t.id}`,
            kind: 'deadline',
            title: t.name,
            detail: dl.label,
            taskId: t.id,
          })
        }
      })
    return items
  }, [currentUser, adminPendingTasks, adminTasks, visibleTasks])

  const projectTypes = useMemo(
    () =>
      uniq([
        ...Object.keys(projectTemplates),
        ...projects.map((p) => p.type ?? '').filter(Boolean),
      ]),
    [projectTemplates, projects],
  )

  const needsOnboarding = !!(
    currentUser &&
    currentUser.will.length === 0 &&
    !onboardedIds.has(currentUser.id)
  )

  // true once every configured remote source has either resolved or given
  // up (error). Consumers (orbit-app.tsx's Router, admin-screen.tsx) use
  // this to avoid computing permissions/redirects against the transient
  // pre-fetch state, where members/roleLevels/rolePermissions can be empty
  // or still at their defaults.
  const dataReady =
    (!isRemoteConfigured || remoteStatus === 'ready' || remoteStatus === 'error') &&
    settingsReady

  const value: OrbitContextValue = {
    currentUserId,
    tasks,
    visibleTasks,
    pendingTasks,
    archivedTasks,
    members,
    projects,
    inputs,
    mode,
    currentUser,
    remoteEnabled: isRemoteConfigured,
    driveEnabled: isDriveConfigured,
    remoteStatus,
    remoteError,
    dataReady,
    refreshing,
    refreshAll,
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
    visibleAdminSections,
    projectTemplates,
    projectTypes,
    setProjectTemplateTasks,
    removeProjectType,
    taskSetTemplates,
    addTaskSetTemplate,
    updateTaskSetTemplateItems,
    removeTaskSetTemplate,
    applyTaskSetTemplate,
    recurringRules,
    jobRequirements,
    setJobRequirements,
    addRecurringRule,
    removeRecurringRule,
    toggleRecurringRule,
    needsOnboarding,
    completeOnboarding,
    skipOnboarding,
    skillCertifiedEvent,
    clearSkillCertifiedEvent,
    login,
    logout,
    setMode,
    addTasksFromInput,
    updateTaskStatus,
    updatePriority,
    updateDifficulty,
    updateProgress,
    assignTask,
    updateWill,
    updateJudgment,
    approveTask,
    addProject,
    removeProject,
    updateProjectMembers,
    updateProjectOwner,
    addMember,
    removeMember,
    updateNotify,
    updateEmail,
    updateMemberProjects,
    isFullAdmin,
    adminProjects,
    adminTasks,
    adminPendingTasks,
    updateRole,
    updateReportsTo,
    updateMentor,
    updateSearchProfile,
    updateCareerHistory,
    updateQualifications,
    updateEvaluationHistory,
    updateTransferHistory,
    updateSkillLevels,
    updateCompetencies,
    updateCareerGoals,
    updateTrainingHistory,
    updateDevelopmentPlan,
    updateOneOnOnes,
    updateDisplayName,
    toggleUnavailableDate,
    updateSchedule,
    updateDependsOn,
    updateReviewer,
    setBlocker,
    updateEstimatedHours,
    updateActualHours,
    updateRetrospective,
    addDeliverable,
    removeDeliverable,
    addComment,
    removeComment,
    updateAvatar,
    uploadAvatarImage,
    notifications,
    getMember,
    getProject,
    getInput,
    getProjectMembers,
  }

  return <OrbitContext.Provider value={value}>{children}</OrbitContext.Provider>
}

export function useOrbit() {
  const ctx = useContext(OrbitContext)
  if (!ctx) throw new Error('useOrbit must be used within OrbitProvider')
  return ctx
}
