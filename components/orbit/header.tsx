'use client'

import { useEffect, useRef, useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useNav } from '@/lib/orbit/nav'
import { useTheme } from '@/lib/orbit/theme'
import { Avatar, OrbitMark } from './primitives'
import { cn } from '@/lib/utils'
import {
  Bell,
  ChevronDown,
  LogOut,
  Moon,
  Settings,
  ShieldCheck,
  Sun,
  User,
} from 'lucide-react'

export function Header() {
  const { currentUser, setMode, logout } = useOrbit()
  const { screen, go } = useNav()
  const { theme, toggle } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
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
        <button
          type="button"
          onClick={() => handleMode('output')}
          className="flex shrink-0 items-center gap-2"
        >
          <OrbitMark size={22} />
          <span className="text-[15px] font-semibold tracking-tight">Orbit</span>
        </button>

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
          <button
            type="button"
            className="relative flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="通知"
          >
            <Bell className="size-[18px]" />
            <span className="absolute right-2 top-2 size-1.5 rounded-full bg-primary" />
          </button>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-1.5 transition-colors hover:bg-secondary"
              aria-expanded={menuOpen}
            >
              <Avatar member={currentUser} size={28} />
              <span className="hidden text-sm font-medium sm:inline">
                {currentUser.name}
              </span>
              <ChevronDown className="size-4 text-muted-foreground" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-56 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg animate-in fade-in slide-in-from-top-1">
                <div className="flex items-center gap-2.5 px-2.5 py-2">
                  <Avatar member={currentUser} size={34} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {currentUser.name}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {currentUser.affiliation}
                    </div>
                  </div>
                </div>
                <div className="my-1 h-px bg-border" />
                {currentUser.role === 'admin' && (
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
                <MenuItem onClick={() => setMenuOpen(false)}>
                  <Settings className="size-4" />
                  設定
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
