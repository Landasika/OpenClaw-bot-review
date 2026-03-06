import { NextResponse } from 'next/server'
import { promises as fs, existsSync } from 'fs'
import path from 'path'
import os from 'os'
import { getSystemConfig } from '@/lib/system-config'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const SYSTEM_CONFIG = getSystemConfig()
const SESSION_LOOKBACK_MS = SYSTEM_CONFIG.agentActivitySessionLookbackDays * 24 * 60 * 60 * 1000
const MAX_PARENT_SESSIONS_TO_PARSE = SYSTEM_CONFIG.agentActivityMaxParentSessionsToParse
const ORPHAN_FALLBACK_WINDOW_MS = SYSTEM_CONFIG.agentActivityOrphanFallbackWindowMinutes * 60 * 1000
const SUBAGENT_MAX_ACTIVE_MS = SYSTEM_CONFIG.agentActivitySubagentMaxActiveMinutes * 60 * 1000

export interface SubagentInfo {
  toolId: string
  label: string
  sessionKey?: string
}

export interface AgentActivity {
  agentId: string
  name: string
  emoji: string
  state: 'idle' | 'working' | 'waiting' | 'offline'
  currentTool?: string
  toolStatus?: string
  lastActive: number
  subagents?: SubagentInfo[]
}

function isSubtaskDescription(desc: string): boolean {
  const d = desc.toLowerCase()
  return desc.startsWith('Subtask:') || desc.startsWith('子任务') || d.includes('subtask')
}

function isSpawnTool(name: string): boolean {
  return name === 'sessions_spawn' || name === 'session_spawn'
}

function pickSubagentLabel(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return 'Subtask'
  const args = raw as Record<string, unknown>
  if (typeof args.label === 'string' && args.label.trim()) return args.label.trim()
  if (typeof args.task === 'string' && args.task.trim()) return args.task.trim()
  if (typeof args.description === 'string' && args.description.trim()) return args.description.trim()
  return 'Subtask'
}

function extractCompletedSubagentLabel(text: string): string | null {
  if (!text) return null
  const patterns = [
    /A subagent task\s+"([^"]+)"\s+just completed/i,
    /A subagent task\s+'([^']+)'\s+just completed/i,
    /subagent task\s+"([^"]+)"\s+.*completed/i,
    /subagent task\s+'([^']+)'\s+.*completed/i,
    /子任务[“"]([^”"]+)[”"].{0,12}完成/,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m?.[1]?.trim()) return m[1].trim()
  }
  return null
}

function parseRecordTimestamp(record: unknown): number {
  if (!record || typeof record !== 'object') return 0
  const rec = record as Record<string, unknown>
  if (typeof rec.timestamp === 'string') {
    const t = Date.parse(rec.timestamp)
    if (Number.isFinite(t)) return t
  }
  if (typeof rec.timestamp === 'number' && Number.isFinite(rec.timestamp)) return rec.timestamp
  const msg = rec.message
  if (msg && typeof msg === 'object') {
    const m = msg as Record<string, unknown>
    if (typeof m.timestamp === 'string') {
      const t = Date.parse(m.timestamp)
      if (Number.isFinite(t)) return t
    }
    if (typeof m.timestamp === 'number' && Number.isFinite(m.timestamp)) return m.timestamp
  }
  return 0
}

