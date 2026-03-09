'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import type { TimelineEntry, TimelineResponse } from '@/lib/pixel-office/timeline-types'
import { TIMELINE_COLORS } from '@/lib/pixel-office/timeline-config'

interface TaskTimelineProps {
  className?: string
}

const POLL_INTERVAL_MS = 5000
const TOP_THRESHOLD = 12

export function TaskTimeline({ className = '' }: TaskTimelineProps) {
  const [entries, setEntries] = useState<TimelineEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingNewCount, setPendingNewCount] = useState(0)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const isNearTopRef = useRef(true)
  const inFlightRef = useRef(false)
  const entriesRef = useRef<TimelineEntry[]>([])

  useEffect(() => {
    entriesRef.current = entries
  }, [entries])

  const fetchTimeline = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (inFlightRef.current) return
    inFlightRef.current = true

    if (silent) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError(null)

    try {
      const res = await fetch(`/api/task-timeline?limit=20&_=${Date.now()}`, {
        cache: 'no-store',
      })
      const data: TimelineResponse = await res.json()

      if (data.success) {
        const nextEntries = data.entries || []
        const previousFirstId = entriesRef.current[0]?.id
        const nextFirstId = nextEntries[0]?.id

        let newCount = 0
        if (previousFirstId && nextFirstId && previousFirstId !== nextFirstId) {
          const previousFirstIndex = nextEntries.findIndex((entry) => entry.id === previousFirstId)
          newCount = previousFirstIndex === -1 ? nextEntries.length : previousFirstIndex
        }

        setEntries(nextEntries)
        if (newCount > 0) {
          if (isNearTopRef.current) {
            setPendingNewCount(0)
          } else {
            setPendingNewCount((count) => count + newCount)
          }
        }
      } else {
        setError(data.error || 'Failed to load timeline')
      }
    } catch (err) {
      setError('Network error')
    } finally {
      if (silent) {
        setRefreshing(false)
      } else {
        setLoading(false)
      }
      inFlightRef.current = false
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    fetchTimeline()
  }, [fetchTimeline])

  // Auto refresh every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchTimeline({ silent: true })
    }, POLL_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [fetchTimeline])

  // Refresh when page becomes visible / focused.
  useEffect(() => {
    const handleFocus = () => fetchTimeline({ silent: true })
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchTimeline({ silent: true })
      }
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fetchTimeline])

  const handleScroll = useCallback(() => {
    const node = scrollRef.current
    if (!node) return

    const nearTop = node.scrollTop <= TOP_THRESHOLD
    isNearTopRef.current = nearTop
    if (nearTop) {
      setPendingNewCount(0)
    }
  }, [])

  const handleJumpToLatest = useCallback(() => {
    const node = scrollRef.current
    if (node) {
      node.scrollTo({ top: 0, behavior: 'smooth' })
    }
    isNearTopRef.current = true
    setPendingNewCount(0)
    fetchTimeline({ silent: true })
  }, [fetchTimeline])

  const isBusy = loading || refreshing

  return (
    <div className={`mx-auto flex h-full w-full max-w-2xl flex-col ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-[var(--text)]">活动时间线</h3>
          <span className="text-xs text-[var(--text-muted)]">
            {entries.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {pendingNewCount > 0 && (
            <button
              onClick={handleJumpToLatest}
              className="rounded px-2 py-1 text-[10px] font-medium text-[var(--accent)] border border-[var(--accent)]/30 bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 transition-colors"
              title="跳到最新活动"
            >
              有 {pendingNewCount} 条新活动
            </button>
          )}
          <button
            onClick={() => fetchTimeline()}
            disabled={isBusy}
            className="p-1.5 rounded hover:bg-[var(--accent)]/10 transition-colors disabled:opacity-50"
            title="刷新"
          >
            {isBusy ? (
              <span className="block w-3.5 h-3.5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 min-h-0 px-3 py-2.5 overflow-y-auto">
        {error ? (
          <div className="text-center py-2">
            <span className="text-xs text-[var(--text-muted)]">{error}</span>
          </div>
        ) : loading && entries.length === 0 ? (
          <div className="text-center py-2">
            <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-2">
            <span className="text-xs text-[var(--text-muted)]">暂无活动</span>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div key={entry.id} className="rounded-md border border-[var(--border)]/35 bg-[var(--bg)]/55 px-2 py-2 text-xs">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex-shrink-0" style={{ color: TIMELINE_COLORS[entry.type] }}>
                    {entry.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[var(--text)]">
                        {entry.agentName}
                        <span className="text-[var(--text-muted)]"> {entry.title}</span>
                      </span>
                      <span className="flex-shrink-0 text-[10px] text-[var(--text-muted)]">{entry.timeAgo}</span>
                    </div>
                    {entry.relatedAgentName && (
                      <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                        → {entry.relatedAgentName}
                      </div>
                    )}
                    <p className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]" title={entry.description}>
                      {entry.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
