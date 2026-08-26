'use client'

import { useNav } from '@/lib/orbit/nav'
import { AdminDashboard } from './admin-dashboard'
import { AdminAssignments } from './admin-assignments'
import { AdminMembers } from './admin-members'
import { LayoutDashboard, UserPlus, Users } from 'lucide-react'

type Section = 'dashboard' | 'assignments' | 'members'

const NAV: { key: Section; label: string; icon: React.ReactNode }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="size-4" /> },
  { key: 'assignments', label: 'Assignments', icon: <UserPlus className="size-4" /> },
  { key: 'members', label: 'Members', icon: <Users className="size-4" /> },
]

export function AdminScreen({ section }: { section: Section }) {
  const { go } = useNav()

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {/* Sidebar */}
      <aside className="hidden w-56 shrink-0 border-r border-border bg-card md:block">
        <div className="px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            ADMIN
          </div>
        </div>
        <nav className="space-y-0.5 px-2">
          {NAV.map((n) => (
            <button
              key={n.key}
              onClick={() => go({ name: 'admin', section: n.key })}
              className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                n.key === section
                  ? 'bg-accent font-medium text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
              }`}
            >
              {n.icon}
              {n.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Mobile tabs */}
      <div className="w-full">
        <div className="flex gap-1 border-b border-border bg-card px-4 py-2 md:hidden">
          {NAV.map((n) => (
            <button
              key={n.key}
              onClick={() => go({ name: 'admin', section: n.key })}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors ${
                n.key === section
                  ? 'bg-accent font-medium text-accent-foreground'
                  : 'text-muted-foreground'
              }`}
            >
              {n.icon}
              {n.label}
            </button>
          ))}
        </div>

        <div className="bg-background">
          {section === 'dashboard' && <AdminDashboard />}
          {section === 'assignments' && <AdminAssignments />}
          {section === 'members' && <AdminMembers />}
        </div>
      </div>
    </div>
  )
}
