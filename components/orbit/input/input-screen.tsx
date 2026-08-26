'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useOrbit } from '@/lib/orbit/store'
import { useNav } from '@/lib/orbit/nav'
import { useToast } from '../toast'
import { buildDemoParse, DEMO_INPUT } from '@/lib/orbit/seed'
import type { ParsedTask, Task } from '@/lib/orbit/types'
import { ParsedTaskCard } from './parsed-task-card'
import { OrbitMark } from '../primitives'
import { ArrowRight, Sparkles, TriangleAlert, Wand2 } from 'lucide-react'

type Phase = 'input' | 'parsing' | 'result'

export function InputScreen() {
  const { addTasks, setMode } = useOrbit()
  const { go } = useNav()
  const toast = useToast()

  const [text, setText] = useState('')
  const [phase, setPhase] = useState<Phase>('input')
  const [parsed, setParsed] = useState<ParsedTask[]>([])
  const [emptyError, setEmptyError] = useState(false)
  const [parseFailed, setParseFailed] = useState(false)
  const [registered, setRegistered] = useState(false)

  const handleParse = () => {
    if (!text.trim()) {
      setEmptyError(true)
      return
    }
    setEmptyError(false)
    setParseFailed(false)
    setPhase('parsing')
    setTimeout(() => {
      // Fake AI: demo input yields the predefined result; anything else
      // yields a light heuristic split by lines. Empty-ish -> fail.
      const result = parseText(text)
      if (result.length === 0) {
        setParseFailed(true)
        setPhase('input')
        return
      }
      setParsed(result)
      setPhase('result')
    }, 1600)
  }

  const approvedCount = parsed.filter((p) => p.approved).length

  const handleRegister = () => {
    const approved = parsed.filter((p) => p.approved)
    if (approved.length === 0) return
    const tasks: Task[] = approved.map((p) => ({
      id: `t-${Math.random().toString(36).slice(2, 9)}`,
      name: p.name,
      description: '',
      projectId: p.projectId,
      assigneeId: null,
      deadline: p.deadline,
      category: p.category,
      skills: p.skills,
      difficulty: p.difficulty,
      status: 'todo',
      lastActivity: new Date().toISOString().slice(0, 10),
    }))
    addTasks(tasks)
    toast(`${tasks.length}件のタスクを登録しました`)
    setPhase('input')
    setText('')
    setParsed([])
    setRegistered(true)
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-10 sm:px-6 sm:pt-16">
      {phase !== 'result' && (
        <>
          {/* Hero */}
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="size-3.5 text-primary" />
              INPUT
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px] text-balance">
              今日、何を進めますか？
            </h1>
            <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-muted-foreground text-pretty">
              やることをそのまま書いてください。Orbitがタスクとして整理します。
            </p>
          </div>

          {/* Textarea */}
          <div className="rounded-2xl border border-border bg-card p-2 shadow-[0_1px_3px_rgba(16,24,40,0.05)] focus-within:border-border-strong focus-within:shadow-[0_0_0_3px_rgba(99,102,241,0.12)]">
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                if (e.target.value.trim()) setEmptyError(false)
              }}
              rows={7}
              disabled={phase === 'parsing'}
              placeholder="来週金曜日までにイベント用のポスターを作成する。Canvaを使える人にお願いしたい。"
              className="min-h-[168px] w-full resize-none bg-transparent px-3 py-2.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-60"
              aria-label="やること"
            />
            <div className="flex items-center justify-between gap-3 px-2 pb-1 pt-1">
              <span className="text-xs text-muted-foreground">
                複数のタスクをまとめて入力できます。
              </span>
              <Button
                onClick={handleParse}
                disabled={phase === 'parsing'}
                className="h-9 px-4"
              >
                {phase === 'parsing' ? (
                  <>
                    <OrbitMark size={15} />
                    整理中…
                  </>
                ) : (
                  <>
                    <Wand2 className="size-4" />
                    タスクを整理する
                  </>
                )}
              </Button>
            </div>
          </div>

          {emptyError && (
            <p className="mt-2.5 flex items-center gap-1.5 text-sm text-destructive">
              <TriangleAlert className="size-4" />
              タスク内容を入力してください
            </p>
          )}
          {parseFailed && (
            <p className="mt-2.5 flex items-center gap-1.5 text-sm text-destructive">
              <TriangleAlert className="size-4" />
              分類できませんでした。内容を確認して手動で編集してください。
            </p>
          )}

          {/* demo helper */}
          {phase === 'input' && !text && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">例文を使う:</span>
              <button
                type="button"
                onClick={() => setText(DEMO_INPUT)}
                className="rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-border-strong hover:bg-secondary"
              >
                イベント準備の4タスクを入力
              </button>
            </div>
          )}

          {registered && phase === 'input' && (
            <div className="mt-6 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <span className="text-sm font-medium text-emerald-800">
                タスクを登録しました。OUTPUTで確認できます。
              </span>
              <Button
                variant="outline"
                className="h-8 border-emerald-300 bg-card text-emerald-700"
                onClick={() => {
                  setMode('output')
                  go({ name: 'output' })
                }}
              >
                OUTPUTを見る
                <ArrowRight className="size-4" />
              </Button>
            </div>
          )}

          {phase === 'parsing' && (
            <div className="mt-8 flex flex-col items-center gap-3 text-center">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <span className="relative flex size-4">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/40" />
                  <span className="relative inline-flex size-4 rounded-full bg-primary" />
                </span>
                Orbitがタスクを整理しています…
              </div>
              <div className="w-full max-w-sm space-y-2">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-14 animate-pulse rounded-xl border border-border bg-card"
                    style={{ animationDelay: `${i * 120}ms` }}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {phase === 'result' && (
        <div className="animate-in fade-in slide-in-from-bottom-2">
          <div className="mb-5">
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="size-3.5 text-primary" />
              解析結果
            </div>
            <h2 className="text-xl font-semibold tracking-tight">
              {parsed.length}件のタスクを見つけました
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              内容を確認し、必要であれば修正してください。承認したタスクだけ登録されます。
            </p>
          </div>

          <div className="space-y-3">
            {parsed.map((p) => (
              <ParsedTaskCard
                key={p.id}
                task={p}
                onChange={(t) =>
                  setParsed((prev) => prev.map((x) => (x.id === t.id ? t : x)))
                }
                onToggle={() =>
                  setParsed((prev) =>
                    prev.map((x) =>
                      x.id === p.id ? { ...x, approved: !x.approved } : x,
                    ),
                  )
                }
              />
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
            <span className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{approvedCount}</span>
              /{parsed.length} 件を承認中
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                className="h-9"
                onClick={() => {
                  setPhase('input')
                  setParsed([])
                }}
              >
                やり直す
              </Button>
              <Button
                className="h-9 px-4"
                disabled={approvedCount === 0}
                onClick={handleRegister}
              >
                選択したタスクを登録
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

// Fake parser: demo string → predefined; otherwise line-based heuristic.
function parseText(text: string): ParsedTask[] {
  const normalized = text.replace(/\s+/g, '')
  const demoNorm = DEMO_INPUT.replace(/\s+/g, '')
  if (normalized === demoNorm || normalized.includes('イベント用のポスター')) {
    return buildDemoParse()
  }

  const lines = text
    .split(/[\n。]/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 3)

  return lines.map((line) => {
    const name = line.length > 24 ? line.slice(0, 24) + '…' : line
    const skills: string[] = []
    if (/デザイン|ポスター|canva/i.test(line)) skills.push('デザイン')
    if (/メール|連絡|案内/.test(line)) skills.push('コミュニケーション')
    if (/sns|投稿|告知/i.test(line)) skills.push('SNS')
    if (/記事|執筆|ライティング/.test(line)) skills.push('ライティング')
    if (skills.length === 0) skills.push('リサーチ')
    const deadlineMatch = line.match(/(\d{1,2})月(\d{1,2})日/)
    const deadline = deadlineMatch
      ? `2026-${deadlineMatch[1].padStart(2, '0')}-${deadlineMatch[2].padStart(2, '0')}`
      : null
    return {
      id: `parsed-${Math.random().toString(36).slice(2, 9)}`,
      name,
      projectId: 'p-cosmo-base',
      deadline,
      category: skills[0],
      skills,
      difficulty: '新人歓迎' as const,
      approved: true,
    }
  })
}
