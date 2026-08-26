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
  Member,
  Project,
  ProjectTemplateTask,
  Task,
  TaskStatus,
  Priority,
  Difficulty,
  TaskInput,
  ParsedTask,
  ProgressEntry,
} from './types'
import { MEMBERS, PROJECTS, SEED_TASKS, SEED_INPUTS } from './seed'
import { fetchRemoteData, isRemoteConfigured, remoteApi, toCreatePayload } from './remote'
import { daysSince } from './utils'

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
  'デザイン', '渉外', 'イベント', '広報', 'ライティング', '企画', 'リサーチ', '開発', '物品調達',
]

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
  remoteStatus: RemoteStatus
  remoteError: string | null
  skillOptions: string[]
  categoryOptions: string[]
  addSkillOption: (name: string) => void
  removeSkillOption: (name: string) => void
  addCategoryOption: (name: string) => void
  removeCategoryOption: (name: string) => void
  projectTemplates: Record<string, ProjectTemplateTask[]>
  projectTypes: string[]
  setProjectTemplateTasks: (type: string, tasks: ProjectTemplateTask[]) => void
  removeProjectType: (type: string) => void
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
  removeMember: (memberId: string) => void
  updateNotify: (memberId: string, notify: boolean) => void
  getMember: (id: string | null) => Member | undefined
  getProject: (id: string) => Project | undefined
  getInput: (id: string | undefined) => TaskInput | undefined
}

const OrbitContext = createContext<OrbitContextValue | null>(null)

const STORAGE_KEY = 'orbit-state-v2'
const TAGS_STORAGE_KEY = 'orbit-tag-options'
const ONBOARDED_STORAGE_KEY = 'orbit-onboarded-ids'
const TEMPLATES_STORAGE_KEY = 'orbit-project-templates'

function loadState(): Partial<OrbitState> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Partial<OrbitState>) : null
  } catch {
    return null
  }
}