async function parseSubagentsFromSessionFile(filePath: string, sessionKey: string): Promise<SubagentInfo[]> {
  const subagents: SubagentInfo[] = []
  try {
    const content = await fs.readFile(filePath, 'utf8')
    const lines = content.split('\n').filter(l => l.trim())

    const activeSubtasks = new Map<string, { label: string; at: number }>()
    const spawnToolIds = new Set<string>()

    for (const line of lines) {
      try {
        const record = JSON.parse(line)
        const eventAt = parseRecordTimestamp(record)

        // Legacy format
        if (record.type === 'assistant' && record.message?.content) {
          const blocks = Array.isArray(record.message.content) ? record.message.content : []
          for (const block of blocks) {
            if (block.type !== 'tool_use' || typeof block.id !== 'string' || !block.id) continue
            if (typeof block.name === 'string' && isSpawnTool(block.name)) {
              activeSubtasks.set(block.id, { label: pickSubagentLabel(block.input), at: eventAt })
              spawnToolIds.add(block.id)
              continue
            }
            if (typeof block.input?.description === 'string' && isSubtaskDescription(block.input.description)) {
              activeSubtasks.set(block.id, { label: block.input.description, at: eventAt })
            }
          }
        }
        if (record.type === 'user' && record.message?.content) {
          const blocks = Array.isArray(record.message.content) ? record.message.content : []
          for (const block of blocks) {
            if (block.type === 'tool_result' && block.tool_use_id && !spawnToolIds.has(block.tool_use_id)) {
              activeSubtasks.delete(block.tool_use_id)
            }
          }
        }

        // New format
        if (record.type === 'message' && record.message) {
          const msg = record.message
          const role = typeof msg.role === 'string' ? msg.role : ''
          const blocks = Array.isArray(msg.content) ? msg.content : []
          if (role === 'assistant') {
            for (const block of blocks) {
              if (block?.type === 'toolCall' && typeof block.id === 'string' && block.id) {
                if (typeof block.name === 'string' && isSpawnTool(block.name)) {
                  activeSubtasks.set(block.id, { label: pickSubagentLabel(block.arguments), at: eventAt })
                  spawnToolIds.add(block.id)
                } else if (typeof block.arguments?.description === 'string' && isSubtaskDescription(block.arguments.description)) {
                  activeSubtasks.set(block.id, { label: block.arguments.description, at: eventAt })
                }
              } else if (block?.type === 'tool_use' && typeof block.id === 'string' && typeof block.input?.description === 'string') {
                if (isSubtaskDescription(block.input.description)) activeSubtasks.set(block.id, { label: block.input.description, at: eventAt })
              }
            }
          } else if (role === 'toolResult') {
            const toolCallId = typeof msg.toolCallId === 'string' ? msg.toolCallId : ''
            const toolName = typeof msg.toolName === 'string' ? msg.toolName : ''
            if (toolCallId && !isSpawnTool(toolName) && !spawnToolIds.has(toolCallId)) {
              activeSubtasks.delete(toolCallId)
            }
          } else if (role === 'user') {
            const text = blocks
              .map((b: { type?: string; text?: string }) => (b?.type === 'text' && typeof b.text === 'string') ? b.text : '')
              .join('\n')
            const completedLabel = extractCompletedSubagentLabel(text)
            if (completedLabel) {
              for (const [id, state] of activeSubtasks.entries()) {
                if (state.label === completedLabel || state.label.includes(completedLabel) || completedLabel.includes(state.label)) {
                  activeSubtasks.delete(id)
                  break
                }
              }
            }
          }
        }
      } catch {
        // Skip bad line
      }
    }

    const now = Date.now()
    for (const [toolId, state] of activeSubtasks.entries()) {
      if (state.at > 0 && now - state.at > SUBAGENT_MAX_ACTIVE_MS) continue
      const label = state.label
      subagents.push({ toolId, label, sessionKey })
    }
  } catch {
    // Ignore parse errors
  }
  return subagents
}

