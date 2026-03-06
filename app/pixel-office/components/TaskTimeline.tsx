'use client'

import { useEffect, useState, useCallback } from 'react'
import type { TimelineEntry, TimelineResponse } from '@/lib/pixel-office/timeline-types'
import { TIMELINE_COLORS } from '@/lib/pixel-office/timeline-config'

interface TaskTimelineProps {
  className?: string
}

export function TaskTimeline({ className = '' }: TaskTimelineProps) {
  const [entries, setEntries] = useState<TimelineEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchTimeline = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/task-timeline?limit=20')
      const data: TimelineResponse = await res.json()

      if (data.success) {
        setEntries(data.entries || [])
      } else {
        setError(data.error || 'Failed to load timeline')
      }
    } catch (err) {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    fetchTimeline()
  }, [fetchTimeline])

  // Auto refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchTimeline()
    }, 30000)

    return () => clearInterval(interval)
  }, [fetchTimeline])

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
        <button
          onClick={fetchTimeline}
          disabled={loading}
          className="p-1.5 rounded hover:bg-[var(--accent)]/10 transition-colors disabled:opacity-50"
          title="刷新"
        >
          {loading ? (
            <span className="block w-3.5 h-3.5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-3.5 h-3.5 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 px-3 py-2.5 overflow-y-auto">
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
