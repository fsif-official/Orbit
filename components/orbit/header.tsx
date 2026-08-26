'use client'

import { useEffect, useRef, useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useNav } from '@/lib/orbit/nav'
import { useTheme } from '@/lib/orbit/theme'
import { useTaskDrawer } from '@/lib/orbit/task-drawer'
import { isAdminRole } from '@/lib/orbit/types'
import { Avatar, OrbitMark } from './primitives'
import { cn } from '@/lib/utils'
import {
  ArrowLeft,
  Bell,
  CalendarClock,
  CheckCheck,
  ChevronDown,
  ClipboardCheck,
  LogOut,
  Moon,
  ShieldCheck,
  Sun,
  User,
} from 'lucide-react'

export function Header() {
  const { currentUser, setMode, logout, notifications } = useOrbit()
  const { screen, go, goBack, canGoBack } = useNav()
  const { theme, toggle } = useTheme()
  const { openTask } = useTaskDrawer()
  const [menuOpen, setMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  if (!currentUser) return null

  const handleMode = (m: 'input' | 'output') => {
    setMode(m)
    go({ name: m })
  }

  const isInputActive = screen.name === 'input'
  const isOutputActive =
    screen.name === 'output' ||
    screen.name === 'person' ||
    screen.name === 'project'

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6">
        {/* left */}
        <div className="flex shrink-0 items-center gap-1">
          {canGoBack && (
            <button
              type="button"
              onClick={goBack}
              className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="前の画面に戻る"
              title="戻る"
            >
              <ArrowLeft className="size-[18px]" />
            </button>
          )}
          <button
            type="button"
            onClick={() => handleMode('output')}
            className="flex shrink-0 items-center gap-2"
          >
            <OrbitMark size={22} />
            <span className="text-[15px] font-semibold tracking-tight">Orbit</span>
          </button>
        </div>

        {/* center: mode switch */}
        <div className="flex items-center rounded-lg border border-border bg-secondary p-0.5">
          <ModeButton
            active={isInputActive}
            onClick={() => handleMode('input')}
            sub="仕事を書く"
          >
            INPUT
          </ModeButton>
          <ModeButton
            active={isOutputActive}
            onClick={() => handleMode('output')}
            sub="組織で見る"
          >
            OUTPUT
          </ModeButton>
        </div>

        {/* right */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={toggle}
            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label={theme === 'dark' ? 'ライトモードに切替' : 'ダークモードに切替'}
            title={theme === 'dark' ? 'ライトモード' : 'ダークモード'}
          >
            {theme === 'dark' ? (
              <Sun className="size-[18px]" />
            ) : (
              <Moon className="size-[18px]" />
            )}
          </button>
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => setNotifOpen((o) => !o)}
              className="relative flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="通知"
              aria-expanded={notifOpen}
            >
              <Bell className="size-[18px]" />
              {notifications.length > 0 && (
                <span className="absolute right-1.5 top-1.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">
                  {notifications.length > 9 ? '9+' : notifications.length}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-80 overflow-hidden rounded-xl border border-border bg-popover shadow-lg animate-in fade-in slide-in-from-top-1">
                <div className="border-b border-border px-3 py-2 text-sm font-semibold">通知</div>
                <div className="max-h-96 overflow-y-auto orbit-scroll">
                  {notifications.length === 0 && (
                    <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                      <CheckCheck className="size-4" />
                      新しい通知はありません
                    </div>
                  )}
                  {notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => {
                        setNotifOpen(false)
                        if (n.taskId) openTask(n.taskId)
                      }}
                      className="flex w-full items-start gap-2.5 border-b border-border px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-secondary"
                    >
                      {n.kind === 'deadline' ? (
                        <CalendarClock className="mt-0.5 size-4 shrink-0 text-warning" />
                      ) : (
                        <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{n.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{n.detail}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-1.5 transition-colors hover:bg-secondary"
              aria-expanded={menuOpen}
            >
              <Avatar member={currentUser} size={28} />
              <span className="hidden text-sm font-medium sm:inline">
                {currentUser.displayName || currentUser.name}
              </span>
              <ChevronDown className="size-4 text-muted-foreground" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-56 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg animate-in fade-in slide-in-from-top-1">
                <div className="flex items-center gap-2.5 px-2.5 py-2">
                  <Avatar member={currentUser} size={34} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {currentUser.displayName || currentUser.name}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {currentUser.affiliation}
                    </div>
                  </div>
                </div>
                <div className="my-1 h-px bg-border" />
                {isAdminRole(currentUser.role) && (
                  <MenuItem
                    onClick={() => {
                      setMenuOpen(false)
                      go({ name: 'admin', section: 'dashboard' })
                    }}
                    highlight
                  >
                    <ShieldCheck className="size-4" />
                    ADMIN
                  </MenuItem>
                )}
                <MenuItem
                  onClick={() => {
                    setMenuOpen(false)
                    go({ name: 'person', id: currentUser.id })
                  }}
                >
                  <User className="size-4" />
                  プロフィール
                </MenuItem>
                <div className="my-1 h-px bg-border" />
                <MenuItem onClick={logout}>
                  <LogOut className="size-4" />
                  ログアウト
                </MenuItem>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

function ModeButton({
  active,
  onClick,
  children,
  sub,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  sub: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-w-[136px] flex-col items-center rounded-[7px] px-4 py-1 text-center transition-all',
        active
          ? 'bg-card text-foreground shadow-[0_1px_2px_rgba(16,24,40,0.08)]'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <span className="text-[13px] font-semibold tracking-wide">{children}</span>
      <span
        className={cn(
          'text-[10px] leading-none',
          active ? 'text-primary' : 'text-muted-foreground/70',
        )}
      >
        {sub}
      </span>
    </button>
  )
}

function MenuItem({
  children,
  onClick,
  highlight,
}: {
  children: React.ReactNode
  onClick?: () => void
  highlight?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-secondary',
        highlight ? 'font-medium text-accent-foreground' : 'text-foreground',
      )}
    >
      {children}
    </button>
  )
}
