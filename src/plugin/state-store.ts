/**
 * Cross-turn GenUI state slots, persisted on the HOST.
 *
 * The browser already keeps a local copy (localStorage) so the UI restores
 * itself; this store exists for the MODEL: the `genui_state` tool reads the
 * same slot the user was interacting with, so the next Agent turn can answer
 * with the user's actual choices instead of asking again.
 *
 * Scope: one JSON file per session under `<root>/genui-state/`. Records stay
 * small (answer maps + touched field values), bounded by the same limits the
 * browser store uses, and secret fields never reach the host at all — the
 * client strips them before syncing.
 *
 * Deliberately dependency-free (node:fs + node:path): an external plugin's
 * host half must not depend on the harness module graph at runtime.
 * @module dsh-genui-stateful/plugin/state-store
 */

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Durable interaction state of one slot (mirrors the browser contract). */
export interface SlotState {
  /** group → chosen option label (radio aggregation answers). */
  answers?: Record<string, string>
  /** group → selected source labels (checkbox groups). */
  multiAnswers?: Record<string, string[]>
  /** True after local grading. */
  locked?: boolean
  /** field id → current value (non-secret fields only). */
  fields?: Record<string, string>
}

/** One stored slot with its content fingerprint and timestamp. */
export interface StoredSlot {
  state: SlotState
  /** Fingerprint of the spec the state was written against. */
  content?: string
  updatedAt: number
}

interface SessionFile {
  version: 1
  slots: Record<string, StoredSlot>
}

/** Identifiers that are safe to use as both a file name and a slot key. */
const ID_RE = /^[A-Za-z0-9._-]{1,128}$/
/** Slot names share the spec-level alphabet. */
const SLOT_RE = /^[A-Za-z0-9._-]{1,64}$/
/** Bound on the per-session slot count (the browser store uses 200 blocks). */
const MAX_SLOTS = 64
/** Refuse absurd payloads before parsing them. */
export const MAX_STATE_BODY_BYTES = 64 * 1024

/** Default root; `DSH_GENUI_STATE_DIR` overrides it (tests, custom homes). */
export function stateRoot(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.DSH_GENUI_STATE_DIR
  if (override !== undefined && override.trim() !== '') return override
  return join(homedir(), '.dsh', 'genui-state')
}

export function validSessionId(sessionId: unknown): sessionId is string {
  return typeof sessionId === 'string' && ID_RE.test(sessionId)
}

export function validSlot(slot: unknown): slot is string {
  return typeof slot === 'string' && SLOT_RE.test(slot)
}

function sessionFile(root: string, sessionId: string): string {
  return join(root, `${sessionId}.json`)
}

async function readSession(root: string, sessionId: string): Promise<SessionFile> {
  try {
    const raw = await readFile(sessionFile(root, sessionId), 'utf8')
    const parsed = JSON.parse(raw) as Partial<SessionFile>
    if (parsed.version !== 1 || typeof parsed.slots !== 'object' || parsed.slots === null) {
      return { version: 1, slots: {} }
    }
    return { version: 1, slots: parsed.slots as Record<string, StoredSlot> }
  } catch {
    // Missing or corrupt: a fresh slate. The browser copy is authoritative
    // for rendering, so losing this file never loses the user's UI state.
    return { version: 1, slots: {} }
  }
}

async function writeSession(root: string, sessionId: string, file: SessionFile): Promise<void> {
  await mkdir(root, { recursive: true })
  const target = sessionFile(root, sessionId)
  // Atomic replace: a reader (or a concurrent tool call) never sees a torn
  // JSON file.
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, JSON.stringify(file), 'utf8')
  await rename(tmp, target)
}

/** Read one slot, or null when unknown. */
export async function readSlot(sessionId: string, slot: string, env?: NodeJS.ProcessEnv): Promise<StoredSlot | null> {
  if (!validSessionId(sessionId) || !validSlot(slot)) return null
  const file = await readSession(stateRoot(env), sessionId)
  return file.slots[slot] ?? null
}

/** All slots of a session, newest first. */
export async function listSlots(sessionId: string, env?: NodeJS.ProcessEnv): Promise<Array<{ slot: string; stored: StoredSlot }>> {
  if (!validSessionId(sessionId)) return []
  const file = await readSession(stateRoot(env), sessionId)
  return Object.entries(file.slots)
    .map(([slot, stored]) => ({ slot, stored }))
    .sort((a, b) => b.stored.updatedAt - a.stored.updatedAt)
}

/** Upsert one slot; LRU-evicts the oldest entries beyond MAX_SLOTS. */
export async function writeSlot(
  sessionId: string,
  slot: string,
  state: SlotState,
  content?: string,
  env?: NodeJS.ProcessEnv,
): Promise<void> {
  if (!validSessionId(sessionId)) throw new Error('genui-state: invalid session id')
  if (!validSlot(slot)) throw new Error('genui-state: invalid slot name')
  const root = stateRoot(env)
  const file = await readSession(root, sessionId)
  file.slots[slot] = { state, ...(content === undefined ? {} : { content }), updatedAt: Date.now() }
  const overflow = Object.keys(file.slots).length - MAX_SLOTS
  if (overflow > 0) {
    const oldest = Object.entries(file.slots)
      .sort((a, b) => a[1].updatedAt - b[1].updatedAt)
      .slice(0, overflow)
    for (const [name] of oldest) delete file.slots[name]
  }
  await writeSession(root, sessionId, file)
}

/** Delete one slot (no-op when absent). */
export async function clearSlot(sessionId: string, slot: string, env?: NodeJS.ProcessEnv): Promise<void> {
  if (!validSessionId(sessionId) || !validSlot(slot)) return
  const root = stateRoot(env)
  const file = await readSession(root, sessionId)
  if (!(slot in file.slots)) return
  delete file.slots[slot]
  await writeSession(root, sessionId, file)
}

/** Normalize an untrusted slot payload from the wire/tool arguments. */
export function sanitizeSlotState(value: unknown): SlotState | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const out: SlotState = {}
  const map = (input: unknown): Record<string, string> | undefined => {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined
    const out: Record<string, string> = {}
    let count = 0
    for (const [key, entry] of Object.entries(input as Record<string, unknown>)) {
      if (typeof entry !== 'string') continue
      out[key] = entry
      if (++count >= 200) break
    }
    return count === 0 ? undefined : out
  }
  const answers = map(record.answers)
  if (answers !== undefined) out.answers = answers
  const fields = map(record.fields)
  if (fields !== undefined) out.fields = fields
  if (typeof record.multiAnswers === 'object' && record.multiAnswers !== null && !Array.isArray(record.multiAnswers)) {
    const multi: Record<string, string[]> = {}
    for (const [group, choices] of Object.entries(record.multiAnswers as Record<string, unknown>).slice(0, 200)) {
      if (!Array.isArray(choices)) continue
      multi[group] = choices.filter((c): c is string => typeof c === 'string').slice(0, 200)
    }
    if (Object.keys(multi).length > 0) out.multiAnswers = multi
  }
  if (record.locked === true) out.locked = true
  return out
}

/** Test seam: remove the whole session file. */
export async function clearSession(sessionId: string, env?: NodeJS.ProcessEnv): Promise<void> {
  if (!validSessionId(sessionId)) return
  const target = sessionFile(stateRoot(env), sessionId)
  try {
    await rm(target, { force: true })
  } catch {
    // Best effort.
  }
}

/** Test seam: the directory a session file lands in. */
export function sessionPathFor(sessionId: string, env?: NodeJS.ProcessEnv): string {
  return sessionFile(stateRoot(env), sessionId)
}