function loadTagOptions(): { skills: string[]; categories: string[] } | null {
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

function uniq(list: string[]): string[] {
  return Array.from(new Set(list.map((s) => s.trim()).filter(Boolean)))
}

export function OrbitProvider({ children }: { children: React.ReactNode }) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [tasks, setTasks] = useState<Task[]>(SEED_TASKS)
  const [members, setMembers] = useState<Member[]>(MEMBERS)
  const [projects, setProjects] = useState<Project[]>(PROJECTS)
  const [inputs, setInputs] = useState<TaskInput[]>(SEED_INPUTS)
  const [mode, setModeState] = useState<Mode>('output')
  const [hydrated, setHydrated] = useState(false)
  const [remoteStatus, setRemoteStatus] = useState<RemoteStatus>('idle')
  const [remoteError, setRemoteError] = useState<string | null>(null)
  const [skillOptions, setSkillOptions] = useState<string[]>(DEFAULT_SKILL_OPTIONS)
  const [categoryOptions, setCategoryOptions] = useState<string[]>(DEFAULT_CATEGORY_OPTIONS)
  const [projectTemplates, setProjectTemplates] = useState<Record<string, ProjectTemplateTask[]>>({})
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
    const tags = loadTagOptions()
    if (tags) {
      if (tags.skills?.length) setSkillOptions(uniq([...DEFAULT_SKILL_OPTIONS, ...tags.skills]))
      if (tags.categories?.length)
        setCategoryOptions(uniq([...DEFAULT_CATEGORY_OPTIONS, ...tags.categories]))
    }
    setOnboardedIds(new Set(loadOnboardedIds()))
    setProjectTemplates(loadProjectTemplates())
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

  // keep the skill/category pools growing with whatever actually shows up
  // on tasks (from the sheet or elsewhere), not just manually-added ones
  useEffect(() => {
    const seenSkills = uniq(tasks.flatMap((t) => t.skills))
    const seenCategories = uniq(tasks.map((t) => t.category))
    setSkillOptions((prev) => uniq([...prev, ...seenSkills]))
    setCategoryOptions((prev) => uniq([...prev, ...seenCategories]))
  }, [tasks])

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

  // persist skill/category tag pools (device-local — see gas/README.md)
  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(
        TAGS_STORAGE_KEY,
        JSON.stringify({ skills: skillOptions, categories: categoryOptions }),
      )
    } catch {
      /* ignore */
    }
  }, [skillOptions, categoryOptions, hydrated])

  // persist project-type templates (device-local, same caveat as tags)
  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(projectTemplates))
    } catch {
      /* ignore */
    }
  }, [projectTemplates, hydrated])

  const login = useCallback((userId: string) => {
    setCurrentUserId(userId)
    setModeState('output')
  }, [])

  const logout = useCallback(() => {
    setCurrentUserId(null)
  }, [])

  const setMode = useCallback((m: Mode) => setModeState(m), [])

  const addSkillOption = useCallback((name: string) => {
    const v = name.trim()
    if (!v) return
    setSkillOptions((prev) => (prev.includes(v) ? prev : [...prev, v]))
  }, [])
  const removeSkillOption = useCallback((name: string) => {
    setSkillOptions((prev) => prev.filter((s) => s !== name))
  }, [])
  const addCategoryOption = useCallback((name: string) => {
    const v = name.trim()
    if (!v) return
    setCategoryOptions((prev) => (prev.includes(v) ? prev : [...prev, v]))
  }, [])
  const removeCategoryOption = useCallback((name: string) => {
    setCategoryOptions((prev) => prev.filter((c) => c !== name))
  }, [])

  const setProjectTemplateTasks = useCallback((type: string, tasksForType: ProjectTemplateTask[]) => {
    setProjectTemplates((prev) => ({ ...prev, [type]: tasksForType }))
  }, [])
  const removeProjectType = useCallback((type: string) => {
    setProjectTemplates((prev) => {
      const next = { ...prev }
      delete next[type]
      return next
    })
  }, [])

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

  const updatePriority = useCallback(
    (id: string, priority: Priority) => {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, priority } : t)))
      if (isRemoteConfigured) runRemote(remoteApi.updatePriority(id, priority))
    },
    [runRemote],
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
          ? {
              ...t,
              status,
              lastActivity: today,
              completedDate: status === 'done' ? today : null,
            }
          : t,
      )
      setTasks(updated)
      if (status === 'done') maybeCertifySkill(updated, id)
      // entering 確認待ち is the assignee's "I'm done, please confirm" signal
      // — the admin gets emailed (gas/Code.gs) and already sees it surface
      // in the Admin dashboard's 確認待ち panel automatically.
      if (isRemoteConfigured) runRemote(remoteApi.updateTaskStatus(id, status))
    },
    [tasks, maybeCertifySkill, runRemote],
  )

  const assignTask = useCallback(
    (id: string, memberIds: string[]) => {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, assigneeIds: memberIds } : t)))
      if (isRemoteConfigured) runRemote(remoteApi.assignTask(id, memberIds))
    },
    [runRemote],
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

  const visibleTasks = useMemo(
    () => tasks.filter((t) => !t.pendingApproval && !isArchived(t)),
    [tasks],
  )
  const pendingTasks = useMemo(() => tasks.filter((t) => t.pendingApproval), [tasks])
  const archivedTasks = useMemo(
    () => tasks.filter((t) => !t.pendingApproval && isArchived(t)),
    [tasks],
  )

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
    remoteStatus,
    remoteError,
    skillOptions,
    categoryOptions,
    addSkillOption,
    removeSkillOption,
    addCategoryOption,
    removeCategoryOption,
    projectTemplates,
    projectTypes,
    setProjectTemplateTasks,
    removeProjectType,
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
    removeMember,
    updateNotify,
    getMember,
    getProject,
    getInput,
  }

  return <OrbitContext.Provider value={value}>{children}</OrbitContext.Provider>
}

export function useOrbit() {
  const ctx = useContext(OrbitContext)
  if (!ctx) throw new Error('useOrbit must be used within OrbitProvider')
  return ctx
}
