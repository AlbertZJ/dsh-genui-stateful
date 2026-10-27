/**
 * Browser → host sync for cross-turn state SLOTS.
 *
 * Rendering is local-first: the browser store already restores the UI. This
 * module mirrors slot snapshots to the host so the MODEL can read them with
 * the `genui_state` tool on the next turn. Sync is best-effort and debounced
 * (typing fires per keystroke); a failed POST never affects the UI.
 *
 * Only slots named by `spec.state` sync — legacy fingerprint-keyed blocks
 * stay purely local.
 * @module dsh-genui-stateful/client/state-sync
 */

import type { BlockInteractionState } from './interaction-store.ts'

/** Same-origin route registered by the plugin's host half. */
const SYNC_PATH = '/plugins/dsh-genui-stateful/state'
/** Coalesce bursts (field typing, checkbox toggles). */
const DEBOUNCE_MS = 400

const observers = new Map<string, (state: BlockInteractionState) => void>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const pending = new Map<string, BlockInteractionState>()
const lastSent = new Map<string, string>()

function keyOf(sessionId: string, slot: string): string {
  return `${sessionId}\u0000${slot}`
}

function post(sessionId: string, slot: string, state: BlockInteractionState): void {
  const body = JSON.stringify({ sessionId, slot, state })
  if (lastSent.get(keyOf(sessionId, slot)) === body) return
  lastSent.set(keyOf(sessionId, slot), body)
  if (typeof fetch !== 'function') return
  void fetch(SYNC_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    // A session switch or page unload must not cancel the last write.
    keepalive: true,
  }).catch(() => {
    // Offline / host without the route: the local store is still authoritative.
  })
}

function schedule(sessionId: string, slot: string, state: BlockInteractionState): void {
  const key = keyOf(sessionId, slot)
  pending.set(key, state)
  const existing = timers.get(key)
  if (existing !== undefined) clearTimeout(existing)
  timers.set(key, setTimeout(() => {
    timers.delete(key)
    const latest = pending.get(key)
    pending.delete(key)
    if (latest !== undefined) post(sessionId, slot, latest)
  }, DEBOUNCE_MS))
}

/**
 * A STABLE observer for one slot. GenuiBlock compares callbacks by identity,
 * so building a fresh closure per render would re-fire the snapshot effect.
 */
export function slotObserver(sessionId: string, slot: string): (state: BlockInteractionState) => void {
  const key = keyOf(sessionId, slot)
  let observer = observers.get(key)
  if (observer === undefined) {
    observer = (state: BlockInteractionState) => schedule(sessionId, slot, state)
    observers.set(key, observer)
  }
  return observer
}

/** Flush every pending write immediately (tests, unload handlers). */
export function flushSlotSync(): void {
  for (const [key, timer] of timers) {
    clearTimeout(timer)
    timers.delete(key)
    const state = pending.get(key)
    pending.delete(key)
    if (state === undefined) continue
    const separator = key.indexOf('\u0000')
    if (separator < 0) continue
    post(key.slice(0, separator), key.slice(separator + 1), state)
  }
}

/** Drop cached observers/sent payloads (tests, session teardown). */
export function resetSlotSync(): void {
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()
  pending.clear()
  lastSent.clear()
  observers.clear()
}