/** Parse subagents from all parent sessions (main/direct/group/openai/cron etc.), grouped by session */
async function parseSubagents(agentSessionsDir: string, agentId: string): Promise<SubagentInfo[]> {
  const allSubagents: SubagentInfo[] = []
  try {
    const cutoff = Date.now() - SESSION_LOOKBACK_MS
    const sessionFiles: Array<{ sessionKey: string; filePath: string; updatedAt: number }> = []
    const knownFilePaths = new Set<string>()
    const subagentSessionIds = new Set<string>()
    const sessionsIndexPath = path.join(agentSessionsDir, 'sessions.json')
    if (existsSync(sessionsIndexPath)) {
      try {
        const sessionsIndexRaw = await fs.readFile(sessionsIndexPath, 'utf8')
        const sessionsIndex = JSON.parse(sessionsIndexRaw) as Record<string, { sessionId?: string; updatedAt?: number }>
        for (const [sessionKey, meta] of Object.entries(sessionsIndex)) {
          if (!meta || typeof meta.sessionId !== 'string' || !meta.sessionId) continue
          if (sessionKey.includes(':subagent:')) {
            subagentSessionIds.add(meta.sessionId)
            continue
          }
          const filePath = path.join(agentSessionsDir, `${meta.sessionId}.jsonl`)
          if (!existsSync(filePath)) continue
          let updatedAt = 0
          if (typeof meta.updatedAt === 'number' && meta.updatedAt > 0) {
            updatedAt = meta.updatedAt
          } else {
            try {
              const stat = await fs.stat(filePath)
              updatedAt = stat.mtimeMs
            } catch {
              updatedAt = 0
            }
          }
          if (updatedAt > 0 && updatedAt < cutoff) continue
          sessionFiles.push({ sessionKey, filePath, updatedAt })
          knownFilePaths.add(filePath)
        }
      } catch {
        // Ignore index parse errors
      }
    }

    // Fallback: include recent parent session files that are missing in sessions.json mapping.
    try {
      const orphanCutoff = Date.now() - ORPHAN_FALLBACK_WINDOW_MS
      const files = await fs.readdir(agentSessionsDir)
      for (const file of files) {
        if (!file.endsWith('.jsonl')) continue
        if (file.startsWith('probe-')) continue
        const filePath = path.join(agentSessionsDir, file)
        if (knownFilePaths.has(filePath)) continue
        const sessionId = file.slice(0, -'.jsonl'.length)
        if (subagentSessionIds.has(sessionId)) continue
        const stat = await fs.stat(filePath)
        if (stat.mtimeMs < orphanCutoff) continue
        if (stat.mtimeMs < cutoff) continue
        sessionFiles.push({
          sessionKey: `agent:${agentId}:orphan:${sessionId}`,
          filePath,
          updatedAt: stat.mtimeMs,
        })
      }
    } catch {
      // Ignore fallback scan errors
    }

    sessionFiles.sort((a, b) => b.updatedAt - a.updatedAt)
    const candidates = sessionFiles.slice(0, MAX_PARENT_SESSIONS_TO_PARSE)
    const nested = await Promise.all(candidates.map((s) => parseSubagentsFromSessionFile(s.filePath, s.sessionKey)))
    const dedupe = new Set<string>()
    for (const list of nested) {
      for (const sub of list) {
        const key = `${sub.sessionKey || ''}::${sub.toolId}`
        if (dedupe.has(key)) continue
        dedupe.add(key)
        allSubagents.push(sub)
      }
    }
  } catch {
    // Ignore parse errors
  }
  return allSubagents
}

export async function GET() {
  const openclawDir = path.join(os.homedir(), '.openclaw')
  const configPath = path.join(openclawDir, 'openclaw.json')
  const agentsDir = path.join(openclawDir, 'agents')

  const agents: AgentActivity[] = []

  try {
    if (existsSync(configPath)) {
      const configContent = await fs.readFile(configPath, 'utf8')
      const config = JSON.parse(configContent)

      const agentList = Array.isArray(config.agents) ? config.agents : config.agents?.list
      if (agentList && Array.isArray(agentList)) {
        const now = Date.now()

        for (const agent of agentList) {
          let lastActive = 0
          let agentSessionsDir = ''

          if (existsSync(agentsDir)) {
            agentSessionsDir = path.join(agentsDir, agent.id, 'sessions')
            if (existsSync(agentSessionsDir)) {
              try {
                const files = await fs.readdir(agentSessionsDir)
                for (const file of files) {
                  const filePath = path.join(agentSessionsDir, file)
                  const stat = await fs.stat(filePath)
                  if (stat.mtimeMs > lastActive) {
                    lastActive = stat.mtimeMs
                  }
                }
              } catch {
                // Ignore
              }
            }
          }

          let state: 'idle' | 'working' | 'waiting' | 'offline'
          const timeDiff = now - lastActive
          if (lastActive === 0 || timeDiff > 60 * 60 * 1000) {
            state = 'offline'
          } else if (timeDiff <= 2 * 60 * 1000) {
            state = 'working'
          } else {
            state = 'idle'
          }

          // Parse subagents for online agents
          let subagents: SubagentInfo[] | undefined
          if (state !== 'offline' && agentSessionsDir && existsSync(agentSessionsDir)) {
            subagents = await parseSubagents(agentSessionsDir, agent.id)
            if (subagents.length === 0) subagents = undefined
          }

          agents.push({
            agentId: agent.id,
            name: agent.name || agent.id,
            emoji: agent.identity?.emoji || agent.emoji || '🤖',
            state,
            lastActive,
            subagents,
          })
        }
      }
    }
  } catch (error) {
    console.error('Error reading agent activity:', error)
  }

  return NextResponse.json(
    { agents },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } },
  )
}
