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

type Mode = 'input' | 'output'

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
  const [projects] = useState<Project[]>(PROJECTS)
  const [inputs, setInputs] = useState<TaskInput[]>(SEED_INPUTS)
  const [mode, setModeState] = useState<Mode>('input')
  const [hydrated, setHydrated] = useState(false)

  // hydrate from localStorage once
  useEffect(() => {
    const saved = loadState()
    if (saved) {
      if (saved.currentUserId) setCurrentUserId(saved.currentUserId)
      if (saved.tasks) setTasks(saved.tasks)
      if (saved.members) setMembers(saved.members)
      if (saved.inputs) setInputs(saved.inputs)
      if (saved.mode) setModeState(saved.mode)
    }
    setHydrated(true)
  }, [])

  // persist
  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ currentUserId, tasks, members, inputs, mode }),
      )
    } catch {
      /* ignore */
    }
  }, [currentUserId, tasks, members, inputs, mode, hydrated])

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
    },
    [currentUserId],
  )

  const updatePriority = useCallback((id: string, priority: Priority) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, priority } : t)),
    )
  }, [])

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
    },
    [currentUserId],
  )

  const updateTaskStatus = useCallback((id: string, status: TaskStatus) => {
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
  }, [])

  const assignTask = useCallback((id: string, memberId: string | null) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, assigneeId: memberId } : t)),
    )
  }, [])

  const updateWill = useCallback((memberId: string, will: string[]) => {
    setMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, will } : m)),
    )
  }, [])

  const updateJudgment = useCallback((memberId: string, judgment: string[]) => {
    setMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, judgment } : m)),
    )
  }, [])

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
