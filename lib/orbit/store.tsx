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
  Task,
  TaskStatus,
  Priority,
  TaskInput,
  ParsedTask,
  ProgressEntry,
} from './types'
import { MEMBERS, PROJECTS, SEED_TASKS, SEED_INPUTS } from './seed'
import { fetchRemoteData, isRemoteConfigured, remoteApi, toCreatePayload } from './remote'

type Mode = 'input' | 'output'
type RemoteStatus = 'idle' | 'loading' | 'ready' | 'error'

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
  // whether the app is backed by the live spreadsheet (via GAS/CSV) or the
  // local mock data — surfaced so the UI can show sync state.
  remoteEnabled: boolean
  remoteStatus: RemoteStatus
  remoteError: string | null
  login: (userId: string) => void
  logout: () => void
  setMode: (m: Mode) => void
  // Register approved parsed tasks as a single natural-language input.
  addTasksFromInput: (text: string, parsed: ParsedTask[]) => void
  updateTaskStatus: (id: string, status: TaskStatus) => void
  updatePriority: (id: string, priority: Priority) => void
  updateProgress: (id: string, text: string) => void
  assignTask: (id: string, memberId: string | null) => void
  updateWill: (memberId: string, will: string[]) => void
  updateJudgment: (memberId: string, judgment: string[]) => void
  getMember: (id: string | null) => Member | undefined
  getProject: (id: string) => Project | undefined
  getInput: (id: string | undefined) => TaskInput | undefined
}

const OrbitContext = createContext<OrbitContextValue | null>(null)

const STORAGE_KEY = 'orbit-state-v2'

function loadState(): Partial<OrbitState> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Partial<OrbitState>) : null
  } catch {
    return null
  }
}

export function OrbitProvider({ children }: { children: React.ReactNode }) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [tasks, setTasks] = useState<Task[]>(SEED_TASKS)
  const [members, setMembers] = useState<Member[]>(MEMBERS)
  const [projects, setProjects] = useState<Project[]>(PROJECTS)
  const [inputs, setInputs] = useState<TaskInput[]>(SEED_INPUTS)
  const [mode, setModeState] = useState<Mode>('input')
  const [hydrated, setHydrated] = useState(false)
  const [remoteStatus, setRemoteStatus] = useState<RemoteStatus>('idle')
  const [remoteError, setRemoteError] = useState<string | null>(null)

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

  const login = useCallback((userId: string) => {
    setCurrentUserId(userId)
    setModeState('input')
  }, [])

  const logout = useCallback(() => {
    setCurrentUserId(null)
  }, [])

  const setMode = useCallback((m: Mode) => setModeState(m), [])

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
        assigneeId: null,
        deadline: p.deadline,
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

  const updateTaskStatus = useCallback(
    (id: string, status: TaskStatus) => {
      const today = new Date().toISOString().slice(0, 10)
      setTasks((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                status,
                lastActivity: today,
                completedDate: status === 'done' ? today : null,
              }
            : t,
        ),
      )
      if (isRemoteConfigured) runRemote(remoteApi.updateTaskStatus(id, status))
    },
    [runRemote],
  )

  const assignTask = useCallback(
    (id: string, memberId: string | null) => {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, assigneeId: memberId } : t)))
      if (isRemoteConfigured) runRemote(remoteApi.assignTask(id, memberId))
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

  const value: OrbitContextValue = {
    currentUserId,
    tasks,
    members,
    projects,
    inputs,
    mode,
    currentUser,
    remoteEnabled: isRemoteConfigured,
    remoteStatus,
    remoteError,
    login,
    logout,
    setMode,
    addTasksFromInput,
    updateTaskStatus,
    updatePriority,
    updateProgress,
    assignTask,
    updateWill,
    updateJudgment,
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
