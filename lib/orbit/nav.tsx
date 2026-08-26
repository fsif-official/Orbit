'use client'

import { createContext, useContext, useState, useCallback } from 'react'

import type { Department } from './types'

export type OutputTarget = 'all' | 'people' | 'projects'
export type OutputView = 'workflow' | 'list' | 'calendar' | 'difficulty'

export type Screen =
  | { name: 'input' }
  | {
      name: 'output'
      target?: OutputTarget
      view?: OutputView
      department?: Department
    }
  | { name: 'person'; id: string }
  | { name: 'project'; id: string }
  | {
      name: 'admin'
      section: 'dashboard' | 'assignments' | 'approvals' | 'projects' | 'members' | 'tags'
    }

interface NavValue {
  screen: Screen
  go: (s: Screen) => void
}

const NavContext = createContext<NavValue | null>(null)

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [screen, setScreen] = useState<Screen>({ name: 'input' })
  const go = useCallback((s: Screen) => {
    setScreen(s)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 })
  }, [])
  return <NavContext.Provider value={{ screen, go }}>{children}</NavContext.Provider>
}

export function useNav() {
  const ctx = useContext(NavContext)
  if (!ctx) throw new Error('useNav must be used within NavProvider')
  return ctx
}
